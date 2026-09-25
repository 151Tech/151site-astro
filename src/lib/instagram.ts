// Fetches the 3 most recent public @151coffee Instagram videos/reels via
// Meta's Instagram API with Instagram Login (the current Graph API surface
// for a single business account) - not scraping. See the setup checklist in
// storyblok/instagram-setup.md for the one-time, human-only steps this
// depends on: converting @151coffee to a Business/Creator account, creating
// a Meta developer app, adding @151coffee as an Instagram tester, and
// authorizing it once.
//
// Two things make this stateful in a way most of this codebase isn't:
//
// 1. The access token is long-lived (~60 days) but still expires, and has to
// be refreshed before it does - via a scheduled job (see
//    src/pages/api/instagram-token-refresh.ts), not on every request. So the
//    current token has to be persisted somewhere the Worker can both read
//    and write, which rules out a plain env var (Webflow Cloud env vars are
//    read-only at runtime). It's kept in the INSTAGRAM_CACHE KV namespace
//    (see wrangler.json) under the key "access_token".
// 2. KV bindings are not available on import.meta.env - that only carries
//    build-time/wrangler vars. They're reached via `cloudflare:workers`'s
//    `env`, which is why this file (unlike the rest of the codebase) does
//    NOT use import.meta.env for its secrets.
//
// The media list itself is cached in the same KV namespace for
// CACHE_TTL_SECONDS so a burst of homepage traffic doesn't spend a Graph API
// call on every request.
const MEDIA_URL = 'https://graph.instagram.com/me/media';
// Short enough that a new reel shows up while it's still news. The edge
// cache (see src/middleware.ts) absorbs the actual homepage traffic, so this
// only governs how often one Worker request goes out to Instagram - roughly
// 288 calls/day, nowhere near any rate limit.
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
// Versioned so a deploy that changes what gets cached retires the old
// entries immediately, rather than serving them for up to an hour. v2 added
// videoUrl; v3 narrowed the list to videos/reels only.
const MEDIA_CACHE_KEY = 'media_cache_v3';
const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
// How many recent posts to scan when looking for videos/reels (see
// fetchLatestMedia). One page, one API call - the account would have to post
// 25 non-video items in a row before the carousel came up short.
const SCAN_LIMIT = 25;

export interface InstagramMedia {
  id: string;
  permalink: string;
  /** Still frame: a video's cover image, or the photo itself for an image post. */
  mediaUrl: string;
  /** Playable source, present only for videos/reels. */
  videoUrl?: string;
  caption: string;
  timestamp: string;
}

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface InstagramEnv {
  INSTAGRAM_CACHE?: KVLike;
}

async function fetchLatestMedia(accessToken: string, count: number): Promise<InstagramMedia[]> {
  // The carousel is a video feature - a photo post there renders as a static
  // card with a play triangle that does nothing. So rather than asking for the
  // newest `count` posts of any kind, ask for a larger recent window and keep
  // only the videos/reels from it. The window is what caps how far back a
  // quiet stretch of photo posts can reach: if there aren't `count` videos
  // among the last SCAN_LIMIT posts, the carousel simply shows fewer.
  const url = `${MEDIA_URL}?fields=${MEDIA_FIELDS}&limit=${SCAN_LIMIT}&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Instagram media fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: {
      id: string;
      caption?: string;
      media_type: string;
      media_url: string;
      thumbnail_url?: string;
      permalink: string;
      timestamp: string;
    }[];
  };
  return (data.data ?? [])
    .filter((m) => m.media_type === 'VIDEO' || m.media_type === 'REELS')
    .slice(0, count)
    .map((m) => ({
      id: m.id,
      permalink: m.permalink,
      // media_url is the playable file; thumbnail_url is the cover frame Meta
      // generates for it, used as the poster while the video loads.
      mediaUrl: m.thumbnail_url ?? m.media_url,
      videoUrl: m.media_url,
      caption: m.caption ?? '',
      timestamp: m.timestamp,
    }));
}

// Returns null (never throws) when the integration isn't configured yet, or
// when Instagram's API is unreachable - a broken Instagram call should
// never take the homepage down with it. Callers render a static fallback in
// that case.
export async function getLatestInstagramMedia(env: InstagramEnv, count = 3): Promise<InstagramMedia[] | null> {
  if (!env.INSTAGRAM_CACHE) {
    return null;
  }

  try {
    const cached = await env.INSTAGRAM_CACHE.get(MEDIA_CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const accessToken = await env.INSTAGRAM_CACHE.get('access_token');
    if (!accessToken) {
      console.error('[instagram] no access_token in KV - integration needs the one-time OAuth authorization run');
      return null;
    }

    const media = await fetchLatestMedia(accessToken, count);
    await env.INSTAGRAM_CACHE.put(MEDIA_CACHE_KEY, JSON.stringify(media), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
    return media;
  } catch (err) {
    console.error('[instagram] getLatestInstagramMedia failed', err);
    return null;
  }
}
