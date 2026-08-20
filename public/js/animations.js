// Scroll-reveal + count-up animations, shared across every page.
// Progressive enhancement: only runs when motion is allowed (the <head> sets
// `js-anim` unless the user prefers reduced motion). Matching CSS keeps the
// targets hidden until JS adds `.in`, so without JS everything stays visible.
(function () {
  const root = document.documentElement;
  if (!root.classList.contains('js-anim')) return; // reduced motion / no flag

  // Union of reveal targets across all pages. Selectors not present on the
  // current page simply match nothing, so this one list serves every page.
  const REVEAL_SELECTOR = [
    // home
    '.hero-content h1', '.hero-buttons',
    '.featured-visual', '.featured-text',
    '.features .section-header', '.feature-card',
    '.cta-content',
    '.spaces .section-header',
    '.pricing .section-header', '.pricing-card',
    '.amenities .section-header', '.special-pricing',
    '.faq .section-header', '.faq .faq-list details',
    '.contact .section-header', '.contact-form-wrapper',
    // about
    '.about-hero-content',
    '.about-intro-text', '.about-intro-img', '.stat-item',
    '.about-history .section-header', '.history-body', '.timeline-item',
    '.founder-img', '.founder-text',
    '.about-cta h2', '.about-cta p', '.about-cta-buttons',
    // careers
    '.careers-hero-content',
    // menu + merch (shared hero) and menu customize
    '.menu-hero-content', '.cz-heading', '.cz-block',
    // merch
    '.filter-pill', '.merch-card',
    // real estate
    '.re-hero-content', '.re-overview-text', '.re-map-img', '.re-stat',
    '.re-criteria .section-header', '.criteria-card',
    '.re-ideal .section-header', '.ideal-item',
    '.re-locations .section-header', '.re-location-tag',
    '.re-contact .section-header',
    // locations
    '.loc-hero-content', '.loc-state-label',
    // merch + privacy policy (shared page hero) and privacy content
    '.page-hero-content', '.legal-content'
  ].join(',');

  const targets = document.querySelectorAll(REVEAL_SELECTOR);

  // True if the element already has a CSS-defined transition-delay (e.g. the
  // home page's nth-child stagger). If so we leave it alone; otherwise we apply
  // an automatic stagger based on the element's position among its siblings.
  function hasCssDelay(el) {
    return getComputedStyle(el).transitionDelay.split(',').some(v => parseFloat(v) > 0);
  }

  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in')); // fallback: just show
  } else {
    const revealIO = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (!hasCssDelay(el) && el.parentElement) {
          const sibs = Array.from(el.parentElement.children)
            .filter(c => c.matches && c.matches(REVEAL_SELECTOR));
          const idx = sibs.indexOf(el);
          if (idx > 0) el.style.transitionDelay = (Math.min(idx, 6) * 0.08).toFixed(2) + 's';
        }
        el.classList.add('in');
        obs.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    // A direct link to an in-page anchor (e.g. a footer link to "/#contact")
    // lands the browser on that section immediately, racing this script's
    // observer setup -- the section can end up already in view before it's
    // ever observed, so it never crosses the "entering the viewport"
    // threshold the observer watches for and stays invisible forever.
    // Reveal anything already on-screen at setup time instead of relying
    // solely on that async transition.
    const vh = window.innerHeight;
    targets.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        el.classList.add('in');
      } else {
        revealIO.observe(el);
      }
    });
  }

  // Failsafe: content must never be left invisible. Shortly after load, force
  // any still-hidden element that is in view to show (covers an observer that
  // never fires). Uses inline styles so visibility is guaranteed regardless.
  window.addEventListener('load', () => {
    setTimeout(() => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      targets.forEach(el => {
        if (el.classList.contains('in')) return;
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
    }, 1500);
  });

  // ── Count-up for stat numbers (e.g. "$15 Million", "500 Stores", "16+") ──
  const counters = document.querySelectorAll('.special-feature-number, .stat-number');

  function animateCount(el) {
    const raw = el.textContent.trim();
    const m = raw.match(/^(\D*)([\d,]+)(.*)$/s);
    if (!m) return;                              // nothing numeric to animate
    const prefix = m[1], numStr = m[2], suffix = m[3];
    const target = parseInt(numStr.replace(/,/g, ''), 10);
    // Skip bare years (e.g. "2017") — counting up from 0 looks wrong.
    if (prefix === '' && suffix === '' && /^\d{4}$/.test(numStr) && target >= 1900 && target <= 2099) return;

    const DURATION = 1400;
    const fmt = n => prefix + n.toLocaleString('en-US') + suffix;
    const start = performance.now();

    el.textContent = fmt(0);
    function tick(now) {
      const p = Math.min((now - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);     // exact final value
    }
    requestAnimationFrame(tick);
  }

  if (counters.length && ('IntersectionObserver' in window)) {
    const countIO = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(c => countIO.observe(c));
  }
})();
