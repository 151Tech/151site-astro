import { defineConfig, fontProviders } from 'astro/config';
import { routableItems, itemPath } from './src/lib/menu-urls.mjs';
import sitemap from '@astrojs/sitemap';
import { readdirSync, copyFileSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { transform } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://www.151coffee.com';

// Promo landing pages are reached only by a texted link, so they stay out of
// the sitemap. Slugs come from the committed snapshot (src/lib/storyblok.ts
// can't be imported from this Node config).
const snapshot = JSON.parse(
  readFileSync(new URL('./src/data/storyblok-snapshot.json', import.meta.url), 'utf-8'),
);
const landingPageSlugs = new Set(
  snapshot.collections?.['landing-pages']?.map((s) => s.slug) ?? [],
);

// Prerendered dynamic routes aren't discovered by @astrojs/sitemap under
// Webflow's server output, so store and menu item URLs are listed from the
// snapshot.
const collectionUrls = (collection, prefix) =>
  (snapshot.collections?.[collection] ?? []).map((entry) => `${SITE_URL}${prefix}/${entry.slug}`);

const menuItems = routableItems(
  (snapshot.collections?.products ?? []).map((e) => ({ slug: e.slug, category: e.content?.category })),
  snapshot.collections?.categories ?? [],
);
const menuItemUrls = menuItems.map((d) => `${SITE_URL}${itemPath(d)}`);

// <lastmod> for each URL is the newest Storyblok publish date among the
// stories the page renders. URLs with no known source get none.
const publishedAt = snapshot.publishedAt ?? {};
const folderSlugs = (folder) =>
  (snapshot.collections?.[folder] ?? []).map((e) => `${folder}/${e.slug}`);
const newest = (keys) =>
  keys.map((k) => publishedAt[k]).filter(Boolean).sort().at(-1);
// Stories each fixed page is built from.
const PAGE_SOURCES = {
  '/': ['pages/home', ...folderSlugs('locations')],
  '/about': ['pages/about'],
  '/careers': ['pages/careers'],
  '/locations': ['pages/locations', ...folderSlugs('locations')],
  '/menu': ['pages/menu', ...folderSlugs('products'), ...folderSlugs('categories')],
  '/realestate': ['pages/realestate', ...folderSlugs('locations')],
  '/privacy-policy': ['pages/privacy'],
};
const lastmodByPath = new Map(Object.entries(PAGE_SOURCES).map(([p, keys]) => [p, newest(keys)]));
// Store pages: the store plus the categories whose unavailableAt sets its
// "Food" line.
for (const loc of snapshot.collections?.locations ?? []) {
  lastmodByPath.set(`/locations/${loc.slug}`, newest([`locations/${loc.slug}`, ...folderSlugs('categories')]));
}
// Menu items: the product and its category.
for (const d of menuItems) {
  lastmodByPath.set(itemPath(d), newest([`products/${d.slug}`, d.category]));
}

// Emits every page as a flat /menu.html instead of /menu/index.html. On
// Webflow Cloud a directory index redirects /menu to /menu/ while Webflow's
// edge redirects /menu/ to /menu, an infinite loop; a flat file is served at
// /menu directly. The index is deleted so only one file exists per route.
//
// This must be a build hook: Webflow runs `astro build` directly (no npm
// build scripts) and overrides build.format.
function flattenRoutes() {
  return {
    name: 'flatten-routes',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const converted = [];

        function walk(current) {
          for (const entry of readdirSync(current, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const full = path.join(current, entry.name);
            const indexFile = path.join(full, 'index.html');
            const flat = `${full}.html`;
            if (existsSync(indexFile)) {
              if (!existsSync(flat)) copyFileSync(indexFile, flat);
              rmSync(indexFile);
              converted.push(path.relative(root, flat).split(path.sep).join('/'));
            }
            walk(full);
          }
        }
        walk(root);

        // Logged so the emitted layout shows in Webflow's build output.
        const topLevel = readdirSync(root).filter((f) => f.endsWith('.html')).sort();
        logger.info(`flattened ${converted.length} route(s): ${converted.join(', ') || 'none'}`);
        logger.info(`top-level .html: ${topLevel.join(', ')}`);
      },
    },
  };
}

// Minifies what Astro doesn't: the scripts and stylesheets in public/ and the
// inline <script> and <style> blocks in every page. /_astro (already
// minified) and /vendor (keeps license headers) are skipped. Top-level names
// are never renamed, so globals shared between scripts keep working.
function minifyShippedCode() {
  // Inline JavaScript (no src, not JSON data) and inline CSS.
  const INLINE_CODE =
    /(<script\b(?![^>]*\bsrc=)(?![^>]*\btype="application\/(?:ld\+)?json")[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g;
  const SKIP = /^(_astro|vendor)$/;

  const files = (root) => {
    const out = [];
    const walk = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (current !== root || !SKIP.test(entry.name)) walk(full);
        } else if (/\.(html|js|css)$/.test(entry.name)) {
          out.push(full);
        }
      }
    };
    walk(root);
    return out;
  };

  const minify = async (code, loader) =>
    (await transform(code, { loader, minify: true, legalComments: 'none', charset: 'utf8' })).code.trim();

  return {
    name: 'minify-shipped-code',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        let saved = 0;
        for (const file of files(root)) {
          const src = readFileSync(file, 'utf-8');
          let out = '';
          if (file.endsWith('.html')) {
            let last = 0;
            for (const m of src.matchAll(INLINE_CODE)) {
              const isScript = m[1] !== undefined;
              const [open, body, close] = isScript ? m.slice(1, 4) : m.slice(4, 7);
              const min = body.trim() ? await minify(body, isScript ? 'js' : 'css') : body;
              out += src.slice(last, m.index) + open + min + close;
              last = m.index + m[0].length;
            }
            out += src.slice(last);
          } else {
            out = await minify(src, file.endsWith('.css') ? 'css' : 'js');
          }
          if (out !== src) {
            saved += Buffer.byteLength(src) - Buffer.byteLength(out);
            writeFileSync(file, out);
          }
        }
        logger.info(`minified shipped code, ${Math.round(saved / 1024)}KB saved`);
      },
    },
  };
}

// Strips whole-line comments from is:inline scripts as .astro files compile,
// for pages rendered on request (the build hook above covers prerendered
// ones). Runs after Astro's own transform, when every <script> left in a
// template is inline. Code lines are never touched.
function stripInlineScriptComments() {
  // The compiler escapes closing tags as <\/script> inside template strings.
  const SCRIPT = /(<script\b[^>]*>)([\s\S]*?)(<\\?\/script>)/g;
  const clean = (js) =>
    js
      // Only comments with nothing else on their line.
      .replace(/^[ \t]*\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/[ \t]*\r?\n/gm, '')
      .replace(/^[ \t]*\/\/.*\r?\n/gm, '');
  return {
    name: 'strip-inline-script-comments',
    enforce: 'post',
    transform(code, id) {
      // The .astro module itself, not its ?astro&type=style/script parts.
      if (!id.endsWith('.astro')) return null;
      const out = code.replace(SCRIPT, (_, open, body, close) => open + clean(body) + close);
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  output: 'static',
  site: SITE_URL,
  build: {
    // Inline page CSS: Webflow Cloud forces Cache-Control: private, no-cache,
    // so an external stylesheet would be revalidated on every visit.
    inlineStylesheets: 'always',
  },
  // Behind Webflow Cloud's proxy the request host isn't reliably ours, so
  // legitimate form posts would fail this check. The API routes check the
  // Origin header themselves.
  security: { checkOrigin: false },
  prefetch: true,
  // Self-hosted Google fonts.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Montserrat',
      cssVariable: '--font-montserrat',
      weights: [400, 500, 600, 700, 800, 900],
    },
    {
      provider: fontProviders.google(),
      name: 'Source Sans 3',
      cssVariable: '--font-source-sans',
      weights: [400, 600, 700],
    },
    {
      provider: fontProviders.google(),
      name: 'Caveat',
      cssVariable: '--font-caveat',
      weights: [600],
    },
  ],
  integrations: [
    // The draft-preview deployment has no sitemap. (A Node config file, so
    // process.env rather than import.meta.env.)
    ...(process.env.STORYBLOK_DRAFT_MODE === 'true'
      ? []
      : [
          sitemap({
            // /menu/<store> and /menu/<number> are noindex QR-code redirects.
            filter: (page) => {
              const pathname = new URL(page).pathname;
              if (/\/menu\/[^/]+\/?$/.test(pathname)) return false;
              const slug = pathname.replace(/^\/|\/$/g, '');
              if (landingPageSlugs.has(slug)) return false;
              // Redirect-only routes.
              if (slug === 'loyalty' || slug === 'ourfuture') return false;
              // Old /drinks/* URLs only redirect.
              if (pathname.startsWith('/drinks/')) return false;
              return true;
            },
            customPages: [
              ...collectionUrls('locations', '/locations'),
              ...menuItemUrls,
            ],
            // Canonical URLs have no trailing slash (see flattenRoutes).
            serialize: (item) => {
              const url = new URL(item.url);
              if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
              const lastmod = lastmodByPath.get(url.pathname);
              return { ...item, url: url.href, ...(lastmod ? { lastmod } : {}) };
            },
          }),
        ]),
    flattenRoutes(),
    minifyShippedCode(),
  ],
  server: {
    host: true,
  },
  vite: {
    plugins: [stripInlineScriptComments()],
    server: {
      // Extra hostnames allowed to reach the dev server, comma-separated
      // (e.g. for testing on a phone over a private network).
      allowedHosts: (process.env.DEV_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
    },
  },
});
