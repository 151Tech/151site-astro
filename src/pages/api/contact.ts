// Receives both website forms and relays them to the team over Resend.
//
// Handles the two forms marked data-netlify="true" -- the home page contact
// form (index.astro, form-name="contact") and the real estate inquiry form
// (ourfuture.astro, form-name="realestate-inquiry"). script.js POSTs them here
// as url-encoded form data and only expects a 2xx back.
//
// Netlify's own attributes (data-netlify, form-name, bot-field) are left on the
// markup even though nothing about this deployment is Netlify -- form-name
// still tells this endpoint which form fired, and bot-field is the honeypot, so
// removing them isn't worth the churn.
export const prerender = false;

// Required by Webflow Cloud: API routes have to opt into the edge runtime or
// the platform won't route requests to them.
export const config = { runtime: 'edge' };

// The visitor's own address is never used as the sender. Resend will only send
// as an address on a domain you have verified, so putting a visitor's address
// in `from` gets the send rejected outright -- and even where it works it is a
// spoof that lands the mail in spam and burns the domain's reputation. The
// sender is always us; the visitor's address goes in reply_to instead, so
// hitting Reply in the inbox still answers the right person.
const FROM_NAME = '151 Coffee Website Contact';

// Sandbox default. onboarding@resend.dev works without any DNS setup but will
// ONLY deliver to the Resend account owner's own address -- fine for testing,
// useless in production. Once 151coffee.com is verified in Resend (needs DNS
// records added at the registrar), set RESEND_FROM_ADDRESS to something like
// website@151coffee.com and delivery to any recipient starts working.
const DEFAULT_FROM_ADDRESS = 'onboarding@resend.dev';
const DEFAULT_TO_ADDRESS = 'tech@151coffee.com';

// Per-form routing. Recipients are environment variables rather than Storyblok
// fields on purpose: this is mail infrastructure, not page content, and a typo
// made in the CMS would silently drop real leads with nothing in the UI to
// suggest anything broke. The real estate form is expected to be re-pointed
// later (RESEND_TO_REALESTATE), which is why it is already its own knob.
const FORMS = {
  contact: {
    label: 'Contact Form Submission',
    toEnv: 'RESEND_TO_CONTACT',
    subject: (f: URLSearchParams) => {
      const name = `${f.get('firstName') ?? ''} ${f.get('lastName') ?? ''}`.trim();
      return name ? `Contact Form: ${name}` : 'Contact Form: New submission';
    },
  },
  'realestate-inquiry': {
    label: 'Real Estate Inquiry',
    toEnv: 'RESEND_TO_REALESTATE',
    subject: (f: URLSearchParams) =>
      `Real Estate Inquiry: ${f.get('property')?.trim() || 'New submission'}`,
  },
} as const;

type FormName = keyof typeof FORMS;

// Astro's own checkOrigin is disabled in astro.config.mjs because Webflow Cloud
// proxies requests and the Host it compares against is not reliably ours. This
// list is the replacement CSRF check: it reads the Origin header, which a
// browser sets itself and page JavaScript cannot forge, so a form POST from
// someone else's site is rejected here even though Astro no longer checks.
const ALLOWED_ORIGIN_HOSTS = new Set([
  'www.151coffee.com',
  '151coffee.com',
  'localhost',
  '127.0.0.1',
]);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  // No Origin at all means this is not a browser form post. Browsers always set
  // it on a cross-origin request and on same-origin fetch() POSTs, which is all
  // our forms ever do.
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
  // Webflow Cloud serves preview/staging builds on its own subdomains.
  if (host.endsWith('.webflow.io')) return true;
  const extra = import.meta.env.EXTRA_ALLOWED_ORIGIN_HOST;
  return Boolean(extra) && host === extra;
}

// Caps on what we will put in an email, so a scripted submission cannot push a
// megabyte of text into the team's inbox or blow past Resend's payload limit.
const MAX_FIELD_LENGTH = 5000;
const MAX_FIELDS = 25;

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  message: 'Message',
  property: 'Property Address / Market',
};

function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // camelCase or snake_case -> Title Case, so an added form field still reads
  // as English in the email without anyone updating the map above.
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export async function POST({ request }: { request: Request }) {
  // import.meta.env, NOT locals.runtime.env: the latter was removed in Astro
  // v6 (we are on 7.x) and its getter now throws outright --
  // "Astro.locals.runtime.env has been removed... use cloudflare:workers" --
  // which optional chaining cannot catch, so the whole request 500s. Verified
  // against a local Cloudflare-adapter dev server. src/lib/storyblok.ts reads
  // its token the same way and works on the deployed app.
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    return new Response('Server misconfigured', { status: 500 });
  }

  if (!originAllowed(request)) {
    console.warn('[contact] rejected submission from origin', request.headers.get('origin'));
    return new Response('Forbidden', { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return new Response('Unsupported content type', { status: 400 });
  }

  const fields = new URLSearchParams(await request.text());

  // Honeypot: a real visitor never sees this field, let alone fills it in.
  // Answer 200 so the bot has no signal that it was caught.
  if (fields.get('bot-field')) {
    return new Response('ok', { status: 200 });
  }

  const requested = fields.get('form-name') ?? 'contact';
  if (!(requested in FORMS)) {
    console.warn('[contact] unknown form-name', requested);
    return new Response('Unknown form', { status: 400 });
  }
  const form = FORMS[requested as FormName];

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

  const fromAddress = import.meta.env.RESEND_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
  const toAddress = import.meta.env[form.toEnv] || DEFAULT_TO_ADDRESS;

  // Only a plausible address is worth setting as reply_to: a malformed one can
  // get the whole message rejected by Resend.
  const submitterEmail = fields.get('email')?.trim();
  const replyTo =
    submitterEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)
      ? submitterEmail
      : undefined;

  const html = `<h2>${escapeHtml(form.label)}</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="vertical-align:top"><strong>${escapeHtml(k)}</strong></td><td style="vertical-align:top;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}
    </table>`;

  // A text/plain alternative keeps this out of spam filters that distrust
  // HTML-only mail, and makes it readable in a plain-text client.
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
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: form.subject(fields),
      html,
      text,
    }),
  });

  if (!res.ok) {
    // Log the failure but do not leak Resend's response to the visitor.
    console.error('[contact] Resend send failed', res.status, await res.text());
    return new Response('Failed to send', { status: 502 });
  }

  return new Response('ok', { status: 200 });
}
