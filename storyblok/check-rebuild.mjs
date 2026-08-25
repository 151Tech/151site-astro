// Run by .github/workflows/storyblok-rebuild.yml, normally from a Storyblok
// publish webhook (repository_dispatch) and hourly as a backstop. Webflow
// Cloud only redeploys on a git push to the tracked branch. There's no
// deploy-hook/webhook-triggered rebuild for it, so this is the bridge:
// check whether anything in the Storyblok space was published more recently
// than our last known rebuild, and if so, touch a marker file and let the
// workflow commit + push it, which is what actually triggers the redeploy.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StoryblokClient from 'storyblok-js-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const markerPath = path.join(__dirname, '.last-rebuild-check.json');

const spaceId = process.env.STORYBLOK_SPACE_ID;
const oauthToken = process.env.STORYBLOK_OAUTH_TOKEN;
if (!spaceId || !oauthToken) {
  console.error('Missing STORYBLOK_SPACE_ID / STORYBLOK_OAUTH_TOKEN');
  process.exit(1);
}

const client = new StoryblokClient({ oauthToken });

// Folders (is_folder: true) always sort ahead of real stories here since
// their published_at is null. Pull a page and skip past them to find the
// most recently published real story.
async function fetchLatest() {
  const { data } = await client.get(`spaces/${spaceId}/stories`, {
    sort_by: 'published_at:desc',
    per_page: 25,
  });
  return (data.stories ?? []).find((s) => !s.is_folder && s.published_at) ?? null;
}

let last = null;
if (fs.existsSync(markerPath)) {
  try {
    last = JSON.parse(fs.readFileSync(markerPath, 'utf8')).lastPublishedAt ?? null;
  } catch {
    last = null;
  }
}

// Storyblok fires its publish webhook essentially the moment the publish
// lands, which can beat the Management API's own read-side by a few
// seconds -- so a webhook-triggered run can otherwise look at a stale
// published_at, conclude nothing changed, and silently skip the rebuild
// the webhook existed to cause. Only retry on webhook runs; the hourly
// backstop has no such race and should stay a single cheap request.
const AWAITING_PUBLISH = process.env.GITHUB_EVENT_NAME === 'repository_dispatch';
const ATTEMPTS = AWAITING_PUBLISH ? 5 : 1;

let latest = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  latest = await fetchLatest();
  if (!latest || latest.published_at !== last) break;
  if (attempt < ATTEMPTS) {
    console.log(`Webhook fired but API still reports ${last}; retrying (${attempt}/${ATTEMPTS - 1})...`);
    await new Promise((r) => setTimeout(r, 6000));
  }
}
const latestPublishedAt = latest?.published_at ?? null;

if (!latestPublishedAt) {
  console.log('No published stories found, nothing to do.');
  process.exit(0);
}

if (latestPublishedAt === last) {
  console.log(`No new publishes since last check (${last}).`);
  process.exit(0);
}

fs.writeFileSync(markerPath, JSON.stringify({ lastPublishedAt: latestPublishedAt }, null, 2) + '\n');
console.log(`New publish detected: ${latest.name} (${latest.full_slug}) at ${latestPublishedAt}. Marker updated.`);
// Signal to the workflow that a commit is needed.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=true\n');
}
