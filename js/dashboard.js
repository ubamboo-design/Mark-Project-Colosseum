// =============================================================================
// PROJECT COLISEUM — Dashboard HUD Renderer
// =============================================================================
// Renders the HUD dashboard panels for PROJECT COLISEUM investment dashboard.
// Uses engine computation functions for all financial metrics.
// ES module — no side effects at import time.
// =============================================================================

import {
  computeStrategyMetrics,
  aggregatePortfolio,
  aggregateQQQIDividends,
  formatCompact,
  formatUSD,
  calc,
  animateValue,
} from './engine.js';
import { CONFIG_DEFAULTS } from './config.js';

// =============================================================================
// Internal State
// =============================================================================

/** @type {'live'|'cached'} */
let _cacheMode = 'live';

// =============================================================================
// Header Rendering
// =============================================================================

/**
 * Update the page header with logo, title, and meta info.
 *
 * @param {string} logoUrl      - URL for the logo image element.
 * @param {Object} configData   - Config object with title and meta strings.
 */
export function renderHeader(logoUrl, configData) {
  const logoEl = document.getElementById('pageLogo');
  if (logoEl) {
    logoEl.src = logoUrl || '';
    logoEl.style.display = logoUrl ? 'block' : 'none';
  }

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    titleEl.textContent =
      (configData && configData.title) || CONFIG_DEFAULTS.title;
  }

  const metaEl = document.getElementById('pageMeta');
  if (metaEl) {
    metaEl.textContent =
      (configData && configData.meta) || CONFIG_DEFAULTS.meta;
  }
}

// =============================================================================
// Dashboard Rendering
// =============================================================================

/**
 * Compute all HUD panel values via engine functions and update the DOM.
 *
 * @param {Object<string, Object>} cards       - Map of cardCode → CardData.
 * @param {number}                  currentRate - USD/TWD exchange rate.
 */
export function renderDashboard(cards, currentRate) {
  // Remove loading shimmer overlay once data arrives
  const dashGrid = document.querySelector('.dash-grid');
  if (dashGrid) dashGrid.classList.remove('dash-grid-loading');
  const overlay = document.querySelector('.loading-overlay');
  if (overlay) overlay.remove();

  // Aggregate portfolio-level figures (TWD, USD, Total)
  const pf = aggregatePortfolio(cards, currentRate);

  // Aggregate QQQI-specific dividend figures
  const qqqi = aggregateQQQIDividends(cards);

  // ── TW Panel (Cyan) ───────────────────────────────────────────────────

  setText(
    'investedTW',
    pf.investedTW > 0 ? 'NT$ ' + formatCompact(pf.investedTW) : '...'
  );
  setText(
    'assetTW',
    pf.assetTW > 0 ? formatCompact(pf.assetTW) : '...'
  );

  const twPL = calc(pf.investedTW, pf.assetTW);
  setText(
    'plTW_val',
    twPL.cls,
    twPL.diff !== 0
      ? twPL.sign + 'NT$ ' + formatCompact(twPL.diff)
      : 'NT$ 0'
  );
  setText(
    'plTW_pct',
    twPL.roi !== '0' || pf.investedTW > 0
      ? twPL.arrow + ' ' + twPL.roi + '%'
      : '-'
  );

  // ── US Panel (Green) ──────────────────────────────────────────────────

  setText(
    'investedUS',
    pf.investedUS > 0 ? 'USD$ ' + formatCompact(pf.investedUS) : '...'
  );
  setText(
    'assetUS',
    pf.assetUS > 0 ? formatCompact(pf.assetUS) : '...'
  );

  const usPL = calc(pf.investedUS, pf.assetUS);
  setText(
    'plUS_val',
    usPL.cls,
    usPL.diff !== 0
      ? usPL.sign + 'USD$ ' + formatCompact(usPL.diff)
      : 'USD$ 0'
  );
  setText(
    'plUS_pct',
    usPL.roi !== '0' || pf.investedUS > 0
      ? usPL.arrow + ' ' + usPL.roi + '%'
      : '-'
  );

  // Exchange rate display under US title
  setText('usdExRate', 'Ex: ' + formatUSD(currentRate));

  // QQQI exchange rate label
  setText(
    'qqqiExRate',
    'TWD 計價 | Ex: ' + formatUSD(currentRate)
  );

  // ── QQQI Dividend Panel (Purple, nested in US) ────────────────────────

  setText('qqqiDivCum', qqqi.divCum > 0 ? formatCompact(qqqi.divCum) : '...');
  setText(
    'qqqiTaxRef',
    qqqi.taxRefund > 0 ? formatCompact(qqqi.taxRefund) : '...'
  );
  setText(
    'qqqiDivTotal',
    qqqi.divTotal > 0 ? formatCompact(qqqi.divTotal) : '...'
  );

  // ── Total Panel (Gold) ────────────────────────────────────────────────

  const totalEl = document.getElementById('totalAsset');
  if (totalEl && pf.totalAssetTWD > 0) {
    animateValue(totalEl, pf.totalAssetTWD, 800, (v) => formatCompact(v));
  } else {
    setText('totalAsset', pf.totalAssetTWD > 0 ? formatCompact(pf.totalAssetTWD) : '...');
  }

  const totalPL = calc(pf.totalInvestedTWD, pf.totalAssetTWD);

  const totalPLEl = document.getElementById('totalPL_val');
  if (totalPLEl && totalPL.diff !== 0) {
    animateValue(totalPLEl, totalPL.diff, 800, (v) => totalPL.sign + 'NT$ ' + formatCompact(Math.abs(v)));
    totalPLEl.className = totalPL.cls;
  } else {
    setText('totalPL_val', totalPL.cls, totalPL.diff !== 0
      ? totalPL.sign + 'NT$ ' + formatCompact(Math.abs(totalPL.diff))
      : 'NT$ 0');
  }

  setText(
    'totalPL_pct',
    totalPL.roi !== '0' || pf.totalInvestedTWD > 0
      ? totalPL.arrow + ' ' + totalPL.roi + '%'
      : '-'
  );

  // Exchange rate footer in gold panel
  setText('rateInfo', 'USD/TWD: ' + formatUSD(currentRate));
}

// =============================================================================
// Cache Status Badge
// =============================================================================

/**
 * Update the HUD badge to show cache/live status.
 *
 * Simplified badge: shows "SYSTEM ONLINE" with green dot, and
 * indicates whether data is from cache or live feed.
 *
 * @param {Object}  [meta]       - Cache metadata (e.g. { cached: true }).
 * @param {number}   currentRate - Current USD/TWD exchange rate.
 */
export function renderCacheStatus(meta, currentRate) {
  _cacheMode = meta && meta.cached ? 'cached' : 'live';
  const isCached = _cacheMode === 'cached';

  // Update the simplified badge elements:
  // "ACTIVITY:" label replaced with "SYSTEM" and value shows ONLINE / CACHED
  const liveUsersEl = document.getElementById('liveUsers');
  const visitorCountEl = document.getElementById('visitorCount');

  if (liveUsersEl) {
    liveUsersEl.textContent = isCached ? 'CACHED' : 'ONLINE';
    liveUsersEl.style.color = isCached ? 'var(--green)' : 'var(--yield)';
  }
  if (visitorCountEl) {
    // Repurpose visit counter to show cache/live indicator
    visitorCountEl.textContent = isCached ? '[FROM CACHE]' : '[LIVE FEED]';
    visitorCountEl.style.color = isCached ? 'var(--trap)' : 'var(--hud-cyan)';
  }
}

// =============================================================================
// Error / Loading States
// =============================================================================

/**
 * Show an error state in the dashboard area.
 *
 * Replaces the dash-grid content with an error message.
 *
 * @param {string} msg - Error message to display.
 */
export function showDashboardError(msg) {
  const dashGrid = document.querySelector('.dash-grid');
  if (!dashGrid) return;

  dashGrid.innerHTML =
    '<div class="hud-screen" style="grid-column: 1 / -1; text-align: center; padding: 40px;">' +
    '<div style="color: var(--emergency); font-family: var(--font-tech); font-size: 1.2rem; margin-bottom: 15px; letter-spacing: 2px;">⚠ DASHBOARD ERROR</div>' +
    '<div style="color: var(--mute); font-family: var(--font-mono); font-size: 0.9rem; line-height: 1.6;">' +
    escapeHtml(msg) +
    '</div>' +
    '<div style="margin-top: 20px; color: #666; font-size: 0.8rem; font-family: var(--font-num);">∎ 嘗試重新整理頁面</div>' +
    '</div>';
}

/**
 * Show loading shimmer placeholders in the dashboard area.
 *
 * Replaces the dash-grid content with 3 placeholder HUD screens
 * that have animated shimmer blocks.
 */
export function showDashboardLoading() {
  const dashGrid = document.querySelector('.dash-grid');
  if (!dashGrid) return;

  // Add shimmer skeleton class to all value cells — preserves DOM IDs
  // so renderDashboard() can still find and update them when data arrives.
  dashGrid.classList.add('dash-grid-loading');

  // Add a translucent overlay to visually signal loading state
  const wrapper = dashGrid.closest('.dashboard-wrapper');
  if (wrapper && !wrapper.querySelector('.loading-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    wrapper.appendChild(overlay);
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Set textContent on an element by ID, optionally applying a CSS class.
 *
 * Supports two call signatures:
 *   setText(id, text)
 *   setText(id, className, text)
 *
 * @param {string} id   - Element ID.
 * @param {string} [cls] - Optional CSS class name to set.
 * @param {string} text  - Text content to set.
 */
function setText(id, cls, text) {
  const el = document.getElementById(id);
  if (!el) return;

  // Two-argument form: setText(id, text)
  if (text === undefined) {
    text = cls;
    cls = undefined;
  }

  if (cls) {
    el.className = cls;
  }
  el.textContent = text;
}

/**
 * Minimal HTML escaping for interpolating user-provided strings into HTML.
 *
 * @param {string} str - Raw string to escape.
 * @returns {string} Escaped string safe for innerHTML.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}