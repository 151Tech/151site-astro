// Shared Leaflet setup used by both the multi-store locator (locator.js) and
// the single-store detail map (store-map-loader.js), so the marker icon and
// tile layer only need to be defined in one place.
window.COFFEE151_LEAFLET = {
    redIcon: function (L) {
        // Logo URL comes from Layout.astro (Storyblok's image service isn't
        // reachable from this plain, no-build JS file), so it's absent until
        // an editor sets settings/global -> Logo -- the pin still works fine
        // with no inner mark in that case.
        var logoUrl = window.COFFEE151_LOGO_URL;
        var mark = logoUrl ? '<img class="locator__marker-logo" src="' + logoUrl + '" alt="">' : '';
        return L.divIcon({
            className: 'locator__marker',
            html: '<span class="locator__marker-pin">' + mark + '</span>',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });
    },
    addTileLayer: function (L, map) {
        // Stock OSM raster tiles (no API key needed). The duotone filter
        // below (see .locator__map in style.css) grayscales this, then
        // recolors it toward red -- the source style's brightest lines
        // (main roads, which OSM already renders lightest/most saturated)
        // come out reddest, while darker fill (land/water) stays muted gray.
        //
        // (Previously tried loading tiles one zoom level deeper stretched to
        // 2x display size to make roads/labels look bigger -- that upscales
        // a lower-resolution source image, so it just made everything
        // blurry instead. Reverted: legibility comes from the zoom floor in
        // locator.js and the contrast/saturation below instead.)
        return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            subdomains: 'abc',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }
};
