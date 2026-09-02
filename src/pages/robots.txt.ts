// A static /public/robots.txt is shared byte-for-byte between production
// and the draft-preview deployment (the `preview` branch fast-forwards
// from this one -- see .github/workflows/sync-preview.yml), so it can't
// carry different content per environment. Serving it from a route instead
// lets it read STORYBLOK_DRAFT_MODE and disallow the preview domain
// entirely, while production keeps the real, fully-open file.
export const prerender = import.meta.env.STORYBLOK_DRAFT_MODE !== 'true';

const PRODUCTION_ROBOTS = `# 151 Coffee - robots.txt
# Allow all standard search engines full access
User-agent: *
Allow: /

# --- Explicitly welcome AI answer engines (AEO / GEO) ---
# We WANT to be cited by AI assistants and answer engines.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: meta-externalagent
Allow: /

Sitemap: https://www.151coffee.com/sitemap-index.xml
`;

// No Sitemap line here on purpose: astro.config.mjs skips the sitemap
// integration entirely on this deployment, so there is nothing to point at.
//
// Counter-intuitively this ALLOWS crawling, because the goal is to be
// deindexed rather than merely uncrawled, and those need opposite settings.
// `Disallow: /` stops a crawler fetching the page, so it never reads the
// noindex sent by Layout.astro and the X-Robots-Tag sent by middleware.ts --
// and a blocked URL that someone links to publicly can still be indexed
// URL-only, which is Search Console's "Indexed, though blocked by
// robots.txt". Letting crawlers in means they read noindex and drop the page
// for good. nofollow travels with it, so nothing here is crawled onward.
//
// This is not a privacy boundary and was never meant to be one: noindex
// keeps the preview out of search results, it does not stop anyone who has
// the URL. Making it genuinely inaccessible needs access control at the
// platform level (Webflow Cloud environment protection), not a crawler hint.
const PREVIEW_ROBOTS = `# Draft-preview deployment. Not the real site.
# Crawling is allowed ONLY so crawlers can read the noindex that
# Layout.astro and middleware.ts send on every response. Nothing here
# should ever appear in a search result.
User-agent: *
Allow: /
`;

export function GET() {
  const isDraftPreview = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
  return new Response(isDraftPreview ? PREVIEW_ROBOTS : PRODUCTION_ROBOTS, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
