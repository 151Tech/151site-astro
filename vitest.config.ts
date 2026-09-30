import { defineConfig } from 'vitest/config';

// Plain Vitest rather than `getViteConfig` from astro/config: loading the
// Astro config would run the build hooks and the sitemap integration for
// nothing, and these tests import plain .ts/.mjs modules, not components.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    environment: 'node',
  },
});
