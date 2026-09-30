# Open items: web dev audit pass (started 2026-09-29)

Working locally through the audit (web dev → VP of Marketing → Bryson).
**Plan: one push at the end.** Nothing below is committed unless it says so.

Status key: ✅ done locally · 🧪 needs a test after deploy · ❓ needs a decision · 📝 content/CMS task (not code)

---

## Already pushed (commit 89b6008, 2026-09-29)
- Brand reds → #e4252b, flat buttons, brand fonts, bold subheads/logo
- TEMP_NOINDEX on (src/lib/temp-noindex.ts). **Flip to `false` at launch** or the real site gets deindexed.

## Local, not yet committed

### Styling (from before the audit)
- ✅ Text-shadow blur 19px everywhere; form card box-shadow blur 31px (`.contact-form-wrapper`)
- ✅ Quote pattern re-cropped to a seamless 1084×530 tile (`public/images/quote-banner.jpg`), tiled at native size (`background-size: auto`) everywhere
- ✅ Pattern ground fully neutral: veil + base `#f0f0f0` (`--quote-ground`), red glows removed from the 6 pattern sections
- ✅ Navbar → `--quote-ground`; plate (LTO box, about/ourfuture text boxes) → pure white
- ❓ Remaining cream spots not yet neutralized: /locations locator panel, search box, store list items and state buttons; location-page fallback map; drink category label; off-white text on dark (menu, ourfuture)

### Audit 1: `<fragment>` in `<head>` ✅
- Lowercase `<fragment slot="head">` in index, locations and menu/simple rendered as a literal tag and pushed the JSON-LD into `<body>`. Now `<Fragment>`.
- 🧪 After deploy: view-source `/`, confirm there's no `<fragment>` and the JSON-LD sits inside `<head>`.

### Audit 2: soft 404s ✅
- Confirmed on staging (f09994): junk URL → 302 `/`; `/drinks/x` → 302 `/menu`; `/locations/x` → 302 `/locations`; `/menu/x` → **200**. Webflow renders these routes per request even with `prerender`.
- Fix: `[slug]`, `drinks/[slug]` and `locations/[slug]` → `Astro.rewrite('/404')`. `menu/[store]` resolves the store itself and 404s unknown ones.
- Tested locally in draft mode (every page rendered per request): all junk → 404 + branded page; real pages 200.
- 🧪 After deploy: `curl -I` each of `/junk`, `/menu/cold-brew/junk`, `/locations/junk`, `/menu/junk` → expect 404, body titled "Page Not Found | 151 Coffee".
- Note: `wrangler.json` `not_found_handling` does nothing on Webflow (it ignores committed wrangler config). Harmless, left in.

### Audit 3: duplicate titles/H1s ✅
- Caramel Blondie + Snickers (coffee and cold brew), Georgia Peach (smoothies and teas).
- Every item title is now `<Name> - <Category> | 151 Coffee Menu`, e.g. "Snickers - Cold Brew | 151 Coffee Menu".
- H1 is `<Name>` plus a visually hidden ` - <Category>` (`.sr-only`). Search engines and screen readers see the full text; the visible design is unchanged. ❓ Make it visible instead if Bryson or the VP prefers.
- 🧪 After deploy: view-source `/menu/coffee/snickers` and `/menu/cold-brew/snickers`; titles and H1s should differ.

### Audit 4: URL structure `/drinks/<cat>-<item>` → `/menu/<category>/<item>` ✅
- VP: "fix so there is continuity and accuracy for each URL".
- One helper decides every item URL: `src/lib/menu-urls.mjs` → page route, menu card links, schema `@id`/`url`, sitemap.
- Category segments are pinned in code (a Storyblok title rename can't change URLs): `coldbrew` → `cold-brew`, `hotfood` → `hot-food`, `dirtypop` → `dirty-pop`, `lto` → `seasonal`. The rest use their Storyblok slug (coffee, teas, smoothies, kids, treats, energy, refreshers).
- The item segment drops the category prefix from the Storyblok slug (`coldbrew-snickers` → `snickers`).
- Page moved to `src/pages/menu/[category]/[item].astro`.
- Old `/drinks/<slug>` URLs return a **301** to the new URL (`src/pages/drinks/[slug].astro`). This covers stray links, including the homepage featured-drink CTA. Unknown `/drinks/x` → 404.
- Sitemap lists the new URLs and excludes `/drinks/*`.
- Bug found and fixed on the way: the live API (dev and draft preview) returns the seasonal items' category as a UUID. Their links came out as `/menu/<uuid>/…` and the new pages 404'd. The helper now resolves UUIDs. Seasonal was also missing from the Menu schema in dev; that's fixed too.
- Verified locally, both normal and draft mode: 63 items linked from /menu, all 200. Junk `/menu/a/b` → 404. `/drinks/…` → 301. `/menu/keller` and `/menu/8` still work.
- 🧪 After deploy: `curl -I /drinks/coldbrew-snickers` → 301 to `/menu/cold-brew/snickers`. Open a few menu cards. Check `/sitemap-0.xml` has `/menu/<cat>/<item>` and no `/drinks/`.
- 📝 **Storyblok Visual Editor preview paths** for products probably point at `/drinks/…`. Update them in the Storyblok space settings (the 301 keeps them working meanwhile).
- 📝 **Homepage featured-drink CTA** in Storyblok is `/drinks/coffee-white-chocolate-macadamia`. Change it to `/menu/coffee/white-chocolate-macadamia` (the 301 covers it until then). Fix it in Storyblok, not the snapshot.
- 📝 **Hot Cocoa (`coffee-hot-cocoa`) and Chai Latte (`coffee-chai-latte`)** have category `categories/misc`, which doesn't exist. They aren't on the menu and get no page. Give them a real category in Storyblok.

### Audit 5: /menu/simple ✅
- Noindex now goes through Layout's `noindex` prop (it used to output two robots metas). Added a visually hidden H1 "Simple Menu".
- Canonical fix, site-wide: Layout strips trailing slashes from the default canonical, so `/menu/simple/` → `https://www.151coffee.com/menu/simple`. Matches the flat URLs `flattenRoutes()` serves.
- Already out of the sitemap (the filter drops every one-segment `/menu/<x>`).
- 🧪 After deploy: view-source `/menu/simple`: one robots meta, canonical without a trailing slash. Confirm it isn't in `/sitemap-0.xml`.

### Audit 6: location pages near-identical ✅ (content still 📝)
- The store photo and map were already there. Each page now also has:
  - **Food row** in the info card: "Hot Food & Treats" or "Drinks only". Worked out from each category's Unavailable At, so it always matches the store's menu. Today Flower Mound and North Richland Hills are drinks only.
  - **Google review button**, the third button: "Leave a Google Review" when the store has a Google Place ID, otherwise "Google Reviews", which opens the store on Google Maps.
  - **About This Store**: the Storyblok "Store Description" when written. Until then, a paragraph built from the store's own facts (address, hours, rotating hot-food examples, nearest stores). Nothing in it is invented.
  - **Nearby Stores**: up to 3 within 100 miles, with photo and distance. KS stores show 1–2.
  - Unique meta description (address, hours, food), more descriptive photo alt text, and a no-JS map fallback.
- Layout (Bryson): About and Nearby panels are always the same size, side by side and stacked. All 3 buttons sit on one line; text scales with the card. Photo and card now stack below 1100px (was 900px) so the buttons fit. Phones (≤600px) stack the buttons.
- Tested at 1600/1180/1000/800/650/375 on 3 stores: one button row, no clipping, equal panels, no sideways scroll.
- ✅ **`add-seo-fields.mjs --apply` ran 2026-09-29**: 15 fields added (9 settings, 1 home hero Keyword Line, 5 location). All are empty, so the code defaults apply until they're filled in. 📝 Fill them in Storyblok (store descriptions, cross streets, Place IDs, HQ address…) and publish.
- 📝 After the fields exist:
  - Write a real Store Description per store (landmarks, cross streets, what regulars order). The generated paragraph is unique but still templated.
  - Paste each store's Google Place ID from Google's Place ID Finder.
  - Tick Has Drive-Thru.
- 🧪 After deploy: view-source a store page; check the Food row, the review link and Nearby links. Run the Rich Results test on one store page.

#### Follow-up (Bryson): cross streets, 2-column card, bigger buttons ✅
- **Cross streets** on every store page, in the card and the About paragraph ("…near Keller Pkwy & Keller Smithfield Rd"). Also in the meta description.
  - Defaults live in `src/data/store-cross-streets.json`, taken from OpenStreetMap road data around each store's coordinates.
  - A Storyblok "Cross Streets" field (added to the add-only script) overrides the default once filled in.
  - 🧪/❓ **Have someone who knows the stores check the list.** Judgement calls:
    - Westworth Village: River Oaks Blvd, not White Settlement Rd.
    - Flower Mound: Sagebrush Dr, not Cross Timbers Rd.
    - Alliance: I-35W & Prairie Vista Dr.
    - Manhattan: Bluemont Ave, not Tuttle Creek Blvd.
- **Info card is 2 columns:** Address | Cross Streets, Hours | Phone, Food across the full width.
- **Buttons:** 54px tall, same widths as before.
  - A small inline script sets the text to the largest size that keeps all three on one row, capped at about 17px so it stays in proportion to the button.
  - Labels change with Storyblok and the Place ID, so it measures rather than hardcoding a size.
  - Without JS, the CSS fallback size applies. Phones stack the buttons.
- **"See This Store's Menu" → "This Store's Menu".** The page strips a leading "See" because the Storyblok label still says "See This Store's Menu".
  - 📝 Edit it in Storyblok (Locations page → Store Detail → Menu Button Label).
- Tested 1600 → 375px on 3 stores: one row, no clipping, 2 columns, no sideways scroll.

#### Phone numbers removed from store pages (Bryson) ✅
- Gone from every store page's info card, which is now 2×2: Address | Cross Streets, Hours | Food.
- Gone from the store finder's tiles (desktop and mobile cards) and map popups. `locator.js` is shared, so the homepage finder lost it too.
- Gone from the store schema: no `telephone` on any CafeOrCoffeeShop node.
- **Kept on purpose:** the Organization schema's corporate number and the footer "Call Us" link. They're company-wide, not per store. ❓ Say if those should go too.
- To restore per store later: see the comment in `locationSchema` (seo.ts) and git history for `locator.js`.

#### /locations "Find Your 151" always one line (Bryson) ✅
- It wrapped to two lines in the 360px sidebar at 58px text. Now it's no-wrap at `min(3.65rem, 17cqi)`, about 54px, which fills the panel width exactly.
- A small inline script shrinks it further if the Storyblok heading is ever edited to something longer. Tested with "Find Your Nearest 151 Coffee" → fits.
- Checked at 1920/1440/1280/1024. Below 903px the heading is hidden by design.

#### Store info card redesign (Bryson) ✅
- Red rule along the top edge and a deeper gradient.
- Hours are the focal point: large "6 AM – 8 PM" with a red dash, and "Open daily" under it. Hours that don't parse (anything other than "Xam-Ypm") show as written.
- 2×2 icon tiles: Address, Cross Streets, Food, and Nearest Store (links to that store, with distance). Beside the photo the tiles stretch to fill the square; stacked, they size to content. One column at ≤520px.
- Buttons unchanged (one row, auto-fit text).
- Tried and removed at Bryson's request: a "Drive-Thru · City, ST" eyebrow and a live "Open now · until 8 PM" pill.
- Checked at 1600/1280/1180 (card = photo height exactly), 1100/1000/700 (stacked) and 375.

#### Patio + guest Wi-Fi per store (Bryson) ✅
- Data in `src/data/store-amenities.json`. Every store has a patio. North Richland Hills, Flower Mound and Manhattan are uncovered; the rest are covered. Guest Wi-Fi is Lawrence only.
- Chips sit at the right end of the hours line: "Covered Patio" / "Patio (Uncovered)", plus "Guest Wi-Fi" on Lawrence. On phones they drop under the hours.
- About paragraph mentions the patio; Lawrence adds the Wi-Fi line. Store schema gets `amenityFeature` (Outdoor seating, Covered patio, Guest Wi-Fi). Only what's present; nothing stated as false.
- 📝 If this should be editable in Storyblok, add Patio/Wi-Fi fields to the location component later. Today it's a code file.
- Checked 1600→375 on Lawrence, Flower Mound and Keller: card = photo height, chips on the hours line, buttons one row.

### Audit 7: Organization sameAs missing ✅
- Real bug: `settings.social` comes from Storyblok as a one-item array. `organizationSchema` read `.facebook` straight off the array, so `sameAs` was empty on every page. Now it lists Facebook, Instagram, TikTok and LinkedIn.
- 🧪 After deploy: view-source `/`, find `"sameAs"` in the Organization JSON-LD, or run the Rich Results test.

### Audit 8: sitemap lastmod was the build time ✅
- `storyblok/snapshot.mjs` now records each story's `published_at` in a new top-level `publishedAt` map (keyed by full slug). `stories`/`collections` keep their old shape, so no reader changed.
- Sitemap `<lastmod>` = newest publish among the stories that URL renders: store page = store + categories (food line); menu item = product + its category; /menu = menu page + all products/categories; /, /locations, /ourfuture = their page + stores; others = their page story. A URL with no known source gets no lastmod, never a fake one.
- Snapshot regenerated with the script (not hand-edited): content identical to before, only `publishedAt` + `generatedAt` changed. The rebuild workflow keeps it current on every publish.
- Verified by running the sitemap hook locally: 85 URLs, all with lastmod, 47 distinct dates (was 1).
- 🧪 After deploy: open `/sitemap-0.xml`, confirm dates vary and match recent Storyblok publishes.

### Audit 9: homepage H1 was only the slogan ✅
- H1 now starts with a small uppercase kicker "Drive-Thru Coffee in DFW & Kansas" (red underline) above the slogan. It's inside the `<h1>`, so the heading reads "Drive-Thru Coffee in DFW & Kansas It's a Good Day to Have a Good Day".
- Editable via a new hero field **Keyword Line** (field added 2026-09-29; the default is used while it's empty).
- Checked 1226/1024/430/375 (one line) and 320 (wraps to two, no overflow).


### Audit 10: performance + security batch
- **HTML caching / s-maxage** ⚠️ Can't be fixed in code on Webflow Cloud. Its docs say response Cache-Control is "always replaced with `private, no-cache`". Our `_headers` and middleware already send `s-maxage=300` in case that changes. Real options: a Cloudflare cache rule on 151coffee.com after the domain cutover (boss has Cloudflare access), or ask Webflow support.
- **Homepage dead weight** ✅ Removed the store JSON, the locator loader and the unpkg preconnect from `/`.
- **MapLibre self-hosted** ✅ `public/vendor/maplibre-gl/5.6.1/` (byte-identical to unpkg, LICENSE included) is served with a `/vendor/*` immutable cache rule. Maps on /locations and the store pages no longer touch unpkg.
- **Font preloads** ✅ Only the normal (non-italic) faces are preloaded; italics load on demand (they're used in two small spots).
- **Render-blocking CSS** ✅ style.css, menu.css, drink.css and location-detail.css moved to `src/styles/` and are imported through Astro, with `inlineStylesheets: 'always'`, so there are no blocking CSS requests. Purging found only about 1.6KB unused site-wide, so nothing was removed; gzipped it's about 12.5KB inline. blocks.css is only linked on pages that actually have blocks (none today).
- **Hero video poster** ✅ Posters are in `public/images/hero-posters/` and mapped in `src/data/hero-posters.json`, then preloaded at high priority. ⚠️ If the hero video is changed in Storyblok, add a poster for the new URL to that JSON, or the hero is blank until the video loads (as before).
- **Menu cards** ✅ Real `<img>` with srcset, lazy loading and alt text (Storyblok image alt, falling back to the card title), on the homepage and in CardGrid blocks. 📝 Fill in alt text on the card images in Storyblok for better descriptions.
- **Dev comments / inline styles** ✅ Template comments now use `{/* */}` (stripped). A Vite plugin strips comment lines in inline scripts. `_editable` markers only render in draft/dev. The static inline styles are now classes; only the dynamic Storyblok backgrounds remain inline.
- **"Made in Webflow" badge** ⚠️ Webflow injects it, not our code. Turn off "Show Webflow badge" in the Webflow site settings (needs a paid site plan). After that, remove the cloudfront host from `img-src` in `src/lib/security-headers.ts`.
- **Security headers** ✅ `src/lib/security-headers.ts` (from middleware) sends HSTS, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options, and an allowlist CSP including frame-ancestors. **Kill switch:** set `CSP_REPORT_ONLY=true` in the Webflow env vars and violations only log, nothing is blocked.
- 🧪 After deploy, on staging:
  - check `curl -I` for the new headers
  - check the console on home, /locations (map, ZIP search, gift card modal), a store page, a drink page, /menu and /careers for "Refused to load" CSP errors
  - confirm the page HTML has inline `<style>` and no `/_astro/*.css` link (i.e. Webflow's build honored `inlineStylesheets`)
  - confirm the hero poster shows before the video
  - once the GA/Meta IDs are set, confirm they aren't blocked

### Nav button: "Gift Card Balance"
- Code fallback changed in `Nav.astro`. 📝 **The live label comes from Storyblok** (Global Settings → Gift Card Label = "Gift Card"), so that field has to be changed there too, or cleared so the code default is used.
- The longer label made "Our Future" wrap to two lines at 916–928px, so the hamburger breakpoint moved from 915px to 945px (and the hide-Contact range now starts at 946px). Checked 946–1280px (no wrapping) and the drawer at 320px (fits).

### Audit 11: accessibility + markup ✅
- **Hamburger** is a real `<button>` with `aria-controls`. The drawer is `inert` while closed (hidden from screen readers and Tab), and Escape returns focus to the button. The drawer's gift card button now copies the nav button's label instead of hard-coding "Gift Card".
- **Modals** (gift card, investor waitlist, /menu location picker and "decide for me") have `role="dialog"`, `aria-modal`, a label, and × buttons labelled "Close". A shared handler in `script.js` moves focus in, keeps Tab inside, closes on Escape, and returns focus to the opener.
- **Footer social icons** are SVGs from the new `SocialIcon.astro`, shared with the Instagram section, and labelled "151 Coffee on …".
- **Instagram link labels** use the caption's first sentence, without emojis or hashtags, capped at 80 characters, plus "(watch on Instagram)". The fallback cards say "Watch on Instagram".
- **Featured drink heading**: one `<h2>`, reordered above the image on mobile with CSS; the mobile duplicate is gone. It looks the same at 390px and 1280px.
- **H1**: blank hero lines are skipped (Storyblok's Subheading Line 2 is empty, which rendered an empty `<span>`).
- **Reviews**: now `.reviews`/`.review-card` with `<figure>`, `<blockquote>` and `<figcaption>`; names are `<p>`, not `<h3>`. The section id changed from `#pricing` to `#reviews` (nothing linked to it). Computed styles and heights are identical to before.
- **Investor waitlist**: phone is optional in the form and in `/api/contact`. The sheet still gets a phone column, left blank when no number is given.
- 🧪 After deploy: submit the waitlist once with only an email and check the row lands in the sheet (not tested locally, because dev could write to the real sheet).
