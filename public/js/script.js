// Gentle background parallax for the light bands, which now carry the shared
// --bg-quote ground (background1.jpg, named in an earlier version of this
// comment, is long gone).
(function () {
  const els = document.querySelectorAll('.features, .pricing, .contact, .cta');
  if (!els.length) return;
  const SPEED = 0.05;   // very gentle, bg drifts at 5% of scroll
  const MAX = 40;       // px cap so the layer never runs out of slack
  let ticking = false;

  function update() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return; // skip off-screen
      const center = (r.top + r.height / 2) - vh / 2;
      let shift = -center * SPEED;
      if (shift > MAX) shift = MAX;
      else if (shift < -MAX) shift = -MAX;
      el.style.setProperty('--parallax', shift.toFixed(1) + 'px');
    });
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// Smart nav: hide on scroll down, reveal on scroll up, condense once scrolled
(function () {
  const nav = document.querySelector('nav');
  if (!nav) return;
  const REVEAL_TOP = 90;   // always visible near the top
  const DELTA = 5;         // ignore tiny jitters
  let lastY = window.scrollY || 0;
  let ticking = false;

  function update() {
    const y = window.scrollY || 0;
    nav.classList.toggle('nav-scrolled', y > 40);

    if (y < REVEAL_TOP) {
      nav.classList.remove('nav-hidden');
    } else if (y > lastY + DELTA) {
      nav.classList.add('nav-hidden');      // scrolling down
    } else if (y < lastY - DELTA) {
      nav.classList.remove('nav-hidden');   // scrolling up
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
})();

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ── Mobile drawer nav ──
(function () {
    const toggle = document.querySelector('.menu-toggle');
    if (!toggle) return;

    // Build overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';

    // Build drawer
    const drawer = document.createElement('div');
    drawer.className = 'mobile-nav-drawer';

    // Clone nav links into drawer
    const srcList = document.querySelector('nav .nav-links');
    if (srcList) {
        const cloned = srcList.cloneNode(true);
        drawer.appendChild(cloned);
    }

    // Loyalty button inside drawer
    const loyaltyBtn = document.querySelector('#loyaltyNavBtn');
    if (loyaltyBtn) {
        const wrapper = document.createElement('div');
        wrapper.className = 'drawer-gc-btn';
        const btn = document.createElement('button');
        btn.className = 'main-menu-btn';
        btn.style.width = '100%';
        btn.textContent = loyaltyBtn.textContent;
        btn.addEventListener('click', () => {
            closeDrawer();
            openLoyaltyModal();
        });
        wrapper.appendChild(btn);
        drawer.appendChild(wrapper);
    }

    // Gift card button inside drawer
    const gcBtn = document.querySelector('#giftCardNavBtn');
    if (gcBtn) {
        const wrapper = document.createElement('div');
        wrapper.className = 'drawer-gc-btn';
        const btn = document.createElement('button');
        btn.className = 'main-menu-btn';
        btn.style.width = '100%';
        btn.textContent = 'Gift Card';
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
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        overlay.classList.remove('visible');
        drawer.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        setTimeout(() => overlay.classList.remove('open'), 320);
    }

    toggle.addEventListener('click', () => {
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
    });

    // Keyboard support (Enter / Space) for the role="button" toggle
    toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            drawer.classList.contains('open') ? closeDrawer() : openDrawer();
        }
    });

    // Close drawer on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });

    overlay.addEventListener('click', closeDrawer);

    // Close on link click
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));
})();

// Remove loading bar after page load
window.addEventListener('load', function() {
    setTimeout(() => {
        const bar = document.querySelector('.loading-bar');
        if (bar) bar.style.display = 'none';
    }, 2000);
});

// Gift Card Modal functionality
const giftCardModal = document.getElementById('giftCardModal');
const giftCardNavBtn = document.getElementById('giftCardNavBtn');
const giftCardFooterBtn = document.getElementById('giftCardFooterBtn');
const giftCardFooterSupportBtn = document.getElementById('giftCardFooterSupportBtn');
const closeGiftCardModal = document.getElementById('closeGiftCardModal');

// Crisp's embedded apps (gift card / loyalty check) paint in visibly after
// the iframe starts loading. Keeping the iframe hidden behind a spinner
// (see .crisp-loader in style.css) until its 'load' event fires turns that
// choppy pop-in into a deliberate fade.
function activateCrispEmbed(modal) {
    const wrapper = modal.querySelector('.crisp');
    const iframe = modal.querySelector('iframe[data-src]');
    if (!iframe) return; // already activated on a previous open
    iframe.addEventListener('load', function() {
        wrapper?.classList.add('crisp-loaded');
    }, { once: true });
    iframe.src = iframe.getAttribute('data-src');
    iframe.removeAttribute('data-src');
}

// The gift-card balance checker is a full third-party embedded app (Crisp).
// Loading its iframe eagerly would run that app's JS on every single page
// view, even though almost nobody opens this modal - so its src is set only
// the first time the modal is actually opened.
function openGiftCardModal() {
    if (!giftCardModal) return;
    activateCrispEmbed(giftCardModal);
    giftCardModal.classList.add('active');
}

if (giftCardNavBtn) {
    giftCardNavBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openGiftCardModal();
    });
}

if (giftCardFooterBtn) {
    giftCardFooterBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openGiftCardModal();
    });
}

if (giftCardFooterSupportBtn) {
    giftCardFooterSupportBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openGiftCardModal();
    });
}

if (closeGiftCardModal) {
    closeGiftCardModal.addEventListener('click', function() {
        giftCardModal.classList.remove('active');
        giftCardModal.style.display = '';
    });
}

if (giftCardModal) {
    giftCardModal.addEventListener('click', function(e) {
        if (e.target === giftCardModal) {
            giftCardModal.classList.remove('active');
            giftCardModal.style.display = '';
        }
    });
}

// Loyalty Modal functionality
const loyaltyModal = document.getElementById('loyaltyModal');
const loyaltyNavBtn = document.getElementById('loyaltyNavBtn');
const loyaltyFooterBtn = document.getElementById('loyaltyFooterBtn');
const closeLoyaltyModal = document.getElementById('closeLoyaltyModal');

// Same as the gift-card checker: a third-party embedded app (Crisp), so its
// iframe src is set only the first time the modal is actually opened.
function openLoyaltyModal() {
    if (!loyaltyModal) return;
    activateCrispEmbed(loyaltyModal);
    loyaltyModal.classList.add('active');
}

if (loyaltyNavBtn) {
    loyaltyNavBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openLoyaltyModal();
    });
}

if (loyaltyFooterBtn) {
    loyaltyFooterBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openLoyaltyModal();
    });
}

if (closeLoyaltyModal) {
    closeLoyaltyModal.addEventListener('click', function() {
        loyaltyModal.classList.remove('active');
        loyaltyModal.style.display = '';
    });
}

if (loyaltyModal) {
    loyaltyModal.addEventListener('click', function(e) {
        if (e.target === loyaltyModal) {
            loyaltyModal.classList.remove('active');
            loyaltyModal.style.display = '';
        }
    });
}

// Invest Banner Modal functionality
const investModal = document.getElementById('investModal');
const investBannerBtn = document.getElementById('investBannerBtn');
const closeInvestModal = document.getElementById('closeInvestModal');

function openInvestModal() {
    if (!investModal) return;
    investModal.classList.add('active');
}

if (investBannerBtn) {
    investBannerBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openInvestModal();
    });
}

if (closeInvestModal) {
    closeInvestModal.addEventListener('click', function() {
        investModal.classList.remove('active');
        investModal.style.display = '';
    });
}

if (investModal) {
    investModal.addEventListener('click', function(e) {
        if (e.target === investModal) {
            investModal.classList.remove('active');
            investModal.style.display = '';
        }
    });
}

// ── Contact forms (AJAX submit, no page reload) ──
// Shared by every form marked data-netlify="true" (home contact + real
// estate inquiry). The data-netlify/form-name/bot-field attributes are
// leftover from an earlier Netlify-hosted version of this site; they aren't
// used by any Netlify backend anymore (this deployment is Webflow Cloud /
// Cloudflare Workers, not Netlify) -- form-name still tells our own
// /api/contact endpoint which form fired and doubles as the honeypot field
// name, so the markup stayed as-is.
document.querySelectorAll('form[data-netlify]').forEach(function (form) {
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
                if (label) label.textContent = 'Sent!';
                if (btn) btn.style.background = '#2a9d5c';
                form.reset();
            })
            .catch(function () {
                if (label) label.textContent = 'Error - please try again';
            })
            .finally(function () {
                setTimeout(function () {
                    if (label) label.textContent = originalText;
                    if (btn) btn.style.background = '';
                }, 3000);
            });
    });
});

// ── Social links: open the native app on mobile instead of the web page ──
// A plain https:// link to instagram.com opens the profile inside whatever
// browser/webview the visitor is already in. On a phone with the Instagram
// app installed, jumping to its app:// URI scheme instead opens the app
// directly. If the app isn't installed, the scheme silently fails and
// nothing happens, so fall back to the normal web link if the page hasn't
// been backgrounded (i.e. the app didn't open) after a short delay.
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
                if (fellBack || document.hidden) return; // app opened, page backgrounded
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
