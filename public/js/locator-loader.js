// Loads Leaflet + the store locator only once the map is about to scroll
// into view, instead of on every page load regardless of whether the
// visitor ever reaches it.
(function () {
    var mapEl = document.getElementById('locator-map');
    if (!mapEl) return;

    var loaded = false;
    function loadMap() {
        if (loaded) return;
        loaded = true;

        // media="print" + swap-to-"all" on load keeps this stylesheet from
        // blocking render even though it's injected into <head> -- without
        // this, the browser holds first paint until it downloads (a slow
        // external unpkg.com round trip), no matter how "lazy" the loader is.
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.crossOrigin = '';
        css.media = 'print';
        css.onload = function () { css.media = 'all'; };
        document.head.appendChild(css);

        var script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = function () {
            var locatorScript = document.createElement('script');
            locatorScript.src = '/js/locator.js';
            document.body.appendChild(locatorScript);
        };
        document.body.appendChild(script);
    }

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    loadMap();
                    observer.disconnect();
                }
            });
        }, { rootMargin: '200px 0px' });
        observer.observe(mapEl);
    } else {
        loadMap();
    }
})();
