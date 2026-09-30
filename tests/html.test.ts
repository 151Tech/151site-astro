import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/lib/html';
import { faqAnswerHtml } from '../src/lib/faq';

describe('escapeHtml', () => {
  it('escapes the characters that break out of content or an attribute', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"quoted" and 'single'`)).toBe('&quot;quoted&quot; and &#39;single&#39;');
  });

  it('escapes the ampersand itself, not just the entity it introduces', () => {
    // Escaping < before & would produce &amp;lt; on a second pass; this
    // asserts a single correct pass.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('151 Coffee')).toBe('151 Coffee');
  });
});

describe('faqAnswerHtml', () => {
  // This is the one place CMS text becomes raw HTML (set:html in the FAQ
  // accordion). Anything an editor types must come out escaped, with only
  // the button this function adds surviving as markup.
  it('turns "click here" into the gift card button', () => {
    expect(faqAnswerHtml('Just click here to buy one.')).toBe(
      'Just click <button type="button" class="faq-inline-link" data-open-giftcard>here</button> to buy one.',
    );
  });

  it('matches case-insensitively and keeps the word the editor used', () => {
    expect(faqAnswerHtml('Clicking here works.')).toContain('Clicking <button');
    expect(faqAnswerHtml('Click here.')).toContain('Click <button');
  });

  it('escapes CMS text, so an editor cannot inject markup', () => {
    const out = faqAnswerHtml('<img src=x onerror=alert(1)> click here');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
  });

  it('cannot be tricked into emitting a second button by typed markup', () => {
    const out = faqAnswerHtml('<button data-open-giftcard>x</button>');
    expect(out.match(/<button/g)).toBeNull();
  });

  it('leaves an answer without the phrase untouched', () => {
    expect(faqAnswerHtml('We open at 6am.')).toBe('We open at 6am.');
  });

  it('does not throw on empty input', () => {
    expect(faqAnswerHtml('')).toBe('');
  });
});
