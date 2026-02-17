export interface Env {
  MAF_TOKENS: KVNamespace;
  MAF_ACTIVITIES: KVNamespace;
  MAF_SETTINGS: KVNamespace;
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
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

// Resolve session cookie → athlete ID
async function resolveSession(request: Request, env: Env): Promise<string | null> {
  const sessionId = getAthleteIdFromCookie(request);
  if (!sessionId) return null;
  return await env.MAF_TOKENS.get(`session:${sessionId}`);
}

// Get a valid access token, refreshing if expired
async function getValidToken(athleteId: string, env: Env): Promise<string | null> {
  const raw = await env.MAF_TOKENS.get(athleteId);
  if (!raw) return null;

  const tokens: StoredTokens = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  // If token is still valid (with 60s buffer), return it
  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  // Refresh the token
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

// JSON response helper
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Auth guard — returns athleteId or an error Response
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

    // --- Health Check ---
    if (url.pathname === '/api/health') {
      return json({ status: 'ok' });
    }

    // --- OAuth: Redirect to Strava ---
    if (url.pathname === '/api/auth/strava') {
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
    if (url.pathname === '/api/auth/callback') {
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

      const frontendUrl =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1'
          ? 'http://localhost:5173'
          : baseUrl;

      return new Response(null, {
        status: 302,
        headers: {
          Location: frontendUrl,
          'Set-Cookie': `maf_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
        },
      });
    }

    // --- Auth: Check Session ---
    if (url.pathname === '/api/auth/me') {
      const athleteId = await resolveSession(request, env);
      if (!athleteId) {
        return json({ authenticated: false });
      }
      return json({ authenticated: true, athleteId });
    }

    // --- Auth: Logout ---
    if (url.pathname === '/api/auth/logout') {
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
    if (url.pathname === '/api/activities' && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const token = await getValidToken(athleteId, env);
      if (!token) return json({ error: 'Token expired, please re-authenticate' }, 401);

      // Check cache for existing activities
      const cacheKey = `${athleteId}:activities`;
      const cached = await env.MAF_ACTIVITIES.get(cacheKey);
      let existingActivities: StravaActivity[] = cached ? JSON.parse(cached) : [];

      // Find the most recent activity timestamp to only fetch new ones
      let after: number | undefined;
      if (existingActivities.length > 0) {
        const latest = existingActivities.reduce((max, a) =>
          new Date(a.start_date) > new Date(max.start_date) ? a : max
        );
        after = Math.floor(new Date(latest.start_date).getTime() / 1000);
      } else {
        // First sync: fetch last 6 months
        after = Math.floor((Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) / 1000);
      }

      // Fetch from Strava (paginated)
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

        // Filter to runs only
        const runs = batch.filter(
          (a) => a.type === 'Run' || a.sport_type === 'Run'
        );
        newActivities = newActivities.concat(runs);

        if (batch.length < 100) {
          hasMore = false;
        } else {
          page++;
          // Safety valve: max 5 pages per sync (500 activities)
          if (page > 5) hasMore = false;
        }
      }

      // Merge and deduplicate
      const allActivities = [...existingActivities, ...newActivities];
      const deduped = Array.from(
        new Map(allActivities.map((a) => [a.id, a])).values()
      );

      // Sort by date descending
      deduped.sort(
        (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );

      // Cache in KV
      await env.MAF_ACTIVITIES.put(cacheKey, JSON.stringify(deduped));

      return json({
        activities: deduped,
        total: deduped.length,
        new_fetched: newActivities.length,
      });
    }

    // --- Fetch Activity Streams ---
    const streamsMatch = url.pathname.match(/^\/api\/activities\/(\d+)\/streams$/);
    if (streamsMatch && request.method === 'GET') {
      const auth = await requireAuth(request, env);
      if (auth instanceof Response) return auth;
      const athleteId = auth;

      const activityId = streamsMatch[1];
      const token = await getValidToken(athleteId, env);
      if (!token) return json({ error: 'Token expired, please re-authenticate' }, 401);

      // Check cache first
      const streamCacheKey = `${athleteId}:stream:${activityId}`;
      const cachedStream = await env.MAF_ACTIVITIES.get(streamCacheKey);
      if (cachedStream) {
        return json(JSON.parse(cachedStream));
      }

      // Fetch from Strava
      const streamUrl = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,cadence,velocity_smooth,time,distance,altitude&key_by_type=true`;
      const res = await fetch(streamUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.text();
        return json({ error: `Stream fetch failed: ${err}` }, res.status);
      }

      const streams = await res.json();

      // Cache the streams
      await env.MAF_ACTIVITIES.put(streamCacheKey, JSON.stringify(streams));

      return json(streams);
    }
// --- Settings: Get ---
if (url.pathname === '/api/settings' && request.method === 'GET') {
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
if (url.pathname === '/api/settings' && request.method === 'PUT') {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const athleteId = auth;

  const body = await request.json() as {
    age: number;
    modifier: number;
    units: 'km' | 'mi';
  };

  // Validate
  if (!body.age || body.age < 10 || body.age > 100) {
    return json({ error: 'Invalid age' }, 400);
  }
  if (![- 10, -5, 0, 5].includes(body.modifier)) {
    return json({ error: 'Invalid modifier' }, 400);
  }

  const mafHr = 180 - body.age + body.modifier;
  const settings = {
    age: body.age,
    modifier: body.modifier,
    units: body.units || 'km',
    maf_hr: mafHr,
    maf_zone_low: mafHr - 5,
    maf_zone_high: mafHr + 5,
  };

  await env.MAF_SETTINGS.put(`${athleteId}:settings`, JSON.stringify(settings));

  return json({ configured: true, ...settings });
}
    return new Response('Not Found', { status: 404 });
  },
};