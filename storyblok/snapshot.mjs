// Fetches every Storyblok story/collection this site actually reads (see
// the getPage/getSettings/getDrinks/getCategories/getLocations call sites
// in src/pages and src/components) and writes the raw published content to
// src/data/storyblok-snapshot.json. Production reads that file as a plain
// JS import in src/lib/storyblok.ts, with no live Storyblok API call at
// request or Webflow-build time, which is what actually caused the
// timeouts, the "not permitted to access the default cache" crash, and the
// occasional bare page failures: Webflow Cloud's sandboxed network path to
// Storyblok is just unreliable, so the fix is to stop depending on it at
// runtime entirely.
//
// Run manually with `npm run storyblok:snapshot`, or automatically by
// .github/workflows/storyblok-rebuild.yml whenever it detects a new
// publish. That workflow commits this file alongside its rebuild marker,
// so the next Webflow Cloud build picks up the fresh content.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StoryblokClient from 'storyblok-js-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'src', 'data', 'storyblok-snapshot.json');

const token = process.env.STORYBLOK_TOKEN;
if (!token) {
  console.error('Missing STORYBLOK_TOKEN');
  process.exit(1);
}

const client = new StoryblokClient({ accessToken: token });

// Every full slug fetched via getStory() across the codebase.
const STORY_SLUGS = [
  'settings/global',
  'pages/home',
  'pages/about',
  'pages/careers',
  'pages/locations',
  'pages/menu',
  'pages/ourfuture',
  'pages/privacy',
];

// Every folder fetched via getStories() across the codebase. "products" is
// the Storyblok folder (renamed from "drinks" since it holds food items
// too) that src/lib/storyblok.ts's getDrinks()/getDrink() read from.
const COLLECTIONS = ['products', 'categories', 'locations', 'landing-pages'];

async function fetchStory(slug) {
  const { data } = await client.get(`cdn/stories/${slug}`, { version: 'published' });
  return data.story.content;
}

async function fetchCollection(startsWith) {
  const { data } = await client.get('cdn/stories', {
    starts_with: `${startsWith}/`,
    version: 'published',
    per_page: 100,
  });
  return data.stories.map((story) => ({ slug: story.slug, uuid: story.uuid, content: story.content }));
}

const stories = {};
for (const slug of STORY_SLUGS) {
  console.log(`Fetching story: ${slug}`);
  stories[slug] = await fetchStory(slug);
}

const collections = {};
for (const name of COLLECTIONS) {
  console.log(`Fetching collection: ${name}`);
  collections[name] = await fetchCollection(name);
}

// The drink `category` field is a Storyblok "option" field sourced from
// internal_stories (see storyblok/collections-schema.mjs). Values written by
// the old migration script are literal "categories/{slug}" strings, but
// values picked through Storyblok's own UI save the target story's UUID
// instead - that mismatch is exactly what caused newly-added drinks to
// silently not match any category tab in menu.astro. Normalize every
// UUID-shaped category value back to "categories/{slug}" here so both
// authoring paths resolve the same way downstream.
const categoryUuidToSlug = Object.fromEntries(
  collections.categories.map((c) => [c.uuid, `categories/${c.slug}`]),
);
for (const drink of collections.products) {
  const cat = drink.content.category;
  if (categoryUuidToSlug[cat]) {
    drink.content.category = categoryUuidToSlug[cat];
  }
}

// Same UUID-vs-slug mismatch, same fix, for `unavailableAt` on drinks and
// categories: it's now a multi-select "options" field sourced from
// internal_stories (folder locations), which stores each pick as the
// location story's UUID. menu.astro's toLocationSlugs() only ever matches
// the literal "locations/{slug}" form, so normalize every UUID entry the
// same way the category field above does.
const locationUuidToSlug = Object.fromEntries(
  collections.locations.map((l) => [l.uuid, `locations/${l.slug}`]),
);
function normalizeUnavailableAt(content) {
  if (!Array.isArray(content.unavailableAt)) return;
  content.unavailableAt = content.unavailableAt.map((v) => locationUuidToSlug[v] ?? v);
}
for (const drink of collections.products) normalizeUnavailableAt(drink.content);
for (const category of collections.categories) normalizeUnavailableAt(category.content);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), stories, collections }, null, 2) + '\n');
console.log(`Wrote snapshot to ${outPath}`);
