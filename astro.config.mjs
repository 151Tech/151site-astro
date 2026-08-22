import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://www.151coffee.com',
  // 'file' emits /page.html instead of /page/index.html -- an exact match
  // for a request to /page, so the static-asset server can serve it
  // directly with no redirect. 'directory' mode (the default) only has an
  // index.html inside the /page/ folder, which forces a trailing-slash
  // redirect on every request without one -- that redirect was fighting a
  // separate edge rule that strips trailing slashes, causing an infinite
  // redirect loop on Webflow Cloud for every non-root page.
  build: {
    format: 'file',
  },
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
  integrations: [sitemap()],
  server: {
    host: true,
  },
  vite: {
    server: {
      allowedHosts: ['100.125.249.107', 'brysonlaptop.tail2f0d4c.ts.net'],
    },
  },
});
