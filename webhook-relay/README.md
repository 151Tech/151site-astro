# Storyblok -> GitHub rebuild relay

Storyblok publishes -> this Worker -> GitHub `repository_dispatch` ->
`.github/workflows/storyblok-rebuild.yml` -> snapshot refresh + push ->
Webflow Cloud redeploy.

This exists because Storyblok's webhook config allows only a URL and a list
of events: no custom headers and no custom request body. GitHub's dispatch
endpoint requires both, so the two can't be wired together directly.

## Setup (one time)

1. **GitHub token** - create a fine-grained PAT scoped to
   `151Tech/151coffee-storyblok` with **Contents: read and write**.
   Nothing else is needed.

2. **Deploy the Worker** (free plan is fine):

   ```
   cd webhook-relay
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN      # paste the PAT
   npx wrangler secret put STORYBLOK_SECRET  # any long random string
   npx wrangler deploy
   ```

   Note the deployed URL, e.g.
   `https://storyblok-rebuild-relay.<subdomain>.workers.dev`.

3. **Storyblok** - Settings -> Webhooks -> New Webhook:
   - Endpoint: `https://storyblok-rebuild-relay.<subdomain>.workers.dev/?token=<STORYBLOK_SECRET>`
   - Events: `story.published` and `story.unpublished`

## Verifying

Publish anything in Storyblok, then:

```
gh run list --workflow=storyblok-rebuild.yml --event=repository_dispatch --limit 5
```

A run should appear within a few seconds. End to end (publish -> live) is
roughly 1-3 minutes, almost all of it Webflow's build.

The hourly `schedule` in the workflow stays as a backstop, so a missed
webhook delays a publish by up to an hour rather than losing it.
