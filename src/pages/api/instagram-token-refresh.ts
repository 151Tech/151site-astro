// Called on a schedule (see .github/workflows/instagram-token-refresh.yml,
// ~every 45 days) to refresh the long-lived Instagram token before its ~60
// day expiry. Unlike the initial exchange in instagram-oauth-callback.ts,
// refreshing a still-valid long-lived token doesn't need the app secret -
// it just needs the current token itself, which is why this route reads it
// straight from KV instead of taking any OAuth params.
import { env } from 'cloudflare:workers';

export const prerender = false;
export const config = { runtime: 'edge' };

const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';

export async function POST({ request }: { request: Request }) {
  // Shared-secret header instead of a state param - this isn't part of an
  // OAuth redirect, it's a plain server-to-server call from the scheduled
  // workflow, so a bearer-style header is the natural fit.
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
