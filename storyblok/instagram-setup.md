# Connecting the homepage Instagram carousel to @151coffee

The carousel code (`src/components/InstagramCarousel.astro`, `src/lib/instagram.ts`,
`src/pages/api/instagram-oauth-callback.ts`, `src/pages/api/instagram-token-refresh.ts`)
is done and safe to deploy as-is -- it just won't show real posts until the
steps below are done once. Nothing here is something I can do on your
behalf: it requires signing in as @151coffee and to whoever's Facebook
account/Page is (or will be) linked to it.

## 1. Convert @151coffee to a Business or Creator account

Instagram's Graph API only works for Business/Creator accounts, not a
personal account. In the Instagram app: Settings > Account type and tools >
Switch to Professional Account, choose Business (or Creator), and link it to
a Facebook Page (create a bare-minimum Page if one doesn't already exist --
it doesn't need to be actively used, it's just required plumbing for the
API).

## 2. Register a Meta developer app

1. Go to https://developers.facebook.com/ and sign in.
2. Create an app (type: "Other" > "Business" or similar -- exact wording
   shifts over time, pick whichever isn't Consumer/Gaming).
3. Add the **Instagram Graph API** product (sometimes listed as "Instagram
   API with Instagram Login" -- either surface works for this single-account
   use case; the setup below assumes Instagram Login since it doesn't
   require a Facebook Page access token dance).
4. Add @151coffee as an **Instagram tester** on the app (App roles > Roles >
   Instagram Testers), then accept the tester invite from the @151coffee
   Instagram account itself (Settings > Apps and websites > Tester invites,
   in the Instagram app).
   This is what lets the app read @151coffee's media while the app itself
   stays in Development mode -- no App Review, no Business Verification, no
   domain verification needed for this. Development mode only restricts
   which accounts the app can read, not who can view the public website that
   renders that data, so the live 151coffee.com site is unaffected.
5. Add a redirect URI: `https://www.151coffee.com/api/instagram-oauth-callback`
   (and, if you want to test this from the preview app too, its own
   `/api/instagram-oauth-callback` URL).
6. Copy the app's **Instagram App ID** and **Instagram App Secret** (under
   Instagram > API setup with Instagram login, or App Settings > Basic).

## 3. Add the secrets to Webflow Cloud

In the Webflow Cloud dashboard's environment variables for the production
app, set:

- `INSTAGRAM_CLIENT_ID`
- `INSTAGRAM_CLIENT_SECRET`
- `INSTAGRAM_OAUTH_STATE` -- a random string you make up (e.g. run
  `openssl rand -hex 16` or just mash the keyboard). This is a shared secret,
  not shown anywhere public: the callback route rejects any request whose
  `state` doesn't match it, which is what stops a stranger from running their
  own Instagram authorization and hitting our callback URL directly to
  hijack the stored token. Put the same value in the `state=` param of the
  authorize URL in step 5 below.
- `INSTAGRAM_REFRESH_SECRET` -- another random string, different from the
  one above. This one gates the scheduled token-refresh endpoint
  (`/api/instagram-token-refresh`) rather than an OAuth redirect, so it's
  sent as a header instead of a `state` param -- see step 6.

## 4. Create the KV namespace

`wrangler.json` already declares an `INSTAGRAM_CACHE` binding with a
placeholder id (`123456789`). Create the actual namespace in the Cloudflare
dashboard (or ask me to run `wrangler kv namespace create` once you've
shared Cloudflare API access), then swap that placeholder for the real id it
gives you. Note this KV namespace is shared with the contact form's rate
limiter and the click-egg counter (see their own comments) -- it's one
general-purpose store, not Instagram-specific infrastructure.

## 5. Authorize the app as @151coffee (one-time)

This is the one step that has to be a human clicking "Allow" -- there's no
way to script consent.

Once steps 1-4 are live, visit this URL while logged into the browser as
@151coffee's Instagram account (replace `YOUR_CLIENT_ID` and
`YOUR_INSTAGRAM_OAUTH_STATE` with the values from step 3 -- they must match
exactly what's set in Webflow Cloud, or the callback will reject it):

```
https://www.instagram.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https%3A%2F%2Fwww.151coffee.com%2Fapi%2Finstagram-oauth-callback&response_type=code&scope=instagram_business_basic&state=YOUR_INSTAGRAM_OAUTH_STATE
```

Log in as @151coffee, approve it, and you'll land back on
`/api/instagram-oauth-callback`, which exchanges the code for a short-lived
token, immediately trades that for a long-lived (~60 day) token, and saves
it to KV. You should see a plain-text "Instagram connected" message.

## 6. Set up the scheduled token refresh

Instagram's long-lived token does NOT renew itself -- unlike TikTok's
refresh token (which rotates and stays valid indefinitely with normal
traffic), this one expires ~60 days after it's issued unless something
proactively refreshes it first. `.github/workflows/instagram-token-refresh.yml`
handles this by calling `/api/instagram-token-refresh` on a schedule (every
10 days, well inside the 60-day window). For that workflow to work, add
these as GitHub repo secrets (Settings > Secrets and variables > Actions):

- `INSTAGRAM_REFRESH_URL` -- `https://www.151coffee.com/api/instagram-token-refresh`
- `INSTAGRAM_REFRESH_SECRET` -- same value set in Webflow Cloud in step 3

## What happens if any of this isn't done yet

`getLatestInstagramMedia()` returns `null` rather than throwing, and
`InstagramCarousel.astro` renders nothing at all in that case -- but the
homepage currently falls back to a TEMPORARY hardcoded section (see the
comment in `src/pages/index.astro`) using existing photography rather than
showing nothing, until this integration is connected.
