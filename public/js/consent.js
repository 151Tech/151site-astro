// Cookie consent state, shared by cookie-consent.js (the banner) and
// analytics-loader.js. Load before both.
(function () {
    const STORAGE_KEY = '151coffee_cookie_consent';
    const CONSENT_VERSION = '1'; // bump to re-prompt after policy changes

    const listeners = [];

    // Set only by a click on the banner. Anything else (no choice yet, or an
    // older CONSENT_VERSION) reads as null, and the banner keeps showing.
    function get() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return data.version === CONSENT_VERSION ? data : null;
        } catch { return null; }
    }

    function set(accepted) {
        const record = { version: CONSENT_VERSION, accepted, date: new Date().toISOString() };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch { /* storage unavailable (e.g. private mode) */ }
        listeners.forEach((fn) => {
            try { fn(record); } catch (err) { console.error('[consent] listener failed', err); }
        });
        return record;
    }

    function onChange(fn) {
        listeners.push(fn);
    }

    window.COFFEE151_CONSENT = { get, set, onChange };
})();
