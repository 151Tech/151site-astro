// Served from a route (not public/robots.txt) so production and the
// draft-preview deployment can return different rules.
import { TEMP_NOINDEX } from '../lib/temp-noindex';

export const prerender = import.meta.env.STORYBLOK_DRAFT_MODE !== 'true';

const PRODUCTION_ROBOTS = `# 151 Coffee
User-agent: *
Allow: /

# AI search and answer engines
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

// The preview has no sitemap. Crawling is allowed on purpose: a crawler
// blocked by Disallow never sees the noindex and can still index the bare
// URL, while one that fetches the page reads noindex and drops it. This keeps
// the preview out of search results; it is not access control.
const PREVIEW_ROBOTS = `# Preview site. Every page is noindex. The real site is https://www.151coffee.com
User-agent: *
Allow: /
`;

// Pre-launch (src/lib/temp-noindex.ts): crawlable, but every page is noindex.
const TEMP_NOINDEX_ROBOTS = `# Every page is noindex until launch. The real site is https://www.151coffee.com
User-agent: *
Allow: /
`;

export function GET() {
  const isDraftPreview = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
  return new Response(isDraftPreview ? PREVIEW_ROBOTS : TEMP_NOINDEX ? TEMP_NOINDEX_ROBOTS : PRODUCTION_ROBOTS, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
