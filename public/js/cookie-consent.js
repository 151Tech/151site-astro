(() => {
    const STORAGE_KEY = '151coffee_cookie_consent';
    const CONSENT_VERSION = '1'; // bump to re-prompt after policy changes

    function getConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return data.version === CONSENT_VERSION ? data : null;
        } catch { return null; }
    }

    function setConsent(accepted, implied = false) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: CONSENT_VERSION,
                accepted,
                implied,
                date: new Date().toISOString()
            }));
        } catch { /* storage unavailable (e.g. private mode) — ignore */ }
    }

    function dismiss(banner) {
        banner.classList.add('cc-hide');
        banner.addEventListener('transitionend', () => banner.remove(), { once: true });
    }

    function build() {
        const banner = document.createElement('div');
        banner.id = 'cookie-consent';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Cookie consent');
        banner.innerHTML = `
            <div class="cc-inner">
                <div class="cc-text">
                    <div>
                        <strong>We use cookies 🍪</strong>
                        <p>Unlike our menu, these cookies won't give you a sugar rush — just a better site (faster pages, smarter recommendations, that sort of thing). No crumbs, we promise. Accept all, or keep it to the necessary ones.</p>
                    </div>
                </div>
                <div class="cc-actions">
                    <button class="cc-btn cc-decline" id="ccDecline">Necessary Only</button>
                    <button class="cc-btn cc-accept" id="ccAccept">Accept All 🍪</button>
                </div>
                <button class="cc-close" id="ccClose" aria-label="Close">&times;</button>
            </div>
        `;

        let answered = false;
        function choose(accepted) {
            answered = true;
            setConsent(accepted);
            dismiss(banner);
        }

        banner.querySelector('#ccAccept').addEventListener('click', () => choose(true));
        banner.querySelector('#ccDecline').addEventListener('click', () => choose(false));
        banner.querySelector('#ccClose').addEventListener('click', () => choose(false));

        // If the visitor keeps browsing to another page without making an
        // explicit choice, treat it as implied consent (necessary cookies only)
        // and remember it — so the banner isn't shown again on every page.
        window.addEventListener('pagehide', () => {
            if (!answered && !getConsent()) setConsent(false, true);
        }, { once: true });

        document.body.appendChild(banner);

        // Slight delay so the slide-up animation plays on load
        requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('cc-visible')));
    }

    function init() {
        if (getConsent()) return; // already answered
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', build);
        } else {
            build();
        }
    }

    init();
})();
