// Loads MapLibre GL and the store locator only when the map is about to
// scroll into view.
(function () {
    const mapEl = document.getElementById('locator-map');
    if (!mapEl) return;

    // Without WebGL the library isn't loaded at all and the map slot closes
    // (.locator.is-map-unavailable); the store list works on its own.
    function hasWebGL() {
        try {
            const c = document.createElement('canvas');
            return !!(c.getContext('webgl2') || c.getContext('webgl'));
        } catch (e) {
            return false;
        }
    }
    if (!hasWebGL()) {
        const locator = mapEl.closest('.locator');
        if (locator) locator.classList.add('is-map-unavailable');
        // locator.js still runs without the library: it renders the list,
        // search, ZIP sorting and state filters.
        const listOnly = document.createElement('script');
        listOnly.src = '/js/locator.js';
        document.body.appendChild(listOnly);
        return;
    }

    let loaded = false;
    function loadMap() {
        if (loaded) return;
        loaded = true;

        // media="print", switched to "all" on load, keeps the stylesheet from
        // blocking render. MapLibre is self-hosted under a versioned
        // /vendor/maplibre-gl/<version>/ path so it can be cached long-term.
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/vendor/maplibre-gl/5.6.1/maplibre-gl.css';
        css.media = 'print';
        css.onload = function () { css.media = 'all'; };
        document.head.appendChild(css);

        const script = document.createElement('script');
        script.src = '/vendor/maplibre-gl/5.6.1/maplibre-gl.js';
        script.onload = function () {
            const helpersScript = document.createElement('script');
            // Files in public/ aren't fingerprinted, so bump this version
            // when locator.js changes to bypass cached copies.
            helpersScript.src = '/js/maplibre-map-helpers.js?v=1';
            helpersScript.onload = function () {
                const locatorScript = document.createElement('script');
                locatorScript.src = '/js/locator.js';
                document.body.appendChild(locatorScript);
            };
            document.body.appendChild(helpersScript);
        };
        document.body.appendChild(script);
    }

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(function (entries) {
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
