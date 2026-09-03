// Adds the SEO/structured-data fields that src/lib/seo.ts reads but the
// Storyblok schema does not yet define. Run against the live space:
//
//   node storyblok/add-seo-fields.mjs            # dry run, prints the plan
//   node storyblok/add-seo-fields.mjs --apply    # writes to Storyblok
//
// This script is deliberately ADD-ONLY. It never edits and never deletes an
// existing field: a target key that already exists is reported and skipped,
// and before every PUT it asserts that each field the component started with
// is still present and byte-identical in the payload. If that check fails the
// script aborts without writing, because the alternative is silently dropping
// content that editors have already filled in.
//
// Requires STORYBLOK_SPACE_ID and STORYBLOK_OAUTH_TOKEN in .env (a Personal
// Access Token, not a delivery token).
import 'dotenv/config';
import StoryblokClient from 'storyblok-js-client';

const APPLY = process.argv.includes('--apply');
const spaceId = process.env.STORYBLOK_SPACE_ID;
const oauthToken = process.env.STORYBLOK_OAUTH_TOKEN;

if (!spaceId || !oauthToken) {
  console.error('Missing STORYBLOK_SPACE_ID and/or STORYBLOK_OAUTH_TOKEN in .env.');
  process.exit(1);
}

const text = (display_name, description) => ({ type: 'text', display_name, description });

// Keys are camelCase to match the existing schema (realEstateEmail,
// displayOrder). The delivery API lowercases content keys, which is why each
// of these also needs an entry in storyblok/field-case-map.json.
const ADDITIONS = {
  settings_global: {
    ogImage: {
      type: 'asset',
      filetypes: ['images'],
      display_name: 'Social Share Image',
      description:
        'Shown when the site is linked on Facebook/X/iMessage. Upload 1200x630px. Falls back to the Logo if empty.',
    },
    priceRange: text(
      'Price Range',
      'Google shows this on the business panel. Use dollar signs, e.g. "$" or "$$".',
    ),
    legalName: text(
      'Legal Entity Name',
      'The registered company name if it differs from "151 Coffee", e.g. "151 Coffee LLC".',
    ),
    foundingDate: text('Founded', 'Year the company was founded, e.g. "2017".'),
    founderName: text('Founder Name', 'Full name of the founder, for the Organization schema.'),
    streetAddress: text('HQ Street Address', 'Corporate/HQ address - not a store address.'),
    addressCity: text('HQ City', ''),
    addressState: text('HQ State', 'Two-letter abbreviation, e.g. "TX".'),
    addressZip: text('HQ ZIP Code', ''),
  },
  location: {
    googleMapsUrl: text(
      'Google Maps Link',
      "Link to this store's Google Maps listing. Used for directions and to tie the store to its Google Business Profile.",
    ),
    hasDriveThrough: {
      type: 'boolean',
      display_name: 'Has Drive-Thru',
      description: 'Tick if this location has a drive-thru window.',
    },
  },
};

const client = new StoryblokClient({ oauthToken });
const { data } = await client.get(`spaces/${spaceId}/components`);

let planned = 0;
let skipped = 0;

for (const [componentName, fields] of Object.entries(ADDITIONS)) {
  const component = data.components.find((c) => c.name === componentName);
  if (!component) {
    console.error(`!! component "${componentName}" not found in space ${spaceId} - skipping`);
    continue;
  }

  const before = component.schema;
  const toAdd = {};
  console.log(`\n=== ${componentName} (${Object.keys(before).length} existing fields) ===`);

  for (const [key, definition] of Object.entries(fields)) {
    if (key in before) {
      console.log(`  = ${key} already exists (${before[key].type}) - leaving untouched`);
      skipped += 1;
      continue;
    }
    toAdd[key] = definition;
    console.log(`  + ${key} [${definition.type}] "${definition.display_name}"`);
    planned += 1;
  }

  if (!Object.keys(toAdd).length) {
    console.log('  nothing to add');
    continue;
  }

  const merged = { ...before, ...toAdd };

  // Add-only guarantee, verified rather than assumed.
  for (const [key, value] of Object.entries(before)) {
    if (JSON.stringify(merged[key]) !== JSON.stringify(value)) {
      console.error(`\nABORT: existing field "${key}" on ${componentName} would change. No write performed.`);
      process.exit(1);
    }
  }

  if (!APPLY) continue;

  await client.put(`spaces/${spaceId}/components/${component.id}`, {
    component: { ...component, schema: merged },
  });
  console.log(`  -> wrote ${Object.keys(toAdd).length} new field(s) to ${componentName}`);
}

console.log(
  `\n${APPLY ? 'Applied' : 'Dry run'}: ${planned} field(s) to add, ${skipped} already present.`,
);
if (!APPLY && planned) console.log('Re-run with --apply to write these to Storyblok.');
