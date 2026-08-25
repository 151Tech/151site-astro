// Shared Leaflet setup used by both the multi-store locator (locator.js) and
// the single-store detail map (store-map-loader.js), so the marker icon and
// tile layer only need to be defined in one place.
window.COFFEE151_LEAFLET = {
    redIcon: function (L) {
        return L.divIcon({
            className: 'locator__marker',
            html: '<span class="locator__marker-pin"></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });
    },
    addTileLayer: function (L, map) {
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(map);
    }
};
