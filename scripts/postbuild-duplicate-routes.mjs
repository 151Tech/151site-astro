// Webflow Cloud's build pipeline discards our astro.config.mjs and
// regenerates its own from a template, which forces directory-style output
// (/page/index.html) regardless of what we set locally. Requesting /page
// (no trailing slash) then needs a redirect to /page/ to find that
// index.html -- and that redirect fights a separate edge rule on Webflow's
// side that strips trailing slashes, causing an infinite loop.
//
// This runs after the build (works whether Astro emits directory or file
// format) and copies every found <route>/index.html to a sibling
// <route>.html, so Cloudflare's asset server has an exact match for /page
// and never needs to redirect at all, regardless of which format the
// upstream build actually produced.
import { readdirSync, statSync, copyFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const candidates = ['dist/client', 'dist'].map((p) => path.join(projectRoot, p));
const root = candidates.find(existsSync);

if (!root) {
  console.log('[postbuild] No dist directory found, skipping.');
  process.exit(0);
}

let count = 0;
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const indexFile = path.join(full, 'index.html');
    const sibling = `${full}.html`;
    if (existsSync(indexFile) && !existsSync(sibling)) {
      copyFileSync(indexFile, sibling);
      count++;
    }
    walk(full);
  }
}

walk(root);
console.log(`[postbuild] Duplicated ${count} directory route(s) to exact-match .html files in ${root}`);
