// One-time setup endpoint. Instagram redirects here after whoever owns the
// @151coffee account approves the developer app (see
// storyblok/instagram-setup.md for the full walkthrough). This exchanges the
// authorization code Instagram hands back for a short-lived token, then
// immediately exchanges THAT for a long-lived (~60 day) token, and saves it
// to the INSTAGRAM_CACHE KV namespace -- after that, src/lib/instagram.ts
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
  // with, verbatim -- so a shared secret here works like a CSRF token without
  // needing a separate pre-redirect KV write. Without this check, anyone who
  // completes their own authorize flow against our public client id could hit
  // this callback directly and overwrite the stored token, pointing the
  // homepage carousel at their own Instagram account. Fails closed: if the
  // secret isn't configured, the route refuses rather than trusting an absent
  // check. See storyblok/instagram-setup.md for where this goes in the
  // authorize URL.
  const expectedState = (env as any).INSTAGRAM_OAUTH_STATE;
  if (!expectedState || state !== expectedState) {
    // TEMPORARY DEBUG (remove once the state mismatch is diagnosed): reveals
    // only lengths and first/last characters, never the full secret, so we
    // can tell a whitespace/truncation issue apart from a genuinely wrong
    // value without ever printing either value in full.
    const describe = (s: string | null | undefined) =>
      s == null
        ? 'undefined'
        : `len=${s.length} first=${JSON.stringify(s[0])} last=${JSON.stringify(s[s.length - 1])}`;
    return new Response(
      `Invalid or missing state parameter\nreceived: ${describe(state)}\nexpected: ${describe(expectedState)}`,
      { status: 403 },
    );
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

  // Wrapped in try/catch so a network-level failure (fetch throwing rather
  // than resolving with a non-OK status) or a KV error surfaces as a real
  // message instead of an unhandled exception -- which Cloudflare's edge
  // reports as a bare 502 with no detail at all, impossible to debug from
  // the browser alone.
  //
  // TEMPORARY: each fetch also gets its own AbortController timeout. A hung
  // fetch (one that never resolves OR rejects) can't be caught by try/catch
  // at all -- if the platform kills the whole isolate for exceeding some
  // resource/time limit before the promise ever settles, that happens
  // completely outside JS's control, so nothing here ever runs, which is
  // consistent with the zero-log-output 502s seen so far. Forcing our own
  // timeout turns that silent kill into a normal, catchable AbortError.
  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 8000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    console.error('[instagram-oauth-callback] starting short-lived token exchange');
    const exchangeRes = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        // Must byte-for-byte match the redirect_uri used in the authorize step.
        redirect_uri: `${url.origin}/api/instagram-oauth-callback`,
      }),
    });
    console.error(`[instagram-oauth-callback] short-lived exchange responded: ${exchangeRes.status}`);

    if (!exchangeRes.ok) {
      return new Response(`Instagram token exchange failed: ${exchangeRes.status} ${await exchangeRes.text()}`, {
        status: 502,
      });
    }

    const shortLived = (await exchangeRes.json()) as { access_token: string };

    // The short-lived token from the step above is only valid ~1 hour. This
    // second exchange trades it for the long-lived (~60 day) token that
    // src/lib/instagram.ts and the scheduled refresh job actually use.
    const longLivedUrl = new URL(LONG_LIVED_URL);
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedUrl.searchParams.set('client_secret', clientSecret);
    longLivedUrl.searchParams.set('access_token', shortLived.access_token);

    console.error('[instagram-oauth-callback] starting long-lived token exchange');
    const longLivedRes = await fetchWithTimeout(longLivedUrl);
    console.error(`[instagram-oauth-callback] long-lived exchange responded: ${longLivedRes.status}`);
    if (!longLivedRes.ok) {
      return new Response(
        `Instagram long-lived token exchange failed: ${longLivedRes.status} ${await longLivedRes.text()}`,
        { status: 502 },
      );
    }
    const longLived = (await longLivedRes.json()) as { access_token: string };

    await kv.put('access_token', longLived.access_token);
    return new Response(
      'Instagram connected. The homepage carousel will start showing real posts on its next request (may take up to an hour to clear any stale cache).',
      { status: 200, headers: { 'Content-Type': 'text/plain' } },
    );
  } catch (err) {
    // Log only a plain string, never the raw error object -- passing a
    // complex Error (with nested fetch/cause diagnostics) to console.error
    // has been observed to throw during serialization on this platform,
    // which would escape this catch and crash the handler anyway, hiding
    // the real failure behind a bare edge 502 with zero log output.
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error(
      `[instagram-oauth-callback] unhandled error${timedOut ? ' (timed out)' : ''}: ${message}`,
    );
    return new Response(
      timedOut
        ? 'Instagram OAuth callback: a fetch to Instagram/Meta timed out after 8s (no response at all -- likely a network-level block, not a bad request).'
        : `Instagram OAuth callback threw: ${message}`,
      { status: 502 },
    );
  }
}
