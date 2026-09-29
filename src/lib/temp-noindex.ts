// TEMPORARY: keeps this whole deployment out of search results while the new
// site is still being built, so it doesn't compete with the live
// www.151coffee.com. Flip to false (one line) when this becomes the real site.
//
// When true, production behaves like the draft preview for crawlers:
//   - Layout.astro sends <meta name="robots" content="noindex, nofollow">
//   - middleware.ts sends X-Robots-Tag: noindex, nofollow on server-rendered
//     responses (prerendered pages rely on the meta tag)
//   - robots.txt drops the Sitemap line and the AI-crawler welcome list
//
// robots.txt still says Allow, not Disallow, on purpose: a crawler that is
// blocked never fetches the page, so it never sees the noindex and can keep
// the URL indexed. See src/pages/robots.txt.ts.
export const TEMP_NOINDEX = true;
