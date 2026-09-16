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
        // CARTO's free Positron basemap, served off their own CDN -- fast
        // and built for production traffic, unlike hotlinking OSM's own
        // tile.openstreetmap.org servers (their usage policy explicitly asks
        // sites not to do that; it's a community server, not a CDN, which is
        // exactly why the map was slow/choppy). No API key or signup needed,
        // and CARTO's free basemaps have been a stable, widely-used default
        // for Leaflet sites for years. Positron's pale, low-contrast style
        // was picked deliberately: it makes the red pins the only thing that
        // pops, so no CSS recolor filter is needed on top (that filter --
        // grayscale/contrast/sepia/hue-rotate/saturate plus five stacked
        // drop-shadows, previously in .locator__map .leaflet-tile-pane in
        // style.css -- was expensive to render on every tile during pan/zoom
        // and is what made the map unreadable at some zoom levels; removed).
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(map);
    }
};
