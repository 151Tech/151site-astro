// Counter for the click easter egg (public/js/click-egg.js): hands out a
// shared, increasing "you're the Nth person" number stored in KV.
import { env } from 'cloudflare:workers';

export const prerender = false;

// Webflow Cloud only routes API requests to edge-runtime endpoints.
export const config = { runtime: 'edge' };

// CSRF check, as in contact.ts.
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

  // Stored in the INSTAGRAM_CACHE KV namespace. Without KV (e.g. plain `astro
  // dev`) no number is returned and the front end shows its fallback line.
  const kv = (env as any).INSTAGRAM_CACHE;
  if (!kv) {
    return new Response(JSON.stringify({ count: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Per-IP hourly cap, so a scripted loop can't use up the shared KV write
  // quota. Fails open on KV errors.
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
    // KV has no atomic increment, so simultaneous visitors may occasionally
    // share a number.
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
