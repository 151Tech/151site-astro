// 151 Coffee store locator - MapLibre GL + CARTO vector tiles, no API key
// required. See maplibre-map-helpers.js for why this isn't Leaflet anymore.
// Store data comes from window.COFFEE151_STORES, populated on each page from
// the editable Location content collection (see index.astro / locations.astro),
// so adding, removing, or correcting a location in the Visual Editor is
// reflected here automatically, with nothing to keep in sync by hand.
(function () {
    const mapEl = document.getElementById("locator-map");
    // The results list is optional: the locations page drops it (the state-
    // grouped grid below already shows every location as a card), while the
    // homepage still renders one. Map + search still work either way.
    const listEl = document.getElementById("locator-list");
    const searchEl = document.getElementById("locator-search");
    const STORES = window.COFFEE151_STORES || [];
    if (!mapEl || !searchEl || !STORES.length) return;
    // MapLibre absent means the loader deliberately skipped it because this
    // device has no WebGL (see locator-loader.js). Everything except the map
    // - search, ZIP distance sorting, state filters, the store list - works
    // without it, so this file still runs; `map` just stays null.
    const mapSupported = typeof maplibregl !== "undefined";

    // Store hours + phone come from global settings (editable), same for
    // every location today; swap to per-location fields or the Google
    // Places API later if that's ever needed.
    // Easter egg: searching one of these exactly (trimmed, case-insensitive)
    // hides every card without touching the map, so the searcher's own
    // location stays put instead of re-fitting to "all stores". Re-checked
    // on every keystroke via the same input handler as the real search, so
    // it only shows while the exact term is still in the box.
    //
    // Matched on a squashed form (lowercase, letters and digits only) so the
    // spacing and punctuation someone actually types doesn't decide whether
    // the joke lands: "7brew", "7 brew" and "7-brew" are all the same brand
    // to the person typing them.
    const COMPETITOR_TERMS = new Set([
        "7brew",
        "sevenbrew",
        "dutchbros",
        "dutchbrothers",
        "starbucks",
    ]);
    const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    const HOURS = (window.COFFEE151_LOCATOR && window.COFFEE151_LOCATOR.hours) || "Open daily 6 AM - 8 PM";
    const PHONE = (window.COFFEE151_LOCATOR && window.COFFEE151_LOCATOR.phone) || "(682) 325-2124";
    const PHONE_TEL = PHONE.replace(/\D/g, "");

    // The locations page supplies its own zoom buttons in a toolbar above
    // the map (a cleaner look than the library's default on-map control);
    // the homepage locator has no such toolbar, so it keeps the default.
    const zoomInEl = document.getElementById("locator-zoom-in");
    const zoomOutEl = document.getElementById("locator-zoom-out");
    const hasCustomZoom = !!(zoomInEl && zoomOutEl);

    // There used to be a minimum-zoom floor here (10 on mobile, 6 on desktop)
    // because Leaflet's raster tiles turned to unreadable mush when a fit
    // zoomed out far enough. It had to go: on a phone-sized map the fit that
    // frames every Texas store lands around zoom 7, so forcing 10 afterwards
    // zoomed straight past the stores it had just framed - an iPhone SE
    // opened the page, and every state filter click landed, on an empty patch
    // of map. Vector tiles stay sharp at any zoom, so there's nothing left to
    // protect against; maxZoom on the individual calls below is what keeps a
    // single-store fit from diving to street level.
    const isMobileViewport = () => window.matchMedia("(max-width: 902px)").matches;

    // Points are [lat, lng] everywhere in this file (and in the store data);
    // MapLibre wants [lng, lat]. Converting in one named place beats flipping
    // pairs inline at a dozen call sites.
    const toLngLat = (p) => [p[1], p[0]];
    function boundsOf(latlngs) {
        return latlngs.reduce(
            (b, p) => b.extend(toLngLat(p)),
            new maplibregl.LngLatBounds(toLngLat(latlngs[0]), toLngLat(latlngs[0])),
        );
    }
    function fitBoundsLegibly(latlngs, opts) {
        // No map (see the buildMap try/catch below) is a supported state, not
        // an error: the list is the fallback and it doesn't need framing.
        if (!map || !latlngs.length) return;
        // resize() first: a fit computed against a stale container size is
        // what put stores outside the frame on first load.
        map.resize();
        map.fitBounds(
            boundsOf(latlngs),
            // A phone's map box is much shorter than the desktop panel, so it
            // needs proportionally less padding before the padding itself
            // starts squeezing the stores out of frame.
            Object.assign({ duration: 0, padding: isMobileViewport() ? 24 : 40, maxZoom: 13 }, opts),
        );
    }

    // Locations page has state-narrowing buttons ("Texas" / "Kansas", one
    // marked up as .active - see locations.astro); the homepage locator
    // has neither, so it always starts from every store. Read whichever
    // button starts active rather than hardcoding a state here, so the
    // default stays in sync with the markup instead of two places having
    // to agree on it.
    const initialStateBtn = document.querySelector("[data-state-filter].active");
    const initialState = initialStateBtn ? initialStateBtn.dataset.stateFilter : "";
    const initialStores = initialState ? STORES.filter((s) => s.state === initialState) : STORES;

    // The map opens already framed on the real store bounds rather than on a
    // throwaway view it then corrects: `bounds` in the constructor means the
    // very first tile request is for the zoom it actually settles on. (Under
    // Leaflet's raster tiles that mattered even more - a throwaway view sent
    // a whole zoom level's worth of PNGs that were immediately abandoned.)
    const initialPoints = initialStores.map(s => [s.lat, s.lng]);
    let map = null;
    try {
        if (mapSupported) map = buildMap();
    } catch (err) {
        // The loader already screened for WebGL, so reaching here means the
        // context existed but MapLibre still couldn't start (a lost context,
        // a driver the browser gives up on mid-init). Everything below this
        // point is guarded by `map &&`, so the panel, search, and store list
        // carry on working with the map's slot closed up.
        console.warn("[locator] map unavailable, falling back to the list", err);
        const locator = mapEl.closest(".locator");
        if (locator) locator.classList.add("is-map-unavailable");
    }

    function buildMap() {
        const m = new maplibregl.Map({
            container: mapEl,
            style: window.COFFEE151_MAP.STYLE_URL,
            bounds: boundsOf(initialPoints.length ? initialPoints : [[32.75, -97.33]]),
            fitBoundsOptions: { padding: isMobileViewport() ? 24 : 40, maxZoom: 13 },
            scrollZoom: true,
            // The locations page has its own zoom buttons in a toolbar; only
            // the homepage locator needs the on-map control.
            attributionControl: false,
            dragRotate: false,
        });
        window.COFFEE151_MAP.lockRotation(m);
        // Kept even with attributionControl off in the constructor: CARTO and
        // OpenStreetMap both require credit, and compact mode is a single "i"
        // that expands on tap rather than a line of text across the map.
        m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
        if (!hasCustomZoom) {
            m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        }

        if (hasCustomZoom) {
            zoomInEl.addEventListener("click", () => m.zoomIn());
            zoomOutEl.addEventListener("click", () => m.zoomOut());
        }

        // The constructor's fit runs against whatever size the container
        // reported at that instant, which on a phone is routinely before the
        // map box has its final height. Re-fit once the style is up and the
        // real size is known, or the stores end up outside the frame.
        m.once("load", () => {
            m.resize();
            if (initialPoints.length) {
                m.fitBounds(boundsOf(initialPoints), {
                    duration: 0,
                    padding: isMobileViewport() ? 24 : 40,
                    maxZoom: 13,
                });
            }
        });

        // A context lost after a clean start (the browser reclaiming GPU
        // memory, a driver reset) leaves a blank canvas behind with no error
        // thrown. Close the slot the same way the never-started case does.
        m.getCanvas().addEventListener("webglcontextlost", () => {
            const locator = mapEl.closest(".locator");
            if (locator) locator.classList.add("is-map-unavailable");
        });

        return m;
    }

    const markers = !map ? [] : STORES.map((store, i) => {
        const shortName = store.name.replace("151 Coffee ", "");
        const nameHtml = store.slug
            ? `<a href="/locations/${store.slug}"><strong>${store.name}</strong></a>`
            : `<strong>${store.name}</strong>`;
        const popup = new maplibregl.Popup({ offset: 46, closeButton: true, maxWidth: "260px" }).setHTML(
            `${nameHtml}<br>${store.address}<br>${store.city}, ${store.state} ${store.zip}<br>${HOURS}<br><a href="tel:+1${PHONE_TEL}">${PHONE}</a>`
        );
        // The store's name rides inside the marker element (see
        // markerElement) instead of being a separate always-on tooltip layer,
        // so the label moves with the pin for free.
        const marker = new maplibregl.Marker({ element: window.COFFEE151_MAP.markerElement(shortName), anchor: "bottom" })
            .setLngLat([store.lng, store.lat])
            .setPopup(popup)
            .addTo(map);
        marker.getElement().addEventListener("click", () => setActive(i));
        return marker;
    });

    function directionsUrl(store) {
        return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
    }

    // origin (optional) = [lat, lng] of the searched location; when present we
    // show each store's distance and assume `stores` is already sorted nearest-first.
    function renderList(stores, origin) {
        if (!listEl) return;
        listEl.innerHTML = "";
        if (!stores.length) stores = STORES; // never leave the list empty
        stores.forEach((store) => {
            const originalIndex = STORES.indexOf(store);
            const item = document.createElement("div");
            // store.image/slug only exist on the locations page's store data
            // (the homepage locator doesn't pass them). Their presence is
            // what turns this into a photo card with a "More Info" link.
            item.className = store.image ? "locator__item locator-photo-card" : "locator__item";
            item.dataset.index = String(originalIndex);
            const dist = origin
                ? `<span class="locator__dist">${haversineMiles(origin[0], origin[1], store.lat, store.lng).toFixed(1)} mi</span>`
                : "";
            const photo = store.image ? `<img class="locator__item-photo" src="${store.image}" alt="" loading="lazy" decoding="async">` : "";
            const arrow = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            const moreInfo = store.slug ? `<a class="locator__more-info" href="/locations/${store.slug}">More Info${arrow}</a>` : "";
            const shortStoreName = store.name.replace("151 Coffee ", "");
            // Mobile-only card: photo + non-truncating name/hours/phone, so
            // the row reads at a glance without cutting anything off. No
            // address here by design - the row itself now opens the
            // store's More Info page (which has the full address), and
            // Directions doesn't need it repeated either. Hidden on
            // desktop; the stacked elements above are hidden on mobile
            // instead (see the max-width: 902px rules in style.css).
            // The Directions link lives here (under the name/hours/phone
            // text) rather than in .locator__item-actions below, which is
            // hidden on mobile - see the max-width: 902px rules in
            // style.css. Desktop keeps its own copy in .locator__item-actions.
            const mobileCard = `
                <div class="locator__mobile-card">
                    ${photo}
                    <div class="locator__mobile-info">
                        <p class="locator__mobile-name">${shortStoreName}</p>
                        <p class="locator__mobile-hours">${HOURS}</p>
                        <p class="locator__mobile-phone">${PHONE}</p>
                        <a class="locator__directions locator__directions--mobile" href="${directionsUrl(store)}" target="_blank" rel="noopener noreferrer">Directions${arrow}</a>
                    </div>
                </div>
            `;
            item.innerHTML = `
                <div class="locator__item-top">
                    ${photo}
                    <div class="locator__item-info">
                        <h3 class="locator__item-name">${shortStoreName}${dist}</h3>
                        <p>${store.address}<br>${store.city}, ${store.state} ${store.zip}</p>
                        ${moreInfo}
                    </div>
                </div>
                <div class="locator__item-bottom">
                    <div class="locator__item-bottom-text">
                        <p class="locator__hours">${HOURS}</p>
                        <a class="locator__phone" href="tel:+1${PHONE_TEL}">${PHONE}</a>
                    </div>
                    <div class="locator__item-actions">
                        <a class="locator__directions" href="${directionsUrl(store)}" target="_blank" rel="noopener noreferrer">Directions${photo ? arrow : ""}</a>
                    </div>
                </div>
                ${mobileCard}
            `;
            item.addEventListener("click", (e) => {
                if (e.target.closest(".locator__directions, .locator__phone, .locator__more-info")) return;
                // Compact rows (mobile + the shared tablet breakpoint, see
                // the max-width: 902px rules in style.css) drop the visible
                // "More Info" button - tapping the row itself takes its
                // place. Desktop keeps its old behavior: highlight + fly the
                // map to it, since More Info is still its own button there.
                if (store.slug && window.matchMedia("(max-width: 902px)").matches) {
                    window.location.href = `/locations/${store.slug}`;
                    return;
                }
                setActive(originalIndex);
            });
            listEl.appendChild(item);
        });
        requestAnimationFrame(squareMobilePhotos);
    }

    // Sizes each mobile-card photo (inline, in px) to exactly match its own
    // row's text-column height, so it's a true square flush with the card's
    // padding on every side - see the comment on .locator__mobile-card in
    // style.css for why this has to happen in JS rather than pure CSS.
    function squareMobilePhotos() {
        if (!listEl || !window.matchMedia("(max-width: 902px)").matches) return;
        listEl.querySelectorAll(".locator__mobile-card").forEach((card) => {
            const info = card.querySelector(".locator__mobile-info");
            const photo = card.querySelector(".locator__item-photo");
            if (!info || !photo) return;
            const h = info.offsetHeight;
            if (h) {
                photo.style.width = h + "px";
                photo.style.height = h + "px";
            }
        });
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(squareMobilePhotos, 150);
    });

    // Great-circle distance in miles.
    function haversineMiles(lat1, lon1, lat2, lon2) {
        const R = 3958.8, toRad = x => x * Math.PI / 180;
        const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function fitTo(stores) {
        if (!stores.length) return;
        fitBoundsLegibly(stores.map(s => [s.lat, s.lng]), { maxZoom: 13 });
    }

    // Geocode a US ZIP (free OpenStreetMap Nominatim) and order stores by distance.
    function searchByZip(zip) {
        fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&postalcode=${encodeURIComponent(zip)}&limit=1`)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                if (!data || !data.length) { renderList(STORES); fitTo(STORES); return; }
                const olat = parseFloat(data[0].lat), olon = parseFloat(data[0].lon);
                const sorted = STORES.slice().sort((a, b) =>
                    haversineMiles(olat, olon, a.lat, a.lng) - haversineMiles(olat, olon, b.lat, b.lng)
                );
                renderList(sorted, [olat, olon]);
                // Frame the searched ZIP plus the nearest few stores.
                const pts = [[olat, olon]].concat(sorted.slice(0, 4).map(s => [s.lat, s.lng]));
                fitBoundsLegibly(pts, { maxZoom: 12 });
            })
            .catch(() => { renderList(STORES); fitTo(STORES); }); // on any failure, show all
    }

    function setActive(index) {
        if (listEl) {
            listEl.querySelectorAll(".locator__item").forEach(el => el.classList.remove("active"));
            const item = listEl.querySelector(`.locator__item[data-index="${index}"]`);
            if (item) {
                item.classList.add("active");
                // Scroll the sidebar to the picked location either way - a
                // marker click should surface it in the list just as much as
                // clicking the list itself flies the map to it.
                item.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
        const store = STORES[index];
        if (!map) return;
        map.flyTo({ center: [store.lng, store.lat], zoom: 13, duration: 600 });
        const popup = markers[index].getPopup();
        if (popup && !popup.isOpen()) markers[index].togglePopup();
    }

    let geoTimer;
    searchEl.addEventListener("input", () => {
        const raw = searchEl.value.trim();
        clearTimeout(geoTimer);

        // A full 5-digit ZIP -> find the nearest stores (debounced so we geocode once).
        if (/^\d{5}$/.test(raw)) {
            geoTimer = setTimeout(() => searchByZip(raw), 400);
            return;
        }

        // Text search by name / address / city / state / partial zip.
        const q = raw.toLowerCase();

        if (COMPETITOR_TERMS.has(squash(q))) {
            if (listEl) {
                listEl.innerHTML = `
                    <div class="locator__competitor-egg">
                        <p class="locator__competitor-egg-title">NOT COOL, BRO.</p>
                        <p class="locator__competitor-egg-sub">Couldn't find any of those.</p>
                    </div>
                `;
            }
            return; // map stays exactly where it was
        }

        const filtered = STORES.filter(s =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.address.toLowerCase().includes(q) ||
            s.city.toLowerCase().includes(q) ||
            s.state.toLowerCase().includes(q) ||
            s.zip.includes(q)
        );
        // Never empty the list: if nothing matches, keep all locations on screen.
        const list = filtered.length ? filtered : STORES;
        renderList(list);
        fitTo(list);
    });

    // Optional state-narrowing buttons (locations page only - "Texas" /
    // "Kansas"). Clears whatever's in the search box so the two filters
    // don't fight each other over what the list shows.
    const stateButtons = document.querySelectorAll("[data-state-filter]");
    stateButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            stateButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            searchEl.value = "";
            const state = btn.dataset.stateFilter;
            const filtered = state ? STORES.filter((s) => s.state === state) : STORES;
            renderList(filtered);
            fitTo(filtered);
        });
    });

    renderList(initialStores);
})();
