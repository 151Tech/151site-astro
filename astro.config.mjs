import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Webflow Cloud builds this project with its own platform configuration: it
// injects the Cloudflare adapter, server output mode, and the mount path, and
// serves prerendered pages through Cloudflare Workers Assets. That asset layer
// runs in its default "auto-trailing-slash" mode, where a page emitted as
// /menu/index.html answers a request for /menu with 307 -> /menu/, while
// Webflow's own edge answers /menu/ with 301 -> /menu. The two rules chase
// each other forever, so every page except / becomes unreachable.
//
// Emitting each page as a flat /menu.html removes the ambiguity: under
// auto-trailing-slash a flat file is served directly at /menu with 200 and
// never redirects, so the loop cannot start. The directory index is deleted
// rather than merely duplicated, because Cloudflare does not define which one
// wins when both /menu.html and /menu/index.html exist.
//
// This runs as a build hook rather than a separate npm script because Webflow
// invokes `astro build` directly and never runs our package.json build script,
// which is why the earlier postbuild version of this fix never took effect.
// Setting build.format:'file' does not work either: Webflow's template
// overrides it, as their deployed sitemap's trailing-slash URLs show.
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

        // Logged so the deployed layout is visible in Webflow's build output,
        // which is otherwise the only window into what their pipeline emits.
        const topLevel = readdirSync(root).filter((f) => f.endsWith('.html')).sort();
        logger.info(`flattened ${converted.length} route(s): ${converted.join(', ') || 'none'}`);
        logger.info(`top-level .html: ${topLevel.join(', ')}`);
      },
    },
  };
}

export default defineConfig({
  output: 'static',
  site: 'https://www.151coffee.com',
  // Prefetches a linked page's HTML on hover/touchstart, so most in-site
  // navigation feels instant -- pairs well with the edge-cache headers set
  // in src/middleware.ts, since a prefetch often just warms (or hits) that
  // same cache before the click ever happens.
  prefetch: true,
  // Self-hosts these Google fonts (downloaded and served from our own
  // origin/CDN, no request to fonts.googleapis.com at all) and generates
  // @font-face rules under the same family names already used everywhere
  // in our CSS (font-family: 'Inter' / 'Bebas Neue' / 'Caveat'), so no CSS
  // had to change to pick this up.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: [400, 500, 600, 700],
    },
    {
      provider: fontProviders.google(),
      name: 'Bebas Neue',
      cssVariable: '--font-bebas-neue',
    },
    {
      provider: fontProviders.google(),
      name: 'Caveat',
      cssVariable: '--font-caveat',
      weights: [600],
    },
  ],
  // This file runs under Node at build time (not the Vite-transformed app
  // code), so the draft-preview switch reads process.env here rather than
  // import.meta.env -- same variable, same value, different runtime.
  integrations: [
    // A sitemap advertising draft/unpublished URLs is exactly the kind of
    // leak the noindex + disallowed robots.txt on this deployment (see
    // Layout.astro, src/pages/robots.txt.ts) are meant to prevent, and
    // it's also just meaningless there: the preview site is one Webflow
    // app whose only visitor is the Storyblok Visual Editor.
    ...(process.env.STORYBLOK_DRAFT_MODE === 'true'
      ? []
      : [
          sitemap({
            // /menu/<store> and /menu/<1-15> are QR-code redirect stubs: they
            // carry meta refresh + noindex + a canonical to /menu?store=...
            // (see src/pages/menu/[store].astro). Advertising a noindex URL in
            // the sitemap is a contradiction Search Console reports as
            // "Submitted URL marked 'noindex'" -- 30 of 117 URLs were doing
            // exactly that. The stubs still work for the printed QR codes;
            // they just aren't offered to crawlers as content.
            filter: (page) => !/\/menu\/[^/]+\/?$/.test(new URL(page).pathname),
            // flattenRoutes rewrites every page to a flat .html, making the
            // canonical URL slash-less, but sitemap runs before that hook and
            // would otherwise advertise /menu/ for every page: URLs that all
            // redirect.
            serialize: (item) => {
              const url = new URL(item.url);
              if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
              // The content-sync workflow rebuilds whenever an editor
              // publishes, so build time is an honest proxy for "last
              // changed" and tells crawlers which pages to revisit. Without
              // it every URL looks equally stale forever.
              return { ...item, url: url.href, lastmod: new Date().toISOString() };
            },
          }),
        ]),
    flattenRoutes(),
  ],
  server: {
    host: true,
  },
  vite: {
    server: {
      allowedHosts: ['100.125.249.107', 'brysonlaptop.tail2f0d4c.ts.net'],
    },
  },
});
