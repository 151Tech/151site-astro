// Security headers for every response the Worker serves. Static files in
// public/ get theirs from public/_headers.
//
// The CSP allowlists the exact origins the site uses. It keeps 'unsafe-
// inline' for scripts and styles because the pages use inline scripts and
// Webflow injects one into every page. When adding a third-party service, add
// its origin to the matching directive below or the browser will block it.
//
// Setting CSP_REPORT_ONLY=true in the environment sends the policy as
// Content-Security-Policy-Report-Only: violations are logged, nothing is
// blocked.

const IS_DRAFT_PREVIEW = import.meta.env.STORYBLOK_DRAFT_MODE === 'true';
const IS_DEV = import.meta.env.DEV;
const REPORT_ONLY = import.meta.env.CSP_REPORT_ONLY === 'true';

// Where the Visual Editor can be used (the preview app, and `astro dev`),
// Storyblok frames the page and loads its bridge script.
const EDITOR = IS_DRAFT_PREVIEW || IS_DEV;

// Webflow Cloud serves Astro's bundled /_astro files (scripts, CSS, fonts)
// from its own asset host, not the site's domain.
const WEBFLOW_ASSETS = 'https://*.wf-app-prod.cosmic.webflow.services';

const directives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'", "'unsafe-inline'", WEBFLOW_ASSETS,
    'https://www.googletagmanager.com', // GA4 (analytics-loader.js)
    'https://connect.facebook.net', // Meta Pixel (analytics-loader.js)
    ...(EDITOR ? ['https://app.storyblok.com'] : []), // Visual Editor bridge
  ],
  'style-src': ["'self'", "'unsafe-inline'", WEBFLOW_ASSETS],
  'font-src': ["'self'", 'data:', WEBFLOW_ASSETS],
  'img-src': [
    "'self'", 'data:', 'blob:',
    'https://a.storyblok.com', // all CMS images
    'https://*.cdninstagram.com', 'https://*.fbcdn.net', // Instagram feed
    'https://www.googletagmanager.com', 'https://*.google-analytics.com',
    'https://www.facebook.com', // Meta Pixel beacon
    'https://d3e54v103j8qbb.cloudfront.net', // Webflow badge (remove once the badge is turned off)
  ],
  'media-src': [
    "'self'", 'blob:', 'https://a.storyblok.com',
    'https://*.cdninstagram.com', 'https://*.fbcdn.net',
  ],
  'connect-src': [
    "'self'", WEBFLOW_ASSETS,
    'https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com', // map style + tiles
    'https://nominatim.openstreetmap.org', // ZIP search on /locations
    'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com',
    'https://www.facebook.com', 'https://connect.facebook.net',
    ...(EDITOR ? ['https://api.storyblok.com', 'https://api-us.storyblok.com', 'https://app.storyblok.com'] : []),
    ...(IS_DEV ? ['ws:', 'wss:'] : []), // Vite hot reload
  ],
  // MapLibre decodes tiles in a Web Worker it creates from a blob: URL.
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'", 'blob:'],
  'frame-src': [
    "'self'", // /menu/simple embeds /menu
    'https://www.youtube-nocookie.com', 'https://player.vimeo.com', // hero video embeds
    'https://giftcards-151coffee-orders.crispnow.com', // gift card modal
  ],
  'frame-ancestors': ["'self'", ...(EDITOR ? ['https://app.storyblok.com'] : [])],
  'form-action': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  ...(IS_DEV ? {} : { 'upgrade-insecure-requests': [] }),
};

const CSP = Object.entries(directives)
  .map(([name, values]) => [name, ...values].join(' '))
  .join('; ');

const COMMON: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Nothing on the site uses these. payment stays open to the gift card
  // iframe in case its checkout uses the Payment Request API.
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=(), payment=(self "https://giftcards-151coffee-orders.crispnow.com")',
};

export function applySecurityHeaders(response: Response): Response {
  let headers: Headers;
  try {
    headers = response.headers;
    headers.set('X-Content-Type-Options', 'nosniff');
  } catch {
    // Some responses (Response.redirect()) have immutable headers; rebuild
    // them as a copy so the headers can still be added.
    response = new Response(response.body, response);
    headers = response.headers;
  }
  for (const [name, value] of Object.entries(COMMON)) headers.set(name, value);
  const type = headers.get('content-type') ?? '';
  if (type.includes('text/html')) {
    headers.set(REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', CSP);
    // Older browsers' equivalent of frame-ancestors. It can't allow
    // app.storyblok.com, so builds that support the Visual Editor leave it
    // off.
    if (!EDITOR) headers.set('X-Frame-Options', 'SAMEORIGIN');
  }
  return response;
}
