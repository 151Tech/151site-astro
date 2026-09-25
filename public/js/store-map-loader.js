// Single-store map on the location detail page. Same lazy-load pattern as
// locator-loader.js on the locations page, but with one fixed marker
// instead of the full search/list locator.
(function () {
    var mapEl = document.getElementById('storeMap');
    var store = window.STORE_MAP;
    if (!mapEl || !store) return;

    // WebGL guard, same as locator-loader.js -- see hasWebGL in
    // maplibre-map-helpers.js. This page has no store list to fall back on,
    // so the empty map box becomes a card with the address and a link out to
    // Google Maps, which is where "Get Directions" above it goes anyway.
    function hasWebGL() {
        try {
            var c = document.createElement('canvas');
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
            // Primary, not secondary: ld-btn-secondary is an outline styled
            // for the dark info panel above, and it disappears against this
            // card's light background.
            '<a class="ld-btn ld-btn-primary" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' +
            encodeURIComponent(store.lat + ',' + store.lng) +
            '">Open in Google Maps</a>';
        // textContent, not interpolation: this is CMS copy going into markup.
        mapEl.querySelector('.ld-map-fallback-name').textContent = store.name;
        mapEl.querySelector('.ld-map-fallback-address').textContent = store.address;
        return;
    }

    var loaded = false;
    function loadMap() {
        if (loaded) return;
        loaded = true;

        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css';
        css.crossOrigin = '';
        document.head.appendChild(css);

        var script = document.createElement('script');
        script.src = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js';
        script.onload = function () {
            var helpersScript = document.createElement('script');
            // Versioned so a change to this file's content bypasses any
            // browser/CDN cache of the unfingerprinted /js/ path -- see the
            // matching note in locator-loader.js.
            helpersScript.src = '/js/maplibre-map-helpers.js?v=1';
            helpersScript.onload = initMap;
            document.body.appendChild(helpersScript);
        };
        document.body.appendChild(script);
    }

    function initMap() {
        var map = new maplibregl.Map({
            container: mapEl,
            style: window.COFFEE151_MAP.STYLE_URL,
            center: [store.lng, store.lat],
            zoom: 15,
            // The map is one element in a scrolling page here, not the page
            // itself -- a wheel over it should keep scrolling past it rather
            // than trapping the scroll and zooming.
            scrollZoom: false,
            attributionControl: false,
            dragRotate: false
        });
        window.COFFEE151_MAP.lockRotation(map);
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        // No label inside the pin: there's only one store on this map and the
        // page around it already names the place.
        var popup = new maplibregl.Popup({ offset: 46, closeButton: true })
            .setHTML('<strong>' + store.name + '</strong><br>' + store.address);
        new maplibregl.Marker({ element: window.COFFEE151_MAP.markerElement(''), anchor: 'bottom' })
            .setLngLat([store.lng, store.lat])
            .setPopup(popup)
            .addTo(map)
            .togglePopup();
    }

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) { loadMap(); observer.disconnect(); }
            });
        }, { rootMargin: '600px 0px' });
        observer.observe(mapEl);
    } else {
        loadMap();
    }
})();
