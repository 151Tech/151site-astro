// Refreshes the long-lived Instagram token before its 60 day expiry. Called
// by .github/workflows/instagram-token-refresh.yml about every 45 days. A
// refresh only needs the current token, read from KV.
import { env } from 'cloudflare:workers';

export const prerender = false;
export const config = { runtime: 'edge' };

const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';

export async function POST({ request }: { request: Request }) {
  // Server-to-server call, authenticated with a shared-secret header.
  const expectedSecret = (env as any).INSTAGRAM_REFRESH_SECRET;
  const providedSecret = request.headers.get('x-refresh-secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const kv = (env as any).INSTAGRAM_CACHE;
  if (!kv) {
    return new Response('Server misconfigured: INSTAGRAM_CACHE KV binding is missing.', { status: 500 });
  }

  const currentToken = await kv.get('access_token');
  if (!currentToken) {
    return new Response('No access_token in KV yet - run the one-time OAuth authorization first.', {
      status: 400,
    });
  }

  const refreshUrl = new URL(REFRESH_URL);
  refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
  refreshUrl.searchParams.set('access_token', currentToken);

  const res = await fetch(refreshUrl);
  if (!res.ok) {
    return new Response(`Instagram token refresh failed: ${res.status} ${await res.text()}`, { status: 502 });
  }

  const data = (await res.json()) as { access_token: string };
  await kv.put('access_token', data.access_token);
  return new Response('Instagram token refreshed.', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
