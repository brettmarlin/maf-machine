import { analyzeActivity } from './lib/mafAnalysis';
import type { StravaActivity, StreamData, UserSettings } from './lib/mafAnalysis';
import { loadGameState, processNewRun, onSettingsSaved, buildGameAPIResponse, saveGameState } from './lib/gameState';

export interface Env {
  MAF_TOKENS: KVNamespace;
  MAF_ACTIVITIES: KVNamespace;
  MAF_SETTINGS: KVNamespace;
  MAF_GAME: KVNamespace;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  DEV_MODE?: string;
  DEV_ATHLETE_ID?: string;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
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

  // 8. Process game state (XP, quests, milestones, streaks)
  const gameResult = await processNewRun(env.MAF_GAME, athleteId, analysis, settings);

  console.log(
    `[webhook] Activity ${activityId} processed: ` +
    `qualifying=${analysis.qualifying}, ` +
    `xp=${gameResult.xp_earned}, ` +
    `zone_min=${analysis.zone_minutes.toFixed(1)}, ` +
    `milestones=${gameResult.milestones_unlocked.join(',') || 'none'}, ` +
    `quest=${gameResult.quest_completed || 'none'}`
  );

  // TODO Phase 2: Generate coaching assessment here
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
      const response = buildGameAPIResponse(state);
      return json(response);
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

    // --- Backfill: Process cached activities through game engine ---
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

      // Filter by start_date if set
      let toProcess = activities;
      if (settings.start_date) {
        const startTs = new Date(settings.start_date).getTime();
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
      // Complete first_steps quest since settings exist
      freshState.quests_completed = ['first_steps'];
      freshState.quest_active = 'first_maf_run';
      freshState.quest_progress = { first_steps: 1 };
      freshState.badges = ['🏃'];
      await saveGameState(env.MAF_GAME, athleteId, freshState);

      let processed = 0;
      let qualifying = 0;
      let totalXP = 0;

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
      }

      const finalState = await loadGameState(env.MAF_GAME, athleteId);
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
        const runs = batch.filter(
          (a: StravaActivity) => a.type === 'Run' || a.sport_type === 'Run'
        );
        newActivities = newActivities.concat(runs);

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
        age: number;
        modifier: number;
        units: 'km' | 'mi';
        qualifying_tolerance?: number;
        start_date?: string | null;
      };

      if (!body.age || body.age < 10 || body.age > 100) {
        return json({ error: 'Invalid age' }, 400);
      }
      if (![-10, -5, 0, 5].includes(body.modifier)) {
        return json({ error: 'Invalid modifier' }, 400);
      }

      const mafHr = 180 - body.age + body.modifier;
      const qualifyingTolerance = body.qualifying_tolerance ?? 10;

      const settings = {
        age: body.age,
        modifier: body.modifier,
        units: body.units || 'km',
        maf_hr: mafHr,
        maf_zone_low: mafHr - 5,
        maf_zone_high: mafHr + 5,
        qualifying_tolerance: qualifyingTolerance,
        start_date: body.start_date || null,
      };

      await env.MAF_SETTINGS.put(`${athleteId}:settings`, JSON.stringify(settings));

      // Complete first_steps quest if active
      await onSettingsSaved(env.MAF_GAME, athleteId);

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
