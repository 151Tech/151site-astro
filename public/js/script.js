// The nav hides on scroll down, returns on scroll up, and condenses once scrolled.
(function () {
  const nav = document.querySelector('nav');
  if (!nav) return;
  const REVEAL_TOP = 90;
  const DELTA = 5;
  let lastY = window.scrollY || 0;
  let ticking = false;

  function update() {
    const y = window.scrollY || 0;
    nav.classList.toggle('nav-scrolled', y > 40);

    if (y < REVEAL_TOP) {
      nav.classList.remove('nav-hidden');
    } else if (y > lastY + DELTA) {
      nav.classList.add('nav-hidden');
    } else if (y < lastY - DELTA) {
      nav.classList.remove('nav-hidden');
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
})();

// Smooth scrolling for in-page links
document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.getElementById(decodeURIComponent(this.getAttribute('href').slice(1)));
        if (!target) return;
        e.preventDefault();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        history.pushState(null, '', this.getAttribute('href'));
    });
});

// Mobile drawer nav
(function () {
    const toggle = document.querySelector('.menu-toggle');
    if (!toggle) return;

    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';

    const drawer = document.createElement('div');
    drawer.className = 'mobile-nav-drawer';
    drawer.id = 'mobileNavDrawer';
    drawer.setAttribute('aria-label', 'Site navigation');
    // Out of the tab order and hidden from screen readers while closed.
    drawer.inert = true;

    const srcList = document.querySelector('nav .nav-links');
    if (srcList) {
        const cloned = srcList.cloneNode(true);
        drawer.appendChild(cloned);
    }

    const gcBtn = document.querySelector('#giftCardNavBtn');
    if (gcBtn) {
        const wrapper = document.createElement('div');
        wrapper.className = 'drawer-gc-btn';
        const btn = document.createElement('button');
        btn.className = 'main-menu-btn';
        btn.type = 'button';
        btn.textContent = gcBtn.textContent;
        btn.addEventListener('click', () => {
            closeDrawer();
            openGiftCardModal();
        });
        wrapper.appendChild(btn);
        drawer.appendChild(wrapper);
    }

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    function openDrawer() {
        overlay.classList.add('open');
        requestAnimationFrame(() => overlay.classList.add('visible'));
        drawer.classList.add('open');
        toggle.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
        drawer.inert = false;
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        overlay.classList.remove('visible');
        drawer.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        drawer.inert = true;
        document.body.style.overflow = '';
        setTimeout(() => overlay.classList.remove('open'), 320);
    }

    toggle.addEventListener('click', () => {
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
            closeDrawer();
            toggle.focus();
        }
    });

    overlay.addEventListener('click', closeDrawer);

    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));
})();

// Gift card modal
const giftCardModal = document.getElementById('giftCardModal');
const giftCardNavBtn = document.getElementById('giftCardNavBtn');
const giftCardFooterBtn = document.getElementById('giftCardFooterBtn');
const giftCardFooterSupportBtn = document.getElementById('giftCardFooterSupportBtn');
const closeGiftCardModal = document.getElementById('closeGiftCardModal');

// The Crisp gift card iframe loads on first open and stays behind a spinner
// (.crisp-loader) until it has loaded and a minimum delay has passed, which
// covers Crisp's own dark loading screen.
function activateCrispEmbed(modal) {
    const wrapper = modal.querySelector('.crisp');
    const iframe = modal.querySelector('iframe[data-src]');
    if (!iframe) return;
    const minDelay = new Promise((resolve) => setTimeout(resolve, 1200));
    const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
    Promise.all([minDelay, loaded]).then(() => {
        wrapper?.classList.add('crisp-loaded');
    });
    iframe.src = iframe.getAttribute('data-src');
    iframe.removeAttribute('data-src');
}

function openGiftCardModal() {
    if (!giftCardModal) return;
    activateCrispEmbed(giftCardModal);
    giftCardModal.classList.add('active');
}

[giftCardNavBtn, giftCardFooterBtn, giftCardFooterSupportBtn].forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener('click', function (e) {
        e.preventDefault();
        openGiftCardModal();
    });
});

// FAQ answers can contain generated "here" buttons (see src/lib/faq.ts).
document.addEventListener('click', function (e) {
    const trigger = e.target.closest && e.target.closest('[data-open-giftcard]');
    if (!trigger) return;
    e.preventDefault();
    openGiftCardModal();
});

if (closeGiftCardModal) {
    closeGiftCardModal.addEventListener('click', function () {
        giftCardModal.classList.remove('active');
    });
}

if (giftCardModal) {
    giftCardModal.addEventListener('click', function (e) {
        if (e.target === giftCardModal) giftCardModal.classList.remove('active');
    });
}

// Investor waitlist modal
const investModal = document.getElementById('investModal');
const investBannerBtn = document.getElementById('investBannerBtn');
const closeInvestModal = document.getElementById('closeInvestModal');

function openInvestModal() {
    if (!investModal) return;
    investModal.classList.add('active');
}

if (investBannerBtn) {
    investBannerBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openInvestModal();
    });
}

// Also clears the "Sent!" panel so reopening shows the form.
function closeInvestModalNow() {
    investModal.classList.remove('active');
    const sent = investModal.querySelector('.form-sent');
    if (sent) sent.remove();
}

if (closeInvestModal) {
    closeInvestModal.addEventListener('click', closeInvestModalNow);
}

if (investModal) {
    investModal.addEventListener('click', function (e) {
        if (e.target === investModal) closeInvestModalNow();
    });
}

// Keyboard behavior for every .modal, driven by its `active` class: focus
// moves to the close button on open, Tab stays inside, Escape clicks the
// close button (so each modal's own close logic runs), and focus returns to
// the opener on close.
(function () {
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, iframe, [tabindex]:not([tabindex="-1"])';
    const openedFrom = new WeakMap();
    const activeModal = () => document.querySelector('.modal.active');

    document.querySelectorAll('.modal').forEach((modal) => {
        new MutationObserver(() => {
            const isOpen = modal.classList.contains('active');
            if (isOpen && !openedFrom.has(modal)) {
                openedFrom.set(modal, document.activeElement);
                modal.querySelector('.modal-close')?.focus({ preventScroll: true });
            } else if (!isOpen && openedFrom.has(modal)) {
                const from = openedFrom.get(modal);
                openedFrom.delete(modal);
                if (from && from.isConnected && from !== document.body) from.focus({ preventScroll: true });
            }
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    document.addEventListener('keydown', (e) => {
        const modal = activeModal();
        if (!modal) return;
        if (e.key === 'Escape') {
            modal.querySelector('.modal-close')?.click();
            return;
        }
        if (e.key !== 'Tab') return;
        const items = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (!modal.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
})();

// AJAX submit for forms marked data-ajax-form. The hidden form-name field
// tells /api/contact which form it is.
const FORM_SENT_MESSAGES = {
    'invest-waitlist': "Thanks for submitting! We'll reach out to you when we go live.",
    'contact': "Thanks for reaching out! We'll get back to you soon.",
    'realestate-inquiry': "Thanks for reaching out! We'll be in touch soon.",
};

// A confirmation panel laid over the whole form.
function showFormSent(form) {
    if (form.querySelector('.form-sent')) return;
    const message = FORM_SENT_MESSAGES[form.getAttribute('name')] || FORM_SENT_MESSAGES.contact;
    const overlay = document.createElement('div');
    overlay.className = 'form-sent';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML =
        '<p class="form-sent__title">Sent!</p>' +
        '<svg class="form-sent__check" viewBox="0 0 52 52" aria-hidden="true">' +
        '<circle cx="26" cy="26" r="24"></circle>' +
        '<path d="M14 27l8 8 16-16"></path>' +
        '</svg>' +
        '<p class="form-sent__msg"></p>';
    overlay.querySelector('.form-sent__msg').textContent = message;
    form.appendChild(overlay);
}

document.querySelectorAll('form[data-ajax-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const btn = form.querySelector('.form-submit');
        const label = btn ? (btn.querySelector('span') || btn) : null;
        const originalText = label ? label.textContent : '';
        const formData = new FormData(form);

        fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(formData).toString(),
        })
            .then(function (res) {
                if (!res.ok) throw new Error('Form submission failed');
                form.reset();
                showFormSent(form);
            })
            .catch(function () {
                // Errors show on the button so the filled-in form stays visible.
                if (label) label.textContent = 'Error, please try again';
                setTimeout(function () {
                    if (label) label.textContent = originalText;
                }, 3000);
            });
    });
});

// On phones, Instagram links try the app first and fall back to the web
// page if the app didn't open.
(function () {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) return;

    document.querySelectorAll('a[data-app-url]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            const appUrl = link.dataset.appUrl;
            const webUrl = link.getAttribute('href');
            if (!appUrl || !webUrl) return;
            e.preventDefault();

            let fellBack = false;
            function fallback() {
                if (fellBack || document.hidden) return;
                fellBack = true;
                window.open(webUrl, '_blank', 'noopener,noreferrer');
            }
            document.addEventListener('visibilitychange', function onHide() {
                if (document.hidden) { fellBack = true; document.removeEventListener('visibilitychange', onHide); }
            });
            window.location.href = appUrl;
            setTimeout(fallback, 1200);
        });
    });
})();
