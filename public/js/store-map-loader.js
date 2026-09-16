// Single-store map on the location detail page. Same lazy-load pattern as
// locator-loader.js on the locations page, but with one fixed marker
// instead of the full search/list locator.
(function () {
    var mapEl = document.getElementById('storeMap');
    var store = window.STORE_MAP;
    if (!mapEl || !store) return;

    var loaded = false;
    function loadMap() {
        if (loaded) return;
        loaded = true;

        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.crossOrigin = '';
        document.head.appendChild(css);

        var script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = function () {
            var helpersScript = document.createElement('script');
            // Versioned so a change to this file's content bypasses any
            // browser/CDN cache of the unfingerprinted /js/ path -- see the
            // matching note in locator-loader.js.
            helpersScript.src = '/js/leaflet-map-helpers.js?v=2';
            helpersScript.onload = initMap;
            document.body.appendChild(helpersScript);
        };
        document.body.appendChild(script);
    }

    function initMap() {
        var redIcon = window.COFFEE151_LEAFLET.redIcon(L);

        var map = L.map(mapEl, { scrollWheelZoom: false, attributionControl: false }).setView([store.lat, store.lng], 15);

        window.COFFEE151_LEAFLET.addTileLayer(L, map);

        L.marker([store.lat, store.lng], { icon: redIcon })
            .addTo(map)
            .bindPopup('<strong>' + store.name + '</strong><br>' + store.address)
            .openPopup();
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
