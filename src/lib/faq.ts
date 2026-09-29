import { escapeHtml } from './html';

// FAQ answers are plain CMS text. A "click here" in an answer becomes a
// button that opens the gift card modal (handled by [data-open-giftcard] in
// public/js/script.js). Used by the homepage FAQ and FaqAccordion.astro.
export function faqAnswerHtml(answer: string): string {
  return escapeHtml(answer ?? '').replace(
    /\b(click|clicking) here\b/gi,
    '$1 <button type="button" class="faq-inline-link" data-open-giftcard>here</button>',
  );
}
