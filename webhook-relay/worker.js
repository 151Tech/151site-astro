// Storyblok -> GitHub relay.
//
// Storyblok's webhook config is URL + events only: it sends a fixed JSON
// body and no custom headers. GitHub's repository_dispatch endpoint needs
// both an Authorization header and an `event_type` field in the body, so
// Storyblok cannot call it directly (it would 401, then 422). This Worker
// is the ~30 lines that bridge the two.
//
// Deploy free on Cloudflare Workers. Secrets (wrangler secret put NAME):
//   GITHUB_TOKEN     fine-grained PAT, Contents: read+write on the repo
//   STORYBLOK_SECRET shared secret, matched against the ?token= query param
// Vars (wrangler.toml [vars]):
//   GITHUB_REPO      e.g. "151Tech/151coffee-storyblok"

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Storyblok can't send an auth header, so the shared secret rides in the
    // query string instead. Without this the endpoint is an open trigger for
    // anyone who learns the URL.
    const url = new URL(request.url);
    if (url.searchParams.get('token') !== env.STORYBLOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }

    // Logged so a failed rebuild can be traced back to the story that
    // caused it; Storyblok's own webhook log only shows our response.
    const payload = await request.json().catch(() => ({}));
    console.log('storyblok webhook', JSON.stringify(payload));

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        // GitHub rejects API requests that send no User-Agent.
        'User-Agent': 'storyblok-rebuild-relay',
      },
      body: JSON.stringify({
        event_type: 'storyblok-publish',
        client_payload: {
          action: payload.action ?? null,
          full_slug: payload.full_slug ?? null,
          story_id: payload.story_id ?? null,
        },
      }),
    });

    // 204 is GitHub's success response for this endpoint.
    if (res.status !== 204) {
      const body = await res.text();
      console.error('github dispatch failed', res.status, body);
      return new Response(`GitHub dispatch failed: ${res.status}`, { status: 502 });
    }
    return new Response('ok', { status: 200 });
  },
};
