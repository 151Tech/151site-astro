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
export function imageUrl(field: any): string | undefined {
  if (!field) return undefined;
  if (typeof field === 'string') return field || undefined;
  return field.filename || undefined;
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
export async function getStory(slug: string) {
  const { data } = await client.get(`cdn/stories/${slug}`, { version });
  return denormalize(data.story.content);
}

// All stories under a folder, e.g. "drinks", "locations", "categories" --
// mirrors the old astro:content getCollection(name) shape (slug + content).
export async function getStories(startsWith: string) {
  const { data } = await client.get('cdn/stories', {
    starts_with: `${startsWith}/`,
    version,
    per_page: 100,
  });
  return data.stories.map((story: any) => ({
    slug: story.slug,
    ...denormalize(story.content),
  }));
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
