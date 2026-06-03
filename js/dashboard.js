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
  computeCLEC523,
  computeTWDPortfolio,
  formatCompact,
  formatUSD,
  calc,
  animateValue,
} from './engine.js';
import { CONFIG_DEFAULTS } from './config.js';

// =============================================================================
// Internal State & Helpers
// =============================================================================

/** @type {'live'|'cached'} */
let _cacheMode = 'live';

/** @type {Map<string, string>} Previous values for change detection (T3-3) */
const _prevValues = new Map();

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
 * Wrap a formatCompact string (e.g. "838.0萬", "4,432") into HTML spans
 * separating the numeric value from the "萬"/"億" unit suffix.
 *
 * @param {string} str - Formatted number string from formatCompact.
 * @returns {string} HTML with <span class="num"> and <span class="unit">.
 */
function wrapNumHtml(str) {
  const m = str.match(/^(.+?)([億萬])$/);
  if (m) {
    return '<span class="num">' + m[1] + '</span><span class="unit">' + m[2] + '</span>';
  }
  return '<span class="num">' + str + '</span>';
}

/**
 * Build a HUD value HTML string with visual hierarchy.
 * Renders as: [sign]<span class="fx">NT$/USD$</span> <span class="num">838.0</span><span class="unit">萬</span>
 *
 * @param {string} currency - "NT$" or "USD$".
 * @param {string} formatted - Formatted value from formatCompact.
 * @param {string} [sign=""] - "+" or empty.
 * @returns {string} HTML string safe for innerHTML.
 */
function valHtml(currency, formatted, sign) {
  return (sign || '') +
    '<span class="fx">' + currency + '</span> ' +
    wrapNumHtml(formatted);
}

/**
 * Set innerHTML on an element by ID, optionally applying a CSS class.
 *
 * Supports two call signatures:
 *   setHtml(id, html)
 *   setHtml(id, className, html)
 *
 * @param {string} id   - Element ID.
 * @param {string} [cls] - Optional CSS class name to set.
 * @param {string} html  - HTML content to set.
 */
function setHtml(id, cls, html) {
  const el = document.getElementById(id);
  if (!el) return;
  // Two-argument form: setHtml(id, html)
  if (html === undefined) {
    html = cls;
    cls = undefined;
  }
  if (cls) el.className = cls;
  // Change detection (T3-3) — pulse on value update
  const prev = _prevValues.get(id);
  if (prev !== undefined && prev !== html && prev !== '...') {
    el.classList.remove('hud-updated');
    // Force reflow then add class to restart animation
    void el.offsetWidth;
    el.classList.add('hud-updated');
  }
  _prevValues.set(id, html);
  el.innerHTML = html;
}

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

  setHtml(
    'investedTW',
    pf.investedTW > 0 ? valHtml('NT$', formatCompact(pf.investedTW)) : '...'
  );
  setHtml(
    'assetTW',
    pf.assetTW > 0 ? valHtml('NT$', formatCompact(pf.assetTW)) : '...'
  );

  const twPL = calc(pf.investedTW, pf.assetTW);
  setHtml(
    'plTW_val',
    twPL.cls,
    twPL.diff !== 0
      ? valHtml('NT$', formatCompact(twPL.diff), twPL.sign)
      : valHtml('NT$', '0')
  );
  setText(
    'plTW_pct',
    twPL.roi !== '0' || pf.investedTW > 0
      ? twPL.arrow + ' ' + twPL.roi + '%'
      : '-'
  );

  // ── US Panel (Green) ──────────────────────────────────────────────────

  setHtml(
    'investedUS',
    pf.investedUS > 0 ? valHtml('USD$', formatCompact(pf.investedUS)) : '...'
  );
  setHtml(
    'assetUS',
    pf.assetUS > 0 ? valHtml('USD$', formatCompact(pf.assetUS)) : '...'
  );

  const usPL = calc(pf.investedUS, pf.assetUS);
  setHtml(
    'plUS_val',
    usPL.cls,
    usPL.diff !== 0
      ? valHtml('USD$', formatCompact(usPL.diff), usPL.sign)
      : valHtml('USD$', '0')
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

  setHtml('qqqiDivCum', qqqi.divCum > 0 ? valHtml('NT$', formatCompact(qqqi.divCum, 0)) : '...');
  setHtml('qqqiTaxRef', qqqi.taxRefund > 0 ? valHtml('NT$', formatCompact(qqqi.taxRefund, 0)) : '...');
  setHtml('qqqiDivTotal', qqqi.divTotal > 0 ? valHtml('NT$', formatCompact(qqqi.divTotal, 0)) : '...');

  // ── Total Panel (Gold) ────────────────────────────────────────────────

  const totalEl = document.getElementById('totalAsset');
  if (totalEl && pf.totalAssetTWD > 0) {
    animateValue(totalEl, pf.totalAssetTWD, 800, (v) => valHtml('NT$', formatCompact(v)));
  } else {
    setHtml('totalAsset', pf.totalAssetTWD > 0 ? valHtml('NT$', formatCompact(pf.totalAssetTWD)) : '...');
  }

  const totalPL = calc(pf.totalInvestedTWD, pf.totalAssetTWD);

  const totalPLEl = document.getElementById('totalPL_val');
  if (totalPLEl && totalPL.diff !== 0) {
    animateValue(totalPLEl, totalPL.diff, 800, (v) => valHtml('NT$', formatCompact(Math.abs(v)), totalPL.sign));
    totalPLEl.className = totalPL.cls;
  } else {
    setHtml('totalPL_val', totalPL.cls, totalPL.diff !== 0
      ? valHtml('NT$', formatCompact(Math.abs(totalPL.diff)), totalPL.sign)
      : valHtml('NT$', '0'));
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

  // Update the simplified badge element:
  // "ACTIVITY:" label shows ONLINE / CACHED
  const liveUsersEl = document.getElementById('liveUsers');

  if (liveUsersEl) {
    liveUsersEl.textContent = isCached ? 'CACHED' : 'ONLINE';
    liveUsersEl.style.color = isCached ? 'var(--green)' : 'var(--yield)';
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
  // Change detection (T3-3) — pulse on value update
  const prev = _prevValues.get('text:' + id);
  if (prev !== undefined && prev !== text && prev !== '...') {
    el.classList.remove('hud-updated');
    void el.offsetWidth;
    el.classList.add('hud-updated');
  }
  _prevValues.set('text:' + id, text);
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

// =============================================================================
// CLEC 523 Portfolio Rendering
// =============================================================================

/**
 * Render the CLEC 523 portfolio bar chart dynamically from card data.
 * Replaces the old hardcoded 00662/QLD/現金 values with live computation.
 *
 * @param {Object<string, Object>} cards       - Map of cardCode → CardData.
 * @param {number}                  currentRate - USD/TWD exchange rate.
 */
export function renderCLEC523(cards, currentRate) {
  const data = computeCLEC523(cards, currentRate);
  if (data.total <= 0) return;

  // Formatter with thousand separators (en-US style)
  const wanFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pctFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const fmtWan = (v) => wanFmt.format(v / 10_000) + ' <small>萬 TWD</small>';
  const fmtAmt = (v) => wanFmt.format(v / 10_000) + ' 萬';
  const fmtPct = (v) => pctFmt.format(v) + '%';

  // -- Total value --
  const totalEl = document.getElementById('clecTotalValue');
  if (totalEl) {
    totalEl.innerHTML = fmtWan(data.total);
  }

  // -- Bar chart segments --
  const setBar = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.style.width = fmtPct(pct);
  };
  setBar('clecBar00662', data.pct00662);
  setBar('clecBarQLD', data.pctQLD);
  setBar('clecBarCash', data.pctCash);

  // -- Bar percentage labels --
  const setPct = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtPct(pct);
  };
  setPct('clecPct00662', data.pct00662);
  setPct('clecPctQLD', data.pctQLD);
  setPct('clecPctCash', data.pctCash);

  // -- Legend amounts --
  const setAmt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtAmt(val);
  };
  setAmt('clecAmt00662', data.val00662);
  setAmt('clecAmtQLD', data.valQLD);
  setAmt('clecAmtCash', data.cash);

  // -- Legend percentages --
  const setPctLg = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtPct(pct);
  };
  setPctLg('clecPctLg00662', data.pct00662);
  setPctLg('clecPctLgQLD', data.pctQLD);
  setPctLg('clecPctLgCash', data.pctCash);
}

// =============================================================================
// TWD Portfolio (台股配置) Rendering
// =============================================================================

/**
 * Render the TWD portfolio bar chart dynamically from card data.
 * Replaces the old hardcoded 0050/00878/00631L values with live computation.
 *
 * @param {Object<string, Object>} cards - Map of cardCode → CardData.
 */
export function renderTWDPortfolio(cards) {
  const data = computeTWDPortfolio(cards);
  if (data.total <= 0) return;

  // Formatter with thousand separators (en-US style)
  const wanFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pctFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const fmtAmt = (v) => wanFmt.format(v / 10_000) + ' 萬';
  const fmtPct = (v) => pctFmt.format(v) + '%';

  // Total value (only one 萬)
  const totalEl = document.getElementById('twdTotalValue');
  if (totalEl) totalEl.innerHTML = fmtAmt(data.total) + ' <small>TWD</small>';

  // Bar widths
  const setBar = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.style.width = fmtPct(pct);
  };
  setBar('twdBar0050', data.pct0050);
  setBar('twdBar00878', data.pct00878);
  setBar('twdBar00631L', data.pct00631L);

  // Bar percentage labels
  const setPct = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtPct(pct);
  };
  setPct('twdPct0050', data.pct0050);
  setPct('twdPct00878', data.pct00878);
  setPct('twdPct00631L', data.pct00631L);

  // Legend amounts
  const setAmt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtAmt(val);
  };
  setAmt('twdAmt0050', data.val0050);
  setAmt('twdAmt00878', data.val00878);
  setAmt('twdAmt00631L', data.val00631L);

  // Legend percentages
  const setPctLg = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtPct(pct);
  };
  setPctLg('twdPctLg0050', data.pct0050);
  setPctLg('twdPctLg00878', data.pct00878);
  setPctLg('twdPctLg00631L', data.pct00631L);
}