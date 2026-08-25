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
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.request.method === 'GET' && response.status === 200) {
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  }
  return response;
});
