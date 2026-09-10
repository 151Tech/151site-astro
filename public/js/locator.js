// 151 Coffee store locator - Leaflet + OpenStreetMap, no API key required.
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
    if (!mapEl || !searchEl || typeof L === "undefined" || !STORES.length) return;

    // Store hours + phone come from global settings (editable), same for
    // every location today; swap to per-location fields or the Google
    // Places API later if that's ever needed.
    const HOURS = (window.COFFEE151_LOCATOR && window.COFFEE151_LOCATOR.hours) || "Open daily 6 AM - 8 PM";
    const PHONE = (window.COFFEE151_LOCATOR && window.COFFEE151_LOCATOR.phone) || "(682) 325-2124";
    const PHONE_TEL = PHONE.replace(/\D/g, "");

    const redIcon = window.COFFEE151_LEAFLET.redIcon(L);

    // The locations page supplies its own zoom buttons in a toolbar above
    // the map (a cleaner look than Leaflet's default on-map control); the
    // homepage locator has no such toolbar, so it keeps Leaflet's default.
    const zoomInEl = document.getElementById("locator-zoom-in");
    const zoomOutEl = document.getElementById("locator-zoom-out");
    const hasCustomZoom = !!(zoomInEl && zoomOutEl);

    const map = L.map(mapEl, { scrollWheelZoom: true, attributionControl: false, zoomControl: !hasCustomZoom });

    if (hasCustomZoom) {
        zoomInEl.addEventListener("click", () => map.zoomIn());
        zoomOutEl.addEventListener("click", () => map.zoomOut());
    }

    // fitBounds can zoom out much further than the actual store spread
    // needs -- the map box is shorter on mobile (40vh vs. a full-height
    // desktop panel) so it naturally zooms out further there, and on any
    // viewport it can be thrown off by the container not having its final
    // size yet on first layout (map.invalidateSize() below guards against
    // that, but the floor is a hard backstop either way). Below that floor
    // road lines and labels shrink to unreadable, so clamp the zoom level
    // after every fitBounds call; stores that fall outside the frame are
    // still just a pan away, and every store is one tap away via the list.
    const isMobileViewport = () => window.matchMedia("(max-width: 902px)").matches;
    const MOBILE_MIN_ZOOM = 10;
    const DESKTOP_MIN_ZOOM = 6;
    function fitBoundsLegibly(latlngs, opts) {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(latlngs), opts);
        const floor = isMobileViewport() ? MOBILE_MIN_ZOOM : DESKTOP_MIN_ZOOM;
        if (map.getZoom() < floor) {
            map.setZoom(floor);
        }
    }

    // Fit to the real store bounds before the tile layer is added, so
    // Leaflet only ever requests tiles for the zoom level it actually
    // settles on. Setting a throwaway initial view (e.g. a hardcoded
    // zoom 6) here would make it fetch that zoom's tiles first, then
    // immediately abort/replace them once fitBounds below changes the
    // view -- wasted requests that the tile server was rejecting outright
    // (503s) rather than just canceling client-side.
    fitBoundsLegibly(STORES.map(s => [s.lat, s.lng]), { padding: [30, 30] });

    window.COFFEE151_LEAFLET.addTileLayer(L, map);

    const markers = STORES.map((store, i) => {
        const shortName = store.name.replace("151 Coffee ", "");
        const marker = L.marker([store.lat, store.lng], { icon: redIcon }).addTo(map);
        marker.bindTooltip(shortName, {
            permanent: true,
            direction: "top",
            offset: [0, -38],
            className: "locator__marker-tooltip"
        });
        const nameHtml = store.slug
            ? `<a href="/locations/${store.slug}"><strong>${store.name}</strong></a>`
            : `<strong>${store.name}</strong>`;
        marker.bindPopup(`${nameHtml}<br>${store.address}<br>${store.city}, ${store.state} ${store.zip}<br>${HOURS}<br><a href="tel:+1${PHONE_TEL}">${PHONE}</a>`);
        marker.on("click", () => setActive(i));
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
            // address here by design -- the row itself now opens the
            // store's More Info page (which has the full address), and
            // Directions doesn't need it repeated either. Hidden on
            // desktop; the stacked elements above are hidden on mobile
            // instead (see the max-width: 902px rules in style.css).
            // The Directions link lives here (under the name/hours/phone
            // text) rather than in .locator__item-actions below, which is
            // hidden on mobile -- see the max-width: 902px rules in
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
                <h3 class="locator__item-name">${shortStoreName}${dist}</h3>
                <div class="locator__item-top">
                    ${photo}
                    <div class="locator__item-info">
                        <p>${store.address}<br>${store.city}, ${store.state} ${store.zip}</p>
                    </div>
                </div>
                <div class="locator__item-bottom">
                    <p class="locator__hours">${HOURS}</p>
                    <a class="locator__phone" href="tel:+1${PHONE_TEL}">${PHONE}</a>
                </div>
                ${mobileCard}
                <div class="locator__item-actions">
                    <a class="locator__directions" href="${directionsUrl(store)}" target="_blank" rel="noopener noreferrer">Directions${photo ? arrow : ""}</a>
                    ${moreInfo}
                </div>
            `;
            item.addEventListener("click", (e) => {
                if (e.target.closest(".locator__directions, .locator__phone, .locator__more-info")) return;
                // Compact rows (mobile + the shared tablet breakpoint, see
                // the max-width: 902px rules in style.css) drop the visible
                // "More Info" button -- tapping the row itself takes its
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
    }

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
        fitBoundsLegibly(stores.map(s => [s.lat, s.lng]), { padding: [30, 30], maxZoom: 13 });
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
                fitBoundsLegibly(pts, { padding: [40, 40], maxZoom: 12 });
            })
            .catch(() => { renderList(STORES); fitTo(STORES); }); // on any failure, show all
    }

    function setActive(index) {
        if (listEl) {
            listEl.querySelectorAll(".locator__item").forEach(el => el.classList.remove("active"));
            const item = listEl.querySelector(`.locator__item[data-index="${index}"]`);
            if (item) {
                item.classList.add("active");
                // Scroll the sidebar to the picked location either way -- a
                // marker click should surface it in the list just as much as
                // clicking the list itself flies the map to it.
                item.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
        const store = STORES[index];
        map.flyTo([store.lat, store.lng], 13, { duration: 0.6 });
        markers[index].openPopup();
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

    // Optional state-narrowing buttons (locations page only -- "All" /
    // "Texas" / "Kansas"). Clears whatever's in the search box so the two
    // filters don't fight each other over what the list shows.
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

    renderList(STORES);
})();
