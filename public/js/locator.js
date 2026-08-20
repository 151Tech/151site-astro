// 151 Coffee store locator - Leaflet + OpenStreetMap, no API key required.
// Store data comes from window.COFFEE151_STORES, populated on each page from
// the editable Location content collection (see index.astro / locations.astro)
// - so adding, removing, or correcting a location in the Visual Editor is
// reflected here automatically, with nothing to keep in sync by hand.
(function () {
    const mapEl = document.getElementById("locator-map");
    // The results list is optional -- the locations page drops it (the state-
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

    const redIcon = L.divIcon({
        className: "locator__marker",
        html: '<span class="locator__marker-pin"></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
    });

    const map = L.map(mapEl, { scrollWheelZoom: true, attributionControl: false }).setView([33.0, -97.0], 6);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

    const markers = STORES.map((store, i) => {
        const shortName = store.name.replace("151 Coffee ", "");
        const marker = L.marker([store.lat, store.lng], { icon: redIcon }).addTo(map);
        marker.bindTooltip(shortName, {
            permanent: true,
            direction: "top",
            offset: [0, -26],
            className: "locator__marker-tooltip"
        });
        const nameHtml = store.slug
            ? `<a href="/locations/${store.slug}"><strong>${store.name}</strong></a>`
            : `<strong>${store.name}</strong>`;
        marker.bindPopup(`${nameHtml}<br>${store.address}<br>${store.city}, ${store.state} ${store.zip}<br>${HOURS}<br><a href="tel:+1${PHONE_TEL}">${PHONE}</a>`);
        marker.on("click", () => setActive(i, true));
        return marker;
    });

    const bounds = L.latLngBounds(STORES.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [30, 30] });

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
            // (the homepage locator doesn't pass them) -- their presence is
            // what turns this into a photo card with a "More Info" link.
            item.className = store.image ? "locator__item locator-photo-card" : "locator__item";
            item.dataset.index = String(originalIndex);
            const dist = origin
                ? `<span class="locator__dist">${haversineMiles(origin[0], origin[1], store.lat, store.lng).toFixed(1)} mi</span>`
                : "";
            const photo = store.image ? `<img class="locator__item-photo" src="${store.image}" alt="" loading="lazy" decoding="async">` : "";
            const arrow = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            const moreInfo = store.slug ? `<a class="locator__more-info" href="/locations/${store.slug}">More Info${arrow}</a>` : "";
            item.innerHTML = `
                ${photo}
                <div class="locator__item-info">
                    <h3>${store.name.replace("151 Coffee ", "")}${dist}</h3>
                    <p>${store.address}<br>${store.city}, ${store.state} ${store.zip}</p>
                    <p class="locator__hours">${HOURS}</p>
                    <a class="locator__phone" href="tel:+1${PHONE_TEL}">${PHONE}</a>
                </div>
                <div class="locator__item-actions">
                    <a class="locator__directions" href="${directionsUrl(store)}" target="_blank" rel="noopener noreferrer">Directions${photo ? arrow : ""}</a>
                    ${moreInfo}
                </div>
            `;
            item.addEventListener("click", (e) => {
                if (e.target.closest(".locator__directions, .locator__phone, .locator__more-info")) return;
                setActive(originalIndex, false);
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
        map.fitBounds(L.latLngBounds(stores.map(s => [s.lat, s.lng])), { padding: [30, 30], maxZoom: 13 });
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
                map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
            })
            .catch(() => { renderList(STORES); fitTo(STORES); }); // on any failure, show all
    }

    function setActive(index, fromMarker) {
        if (listEl) {
            listEl.querySelectorAll(".locator__item").forEach(el => el.classList.remove("active"));
            const item = listEl.querySelector(`.locator__item[data-index="${index}"]`);
            if (item) {
                item.classList.add("active");
                if (!fromMarker) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        // Never empty the list — if nothing matches, keep all locations on screen.
        const list = filtered.length ? filtered : STORES;
        renderList(list);
        fitTo(list);
    });

    renderList(STORES);
})();
