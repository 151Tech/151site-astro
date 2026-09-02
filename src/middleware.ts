import { defineMiddleware } from 'astro:middleware';

// Only pages without getStaticPaths (about, careers, index, locations,
// menu, ourfuture, privacy-policy) actually run through this: Webflow's
// build forces output:'server', but pages with getStaticPaths stay
// prerendered and are served as static assets that never reach the
// Worker at all. For everything that does reach here, letting Cloudflare's
// edge cache the rendered HTML means most visits never call Storyblok,
// only the first request per cache window does, and it refreshes quietly
// in the background after that (stale-while-revalidate) instead of making
// a live visitor wait on it.
// Guarded on exactly the same env var every other draft-mode switch reads
// (src/lib/storyblok.ts, Layout.astro, robots.txt.ts, astro.config.mjs).
// Deliberately compared to the literal 'true' so any other value -- unset,
// empty, "false", "1" -- lands on production behaviour: the failure mode of
// getting this backwards is noindexing the real site.
const IS_DRAFT_PREVIEW = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // On the draft-preview deployment, send noindex as an HTTP header as well
  // as the meta tag in Layout.astro. The header is the stronger of the two:
  // it covers responses that aren't HTML and any route that doesn't render
  // through Layout, and a crawler sees it without parsing the body. In draft
  // mode every page is server-rendered (prerender is false site-wide), so
  // every response passes through here.
  if (IS_DRAFT_PREVIEW) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  if (context.request.method === 'GET' && response.status === 200) {
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  }
  return response;
});
