// Structured data (JSON-LD) and meta helpers.
//
// Values come from Storyblok. Defaults are used only for facts the site
// already publishes (founder, founding year); anything uncertain is left
// out, because missing markup is harmless and wrong markup is not. Empty
// values are removed before output (see `prune`).
import { imageUrl } from './storyblok';
import { itemPath, routableItems } from './menu-urls.mjs';

export const SITE = 'https://www.151coffee.com';

export const absolute = (path: string) => new URL(path, SITE).href;

// Meta descriptions longer than this get cut off in search results.
const DESCRIPTION_MAX = 155;

// Trims a meta description to fit search results: at the last full
// sentence that fits, or else at a word boundary with an ellipsis.
export function metaDescription(text: string | undefined): string | undefined {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= DESCRIPTION_MAX) return clean || undefined;
  const head = clean.slice(0, DESCRIPTION_MAX);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentenceEnd >= 90) return head.slice(0, sentenceEnd + 1);
  const words = head.slice(0, -1).split(' ').slice(0, -1);
  while (words.length && /^(a|an|and|at|for|in|of|on|or|the|to|with|[,;:&-]+)$/i.test(words.at(-1)!)) words.pop();
  return `${words.join(' ').replace(/[,;:]$/, '')}…`;
}

// Recursively removes undefined, null and empty-string values, and any
// object or array left empty as a result.
export function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined);
    return (arr.length ? arr : undefined) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      const p = prune(v);
      if (p !== undefined) out[k] = p;
    }
    return (Object.keys(out).length ? out : undefined) as T;
  }
  if (value === null || value === '') return undefined as T;
  return value;
}

// One @id for the brand, so every page's schema points at the same entity.
const ORG_ID = `${SITE}/#organization`;

// --- Opening hours ---------------------------------------------------------
const TIME = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;

function parseTime(raw: string) {
  const m = raw.trim().match(TIME);
  if (!m) return undefined;
  const hour12 = Number(m[1]);
  if (hour12 < 1 || hour12 > 12) return undefined;
  const minute = m[2] ?? '00';
  const meridiem = m[3].toUpperCase();
  const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  return {
    time24: `${String(hour24).padStart(2, '0')}:${minute}`,
    label: `${hour12}${minute !== '00' ? `:${minute}` : ''} ${meridiem}`,
  };
}

// Parses free-text store hours like "6am-8pm" into one daily range.
// Anything else (weekday-specific hours, notes) returns undefined, so the
// page shows the text as written and the schema leaves hours out.
export function parseDailyHours(hours: unknown) {
  if (typeof hours !== 'string' || /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(hours)) return undefined;
  const parts = hours
    .replace(/^\s*open daily\s*/i, '')
    .split(/\s*(?:-|–|—|\bto\b)\s*/i)
    .filter(Boolean);
  if (parts.length !== 2) return undefined;
  const open = parseTime(parts[0]);
  const close = parseTime(parts[1]);
  if (!open || !close || open.time24 === close.time24) return undefined;
  return { opens: open.time24, closes: close.time24, openLabel: open.label, closeLabel: close.label };
}

function openingHours(hours: unknown) {
  const parsed = parseDailyHours(hours);
  if (!parsed) return undefined;
  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: parsed.opens,
    closes: parsed.closes,
  };
}

// --- Organization ----------------------------------------------------------
export function organizationSchema(s: any) {
  const social = (Array.isArray(s?.social) ? s.social[0] : s?.social) ?? {};
  return prune({
    '@type': 'Organization',
    '@id': ORG_ID,
    name: s?.siteName || '151 Coffee',
    legalName: s?.legalName,
    url: `${SITE}/`,
    logo: imageUrl(s?.logo, { width: 512 }),
    image: ogImageUrl(s),
    telephone: s?.phone,
    email: s?.email,
    slogan: s?.slogan,
    priceRange: s?.priceRange,
    foundingDate: s?.foundingDate || '2017',
    founder: { '@type': 'Person', name: s?.founderName || 'Mark Wattles' },
    address: postalAddress({
      address: s?.streetAddress,
      city: s?.addressCity,
      state: s?.addressState,
      zip: s?.addressZip,
    }),
    sameAs: [social.facebook, social.instagram, social.tiktok, social.linkedin].filter(Boolean),
  });
}

// Requires at least a street and city: a partial address can geocode to the
// wrong place.
function postalAddress(o: { address?: string; city?: string; state?: string; zip?: string }) {
  if (!o.address || !o.city) return undefined;
  return prune({
    '@type': 'PostalAddress',
    streetAddress: o.address,
    addressLocality: o.city,
    addressRegion: o.state,
    postalCode: o.zip,
    addressCountry: 'US',
  });
}

// Social share image: the 1200x630 Global Settings image, else the logo.
export function ogImageUrl(s: any): string | undefined {
  return imageUrl(s?.ogImage, { width: 1200, height: 630 }) ?? imageUrl(s?.logo, { width: 512 });
}

// --- Locations -------------------------------------------------------------
// Store phone numbers are intentionally left out (the pages don't show one);
// the Organization node carries the main number.
export function locationSchema(loc: any, s: any, opts: { menuUrl?: string; amenities?: string[] } = {}) {
  const url = `${SITE}/locations/${loc.slug}`;
  return prune({
    '@type': 'CafeOrCoffeeShop',
    '@id': `${url}#store`,
    name: loc.name,
    url,
    image: imageUrl(loc.image, { width: 1200, height: 900 }),
    priceRange: s?.priceRange,
    currenciesAccepted: 'USD',
    servesCuisine: 'Coffee',
    address: postalAddress(loc),
    geo:
      Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
        ? { '@type': 'GeoCoordinates', latitude: Number(loc.lat), longitude: Number(loc.lng) }
        : undefined,
    openingHoursSpecification: openingHours(loc.hours ?? s?.hours),
    hasDriveThroughService: typeof loc.hasDriveThrough === 'boolean' ? loc.hasDriveThrough : undefined,
    hasMenu: opts.menuUrl,
    amenityFeature: opts.amenities?.length
      ? opts.amenities.map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true }))
      : undefined,
    parentOrganization: { '@id': ORG_ID },
    sameAs: [loc.googleMapsUrl].filter(Boolean),
  });
}

// --- Menu ------------------------------------------------------------------
export function menuItemSchema(drink: any) {
  return prune({
    '@type': 'MenuItem',
    '@id': `${SITE}${itemPath(drink)}#item`,
    name: drink.name,
    url: `${SITE}${itemPath(drink)}`,
    description: drink.description,
    image: imageUrl(drink.image, { width: 800 }),
    keywords: Array.isArray(drink.tags) && drink.tags.length ? drink.tags.join(', ') : undefined,
  });
}

export function menuSchema(allDrinks: any[], categories: any[]) {
  const drinks = routableItems(allDrinks, categories);
  // An item filed under a category that doesn't exist is on no menu page;
  // warn so it shows up in the build log.
  const placed = new Set(drinks.map((d: any) => d.slug));
  for (const d of allDrinks) {
    if (!placed.has(d.slug)) {
      console.warn(
        `[seo] "${d.name ?? d.slug}" has category ${JSON.stringify(d.category)}, which doesn't exist; left out of the menu schema`,
      );
    }
  }

  const sections = categories
    .map((cat: any) => {
      const items = drinks.filter((d: any) => d.category === `categories/${cat.slug}`);
      if (!items.length) return undefined;
      return {
        '@type': 'MenuSection',
        name: cat.title,
        hasMenuItem: items.map(menuItemSchema),
      };
    })
    .filter(Boolean);
  if (!sections.length) return undefined;
  return prune({
    '@type': 'Menu',
    '@id': `${SITE}/menu#menu`,
    name: '151 Coffee Menu',
    url: `${SITE}/menu`,
    hasMenuSection: sections,
  });
}

// --- Breadcrumbs -----------------------------------------------------------
// The last crumb is the current page and has no link.
export function breadcrumbSchema(trail: { name: string; url?: string }[]) {
  return prune({
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.url ? absolute(crumb.url) : undefined,
    })),
  });
}

// All of a page's schema nodes in one @graph.
export function graph(...nodes: any[]) {
  const entities = nodes.map(prune).filter(Boolean);
  if (!entities.length) return undefined;
  return { '@context': 'https://schema.org', '@graph': entities };
}
