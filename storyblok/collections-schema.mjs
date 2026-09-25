// Hand-authored Storyblok schemas for the flat, repeated collections
// (drinks, categories, locations, settings). These already have an exact
// shape defined in src/content.config.ts (Zod), so inferring them generically
// per-file would risk two files with slightly different shapes (e.g. a
// `tags: null` drink vs one with `tags: [...]`) fighting over one shared
// component's schema depending on processing order. Hand-authoring them
// once from the Zod source of truth avoids that entirely.
import crypto from 'node:crypto';

const uid = () => crypto.randomUUID();

export const NAV_LINK_SCHEMA = {
  label: { type: 'text' },
  href: { type: 'text' },
};

// A dropdown of locations instead of a hand-typed list, same reasoning as
// the `category` field above: sourced live from the `location` stories
// under locations/ so a new store shows up here automatically.
const UNAVAILABLE_AT_SCHEMA = {
  type: 'options',
  display_name: 'Unavailable At',
  description: "Locations that do NOT carry this. Leave empty if it is available everywhere. Also hides it from the menu's \"All Stores\" view, since it isn't available at every location.",
  source: 'internal_stories',
  filter_content_type: ['location'],
  folder_slug: 'locations',
};

const US_STATES = [
  ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'], ['California', 'CA'],
  ['Colorado', 'CO'], ['Connecticut', 'CT'], ['Delaware', 'DE'], ['Florida', 'FL'], ['Georgia', 'GA'],
  ['Hawaii', 'HI'], ['Idaho', 'ID'], ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'],
  ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Louisiana', 'LA'], ['Maine', 'ME'], ['Maryland', 'MD'],
  ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'], ['Mississippi', 'MS'], ['Missouri', 'MO'],
  ['Montana', 'MT'], ['Nebraska', 'NE'], ['Nevada', 'NV'], ['New Hampshire', 'NH'], ['New Jersey', 'NJ'],
  ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'], ['Ohio', 'OH'],
  ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'], ['Rhode Island', 'RI'], ['South Carolina', 'SC'],
  ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'], ['Utah', 'UT'], ['Vermont', 'VT'],
  ['Virginia', 'VA'], ['Washington', 'WA'], ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY'],
  ['Washington DC', 'DC'],
];

export const COMPONENTS = {
  drink: {
    name: 'drink',
    is_root: true,
    schema: {
      name: { type: 'text' },
      category: {
        type: 'option',
        display_name: 'Category',
        description: 'Which menu section this drink belongs under (Coffee, Cold Brew, Energy, etc.). Controls where it appears on the menu.',
        // Sourced live from the `category` stories under categories/ instead of
        // a hand-maintained list, so a new category shows up here as soon as
        // it's created in Storyblok - no schema push required.
        source: 'internal_stories',
        filter_content_type: ['category'],
        folder_slug: 'categories',
      }, // Storyblok slug of the matching category story
      subtitle: { type: 'text' },
      description: { type: 'textarea' },
      image: {
        type: 'asset',
        filetypes: ['images'],
        display_name: 'Photo',
        description: 'The picture of this drink shown on the menu and its detail page. Click to choose or upload an image.',
      },
      badge: { type: 'text' },
      tags: { type: 'bloks', restrict_components: true, component_whitelist: ['text_item'] },
      menuOrder: { type: 'number' },
      unavailableAt: UNAVAILABLE_AT_SCHEMA,
    },
  },
  category: {
    name: 'category',
    is_root: true,
    schema: {
      title: { type: 'text' },
      number: { type: 'text' },
      description: { type: 'textarea' },
      extraCards: { type: 'bloks', restrict_components: true, component_whitelist: ['category_extra_card'] },
      unavailableAt: UNAVAILABLE_AT_SCHEMA,
      hiddenByDefault: {
        type: 'boolean',
        display_name: "Hide (on = won't show on the menu at all)",
        description: "Hides this category everywhere, for every location, no exceptions - use this for a fully retired or empty seasonal category. For a category that's just missing at a few stores, use Unavailable At below instead.",
      },
    },
  },
  category_extra_card: {
    name: 'category_extra_card',
    schema: {
      label: { type: 'text' },
      items: { type: 'bloks', restrict_components: true, component_whitelist: ['text_item'] },
    },
  },
  location: {
    name: 'location',
    is_root: true,
    schema: {
      name: { type: 'text' },
      address: { type: 'text' },
      city: { type: 'text' },
      state: {
        type: 'option',
        display_name: 'State',
        description: 'Which state this location is in.',
        options: US_STATES.map(([name, value]) => ({ name, value })),
      },
      zip: { type: 'text' },
      lat: { type: 'number' },
      lng: { type: 'number' },
      displayOrder: { type: 'number' },
      image: {
        type: 'asset',
        filetypes: ['images'],
        display_name: 'Store Photo',
        description: 'The picture of this store shown on its location page. Click to choose or upload an image.',
      },
      hours: { type: 'text' },
    },
  },
  text_item: {
    name: 'text_item',
    schema: { value: { type: 'text' } },
  },
  // One shared, reusable schema for every SMS/text-link discount landing
  // page (see storyblok/push-landing-pages.mjs), instead of a bespoke
  // component per page like the hand-built site pages get - the whole
  // point is that a non-developer can duplicate the "template" story in
  // Storyblok and have a new page with zero schema changes. Deliberately
  // flat, single-offer fields (not a generic "sections" bloks array like
  // page.astro's supplementary blocks) because these are read on a phone
  // via a text message: the entire offer has to fit above the fold on any
  // phone with no scrolling, which only holds together with a fixed,
  // single-card layout.
  landing_page: {
    name: 'landing_page',
    is_root: true,
    schema: {
      eyebrow: {
        type: 'text',
        display_name: 'Eyebrow',
        description: 'Small label above the headline, e.g. "VETERANS DAY" or "151 REWARDS".',
      },
      headline: {
        type: 'text',
        display_name: 'Headline',
        description: 'The big, bold line - keep this short, it is the first thing read on a phone.',
      },
      offer: {
        type: 'textarea',
        display_name: 'Offer',
        description: 'The main offer sentence, e.g. "One free drink of any size."',
      },
      code: {
        type: 'text',
        display_name: 'Promo Code (optional)',
        description: 'Shown in a copyable code chip. Leave blank if this offer has no code (e.g. redeemed by showing an ID instead).',
      },
      instructions: {
        type: 'textarea',
        display_name: 'How To Redeem',
        description: 'Short redemption steps, e.g. "Show this text and a valid ID to your barista before ordering."',
      },
      terms: {
        type: 'textarea',
        display_name: 'Fine Print (optional)',
        description: 'Expiration/eligibility text shown small at the bottom, e.g. "Expires 7 days from the date you received this text."',
      },
      ctaLabel: { type: 'text', display_name: 'Button Label' },
      ctaHref: { type: 'text', display_name: 'Button Link', description: 'Where the button goes, e.g. /locations.' },
      image: {
        type: 'asset',
        filetypes: ['images'],
        display_name: 'Photo (optional)',
        description: 'A bonus image below the offer card. Only shows if it fits after the required text on that phone - never pushes the offer itself below the fold.',
      },
    },
  },
  settings_global: {
    name: 'settings_global',
    is_root: true,
    schema: {
      siteName: { type: 'text' },
      logo: {
        type: 'asset',
        filetypes: ['images'],
        display_name: 'Logo',
        description: 'The site logo shown in the header and footer. Click to choose or upload an image.',
      },
      slogan: { type: 'text' },
      copyright: { type: 'text' },
      phone: { type: 'text' },
      hours: { type: 'text' },
      email: { type: 'text' },
      realEstateEmail: { type: 'text' },
      giftCardLabel: { type: 'text' },
      giftCardUrl: { type: 'text' },
      nav: { type: 'bloks', restrict_components: true, component_whitelist: ['nav_link'] },
      social: { type: 'bloks', restrict_components: true, component_whitelist: ['settings_global_social'], maximum: 1 },
      footer: { type: 'bloks', restrict_components: true, component_whitelist: ['settings_global_footer'], maximum: 1 },
    },
  },
  nav_link: { name: 'nav_link', schema: NAV_LINK_SCHEMA },
  settings_global_social: {
    name: 'settings_global_social',
    schema: {
      instagram: { type: 'text' },
      facebook: { type: 'text' },
      tiktok: { type: 'text' },
      linkedin: { type: 'text' },
    },
  },
  settings_global_footer: {
    name: 'settings_global_footer',
    schema: {
      companyHeading: { type: 'text' },
      companyLinks: { type: 'bloks', restrict_components: true, component_whitelist: ['nav_link'] },
      socialHeading: { type: 'text' },
      supportHeading: { type: 'text' },
      contactLabel: { type: 'text' },
      callLabel: { type: 'text' },
      supportLabel: { type: 'text' },
      giftCardCheckLabel: { type: 'text' },
      giftCardButtonLabel: { type: 'text' },
    },
  },
};

const textItems = (arr) => (arr ?? []).map((v) => ({ component: 'text_item', _uid: uid(), value: String(v) }));
const navLinks = (arr) => (arr ?? []).map((l) => ({ component: 'nav_link', _uid: uid(), label: l.label ?? '', href: l.href ?? '' }));

// Old YAML content referenced categories by file path
// ("src/content/categories/coffee.yaml"). Convert that to the matching
// Storyblok slug ("categories/coffee") so the reference still resolves
// once the content lives in Storyblok.
function categorySlug(ref) {
  const m = /^src\/content\/categories\/(.+)\.yaml$/.exec(ref ?? '');
  if (!m) return ref ?? '';
  const slug = m[1]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `categories/${slug}`;
}

function locationSlug(ref) {
  const m = /^src\/content\/locations\/(.+)\.yaml$/.exec(ref ?? '');
  if (!m) return ref ?? '';
  const slug = m[1]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `locations/${slug}`;
}

export function drinkContent(d) {
  return {
    component: 'drink',
    name: d.name ?? '',
    category: categorySlug(d.category),
    subtitle: d.subtitle ?? '',
    description: d.description ?? '',
    image: d.image ?? '',
    badge: d.badge ?? '',
    tags: textItems(d.tags),
    menuOrder: String(d.menuOrder ?? 99),
    unavailableAt: (d.unavailableAt ?? []).map(locationSlug),
  };
}

export function categoryContent(c) {
  return {
    component: 'category',
    title: c.title ?? '',
    number: c.number ?? '99',
    description: c.description ?? '',
    extraCards: (c.extraCards ?? []).map((card) => ({
      component: 'category_extra_card',
      _uid: uid(),
      label: card.label ?? '',
      items: textItems(card.items),
    })),
    unavailableAt: (c.unavailableAt ?? []).map(locationSlug),
    hiddenByDefault: !!c.hiddenByDefault,
  };
}

export function locationContent(l) {
  return {
    component: 'location',
    name: l.name ?? '',
    address: l.address ?? '',
    city: l.city ?? '',
    state: l.state ?? '',
    zip: l.zip ?? '',
    lat: String(l.lat ?? 0),
    lng: String(l.lng ?? 0),
    displayOrder: String(l.displayOrder ?? 99),
    image: l.image ?? '',
    hours: l.hours ?? '',
  };
}

export function landingPageContent(l) {
  return {
    component: 'landing_page',
    eyebrow: l.eyebrow ?? '',
    headline: l.headline ?? '',
    offer: l.offer ?? '',
    code: l.code ?? '',
    instructions: l.instructions ?? '',
    terms: l.terms ?? '',
    ctaLabel: l.ctaLabel ?? 'View Locations',
    ctaHref: l.ctaHref ?? '/locations',
    image: l.image ?? null,
  };
}

export function settingsGlobalContent(s) {
  return {
    component: 'settings_global',
    siteName: s.siteName ?? '',
    logo: s.logo ?? '',
    slogan: s.slogan ?? '',
    copyright: s.copyright ?? '',
    phone: s.phone ?? '',
    hours: s.hours ?? '',
    email: s.email ?? '',
    realEstateEmail: s.realEstateEmail ?? '',
    giftCardLabel: s.giftCardLabel ?? '',
    giftCardUrl: s.giftCardUrl ?? '',
    nav: navLinks(s.nav),
    social: [
      {
        component: 'settings_global_social',
        _uid: uid(),
        instagram: s.social?.instagram ?? '',
        facebook: s.social?.facebook ?? '',
        tiktok: s.social?.tiktok ?? '',
        linkedin: s.social?.linkedin ?? '',
      },
    ],
    footer: [
      {
        component: 'settings_global_footer',
        _uid: uid(),
        companyHeading: s.footer?.companyHeading ?? '',
        companyLinks: navLinks(s.footer?.companyLinks),
        socialHeading: s.footer?.socialHeading ?? '',
        supportHeading: s.footer?.supportHeading ?? '',
        contactLabel: s.footer?.contactLabel ?? '',
        callLabel: s.footer?.callLabel ?? '',
        supportLabel: s.footer?.supportLabel ?? '',
        giftCardCheckLabel: s.footer?.giftCardCheckLabel ?? '',
        giftCardButtonLabel: s.footer?.giftCardButtonLabel ?? '',
      },
    ],
  };
}
