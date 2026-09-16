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
        // CARTO Voyager raster tiles via a CARTO account key, served off
        // their own CDN -- fast and built for production traffic, unlike
        // hotlinking OSM's own tile.openstreetmap.org servers (their usage
        // policy explicitly asks sites not to do that; it's a community
        // server, not a CDN, which is exactly why the map was slow/choppy).
        // The key is meant to be visible client-side (same as it works for
        // Google Maps JS keys) -- it's a rate-limit/quota identifier, not a
        // secret, and CARTO's dashboard can restrict it by domain if needed.
        return L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_3nr9_1_383e18c49d0d0238db05d4c2', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(map);
    }
};
