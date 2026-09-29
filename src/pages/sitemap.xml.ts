// The generated sitemap is /sitemap-index.xml. Some SEO tools only check
// /sitemap.xml, so that path redirects to it.
export const prerender = import.meta.env.STORYBLOK_DRAFT_MODE !== 'true';

export function GET() {
  const isDraftPreview = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
  // The draft-preview deployment has no sitemap.
  if (isDraftPreview) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(null, {
    status: 301,
    headers: { Location: '/sitemap-index.xml' },
  });
}
