// FAQ answers are plain CMS strings rendered into a <p>. One of them ends in
// a call to action - "check gift card balances by clicking here" - which
// was a sentence pointing at nothing, since there was no way for an editor
// to put a control inside a text field. This turns that word into the button
// that opens the gift-card modal (the [data-open-giftcard] handler lives in
// public/js/script.js, and the modal itself is in Footer.astro, so it's
// present on every page an FAQ can appear on).
//
// Shared because the homepage renders its FAQ inline (src/pages/index.astro)
// while the block-based pages use FaqAccordion.astro, and the two shouldn't
// disagree about what an answer looks like.

// Escaped first: the answer is editor-supplied text, and the only markup
// allowed into the output is what the replacement below puts there.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function faqAnswerHtml(answer: string): string {
  return escapeHtml(answer ?? '').replace(
    /\b(click|clicking) here\b/gi,
    '$1 <button type="button" class="faq-inline-link" data-open-giftcard>here</button>',
  );
}
