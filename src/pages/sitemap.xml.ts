// @astrojs/sitemap (see astro.config.mjs) emits the real sitemap at
// /sitemap-index.xml, which robots.txt already advertises and which every
// search engine follows without issue. Several third-party SEO auditors and
// a few crawlers, though, only ever check the literal conventional path
// /sitemap.xml and report it missing - so this route exists purely to
// answer that exact path, redirecting to the one real, generated sitemap
// rather than duplicating or hand-maintaining a second copy of it.
export const prerender = import.meta.env.STORYBLOK_DRAFT_MODE !== 'true';

export function GET() {
  const isDraftPreview = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
  // The draft-preview deployment never generates a sitemap at all (see
  // astro.config.mjs), so there is nothing to redirect to there.
  if (isDraftPreview) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(null, {
    status: 301,
    headers: { Location: '/sitemap-index.xml' },
  });
}
