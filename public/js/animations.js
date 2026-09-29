// Scroll-reveal and count-up animations. The <head> sets `js-anim` only when
// motion is allowed; CSS hides the targets until `.in` is added.
(function () {
  const root = document.documentElement;
  if (!root.classList.contains('js-anim')) return;

  // Reveal targets for every page; selectors missing from a page match nothing.
  const REVEAL_SELECTOR = [
    // home
    '.hero-content h1', '.hero-buttons',
    '.featured-visual', '.featured-text',
    '.features .section-header', '.feature-card',
    '.cta-content',
    '.reviews .section-header', '.review-card',
    '.faq .section-header', '.faq .faq-list details',
    '.contact .section-header', '.contact-form-wrapper',
    // about
    '.about-hero-content',
    '.about-intro-text', '.about-intro-img',
    '.about-history .section-header', '.history-body', '.timeline-item',
    '.about-cta h2', '.about-cta p', '.about-cta-buttons',
    // careers
    '.careers-hero-content',
    // menu
    '.menu-hero-content', '.cz-heading', '.cz-block',
    // real estate
    '.re-hero-content', '.re-overview-text', '.re-map-img', '.re-stat',
    '.re-criteria .section-header', '.criteria-card',
    '.re-ideal .section-header', '.ideal-item',
    '.re-locations .section-header', '.re-location-tag',
    '.re-contact .section-header',
    // legal pages
    '.page-hero-content', '.legal-content'
  ].join(',');

  const targets = document.querySelectorAll(REVEAL_SELECTOR);

  // Elements with a stagger delay set in CSS keep it; others get one from
  // their position among sibling targets.
  function hasCssDelay(el) {
    return getComputedStyle(el).transitionDelay.split(',').some(v => parseFloat(v) > 0);
  }

  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in'));
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

    // Anything already on screen (e.g. after landing on /#contact) is shown
    // right away, since it may never cross the observer's threshold.
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

  // Failsafe: shortly after load, force any hidden target in view to show.
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

  // Count-up for stat numbers such as "$15 Million", "500 Stores" or "16+".
  const counters = document.querySelectorAll('.blk-stat-number');

  function animateCount(el) {
    const raw = el.textContent.trim();
    const m = raw.match(/^(\D*)([\d,]+)(.*)$/s);
    if (!m) return;
    const prefix = m[1], numStr = m[2], suffix = m[3];
    const target = parseInt(numStr.replace(/,/g, ''), 10);
    // Bare years (e.g. "2017") are left as they are.
    if (prefix === '' && suffix === '' && /^\d{4}$/.test(numStr) && target >= 1900 && target <= 2099) return;

    const DURATION = 1400;
    const fmt = n => prefix + n.toLocaleString('en-US') + suffix;
    const start = performance.now();

    el.textContent = fmt(0);
    function tick(now) {
      const p = Math.min((now - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);
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
