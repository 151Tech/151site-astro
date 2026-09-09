(() => {
    const consent = window.COFFEE151_CONSENT;
    // Fail safe: if consent.js didn't load for some reason, show no banner
    // and load no trackers, rather than guessing.
    if (!consent) return;

    function dismiss(banner) {
        banner.classList.add('cc-hide');
        banner.addEventListener('transitionend', () => banner.remove(), { once: true });
    }

    function build() {
        if (document.getElementById('cookie-consent')) return; // already open
        const wasAccepted = consent.get()?.accepted === true;

        const banner = document.createElement('div');
        banner.id = 'cookie-consent';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Cookie consent');
        banner.innerHTML = `
            <div class="cc-inner">
                <div class="cc-text">
                    <div>
                        <strong>We use cookies 🍪</strong>
                        <p>Unlike our menu, these cookies won't give you a sugar rush -- just a faster site and the traffic/ad insights that help us reach more coffee lovers. No crumbs, we promise. Accept all, or keep it to the necessary ones.</p>
                    </div>
                </div>
                <div class="cc-actions">
                    <button class="cc-btn cc-decline" id="ccDecline">Necessary Only</button>
                    <button class="cc-btn cc-accept" id="ccAccept">Accept All</button>
                </div>
                <button class="cc-close" id="ccClose" aria-label="Close">&times;</button>
            </div>
        `;

        let answered = false;
        function choose(accepted) {
            answered = true;
            consent.set(accepted);
            dismiss(banner);
            // Granting consent needs no reload: analytics-loader.js is already
            // listening and loads GA/Meta immediately. Revoking previously-
            // granted consent has no clean in-page undo (GA/Meta don't offer
            // a "forget this pageview" call once their scripts have fired),
            // so reload into a fresh page that never loads them at all.
            if (wasAccepted && !accepted) {
                window.location.reload();
            }
        }

        banner.querySelector('#ccAccept').addEventListener('click', () => choose(true));
        banner.querySelector('#ccDecline').addEventListener('click', () => choose(false));
        banner.querySelector('#ccClose').addEventListener('click', () => choose(false));

        // If the visitor keeps browsing to another page without making an
        // explicit choice, remember that as long as nothing was already
        // stored -- but only as a non-accepting placeholder ("implied"), so
        // the banner stops re-showing without ever having actually granted
        // anything. An explicit click always overrides it.
        window.addEventListener('pagehide', () => {
            if (!answered && !consent.get()) consent.set(false, true);
        }, { once: true });

        document.body.appendChild(banner);

        // Slight delay so the slide-up animation plays on load
        requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('cc-visible')));
    }

    function init() {
        if (consent.get()) return; // already answered
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', build);
        } else {
            build();
        }
    }

    // Exposed so a "Cookie Preferences" control (see Footer.astro) can
    // reopen the banner on demand, even after a choice was already made.
    window.COFFEE151_REOPEN_CONSENT = build;

    init();
})();
