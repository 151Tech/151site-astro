// Structured-data builders.
//
// Before this file the whole site emitted exactly two schema types
// (Organization on the homepage, FAQPage on the homepage and /loyalty), which
// left 15 store pages, 64 drink pages and the menu unmarked. Everything the
// markup needs was already in Storyblok and simply wasn't being expressed.
//
// Two rules hold throughout:
//
//   1. Every value is read from Storyblok, never hardcoded, so marketing owns
//      it. Where a field doesn't exist in the schema yet, a documented default
//      keeps the markup valid today and is superseded the moment an editor
//      fills the field in. Defaults are only used for facts already published
//      in the site's own copy (founder, founding year); anything that would be
//      a guess is omitted instead -- absent markup is fine, wrong markup is a
//      factual claim to Google.
//   2. Undefined-valued keys are stripped before serialising (see `prune`), so
//      a missing Storyblok field never ships as `"telephone": null` or an
//      empty node.
import { imageUrl } from './storyblok';

export const SITE = 'https://www.151coffee.com';

export const absolute = (path: string) => new URL(path, SITE).href;

// Recursively drops undefined/null/empty-string values and the objects and
// arrays that end up empty as a result. Lets every builder below be written as
// one flat literal with optional fields inline, instead of conditionally
// assembling objects key by key.
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

// A stable @id per entity so the separate JSON-LD blocks across the site
// resolve to one graph instead of many disconnected copies of the brand. This
// is what lets a store page say "I belong to that Organization" rather than
// re-declaring a second, unrelated organization.
export const ORG_ID = `${SITE}/#organization`;

// --- Opening hours ---------------------------------------------------------
// Storyblok stores hours as free text, currently the uniform "6am-8pm" on all
// 15 stores, with "Open daily 6 AM - 8 PM" as the global fallback. That is
// human copy, not data, so it is parsed conservatively: a confident match
// becomes openingHoursSpecification, and anything else yields nothing rather
// than a guessed schedule. Per-day or holiday hours can't be expressed in a
// single string at all -- that needs a real field per day, which is flagged
// as a content-model change rather than worked around here.
const TIME = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

function to24h(raw: string): string | undefined {
  const m = raw.match(TIME);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ?? '00';
  const meridiem = m[3].toLowerCase();
  if (hour < 1 || hour > 12) return undefined;
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

export function openingHours(hours: unknown) {
  if (typeof hours !== 'string' || !hours.trim()) return undefined;
  // Only the single "<open> - <close>" daily shape is trusted. A string
  // naming specific weekdays ("Mon-Fri 6am-8pm, Sat 7am-9pm") deliberately
  // fails this test and emits nothing, because guessing which days go with
  // which times is exactly the kind of wrong-but-confident markup to avoid.
  if (/\b(mon|tue|wed|thu|fri|sat|sun)/i.test(hours)) return undefined;
  const parts = hours.split(/\s*(?:-|–|—|to)\s*/i).filter(Boolean);
  if (parts.length !== 2) return undefined;
  const opens = to24h(parts[0]);
  const closes = to24h(parts[1]);
  if (!opens || !closes || opens === closes) return undefined;
  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens,
    closes,
  };
}

// --- Organization ----------------------------------------------------------
// `sameAs` needs no new Storyblok field: all four social URLs are already in
// settings_global > social, and sameAs is the property that binds a Knowledge
// Panel to those profiles.
export function organizationSchema(s: any) {
  const social = s?.social ?? {};
  return prune({
    '@type': 'Organization',
    '@id': ORG_ID,
    name: s?.siteName ?? '151 Coffee',
    legalName: s?.legalName,
    url: `${SITE}/`,
    logo: imageUrl(s?.logo, { width: 512 }),
    image: ogImageUrl(s),
    telephone: s?.phone,
    email: s?.email,
    slogan: s?.slogan,
    priceRange: s?.priceRange,
    // Both are stated in the site's own About copy, so defaulting them
    // restates published fact rather than inventing one.
    foundingDate: s?.foundingDate ?? '2017',
    founder: { '@type': 'Person', name: s?.founderName ?? 'Mark Wattles' },
    address: postalAddress({
      address: s?.streetAddress,
      city: s?.addressCity,
      state: s?.addressState,
      zip: s?.addressZip,
    }),
    sameAs: [social.facebook, social.instagram, social.tiktok, social.linkedin].filter(Boolean),
  });
}

export function postalAddress(o: { address?: string; city?: string; state?: string; zip?: string }) {
  // A partial address is worse than none: it can be geocoded to the wrong
  // place. Require at least a street and city before emitting anything.
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

// Site-wide social/AI preview image. settings_global > ogImage is the intended
// home for a proper 1200x630 card; until one is uploaded this falls back to
// the logo, which is square and not ideal but is a real Storyblok asset and
// strictly better than the nothing that 74 pages emit today.
export function ogImageUrl(s: any): string | undefined {
  return (
    imageUrl(s?.ogImage, { width: 1200, height: 630 }) ?? imageUrl(s?.logo, { width: 512 })
  );
}

// --- Locations -------------------------------------------------------------
// CafeOrCoffeeShop is a subtype of both LocalBusiness and FoodEstablishment,
// so it carries the local fields (geo, hours, address) and the food ones
// (hasMenu, hasDriveThroughService, servesCuisine) in a single node.
export function locationSchema(loc: any, s: any, opts: { menuUrl?: string } = {}) {
  const url = `${SITE}/locations/${loc.slug}`;
  return prune({
    '@type': 'CafeOrCoffeeShop',
    '@id': `${url}#store`,
    name: loc.name,
    url,
    image: imageUrl(loc.image, { width: 1200, height: 900 }),
    // Per-store number when Storyblok has one, else the brand line. All 15
    // stores share the corporate number, which is correct and expected for a
    // chain -- NAP consistency is about one location's details conflicting
    // between sources, not about locations sharing a central line. The
    // per-store override exists only for stores that ever get their own.
    telephone: loc.phone ?? s?.phone,
    priceRange: s?.priceRange,
    currenciesAccepted: 'USD',
    servesCuisine: 'Coffee',
    address: postalAddress(loc),
    geo:
      Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
        ? { '@type': 'GeoCoordinates', latitude: Number(loc.lat), longitude: Number(loc.lng) }
        : undefined,
    openingHoursSpecification: openingHours(loc.hours ?? s?.hours),
    // Left undefined unless Storyblok says so: asserting a drive-thru that
    // isn't there is a factual error, and it is this brand's core claim.
    hasDriveThroughService: typeof loc.hasDriveThrough === 'boolean' ? loc.hasDriveThrough : undefined,
    hasMenu: opts.menuUrl,
    parentOrganization: { '@id': ORG_ID },
    sameAs: [loc.googleMapsUrl].filter(Boolean),
  });
}

// --- Menu ------------------------------------------------------------------
export function menuItemSchema(drink: any) {
  return prune({
    '@type': 'MenuItem',
    '@id': `${SITE}/drinks/${drink.slug}#item`,
    name: drink.name,
    url: `${SITE}/drinks/${drink.slug}`,
    description: drink.description,
    image: imageUrl(drink.image, { width: 800 }),
    // Flavour tags read naturally as the item's characteristics. No price
    // field exists in the content model, so `offers` is deliberately absent.
    keywords: Array.isArray(drink.tags) && drink.tags.length ? drink.tags.join(', ') : undefined,
  });
}

export function menuSchema(drinks: any[], categories: any[]) {
  // A drink whose category has no matching category story can't be placed in
  // any MenuSection and would vanish from the menu silently -- which is how
  // "Boston" (category `categories/desserts`, a category that doesn't exist)
  // went unnoticed. Same reasoning as the loud snapshot warnings in
  // storyblok.ts: a content gap should be visible in the build log, because
  // the alternative is a drink that quietly isn't on the menu.
  const known = new Set(categories.map((c: any) => `categories/${c.slug}`));
  for (const d of drinks) {
    if (!known.has(d.category)) {
      console.warn(
        `[seo] drink "${d.name ?? d.slug}" has category ${JSON.stringify(d.category)}, which has no matching category story -- omitted from Menu schema`,
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
// 83 of 88 indexable pages sit two levels deep with no breadcrumb trail at
// all, which costs both a rich result and a crawl-depth signal.
export function breadcrumbSchema(trail: { name: string; url?: string }[]) {
  return prune({
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      // The last crumb is the current page and takes no item, per Google's
      // guidance that the trailing element be unlinked.
      item: crumb.url ? absolute(crumb.url) : undefined,
    })),
  });
}

// Wraps any number of nodes in a single @graph. One script tag per page keeps
// the entities cross-referencing each other by @id rather than shipping
// several disconnected blocks.
export function graph(...nodes: any[]) {
  const entities = nodes.map(prune).filter(Boolean);
  if (!entities.length) return undefined;
  return { '@context': 'https://schema.org', '@graph': entities };
}
