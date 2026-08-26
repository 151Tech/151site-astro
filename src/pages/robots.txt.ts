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
const PREVIEW_ROBOTS = `# Draft-preview deployment. Not the real site -- disallowed entirely.
User-agent: *
Disallow: /
`;

export function GET() {
  const isDraftPreview = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
  return new Response(isDraftPreview ? PREVIEW_ROBOTS : PRODUCTION_ROBOTS, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
