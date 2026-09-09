// Single source of truth for cookie-consent state. Kept separate from
// cookie-consent.js (which only builds the banner UI) so any other script --
// analytics-loader.js today, anything gated on consent later -- can read/
// write/subscribe to the decision without depending on the banner code at
// all. Load this before both.
(function () {
    const STORAGE_KEY = '151coffee_cookie_consent';
    const CONSENT_VERSION = '1'; // bump to re-prompt after policy changes

    const listeners = [];

    // Only ever set by an explicit click on the banner (see cookie-consent.js)
    // -- there is no "implied" or partial state. Anything else (never
    // visited, left without choosing, an older CONSENT_VERSION) reads back
    // as null, which is what tells the banner to keep showing on every page
    // until the visitor actually picks one of the two buttons.
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
        } catch { /* storage unavailable (e.g. private mode), ignore */ }
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
