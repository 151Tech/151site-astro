import { describe, it, expect } from 'vitest';
import { metaDescription, prune, parseDailyHours, absolute } from '../src/lib/seo';

describe('metaDescription', () => {
  it('leaves a short description as written', () => {
    expect(metaDescription('Drive-thru coffee in Keller.')).toBe('Drive-thru coffee in Keller.');
  });

  it('collapses whitespace from CMS text', () => {
    expect(metaDescription('  Coffee\n  and   food.  ')).toBe('Coffee and food.');
  });

  it('returns undefined for nothing, so the tag is omitted rather than empty', () => {
    expect(metaDescription(undefined)).toBeUndefined();
    expect(metaDescription('')).toBeUndefined();
    expect(metaDescription('   ')).toBeUndefined();
  });

  it('cuts a long description at the last full sentence that fits', () => {
    const text =
      'We serve drive-thru coffee, cold brew and hot food in Keller, Texas. ' +
      'Open daily from six in the morning until eight at night, every day of the week.';
    const out = metaDescription(text)!;
    expect(out.endsWith('.')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(text.startsWith(out)).toBe(true);
  });

  it('falls back to a word boundary and an ellipsis when no sentence fits', () => {
    const text = 'a'.repeat(50) + ' ' + 'b'.repeat(50) + ' ' + 'c'.repeat(80);
    const out = metaDescription(text)!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(155);
    // Never cuts mid-word.
    expect(out.slice(0, -1).trim()).toBe('a'.repeat(50) + ' ' + 'b'.repeat(50));
  });

  it('does not leave a dangling joining word before the ellipsis', () => {
    const text = `${'word '.repeat(28)}and ${'tail '.repeat(20)}`;
    const out = metaDescription(text)!;
    expect(out).not.toMatch(/\b(a|an|and|at|for|in|of|on|or|the|to|with)…$/i);
  });
});

describe('prune', () => {
  it('removes undefined, null and empty strings', () => {
    expect(prune({ a: 1, b: undefined, c: null, d: '' })).toEqual({ a: 1 });
  });

  it('removes objects and arrays left empty', () => {
    expect(prune({ a: 1, nested: { b: '' }, list: [null, ''] })).toEqual({ a: 1 });
  });

  it('keeps falsy values that are real data', () => {
    // A zero rating or an explicit false is a fact, not a missing value.
    expect(prune({ count: 0, open: false })).toEqual({ count: 0, open: false });
  });

  it('prunes inside arrays without leaving holes', () => {
    expect(prune({ list: ['a', null, 'b'] })).toEqual({ list: ['a', 'b'] });
  });

  it('returns undefined for an object with nothing left', () => {
    expect(prune({ a: '', b: null })).toBeUndefined();
  });
});

describe('parseDailyHours', () => {
  it('parses a simple daily range', () => {
    expect(parseDailyHours('6am-8pm')).toMatchObject({
      opens: '06:00',
      closes: '20:00',
      openLabel: '6 AM',
      closeLabel: '8 PM',
    });
  });

  it('accepts the separators and prefixes the CMS actually contains', () => {
    for (const text of ['6am - 8pm', '6am – 8pm', '6am to 8pm', 'Open daily 6am-8pm']) {
      expect(parseDailyHours(text), text).toMatchObject({ opens: '06:00', closes: '20:00' });
    }
  });

  it('keeps minutes', () => {
    expect(parseDailyHours('6:30am-8:30pm')).toMatchObject({
      opens: '06:30',
      closes: '20:30',
      openLabel: '6:30 AM',
    });
  });

  it('handles noon and midnight', () => {
    expect(parseDailyHours('12am-12pm')).toMatchObject({ opens: '00:00', closes: '12:00' });
  });

  it('gives up on weekday-specific hours rather than guessing', () => {
    // The page then shows the CMS text as written and the schema omits
    // hours, which is the safe outcome: wrong hours in schema are worse
    // than none.
    expect(parseDailyHours('Mon-Fri 6am-8pm')).toBeUndefined();
    expect(parseDailyHours('Sat-Sun 7am-7pm')).toBeUndefined();
  });

  it('gives up on anything it cannot parse', () => {
    expect(parseDailyHours('')).toBeUndefined();
    expect(parseDailyHours(undefined)).toBeUndefined();
    expect(parseDailyHours(null)).toBeUndefined();
    expect(parseDailyHours(123)).toBeUndefined();
    expect(parseDailyHours('call ahead')).toBeUndefined();
    expect(parseDailyHours('6am')).toBeUndefined();
    expect(parseDailyHours('13am-8pm')).toBeUndefined();
    // An open and close at the same time describes nothing.
    expect(parseDailyHours('6am-6am')).toBeUndefined();
  });
});

describe('absolute', () => {
  it('builds canonical URLs on the production host', () => {
    expect(absolute('/menu')).toBe('https://www.151coffee.com/menu');
    expect(absolute('/locations/151-coffee-keller')).toBe(
      'https://www.151coffee.com/locations/151-coffee-keller',
    );
  });
});
