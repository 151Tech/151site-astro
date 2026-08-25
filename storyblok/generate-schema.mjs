#!/usr/bin/env node
// Dry-run generator: reads every src/content/**/*.yaml file and produces
// the Storyblok component schemas + story content that `migrate.mjs` would
// push, WITHOUT touching the network. Review the two output files before
// running the real migration:
//   storyblok/components.generated.json  (one entry per Storyblok component)
//   storyblok/content.generated.json     (one entry per story to create)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { convertRoot } from './infer.mjs';
import {
  COMPONENTS as FLAT_COMPONENTS,
  drinkContent,
  categoryContent,
  locationContent,
  settingsGlobalContent,
} from './collections-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src', 'content');

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function listYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => path.join(dir, f));
}

function slugify(filename) {
  return path
    .basename(filename, '.yaml')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const components = new Map(Object.entries(FLAT_COMPONENTS));
const stories = [];

// --- Flat, hand-schema'd collections ---------------------------------
for (const file of listYamlFiles(path.join(CONTENT_DIR, 'drinks'))) {
  stories.push({ slug: `drinks/${slugify(file)}`, content: drinkContent(readYaml(file)) });
}
for (const file of listYamlFiles(path.join(CONTENT_DIR, 'categories'))) {
  stories.push({ slug: `categories/${slugify(file)}`, content: categoryContent(readYaml(file)) });
}
for (const file of listYamlFiles(path.join(CONTENT_DIR, 'locations'))) {
  stories.push({ slug: `locations/${slugify(file)}`, content: locationContent(readYaml(file)) });
}
for (const file of listYamlFiles(path.join(CONTENT_DIR, 'settings'))) {
  stories.push({ slug: `settings/${slugify(file)}`, content: settingsGlobalContent(readYaml(file)) });
}

// --- Bespoke, per-file pages (schema inferred from each file) --------
for (const file of listYamlFiles(path.join(CONTENT_DIR, 'pages'))) {
  const name = slugify(file);
  const rootComponent = `page_${name}`;
  const raw = readYaml(file);
  const { type, ...rest } = raw; // `type` was the old Zod/Stackbit discriminator; Storyblok's component name replaces it
  const content = convertRoot(rootComponent, rest, components);
  stories.push({ slug: `pages/${name}`, content });
}

const componentsOut = [...components.values()];
fs.writeFileSync(
  path.join(__dirname, 'components.generated.json'),
  JSON.stringify(componentsOut, null, 2),
);
fs.writeFileSync(
  path.join(__dirname, 'content.generated.json'),
  JSON.stringify(stories, null, 2),
);

console.log(`Generated ${componentsOut.length} components -> storyblok/components.generated.json`);
console.log(`Generated ${stories.length} stories -> storyblok/content.generated.json`);
console.log('Review both files, then run: npm run storyblok:migrate');
