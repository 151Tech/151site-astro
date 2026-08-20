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
        script.onload = initMap;
        document.body.appendChild(script);
    }

    function initMap() {
        var redIcon = L.divIcon({
            className: 'locator__marker',
            html: '<span class="locator__marker-pin"></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });

        var map = L.map(mapEl, { scrollWheelZoom: false, attributionControl: false }).setView([store.lat, store.lng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(map);

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
