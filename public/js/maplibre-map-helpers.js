// Shared MapLibre setup for the store locator (locator.js) and the
// single-store map (store-map-loader.js): the basemap style, marker markup
// and WebGL check.
window.COFFEE151_MAP = {
    // CARTO Voyager vector tiles. The public basemap styles are free and need
    // no key.
    STYLE_URL: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',

    // Markers are DOM elements, so the store label sits inside the marker.
    // The label is optional; the single-store map shows just the pin.
    markerElement: function (label) {
        // Set by Layout.astro from the Storyblok logo; the pin works without
        // it.
        const logoUrl = window.COFFEE151_LOGO_URL;
        const el = document.createElement('div');
        el.className = 'locator__marker';
        const mark = logoUrl ? '<img class="locator__marker-logo" src="' + logoUrl + '" alt="">' : '';
        // Label first: the element is anchored at its bottom edge, so the
        // label sits above the pin.
        el.innerHTML =
            (label ? '<span class="locator__marker-tooltip">' + label + '</span>' : '') +
            '<span class="locator__marker-pin">' + mark + '</span>';
        return el;
    },

    // MapLibre needs WebGL and has no fallback, so this is checked before the
    // library is downloaded. locator-loader.js and store-map-loader.js carry
    // a small inline copy because they run before this file loads.
    hasWebGL: function () {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
        } catch {
            return false;
        }
    },

    // Rotation is off: a store map reads north-up, and an accidental twist
    // has no visible way back.
    lockRotation: function (map) {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
    },
};
