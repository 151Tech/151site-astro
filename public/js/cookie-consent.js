(() => {
    const consent = window.COFFEE151_CONSENT;
    // Without consent.js, show no banner and load no trackers.
    if (!consent) return;

    function dismiss(banner) {
        banner.classList.add('cc-hide');
        banner.addEventListener('transitionend', () => banner.remove(), { once: true });
    }

    function build() {
        if (document.getElementById('cookie-consent')) return; // already open
        const wasAccepted = consent.get()?.accepted === true;

        // 1-in-1,000 easter egg: the same banner with different copy. It
        // records consent exactly the same way.
        const isCookieMonster = Math.random() < 1 / 1000;
        const copy = isCookieMonster
            ? {
                  title: 'I got you cookie, man!',
                  body: "You gave me a cookie, I gave you a cookie. You gave me a cookie, gave you cookie. Gave me cookie, got you cookie! You gave me cookie, I got you cookie, man! Gave me cookie, got you cookie!",
                  decline: 'Give me cookie',
                  accept: 'Got you cookie',
              }
            : {
                  title: 'We use cookies 🍪',
                  body: "Unlike our menu, these cookies won't give you a sugar rush, just a faster site and the traffic/ad insights that help us reach more coffee lovers. No crumbs, we promise.",
                  decline: 'Necessary Only',
                  accept: 'Accept All',
              };

        const banner = document.createElement('div');
        banner.id = 'cookie-consent';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Cookie consent');
        banner.innerHTML = `
            <div class="cc-inner">
                <div class="cc-text">
                    <div>
                        <strong>${copy.title}</strong>
                        <p>${copy.body}</p>
                    </div>
                </div>
                <div class="cc-actions">
                    <button class="cc-btn cc-decline" id="ccDecline">${copy.decline}</button>
                    <button class="cc-btn cc-accept" id="ccAccept">${copy.accept}</button>
                </div>
                <button class="cc-close" id="ccClose" aria-label="Close">&times;</button>
            </div>
        `;

        function choose(accepted) {
            consent.set(accepted);
            dismiss(banner);
            // Granting consent needs no reload: analytics-loader.js is
            // already listening. Revoking reloads into a page that never
            // loads the trackers, since they can't be unloaded.
            if (wasAccepted && !accepted) {
                window.location.reload();
            }
        }

        banner.querySelector('#ccAccept').addEventListener('click', () => choose(true));
        banner.querySelector('#ccDecline').addEventListener('click', () => choose(false));
        banner.querySelector('#ccClose').addEventListener('click', () => choose(false));

        // Nothing is recorded unless a button is clicked; the banner returns
        // on every page until then.
        document.body.appendChild(banner);

        // Short delay so the slide-up animation plays.
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

    // Lets the footer's "Cookie Preferences" link reopen the banner.
    window.COFFEE151_REOPEN_CONSENT = build;

    init();
})();
