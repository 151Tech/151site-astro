import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://www.151coffee.com',
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
