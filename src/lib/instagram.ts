// The latest public @151coffee videos and reels, from Meta's Instagram API
// with Instagram Login. One-time setup: storyblok/instagram-setup.md.
//
// The long-lived access token (about 60 days) is refreshed on a schedule by
// src/pages/api/instagram-token-refresh.ts and stored in the INSTAGRAM_CACHE
// KV namespace (see wrangler.json) under "access_token", because env vars are
// read-only at runtime. KV bindings come from `cloudflare:workers`, not
// import.meta.env. The media list is cached in the same namespace.
const MEDIA_URL = 'https://graph.instagram.com/me/media';
// Five minutes: new reels appear quickly, and the edge cache absorbs most
// homepage traffic.
const CACHE_TTL_SECONDS = 5 * 60;
// Bump the version when the cached shape changes so old entries are ignored.
const MEDIA_CACHE_KEY = 'media_cache_v3';
const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
// Recent posts scanned for videos and reels, in one API call.
const SCAN_LIMIT = 25;

export interface InstagramMedia {
  id: string;
  permalink: string;
  // Still frame: a video's cover or the photo itself.
  mediaUrl: string;
  // Playable source, for videos and reels only.
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
  // The carousel only plays videos, so scan the recent posts and keep the
  // videos and reels. If fewer than `count` turn up, the carousel shows
  // fewer.
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
      // thumbnail_url is the cover frame, used as the poster.
      mediaUrl: m.thumbnail_url ?? m.media_url,
      videoUrl: m.media_url,
      caption: m.caption ?? '',
      timestamp: m.timestamp,
    }));
}

// Returns null (never throws) when the integration isn't configured or
// Instagram is unreachable; callers render a fallback.
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
