import { describe, it, expect } from 'vitest';
import snapshot from '../src/data/storyblok-snapshot.json';
import landmarks from '../src/data/nearby-landmarks.json';
import amenities from '../src/data/store-amenities.json';
import crossStreets from '../src/data/store-cross-streets.json';

// The three JSON files under src/data are maintained by hand, keyed by store
// slug, while the store list itself comes from Storyblok. Nothing at build
// time connects the two: a store added or renamed in the CMS just silently
// loses its landmarks, amenities and cross streets, and a mistyped slug in
// one of these files is dead data that never renders. That's the failure
// these tests exist to catch, since the page still builds either way.

const storeSlugs = (snapshot.collections?.locations ?? []).map((l: any) => l.slug).sort();

// `_comment` documents the file for whoever edits it next and isn't a store.
const keysOf = (data: object) =>
  Object.keys(data)
    .filter((k) => !k.startsWith('_'))
    .sort();

const FILES: [string, object][] = [
  ['nearby-landmarks.json', landmarks],
  ['store-amenities.json', amenities],
  ['store-cross-streets.json', crossStreets],
];

describe('per-store data files', () => {
  it('the snapshot has stores to check against', () => {
    // Guards the tests below: an empty or restructured snapshot would make
    // every "no unknown slugs" assertion vacuously pass.
    expect(storeSlugs.length).toBeGreaterThan(0);
  });

  describe.each(FILES)('%s', (_name, data) => {
    const keys = keysOf(data);

    it('has an entry for every store in Storyblok', () => {
      expect(storeSlugs.filter((s) => !keys.includes(s))).toEqual([]);
    });

    it('has no entry for a store that does not exist', () => {
      expect(keys.filter((k) => !storeSlugs.includes(k))).toEqual([]);
    });
  });
});

describe('nearby landmarks', () => {
  const entries = Object.entries(landmarks).filter(([k]) => !k.startsWith('_')) as [
    string,
    string[],
  ][];

  it.each(entries)('%s has exactly three landmarks', (_slug, names) => {
    // The location page renders three rows and the printed sheet has three
    // bullets. Fewer leaves a gap in the panel; more silently never shows.
    expect(names).toHaveLength(3);
  });

  it.each(entries)('%s has usable, distinct names', (_slug, names) => {
    for (const name of names) {
      expect(typeof name).toBe('string');
      expect(name.trim()).toBe(name);
      expect(name.length).toBeGreaterThan(0);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('store coordinates', () => {
  // Every landmark link is built from the store's lat/lng, so a missing or
  // malformed coordinate produces a link to the middle of the ocean rather
  // than a visible error.
  it.each((snapshot.collections?.locations ?? []).map((l: any) => [l.slug, l]))(
    '%s has coordinates in the continental US',
    (_slug, loc: any) => {
      const lat = Number(loc.content?.lat);
      const lng = Number(loc.content?.lng);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
      expect(lat).toBeGreaterThan(24);
      expect(lat).toBeLessThan(50);
      expect(lng).toBeGreaterThan(-125);
      expect(lng).toBeLessThan(-66);
    },
  );
});
