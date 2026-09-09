import { defineMiddleware } from 'astro:middleware';
import { checkPreviewAccess, gateDeniedResponse } from './lib/preview-gate';

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

// Kill switch for the access gate below, and the reason this is safe to run
// long-term. The gate depends on query params that Storyblok controls; if
// they ever change them, the Visual Editor would start returning 404s and the
// people affected (marketing) cannot fix it themselves. Setting
// PREVIEW_GATE_DISABLED=true in the preview app's Webflow Cloud environment
// variables turns the gate off in about two minutes, no code change and no
// developer required, leaving the preview exactly as protected as it was
// before the gate existed (noindex, unlisted). Compared to the literal
// 'true' for the same reason as the flag above.
const GATE_DISABLED = import.meta.env.PREVIEW_GATE_DISABLED === 'true';

// Never gated: /robots.txt has to stay readable so crawlers can read the
// Disallow-free noindex policy that gets the preview deindexed (see
// src/pages/robots.txt.ts). Everything else, including 404s, is subject to
// the gate.
const GATE_EXEMPT = new Set(['/robots.txt']);

export const onRequest = defineMiddleware(async (context, next) => {
  // The gate runs only on the preview deployment. Production never evaluates
  // it at all, so a bug here cannot take the real site down.
  if (IS_DRAFT_PREVIEW && !GATE_DISABLED && !GATE_EXEMPT.has(context.url.pathname)) {
    // import.meta.env, NOT locals.runtime.env: the latter was removed in
    // Astro v6 and its getter now *throws* ("Astro.locals.runtime.env has
    // been removed... use cloudflare:workers"), which optional chaining does
    // not protect against -- it 500s the whole request. This is the same
    // accessor src/lib/storyblok.ts uses for this exact variable, and that
    // path demonstrably works on the deployed preview app.
    const previewToken = import.meta.env.STORYBLOK_TOKEN;
    // context.request.url, NOT context.url: Astro strips the query string
    // from context.url here, which would reject every genuine editor request
    // and 404 the Visual Editor. The raw Request URL always carries them.
    const requestUrl = new URL(context.request.url);
    const gate = await checkPreviewAccess(requestUrl, previewToken);
    if (!gate.allowed) {
      // Deliberately checked BEFORE next(): denying without rendering means an
      // unauthorised request never triggers a Storyblok API call, so the gate
      // also caps what a stranger can spend against our rate limit.
      return gateDeniedResponse(gate.reason);
    }
  }

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
    // Draft-preview responses carry unpublished Storyblok content behind the
    // access gate above -- marking them publicly cacheable would let a shared
    // intermediary cache them outside the gate's control, and would also mean
    // the Visual Editor's save-and-reload can be served stale draft HTML for
    // up to 5 minutes. Only the real (non-draft) deployment gets the shared
    // edge cache; draft mode gets none.
    response.headers.set(
      'Cache-Control',
      IS_DRAFT_PREVIEW
        ? 'private, no-store'
        : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    );
  }
  return response;
});
