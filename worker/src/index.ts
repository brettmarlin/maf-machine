import { analyzeActivity } from './lib/mafAnalysis';
import type { StravaActivity, StreamData, UserSettings, MAFActivity } from './lib/mafAnalysis';
import type { GameState } from './lib/gameTypes';
import { loadGameState, processNewRun, onSettingsSaved, buildGameAPIResponse, saveGameState } from './lib/gameState';
import { fetchActivityWeather } from './lib/weatherService';
import { buildPostRunPayload, buildWeeklySummaryPayload } from './lib/coachingPayload';
import {
  generatePostRunCoaching, generateWeeklySummary, handleChatMessage,
  getCachedCoaching, cacheCoaching, getCachedWeeklySummary, cacheWeeklySummary,
  loadChatState, saveChatState,
  type CoachingAssessment,
} from './lib/coachingEngine';

export interface Env {
  MAF_TOKENS: KVNamespace;
  MAF_ACTIVITIES: KVNamespace;
  MAF_SETTINGS: KVNamespace;
  MAF_GAME: KVNamespace;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  OPENWEATHERMAP_API_KEY?: string;
  DEV_MODE?: string;
  DEV_ATHLETE_ID?: string;
  COACHING_ENABLED?: string;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile_medium?: string;
    profile?: string;
  };
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// --- Helpers ---

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getAthleteIdFromCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/maf_session=([a-f0-9]+)/);
  return match ? match[1] : null;
}

async function resolveSession(request: Request, env: Env): Promise<string | null> {
  // Dev mode: bypass auth
  if (env.DEV_MODE === 'true') {
    return env.DEV_ATHLETE_ID || null;
  }

  const sessionId = getAthleteIdFromCookie(request);
  if (!sessionId) return null;
  return await env.MAF_TOKENS.get(`session:${sessionId}`);
}

async function getValidToken(athleteId: string, env: Env): Promise<string | null> {
  const raw = await env.MAF_TOKENS.get(athleteId);
  if (!raw) return null;

  const tokens: StoredTokens = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  return await refreshToken(athleteId, tokens, env);
}

async function refreshToken(athleteId: string, tokens: StoredTokens, env: Env): Promise<string | null> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!response.ok) return null;

  const data: StoredTokens = await response.json();
  await env.MAF_TOKENS.put(
    athleteId,
    JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    })
  );

  return data.access_token;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function requireAuth(request: Request, env: Env): Promise<string | Response> {
  const athleteId = await resolveSession(request, env);
  if (!athleteId) {
    return json({ error: 'Not authenticated' }, 401);
  }
  return athleteId;
}

// --- Settings Helper ---

async function loadSettings(env: Env, athleteId: string): Promise<UserSettings | null> {
  const raw = await env.MAF_SETTINGS.get(`${athleteId}:settings`);
  if (!raw) return null;
  return JSON.parse(raw) as UserSettings;
}

// --- Recent Analyses Helper ---

async function loadRecentAnalyses(
  env: Env,
  athleteId: string,
  count: number
): Promise<MAFActivity[]> {
  // Load activity list to get IDs, then fetch analyses
  const cached = await env.MAF_ACTIVITIES.get(`${athleteId}:activities`);
  if (!cached) return [];

  const activities: StravaActivity[] = JSON.parse(cached);
  const recent = activities.slice(0, count);
  const analyses: MAFActivity[] = [];

  for (const activity of recent) {
    const raw = await env.MAF_ACTIVITIES.get(`${athleteId}:analysis:${activity.id}`);
    if (raw) {
      analyses.push(JSON.parse(raw));
    }
  }

  return analyses;
}

// --- Webhook Processing ---

const STRAVA_WEBHOOK_VERIFY_TOKEN = 'maf-machine-verify';

async function processWebhookActivity(
  athleteId: string,
  activityId: number,
  env: Env
): Promise<void> {
  console.log(`[webhook] Processing activity ${activityId} for athlete ${athleteId}`);

  // 1. Get valid token
  const token = await getValidToken(athleteId, env);
  if (!token) {
    console.log(`[webhook] No valid token for athlete ${athleteId}`);
    return;
  }

  // 2. Load settings
  const settings = await loadSettings(env, athleteId);
  if (!settings) {
    console.log(`[webhook] No settings for athlete ${athleteId}`);
    return;
  }

  // 3. Fetch activity from Strava
  const activityRes = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!activityRes.ok) {
    console.log(`[webhook] Failed to fetch activity ${activityId}: ${activityRes.status}`);
    return;
  }

  const activity: StravaActivity = await activityRes.json();

  // Only process runs
  if (activity.type !== 'Run' && activity.sport_type !== 'Run') {
    console.log(`[webhook] Activity ${activityId} is not a run, skipping`);
    return;
  }

  // 4. Fetch streams
  let streams: StreamData | null = null;
  const streamCacheKey = `${athleteId}:stream:${activityId}`;
  const cachedStream = await env.MAF_ACTIVITIES.get(streamCacheKey);

  if (cachedStream) {
    streams = JSON.parse(cachedStream);
  } else {
    const streamRes = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,cadence,velocity_smooth,time,distance,altitude&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (streamRes.ok) {
      streams = await streamRes.json();
      await env.MAF_ACTIVITIES.put(streamCacheKey, JSON.stringify(streams));
    } else {
      console.log(`[webhook] Failed to fetch streams for ${activityId}: ${streamRes.status}`);
    }
  }

  // 5. Run analysis
  const analysis = analyzeActivity(activity, streams, settings);

  // 6. Cache analysis
  await env.MAF_ACTIVITIES.put(
    `${athleteId}:analysis:${activityId}`,
    JSON.stringify(analysis)
  );

  // 7. Update activity cache (add to list if not present)
  const activitiesCacheKey = `${athleteId}:activities`;
  const cachedActivities = await env.MAF_ACTIVITIES.get(activitiesCacheKey);
  if (cachedActivities) {
    const activities: StravaActivity[] = JSON.parse(cachedActivities);
    const exists = activities.some((a) => a.id === activity.id);
    if (!exists) {
      activities.unshift(activity);
      activities.sort((a, b) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );
      await env.MAF_ACTIVITIES.put(activitiesCacheKey, JSON.stringify(activities));
    }
  }

  // 8. Fetch weather data (if API key available and activity has location)
  if (env.OPENWEATHERMAP_API_KEY && activity.start_latlng?.length === 2) {
    try {
      const weather = await fetchActivityWeather(
        activity.start_latlng[0],
        activity.start_latlng[1],
        env.OPENWEATHERMAP_API_KEY,
      );
      if (weather) {
        await env.MAF_ACTIVITIES.put(
          `${athleteId}:weather:${activityId}`,
          JSON.stringify(weather),
        );
      }
    } catch (err) {
      console.log(`[webhook] Weather fetch failed: ${err}`);
    }
  }

  // 9. Process game state (points, badges, streaks)
  const gameResult = await processNewRun(env.MAF_GAME, athleteId, analysis, settings);

  const badgeNames = gameResult.badges_earned.map((b) => b.name);
  console.log(
    `[webhook] Activity ${activityId} processed: ` +
    `qualifying=${analysis.qualifying}, ` +
    `xp=${gameResult.xp_earned}, ` +
    `zone_min=${analysis.zone_minutes.toFixed(1)}, ` +
    `badges=${badgeNames.join(',') || 'none'}, ` +
    `surprises=${gameResult.surprise_bonuses.map((s) => s.id).join(',') || 'none'}`
  );

  // 9. Generate coaching assessment (if API key is available and coaching enabled)
  if (env.ANTHROPIC_API_KEY && env.COACHING_ENABLED === 'true' && analysis.qualifying) {
    try {
      // Load recent activities for context
      const recentActivities = await loadRecentAnalyses(env, athleteId, 10);
      const gameState = await loadGameState(env.MAF_GAME, athleteId);

      const { buildNextStep } = await import('./lib/gameState');
      const nextStep = buildNextStep(gameState);

      const payload = buildPostRunPayload(
        analysis,
        recentActivities,
        gameState,
        settings,
        gameResult.xp_earned,
        gameResult.xp_breakdown as unknown as Record<string, number>,
        gameResult.badges_earned.map((b) => b.name),
        gameResult.surprise_bonuses.map((s) => s.message),
        nextStep.message,
      );

      const coaching = await generatePostRunCoaching(env.ANTHROPIC_API_KEY, payload);
      await cacheCoaching(env.MAF_GAME, athleteId, activityId, coaching);

      // Store v2 game result data alongside coaching for frontend
      if (gameResult.badges_earned.length > 0 || gameResult.surprise_bonuses.length > 0) {
        await env.MAF_GAME.put(
          `${athleteId}:coaching_game:${activityId}`,
          JSON.stringify({
            badges_earned: gameResult.badges_earned.map((b) => ({ id: b.id, name: b.name, icon: b.icon, message: b.message })),
            surprise_bonuses: gameResult.surprise_bonuses.map((s) => ({ id: s.id, name: s.name, message: s.message })),
          }),
        );
      }

      console.log(`[webhook] Coaching generated: "${coaching.headline}"`);
    } catch (err) {
      console.error('[webhook] Coaching generation failed:', err);
      // Non-fatal — game state is already saved
    }
  }
}

async function processWebhookDelete(
  athleteId: string,
  activityId: number,
  env: Env
): Promise<void> {
  console.log(`[webhook] Deleting activity ${activityId} for athlete ${athleteId}`);

  // Remove cached analysis and stream
  await env.MAF_ACTIVITIES.delete(`${athleteId}:analysis:${activityId}`);
  await env.MAF_ACTIVITIES.delete(`${athleteId}:stream:${activityId}`);

  // Remove from activity list cache
  const cacheKey = `${athleteId}:activities`;
  const cached = await env.MAF_ACTIVITIES.get(cacheKey);
  if (cached) {
    const activities: StravaActivity[] = JSON.parse(cached);
    const filtered = activities.filter((a) => a.id !== activityId);
    await env.MAF_ACTIVITIES.put(cacheKey, JSON.stringify(filtered));
  }

  // Note: We don't recalculate XP on delete for now.
  // This would require re-processing all runs, which is complex.
  // Deferred to Phase 7 polish.
}

// --- Main Handler ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API Routes ---

    if (path === '/api/health') {
      return json({ status: 'ok' });
    }

    // --- Webhook: Verification (GET) ---
    if (path === '/api/webhook' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === STRAVA_WEBHOOK_VERIFY_TOKEN) {
        return json({ 'hub.challenge': challenge });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // --- Webhook: Event (POST) ---
    if (path === '/api/webhook' && request.method === 'POST') {
      const event = await request.json() as {
        aspect_type: string;
        object_type: string;
        object_id: number;
        owner_id: number;
        subscription_id?: number;
        updates?: Record<string, unknown>;
      };

      console.log(`[webhook] Received: ${event.aspect_type} ${event.object_type} ${event.object_id} owner=${event.owner_id}`);

      if (event.object_type !== 'activity') {
        return json({ ok: true });
      }

      const athleteId = event.owner_id.toString();

      if (event.aspect_type === 'create' || event.aspect_type === 'update') {
        const processingPromise = processWebhookActivity(athleteId, event.object_id, env);

        // In dev mode, await directly so logs are visible in terminal
        if (env.DEV_MODE === 'true') {
          await processingPromise;
        } else {
          try {
            (globalThis as any).waitUntil?.(processingPromise);
          } catch {
            processingPromise.catch((err: Error) =>
              console.error('[webhook] Processing error:', err)
            );
          }
        }
      }

      if (event.aspect_type === 'delete') {
        const deletePromise = processWebhookDelete(athleteId, event.object_id, env);

        if (env.DEV_MODE === 'true') {
          await deletePromise;
        } else {
          try {
            (globalThis as any).waitUntil?.(deletePromise);
          } catch {
            deletePromise.catch((err: Error) =>
              console.error('[webhook] Delete error:', err)
            );
          }
        }
      }

      // Strava expects 200 within 2 seconds
      return json({ ok: true });
    }

    // --- Game State ---
    if (path === '/api/game' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const state = await loadGameState(env.MAF_GAME, athleteId);
      const userSettings = await loadSettings(env, athleteId);
      const response = buildGameAPIResponse(state, userSettings ? { maf_hr: userSettings.maf_hr } : undefined);
      return json({
        ...response,
        ...(env.DEV_MODE === 'true' ? { dev_mode: true } : {}),
      });
    }

    // --- Game Settings (weekly target) ---
    if (path === '/api/game/settings' && request.method === 'PUT') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const body = await request.json() as { weekly_target_zone_minutes?: number };
      if (!body.weekly_target_zone_minutes || body.weekly_target_zone_minutes < 10 || body.weekly_target_zone_minutes > 500) {
        return json({ error: 'Invalid weekly target (10-500 minutes)' }, 400);
      }

      const state = await loadGameState(env.MAF_GAME, athleteId);
      state.weekly_target_zone_minutes = body.weekly_target_zone_minutes;
      await saveGameState(env.MAF_GAME, athleteId, state);

      return json({ ok: true, weekly_target_zone_minutes: body.weekly_target_zone_minutes });
    }

    // --- Coaching: Latest ---
    if (path === '/api/coaching/latest' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      // Find most recent activity with coaching
      const cached = await env.MAF_ACTIVITIES.get(`${athleteId}:activities`);
      if (!cached) return json({ error: 'No activities' }, 404);

      const activities: StravaActivity[] = JSON.parse(cached);
      for (const activity of activities.slice(0, 20)) {
        const coaching = await getCachedCoaching(env.MAF_GAME, athleteId, activity.id);
        if (coaching) {
          const analysis = await env.MAF_ACTIVITIES.get(`${athleteId}:analysis:${activity.id}`);
          // Load v2 game result data (badges/surprises) if available
          const gameDataRaw = await env.MAF_GAME.get(`${athleteId}:coaching_game:${activity.id}`);
          const gameData = gameDataRaw ? JSON.parse(gameDataRaw) : {};
          return json({
            activity_id: activity.id,
            run_name: activity.name,
            run_date: activity.start_date,
            ...coaching,
            badges_earned: gameData.badges_earned || [],
            surprise_bonuses: gameData.surprise_bonuses || [],
            analysis: analysis ? JSON.parse(analysis) : null,
          });
        }
      }

      return json({ error: 'No coaching assessments yet' }, 404);
    }

    // --- Coaching: Specific Activity ---
    const coachingMatch = path.match(/^\/api\/coaching\/(\d+)$/);
    if (coachingMatch && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const activityId = parseInt(coachingMatch[1]);
      const coaching = await getCachedCoaching(env.MAF_GAME, athleteId, activityId);

      if (!coaching) {
        return json({ error: 'No coaching for this activity' }, 404);
      }

      const analysis = await env.MAF_ACTIVITIES.get(`${athleteId}:analysis:${activityId}`);
      return json({
        activity_id: activityId,
        ...coaching,
        analysis: analysis ? JSON.parse(analysis) : null,
      });
    }

    // --- Coaching: Generate for activity (manual trigger) ---
    const coachingGenMatch = path.match(/^\/api\/coaching\/generate\/(\d+)$/);
    if (coachingGenMatch && request.method === 'POST') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      if (env.COACHING_ENABLED !== 'true') {
        return json({ error: 'Coaching is a Pro feature' }, 403);
      }
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
      }

      const activityId = parseInt(coachingGenMatch[1]);
      const settings = await loadSettings(env, athleteId);
      if (!settings) return json({ error: 'No settings' }, 400);

      // Load analysis
      const analysisRaw = await env.MAF_ACTIVITIES.get(`${athleteId}:analysis:${activityId}`);
      if (!analysisRaw) return json({ error: 'No analysis for this activity' }, 404);
      const analysis: MAFActivity = JSON.parse(analysisRaw);

      // Load context
      const recentActivities = await loadRecentAnalyses(env, athleteId, 10);
      const gameState = await loadGameState(env.MAF_GAME, athleteId);

      const payload = buildPostRunPayload(
        analysis, recentActivities, gameState, settings,
        0, {}, [], [], null,
      );

      const coaching = await generatePostRunCoaching(env.ANTHROPIC_API_KEY, payload);
      await cacheCoaching(env.MAF_GAME, athleteId, activityId, coaching);

      return json({ activity_id: activityId, ...coaching });
    }

    // --- Runner Notes ---
    const notesMatch = path.match(/^\/api\/notes\/(\d+)$/);
    if (notesMatch) {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;
      const activityId = notesMatch[1];
      const key = `${athleteId}:notes:${activityId}`;

      if (request.method === 'PUT') {
        const body = await request.json() as { note: string };
        const note = (body.note || '').slice(0, 500);
        await env.MAF_GAME.put(key, JSON.stringify({ note, updated_at: new Date().toISOString() }));
        return json({ ok: true, note });
      }

      if (request.method === 'GET') {
        const raw = await env.MAF_GAME.get(key);
        if (!raw) return json({ note: '' });
        return json(JSON.parse(raw));
      }
    }

    // --- Coaching: Weekly Summary (GET) ---
    if (path === '/api/coaching/weekly' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      // Find most recent weekly summary
      const gameState = await loadGameState(env.MAF_GAME, athleteId);
      const history = gameState.weekly_history;

      for (let i = history.length - 1; i >= 0; i--) {
        const summary = await getCachedWeeklySummary(env.MAF_GAME, athleteId, history[i].week);
        if (summary) {
          return json({ week: history[i].week, ...summary });
        }
      }

      return json({ error: 'No weekly summaries yet' }, 404);
    }

    // --- Coaching: Weekly Summary (POST — manual trigger) ---
    if (path === '/api/coaching/weekly' && request.method === 'POST') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      if (env.COACHING_ENABLED !== 'true') {
        return json({ error: 'Coaching is a Pro feature' }, 403);
      }
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
      }

      const settings = await loadSettings(env, athleteId);
      if (!settings) return json({ error: 'No settings' }, 400);

      const gameState = await loadGameState(env.MAF_GAME, athleteId);
      const recentActivities = await loadRecentAnalyses(env, athleteId, 20);

      const payload = buildWeeklySummaryPayload(gameState, recentActivities, settings);
      const summary = await generateWeeklySummary(env.ANTHROPIC_API_KEY, payload);

      const week = payload.this_week.iso_week;
      await cacheWeeklySummary(env.MAF_GAME, athleteId, week, summary);

      return json({ week, ...summary });
    }

    // --- Coaching: Chat ---
    if (path === '/api/coaching/chat' && request.method === 'POST') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      if (env.COACHING_ENABLED !== 'true') {
        return json({ error: 'Coaching is a Pro feature' }, 403);
      }
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
      }

      const body = await request.json() as { message?: string };
      if (!body.message || body.message.trim().length === 0) {
        return json({ error: 'Message required' }, 400);
      }
      if (body.message.length > 1000) {
        return json({ error: 'Message too long (max 1000 chars)' }, 400);
      }

      // Rate limiting: check message count today
      const chatState = await loadChatState(env.MAF_GAME, athleteId);
      const today = new Date().toISOString().split('T')[0];
      const todayMessages = chatState.messages.filter(
        (m) => m.role === 'user' && m.timestamp.startsWith(today)
      );
      if (todayMessages.length >= 20) {
        return json({ error: 'Daily chat limit reached (20 messages/day)' }, 429);
      }

      // Build context summary for the chat
      const settings = await loadSettings(env, athleteId);
      const gameState = await loadGameState(env.MAF_GAME, athleteId);
      const recentActivities = await loadRecentAnalyses(env, athleteId, 5);

      const contextParts: string[] = [];
      if (settings) {
        contextParts.push(`Runner: age ${settings.age}, MAF HR ${settings.maf_hr}, ceiling ${settings.maf_hr} bpm (do not exceed)`);
      }
      contextParts.push(`Level ${gameState.xp_total > 0 ? Math.floor(gameState.xp_total / 500) + 1 : 1}, ${gameState.xp_total} XP, ${gameState.streak_current_weeks}-week streak`);

      if (recentActivities.length > 0) {
        const latest = recentActivities[0];
        contextParts.push(`Latest run: ${latest.zone_minutes.toFixed(1)} min below ceiling, ${latest.time_below_ceiling_pct.toFixed(0)}% compliant, drift ${(latest.cardiac_drift || 0).toFixed(1)}%`);
      }

      // Find latest coaching for additional context
      const activitiesRaw = await env.MAF_ACTIVITIES.get(`${athleteId}:activities`);
      if (activitiesRaw) {
        const activities: StravaActivity[] = JSON.parse(activitiesRaw);
        for (const a of activities.slice(0, 5)) {
          const coaching = await getCachedCoaching(env.MAF_GAME, athleteId, a.id);
          if (coaching) {
            contextParts.push(`Latest coaching headline: "${coaching.headline}"`);
            contextParts.push(`Assessment: ${coaching.assessment.substring(0, 300)}...`);
            break;
          }
        }
      }

      const contextSummary = contextParts.join('\n');

      const { response, updatedChat } = await handleChatMessage(
        env.ANTHROPIC_API_KEY,
        body.message.trim(),
        chatState,
        contextSummary
      );

      await saveChatState(env.MAF_GAME, athleteId, updatedChat);

      return json({ response });
    }

    // --- Backfill: Process cached activities through game engine ---
    // --- Backfill progress polling ---
    if (path === '/api/backfill/progress' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const raw = await env.MAF_GAME.get(`${athleteId}:backfill_progress`);
      if (!raw) return json({ status: 'idle', total: 0, current: 0 });
      return json(JSON.parse(raw));
    }

    if (path === '/api/backfill' && request.method === 'POST') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const settings = await loadSettings(env, athleteId);
      if (!settings) {
        return json({ error: 'Configure settings first' }, 400);
      }

      // Load cached activities
      const cached = await env.MAF_ACTIVITIES.get(`${athleteId}:activities`);
      if (!cached) {
        return json({ error: 'No cached activities' }, 400);
      }

      const activities: StravaActivity[] = JSON.parse(cached);

      // Filter by training_start_date (or legacy start_date)
      let toProcess = activities;
      const filterDate = settings.training_start_date || settings.start_date;
      if (filterDate) {
        const startTs = new Date(filterDate).getTime();
        toProcess = activities.filter(
          (a) => new Date(a.start_date).getTime() >= startTs
        );
      }

      // Sort chronologically for correct streak/weekly processing
      toProcess.sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );

      // Reset game state for clean backfill
      const { createInitialGameState } = await import('./lib/gameTypes');
      const freshState = createInitialGameState();
      // Preserve user's weekly target if they set one
      const existingState = await loadGameState(env.MAF_GAME, athleteId);
      freshState.weekly_target_zone_minutes = existingState.weekly_target_zone_minutes;
      // Award "committed" badge since settings exist
      if (!freshState.badges_earned.includes('committed')) {
        freshState.badges_earned.push('committed');
        freshState.xp_total += 50;
      }
      await saveGameState(env.MAF_GAME, athleteId, freshState);

      let processed = 0;
      let qualifying = 0;
      let totalXP = 0;

      // Store progress for polling
      await env.MAF_GAME.put(`${athleteId}:backfill_progress`, JSON.stringify({
        total: toProcess.length,
        current: 0,
        status: 'processing',
      }), { expirationTtl: 300 });

      for (const activity of toProcess) {
        // Load stream from cache
        const streamCacheKey = `${athleteId}:stream:${activity.id}`;
        const cachedStream = await env.MAF_ACTIVITIES.get(streamCacheKey);
        const streams: StreamData | null = cachedStream ? JSON.parse(cachedStream) : null;

        // Analyze
        const analysis = analyzeActivity(activity, streams, settings);

        // Cache analysis
        await env.MAF_ACTIVITIES.put(
          `${athleteId}:analysis:${activity.id}`,
          JSON.stringify(analysis)
        );

        // Process game state
        const result = await processNewRun(env.MAF_GAME, athleteId, analysis, settings);

        processed++;
        if (analysis.qualifying) qualifying++;
        totalXP += result.xp_earned;

        // Update progress every 5 activities (avoid KV write spam)
        if (processed % 5 === 0 || processed === toProcess.length) {
          await env.MAF_GAME.put(`${athleteId}:backfill_progress`, JSON.stringify({
            total: toProcess.length,
            current: processed,
            status: 'processing',
          }), { expirationTtl: 300 });
        }
      }

      // Clear progress tracker
      await env.MAF_GAME.delete(`${athleteId}:backfill_progress`);

      const finalState = await loadGameState(env.MAF_GAME, athleteId);
      finalState.backfill_complete = true;
      await saveGameState(env.MAF_GAME, athleteId, finalState);
      const gameResponse = buildGameAPIResponse(finalState);

      return json({
        backfill: {
          total_activities: activities.length,
          processed,
          qualifying,
          total_xp: totalXP,
        },
        game: gameResponse,
      });
    }

    // --- Debug: Analyze a specific activity ---
    if (path.match(/^\/api\/debug\/analyze\/(\d+)$/) && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const activityId = path.split('/').pop()!;
      const settings = await loadSettings(env, athleteId);
      if (!settings) return json({ error: 'No settings' }, 400);

      // Try cached analysis first
      const cachedAnalysis = await env.MAF_ACTIVITIES.get(`${athleteId}:analysis:${activityId}`);
      if (cachedAnalysis) {
        return json({ source: 'cache', analysis: JSON.parse(cachedAnalysis) });
      }

      // Try to analyze from cached streams
      const cachedStream = await env.MAF_ACTIVITIES.get(`${athleteId}:stream:${activityId}`);
      const streams: StreamData | null = cachedStream ? JSON.parse(cachedStream) : null;

      // Need the activity data
      const activitiesRaw = await env.MAF_ACTIVITIES.get(`${athleteId}:activities`);
      if (!activitiesRaw) return json({ error: 'No activities cached' }, 404);

      const activities: StravaActivity[] = JSON.parse(activitiesRaw);
      const activity = activities.find((a) => a.id === parseInt(activityId));
      if (!activity) return json({ error: 'Activity not found in cache' }, 404);

      const analysis = analyzeActivity(activity, streams, settings);
      return json({ source: 'computed', analysis });
    }

    // --- Debug: Re-badge — reprocess all runs through badge engine ---
    if (path === '/api/debug/rebadge' && request.method === 'POST') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const settings = await loadSettings(env, athleteId);
      if (!settings) return json({ error: 'No settings' }, 400);

      // Load cached activities
      const cached = await env.MAF_ACTIVITIES.get(`${athleteId}:activities`);
      if (!cached) return json({ error: 'No cached activities' }, 400);

      const activities: StravaActivity[] = JSON.parse(cached);

      // Filter by start_date if set
      let toProcess = activities;
      if (settings.start_date) {
        const startTs = new Date(settings.start_date).getTime();
        toProcess = activities.filter(
          (a) => new Date(a.start_date).getTime() >= startTs
        );
      }

      // Sort chronologically
      toProcess.sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );

      // Reset game state
      const { createInitialGameState } = await import('./lib/gameTypes');
      const freshState = createInitialGameState();
      const existingState = await loadGameState(env.MAF_GAME, athleteId);
      freshState.weekly_target_zone_minutes = existingState.weekly_target_zone_minutes;
      if (!freshState.badges_earned.includes('committed')) {
        freshState.badges_earned.push('committed');
        freshState.xp_total += 50;
      }
      await saveGameState(env.MAF_GAME, athleteId, freshState);

      let processed = 0;
      const allBadges: string[] = ['committed'];

      for (const activity of toProcess) {
        // Load cached analysis (skip if not analyzed yet)
        const analysisRaw = await env.MAF_ACTIVITIES.get(`${athleteId}:analysis:${activity.id}`);
        if (!analysisRaw) continue;
        const analysis: MAFActivity = JSON.parse(analysisRaw);

        const result = await processNewRun(env.MAF_GAME, athleteId, analysis, settings);

        for (const badge of result.badges_earned) {
          if (!allBadges.includes(badge.id)) allBadges.push(badge.id);
        }
        processed++;
      }

      const finalState = await loadGameState(env.MAF_GAME, athleteId);
      const gameResponse = buildGameAPIResponse(finalState);

      return json({
        rebadge: {
          processed,
          badges_earned: finalState.badges_earned,
          badge_count: finalState.badges_earned.length,
          total_xp: finalState.xp_total,
          lifetime_total_runs: finalState.lifetime_total_runs,
          lifetime_zone_minutes: finalState.lifetime_zone_minutes,
        },
        game: gameResponse,
      });
    }

    // --- Debug: Reset onboarding (for testing flow) ---
    if (path === '/api/debug/reset-onboarding' && request.method === 'DELETE') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      // Clear settings (keeps tokens so auth still works)
      await env.MAF_SETTINGS.delete(`${athleteId}:settings`);

      // Reset game state
      const { createInitialGameState } = await import('./lib/gameTypes');
      await env.MAF_GAME.put(`${athleteId}:game`, JSON.stringify(createInitialGameState()));

      return json({ reset: true, athleteId });
    }

    // --- Debug: Set stage (for testing game progression) ---
    if (path === '/api/debug/set-stage' && request.method === 'POST') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const body = await request.json() as { stage?: string };
      const STAGE_PRESETS: Record<string, Partial<GameState>> = {
        new: {
          xp_total: 0,
          badges_earned: [],
          badges_progress: {},
          streak_current_weeks: 0,
          streak_longest: 0,
          streak: { current_weeks: 0, longest_ever: 0, last_qualified_week: null, frozen: false },
          lifetime_zone_minutes: 0,
          total_zone_minutes: 0,
          lifetime_qualifying_runs: 0,
          total_qualifying_runs: 0,
          lifetime_total_runs: 0,
          weekly_history: [],
          personal_records: { longest_zone_streak_minutes: 0, best_cardiac_drift: null, best_warmup_score: 0 },
          backfill_complete: true,
        },
        week1: {
          xp_total: 400,
          badges_earned: ['committed', 'first_spark', 'took_initiative'],
          streak_current_weeks: 0,
          streak_longest: 0,
          streak: { current_weeks: 0, longest_ever: 0, last_qualified_week: null, frozen: false },
          lifetime_zone_minutes: 45,
          total_zone_minutes: 45,
          lifetime_qualifying_runs: 2,
          total_qualifying_runs: 2,
          lifetime_total_runs: 3,
          backfill_complete: true,
        },
        week2: {
          xp_total: 1200,
          badges_earned: ['committed', 'first_spark', 'took_initiative', 'three_for_three', 'showing_up', 'first_five', 'dialed_in'],
          streak_current_weeks: 1,
          streak_longest: 1,
          streak: { current_weeks: 1, longest_ever: 1, last_qualified_week: null, frozen: false },
          lifetime_zone_minutes: 140,
          total_zone_minutes: 140,
          lifetime_qualifying_runs: 5,
          total_qualifying_runs: 5,
          lifetime_total_runs: 6,
          backfill_complete: true,
        },
        month1: {
          xp_total: 3000,
          badges_earned: ['committed', 'first_spark', 'took_initiative', 'three_for_three', 'showing_up', 'first_five', 'dialed_in', 'full_week', 'two_week_fire', 'seedling'],
          streak_current_weeks: 4,
          streak_longest: 4,
          streak: { current_weeks: 4, longest_ever: 4, last_qualified_week: null, frozen: false },
          lifetime_zone_minutes: 450,
          total_zone_minutes: 450,
          lifetime_qualifying_runs: 12,
          total_qualifying_runs: 12,
          lifetime_total_runs: 14,
          backfill_complete: true,
        },
        month3: {
          xp_total: 11000,
          badges_earned: [
            'committed', 'first_spark', 'took_initiative', 'three_for_three', 'showing_up', 'first_five',
            'dialed_in', 'full_week', 'two_week_fire', 'seedling',
            'month_strong', 'eight_week_wall', 'taking_root', 'zone_locked', 'drift_buster', 'long_haul',
          ],
          streak_current_weeks: 12,
          streak_longest: 12,
          streak: { current_weeks: 12, longest_ever: 12, last_qualified_week: null, frozen: false },
          lifetime_zone_minutes: 1200,
          total_zone_minutes: 1200,
          lifetime_qualifying_runs: 35,
          total_qualifying_runs: 35,
          lifetime_total_runs: 40,
          backfill_complete: true,
        },
        veteran: {
          xp_total: 28000,
          badges_earned: [
            'committed', 'first_spark', 'took_initiative', 'three_for_three', 'showing_up', 'first_five',
            'dialed_in', 'full_week', 'two_week_fire', 'seedling',
            'month_strong', 'eight_week_wall', 'taking_root', 'zone_locked', 'drift_buster', 'long_haul',
            'the_commitment', 'deep_roots', 'summit_seeker', 'patience_practice', 'ultra_steady', 'negative_splitter',
          ],
          streak_current_weeks: 26,
          streak_longest: 26,
          streak: { current_weeks: 26, longest_ever: 26, last_qualified_week: null, frozen: false },
          lifetime_zone_minutes: 3000,
          total_zone_minutes: 3000,
          lifetime_qualifying_runs: 90,
          total_qualifying_runs: 90,
          lifetime_total_runs: 100,
          backfill_complete: true,
        },
      };

      const preset = body.stage ? STAGE_PRESETS[body.stage] : null;
      if (!preset) {
        return json({ error: `Unknown stage. Valid: ${Object.keys(STAGE_PRESETS).join(', ')}` }, 400);
      }

      const { createInitialGameState } = await import('./lib/gameTypes');
      const state = { ...createInitialGameState(), ...preset, updated_at: new Date().toISOString() } as GameState;
      await saveGameState(env.MAF_GAME, athleteId, state);

      const userSettings = await loadSettings(env, athleteId);
      const response = buildGameAPIResponse(state, userSettings ? { maf_hr: userSettings.maf_hr } : undefined);
      return json({ stage: body.stage, game: response });
    }

    // --- OAuth: Redirect to Strava ---
    if (path === '/api/auth/strava') {
      const baseUrl = getBaseUrl(request);
      const redirectUri = `${baseUrl}/api/auth/callback`;
      const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize');
      stravaAuthUrl.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
      stravaAuthUrl.searchParams.set('response_type', 'code');
      stravaAuthUrl.searchParams.set('redirect_uri', redirectUri);
      stravaAuthUrl.searchParams.set('scope', 'read,activity:read');
      stravaAuthUrl.searchParams.set('approval_prompt', 'auto');

      return Response.redirect(stravaAuthUrl.toString(), 302);
    }

    // --- OAuth: Handle Callback ---
    if (path === '/api/auth/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error || !code) {
        return new Response(`OAuth error: ${error || 'no code received'}`, { status: 400 });
      }

      const baseUrl = getBaseUrl(request);
      const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.STRAVA_CLIENT_ID,
          client_secret: env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        return new Response(`Token exchange failed: ${err}`, { status: 500 });
      }

      const data: StravaTokenResponse = await tokenResponse.json();
      const athleteId = data.athlete.id.toString();

      await env.MAF_TOKENS.put(
        athleteId,
        JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        })
      );

      // Store athlete name + avatar from Strava profile
      const athleteName = [data.athlete.firstname, data.athlete.lastname].filter(Boolean).join(' ');
      const avatarUrl = data.athlete.profile_medium || data.athlete.profile || '';
      const displayName = data.athlete.firstname || '';
      {
        const existingRaw = await env.MAF_SETTINGS.get(`${athleteId}:settings`);
        const existing = existingRaw ? JSON.parse(existingRaw) : {};
        if (athleteName) existing.athlete_name = athleteName;
        if (displayName) existing.display_name = displayName;
        if (avatarUrl) existing.avatar_url = avatarUrl;
        await env.MAF_SETTINGS.put(`${athleteId}:settings`, JSON.stringify(existing));
      }

      const sessionId = generateSessionId();
      await env.MAF_TOKENS.put(`session:${sessionId}`, athleteId, {
        expirationTtl: 60 * 60 * 24 * 7,
      });

      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const redirectTo = isLocal ? 'http://localhost:5173' : baseUrl;

      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectTo,
          'Set-Cookie': `maf_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
        },
      });
    }

    // --- Auth: Check Session ---
    if (path === '/api/auth/me') {
      const athleteId = await resolveSession(request, env);
      if (!athleteId) {
        return json({ authenticated: false });
      }
      return json({ authenticated: true, athleteId });
    }

    // --- Auth: Logout ---
    if (path === '/api/auth/logout') {
      const sessionId = getAthleteIdFromCookie(request);
      if (sessionId) {
        await env.MAF_TOKENS.delete(`session:${sessionId}`);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'maf_session=; Path=/; HttpOnly; Max-Age=0',
        },
      });
    }

    // --- Fetch Activities ---
    if (path === '/api/activities' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const token = await getValidToken(athleteId, env);
      if (!token) return json({ error: 'Token expired, please re-authenticate' }, 401);

      const cacheKey = `${athleteId}:activities`;
      const cached = await env.MAF_ACTIVITIES.get(cacheKey);
      let existingActivities: StravaActivity[] = cached ? JSON.parse(cached) : [];

      let after: number | undefined;
      if (existingActivities.length > 0) {
        const latest = existingActivities.reduce((max, a) =>
          new Date(a.start_date) > new Date(max.start_date) ? a : max
        );
        after = Math.floor(new Date(latest.start_date).getTime() / 1000);
      } else {
        after = Math.floor((Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) / 1000);
      }

      let page = 1;
      let newActivities: StravaActivity[] = [];
      let hasMore = true;

      while (hasMore) {
        const apiUrl = new URL('https://www.strava.com/api/v3/athlete/activities');
        apiUrl.searchParams.set('after', after!.toString());
        apiUrl.searchParams.set('page', page.toString());
        apiUrl.searchParams.set('per_page', '100');

        const res = await fetch(apiUrl.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const err = await res.text();
          return json({ error: `Strava API error: ${err}` }, res.status);
        }

        const batch: StravaActivity[] = await res.json();
        newActivities = newActivities.concat(batch);

        if (batch.length < 100) {
          hasMore = false;
        } else {
          page++;
          if (page > 5) hasMore = false;
        }
      }

      const allActivities = [...existingActivities, ...newActivities];
      const deduped = Array.from(
        new Map(allActivities.map((a) => [a.id, a])).values()
      );
      deduped.sort(
        (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );

      await env.MAF_ACTIVITIES.put(cacheKey, JSON.stringify(deduped));

      const filterAfter = url.searchParams.get('after');
      let responseActivities = deduped;
      if (filterAfter) {
        const filterTs = parseInt(filterAfter) * 1000;
        responseActivities = deduped.filter(
          (a) => new Date(a.start_date).getTime() >= filterTs
        );
      }

      return json({
        activities: responseActivities,
        total: deduped.length,
        returned: responseActivities.length,
        new_fetched: newActivities.length,
      });
    }

    // --- Fetch Activity Streams ---
    const streamsMatch = path.match(/^\/api\/activities\/(\d+)\/streams$/);
    if (streamsMatch && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const activityId = streamsMatch[1];
      const token = await getValidToken(athleteId, env);
      if (!token) return json({ error: 'Token expired, please re-authenticate' }, 401);

      const streamCacheKey = `${athleteId}:stream:${activityId}`;
      const cachedStream = await env.MAF_ACTIVITIES.get(streamCacheKey);
      if (cachedStream) {
        return json(JSON.parse(cachedStream));
      }

      const streamUrl = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,cadence,velocity_smooth,time,distance,altitude&key_by_type=true`;
      const res = await fetch(streamUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.text();
        return json({ error: `Stream fetch failed: ${err}` }, res.status);
      }

      const streams = await res.json();
      await env.MAF_ACTIVITIES.put(streamCacheKey, JSON.stringify(streams));

      return json(streams);
    }

    // --- Settings: Get ---
    if (path === '/api/settings' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const raw = await env.MAF_SETTINGS.get(`${athleteId}:settings`);
      if (!raw) {
        return json({ configured: false });
      }
      return json({ configured: true, ...JSON.parse(raw) });
    }

    // --- Settings: Save ---
    if (path === '/api/settings' && request.method === 'PUT') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const body = await request.json() as {
        age?: number;
        modifier?: number;
        units?: 'km' | 'mi';
        start_date?: string | null;
        athlete_name?: string;
        training_start_date?: string | null;
        email?: string;
      };

      // Preserve existing settings
      const existingRaw = await env.MAF_SETTINGS.get(`${athleteId}:settings`);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};

      // Partial update: only overwrite fields that are provided
      const age = body.age ?? existing.age;
      const modifier = body.modifier ?? existing.modifier ?? 0;

      if (age !== undefined) {
        if (age < 10 || age > 100) {
          return json({ error: 'Invalid age' }, 400);
        }
      }
      if (body.modifier !== undefined && ![-10, -5, 0, 5].includes(body.modifier)) {
        return json({ error: 'Invalid modifier' }, 400);
      }

      const mafHr = age ? 180 - age + modifier : existing.maf_hr;

      const settings = {
        ...existing,
        ...(body.age !== undefined && { age: body.age }),
        ...(body.modifier !== undefined && { modifier: body.modifier }),
        ...(body.units !== undefined && { units: body.units }),
        ...(mafHr !== undefined && { maf_hr: mafHr }),
        ...(body.start_date !== undefined && { start_date: body.start_date }),
        ...(body.athlete_name !== undefined && { athlete_name: body.athlete_name }),
        ...(body.training_start_date !== undefined && { training_start_date: body.training_start_date }),
        ...(body.email !== undefined && { email: body.email }),
      };

      await env.MAF_SETTINGS.put(`${athleteId}:settings`, JSON.stringify(settings));

      // Complete first_steps quest if active (v2 only)
      if (env.MAF_GAME) {
        try { await onSettingsSaved(env.MAF_GAME, athleteId); } catch {}

        // If training_start_date is today, mark backfill as complete (no history to process)
        if (body.training_start_date) {
          const today = new Date().toISOString().split('T')[0];
          if (body.training_start_date === today) {
            try {
              const gameState = await loadGameState(env.MAF_GAME, athleteId);
              gameState.backfill_complete = true;
              await saveGameState(env.MAF_GAME, athleteId, gameState);
            } catch {}
          }
        }
      }

      return json({ configured: true, ...settings });
    }

    // --- Static Assets / SPA Fallback ---
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Asset not found, fall through
    }

    // SPA fallback: serve index.html for any non-API route
    try {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = '/index.html';
      return await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};
