import fieldCaseMap from '../../storyblok/field-case-map.json';
import snapshot from '../data/storyblok-snapshot.json';

// Production builds read content from the committed snapshot
// (src/data/storyblok-snapshot.json, written by storyblok/snapshot.mjs), because
// Webflow Cloud's network path to Storyblok is unreliable at build time.
// `astro dev` and the draft-preview deployment (STORYBLOK_DRAFT_MODE=true)
// read the live API so the Visual Editor shows unpublished edits.
const DRAFT_MODE = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
const USE_SNAPSHOT = !import.meta.env.DEV && !DRAFT_MODE;

// Storyblok lowercases field names; this restores the camelCase names the
// templates use.
const FIELD_CASE_MAP: Record<string, string> = fieldCaseMap;

// A plain fetch with a hard timeout rather than storyblok-js-client, whose
// timer-based rate limiting and retries can hang a Cloudflare Worker.
const API_BASE = 'https://api.storyblok.com/v2/cdn';
const REQUEST_TIMEOUT_MS = 4000;

// Draft content in dev and on the preview deployment, published otherwise.
// STORYBLOK_DRAFT can override this locally, but never on the preview
// deployment.
const version = DRAFT_MODE
  ? 'draft'
  : import.meta.env.STORYBLOK_DRAFT != null
    ? import.meta.env.STORYBLOK_DRAFT === 'true'
      ? 'draft'
      : 'published'
    : import.meta.env.DEV
      ? 'draft'
      : 'published';

async function sbFetch(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set('token', import.meta.env.STORYBLOK_TOKEN);
  url.searchParams.set('version', version);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // One retry, for timeouts and network errors only. An HTTP error from
  // Storyblok (a 404, say) won't change on a second try.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Storyblok ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && err.message.startsWith('Storyblok ')) throw err;
    }
  }
  throw lastErr;
}

// Drops Storyblok's component/_uid keys, restores field-name casing, and
// flattens lists of `text_item` bloks into plain string arrays. `_editable`
// is kept for the Visual Editor (see Editable.astro).
function denormalize(node: any): any {
  if (Array.isArray(node)) {
    if (node.length === 0) return [];
    const allBloks = node.every((v) => v && typeof v === 'object' && typeof v.component === 'string');
    if (allBloks && node[0].component === 'text_item') {
      return node.map((item) => item.value);
    }
    if (allBloks) {
      return node.map((item) => denormalizeObject(item));
    }
    return node.map(denormalize);
  }
  if (node && typeof node === 'object') {
    return denormalizeObject(node);
  }
  return node;
}

function denormalizeObject(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'component' || key === '_uid') continue;
    out[FIELD_CASE_MAP[key] ?? key] = denormalize(value);
  }
  return out;
}

// Storyblok image URL, resized and converted to WebP by its Image Service.
// Only Storyblok assets are accepted; anything else returns undefined so no
// broken <img> is rendered. `width` should be the largest size the image is
// displayed at; `height` defaults to `width` (product photos are square).
export function imageUrl(
  field: any,
  opts?: { width: number; height?: number; quality?: number },
): string | undefined {
  if (!field) return undefined;
  const raw = typeof field === 'string' ? field : field.filename;
  if (!raw || !raw.includes('a.storyblok.com')) return undefined;
  if (!opts) return raw;
  const { width, height = width, quality = 80 } = opts;
  return `${raw}/m/${width}x${height}/filters:quality(${quality}):format(webp)`;
}

// Any absolute media URL from a Storyblok field: an uploaded asset or a
// YouTube/Vimeo link (see HeroVideo.astro).
export function mediaUrl(field: any): string | undefined {
  if (!field) return undefined;
  const raw = typeof field === 'string' ? field : field.filename;
  if (!raw) return undefined;
  return /^https?:\/\//.test(raw) ? raw : undefined;
}

// Storyblok has no single nested object field, so a one-off group of fields
// (`hero`, `seo`, `social`...) arrives as a one-item array. Unwraps the named
// keys in place.
export function unwrapSingletons<T extends Record<string, any>>(obj: T, keys: string[]): T {
  for (const key of keys) {
    obj[key as keyof T] = ((obj[key] ?? [])[0] ?? {}) as any;
  }
  return obj;
}

// "151 Coffee Keller" -> "Keller".
export const shortStoreName = (name: string): string => String(name ?? '').replace(/^151 Coffee\s*/i, '') || name;

// A single story by full slug, e.g. "pages/home". On an API failure the
// snapshot copy is served (logged as stale) so a page never renders empty
// when it doesn't have to.
async function getStory(slug: string) {
  const fromSnapshot = (snapshot.stories as Record<string, any>)[slug];
  if (USE_SNAPSHOT) {
    if (!fromSnapshot) {
      console.error(`[storyblok] getStory(${slug}) missing from snapshot, rendering with empty content`);
      return {};
    }
    return denormalize(fromSnapshot);
  }
  try {
    const data = await sbFetch(`stories/${slug}`);
    return denormalize(data.story.content);
  } catch (err) {
    if (fromSnapshot) {
      console.error(`[storyblok] getStory(${slug}) failed, serving stale snapshot content:`, err);
      return denormalize(fromSnapshot);
    }
    console.error(`[storyblok] getStory(${slug}) failed with no snapshot fallback, rendering empty:`, err);
    return {};
  }
}

// Every story in a folder, e.g. "locations". `uuid` is included because
// reference fields from the live API hold UUIDs rather than slugs.
async function getStories(folder: string) {
  const fromSnapshot = (snapshot.collections as Record<string, any[]>)[folder];
  const shape = (story: any) => ({ slug: story.slug, uuid: story.uuid, ...denormalize(story.content) });
  if (USE_SNAPSHOT) {
    if (!fromSnapshot) {
      console.error(`[storyblok] getStories(${folder}) missing from snapshot, rendering with empty list`);
      return [];
    }
    return fromSnapshot.map(shape);
  }
  try {
    const data = await sbFetch('stories', { starts_with: `${folder}/`, per_page: 100 });
    return data.stories.map(shape);
  } catch (err) {
    if (fromSnapshot) {
      console.error(`[storyblok] getStories(${folder}) failed, serving stale snapshot list:`, err);
      return fromSnapshot.map(shape);
    }
    console.error(`[storyblok] getStories(${folder}) failed with no snapshot fallback, rendering empty:`, err);
    return [];
  }
}

// Rooftop coordinates for stores whose Storyblok lat/lng are wrong.
const LOCATION_COORD_OVERRIDES: Record<string, { lat: string; lng: string }> = {
  '151-coffee-alliance': { lat: '32.9074565', lng: '-97.3181033' },
  '151-coffee-westworth-village': { lat: '32.7551122', lng: '-97.4288334' },
};

export const getPage = (slug: string) => getStory(`pages/${slug}`);
export const getSettings = () => getStory('settings/global');
// Menu items (drinks and food) live in the "products" folder.
export const getDrinks = () => getStories('products');
export const getCategories = () => getStories('categories');
export const getLocations = async () =>
  (await getStories('locations')).map((location: any) => ({
    ...location,
    ...LOCATION_COORD_OVERRIDES[location.slug],
  }));
// Promo landing pages served at /<slug> (src/pages/[slug].astro).
export const getLandingPages = () => getStories('landing-pages');
