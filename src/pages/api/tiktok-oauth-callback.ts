// One-time setup endpoint. TikTok redirects here after whoever owns the
// @151coffee account approves the developer app (see
// storyblok/tiktok-setup.md for the full walkthrough). This exchanges the
// authorization code TikTok hands back for the first refresh token and saves
// it to the TIKTOK_CACHE KV namespace -- after that, src/lib/tiktok.ts
// refreshes and rotates it on its own and this route is never hit again.
//
// Not meant to be reachable at will: TikTok only redirects here mid-OAuth
// with a single-use `code`, and re-running it after setup is harmless (it
// just re-seeds the same KV key) but pointless.
import { env } from 'cloudflare:workers';

export const prerender = false;
export const config = { runtime: 'edge' };

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  if (oauthError) {
    return new Response(`TikTok authorization failed: ${oauthError}`, { status: 400 });
  }
  if (!code) {
    return new Response('Missing ?code from TikTok redirect', { status: 400 });
  }

  // TikTok echoes back whatever `state` value the authorize URL was built
  // with, verbatim -- so a shared secret here works like a CSRF token without
  // needing a separate pre-redirect KV write. Without this check, anyone who
  // completes their own authorize flow against our public client_key could
  // hit this callback directly and overwrite the stored refresh token,
  // pointing the homepage carousel at their own TikTok account. Fails closed:
  // if the secret isn't configured, the route refuses rather than trusting an
  // absent check. See storyblok/tiktok-setup.md for where this goes in the
  // authorize URL.
  const expectedState = (env as any).TIKTOK_OAUTH_STATE;
  if (!expectedState || state !== expectedState) {
    return new Response('Invalid or missing state parameter', { status: 403 });
  }

  const clientKey = (env as any).TIKTOK_CLIENT_KEY;
  const clientSecret = (env as any).TIKTOK_CLIENT_SECRET;
  const kv = (env as any).TIKTOK_CACHE;
  if (!clientKey || !clientSecret || !kv) {
    return new Response(
      'Server misconfigured: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, or the TIKTOK_CACHE KV binding is missing.',
      { status: 500 },
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      // Must byte-for-byte match the redirect_uri used in the authorize step.
      redirect_uri: `${url.origin}/api/tiktok-oauth-callback`,
    }),
  });

  if (!res.ok) {
    return new Response(`TikTok token exchange failed: ${res.status} ${await res.text()}`, { status: 502 });
  }

  const data = (await res.json()) as { refresh_token: string; scope: string };
  if (!data.scope?.includes('video.list')) {
    return new Response(
      `Authorized, but the "video.list" scope was not granted (got: "${data.scope}"). Re-run authorization and check that box.`,
      { status: 400 },
    );
  }

  await kv.put('refresh_token', data.refresh_token);
  return new Response(
    'TikTok connected. The homepage carousel will start showing real videos on its next request (may take up to an hour to clear any stale cache).',
    { status: 200, headers: { 'Content-Type': 'text/plain' } },
  );
}
