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
//
// Secrets come from the Cloudflare Workers runtime binding, NOT import.meta.env:
// Vite/Astro inline import.meta.env.* by static text substitution at BUILD time,
// so import.meta.env.RESEND_API_KEY would bake the live key as a plaintext
// string into the deployed Worker bundle (verified in dist/server/chunks/) --
// unrotatable without a rebuild, and readable by anyone with access to the
// build artifact. It also silently breaks the dynamic `import.meta.env[key]`
// lookup used for per-form recipients below, since Vite only rewrites literal
// `.FOO` property access, never a computed one -- that always evaluated to
// undefined. `env` from cloudflare:workers is a real per-request runtime
// object, so both problems go away; this is the same accessor already proven
// in src/pages/api/instagram-oauth-callback.ts and src/lib/instagram.ts.
import { env } from 'cloudflare:workers';

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
    // This form's markup (index.astro) collects firstName/lastName/email as
    // required fields -- enforce that server-side too, since the client-side
    // `required` attribute is not a security boundary.
    requireIdentity: true,
    subject: (f: URLSearchParams) => {
      const name = `${cleanSubjectPart(f.get('firstName'))} ${cleanSubjectPart(f.get('lastName'))}`.trim();
      return name ? `Contact Form: ${name}` : 'Contact Form: New submission';
    },
  },
  'realestate-inquiry': {
    label: 'Real Estate Inquiry',
    toEnv: 'RESEND_TO_REALESTATE',
    // This form (ourfuture.astro) only collects property + message, no name
    // or email field at all -- requiring them here would reject every
    // legitimate submission.
    requireIdentity: false,
    subject: (f: URLSearchParams) =>
      `Real Estate Inquiry: ${cleanSubjectPart(f.get('property')) || 'New submission'}`,
  },
  'invest-waitlist': {
    label: 'Investor Waitlist Signup',
    toEnv: 'RESEND_TO_INVEST',
    // No real inbox for this one yet -- until RESEND_TO_INVEST is set, refuse
    // to send rather than silently falling back to DEFAULT_TO_ADDRESS, which
    // would misdeliver investor leads to the general tech inbox.
    requireToEnv: true,
    // This form (invest banner popup) only collects email + phone.
    requireIdentity: false,
    // Matches the subject/preview convention from the old Wix waitlist
    // form's own notification email, not tied to any particular field.
    subject: () => 'Investor Waitlist Signup got a new submission',
    previewText: 'A site visitor just submitted your form Investor Waitlist Signup',
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
  // *.webflow.io is a shared hosting domain handed out to every Webflow
  // customer, not just us -- an endsWith() wildcard would let any other
  // Webflow site's page POST here cross-origin. Pin the exact preview host
  // instead of trusting the whole subdomain.
  if (host === '151coffee-storyblok-f09994.webflow.io') return true;
  const extra = (env as any).EXTRA_ALLOWED_ORIGIN_HOST;
  return Boolean(extra) && host === extra;
}

// Caps on what we will put in an email, so a scripted submission cannot push a
// megabyte of text into the team's inbox or blow past Resend's payload limit.
const MAX_FIELD_LENGTH = 5000;
const MAX_FIELDS = 25;

// Runs any raw field going into an email SUBJECT LINE (not the body, which is
// already capped/escaped separately). Strips newlines/tabs so a scripted
// submission can't stretch the subject into garbage or push past Resend's
// payload limit with an oversized property/name field.
function cleanSubjectPart(value: string | null | undefined): string {
  return (value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
}

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
  const apiKey = (env as any).RESEND_API_KEY;
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

  // Cheap per-IP volume cap so a scripted loop cannot flood the team inbox or
  // burn the Resend monthly quota (which would silently stop real leads from
  // being delivered once exhausted). Reuses the INSTAGRAM_CACHE KV namespace
  // under its own key prefix rather than provisioning a second binding.
  // Deliberately fails OPEN: if KV is unavailable or errors, the submission
  // still sends -- a rate limiter that blocks on infrastructure trouble would
  // be worse than no rate limiter at all for a form that real customers rely on.
  const rateLimitKv = (env as any).INSTAGRAM_CACHE;
  if (rateLimitKv) {
    try {
      const ip =
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      if (ip) {
        const hourBucket = Math.floor(Date.now() / 3_600_000);
        const key = `rl:contact:${ip}:${hourBucket}`;
        const current = parseInt((await rateLimitKv.get(key)) ?? '0', 10) || 0;
        if (current >= 5) {
          return new Response('Too many requests', {
            status: 429,
            headers: { 'Retry-After': '3600' },
          });
        }
        await rateLimitKv.put(key, String(current + 1), { expirationTtl: 3600 });
      }
    } catch (err) {
      console.error('[contact] rate-limit check failed, continuing (fail open)', err);
    }
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

  // Forms that collect a name + email (contact) enforce it server-side too --
  // the client-side `required` attribute is not a security boundary. Forms
  // that don't collect either (realestate-inquiry) skip this entirely.
  const firstName = fields.get('firstName')?.trim();
  const lastName = fields.get('lastName')?.trim();
  const submitterEmailRaw = fields.get('email')?.trim();
  const emailLooksValid =
    !!submitterEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmailRaw);
  if (form.requireIdentity) {
    if (!firstName && !lastName) {
      return new Response('Missing name', { status: 400 });
    }
    if (!emailLooksValid) {
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

  const fromAddress = (env as any).RESEND_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
  const configuredToAddress = (env as any)[form.toEnv];
  if ('requireToEnv' in form && form.requireToEnv && !configuredToAddress) {
    console.warn(`[contact] ${form.toEnv} not set, refusing to send ${requested} submission`);
    return new Response('Form not yet accepting submissions', { status: 503 });
  }
  const toAddress = configuredToAddress || DEFAULT_TO_ADDRESS;

  // Only a plausible address is worth setting as reply_to: a malformed one can
  // get the whole message rejected by Resend. (emailLooksValid already ran
  // above; reuse it here rather than re-testing the regex.)
  const replyTo = emailLooksValid ? submitterEmailRaw : undefined;

  // A preheader: invisible in the rendered email itself, but inbox list
  // views (Gmail, Outlook, etc.) show it right after the subject line --
  // matching the "preview text" field the old Wix notification email had.
  const previewText = 'previewText' in form ? (form as { previewText: string }).previewText : undefined;
  const preheader = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(previewText)}</div>`
    : '';

  const html = `${preheader}<h2>${escapeHtml(form.label)}</h2>
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
