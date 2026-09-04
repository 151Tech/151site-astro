// Bridges Storyblok's publish webhook to GitHub's repository_dispatch API.
// Storyblok's native webhook can only POST to a plain URL - it can't set an
// Authorization header, and its HMAC signing (webhook-signature) is a paid-plan
// feature this space doesn't have. So Storyblok is configured to hit this
// Worker's URL with a `?token=` query param instead, and this Worker is the
// only thing that holds the GitHub token needed to actually call the API.
const GITHUB_REPO = '151Tech/151coffee-storyblok';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const token = new URL(request.url).searchParams.get('token');
    if (!token || token !== env.RELAY_TOKEN) {
      return new Response('Forbidden', { status: 403 });
    }

    const dispatchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'storyblok-rebuild-relay',
      },
      body: JSON.stringify({ event_type: 'storyblok-publish' }),
    });

    if (!dispatchRes.ok) {
      const text = await dispatchRes.text();
      return new Response(`GitHub dispatch failed: ${dispatchRes.status} ${text}`, { status: 502 });
    }

    return new Response('ok', { status: 202 });
  },
};
