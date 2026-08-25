#!/usr/bin/env node
// Pushes the generated components + stories into the real Storyblok space.
// Requires STORYBLOK_SPACE_ID and STORYBLOK_OAUTH_TOKEN (Management API
// Personal Access Token, from My Account > Personal Access Tokens, NOT
// the Content Delivery tokens used at runtime) in the environment or .env.
//
// Re-running this is safe: components are upserted by name, and stories are
// upserted by slug (existing ones get overwritten with the freshly
// generated content, folders are created as needed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import StoryblokClient from 'storyblok-js-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const spaceId = process.env.STORYBLOK_SPACE_ID;
const oauthToken = process.env.STORYBLOK_OAUTH_TOKEN;

if (!spaceId || !oauthToken) {
  console.error(
    'Missing STORYBLOK_SPACE_ID and/or STORYBLOK_OAUTH_TOKEN.\n' +
      'Set them in .env (see .env.example). The OAuth token is a Personal\n' +
      'Access Token from My Account > Personal Access Tokens in Storyblok,\n' +
      'not the Content Delivery/Preview/Public token.',
  );
  process.exit(1);
}

const componentsPath = path.join(__dirname, 'components.generated.json');
const storiesPath = path.join(__dirname, 'content.generated.json');
if (!fs.existsSync(componentsPath) || !fs.existsSync(storiesPath)) {
  console.error('Run `npm run storyblok:generate` first to produce the files this script pushes.');
  process.exit(1);
}
const components = JSON.parse(fs.readFileSync(componentsPath, 'utf8'));
const stories = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));

const client = new StoryblokClient({ oauthToken });

async function upsertComponent(component) {
  const { data } = await client.get(`spaces/${spaceId}/components`);
  const existing = data.components.find((c) => c.name === component.name);
  if (existing) {
    await client.put(`spaces/${spaceId}/components/${existing.id}`, { component });
    console.log(`  updated component: ${component.name}`);
  } else {
    await client.post(`spaces/${spaceId}/components`, { component });
    console.log(`  created component: ${component.name}`);
  }
}

// Ensures every folder segment in a slug (e.g. "drinks" in "drinks/latte")
// exists as a Storyblok folder story, creating it if missing.
const folderCache = new Map();
async function ensureFolder(folderSlug) {
  if (folderCache.has(folderSlug)) return folderCache.get(folderSlug);
  const { data } = await client.get(`spaces/${spaceId}/stories`, { with_slug: folderSlug });
  let folder = data.stories?.[0];
  if (!folder) {
    const created = await client.post(`spaces/${spaceId}/stories`, {
      story: { name: folderSlug, slug: folderSlug, is_folder: true },
    });
    folder = created.data.story;
    console.log(`  created folder: ${folderSlug}`);
  }
  folderCache.set(folderSlug, folder);
  return folder;
}

async function upsertStory(slug, content) {
  const [folderSlug, name] = [slug.split('/').slice(0, -1).join('/'), slug.split('/').pop()];
  const folder = folderSlug ? await ensureFolder(folderSlug) : null;

  const { data: existingData } = await client.get(`spaces/${spaceId}/stories`, { with_slug: slug });
  const existing = existingData.stories?.[0];

  const storyPayload = {
    name,
    slug: name,
    parent_id: folder?.id,
    content,
  };

  if (existing) {
    await client.put(`spaces/${spaceId}/stories/${existing.id}`, { story: storyPayload });
    console.log(`  updated story: ${slug}`);
  } else {
    await client.post(`spaces/${spaceId}/stories`, { story: storyPayload });
    console.log(`  created story: ${slug}`);
  }
}

async function main() {
  console.log(`Pushing ${components.length} components...`);
  for (const component of components) {
    await upsertComponent(component);
  }

  console.log(`Pushing ${stories.length} stories...`);
  for (const { slug, content } of stories) {
    await upsertStory(slug, content);
  }

  console.log('Done.');
}

main().catch((err) => {
  // storyblok-js-client's thrown error often doesn't carry the response body
  // (e.g. Storyblok's field-level validation messages), so dump everything
  // enumerable so a failure is actually diagnosable.
  console.error(err?.response?.data ?? JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
