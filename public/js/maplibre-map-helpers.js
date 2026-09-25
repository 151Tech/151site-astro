// Shared MapLibre setup used by both the multi-store locator (locator.js)
// and the single-store detail map (store-map-loader.js), so the basemap
// style and marker markup only need to be defined in one place.
//
// This replaced Leaflet + CARTO *raster* tiles. Raster tiles are PNG images
// cut per zoom level, so every zoom step is a fresh network round trip and
// a visible blur-then-pop while the new images land. MapLibre renders CARTO's
// *vector* tiles on the GPU instead: geometry and labels are already in
// memory, so zooming is a continuous transform rather than an image swap.
// That's the same technique behind the maps that feel smooth in Amazon's and
// Google's apps - it's the rendering approach, not the data provider.
window.COFFEE151_MAP = {
    // CARTO's Voyager style as vector tiles - the same cartography the
    // raster version used, so the map still looks like itself. Free and
    // key-less for the public basemap styles (the key in the old raster URL
    // was only ever a quota identifier, never a secret).
    STYLE_URL: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',

    // MapLibre markers are plain DOM elements rather than Leaflet's divIcon,
    // which means the store label can live inside the marker itself instead
    // of being a separate "tooltip" layer the map has to keep positioned.
    // label is optional: the single-store detail map has nothing to
    // disambiguate, so it shows the pin alone.
    markerElement: function (label) {
        // Logo URL comes from Layout.astro (Storyblok's image service isn't
        // reachable from this plain, no-build JS file), so it's absent until
        // an editor sets settings/global -> Logo - the pin still works fine
        // with no inner mark in that case.
        var logoUrl = window.COFFEE151_LOGO_URL;
        var el = document.createElement('div');
        el.className = 'locator__marker';
        var mark = logoUrl ? '<img class="locator__marker-logo" src="' + logoUrl + '" alt="">' : '';
        // Label first, pin second: the element is anchored by its bottom
        // edge, so this stacks the bubble above the pin point.
        el.innerHTML =
            (label ? '<span class="locator__marker-tooltip">' + label + '</span>' : '') +
            '<span class="locator__marker-pin">' + mark + '</span>';
        return el;
    },

    // MapLibre draws through WebGL and has no non-GPU fallback: where the
    // context can't be created (old hardware, a GPU on the browser's
    // blocklist, WebGL disabled by policy, some low-power modes) the map is
    // a blank box rather than a slower map. Leaflet's image tiles used to
    // render anywhere, so this is the one capability the switch to vector
    // rendering actually costs us - hence checking for it up front, before
    // 200KB of library gets fetched to run something that can't run.
    //
    // Duplicated as a small inline copy in locator-loader.js and
    // store-map-loader.js, which have to decide whether to load the library
    // at all, i.e. before this file exists.
    hasWebGL: function () {
        try {
            var canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
        } catch (e) {
            return false;
        }
    },

    // Rotation is off everywhere. A store locator is read north-up, and a
    // stray two-finger twist leaving the map askew with no visible way back
    // is a worse trade than whatever the rotation buys.
    lockRotation: function (map) {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
    },
};
