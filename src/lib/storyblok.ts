import StoryblokClient from 'storyblok-js-client';
import fieldCaseMap from '../../storyblok/field-case-map.json';

// Storyblok lowercases every schema field name server-side, regardless of
// the case it's created with -- so all our camelCase YAML field names
// (ctaLabel, menuOrder, siteName, ...) come back lowercased in content.
// This restores the original casing so templates can keep using the old
// YAML property names unchanged. See storyblok/field-case-map.json.
const FIELD_CASE_MAP: Record<string, string> = fieldCaseMap;

// Content Delivery API client -- read-only, safe to use at build/request
// time. Falls back to the "published" version unless STORYBLOK_DRAFT=1 is
// set (used by the visual editor preview / draft deploys later).
const client = new StoryblokClient({
  accessToken: import.meta.env.STORYBLOK_TOKEN,
});

// Draft by default in dev (nothing may be published yet), published by
// default in prod builds -- override either way with STORYBLOK_DRAFT.
const version =
  import.meta.env.STORYBLOK_DRAFT != null
    ? import.meta.env.STORYBLOK_DRAFT === 'true'
      ? 'draft'
      : 'published'
    : import.meta.env.DEV
      ? 'draft'
      : 'published';

// Strips Storyblok's bookkeeping keys (component/_uid) and flattens `bloks`
// fields built from a single `text_item` component back into a plain array
// of strings, so callers get roughly the same shape the old YAML content
// had. Fields that were a *singleton* nested object in the original YAML
// (e.g. `cta`, `social`) come back as a one-item array -- callers unwrap
// those explicitly with `[0]`, since that ambiguity can't be resolved
// generically (Storyblok has no "single nested object" field type, only
// arrays of bloks).
//
// `_editable` is kept (not stripped) -- it's the HTML comment Storyblok's
// bridge scans for to draw click-to-highlight outlines in the Visual
// Editor's preview pane. It's only present when fetched in draft mode, so
// it's absent (and a no-op) on normal published/production reads. Render it
// with the <Editable blok={...}> component right before a block's markup.
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

// A field that held a single nested object in the original YAML (e.g.
// `cta`, `social`) always comes back from Storyblok as a one-item array --
// there's no "single nested object" field type, only arrays of bloks. Call
// this on the known singleton field names after fetching a story to unwrap
// them back to plain objects; real lists are left untouched.
// Storyblok "asset" fields come back as an object like
// `{ filename: "https://a.storyblok.com/...", alt, id, ... }`, or `{}`/null
// when nothing has been picked yet. Older content migrated before the
// asset-field switchover may still hold a plain string (a local
// `/images/...` path) -- pass those through unchanged so nothing breaks
// until an editor re-picks the image in Storyblok. Returns undefined when
// there's no image at all, so callers can fall back to a placeholder.
// Resizes/re-encodes via Storyblok's built-in Image Service (free, CDN-cached
// -- just a URL suffix, no re-upload or separate service needed). `width` is
// required and should be the largest real render size for that call site
// (e.g. the desktop width of a product's own detail page, even if smaller
// crops of the same image are used elsewhere in cards/thumbnails); `height`
// defaults to `width` since editors are asked to upload 1:1 photos. Only
// applies to actual Storyblok assets (a.storyblok.com) -- legacy string
// paths (local /images/... or old Wix URLs from pre-migration content)
// pass through untouched since they can't be transformed this way.
export function imageUrl(
  field: any,
  opts?: { width: number; height?: number; quality?: number },
): string | undefined {
  if (!field) return undefined;
  const raw = typeof field === 'string' ? field : field.filename;
  if (!raw) return undefined;
  if (!opts || !raw.includes('a.storyblok.com')) return raw || undefined;
  const { width, height = width, quality = 80 } = opts;
  return `${raw}/m/${width}x${height}/filters:quality(${quality}):format(webp)`;
}

export function unwrapSingletons<T extends Record<string, any>>(obj: T, keys: string[]): T {
  for (const key of keys) {
    obj[key as keyof T] = ((obj[key] ?? [])[0] ?? {}) as any;
  }
  return obj;
}

function denormalizeObject(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'component' || key === '_uid') continue;
    out[FIELD_CASE_MAP[key] ?? key] = denormalize(value);
  }
  return out;
}

// Nav and Footer both call getSettings() independently, and several pages
// fetch it again themselves -- without caching, a single page load could
// fire the identical Storyblok request 2-3 times, multiplying the chance
// that a slow request pushes total render time past Cloudflare Workers'
// execution limit (the "Worker exceeded resource limits" hang). This caches
// the *raw* API response (pre-denormalize) for a short window, keyed by
// request path + version, and de-dupes concurrent in-flight requests for
// the same key. Callers still get a fresh `denormalize()` output each call
// -- never a shared object -- since `unwrapSingletons` mutates its input
// and different call sites unwrap different keys on the same story
// (e.g. Footer unwraps 'social'/'footer' out of the same settings object
// Nav reads 'logo'/'siteName' from).
const CACHE_TTL_MS = 30_000;
// Cloudflare kills a request that stalls rather than erroring it out, so a
// slow Storyblok fetch has to be preempted client-side well before that
// point -- 5s is generous for a CDN API call but far under where the
// Workers runtime gives up on the whole request as "hung".
const REQUEST_TIMEOUT_MS = 5_000;
const responseCache = new Map<string, { data: any; expires: number }>();
const inFlight = new Map<string, Promise<any>>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Storyblok request timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function cachedGet(path: string, params: Record<string, any>) {
  const key = `${path}?${JSON.stringify(params)}`;
  const cached = responseCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = withTimeout(client.get(path, params), REQUEST_TIMEOUT_MS).then(({ data }) => {
    responseCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    inFlight.delete(key);
    return data;
  }, (err) => {
    inFlight.delete(key);
    // A timed-out or failed fetch falls back to the last good response for
    // this key, however stale, rather than hanging or failing the whole
    // page -- an outdated page beats a dead one.
    if (cached) return cached.data;
    throw err;
  });
  inFlight.set(key, promise);
  return promise;
}

// A single story by full slug, e.g. "pages/home" or "locations/151-coffee-keller".
// On a cold cache with no fallback to serve, cachedGet's timeout still
// rejects -- letting that escape here would crash the whole page render
// with a bare 500 (as happened on Webflow Cloud when Storyblok itself was
// briefly unreachable). A page rendered with empty content and every
// template's existing `?? default` fallback text is far better than no
// page at all.
export async function getStory(slug: string) {
  try {
    const data = await cachedGet(`cdn/stories/${slug}`, { version });
    return denormalize(data.story.content);
  } catch (err) {
    console.error(`[storyblok] getStory(${slug}) failed, rendering with empty content:`, err);
    return {};
  }
}

// All stories under a folder, e.g. "drinks", "locations", "categories" --
// mirrors the old astro:content getCollection(name) shape (slug + content).
// Same fail-soft reasoning as getStory: an empty list degrades pages that
// list/redirect on missing entries instead of crashing the request.
export async function getStories(startsWith: string) {
  try {
    const data = await cachedGet('cdn/stories', {
      starts_with: `${startsWith}/`,
      version,
      per_page: 100,
    });
    return data.stories.map((story: any) => ({
      slug: story.slug,
      ...denormalize(story.content),
    }));
  } catch (err) {
    console.error(`[storyblok] getStories(${startsWith}) failed, rendering with empty list:`, err);
    return [];
  }
}

// Convenience wrappers matching the old astro:content call sites 1:1, so
// each file only needs its fetch line + import swapped.
export const getPage = (slug: string) => getStory(`pages/${slug}`);
export const getSettings = () => getStory('settings/global');
export const getDrinks = () => getStories('drinks');
export const getCategories = () => getStories('categories');
export const getLocations = () => getStories('locations');
export const getDrink = (slug: string) => getStory(`drinks/${slug}`);
export const getLocation = (slug: string) => getStory(`locations/${slug}`);
export const getCategoryBySlug = (slug: string) => getStory(`categories/${slug}`);
