import { defineConfig } from 'astro/config';
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
