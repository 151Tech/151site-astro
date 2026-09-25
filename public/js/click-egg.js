// Easter egg: click anywhere on a page 20 times in a row (fast enough that
// each click is within 1.5s of the last) and it slams a "CONGRATS!" spotlight
// + confetti overlay into view. Loaded site-wide from Layout.astro.
(function () {
  var THRESHOLD = 20;
  var MAX_GAP_MS = 1500;

  var streak = 0;
  var lastClickAt = 0;
  var overlayShowing = false;

  document.addEventListener('click', function (e) {
    if (overlayShowing) return;
    // Clicks inside the overlay itself (while it's animating out) shouldn't
    // feed back into the next streak.
    if (e.target.closest && e.target.closest('#click-egg-overlay')) return;

    var now = Date.now();
    streak = now - lastClickAt <= MAX_GAP_MS ? streak + 1 : 1;
    lastClickAt = now;

    if (streak >= THRESHOLD) {
      streak = 0;
      triggerCelebration();
    }
  });

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function triggerCelebration() {
    overlayShowing = true;

    fetch('/api/click-egg', { method: 'POST' })
      .then(function (res) { return res.ok ? res.json() : { count: null }; })
      .catch(function () { return { count: null }; })
      .then(function (data) { showOverlay(data && data.count); });
  }

  function showOverlay(count) {
    var reduceMotion = !document.documentElement.classList.contains('js-anim');

    var overlay = document.createElement('div');
    overlay.id = 'click-egg-overlay';

    var canvas = document.createElement('canvas');
    canvas.id = 'click-egg-confetti';
    overlay.appendChild(canvas);

    var spotlight = document.createElement('div');
    spotlight.id = 'click-egg-spotlight';
    overlay.appendChild(spotlight);

    var panel = document.createElement('div');
    panel.id = 'click-egg-panel';

    var heading = document.createElement('h2');
    heading.id = 'click-egg-heading';
    heading.textContent = 'CONGRATS!';
    panel.appendChild(heading);

    var sub = document.createElement('p');
    sub.id = 'click-egg-sub';
    sub.textContent = count
      ? "We're not sure why you did it, but you're the " + ordinal(count) + ' person to click this page 20 times in a row.'
      : "We're not sure why you did it, but congrats on clicking this page 20 times in a row.";
    panel.appendChild(sub);

    var closeHint = document.createElement('p');
    closeHint.id = 'click-egg-hint';
    closeHint.textContent = 'Just a sec...';
    panel.appendChild(closeHint);

    var closeBtn = document.createElement('button');
    closeBtn.id = 'click-egg-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.disabled = true;
    closeBtn.textContent = '×';
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var ctx = canvas.getContext('2d');
    var particles = [];
    var running = true;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    var COLORS = ['#E63946', '#ffffff', '#ffc145', '#7a1119'];
    function spawnBurst(n) {
      for (var i = 0; i < n; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height * 0.4,
          vx: (Math.random() - 0.5) * 3,
          vy: 2 + Math.random() * 3.5,
          size: 5 + Math.random() * 7,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.3,
          life: 1,
        });
      }
    }

    if (!reduceMotion) {
      spawnBurst(160);
      var refillInterval = setInterval(function () {
        if (running) spawnBurst(24);
      }, 260);
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.rot += p.vrot;
        if (p.y > canvas.height + 30) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    }
    if (!reduceMotion) requestAnimationFrame(tick);

    function dismiss() {
      running = false;
      if (refillInterval) clearInterval(refillInterval);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      overlay.classList.add('click-egg-leaving');
      setTimeout(function () {
        overlay.remove();
        document.body.style.overflow = '';
        overlayShowing = false;
      }, 260);
    }

    // You've earned this one - make people actually sit with it for a beat
    // before they can click (or Escape/X) their way out.
    var DISMISS_DELAY_MS = 2000;
    var canDismiss = false;

    setTimeout(function () {
      canDismiss = true;
      closeBtn.disabled = false;
      closeHint.textContent = 'Click anywhere to dismiss';
      overlay.classList.add('click-egg-dismissable');
    }, DISMISS_DELAY_MS);

    overlay.addEventListener('click', function () {
      if (canDismiss) dismiss();
    });
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (canDismiss) dismiss();
    });
    function onKey(e) {
      if (e.key === 'Escape' && canDismiss) dismiss();
    }
    window.addEventListener('keydown', onKey);

    // Force layout before adding the show class so the slam-in transition
    // actually runs instead of the element just appearing already-visible.
    void overlay.offsetWidth;
    overlay.classList.add('click-egg-show');
  }
})();
