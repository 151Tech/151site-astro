// Backs the "click any page 20 times fast" easter egg (see
// public/js/click-egg.js, wired in on every page via Layout.astro). The
// front-end owns the click-counting entirely client-side; this endpoint's
// only job is handing back a shared, ever-increasing "you're the Nth person"
// number, which needs a store every visitor's request can both read and
// write - import.meta.env can't do that (see src/pages/api/contact.ts for
// why), so this reuses the cloudflare:workers `env` KV accessor already
// proven there and in src/lib/instagram.ts.
import { env } from 'cloudflare:workers';

export const prerender = false;

// Required by Webflow Cloud: API routes have to opt into the edge runtime or
// the platform won't route requests to them.
export const config = { runtime: 'edge' };

// Same CSRF replacement as contact.ts: Astro's checkOrigin is off site-wide
// (Webflow Cloud's proxy makes the Host header unreliable), so this is the
// only thing stopping another site's page from POSTing here and inflating
// the counter for everyone.
const ALLOWED_ORIGIN_HOSTS = new Set([
  'www.151coffee.com',
  '151coffee.com',
  'localhost',
  '127.0.0.1',
]);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
  if (host === '151coffee-storyblok-f09994.webflow.io') return true;
  const extra = (env as any).EXTRA_ALLOWED_ORIGIN_HOST;
  return Boolean(extra) && host === extra;
}

const COUNT_KEY = 'easter_egg:click_streak_count';

export async function POST({ request }: { request: Request }) {
  if (!originAllowed(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Reuses the INSTAGRAM_CACHE KV namespace under its own key prefix rather
  // than provisioning a binding just for a novelty counter (same call as the
  // rate limiter in contact.ts). No KV bound (e.g. local `astro dev` without
  // wrangler) just means the number can't be handed out - the front end
  // already has a no-count fallback line for that.
  const kv = (env as any).INSTAGRAM_CACHE;
  if (!kv) {
    return new Response(JSON.stringify({ count: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Same per-IP-per-hour cap as the contact form's rate limiter (src/pages/
  // api/contact.ts), applied here for a different reason: this endpoint has
  // no honeypot or form fields to slow a scripted loop down, and it shares
  // this KV namespace with the contact-form rate limiter and the Instagram
  // cache - Cloudflare KV's free tier caps writes per day, so an unthrottled
  // loop here could burn through that quota and break those other features
  // too. Fails open on KV errors, same reasoning as contact.ts: a broken
  // rate limiter should never be worse than no rate limiter for a feature
  // this low-stakes.
  try {
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (ip) {
      const hourBucket = Math.floor(Date.now() / 3_600_000);
      const rlKey = `rl:click-egg:${ip}:${hourBucket}`;
      const rlCurrent = parseInt((await kv.get(rlKey)) ?? '0', 10) || 0;
      if (rlCurrent >= 20) {
        return new Response(JSON.stringify({ count: null }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
        });
      }
      await kv.put(rlKey, String(rlCurrent + 1), { expirationTtl: 3600 });
    }
  } catch (err) {
    console.error('[click-egg] rate-limit check failed, continuing (fail open)', err);
  }

  try {
    // KV has no atomic increment, so two visitors hitting 20 clicks in the
    // same instant could both read the same number before either writes --
    // an occasional duplicate ordinal on a just-for-fun counter is a fine
    // trade against provisioning Durable Objects for it.
    const current = parseInt((await kv.get(COUNT_KEY)) ?? '0', 10) || 0;
    const next = current + 1;
    await kv.put(COUNT_KEY, String(next));
    return new Response(JSON.stringify({ count: next }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[click-egg] KV read/write failed', err);
    return new Response(JSON.stringify({ count: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
