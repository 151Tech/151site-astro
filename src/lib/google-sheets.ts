// Appends a row to a Google Sheet (Sheets API v4) as a Google service
// account. Used by the investor waitlist form (src/pages/api/contact.ts).
//
// Workers have no Node crypto, so the service account JWT is signed with Web
// Crypto and exchanged for an OAuth access token.

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

// Accepts the PEM key with real newlines or with literal "\n" escapes, as
// pasted into an env var, and returns the base64 body Web Crypto expects.
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
    // Tokens last an hour. The form is low traffic, so each submission mints
    // a new one.
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

// `range` is a tab name (e.g. "Sheet1") or an A1 range; the API appends after
// its last row.
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

  // RAW, not USER_ENTERED: values come from a public form, and USER_ENTERED
  // would store input like =IMPORTXML(...) as a live formula. Timestamps
  // therefore stay ISO-8601 text, which still sorts correctly.
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
