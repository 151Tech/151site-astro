// Loads Google Analytics (GA4) and the Meta Pixel only after the visitor
// clicks "Accept All" on the cookie banner. IDs come from
// window.COFFEE151_TRACKING_IDS (Layout.astro, from PUBLIC_GA_MEASUREMENT_ID
// and PUBLIC_META_PIXEL_ID); a blank ID skips that vendor.
//
// There is no <noscript> pixel, since it would fire without consent.
(() => {
    const consent = window.COFFEE151_CONSENT;
    const ids = window.COFFEE151_TRACKING_IDS || {};
    if (!consent) return;

    let gaLoaded = false;
    let metaLoaded = false;

    function loadGoogleAnalytics() {
        if (gaLoaded || !ids.gaId) return;
        gaLoaded = true;

        const script = document.createElement('script');
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.gaId)}`;
        script.async = true;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        function gtag() { window.dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        // GA4 Consent Mode v2: both granted, since this only runs after
        // "Accept All".
        gtag('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted' });
        gtag('config', ids.gaId, { anonymize_ip: true });
    }

    function loadMetaPixel() {
        if (metaLoaded || !ids.metaPixelId) return;
        metaLoaded = true;

        !function (f, b, e, v, n, t, s) {
            if (f.fbq) return; n = f.fbq = function () {
                n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
            };
            if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
            n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
            s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

        window.fbq('init', ids.metaPixelId);
        window.fbq('track', 'PageView');
    }

    function loadAll() {
        loadGoogleAnalytics();
        loadMetaPixel();
    }

    // Consent granted on an earlier page.
    if (consent.get()?.accepted === true) {
        loadAll();
    }

    // Consent granted on this page.
    consent.onChange((record) => {
        if (record.accepted === true) loadAll();
        // Revoking consent reloads the page (cookie-consent.js); neither
        // vendor can be unloaded in place.
    });
})();
