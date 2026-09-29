import { defineMiddleware } from 'astro:middleware';
import { checkPreviewAccess, gateDeniedResponse } from './lib/preview-gate';
import { TEMP_NOINDEX } from './lib/temp-noindex';
import { applySecurityHeaders } from './lib/security-headers';

// The draft-preview deployment (STORYBLOK_DRAFT_MODE=true). Any value other
// than 'true' means production.
const IS_DRAFT_PREVIEW = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';

// Setting PREVIEW_GATE_DISABLED=true in the preview app's environment turns
// off the access gate below without a code change, in case Storyblok changes
// the query params it relies on.
const GATE_DISABLED = import.meta.env.PREVIEW_GATE_DISABLED === 'true';

// Left open so crawlers can read the preview's noindex policy.
const GATE_EXEMPT = new Set(['/robots.txt']);

export const onRequest = defineMiddleware(async (context, next) => {
  if (IS_DRAFT_PREVIEW && !GATE_DISABLED && !GATE_EXEMPT.has(context.url.pathname)) {
    // import.meta.env, not locals.runtime.env (removed in Astro 6, where it
    // throws).
    const previewToken = import.meta.env.STORYBLOK_TOKEN;
    // context.url has the query string stripped; the raw request URL keeps
    // it.
    const requestUrl = new URL(context.request.url);
    const gate = await checkPreviewAccess(requestUrl, previewToken);
    if (!gate.allowed) {
      // Checked before next(), so a denied request never calls Storyblok.
      return applySecurityHeaders(gateDeniedResponse(gate.reason));
    }
  }

  const response = await next();

  // The header also covers non-HTML responses and routes that don't use
  // Layout.astro.
  if (IS_DRAFT_PREVIEW || TEMP_NOINDEX) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  if (context.request.method === 'GET' && response.status === 200) {
    // Draft pages are never publicly cached: they hold unpublished content,
    // and the Visual Editor needs fresh HTML on every reload. Webflow Cloud
    // currently overrides Cache-Control on webflow.io; this takes effect
    // behind a custom domain cache rule.
    response.headers.set(
      'Cache-Control',
      IS_DRAFT_PREVIEW
        ? 'private, no-store'
        : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    );
  }
  return applySecurityHeaders(response);
});
