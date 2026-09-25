// Access gate for the draft-preview deployment.
//
// The preview app serves unpublished Storyblok content on a public
// *.webflow.io URL. Webflow Cloud has no password protection or IP
// allowlisting for Cloud apps - its own docs say "anyone with access to your
// deployed mount path can view the environment" - so noindex keeps the
// preview out of search results but does nothing about someone holding the
// link. This closes that gap in the app itself.
//
// Rather than invent a shared secret, this uses the mechanism Storyblok
// already ships for exactly this purpose. The Visual Editor appends three
// query params to the preview URL:
//
//   _storyblok_tk[space_id]   the space
//   _storyblok_tk[timestamp]  unix seconds, when the editor built the link
//   _storyblok_tk[token]      SHA1(`${space_id}:${previewToken}:${timestamp}`)
//
// Recomputing that hash proves the request came from someone with editor
// access to our space, with no new configuration in Storyblok and no secret
// pasted into a URL that could leak. The timestamp is rejected after an hour,
// per Storyblok's own guidance, so a copied link stops working on its own.
//
// See: https://www.storyblok.com/faq/how-to-verify-the-preview-query-parameters-of-the-visual-editor

// Storyblok's documented window. A stale link expiring is the point: it means
// a URL pulled out of someone's history or a screenshot is not a permanent key.
const MAX_AGE_SECONDS = 3600;

function timingSafeEqual(a: string, b: string): boolean {
  // Not strictly necessary - remote timing attacks against a hash comparison
  // over HTTP are impractical - but it costs nothing and avoids leaking a
  // prefix match through response timing.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha1Hex(input: string): Promise<string> {
  // Web Crypto rather than node:crypto: this runs in the Workers runtime on
  // Webflow Cloud, where subtle.digest is available and node's crypto is not
  // guaranteed to be.
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type GateResult =
  | { allowed: true; reason: 'valid-token' | 'gate-disabled' }
  | { allowed: false; reason: 'no-token' | 'bad-token' | 'expired' | 'misconfigured' };

export async function checkPreviewAccess(url: URL, previewToken: string | undefined): Promise<GateResult> {
  if (!previewToken) {
    // Without the token there is nothing to verify against. Fail closed, but
    // say so loudly: draft mode can't work without this token anyway, so this
    // means the environment is misconfigured rather than the visitor being
    // unauthorised.
    console.error('[preview-gate] STORYBLOK_TOKEN is not set; cannot validate editor requests');
    return { allowed: false, reason: 'misconfigured' };
  }

  const spaceId = url.searchParams.get('_storyblok_tk[space_id]');
  const timestamp = url.searchParams.get('_storyblok_tk[timestamp]');
  const token = url.searchParams.get('_storyblok_tk[token]');
  if (!spaceId || !timestamp || !token) return { allowed: false, reason: 'no-token' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { allowed: false, reason: 'bad-token' };
  // Only staleness is checked, not clock skew in the future: a slightly fast
  // editor clock should not lock someone out of their own preview.
  if (Math.floor(Date.now() / 1000) - ts > MAX_AGE_SECONDS) return { allowed: false, reason: 'expired' };

  const expected = await sha1Hex(`${spaceId}:${previewToken}:${timestamp}`);
  return timingSafeEqual(expected, token.toLowerCase())
    ? { allowed: true, reason: 'valid-token' }
    : { allowed: false, reason: 'bad-token' };
}

// Returned instead of the real page. 404 rather than 401/403 so that anything
// which does reach it treats the URL as nothing at all, and so it reinforces
// rather than contradicts the noindex the same response carries.
//
// It explains itself because the most likely person to see this is a
// colleague who clicked an internal link inside the preview (which drops the
// editor's query params) - not an intruder. A bare 404 there reads as "the
// preview is broken", which is the report I do not want marketing filing.
export function gateDeniedResponse(reason: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Preview unavailable</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#111; color:#fff; font-family: system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 34rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.4rem; margin: 0 0 1rem; }
  p { color: rgba(255,255,255,0.66); line-height: 1.6; margin: 0 0 0.75rem; font-size: 0.95rem; }
  code { color:#e63946; font-size: 0.85rem; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>This is the draft preview site</h1>
    <p>It can only be opened from inside the Storyblok Visual Editor, which is what proves you have access to our space.</p>
    <p>Open Storyblok, pick the story you want, and use the preview pane. Links clicked inside the preview lose the editor's access parameters, so they land here.</p>
    <p>Looking for the live site? Visit <a href="https://www.151coffee.com/" style="color:#e63946">151coffee.com</a>.</p>
    <p><code>${reason}</code></p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}
