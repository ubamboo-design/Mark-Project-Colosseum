// =============================================================================
// PROJECT COLISEUM — Pull-to-Refresh (mobile)
// Touch-based pull-to-refresh for mobile devices.
// Standalone script (non-module), loaded after theme.js in index.html.
// Calls window.init() when released past threshold.
// Only activates on touch-capable devices.
// =============================================================================

(function () {
  'use strict';

  // ── Config ──
  var THRESHOLD = 80;   // px to trigger refresh
  var MAX_PULL = 160;   // max pull distance (clamped)
  var INDICATOR_H = 56; // indicator bar height in px

  // ── State ──
  var startY = 0;
  var isPulling = false;
  var pullDist = 0;
  var refreshing = false;
  var el, arrowEl, textEl, spinnerEl;

  // ── Skip on non-touch or desktop ──
  if (!('ontouchstart' in window)) return;

  // ── Build DOM ──
  function build() {
    el = document.createElement('div');
    el.id = 'ptr-indicator';
    el.innerHTML =
      '<div class="ptr-arrow" id="ptrArrow">↓</div>' +
      '<div class="ptr-spinner" id="ptrSpinner"></div>' +
      '<div class="ptr-text" id="ptrText">下拉更新</div>';
    document.body.appendChild(el);
    arrowEl = document.getElementById('ptrArrow');
    textEl = document.getElementById('ptrText');
    spinnerEl = document.getElementById('ptrSpinner');
  }

  // ── Show / hide indicator ──
  function show(dist) {
    var clamped = Math.min(dist, MAX_PULL);
    var progress = Math.min(clamped / THRESHOLD, 1);

    el.style.display = 'flex';
    el.style.transform = 'translateY(' + (clamped - INDICATOR_H) + 'px)';
    el.style.opacity = Math.min(progress + 0.15, 1);

    // Rotate arrow: 0° → 180° as progress goes 0 → 1
    arrowEl.style.transform = 'rotate(' + (progress * 180) + 'deg)';

    if (clamped >= THRESHOLD) {
      textEl.textContent = '↩ 放開更新';
      arrowEl.style.color = 'var(--hud-cyan)';
      textEl.style.color = 'var(--hud-cyan)';
    } else {
      textEl.textContent = '↓ 下拉更新';
      arrowEl.style.color = '#666';
      textEl.style.color = '#999';
    }

    // Arrow fades out above threshold, spinner takes over
    if (clamped >= THRESHOLD - 10) {
      arrowEl.style.opacity = Math.max(0, 1 - (clamped - THRESHOLD + 10) / 20);
    } else {
      arrowEl.style.opacity = 1;
    }
  }

  function hide() {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-' + INDICATOR_H + 'px)';
    setTimeout(function () {
      el.style.display = 'none';
      arrowEl.style.display = 'block';
      arrowEl.style.transform = 'rotate(0deg)';
      arrowEl.style.opacity = '1';
      arrowEl.style.color = '#666';
      textEl.textContent = '↓ 下拉更新';
      textEl.style.color = '#999';
      spinnerEl.style.display = 'none';
    }, 300);
  }

  function showRefreshing() {
    arrowEl.style.display = 'none';
    spinnerEl.style.display = 'block';
    textEl.textContent = '更新中...';
    textEl.style.color = 'var(--hud-cyan)';

    // Keep indicator visible at threshold position during refresh
    el.style.transform = 'translateY(0px)';
    el.style.opacity = '1';
  }

  // ── Touch handlers ──

  function onTouchStart(e) {
    if (refreshing) return;
    // Only activate when at the very top of the page
    if (window.scrollY > 0) return;
    // Ignore touches inside form elements (textarea, input, button)
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return;

    startY = e.touches[0].clientY;
    isPulling = true;
    pullDist = 0;
  }

  function onTouchMove(e) {
    if (!isPulling || refreshing) return;
    var y = e.touches[0].clientY;
    var dist = y - startY;

    // Only downward
    if (dist <= 0) {
      if (pullDist > 0) hide();
      isPulling = false;
      return;
    }

    pullDist = dist;
    show(dist);
    // Prevent native scroll / browser pull-to-refresh
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (!isPulling) return;
    isPulling = false;

    if (pullDist >= THRESHOLD && !refreshing) {
      refreshing = true;
      showRefreshing();

      // Trigger global refresh
      if (typeof window.init === 'function') {
        window.init();
      }

      // Keep indicator visible for a bit, then auto-fade
      var checkDone = setInterval(function () {
        var indicator = document.getElementById('refresh-indicator');
        if (indicator && indicator.style.height === '0px') {
          clearInterval(checkDone);
          refreshing = false;
          setTimeout(hide, 400);
        }
      }, 300);

      // Safety timeout: hide after 10s even if no signal
      setTimeout(function () {
        if (refreshing) {
          refreshing = false;
          hide();
          clearInterval(checkDone);
        }
      }, 10000);
    } else {
      hide();
    }

    pullDist = 0;
  }

  // ── Init ──
  build();
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', function () {
    if (isPulling) {
      isPulling = false;
      pullDist = 0;
      hide();
    }
  }, { passive: true });
})();
