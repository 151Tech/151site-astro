// Store locator: MapLibre GL with CARTO vector tiles (no API key). Store data
// comes from window.COFFEE151_STORES, set by each page from the Storyblok
// locations.
(function () {
    const mapEl = document.getElementById("locator-map");
    // The results list is optional (the locations page shows its own store
    // grid). Map and search work either way.
    const listEl = document.getElementById("locator-list");
    const searchEl = document.getElementById("locator-search");
    const STORES = window.COFFEE151_STORES || [];
    if (!mapEl || !searchEl || !STORES.length) return;
    // No maplibregl means the loader skipped it because the device has no
    // WebGL. Search, sorting, filters and the list still work; `map` stays
    // null.
    const mapSupported = typeof maplibregl !== "undefined";

    // Easter egg: searching exactly one of these (ignoring case, spaces and
    // punctuation, so "7 brew" and "7-brew" both count) hides every card and
    // leaves the map alone. It shows only while the term is in the box.
    const COMPETITOR_TERMS = new Set([
        "7brew",
        "sevenbrew",
        "dutchbros",
        "dutchbrothers",
        "starbucks",
    ]);
    const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    // "151 Coffee Keller" -> "Keller"
    const shortStoreName = (name) => String(name).replace(/^151 Coffee\s*/i, "") || name;
    const HOURS = (window.COFFEE151_LOCATOR && window.COFFEE151_LOCATOR.hours) || "Open daily 6 AM - 8 PM";

    // The locations page has its own zoom buttons above the map; the homepage
    // uses the built-in control.
    const zoomInEl = document.getElementById("locator-zoom-in");
    const zoomOutEl = document.getElementById("locator-zoom-out");
    const hasCustomZoom = !!(zoomInEl && zoomOutEl);

    // No minimum zoom: vector tiles stay sharp, and on a phone the fit that
    // frames every store lands around zoom 7. maxZoom on each fit keeps a
    // single store from zooming to street level.
    const isMobileViewport = () => window.matchMedia("(max-width: 902px)").matches;

    // Points are [lat, lng] in this file and the store data; MapLibre wants
    // [lng, lat].
    const toLngLat = (p) => [p[1], p[0]];
    function boundsOf(latlngs) {
        return latlngs.reduce(
            (b, p) => b.extend(toLngLat(p)),
            new maplibregl.LngLatBounds(toLngLat(latlngs[0]), toLngLat(latlngs[0])),
        );
    }
    function fitBoundsLegibly(latlngs, opts) {
        // Without a map there is nothing to frame.
        if (!map || !latlngs.length) return;
        // resize() first, so the fit uses the container's current size.
        map.resize();
        map.fitBounds(
            boundsOf(latlngs),
            // Phones get less padding so it doesn't squeeze stores out of
            // frame.
            Object.assign({ duration: 0, padding: isMobileViewport() ? 24 : 40, maxZoom: 13 }, opts),
        );
    }

    // Start from whichever state button is marked active in the markup
    // (locations page only); otherwise show every store.
    const initialStateBtn = document.querySelector("[data-state-filter].active");
    const initialState = initialStateBtn ? initialStateBtn.dataset.stateFilter : "";
    const initialStores = initialState ? STORES.filter((s) => s.state === initialState) : STORES;

    // Open already framed on the store bounds, so the first tiles requested
    // are at the final zoom.
    const initialPoints = initialStores.map(s => [s.lat, s.lng]);
    let map = null;
    try {
        if (mapSupported) map = buildMap();
    } catch (err) {
        // WebGL exists but MapLibre failed to start. Everything below is
        // guarded by `map &&`, so the rest of the locator keeps working with
        // the map slot closed.
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
            // Only the homepage locator needs the on-map zoom control.
            attributionControl: false,
            dragRotate: false,
        });
        window.COFFEE151_MAP.lockRotation(m);
        // CARTO and OpenStreetMap require credit; compact mode shows it as a
        // small "i".
        m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
        if (!hasCustomZoom) {
            m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        }

        if (hasCustomZoom) {
            zoomInEl.addEventListener("click", () => m.zoomIn());
            zoomOutEl.addEventListener("click", () => m.zoomOut());
        }

        // Re-fit once the style loads, when the container has its final
        // height (often not yet true on phones at construction time).
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

        // A context lost later (GPU memory reclaimed, driver reset) leaves a
        // blank canvas with no error; close the slot the same way.
        m.getCanvas().addEventListener("webglcontextlost", () => {
            const locator = mapEl.closest(".locator");
            if (locator) locator.classList.add("is-map-unavailable");
        });

        return m;
    }

    const markers = !map ? [] : STORES.map((store, i) => {
        const nameHtml = store.slug
            ? `<a href="/locations/${store.slug}"><strong>${store.name}</strong></a>`
            : `<strong>${store.name}</strong>`;
        const popup = new maplibregl.Popup({ offset: 46, closeButton: true, maxWidth: "260px" }).setHTML(
            `${nameHtml}<br>${store.address}<br>${store.city}, ${store.state} ${store.zip}<br>${HOURS}`
        );
        // The store name is part of the marker element, so the label moves
        // with the pin.
        const marker = new maplibregl.Marker({ element: window.COFFEE151_MAP.markerElement(shortStoreName(store.name)), anchor: "bottom" })
            .setLngLat([store.lng, store.lat])
            .setPopup(popup)
            .addTo(map);
        marker.getElement().addEventListener("click", () => setActive(i));
        return marker;
    });

    function directionsUrl(store) {
        return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
    }

    // origin (optional) is the searched [lat, lng]; when present, distances
    // are shown and `stores` is already sorted nearest first.
    function renderList(stores, origin) {
        if (!listEl) return;
        listEl.innerHTML = "";
        if (!stores.length) stores = STORES; // never leave the list empty
        stores.forEach((store) => {
            const originalIndex = STORES.indexOf(store);
            const item = document.createElement("div");
            // image and slug are only passed by the locations page; with them
            // the row becomes a photo card with a "More Info" link.
            item.className = store.image ? "locator__item locator-photo-card" : "locator__item";
            item.dataset.index = String(originalIndex);
            const dist = origin
                ? `<span class="locator__dist">${haversineMiles(origin[0], origin[1], store.lat, store.lng).toFixed(1)} mi</span>`
                : "";
            const photo = store.image ? `<img class="locator__item-photo" src="${store.image}" alt="" loading="lazy" decoding="async">` : "";
            const arrow = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            const moreInfo = store.slug ? `<a class="locator__more-info" href="/locations/${store.slug}">More Info${arrow}</a>` : "";
            const shortName = shortStoreName(store.name);
            // Mobile card: photo, full name, hours and Directions. The row
            // itself links to the store page, which has the address. Hidden
            // on desktop, where the elements above show instead (see the
            // max-width: 902px rules in style.css).
            const mobileCard = `
                <div class="locator__mobile-card">
                    ${photo}
                    <div class="locator__mobile-info">
                        <p class="locator__mobile-name">${shortName}</p>
                        <p class="locator__mobile-hours">${HOURS}</p>
                        <a class="locator__directions locator__directions--mobile" href="${directionsUrl(store)}" target="_blank" rel="noopener noreferrer">Directions${arrow}</a>
                    </div>
                </div>
            `;
            item.innerHTML = `
                <div class="locator__item-top">
                    ${photo}
                    <div class="locator__item-info">
                        <h3 class="locator__item-name">${shortName}${dist}</h3>
                        <p>${store.address}<br>${store.city}, ${store.state} ${store.zip}</p>
                        ${moreInfo}
                    </div>
                </div>
                <div class="locator__item-bottom">
                    <div class="locator__item-bottom-text">
                        <p class="locator__hours">${HOURS}</p>
                    </div>
                    <div class="locator__item-actions">
                        <a class="locator__directions" href="${directionsUrl(store)}" target="_blank" rel="noopener noreferrer">Directions${photo ? arrow : ""}</a>
                    </div>
                </div>
                ${mobileCard}
            `;
            item.addEventListener("click", (e) => {
                if (e.target.closest(".locator__directions, .locator__more-info")) return;
                // On compact layouts (max-width: 902px) the whole row opens
                // the store page. On desktop a click highlights the store and
                // flies the map to it.
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

    // Sizes each mobile card photo to its row's text height so it's a true
    // square (see .locator__mobile-card in style.css).
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

    // Geocode a US ZIP (OpenStreetMap Nominatim) and sort stores by distance.
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
                // Scroll the list to the selected store, whether it was
                // picked on the map or in the list.
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

        // A full 5-digit ZIP finds the nearest stores (debounced to geocode
        // once).
        if (/^\d{5}$/.test(raw)) {
            geoTimer = setTimeout(() => searchByZip(raw), 400);
            return;
        }

        // Text search by name, address, city, state or partial ZIP.
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
        // If nothing matches, keep every location listed.
        const list = filtered.length ? filtered : STORES;
        renderList(list);
        fitTo(list);
    });

    // State buttons (locations page only). Clears the search box so the two
    // filters don't conflict.
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
