// Single-store map on the location page, lazy-loaded like locator-loader.js.
(function () {
    const mapEl = document.getElementById('storeMap');
    const store = window.STORE_MAP;
    if (!mapEl || !store) return;

    // Without WebGL the map box becomes a card with the address and a Google
    // Maps link.
    function hasWebGL() {
        try {
            const c = document.createElement('canvas');
            return !!(c.getContext('webgl2') || c.getContext('webgl'));
        } catch (e) {
            return false;
        }
    }
    if (!hasWebGL()) {
        mapEl.className = 'ld-map ld-map--fallback';
        mapEl.innerHTML =
            '<p class="ld-map-fallback-name"></p>' +
            '<p class="ld-map-fallback-address"></p>' +
            // The primary style; the secondary outline disappears on this
            // light card.
            '<a class="ld-btn ld-btn-primary" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' +
            encodeURIComponent(store.lat + ',' + store.lng) +
            '">Open in Google Maps</a>';
        // textContent, since this is CMS copy.
        mapEl.querySelector('.ld-map-fallback-name').textContent = store.name;
        mapEl.querySelector('.ld-map-fallback-address').textContent = store.address;
        return;
    }

    let loaded = false;
    function loadMap() {
        if (loaded) return;
        loaded = true;

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/vendor/maplibre-gl/5.6.1/maplibre-gl.css';
        document.head.appendChild(css);

        const script = document.createElement('script');
        script.src = '/vendor/maplibre-gl/5.6.1/maplibre-gl.js';
        script.onload = function () {
            const helpersScript = document.createElement('script');
            // Bump this version when maplibre-map-helpers.js changes (see
            // locator-loader.js).
            helpersScript.src = '/js/maplibre-map-helpers.js?v=1';
            helpersScript.onload = initMap;
            document.body.appendChild(helpersScript);
        };
        document.body.appendChild(script);
    }

    function initMap() {
        const map = new maplibregl.Map({
            container: mapEl,
            style: window.COFFEE151_MAP.STYLE_URL,
            center: [store.lng, store.lat],
            zoom: 15,
            // The map sits inside a scrolling page, so the mouse wheel
            // scrolls the page instead of zooming.
            scrollZoom: false,
            attributionControl: false,
            dragRotate: false
        });
        window.COFFEE151_MAP.lockRotation(map);
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        // One store, already named on the page, so the pin has no label.
        const popup = new maplibregl.Popup({ offset: 46, closeButton: true })
            .setHTML('<strong>' + store.name + '</strong><br>' + store.address);
        new maplibregl.Marker({ element: window.COFFEE151_MAP.markerElement(''), anchor: 'bottom' })
            .setLngLat([store.lng, store.lat])
            .setPopup(popup)
            .addTo(map)
            .togglePopup();
    }

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) { loadMap(); observer.disconnect(); }
            });
        }, { rootMargin: '600px 0px' });
        observer.observe(mapEl);
    } else {
        loadMap();
    }
})();
