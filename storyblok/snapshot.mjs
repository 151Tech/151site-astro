// Fetches every Storyblok story/collection this site actually reads (see
// the getPage/getSettings/getDrinks/getCategories/getLocations call sites
// in src/pages and src/components) and writes the raw published content to
// src/data/storyblok-snapshot.json. Production reads that file as a plain
// JS import in src/lib/storyblok.ts -- no live Storyblok API call at
// request or Webflow-build time, which is what actually caused the
// timeouts, the "not permitted to access the default cache" crash, and the
// occasional bare page failures: Webflow Cloud's sandboxed network path to
// Storyblok is just unreliable, so the fix is to stop depending on it at
// runtime entirely.
//
// Run manually with `npm run storyblok:snapshot`, or automatically by
// .github/workflows/storyblok-rebuild.yml whenever it detects a new
// publish -- that workflow commits this file alongside its rebuild marker,
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
  'pages/merch',
  'pages/ourfuture',
  'pages/privacy',
];

// Every folder fetched via getStories() across the codebase.
const COLLECTIONS = ['drinks', 'categories', 'locations'];

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
  return data.stories.map((story) => ({ slug: story.slug, content: story.content }));
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

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), stories, collections }, null, 2) + '\n');
console.log(`Wrote snapshot to ${outPath}`);
