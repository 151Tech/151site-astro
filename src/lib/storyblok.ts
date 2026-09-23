import fieldCaseMap from '../../storyblok/field-case-map.json';
import snapshot from '../data/storyblok-snapshot.json';

// Webflow Cloud's sandboxed network path to Storyblok is unreliable enough
// (build-time hangs, request timeouts, and a hard `caches.default` denial)
// that production reads content from a build-time snapshot committed by
// .github/workflows/storyblok-rebuild.yml (see storyblok/snapshot.mjs)
// instead of ever calling the live API. Local `astro dev` still hits the
// live API directly below, since that's what the Storyblok Visual Editor's
// draft preview needs.
// The draft-preview deployment (the `preview` branch, on its own Webflow
// Cloud app) sets STORYBLOK_DRAFT_MODE=true and renders live draft content
// per request instead. That's what the Visual Editor's preview pane needs:
// its bridge reloads the iframe on save, and reloading a prebuilt static
// page just re-serves the same HTML.
const DRAFT_MODE = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
const USE_SNAPSHOT = !import.meta.env.DEV && !DRAFT_MODE;

// Storyblok lowercases every schema field name server-side, regardless of
// the case it's created with, so all our camelCase YAML field names
// (ctaLabel, menuOrder, siteName, ...) come back lowercased in content.
// This restores the original casing so templates can keep using the old
// YAML property names unchanged. See storyblok/field-case-map.json.
const FIELD_CASE_MAP: Record<string, string> = fieldCaseMap;

// Deliberately a plain fetch instead of storyblok-js-client. On the preview
// deployment the client hung the Worker outright ("detected that your
// Worker's code had hung and would never generate a response"), because
// three of its defaults are hostile to the Workers runtime:
//
//   1. It throttles to 5 requests/second using a setTimeout queue. Workers
//      only advance timers while I/O is pending, so a request parked in
//      that queue behind the rate limit can wait forever. Our busiest page
//      (menu) issues 4 calls, which sits right on the limit -- exactly why
//      this failed intermittently rather than every time.
//   2. Its request timeout is opt-in (`this.timeout && setTimeout(...)`)
//      and we never set it, so a stalled connection had nothing to abort it.
//   3. maxRetries defaults to 10 with a 300ms timer-based backoff, so a
//      flaky call compounds all of the above.
//
// A bare fetch with an AbortSignal has none of that machinery: one request,
// one hard deadline, no queue and no timers of its own.
const API_BASE = 'https://api.storyblok.com/v2/cdn';

// Comfortably above a healthy response, far below the Worker's own limit,
// so a slow call surfaces as the fallback below rather than as a hang.
const REQUEST_TIMEOUT_MS = 4000;

async function sbFetch(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set('token', import.meta.env.STORYBLOK_TOKEN);
  url.searchParams.set('version', version);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // One retry only, and only for a timeout or network error: Storyblok
  // returning 404 means the story genuinely isn't there and retrying just
  // spends the request budget twice before failing the same way.
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

// Draft by default in dev (nothing may be published yet) and on the draft
// preview deployment, published by default in prod builds. STORYBLOK_DRAFT
// still overrides for one-off local runs, but deliberately CANNOT override
// DRAFT_MODE: the two names are close enough to copy across by mistake, and
// a stray STORYBLOK_DRAFT=false on the preview app would otherwise serve
// published content from a deployment whose entire purpose is showing
// unpublished edits -- a failure that looks like nothing being wrong at all.
const version = DRAFT_MODE
  ? 'draft'
  : import.meta.env.STORYBLOK_DRAFT != null
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
// (e.g. `cta`, `social`) come back as a one-item array. Callers unwrap
// those explicitly with `[0]`, since that ambiguity can't be resolved
// generically (Storyblok has no "single nested object" field type, only
// arrays of bloks).
//
// `_editable` is kept (not stripped): it's the HTML comment Storyblok's
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
// `cta`, `social`) always comes back from Storyblok as a one-item array:
// there's no "single nested object" field type, only arrays of bloks. Call
// this on the known singleton field names after fetching a story to unwrap
// them back to plain objects; real lists are left untouched.
// Storyblok "asset" fields come back as an object like
// `{ filename: "https://a.storyblok.com/...", alt, id, ... }`, or `{}`/null
// when nothing has been picked yet.
//
// Every image on the site comes from Storyblok, by policy: no media is
// hardcoded in the templates or CSS any more. So this deliberately only
// honours real Storyblok assets and returns undefined for anything else.
// Pre-migration content still holds a lot of legacy strings -- local
// `/images/foo.webp` paths and absolute `https://www.151coffee.com/images/...`
// URLs -- and none of those files exist in this repo, so passing them
// through only ever produced a broken <img>. Dropping them instead means a
// drink with no Storyblok photo renders no image element at all, and it
// stays that way through the content rebuilds that regenerate
// src/data/storyblok-snapshot.json (a fix applied to the snapshot itself
// gets overwritten by the next publish; a rule here does not).
//
// Resizes/re-encodes via Storyblok's built-in Image Service (free, CDN-cached,
// just a URL suffix, no re-upload or separate service needed). `width` is
// required and should be the largest real render size for that call site
// (e.g. the desktop width of a product's own detail page, even if smaller
// crops of the same image are used elsewhere in cards/thumbnails); `height`
// defaults to `width` since editors are asked to upload 1:1 photos.
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

// Hero backgrounds are the one media field that legitimately points off-site:
// the editor pastes a YouTube or Vimeo link (see HeroVideo.astro) as often as
// they pick an uploaded file. Those can't go through imageUrl's
// Storyblok-only rule, and they can't be transformed by the Image Service
// either, so they get their own passthrough. Still no hardcoded paths: the
// value always comes from a Storyblok field, this just doesn't insist the
// asset be hosted there.
export function mediaUrl(field: any): string | undefined {
  if (!field) return undefined;
  const raw = typeof field === 'string' ? field : field.filename;
  if (!raw) return undefined;
  // A bare local path is always pre-migration debris; only real URLs and
  // Storyblok assets are usable.
  return /^https?:\/\//.test(raw) ? raw : undefined;
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

// A single story by full slug, e.g. "pages/home" or "locations/151-coffee-keller".
// In production this always reads USE_SNAPSHOT's committed JSON (see above),
// so the sbFetch() call below only ever runs in local `astro dev`
// against the live API, for Visual Editor draft preview.
export async function getStory(slug: string) {
  if (USE_SNAPSHOT) {
    const content = (snapshot.stories as Record<string, any>)[slug];
    if (!content) {
      console.error(`[storyblok] getStory(${slug}) missing from snapshot, rendering with empty content`);
      return {};
    }
    return denormalize(content);
  }
  try {
    const data = await sbFetch(`stories/${slug}`);
    return denormalize(data.story.content);
  } catch (err) {
    // The committed snapshot is a strictly better degraded state than an
    // empty page: on the preview deployment it means a slow API shows the
    // last published version of the story instead of a blank layout. It is
    // stale by definition, so say so loudly rather than let a silently
    // out-of-date preview get mistaken for a working one.
    const fallback = (snapshot.stories as Record<string, any>)[slug];
    if (fallback) {
      console.error(`[storyblok] getStory(${slug}) failed, serving STALE snapshot content:`, err);
      return denormalize(fallback);
    }
    console.error(`[storyblok] getStory(${slug}) failed with no snapshot fallback, rendering empty:`, err);
    return {};
  }
}

// All stories under a folder, e.g. "drinks", "locations", "categories".
// Mirrors the old astro:content getCollection(name) shape (slug + content).
// Same fail-soft reasoning as getStory: an empty list degrades pages that
// list/redirect on missing entries instead of crashing the request.
export async function getStories(startsWith: string) {
  if (USE_SNAPSHOT) {
    const entries = (snapshot.collections as Record<string, any[]>)[startsWith];
    if (!entries) {
      console.error(`[storyblok] getStories(${startsWith}) missing from snapshot, rendering with empty list`);
      return [];
    }
    return entries.map((story: any) => ({ slug: story.slug, ...denormalize(story.content) }));
  }
  try {
    const data = await sbFetch('stories', {
      starts_with: `${startsWith}/`,
      per_page: 100,
    });
    return data.stories.map((story: any) => ({
      slug: story.slug,
      ...denormalize(story.content),
    }));
  } catch (err) {
    const fallback = (snapshot.collections as Record<string, any[]>)[startsWith];
    if (fallback) {
      console.error(`[storyblok] getStories(${startsWith}) failed, serving STALE snapshot list:`, err);
      return fallback.map((story: any) => ({ slug: story.slug, ...denormalize(story.content) }));
    }
    console.error(`[storyblok] getStories(${startsWith}) failed with no snapshot fallback, rendering empty:`, err);
    return [];
  }
}

// Storyblok's own lat/lng fields for these two stores are wrong (each was
// verified against the real street address's rooftop-level geocode -- see
// git history) and editing them in the CMS hasn't stuck across two publish
// attempts. Coordinates for a physical store don't change once it's open,
// so this overrides them at read time rather than fighting the CMS again.
const LOCATION_COORD_OVERRIDES: Record<string, { lat: string; lng: string }> = {
  '151-coffee-alliance': { lat: '32.9074565', lng: '-97.3181033' },
  '151-coffee-westworth-village': { lat: '32.7551122', lng: '-97.4288334' },
};

function withCoordOverride<T>(slug: string, location: T): T {
  const override = LOCATION_COORD_OVERRIDES[slug];
  return override ? { ...location, ...override } : location;
}

// Convenience wrappers matching the old astro:content call sites 1:1, so
// each file only needs its fetch line + import swapped.
export const getPage = (slug: string) => getStory(`pages/${slug}`);
export const getSettings = () => getStory('settings/global');
// Storyblok folder is "products" (renamed from "drinks" since it holds food
// items too, not just drinks) -- these wrapper names stay as-is since every
// call site already reads getDrinks()/getDrink() and the public /drinks/
// site URL is unaffected.
export const getDrinks = () => getStories('products');
export const getCategories = () => getStories('categories');
export const getLocations = async () =>
  (await getStories('locations')).map((location) => withCoordOverride(location.slug, location));
export const getDrink = (slug: string) => getStory(`products/${slug}`);
export const getLocation = async (slug: string) => withCoordOverride(slug, await getStory(`locations/${slug}`));
export const getCategoryBySlug = (slug: string) => getStory(`categories/${slug}`);
