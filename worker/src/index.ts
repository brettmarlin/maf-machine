export interface Env {
    MAF_TOKENS: KVNamespace;
    MAF_ACTIVITIES: KVNamespace;
    MAF_SETTINGS: KVNamespace;
    STRAVA_CLIENT_ID: string;
    STRAVA_CLIENT_SECRET: string;
  }
  
  export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
  
      if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
      return new Response('Not Found', { status: 404 });
    },
  };