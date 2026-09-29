// Keeps this deployment out of search results until it replaces the live
// www.151coffee.com. Set to false at launch.
//
// When true: Layout.astro adds a noindex robots meta tag, middleware.ts sends
// X-Robots-Tag on server-rendered responses, and robots.txt omits the
// Sitemap line and crawler allowlist. robots.txt still allows crawling, so
// crawlers can fetch pages and see the noindex.
export const TEMP_NOINDEX = true;
