// Loads Google Analytics (GA4) and the Meta/Facebook Pixel, but ONLY once
// the visitor has actively clicked "Accept All" on the cookie banner
// (cookie-consent.js, via consent.js) -- never on page load by default, and
// never after a decline or an implied non-answer. IDs come from
// window.COFFEE151_TRACKING_IDS, injected server-side in Layout.astro from
// the PUBLIC_GA_MEASUREMENT_ID / PUBLIC_META_PIXEL_ID env vars. Either one
// left blank just skips that vendor -- so this file is safe to ship now,
// before those IDs exist, and "activates" itself the moment they're set in
// Webflow Cloud with no further code change.
//
// No <noscript> pixel fallback: Meta's standard snippet includes one, but it
// fires unconditionally for visitors with JS disabled, bypassing consent
// entirely. Skipped on purpose -- that audience is negligible next to the
// privacy cost of a tracker that can't be gated.
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
        // GA4's Consent Mode v2: explicitly grant both, since the visitor has
        // already said "Accept All" by the time this function ever runs.
        gtag('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted' });
        gtag('config', ids.gaId, { anonymize_ip: true });
    }

    function loadMetaPixel() {
        if (metaLoaded || !ids.metaPixelId) return;
        metaLoaded = true;

        /* eslint-disable */
        !function (f, b, e, v, n, t, s) {
            if (f.fbq) return; n = f.fbq = function () {
                n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
            };
            if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
            n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
            s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */

        window.fbq('init', ids.metaPixelId);
        window.fbq('track', 'PageView');
    }

    function loadAll() {
        loadGoogleAnalytics();
        loadMetaPixel();
    }

    // Consent already granted on a previous visit/page -- load immediately.
    if (consent.get()?.accepted === true) {
        loadAll();
    }

    // Consent granted live, on this page, via the banner.
    consent.onChange((record) => {
        if (record.accepted === true) loadAll();
        // Revocation is handled by cookie-consent.js reloading the page --
        // there's no in-page "unload" call for either vendor's script.
    });
})();
