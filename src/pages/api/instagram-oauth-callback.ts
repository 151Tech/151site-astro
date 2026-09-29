// One-time Instagram setup endpoint (see storyblok/instagram-setup.md).
// Instagram redirects here after the account owner approves the app; the code
// is exchanged for a short-lived token, then a long-lived (about 60 day)
// token, which is saved to the INSTAGRAM_CACHE KV namespace.
// instagram-token-refresh.ts keeps it alive from then on.
import { env } from 'cloudflare:workers';

export const prerender = false;
export const config = { runtime: 'edge' };

const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_LIVED_URL = 'https://graph.instagram.com/access_token';

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  if (oauthError) {
    return new Response(`Instagram authorization failed: ${oauthError}`, { status: 400 });
  }
  if (!code) {
    return new Response('Missing ?code from Instagram redirect', { status: 400 });
  }

  // `state` must match INSTAGRAM_OAUTH_STATE, so nobody else can complete an
  // authorize flow here and replace the stored token. Refuses if the secret
  // isn't set.
  const expectedState = (env as any).INSTAGRAM_OAUTH_STATE;
  if (!expectedState || state !== expectedState) {
    return new Response('Invalid or missing state parameter', { status: 403 });
  }

  const clientId = (env as any).INSTAGRAM_CLIENT_ID;
  const clientSecret = (env as any).INSTAGRAM_CLIENT_SECRET;
  const kv = (env as any).INSTAGRAM_CACHE;
  if (!clientId || !clientSecret || !kv) {
    return new Response(
      'Server misconfigured: INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, or the INSTAGRAM_CACHE KV binding is missing.',
      { status: 500 },
    );
  }

  // Must match the authorize step's redirect_uri exactly. url.origin can be
  // an internal hostname behind Webflow Cloud's proxy, so
  // INSTAGRAM_REDIRECT_URI is preferred and url.origin is the local dev
  // fallback.
  const redirectUri =
    (env as any).INSTAGRAM_REDIRECT_URI || `${url.origin}/api/instagram-oauth-callback`;

  try {
    const exchangeRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!exchangeRes.ok) {
      // A 4xx, not a 5xx: Webflow Cloud replaces 5xx bodies with its own
      // error page. The redirect_uri is included because Instagram reports a
      // mismatch with the same message as a spent code.
      return new Response(
        `Instagram token exchange failed: ${exchangeRes.status} ${await exchangeRes.text()}\n\n` +
          `redirect_uri sent: ${redirectUri}\n` +
          `Instagram returns this same error for an already-used or expired code, so retry with a fresh one before chasing a mismatch.`,
        { status: 400 },
      );
    }

    const shortLived = (await exchangeRes.json()) as { access_token: string };

    // Trade the one-hour token for the long-lived one.
    const longLivedUrl = new URL(LONG_LIVED_URL);
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedUrl.searchParams.set('client_secret', clientSecret);
    longLivedUrl.searchParams.set('access_token', shortLived.access_token);

    const longLivedRes = await fetch(longLivedUrl);
    if (!longLivedRes.ok) {
      return new Response(
        `Instagram long-lived token exchange failed: ${longLivedRes.status} ${await longLivedRes.text()}`,
        { status: 400 },
      );
    }
    const longLived = (await longLivedRes.json()) as { access_token: string };

    await kv.put('access_token', longLived.access_token);
    return new Response(
      'Instagram connected. The homepage carousel will start showing real posts on its next request (may take up to an hour to clear any stale cache).',
      { status: 200, headers: { 'Content-Type': 'text/plain' } },
    );
  } catch (err) {
    // Log a plain string: serializing some fetch errors throws on this
    // platform.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[instagram-oauth-callback] unhandled error: ${message}`);
    return new Response(`Instagram OAuth callback threw: ${message}`, { status: 400 });
  }
}
