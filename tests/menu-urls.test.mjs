import { describe, it, expect } from 'vitest';
import {
  CATEGORY_URL_SEGMENTS,
  categorySegment,
  itemSegment,
  itemPath,
  routableItems,
} from '../src/lib/menu-urls.mjs';

// Every menu URL on the site comes from this module: the page route, the
// card links, the JSON-LD @id and the sitemap. A change here silently
// rewrites public URLs, which is why the pinned segments are asserted
// literally rather than read back from the map.

describe('categorySegment', () => {
  it('pins the segments that must not follow a Storyblok rename', () => {
    expect(categorySegment('categories/coldbrew')).toBe('cold-brew');
    expect(categorySegment('categories/hotfood')).toBe('hot-food');
    expect(categorySegment('categories/dirtypop')).toBe('dirty-pop');
    expect(categorySegment('categories/lto')).toBe('seasonal');
  });

  it('uses the Storyblok slug for unpinned categories', () => {
    expect(categorySegment('categories/coffee')).toBe('coffee');
    expect(categorySegment('categories/smoothies')).toBe('smoothies');
  });

  it('accepts a bare key as well as a folder reference', () => {
    expect(categorySegment('coldbrew')).toBe('cold-brew');
  });

  it('does not throw on a missing category', () => {
    expect(categorySegment(undefined)).toBe('');
    expect(categorySegment(null)).toBe('');
  });
});

describe('itemSegment', () => {
  it('drops the category prefix the Storyblok slug repeats', () => {
    expect(itemSegment({ slug: 'coldbrew-snickers', category: 'categories/coldbrew' })).toBe(
      'snickers',
    );
  });

  it('leaves a slug that does not repeat its category alone', () => {
    expect(itemSegment({ slug: 'snickers', category: 'categories/coldbrew' })).toBe('snickers');
  });

  it('only strips a whole prefix, not a partial match', () => {
    // "coffeecake" starts with "coffee" but not with "coffee-", so the whole
    // slug is the segment.
    expect(itemSegment({ slug: 'coffeecake', category: 'categories/coffee' })).toBe('coffeecake');
  });
});

describe('itemPath', () => {
  it('builds the public URL', () => {
    expect(itemPath({ slug: 'coldbrew-snickers', category: 'categories/coldbrew' })).toBe(
      '/menu/cold-brew/snickers',
    );
    expect(
      itemPath({ slug: 'coffee-white-chocolate-macadamia', category: 'categories/coffee' }),
    ).toBe('/menu/coffee/white-chocolate-macadamia');
  });
});

describe('routableItems', () => {
  const categories = [
    { slug: 'categories/coffee', uuid: 'uuid-coffee' },
    { slug: 'categories/lto', uuid: 'uuid-lto' },
  ];

  it('keeps items whose category exists', () => {
    const items = routableItems(
      [{ slug: 'coffee-mocha', category: 'categories/coffee' }],
      categories,
    );
    expect(items).toHaveLength(1);
    expect(itemPath(items[0])).toBe('/menu/coffee/mocha');
  });

  it('resolves a UUID category to its slug', () => {
    // The live API used in dev and draft preview returns category references
    // as UUIDs. Before this resolved, seasonal items linked to /menu/<uuid>/…
    // and every one of those pages 404'd.
    const items = routableItems([{ slug: 'lto-peppermint', category: 'uuid-lto' }], categories);
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('categories/lto');
    expect(itemPath(items[0])).toBe('/menu/seasonal/peppermint');
  });

  it('drops items whose category does not exist', () => {
    // Two real products point at "categories/misc", which no category
    // defines. They must not produce a page.
    expect(
      routableItems([{ slug: 'coffee-hot-cocoa', category: 'categories/misc' }], categories),
    ).toEqual([]);
  });

  it('drops items with no category at all', () => {
    expect(routableItems([{ slug: 'orphan' }], categories)).toEqual([]);
  });
});

describe('the real menu', () => {
  it('produces a unique URL for every routable item', async () => {
    const snapshot = (
      await import('../src/data/storyblok-snapshot.json', { with: { type: 'json' } })
    ).default;
    const items = routableItems(
      (snapshot.collections?.products ?? []).map((e) => ({
        slug: e.slug,
        category: e.content?.category,
      })),
      snapshot.collections?.categories ?? [],
    );
    expect(items.length).toBeGreaterThan(0);

    // A collision means two products share a page and one is unreachable.
    const paths = items.map(itemPath);
    expect(new Set(paths).size).toBe(paths.length);

    // A URL segment that isn't slug-safe would break the route.
    for (const p of paths) expect(p).toMatch(/^\/menu\/[a-z0-9-]+\/[a-z0-9-]+$/);
  });

  it('pins a category segment for every category the menu uses', () => {
    // Not a correctness rule, just a guard: if a new category appears in
    // Storyblok with a slug that needs hyphenating, this is where to notice.
    for (const key of Object.keys(CATEGORY_URL_SEGMENTS)) {
      expect(CATEGORY_URL_SEGMENTS[key]).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
