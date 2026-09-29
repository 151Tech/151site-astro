// Receives the site's forms (marked data-ajax-form, posted by script.js as
// url-encoded data) and routes them by their form-name field:
//   contact             home page contact form, emailed via Resend
//   realestate-inquiry  /realestate inquiry form, emailed via Resend
//   invest-waitlist     footer investor waitlist, appended to a Google Sheet
//
// Secrets come from the `cloudflare:workers` env binding. import.meta.env
// values are inlined into the bundle at build time.
import { env } from 'cloudflare:workers';
import { appendRow } from '../../lib/google-sheets';
import { escapeHtml } from '../../lib/html';

export const prerender = false;

// Webflow Cloud only routes API requests to edge-runtime endpoints.
export const config = { runtime: 'edge' };

// Mail is always sent from our own verified domain; the visitor's address
// goes in reply_to.
const FROM_NAME = '151 Coffee Website Contact';

// onboarding@resend.dev only delivers to the Resend account owner. Set
// RESEND_FROM_ADDRESS to an address on a verified domain for production.
const DEFAULT_FROM_ADDRESS = 'onboarding@resend.dev';
const DEFAULT_TO_ADDRESS = 'tech@151coffee.com';

// Recipients are env vars rather than CMS fields, so a typo in Storyblok
// can't silently drop leads.
const FORMS = {
  contact: {
    label: 'Contact Form Submission',
    toEnv: 'RESEND_TO_CONTACT',
    requireIdentity: true,
    subject: (f: URLSearchParams) => {
      const name = `${cleanSubjectPart(f.get('firstName'))} ${cleanSubjectPart(f.get('lastName'))}`.trim();
      return name ? `Contact Form: ${name}` : 'Contact Form: New submission';
    },
  },
  'realestate-inquiry': {
    label: 'Real Estate Inquiry',
    toEnv: 'RESEND_TO_REALESTATE',
    // This form has no name or email fields.
    requireIdentity: false,
    subject: (f: URLSearchParams) =>
      `Real Estate Inquiry: ${cleanSubjectPart(f.get('property')) || 'New submission'}`,
  },
  'invest-waitlist': {
    label: 'Investor Waitlist Signup',
    sheetOnly: true,
  },
} as const;

type FormName = keyof typeof FORMS;

// CSRF check. Astro's checkOrigin is off (astro.config.mjs) because Webflow
// Cloud's proxy makes the Host unreliable, so the Origin header is checked
// here instead.
const ALLOWED_ORIGIN_HOSTS = new Set([
  'www.151coffee.com',
  '151coffee.com',
  '151coffee-storyblok-f09994.webflow.io',
  'localhost',
  '127.0.0.1',
]);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  // Browsers always send Origin on these fetch() POSTs.
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
  const extra = (env as any).EXTRA_ALLOWED_ORIGIN_HOST;
  return Boolean(extra) && host === extra;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTH = 5000;
const MAX_FIELDS = 25;
const MAX_PER_IP_PER_HOUR = 5;

function cleanSubjectPart(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 150);
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  message: 'Message',
  property: 'Property Address / Market',
};

// Unlisted fields get a readable label from their camelCase or snake_case name.
function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Bare 10- or 11-digit US numbers become "+1 555-555-5555". Anything the
// visitor formatted themselves, or any non-US length, is kept as typed.
function formatPhone(raw: string): string {
  if (/[-()]/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `+1 ${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

// Per-IP hourly cap, stored in the INSTAGRAM_CACHE KV namespace. Fails open:
// a KV outage shouldn't block real customers.
async function rateLimited(request: Request): Promise<boolean> {
  const kv = (env as any).INSTAGRAM_CACHE;
  if (!kv) return false;
  try {
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (!ip) return false;
    const key = `rl:contact:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
    const current = parseInt((await kv.get(key)) ?? '0', 10) || 0;
    if (current >= MAX_PER_IP_PER_HOUR) return true;
    await kv.put(key, String(current + 1), { expirationTtl: 3600 });
  } catch (err) {
    console.error('[contact] rate-limit check failed, continuing', err);
  }
  return false;
}

export async function POST({ request }: { request: Request }) {
  if (!originAllowed(request)) {
    console.warn('[contact] rejected submission from origin', request.headers.get('origin'));
    return new Response('Forbidden', { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return new Response('Unsupported content type', { status: 400 });
  }

  if (await rateLimited(request)) {
    return new Response('Too many requests', { status: 429, headers: { 'Retry-After': '3600' } });
  }

  const fields = new URLSearchParams(await request.text());

  // Honeypot field. Bots get a normal 200.
  if (fields.get('bot-field')) {
    return new Response('ok', { status: 200 });
  }

  const requested = fields.get('form-name') ?? 'contact';
  if (!(requested in FORMS)) {
    console.warn('[contact] unknown form-name', requested);
    return new Response('Unknown form', { status: 400 });
  }
  const form = FORMS[requested as FormName];

  const email = fields.get('email')?.trim();
  const emailValid = !!email && EMAIL_PATTERN.test(email);

  if ('sheetOnly' in form) {
    if (!emailValid) {
      return new Response('Missing or invalid email', { status: 400 });
    }
    const phone = fields.get('phone')?.trim();
    try {
      await appendRow(env, [new Date().toISOString(), email, phone ? formatPhone(phone) : ''], {
        spreadsheetIdEnv: 'GOOGLE_SHEETS_INVEST_SPREADSHEET_ID',
        range: 'Waitlist',
      });
    } catch (err) {
      console.error('[contact] invest-waitlist sheet append failed', err);
      return new Response('Failed to record submission', { status: 502 });
    }
    return new Response('ok', { status: 200 });
  }

  if (form.requireIdentity) {
    if (!fields.get('firstName')?.trim() && !fields.get('lastName')?.trim()) {
      return new Response('Missing name', { status: 400 });
    }
    if (!emailValid) {
      return new Response('Missing or invalid email', { status: 400 });
    }
  }

  const rows: [string, string][] = [];
  for (const [key, rawValue] of fields.entries()) {
    if (key === 'form-name' || key === 'bot-field') continue;
    const value = rawValue.trim();
    if (!value) continue;
    rows.push([labelFor(key), value.slice(0, MAX_FIELD_LENGTH)]);
    if (rows.length >= MAX_FIELDS) break;
  }
  if (!rows.length) {
    return new Response('Empty submission', { status: 400 });
  }

  const apiKey = (env as any).RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    return new Response('Server misconfigured', { status: 500 });
  }

  const fromAddress = (env as any).RESEND_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
  const toAddress = (env as any)[form.toEnv] || DEFAULT_TO_ADDRESS;

  const html = `<h2>${escapeHtml(form.label)}</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="vertical-align:top"><strong>${escapeHtml(k)}</strong></td><td style="vertical-align:top;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}
    </table>`;
  const text = `${form.label}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${fromAddress}>`,
      to: [toAddress],
      ...(emailValid ? { reply_to: email } : {}),
      subject: form.subject(fields),
      html,
      text,
    }),
  });

  if (!res.ok) {
    console.error('[contact] Resend send failed', res.status, await res.text());
    return new Response('Failed to send', { status: 502 });
  }

  return new Response('ok', { status: 200 });
}
