# Connecting the homepage TikTok carousel to @151coffee

The carousel code (`src/components/TikTokCarousel.astro`, `src/lib/tiktok.ts`,
`src/pages/api/tiktok-oauth-callback.ts`) is done and safe to deploy as-is --
it just won't show real videos until the steps below are done once. Nothing
here is something I can do on your behalf: it requires signing in as
@151coffee.

## 1. Register a TikTok developer app

1. Go to https://developers.tiktok.com/ and sign in with whatever account
   manages @151coffee's TikTok (or a company account -- doesn't have to be
   the same login as the TikTok app itself, but you'll need @151coffee's
   TikTok login for step 3).
2. Create an app. Add the **Login Kit** and **Display API** products.
3. Under Login Kit, add scope `video.list`.
4. Add a redirect URI: `https://www.151coffee.com/api/tiktok-oauth-callback`
   (and, if you want to test this from the preview app too, its own
   `/api/tiktok-oauth-callback` URL).
5. Copy the **Client Key** and **Client Secret** it gives you.

## 2. Add the secrets to Webflow Cloud

In the Webflow Cloud dashboard's environment variables for the production
app, set:

- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_OAUTH_STATE` -- a random string you make up (e.g. run
  `openssl rand -hex 16` or just mash the keyboard). This is a shared secret,
  not shown anywhere public: the callback route rejects any request whose
  `state` doesn't match it, which is what stops a stranger from running their
  own TikTok authorization and hitting our callback URL directly to hijack
  the stored refresh token. Put the same value in the `state=` param of the
  authorize URL in step 4 below.

## 3. Create the KV namespace

`wrangler.json` already declares a `TIKTOK_CACHE` binding with a placeholder
id (`REPLACE_WITH_REAL_KV_NAMESPACE_ID`). Create the actual namespace in the
Cloudflare dashboard (or ask me to run `wrangler kv namespace create` once
you've shared Cloudflare API access), then swap that placeholder for the
real id it gives you.

## 4. Authorize the app as @151coffee (one-time)

This is the one step that has to be a human clicking "Allow" -- there's no
way to script consent.

Once steps 1-3 are live, visit this URL while logged into the browser as
whoever can approve TikTok apps for @151coffee (replace `YOUR_CLIENT_KEY` and
`YOUR_TIKTOK_OAUTH_STATE` with the values from step 2 -- they must match
exactly what's set in Webflow Cloud, or the callback will reject it):

```
https://www.tiktok.com/v2/auth/authorize/?client_key=YOUR_CLIENT_KEY&scope=video.list&response_type=code&redirect_uri=https%3A%2F%2Fwww.151coffee.com%2Fapi%2Ftiktok-oauth-callback&state=YOUR_TIKTOK_OAUTH_STATE
```

Log in as @151coffee, approve it, and you'll land back on
`/api/tiktok-oauth-callback`, which exchanges the code for a refresh token
and saves it to KV. You should see a plain-text "TikTok connected" message.

That's it -- from then on, `src/lib/tiktok.ts` refreshes and rotates the
token on its own every time the cache expires (every hour), with no further
manual steps, for as long as the refresh token stays valid (TikTok expires
it after about a year of the integration going completely unused, which
normal hourly traffic won't hit).

## What happens if any of this isn't done yet

`getLatestTikToks()` returns `null` rather than throwing, and
`TikTokCarousel.astro` renders nothing at all in that case -- the homepage
never shows a broken or empty section, it just doesn't show this one until
it's wired up.
