import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const drinks = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: 'src/content/drinks' }),
  schema: z.object({
    name: z.string(),
    category: z.string().optional().default(''),
    subtitle: z.string().optional().default(''),
    description: z.string().optional().default(''),
    image: z.string().optional().default(''),
    badge: z.string().optional().default(''),
    tags: z.preprocess((v) => (v == null ? [] : v), z.array(z.string())).default([]),
    menuOrder: z.number().optional().default(99),
    // References to Location entries where this drink is NOT available.
    // Empty (the default) means available at every location, including any
    // opened later -- editors only need to touch this for the exceptions.
    unavailableAt: z.preprocess((v) => (v == null ? [] : v), z.array(z.string())).default([]),
  }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: 'src/content/categories' }),
  schema: z.object({
    title: z.string(),
    number: z.string().optional().default('99'),
    description: z.string().optional().default(''),
    // Free-form "also available: ..." style cards shown at the end of this
    // category's row on the menu page (e.g. the plain-soda list on Dirty
    // Pop). Editable and addable per-category in the Visual Editor.
    extraCards: z.preprocess((v) => (v == null ? [] : v), z.array(z.object({
      label: z.string().optional().default(''),
      items: z.preprocess((v) => (v == null ? [] : v), z.array(z.string())).default([]),
    }))).default([]),
    // Mirrors Drink.unavailableAt, but at the whole-category level (e.g. a
    // store with no kitchen can hide Hot Food entirely).
    unavailableAt: z.preprocess((v) => (v == null ? [] : v), z.array(z.string())).default([]),
    // If true, this category is hidden on the default (no location picked)
    // menu view -- it only appears once a visitor selects a location that
    // doesn't have it in `unavailableAt`. Used for Hot Food / Treats, which
    // aren't served at every store.
    hiddenByDefault: z.boolean().optional().default(false),
  }),
});

const locations = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: 'src/content/locations' }),
  schema: z.object({
    name: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    lat: z.number(),
    lng: z.number(),
    displayOrder: z.number().optional().default(99),
    image: z.string().optional().default(''),
    // Leave blank to fall back to the sitewide hours in Settings > Global.
    hours: z.string().optional().default(''),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: 'src/content/pages' }),
  schema: z.any(),
});

const settings = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: 'src/content/settings' }),
  schema: z.any(),
});

export const collections = { drinks, categories, locations, pages, settings };
