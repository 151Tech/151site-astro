// Fetches the 3 most recent public @151coffee TikToks via TikTok's official
// Display API (not scraping -- see the setup checklist in
// storyblok/tiktok-setup.md for the one-time, human-only steps this depends
// on: registering a TikTok developer app and authorizing it as @151coffee).
//
// Two things make this stateful in a way most of this codebase isn't:
//
// 1. The access token is short-lived (~24h) and the refresh token ROTATES on
//    every use -- TikTok invalidates the old one each time you refresh. So
//    the current refresh token has to be persisted somewhere the Worker can
//    both read and write, which rules out a plain env var (Webflow Cloud env
//    vars are read-only at runtime). It's kept in the TIKTOK_CACHE KV
//    namespace (see wrangler.json) under the key "refresh_token".
// 2. KV bindings are not available on import.meta.env -- that only carries
//    build-time/wrangler vars. They're reached via `cloudflare:workers`'s
//    `env`, which is why this file (unlike the rest of the codebase) does
//    NOT use import.meta.env for its secrets.
//
// The video list itself is cached in the same KV namespace for
// CACHE_TTL_SECONDS so a burst of homepage traffic doesn't spend the token
// refresh on every request -- TikTok also just rate-limits video.list hard
// enough that per-request calls would get throttled.
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const VIDEO_LIST_URL = 'https://open.tiktokapis.com/v2/video/list/';
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const VIDEO_FIELDS = 'id,embed_link,cover_image_url,title,create_time';

export interface TikTokVideo {
  id: string;
  embedLink: string;
  coverImageUrl: string;
  title: string;
  createTime: number;
}

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface TikTokEnv {
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  TIKTOK_CACHE?: KVLike;
}

async function refreshAccessToken(env: TikTokEnv, refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY!,
      client_secret: env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`TikTok token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  // Persist the ROTATED refresh token immediately. If this write is skipped
  // and the process dies before the next refresh, the old token TikTok just
  // invalidated is all that's left, and the integration needs to be
  // re-authorized by hand from scratch.
  await env.TIKTOK_CACHE!.put('refresh_token', data.refresh_token);
  return data.access_token;
}

async function fetchLatestVideos(accessToken: string, count: number): Promise<TikTokVideo[]> {
  const res = await fetch(`${VIDEO_LIST_URL}?fields=${VIDEO_FIELDS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: count }),
  });
  if (!res.ok) {
    throw new Error(`TikTok video.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: {
      videos: { id: string; embed_link: string; cover_image_url: string; title: string; create_time: number }[];
    };
  };
  return (data.data.videos ?? []).map((v) => ({
    id: v.id,
    embedLink: v.embed_link,
    coverImageUrl: v.cover_image_url,
    title: v.title,
    createTime: v.create_time,
  }));
}

// Returns null (never throws) when the integration isn't configured yet, or
// when TikTok's API is unreachable -- a broken TikTok call should never take
// the homepage down with it. Callers render a static fallback in that case.
export async function getLatestTikToks(env: TikTokEnv, count = 3): Promise<TikTokVideo[] | null> {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET || !env.TIKTOK_CACHE) {
    return null;
  }

  try {
    const cached = await env.TIKTOK_CACHE.get('videos_cache');
    if (cached) return JSON.parse(cached);

    const refreshToken = await env.TIKTOK_CACHE.get('refresh_token');
    if (!refreshToken) {
      console.error('[tiktok] no refresh_token in KV -- integration needs the one-time OAuth authorization run');
      return null;
    }

    const accessToken = await refreshAccessToken(env, refreshToken);
    const videos = await fetchLatestVideos(accessToken, count);
    await env.TIKTOK_CACHE.put('videos_cache', JSON.stringify(videos), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
    return videos;
  } catch (err) {
    console.error('[tiktok] getLatestTikToks failed', err);
    return null;
  }
}
