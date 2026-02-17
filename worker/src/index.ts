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

// Generate a random session ID
function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Get the base URL for redirects (handles local dev vs production)
function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return `${url.protocol}//${url.host}`;
  }
  // In production, the Worker runs on a different domain than Pages
  // We'll update this when we deploy
  return `${url.protocol}//${url.host}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- Health Check ---
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
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
        return new Response(`OAuth error: ${error || 'no code received'}`, {
          status: 400,
        });
      }

      // Exchange code for tokens
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

      // Store tokens in KV
      await env.MAF_TOKENS.put(
        athleteId,
        JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        })
      );

      // Create a session: map sessionId → athleteId (expires in 7 days)
      const sessionId = generateSessionId();
      await env.MAF_TOKENS.put(`session:${sessionId}`, athleteId, {
        expirationTtl: 60 * 60 * 24 * 7,
      });

      // Redirect to frontend with session cookie
      const frontendUrl = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
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

    // --- Session Check: Get current user ---
    if (url.pathname === '/api/auth/me') {
      const cookie = request.headers.get('Cookie') || '';
      const match = cookie.match(/maf_session=([a-f0-9]+)/);

      if (!match) {
        return new Response(JSON.stringify({ authenticated: false }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const athleteId = await env.MAF_TOKENS.get(`session:${match[1]}`);
      if (!athleteId) {
        return new Response(JSON.stringify({ authenticated: false }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ authenticated: true, athleteId }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- Logout ---
    if (url.pathname === '/api/auth/logout') {
      const cookie = request.headers.get('Cookie') || '';
      const match = cookie.match(/maf_session=([a-f0-9]+)/);

      if (match) {
        await env.MAF_TOKENS.delete(`session:${match[1]}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'maf_session=; Path=/; HttpOnly; Max-Age=0',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};