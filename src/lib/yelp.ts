// Live aggregate star ratings per store, from Yelp's Fusion API (Business
// Details endpoint -- https://api.yelp.com/v3/businesses/{id}, where {id}
// accepts a business alias as well as a numeric id). Only the aggregate
// rating + review count are used, never individual review text: Yelp's free
// tier only returns 3 review snippets Yelp itself selects (not filterable,
// not sortable, could include a bad one) -- an aggregate score has none of
// that risk and needs no curation.
//
// The Yelp alias per store isn't stored in Storyblok (it's a static mapping
// below, not editable content) -- every one of the 15 stores was manually
// confirmed to have a real, matching Yelp business page before this was
// built at all. If a new store opens, its alias needs adding here before a
// rating will show for it; until then getYelpRating just returns null for
// that slug, same as any other lookup miss.
//
// CACHE_TTL_SECONDS enforces "pulls once a day" -- the account's Yelp plan
// caps out at 300 calls/day total, so even at 15 stores this leaves a wide
// margin. Each store's rating is cached under its own KV key so one store's
// cache expiring doesn't force-refetch the other 14.
const API_BASE = 'https://api.yelp.com/v3/businesses';
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// locations.astro slug (src/pages/locations/[slug].astro route) -> Yelp
// business alias (the last path segment of yelp.com/biz/<alias>). Verified
// by hand against each store's phone number and street address.
export const YELP_ALIASES: Record<string, string> = {
  '151-coffee-westworth-village': '151-coffee-westworth-village',
  '151-coffee-the-colony': '151-coffee-the-colony',
  '151-coffee-rowlett': '151-coffee-rowlett-2',
  '151-coffee-roanoke': '151-coffee-roanoke',
  '151-coffee-plano': '151-coffee-plano-4',
  '151-coffee-overland-park': '151-coffee-overland-park-2',
  '151-coffee-north-richland-hills': '151-coffee-north-richland-hills-2',
  '151-coffee-manhattan': '151-coffee-manhattan-2',
  '151-coffee-lewisville': '151-coffee-lewisville-2',
  '151-coffee-lawrence': '151-coffee-no-title',
  '151-coffee-keller': '151-coffee-keller-3',
  '151-coffee-flower-mound': '151-coffee-flower-mound-flower-mound-2',
  '151-coffee-coppell': '151-coffee-coppell',
  '151-coffee-burleson': '151-coffee-burleson',
  '151-coffee-alliance': '151-coffee-fort-worth-2',
};

export interface YelpRating {
  rating: number;
  reviewCount: number;
  url: string;
}

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface YelpEnv {
  YELP_API_KEY?: string;
  YELP_CACHE?: KVLike;
}

async function fetchOne(env: YelpEnv, alias: string): Promise<YelpRating | null> {
  const res = await fetch(`${API_BASE}/${alias}`, {
    headers: { Authorization: `Bearer ${env.YELP_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Yelp business lookup failed for "${alias}": ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { rating: number; review_count: number; url: string };
  return { rating: data.rating, reviewCount: data.review_count, url: data.url };
}

// Never throws -- a broken/unconfigured Yelp integration should never take a
// locations page down with it. Returns null for any slug it can't resolve
// (unmapped store, this-store's fetch failed, or Yelp isn't configured at
// all), so callers just skip rendering a badge in that case.
export async function getYelpRating(env: YelpEnv, locationSlug: string): Promise<YelpRating | null> {
  const alias = YELP_ALIASES[locationSlug];
  if (!alias || !env.YELP_API_KEY || !env.YELP_CACHE) return null;

  const cacheKey = `yelp:${alias}`;
  try {
    const cached = await env.YELP_CACHE.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const rating = await fetchOne(env, alias);
    await env.YELP_CACHE.put(cacheKey, JSON.stringify(rating), { expirationTtl: CACHE_TTL_SECONDS });
    return rating;
  } catch (err) {
    console.error('[yelp] getYelpRating failed', err);
    return null;
  }
}

// Batch form for pages that need every store's rating at once (the /locations
// list). Runs the per-store lookups concurrently -- each one independently
// hits its own KV cache key first, so this is only ever slow on a cold cache.
export async function getYelpRatings(env: YelpEnv, locationSlugs: string[]): Promise<Record<string, YelpRating | null>> {
  const entries = await Promise.all(
    locationSlugs.map(async (slug) => [slug, await getYelpRating(env, slug)] as const)
  );
  return Object.fromEntries(entries);
}
