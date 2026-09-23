#!/usr/bin/env node
// One-off push for the initial batch of SMS/text-link discount landing
// pages (see src/pages/[slug].astro, src/lib/storyblok.ts's
// getLandingPages()/getLandingPage(), and the `landing_page` component in
// collections-schema.mjs). Re-running this is safe -- the component is
// upserted by name and each story by slug, same as migrate.mjs -- but it's
// meant as a one-time seed: after this, new landing pages are created by
// duplicating the "template" story directly in Storyblok, not by editing
// this file.
//
// Requires STORYBLOK_SPACE_ID and STORYBLOK_OAUTH_TOKEN (Management API
// Personal Access Token) in the environment or .env.
import 'dotenv/config';
import { COMPONENTS, landingPageContent } from './collections-schema.mjs';

const spaceId = process.env.STORYBLOK_SPACE_ID;
const oauthToken = process.env.STORYBLOK_OAUTH_TOKEN;
if (!spaceId || !oauthToken) {
  console.error('Missing STORYBLOK_SPACE_ID and/or STORYBLOK_OAUTH_TOKEN in .env.');
  process.exit(1);
}

// Plain fetch against the Management API instead of storyblok-js-client:
// the client's own request wrapper here was throwing a bare, bodyless 422
// ("Unprocessable Content", no `response`) on story updates that a raw PUT
// with the exact same payload completed successfully -- some quirk in how
// it serializes/dedupes the call, not a real validation failure. Same
// distrust of this SDK's runtime behavior already documented in
// src/lib/storyblok.ts for the CDN side; this is the Management API side of
// that same problem.
const API_BASE = 'https://mapi.storyblok.com/v1';

async function mapi(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: oauthToken, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

async function upsertComponent(component) {
  const data = await mapi('GET', `/spaces/${spaceId}/components`);
  const existing = data.components.find((c) => c.name === component.name);
  if (existing) {
    await mapi('PUT', `/spaces/${spaceId}/components/${existing.id}`, { component });
    console.log(`  updated component: ${component.name}`);
  } else {
    await mapi('POST', `/spaces/${spaceId}/components`, { component });
    console.log(`  created component: ${component.name}`);
  }
}

const folderCache = new Map();
async function ensureFolder(folderSlug) {
  if (folderCache.has(folderSlug)) return folderCache.get(folderSlug);
  const data = await mapi('GET', `/spaces/${spaceId}/stories?with_slug=${encodeURIComponent(folderSlug)}`);
  let folder = data.stories?.[0];
  if (!folder) {
    const created = await mapi('POST', `/spaces/${spaceId}/stories`, {
      story: { name: folderSlug, slug: folderSlug, is_folder: true },
    });
    folder = created.story;
    console.log(`  created folder: ${folderSlug}`);
  }
  folderCache.set(folderSlug, folder);
  return folder;
}

async function upsertStory(slug, content, displayName) {
  const [folderSlug, name] = [slug.split('/').slice(0, -1).join('/'), slug.split('/').pop()];
  const folder = folderSlug ? await ensureFolder(folderSlug) : null;

  const existingData = await mapi('GET', `/spaces/${spaceId}/stories?with_slug=${encodeURIComponent(slug)}`);
  const existing = existingData.stories?.[0];

  const storyPayload = {
    name: displayName ?? name,
    slug: name,
    parent_id: folder?.id,
    content,
  };

  let storyId;
  if (existing) {
    await mapi('PUT', `/spaces/${spaceId}/stories/${existing.id}`, { story: storyPayload });
    storyId = existing.id;
    console.log(`  updated story: ${slug}`);
  } else {
    const created = await mapi('POST', `/spaces/${spaceId}/stories`, { story: storyPayload });
    storyId = created.story.id;
    console.log(`  created story: ${slug}`);
  }

  // The CDN API's "published" version -- what production's snapshot pull
  // (storyblok/snapshot.mjs) reads -- is empty for a story that only has a
  // draft. Publishing immediately means this seed script alone is enough to
  // make a new landing page live; an editor who duplicates the template
  // story later still publishes normally through the Storyblok UI.
  await mapi('GET', `/spaces/${spaceId}/stories/${storyId}/publish`);
  console.log(`  published story: ${slug}`);
}

// slug: the NEW url this site serves it at (/{slug}), independent of
// whatever short code the old site used to link to the same offer via text.
const PAGES = [
  {
    slug: 'veterans-day',
    content: {
      eyebrow: 'VETERANS DAY',
      headline: 'Thank You For Your Service',
      offer: 'Enjoy one FREE drink of any size, on us.',
      instructions: "Tell your barista you're a Veteran or active-duty military member and show proof of service or a military ID before ordering.",
      terms: 'Valid on Veterans Day only, at any 151 Coffee location.',
    },
  },
  {
    slug: 'family-day',
    content: {
      eyebrow: '151 COFFEE FAMILY DAY',
      headline: '50% Off Your Entire Order',
      offer: "We've added 50% off your entire order, every Sunday from 12pm until close.",
      instructions: "Give your phone number to the barista before ordering and let them know you'd like to redeem your Family Day coupon.",
      terms: 'Available to Rewards members who received this offer by text. Sundays, 12pm-close only.',
    },
  },
  {
    // Best-effort recreation: the live page this replaces (a newer template
    // variant of the Family Day offer) rendered no offer content when
    // checked during this migration, so this reuses the Family Day copy
    // rather than guessing at different numbers. Flagged for the owner to
    // confirm/edit in Storyblok.
    slug: 'family-day-v2',
    content: {
      eyebrow: '151 COFFEE FAMILY DAY',
      headline: '50% Off Your Entire Order',
      offer: "We've added 50% off your entire order, every Sunday from 12pm until close.",
      instructions: "Give your phone number to the barista before ordering and let them know you'd like to redeem your Family Day coupon.",
      terms: 'Available to Rewards members who received this offer by text. Sundays, 12pm-close only.',
    },
  },
  {
    slug: 'student-happy-hour',
    content: {
      eyebrow: 'STUDENT HAPPY HOUR',
      headline: '4 Medium Drinks for $16',
      offer: 'Every Friday in September, from 2pm until close.',
      instructions: 'Show your High School or College Student ID to your barista before ordering.',
      terms: 'Cannot be combined with other offers or coupons.',
    },
  },
  {
    slug: 'rewards-50-off',
    content: {
      eyebrow: '151 COFFEE REWARDS',
      headline: '50% Off One Drink',
      offer: "We've added 50% off one drink of any size to your Rewards account.",
      instructions: 'Give your phone number to the barista before ordering and ask to redeem your 50% off coupon.',
      terms: 'This offer expires 7 days from the date you received this text.',
    },
  },
  {
    slug: 'rewards-free-drink-3day',
    content: {
      eyebrow: '151 COFFEE REWARDS',
      headline: 'One Free Drink',
      offer: 'We’ve added one FREE drink of any size to your Rewards account.',
      instructions: 'Give your phone number to the barista before ordering and ask to redeem your free drink.',
      terms: 'This offer expires 3 days from the date you received this text.',
    },
  },
  {
    slug: 'rewards-free-drink-7day',
    content: {
      eyebrow: '151 COFFEE REWARDS',
      headline: 'One Free Drink',
      offer: 'We’ve added one FREE drink of any size to your Rewards account.',
      instructions: 'Give your phone number to the barista before ordering and ask to redeem your free drink.',
      terms: 'This offer expires 7 days from the date you received this text.',
    },
  },
  {
    slug: 'template',
    displayName: '🧩 TEMPLATE — duplicate me, do not link to this one',
    content: {
      eyebrow: 'YOUR EYEBROW HERE',
      headline: 'Your Headline Here',
      offer: 'Describe the offer in one short, punchy sentence.',
      instructions: 'How to redeem this offer, in one or two short sentences.',
      terms: 'Optional fine print: expiration, eligibility, restrictions.',
    },
  },
];

async function main() {
  console.log('Pushing landing_page component...');
  await upsertComponent(COMPONENTS.landing_page);

  console.log(`Pushing ${PAGES.length} landing page stories...`);
  for (const { slug, content, displayName } of PAGES) {
    try {
      await upsertStory(`landing-pages/${slug}`, landingPageContent(content), displayName);
    } catch (err) {
      console.error(`  FAILED on ${slug}:`, err?.response?.data ?? err.message);
      throw err;
    }
  }

  console.log('Done. Run `npm run storyblok:snapshot` next to pull these into the local snapshot.');
}

main().catch((err) => {
  console.error(err?.response?.data ?? JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
