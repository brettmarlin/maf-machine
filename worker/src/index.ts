export interface Env {
  MAF_TOKENS: KVNamespace;
  MAF_ACTIVITIES: KVNamespace;
  MAF_SETTINGS: KVNamespace;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  STRAVA_WEBHOOK_VERIFY_TOKEN: string; 
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

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  elapsed_time: number;
  distance: number;
  average_heartrate?: number;
  average_cadence?: number;
  total_elevation_gain: number;
  average_speed: number;
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

// --- Main Handler ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API Routes ---

    if (path === '/api/health') {
      return json({ status: 'ok' });
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

      // In dev, redirect to Vite dev server; in production, to /maf-machine
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
          (a) => a.type === 'Run' || a.sport_type === 'Run'
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

      // Filter response by ?after param from frontend (date range)
      const url = new URL(request.url);
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

      return json({ configured: true, ...settings });
    }

    // --- Webhook: Strava Subscription Validation ---
    if (path === '/api/webhook' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === env.STRAVA_WEBHOOK_VERIFY_TOKEN && challenge) {
        return json({ 'hub.challenge': challenge });
      }

      return new Response('Forbidden', { status: 403 });
    }

    // --- Webhook: Receive Strava Events ---
    if (path === '/api/webhook' && request.method === 'POST') {
      const event = await request.json() as {
        object_type: 'activity' | 'athlete';
        aspect_type: 'create' | 'update' | 'delete';
        object_id: number;
        owner_id: number;
        subscription_id: number;
        event_time: number;
        updates?: Record<string, string>;
      };

      const athleteId = event.owner_id.toString();

      // Activity events
      if (event.object_type === 'activity') {
        if (event.aspect_type === 'create' || event.aspect_type === 'update') {
          const token = await getValidToken(athleteId, env);
          if (token) {
            try {
              const res = await fetch(
                `https://www.strava.com/api/v3/activities/${event.object_id}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (res.ok) {
                const activity: StravaActivity = await res.json();
                if (activity.type === 'Run' || activity.sport_type === 'Run') {
                  const cacheKey = `${athleteId}:activities`;
                  const cached = await env.MAF_ACTIVITIES.get(cacheKey);
                  let activities: StravaActivity[] = cached ? JSON.parse(cached) : [];
                  activities = activities.filter((a) => a.id !== activity.id);
                  activities.push(activity);
                  activities.sort(
                    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
                  );
                  await env.MAF_ACTIVITIES.put(cacheKey, JSON.stringify(activities));
                }
              }
            } catch {
              // Best-effort — Strava will retry
            }
          }
        } else if (event.aspect_type === 'delete') {
          const cacheKey = `${athleteId}:activities`;
          const cached = await env.MAF_ACTIVITIES.get(cacheKey);
          if (cached) {
            let activities: StravaActivity[] = JSON.parse(cached);
            activities = activities.filter((a) => a.id !== event.object_id);
            await env.MAF_ACTIVITIES.put(cacheKey, JSON.stringify(activities));
          }
          await env.MAF_ACTIVITIES.delete(`${athleteId}:stream:${event.object_id}`);
        }
      }

      // Athlete deauthorization — required by Strava API Agreement
      if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
        await env.MAF_TOKENS.delete(athleteId);
        await env.MAF_SETTINGS.delete(`${athleteId}:settings`);
        await env.MAF_ACTIVITIES.delete(`${athleteId}:activities`);
      }

      return json({ ok: true });
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
