// Access gate for the draft-preview deployment.
//
// Webflow Cloud has no password protection for Cloud apps, so the preview
// (which serves unpublished content on a public URL) checks the signature the
// Storyblok Visual Editor appends to every preview URL:
//
// _storyblok_tk[space_id]   the space
// _storyblok_tk[timestamp]  unix seconds, when the editor built the link
// _storyblok_tk[token]      SHA1(`${space_id}:${previewToken}:${timestamp}`)
//
// A valid hash proves the link came from someone with editor access. Links
// expire after an hour.
//
// See: https://www.storyblok.com/faq/how-to-verify-the-preview-query-parameters-of-the-visual-editor

// Storyblok's documented expiry window.
const MAX_AGE_SECONDS = 3600;

function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time comparison.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha1Hex(input: string): Promise<string> {
  // Web Crypto, which the Workers runtime provides.
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type GateResult =
  | { allowed: true; reason: 'valid-token' | 'gate-disabled' }
  | { allowed: false; reason: 'no-token' | 'bad-token' | 'expired' | 'misconfigured' };

export async function checkPreviewAccess(url: URL, previewToken: string | undefined): Promise<GateResult> {
  if (!previewToken) {
    // Fail closed. Draft mode can't work without the token, so this is a
    // configuration error.
    console.error('[preview-gate] STORYBLOK_TOKEN is not set; cannot validate editor requests');
    return { allowed: false, reason: 'misconfigured' };
  }

  const spaceId = url.searchParams.get('_storyblok_tk[space_id]');
  const timestamp = url.searchParams.get('_storyblok_tk[timestamp]');
  const token = url.searchParams.get('_storyblok_tk[token]');
  if (!spaceId || !timestamp || !token) return { allowed: false, reason: 'no-token' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { allowed: false, reason: 'bad-token' };
  // Only expiry is checked; an editor clock running slightly fast shouldn't
  // lock them out.
  if (Math.floor(Date.now() / 1000) - ts > MAX_AGE_SECONDS) return { allowed: false, reason: 'expired' };

  const expected = await sha1Hex(`${spaceId}:${previewToken}:${timestamp}`);
  return timingSafeEqual(expected, token.toLowerCase())
    ? { allowed: true, reason: 'valid-token' }
    : { allowed: false, reason: 'bad-token' };
}

// A 404 (matching the noindex on the same response). The message is for a
// colleague who followed an internal link in the preview, which drops the
// editor's query params.
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
