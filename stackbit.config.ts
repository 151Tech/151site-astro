import { defineStackbitConfig, SiteMapEntry } from '@stackbit/types';
import { GitContentSource } from '@stackbit/cms-git';

// Reusable SEO block (browser-tab title, meta description, social share image)
// added to every page model so search/social metadata is editable per page.
const seoField: any = {
  name: 'seo', type: 'object', label: 'SEO & Social', fields: [
    { name: 'title', type: 'string', label: 'Browser tab / search title' },
    { name: 'description', type: 'string', label: 'Meta description' },
    { name: 'ogImage', type: 'image', label: 'Social share image' },
  ],
};

// The full set of add-on section block models -- kept in one place since
// every page's `sections` field offers the same picker. Add a new block
// type by creating its component + model (see the block models further
// down) and adding its name here.
const BLOCK_MODELS = [
  'PromoBannerBlock', 'ImageBannerBlock', 'SplitFeatureBlock', 'CtaSectionBlock',
  'TestimonialGridBlock', 'StatStripBlock', 'FaqAccordionBlock', 'CardGridBlock',
];

function sectionsField(label: string, description: string): any {
  return { name: 'sections', type: 'list', label, description,
    items: { type: 'model', models: BLOCK_MODELS },
  };
}

export default defineStackbitConfig({
  stackbitVersion: '~0.6.0',
  ssgName: 'astro',
  nodeVersion: '22',

  contentSources: [
    new GitContentSource({
      rootPath: process.cwd(),
      contentDirs: ['src/content'],
      assetsConfig: {
        referenceType: 'static',
        staticDir: 'public',
        uploadDir: 'images',
        publicPath: '/',
      },
      models: [
        {
          name: 'PageHome',
          type: 'page',
          filePath: 'src/content/pages/home.yaml',
          urlPath: '/',
          fields: [
            seoField,
            { name: 'visibility', type: 'object', label: 'Section visibility', description: 'Turn sections on/off without deleting their content.', fields: [
              { name: 'locations', type: 'boolean', label: 'Show Locations section', default: true },
              { name: 'menuGrid', type: 'boolean', label: 'Show Menu section', default: true },
              { name: 'cta', type: 'boolean', label: 'Show CTA (hiring) section', default: true },
              { name: 'reviews', type: 'boolean', label: 'Show Reviews section', default: true },
              { name: 'faq', type: 'boolean', label: 'Show FAQ section', default: true },
              { name: 'contact', type: 'boolean', label: 'Show Contact section', default: true },
            ]},
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheadingLine1', type: 'string' },
              { name: 'subheadingLine2', type: 'string' },
              { name: 'ctaLabel', type: 'string' },
              { name: 'ctaHref', type: 'string' },
              { name: 'videoUrl', type: 'file', label: 'Hero background video', description: 'Pick a video from your media library, or paste a YouTube/Vimeo link. Leave blank for the default video.', validations: { fileTypeGroups: ['video'] } },
            ]},
            { name: 'featuredDrink', type: 'object', fields: [
              { name: 'visible', type: 'boolean', label: 'Show this section', description: 'Turn off to hide the featured/LTO drink banner from the homepage entirely.', default: true },
              { name: 'badge', type: 'string' },
              { name: 'name', type: 'string' },
              { name: 'nameBold', type: 'string' },
              { name: 'description', type: 'string' },
              { name: 'image', type: 'image' },
              { name: 'imageAlt', type: 'string' },
              { name: 'ctaLabel', type: 'string' },
              { name: 'ctaHref', type: 'string' },
            ]},
            { name: 'menuSection', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'cards', type: 'list', items: { type: 'object', fields: [
                { name: 'title', type: 'string' },
                { name: 'subtitle', type: 'string' },
                { name: 'image', type: 'image' },
                { name: 'href', type: 'string' },
                { name: 'label', type: 'string' },
              ]}},
            ]},
            { name: 'cta', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'string' },
              { name: 'ctaLabel', type: 'string' },
              { name: 'ctaHref', type: 'string' },
              { name: 'photos', type: 'list', label: 'Polaroid stack photos', items: { type: 'object', fields: [
                { name: 'image', type: 'image', label: 'Photo' },
                { name: 'alt', type: 'string', label: 'Alt text' },
                { name: 'signature', type: 'string', label: 'Handwritten caption (e.g. "Keller Team")' },
              ]}},
            ]},
            { name: 'reviews', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'items', type: 'list', items: { type: 'object', labelField: 'name', fields: [
                { name: 'quote', type: 'string' },
                { name: 'name', type: 'string' },
                { name: 'location', type: 'string', label: 'City, State (e.g. "Keller, TX")' },
              ]}},
            ]},
            { name: 'investment', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
              { name: 'body', type: 'string' },
              { name: 'stats', type: 'list', items: { type: 'object', fields: [
                { name: 'number', type: 'string' },
                { name: 'label', type: 'string' },
              ]}},
              { name: 'ctaLabel', type: 'string' },
              { name: 'ctaHref', type: 'string' },
            ]},
            { name: 'faqs', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'items', type: 'list', items: { type: 'object', fields: [
                { name: 'question', type: 'string' },
                { name: 'answer', type: 'string' },
              ]}},
            ]},
            { name: 'locationsSection', type: 'object', fields: [
              { name: 'heading', type: 'string' },
            ]},
            { name: 'locatorPlaceholder', type: 'string' },
            { name: 'contact', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
              { name: 'formHeading', type: 'string' },
              { name: 'firstNameLabel', type: 'string' },
              { name: 'lastNameLabel', type: 'string' },
              { name: 'emailLabel', type: 'string' },
              { name: 'phoneLabel', type: 'string' },
              { name: 'messageLabel', type: 'string' },
              { name: 'submitLabel', type: 'string' },
            ]},
            { name: 'sectionsAfterHero', type: 'list', label: 'Sections (Between Hero & Featured Drink)',
              description: 'Inserted right after the hero, before the featured/LTO drink banner. Pick a block type and fill it in -- no code needed.',
              items: { type: 'model', models: BLOCK_MODELS },
            },
            sectionsField('Sections (Above Footer)', 'Appended at the very end of the page, right above the footer, in order. Pick a block type and fill it in -- no code needed.'),
          ],
        },
        {
          name: 'PageMenu',
          type: 'page',
          filePath: 'src/content/pages/menu.yaml',
          urlPath: '/menu',
          fields: [
            seoField,
            { name: 'visibility', type: 'object', label: 'Section visibility', description: 'Turn sections on/off without deleting their content.', fields: [
              { name: 'timeline', type: 'boolean', label: 'Show the drink timeline', default: true },
              { name: 'customize', type: 'boolean', label: 'Show "Sort by Flavor" section', default: true },
            ]},
            { name: 'heroVideo', type: 'file', label: 'Hero background video', description: 'Pick a video from your media library, or paste a YouTube/Vimeo link. Leave blank for the default video.', validations: { fileTypeGroups: ['video'] } },
            { name: 'heroMobileImage', type: 'image', label: 'Hero photo (mobile only)', description: 'On phones the hero shows a still photo instead of the video, to keep things fast and simple. Leave blank for the default photo.' },
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
            ]},
            { name: 'customize', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'flavorLabel', type: 'string' },
              { name: 'sfLabel', type: 'string' },
              { name: 'milks', type: 'list', items: { type: 'string' } },
              { name: 'flavors', type: 'list', items: { type: 'string' } },
              { name: 'sfFlavors', type: 'list', items: { type: 'string' } },
            ]},
            { name: 'labels', type: 'object', label: 'Menu UI labels', fields: [
              { name: 'emptyHeading', type: 'string' },
              { name: 'emptySub', type: 'string' },
            ]},
            { name: 'locationPicker', type: 'object', label: 'Location picker', fields: [
              { name: 'triggerLabel', type: 'string', label: 'Button label (before a store is picked)' },
              { name: 'heading', type: 'string', label: 'Popup heading' },
              { name: 'subtext', type: 'string', label: 'Popup subtext' },
              { name: 'allLabel', type: 'string', label: '"All Locations" option label' },
            ]},
            { name: 'drinkPage', type: 'object', label: 'Drink detail page labels', fields: [
              { name: 'backLabel', type: 'string' },
              { name: 'flavorNotesLabel', type: 'string' },
              { name: 'viewMenuLabel', type: 'string' },
              { name: 'flavorsHeading', type: 'string' },
              { name: 'sugarFreeHeading', type: 'string' },
            ]},
            sectionsField('Sections (Below Timeline, Above Customize)', 'Inserted after the menu timeline, before the "Sort by Flavor" customize section. Pick a block type and fill it in -- no code needed.'),
          ],
        },
        {
          name: 'PageAbout',
          type: 'page',
          filePath: 'src/content/pages/about.yaml',
          urlPath: '/about',
          fields: [
            seoField,
            { name: 'visibility', type: 'object', label: 'Section visibility', description: 'Turn sections on/off without deleting their content.', fields: [
              { name: 'intro', type: 'boolean', label: 'Show Intro section', default: true },
              { name: 'stats', type: 'boolean', label: 'Show Stats section', default: true },
              { name: 'history', type: 'boolean', label: 'Show History section', default: true },
              { name: 'founder', type: 'boolean', label: 'Show Founder section', default: true },
              { name: 'cta', type: 'boolean', label: 'Show CTA section', default: true },
            ]},
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
            ]},
            { name: 'intro', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'headingSpan', type: 'string' },
              { name: 'paragraphs', type: 'list', items: { type: 'string' } },
              { name: 'tagline', type: 'string' },
              { name: 'image', type: 'image' },
              { name: 'imageAlt', type: 'string' },
            ]},
            { name: 'stats', type: 'list', items: { type: 'object', fields: [
              { name: 'number', type: 'string' },
              { name: 'label', type: 'string' },
            ]}},
            { name: 'history', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'list', items: { type: 'string' } },
              { name: 'timeline', type: 'list', items: { type: 'object', fields: [
                { name: 'year', type: 'string' },
                { name: 'text', type: 'string' },
              ]}},
            ]},
            { name: 'founder', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'name', type: 'string' },
              { name: 'title', type: 'string' },
              { name: 'image', type: 'image' },
              { name: 'imageAlt', type: 'string' },
              { name: 'bio', type: 'list', items: { type: 'string' } },
              { name: 'ventures', type: 'list', items: { type: 'object', fields: [
                { name: 'name', type: 'string' },
                { name: 'desc', type: 'string' },
              ]}},
            ]},
            { name: 'cta', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'string' },
              { name: 'primaryLabel', type: 'string' },
              { name: 'primaryHref', type: 'string' },
              { name: 'secondaryLabel', type: 'string' },
              { name: 'secondaryHref', type: 'string' },
            ]},
            sectionsField('Sections (Below Hero)', 'Inserted right after the hero, before the intro section. Pick a block type and fill it in -- no code needed.'),
          ],
        },
        {
          name: 'PageCareers',
          type: 'page',
          filePath: 'src/content/pages/careers.yaml',
          urlPath: '/careers',
          fields: [
            seoField,
            { name: 'heroVideo', type: 'file', label: 'Hero background video', description: 'Pick a video from your media library, or paste a YouTube/Vimeo link. Leave blank for the default video.', validations: { fileTypeGroups: ['video'] } },
            { name: 'agegate', type: 'object', fields: [
              { name: 'eyebrow', type: 'string' },
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'string' },
              { name: 'yesLabel', type: 'string' },
              { name: 'noLabel', type: 'string' },
            ]},
            { name: 'under18', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'list', items: { type: 'string' } },
              { name: 'linkText', type: 'string' },
            ]},
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
            ]},
            { name: 'workstreamLabel', type: 'string' },
            { name: 'workstreamHref', type: 'string' },
            sectionsField('Sections (Above Hero)', 'Inserted above the careers hero (after the age gate). Pick a block type and fill it in -- no code needed.'),
          ],
        },
        {
          name: 'PageMerch',
          type: 'page',
          filePath: 'src/content/pages/merch.yaml',
          urlPath: '/merch',
          fields: [
            seoField,
            { name: 'visibility', type: 'object', label: 'Section visibility', description: 'Turn sections on/off without deleting their content.', fields: [
              { name: 'products', type: 'boolean', label: 'Show product grid', default: true },
            ]},
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
            ]},
            { name: 'items', type: 'list', items: { type: 'object', labelField: 'name', fields: [
              { name: 'name', type: 'string' },
              { name: 'price', type: 'string' },
              { name: 'category', type: 'string' },
              { name: 'image', type: 'image' },
            ]}},
          ],
        },
        {
          name: 'PageRealestate',
          type: 'page',
          filePath: 'src/content/pages/realestate.yaml',
          urlPath: '/realestate',
          fields: [
            seoField,
            { name: 'visibility', type: 'object', label: 'Section visibility', description: 'Turn sections on/off without deleting their content.', fields: [
              { name: 'overview', type: 'boolean', label: 'Show Overview section', default: true },
              { name: 'criteria', type: 'boolean', label: 'Show Criteria section', default: true },
              { name: 'idealSite', type: 'boolean', label: 'Show Ideal Site section', default: true },
              { name: 'markets', type: 'boolean', label: 'Show Markets section', default: true },
              { name: 'contact', type: 'boolean', label: 'Show Contact section', default: true },
            ]},
            { name: 'hero', type: 'object', fields: [
              { name: 'eyebrow', type: 'string' },
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'string' },
              { name: 'ctaLabel', type: 'string' },
              { name: 'ctaHref', type: 'string' },
            ]},
            { name: 'overview', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'headingSpan', type: 'string' },
              { name: 'body', type: 'list', items: { type: 'string' } },
              { name: 'stats', type: 'list', items: { type: 'object', fields: [
                { name: 'number', type: 'string' },
                { name: 'label', type: 'string' },
              ]}},
              { name: 'image', type: 'image', label: 'Legacy single image (fallback)' },
              { name: 'imageAlt', type: 'string' },
              { name: 'images', type: 'list', label: 'Photo grid (shows 4)', items: { type: 'object', labelField: 'imageAlt', fields: [
                { name: 'image', type: 'image' },
                { name: 'imageAlt', type: 'string' },
              ]}},
            ]},
            { name: 'criteria', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
              { name: 'cards', type: 'list', items: { type: 'object', labelField: 'title', fields: [
                { name: 'title', type: 'string' },
                { name: 'body', type: 'string' },
              ]}},
            ]},
            { name: 'idealSite', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'items', type: 'list', items: { type: 'string' } },
            ]},
            { name: 'markets', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
              { name: 'tags', type: 'list', items: { type: 'string' } },
            ]},
            { name: 'contact', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'formHeading', type: 'string' },
              { name: 'formSubtext', type: 'string' },
              { name: 'email', type: 'string' },
              { name: 'emailIntro', type: 'string' },
              { name: 'buttonLabel', type: 'string' },
              { name: 'firstNameLabel', type: 'string' },
              { name: 'lastNameLabel', type: 'string' },
              { name: 'emailLabel', type: 'string' },
              { name: 'phoneLabel', type: 'string' },
              { name: 'propertyLabel', type: 'string' },
              { name: 'detailsLabel', type: 'string' },
            ]},
            sectionsField('Sections (Below Hero)', 'Inserted right after the hero, before the overview section. Pick a block type and fill it in -- no code needed.'),
          ],
        },
        {
          name: 'PageLocations',
          type: 'page',
          filePath: 'src/content/pages/locations.yaml',
          urlPath: '/locations',
          fields: [
            seoField,
            { name: 'visibility', type: 'object', label: 'Section visibility', description: 'Turn sections on/off without deleting their content.', fields: [
              { name: 'map', type: 'boolean', label: 'Show search/map section', default: true },
              { name: 'grid', type: 'boolean', label: 'Show location cards grid', default: true },
            ]},
            { name: 'heroVideo', type: 'file', label: 'Hero background video', description: 'Pick a video from your media library, or paste a YouTube/Vimeo link. Leave blank for the default video.', validations: { fileTypeGroups: ['video'] } },
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
              { name: 'countSuffix', type: 'string' },
            ]},
            { name: 'searchPlaceholder', type: 'string' },
            { name: 'directionsLabel', type: 'string', label: '"Get Directions" label (on cards)' },
            { name: 'storeInfoLabel', type: 'string', label: '"Store Info" label (on cards)' },
            { name: 'storeDetail', type: 'object', label: 'Store detail page labels', fields: [
              { name: 'backLabel', type: 'string' },
              { name: 'hoursLabel', type: 'string' },
              { name: 'phoneLabel', type: 'string' },
              { name: 'addressLabel', type: 'string' },
              { name: 'menuButtonLabel', type: 'string' },
              { name: 'directionsButtonLabel', type: 'string' },
            ]},
            { name: 'stateNames', type: 'list', label: 'State code to full name', items: { type: 'object', labelField: 'name', fields: [
              { name: 'code', type: 'string' },
              { name: 'name', type: 'string' },
            ]}},
            sectionsField('Sections (Top, Below Navbar)', 'Inserted at the very top of the page, right below the navbar. Pick a block type and fill it in -- no code needed.'),
          ],
        },
        {
          name: 'PagePrivacy',
          type: 'page',
          filePath: 'src/content/pages/privacy.yaml',
          urlPath: '/privacy-policy',
          fields: [
            seoField,
            { name: 'hero', type: 'object', fields: [
              { name: 'heading', type: 'string' },
              { name: 'subheading', type: 'string' },
            ]},
            { name: 'sections', type: 'list', items: { type: 'object', labelField: 'heading', fields: [
              { name: 'heading', type: 'string' },
              { name: 'body', type: 'text' },
            ]}},
          ],
        },
        {
          name: 'Drink',
          label: 'Products',
          description: 'Everything on the menu -- drinks and food items alike.',
          type: 'data',
          labelField: 'name',
          filePath: 'src/content/drinks/{slug}.yaml',
          fields: [
            { name: 'name', type: 'string', required: true, default: 'New Product' },
            { name: 'category', type: 'reference', required: true, models: ['Category'] },
            { name: 'subtitle', type: 'string', default: '' },
            { name: 'description', type: 'string', default: '' },
            { name: 'image', type: 'image' },
            { name: 'badge', type: 'string', label: 'Badge text (e.g. "Fan Fav", "Select Locations Only"). Leave blank for no badge.' },
            { name: 'tags', type: 'list', items: { type: 'string' } },
            { name: 'menuOrder', type: 'number', default: 99 },
            { name: 'unavailableAt', type: 'list', label: 'Not available at these locations',
              description: 'Leave empty if available at every location (including any opened later). Only add locations where this specific item is NOT served.',
              items: { type: 'reference', models: ['Location'] },
            },
          ],
        },
        {
          name: 'Category',
          type: 'data',
          labelField: 'title',
          filePath: 'src/content/categories/{slug}.yaml',
          fields: [
            { name: 'title', type: 'string', required: true, default: 'New Category' },
            { name: 'number', type: 'string', label: 'Display order (e.g. 01, 02)' },
            { name: 'description', type: 'string' },
            { name: 'extraCards', type: 'list', label: 'Extra info cards (e.g. "Also available plain: ...")',
              description: 'Shown at the end of this category\'s row on the menu page. Add as many as you like.',
              items: { type: 'object', labelField: 'label', fields: [
                { name: 'label', type: 'string', label: 'Card heading', default: 'Also available:' },
                { name: 'items', type: 'list', label: 'List items', items: { type: 'string' } },
              ]},
            },
            { name: 'unavailableAt', type: 'list', label: 'Not available at these locations',
              description: 'Leave empty if this whole category is available everywhere a location is picked. Add locations that don\'t carry this category at all (e.g. no kitchen for Hot Food).',
              items: { type: 'reference', models: ['Location'] },
            },
            { name: 'hiddenByDefault', type: 'boolean', label: 'Hidden until a location is selected',
              description: 'Turn on for categories not served everywhere (e.g. Hot Food, Treats) -- hidden on the general menu, and only shows up once a visitor picks a location that carries it.',
              default: false,
            },
          ],
        },
        {
          name: 'Location',
          type: 'data',
          labelField: 'name',
          filePath: 'src/content/locations/{slug}.yaml',
          fields: [
            { name: 'name', type: 'string', required: true, default: '151 Coffee' },
            { name: 'address', type: 'string' },
            { name: 'city', type: 'string' },
            { name: 'state', type: 'string' },
            { name: 'zip', type: 'string' },
            { name: 'lat', type: 'number' },
            { name: 'lng', type: 'number' },
            { name: 'displayOrder', type: 'number' },
            { name: 'image', type: 'image', label: 'Store photo' },
            { name: 'hours', type: 'string', label: 'Hours (leave blank to use the sitewide hours in Settings > Global)' },
          ],
        },
        {
          name: 'SettingsGlobal',
          type: 'data',
          filePath: 'src/content/settings/global.yaml',
          fields: [
            { name: 'siteName', type: 'string' },
            { name: 'logo', type: 'image' },
            { name: 'slogan', type: 'string' },
            { name: 'copyright', type: 'string' },
            { name: 'phone', type: 'string' },
            { name: 'hours', type: 'string' },
            { name: 'email', type: 'string' },
            { name: 'realEstateEmail', type: 'string' },
            { name: 'giftCardLabel', type: 'string', label: 'Gift Card button text' },
            { name: 'giftCardUrl', type: 'string', label: 'Gift Card iframe URL' },
            { name: 'nav', type: 'list', label: 'Header nav links', items: { type: 'object', labelField: 'label', fields: [
              { name: 'label', type: 'string' },
              { name: 'href', type: 'string' },
            ]}},
            { name: 'social', type: 'object', fields: [
              { name: 'instagram', type: 'string' },
              { name: 'facebook', type: 'string' },
              { name: 'tiktok', type: 'string' },
              { name: 'linkedin', type: 'string' },
            ]},
            { name: 'footer', type: 'object', label: 'Footer', fields: [
              { name: 'companyHeading', type: 'string' },
              { name: 'companyLinks', type: 'list', items: { type: 'object', labelField: 'label', fields: [
                { name: 'label', type: 'string' },
                { name: 'href', type: 'string' },
              ]}},
              { name: 'socialHeading', type: 'string' },
              { name: 'supportHeading', type: 'string' },
              { name: 'contactLabel', type: 'string', label: 'Support: Contact link' },
              { name: 'callLabel', type: 'string', label: 'Support: Call Us link' },
              { name: 'supportLabel', type: 'string', label: 'Support: Support link' },
              { name: 'giftCardCheckLabel', type: 'string', label: 'Support: Check Gift Card link' },
              { name: 'giftCardButtonLabel', type: 'string' },
            ]},
          ],
        },

        // ── Add-on section blocks ──────────────────────────────────────
        // Embedded (not standalone-file) models used by PageHome's `sections`
        // list. Each mirrors the props of its matching Astro component in
        // src/components/blocks/ -- add a new block by creating that
        // component, adding it to BlockRenderer.astro's map, and adding its
        // model here (then listing its name in the `sections` field above).
        {
          name: 'PromoBannerBlock',
          type: 'object',
          label: 'Section: Promo Banner',
          description: 'Full-width red announcement strip with an optional button.',
          labelField: 'heading',
          fields: [
            { name: 'eyebrow', type: 'string', label: 'Eyebrow tag (e.g. "Limited Time")' },
            { name: 'heading', type: 'string' },
            { name: 'body', type: 'string' },
            { name: 'ctaLabel', type: 'string', label: 'Button text' },
            { name: 'ctaHref', type: 'string', label: 'Button link' },
          ],
        },
        {
          name: 'ImageBannerBlock',
          type: 'object',
          label: 'Section: Banner with Image',
          description: 'Full-width photo banner with a dark overlay, heading/body, and an optional button -- good for announcements that want a photo instead of the plain red banner.',
          labelField: 'heading',
          fields: [
            { name: 'image', type: 'image', label: 'Background photo' },
            { name: 'imageAlt', type: 'string', label: 'Photo alt text' },
            { name: 'heading', type: 'string' },
            { name: 'body', type: 'string' },
            { name: 'ctaLabel', type: 'string', label: 'Button text' },
            { name: 'ctaHref', type: 'string', label: 'Button link' },
          ],
        },
        {
          name: 'SplitFeatureBlock',
          type: 'object',
          label: 'Section: Image + Text',
          description: 'Photo on one side, heading/body/button on the other.',
          labelField: 'heading',
          fields: [
            { name: 'heading', type: 'string' },
            { name: 'headingSpan', type: 'string', label: 'Heading (red accent line, optional)' },
            { name: 'body', type: 'string' },
            { name: 'image', type: 'image' },
            { name: 'imageAlt', type: 'string' },
            { name: 'ctaLabel', type: 'string', label: 'Button text' },
            { name: 'ctaHref', type: 'string', label: 'Button link' },
            { name: 'imagePosition', type: 'enum', label: 'Photo side', options: ['left', 'right'], default: 'left' },
            { name: 'background', type: 'enum', label: 'Background', options: ['light', 'dark'], default: 'light' },
          ],
        },
        {
          name: 'CtaSectionBlock',
          type: 'object',
          label: 'Section: CTA (centered)',
          description: 'Centered heading/body with up to two buttons on a red background.',
          labelField: 'heading',
          fields: [
            { name: 'heading', type: 'string' },
            { name: 'body', type: 'string' },
            { name: 'primaryLabel', type: 'string', label: 'Primary button text' },
            { name: 'primaryHref', type: 'string', label: 'Primary button link' },
            { name: 'secondaryLabel', type: 'string', label: 'Secondary button text' },
            { name: 'secondaryHref', type: 'string', label: 'Secondary button link' },
          ],
        },
        {
          name: 'TestimonialGridBlock',
          type: 'object',
          label: 'Section: Testimonial Grid',
          description: 'A grid of quote cards, same style as the homepage reviews.',
          labelField: 'heading',
          fields: [
            { name: 'heading', type: 'string' },
            { name: 'items', type: 'list', label: 'Testimonials', items: { type: 'object', labelField: 'name', fields: [
              { name: 'quote', type: 'string' },
              { name: 'name', type: 'string' },
              { name: 'location', type: 'string', label: 'City, State' },
            ]}},
          ],
        },
        {
          name: 'StatStripBlock',
          type: 'object',
          label: 'Section: Stat Strip',
          description: 'A row of big numbers with labels on a red background.',
          labelField: 'heading',
          fields: [
            { name: 'heading', type: 'string' },
            { name: 'stats', type: 'list', items: { type: 'object', fields: [
              { name: 'number', type: 'string' },
              { name: 'label', type: 'string' },
            ]}},
          ],
        },
        {
          name: 'FaqAccordionBlock',
          type: 'object',
          label: 'Section: FAQ Accordion',
          description: 'A red-background FAQ list, same style as the homepage FAQ.',
          labelField: 'heading',
          fields: [
            { name: 'heading', type: 'string' },
            { name: 'items', type: 'list', label: 'Questions', items: { type: 'object', labelField: 'question', fields: [
              { name: 'question', type: 'string' },
              { name: 'answer', type: 'string' },
            ]}},
          ],
        },
        {
          name: 'CardGridBlock',
          type: 'object',
          label: 'Section: Card Grid',
          description: 'A grid of image/title/link cards, same style as the homepage menu cards.',
          labelField: 'heading',
          fields: [
            { name: 'heading', type: 'string' },
            { name: 'background', type: 'enum', label: 'Background', options: ['light', 'dark'], default: 'dark' },
            { name: 'cards', type: 'list', items: { type: 'object', labelField: 'title', fields: [
              { name: 'title', type: 'string' },
              { name: 'subtitle', type: 'string' },
              { name: 'image', type: 'image' },
              { name: 'href', type: 'string' },
              { name: 'label', type: 'string', label: 'Button text' },
            ]}},
          ],
        },
      ],
    }),
  ],

  siteMap: ({ documents }): SiteMapEntry[] => {
    const URL_MAP: Record<string, string> = {
      PageHome: '/',
      PageMenu: '/menu',
      PageAbout: '/about',
      PageCareers: '/careers',
      PageMerch: '/merch',
      PageRealestate: '/realestate',
      PageLocations: '/locations',
      PagePrivacy: '/privacy-policy',
    };
    const pageEntries = documents
      .filter(doc => doc.modelName && URL_MAP[doc.modelName])
      .map(doc => ({
        stableId: doc.id,
        urlPath: URL_MAP[doc.modelName!],
        document: doc,
        isHomePage: doc.modelName === 'PageHome',
      }));
    const drinkEntries = documents
      .filter(doc => doc.modelName === 'Drink')
      .map(doc => {
        const slug = doc.id.replace(/^src\/content\/drinks\//, '').replace(/\.yaml$/, '');
        return { stableId: doc.id, urlPath: `/drinks/${slug}`, document: doc };
      });
    return [...pageEntries, ...drinkEntries];
  },
});
