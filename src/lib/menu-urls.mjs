// A menu item's public URL: /menu/<category>/<item>.
//
// Plain .mjs so astro.config.mjs can use it for the sitemap. Every page,
// link, schema @id and sitemap entry goes through itemPath(). Category
// segments are pinned here so renaming a category in Storyblok doesn't change
// its URLs; unlisted categories use their Storyblok slug.
export const CATEGORY_URL_SEGMENTS = {
  coldbrew: 'cold-brew',
  hotfood: 'hot-food',
  dirtypop: 'dirty-pop',
  lto: 'seasonal',
};

// "categories/coldbrew" (a drink's category reference) or "coldbrew".
const categoryKey = (ref) => String(ref ?? '').replace(/^categories\//, '');

export const categorySegment = (ref) => {
  const key = categoryKey(ref);
  return CATEGORY_URL_SEGMENTS[key] ?? key;
};

// Storyblok slugs repeat the category ("coldbrew-snickers"); the category is
// already in the path, so it's dropped: /menu/cold-brew/snickers.
export const itemSegment = (drink) => {
  const key = categoryKey(drink.category);
  return key && drink.slug.startsWith(`${key}-`) ? drink.slug.slice(key.length + 1) : drink.slug;
};

export const itemPath = (drink) => `/menu/${categorySegment(drink.category)}/${itemSegment(drink)}`;

// Only items whose category exists get a page. The live API (dev, draft
// preview) returns category references as UUIDs, while the snapshot stores
// "categories/<slug>"; both are resolved to the slug form here.
export const routableItems = (drinks, categories) => {
  const byKey = new Map();
  for (const c of categories) {
    const key = categoryKey(c.slug);
    byKey.set(key, key);
    if (c.uuid) byKey.set(c.uuid, key);
  }
  return drinks.flatMap((d) => {
    const key = byKey.get(categoryKey(d.category));
    return key ? [{ ...d, category: `categories/${key}` }] : [];
  });
};
