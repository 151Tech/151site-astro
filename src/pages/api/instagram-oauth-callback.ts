// One-time setup endpoint. Instagram redirects here after whoever owns the
// @151coffee account approves the developer app (see
// storyblok/instagram-setup.md for the full walkthrough). This exchanges the
// authorization code Instagram hands back for a short-lived token, then
// immediately exchanges THAT for a long-lived (~60 day) token, and saves it
// to the INSTAGRAM_CACHE KV namespace - after that, src/lib/instagram.ts
// reads it directly and src/pages/api/instagram-token-refresh.ts keeps it
// alive on a schedule, so this route is never hit again.
//
// Not meant to be reachable at will: Instagram only redirects here mid-OAuth
// with a single-use `code`, and re-running it after setup is harmless (it
// just re-seeds the same KV key) but pointless.
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

  // Instagram echoes back whatever `state` value the authorize URL was built
  // with, verbatim - so a shared secret here works like a CSRF token without
  // needing a separate pre-redirect KV write. Without this check, anyone who
  // completes their own authorize flow against our public client id could hit
  // this callback directly and overwrite the stored token, pointing the
  // homepage carousel at their own Instagram account. Fails closed: if the
  // secret isn't configured, the route refuses rather than trusting an absent
  // check. See storyblok/instagram-setup.md for where this goes in the
  // authorize URL.
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

  // Must match the redirect_uri from the authorize step byte for byte, or
  // Instagram rejects the code with a (misleadingly generic) "Error
  // validating verification code" message.
  //
  // Deriving this from url.origin is not trustworthy here: Webflow Cloud
  // proxies requests in a way that makes the incoming Host header unreliable
  // (the same reason astro.config.mjs sets security.checkOrigin: false), so
  // the Worker can see an internal hostname or http:// rather than the public
  // https:// URL the browser actually used. INSTAGRAM_REDIRECT_URI pins it
  // explicitly; url.origin stays as the fallback for local dev.
  const redirectUri =
    (env as any).INSTAGRAM_REDIRECT_URI || `${url.origin}/api/instagram-oauth-callback`;

  // Wrapped in try/catch so a network-level failure (fetch throwing rather
  // than resolving with a non-OK status) or a KV error surfaces as a real
  // message instead of an unhandled exception.
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
      // Deliberately NOT a 5xx: Webflow Cloud's edge intercepts any 5xx this
      // Worker returns and replaces the body with its own branded "502 Bad
      // gateway" page, discarding the message below - which makes an
      // ordinary handled error look like an unexplained platform crash. 4xx
      // bodies pass through untouched.
      //
      // The redirect_uri is echoed because Instagram reports a mismatch with
      // the same opaque "Error validating verification code" text it uses for
      // an already-spent code, and this route is a one-time setup step a
      // human reads the output of.
      return new Response(
        `Instagram token exchange failed: ${exchangeRes.status} ${await exchangeRes.text()}\n\n` +
          `redirect_uri sent: ${redirectUri}\n` +
          `Instagram returns this same error for an already-used or expired code, so retry with a fresh one before chasing a mismatch.`,
        { status: 400 },
      );
    }

    const shortLived = (await exchangeRes.json()) as { access_token: string };

    // The short-lived token from the step above is only valid ~1 hour. This
    // second exchange trades it for the long-lived (~60 day) token that
    // src/lib/instagram.ts and the scheduled refresh job actually use.
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
    // Log only a plain string, never the raw error object - passing a
    // complex Error (with nested fetch/cause diagnostics) to console.error
    // has been observed to throw during serialization on this platform,
    // which would escape this catch and crash the handler anyway, hiding
    // the real failure behind a bare edge 502 with zero log output.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[instagram-oauth-callback] unhandled error: ${message}`);
    return new Response(`Instagram OAuth callback threw: ${message}`, { status: 400 });
  }
}
