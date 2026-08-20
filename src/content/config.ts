import { defineCollection, z } from 'astro:content';

const drinks = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    category: z.string(),
    subtitle: z.string().optional().default(''),
    description: z.string().optional().default(''),
    image: z.string().optional().default(''),
    badge: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    menuOrder: z.number().optional().default(99),
    // Location file paths this drink is NOT served at (set in the Visual Editor).
    unavailableAt: z.array(z.string()).optional().default([]),
  }),
});

const locations = defineCollection({
  type: 'data',
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
    hours: z.string().optional().default(''),
  }),
});

const pages = defineCollection({
  type: 'data',
  schema: z.any(),
});

const settings = defineCollection({
  type: 'data',
  schema: z.any(),
});

export const collections = { drinks, locations, pages, settings };
