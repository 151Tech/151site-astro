// Single source of truth for cookie-consent state. Kept separate from
// cookie-consent.js (which only builds the banner UI) so any other script --
// analytics-loader.js today, anything gated on consent later -- can read/
// write/subscribe to the decision without depending on the banner code at
// all. Load this before both.
(function () {
    const STORAGE_KEY = '151coffee_cookie_consent';
    const CONSENT_VERSION = '1'; // bump to re-prompt after policy changes

    const listeners = [];

    function get() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return data.version === CONSENT_VERSION ? data : null;
        } catch { return null; }
    }

    // implied=true means the visitor never actively answered (e.g. left the
    // site with the banner still up) -- accepted is always false in that
    // case, so nothing tracking-related ever gets triggered by an implied
    // record. Only an explicit click sets accepted=true.
    function set(accepted, implied = false) {
        const record = { version: CONSENT_VERSION, accepted, implied, date: new Date().toISOString() };
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
