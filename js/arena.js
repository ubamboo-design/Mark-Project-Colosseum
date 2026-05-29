// =============================================================================
// PROJECT COLISEUM — Arena Dashboard Renderer
// =============================================================================
// Renders the investment arena section of PROJECT COLISEUM dashboard with:
//   1. Leaderboard (ranked by ROI)
//   2. Donut chart (portfolio allocation & profit)
//   3. YouTube link card (downgraded to simple text link)
//
// Uses engine.js computation functions for all financial metrics.
// ES module — no side effects at import time.
// =============================================================================

import {
  computeAllStrategyMetrics,
  computeStrategyMetrics,
  formatBattleAmount,
  floorDec,
  formatCompact,
  calc,
} from './engine.js';
import { fixDriveUrl, getYoutubeId } from './parser.js';
import { CONFIG_DEFAULTS, DEFAULT_YT } from './config.js';

// =============================================================================
// Internal Helpers
// =============================================================================

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

/**
 * Format a number for donut chart labels (same style as engine's formatCompact
 * but with 1 decimal at 萬 scale for more precision).
 *
 * @param {number} num - The value to format.
 * @returns {string}
 */
function formatDonutVal(num) {
  const absNum = Math.abs(num);
  if (absNum >= 100_000_000) {
    return floorDec(absNum / 100_000_000, 2) + '億';
  }
  if (absNum >= 10_000) {
    return floorDec(absNum / 10_000, 1) + '萬';
  }
  return Math.floor(absNum).toLocaleString();
}

// =============================================================================
// Leaderboard Builder
// =============================================================================

/**
 * Build the leaderboard HTML string from an array of strategy objects.
 *
 * Strategies are expected to have metrics already computed (via
 * computeAllStrategyMetrics) including: curSum, invSum, divSum, profitVal, roi,
 * isUSD, code, name, deck, etc.
 *
 * @param {Object[]} allStrategies - Array of enriched strategy descriptors.
 * @param {Object<string, Object>} cardsData - Map of cardCode → CardData.
 * @returns {string} HTML string for the leaderboard list.
 */
export function buildLeaderboardHTML(allStrategies, cardsData) {
  if (!allStrategies || allStrategies.length === 0) {
    return '<div class="lb-empty" style="padding:20px;text-align:center;color:#555;font-family:var(--font-num);">NO STRATEGIES</div>';
  }

  return allStrategies
    .map((s, i) => {
      const rank = i + 1;

      // Build deck icon HTML
      const deck = (s.deck || [])
        .map((code) => {
          const card = cardsData && cardsData[code];
          if (card && card.imgUrl) {
            return `<img src="${fixDriveUrl(card.imgUrl)}" class="lb-card-icon" alt="${escapeHtml(code)}">`;
          }
          return `<div class="lb-card-icon" style="background:#222;font-size:8px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:#888;">${escapeHtml(code)}</div>`;
        })
        .join('');

      // Profit / Loss display
      const profitVal = s.profitVal || 0;
      const profitSign = profitVal >= 0 ? '+' : '-';
      const profitDisplay = formatBattleAmount(Math.abs(profitVal), s.isUSD);
      const profitClass = profitVal >= 0 ? 'color-profit' : 'color-loss';

      // ROI display
      const roi = s.roi != null ? s.roi : 0;
      let cls;
      if (roi >= 50) cls = 'color-gold';
      else if (roi >= 0) cls = 'color-profit';
      else if (roi <= -50) cls = 'color-dead';
      else cls = 'color-loss';

      const sign = roi >= 0 ? '+' : '';
      const roiDisplay = floorDec(roi, 1).toFixed(1);

      const nameEscaped = escapeHtml(s.name || '');
      const codeEscaped = escapeHtml(s.code || '');

      // Expose openStrategyModal on window — the parent page defines it
      const clickHandler = `window.openStrategyModal && window.openStrategyModal('${codeEscaped}')`;

      return `<div class="lb-row rank-${rank}" onclick="${clickHandler}">
  <span class="lb-rank">#${rank}</span>
  <div class="lb-info">
    <div class="lb-name">${nameEscaped}</div>
    <div class="lb-code">${codeEscaped}</div>
  </div>
  <div class="lb-deck">${deck}</div>
  <div class="lb-invested ${profitClass}">${profitSign}${profitDisplay}</div>
  <span class="lb-val ${cls}">${sign}${roiDisplay}%</span>
</div>`;
    })
    .join('');
}

// =============================================================================
// YouTube Panel Builder (downgraded to simple text link)
// =============================================================================

/**
 * Build a simple YouTube link card HTML.
 *
 * No thumbnail is rendered — just a text link with a ▶ play icon.
 * Clicking opens the YouTube URL in a new tab.
 *
 * @param {Object} configData - Configuration data with ytUrl field.
 * @returns {string} HTML string for the YT link card.
 */
export function buildYTPanel(configData) {
  const ytUrl = (configData && configData.ytUrl) || DEFAULT_YT;
  const ytId = getYoutubeId(ytUrl);

  if (!ytId) {
    // No valid YouTube URL — show NO SIGNAL state
    return `<div class="yt-panel" style="cursor:default;">
  <div class="yt-header">馬克投資。玩的就是真實</div>
  <div class="yt-no-signal" style="text-align:center;padding:40px 0;">
    <div style="font-size:30px; margin-bottom:10px;">⚡</div>
    <div style="color:#555;font-family:var(--font-num);">NO SIGNAL</div>
    <div style="font-size:0.7rem; margin-top:5px; opacity:0.6;color:#888;">Refreshing...</div>
  </div>
</div>`;
  }

  const escapedUrl = escapeHtml(ytUrl);

  return `<div class="yt-panel" onclick="window.open('${escapedUrl}', '_blank')" style="cursor:pointer;">
  <div class="yt-header">馬克投資。玩的就是真實</div>
  <div class="yt-text-link" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;width:100%;gap:10px;">
    <div style="font-size:48px;width:64px;height:64px;display:flex;align-items:center;justify-content:center;background:rgba(255,0,0,0.15);border-radius:50%;border:2px solid rgba(255,0,0,0.3);color:#ff3333;">▶</div>
    <div style="color:#aaa;font-size:0.85rem;font-family:var(--font-num);text-align:center;word-break:break-all;padding:0 10px;">${escapedUrl}</div>
    <div style="color:#666;font-size:0.75rem;font-family:var(--font-num);margin-top:4px;">點擊觀看影片</div>
  </div>
</div>`;
}

// =============================================================================
// Donut Chart Builder (SVG)
// =============================================================================

/**
 * Build an SVG donut chart string from aggregated portfolio data.
 *
 * Pie segments are proportional to val/totalVal. Colour blends from
 * red-tint (profit) to green-tint (loss). Segments are clickable and
 * call window.openStrategyModal(code). Anti-collision label layout uses
 * cumulative offset accumulation (not pairwise iteration).
 *
 * @param {Object[]} data - Array of { code, name, val, inv, profit } objects.
 * @param {number}   currentRate - USD/TWD exchange rate.
 * @returns {string} SVG string wrapped in a donut-container div.
 */
export function buildDonutChart(data, currentRate) {
  if (!data || data.length === 0) {
    return '<div class="donut-container"><div style="text-align:center;color:#555;padding:40px;font-family:var(--font-num);">NO DATA</div></div>';
  }

  // ── SVG constants ──────────────────────────────────────────────────────
  const R = 130;           // outer radius
  const r = 65;            // inner radius (donut hole)
  const labelR = 200;      // radius for label anchor points
  const textR = 240;       // radius for text end points

  // ── Aggregate data ─────────────────────────────────────────────────────
  const totalVal = data.reduce((sum, d) => sum + d.val, 0);
  if (totalVal <= 0) {
    return '<div class="donut-container"><div style="text-align:center;color:#555;padding:40px;font-family:var(--font-num);">NO VALUE</div></div>';
  }

  // Staggered entrance animation: each slice fades in sequentially
  let sliceIndex = 0;

  const maxP = data.reduce((m, d) => Math.max(m, d.profit), 0);
  const minP = data.reduce((m, d) => Math.min(m, d.profit), 0);

  // ── Label data accumulator ─────────────────────────────────────────────
  const labelData = [];
  let svgPaths = '';
  let svgLabels = '';
  let startAngle = -Math.PI / 2; // start at top (12 o'clock)

  data.forEach((d) => {
    const sliceAngle = (d.val / totalVal) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;

    // Large arc flag
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    // Outer arc endpoints
    const x1 = Math.cos(startAngle) * R;
    const y1 = Math.sin(startAngle) * R;
    const x2 = Math.cos(endAngle) * R;
    const y2 = Math.sin(endAngle) * R;

    // Inner arc endpoints
    const ix1 = Math.cos(startAngle) * r;
    const iy1 = Math.sin(startAngle) * r;
    const ix2 = Math.cos(endAngle) * r;
    const iy2 = Math.sin(endAngle) * r;

    // SVG path for the donut segment
    const pathD = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;

    // Profit ratio for color intensity (0..1)
    const pratio =
      d.profit >= 0
        ? maxP > 0
          ? d.profit / maxP
          : 0
        : minP < 0
          ? d.profit / minP
          : 0;
    // Colour: green tint for profit, red tint for loss (finance convention)
    const fill =
      d.profit >= 0
        ? `rgba(0, 255, 106, ${0.4 + 0.6 * pratio})`
        : `rgba(255, 42, 42, ${0.4 + 0.6 * (Math.abs(pratio))})`;

    // Segment is clickable — calls openStrategyModal(code) exposed on window
    const code = escapeHtml(d.code || '');
    const animDelay = sliceIndex * 0.08;
    sliceIndex++;
    svgPaths += `<path d="${pathD}" fill="${fill}" stroke="#1a1a1e" stroke-width="2" class="donut-slice donut-reveal" style="animation-delay:${animDelay}s" onclick="window.openStrategyModal && window.openStrategyModal('${code}')"/>`;

    // Compute label anchor point
    const isRight = Math.cos(midAngle) >= 0;
    labelData.push({
      d: d,
      midAngle: midAngle,
      ax: Math.cos(midAngle) * R,
      ay: Math.sin(midAngle) * R,
      isRight: isRight,
      y: Math.sin(midAngle) * labelR,
      xSign: isRight ? 1 : -1,
    });

    startAngle = endAngle;
  });

  // ── Anti-collision label layout (cumulative offset accumulation) ─────
  const MIN_Y_SPACE = 65;

  // Process left-side and right-side labels separately
  const leftLabels = labelData
    .filter((l) => !l.isRight)
    .sort((a, b) => a.y - b.y);
  const rightLabels = labelData
    .filter((l) => l.isRight)
    .sort((a, b) => a.y - b.y);

  /** Apply cumulative offset anti-collision to a group of labels. */
  function resolveCollisions(group) {
    if (group.length < 2) return;

    // Sort by y position ascending
    group.sort((a, b) => a.y - b.y);

    // First pass: push overlapping labels down
    for (let i = 1; i < group.length; i++) {
      const minAllowed = group[i - 1].y + MIN_Y_SPACE;
      if (group[i].y < minAllowed) {
        group[i].y = minAllowed;
      }
    }

    // Second pass (reverse): pull overlapping labels up
    for (let i = group.length - 2; i >= 0; i--) {
      const maxAllowed = group[i + 1].y - MIN_Y_SPACE;
      if (group[i].y > maxAllowed) {
        group[i].y = maxAllowed;
      }
    }

    // Clamp to [-250, 250] boundary
    for (const l of group) {
      if (l.y < -250) l.y = -250;
      if (l.y > 250) l.y = 250;
    }
  }

  resolveCollisions(leftLabels);
  resolveCollisions(rightLabels);

  // ── Generate label lines and text ─────────────────────────────────────
  labelData.forEach((l) => {
    const d = l.d;
    const pctStr = ((d.val / totalVal) * 100).toFixed(1) + '%';

    const absProfit = Math.abs(d.profit);
    const roiStr =
      d.inv > 0
        ? ((absProfit / d.inv) * 100).toFixed(1) + '%'
        : 'N/A';
    const sign = d.profit >= 0 ? '+' : '-';
    const profitColor = d.profit >= 0 ? '#00ff6a' : '#ff4d4d';

    // Polyline connector: from outer edge → midpoint → text anchor
    const px1 = l.ax;
    const py1 = l.ay;
    const px2 = Math.cos(l.midAngle) * (R + 15);
    const py2 = Math.sin(l.midAngle) * (R + 15);
    const px3 = l.xSign * (textR - 10);
    const py3 = l.y;

    const polyline = `<polyline points="${px1},${py1} ${px2},${py2} ${px3},${py3}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    const dot = `<circle cx="${px3}" cy="${py3}" r="2" fill="rgba(255,255,255,0.8)" />`;
    svgPaths += polyline + dot;

    const textAnchor = l.isRight ? 'start' : 'end';
    const textX = l.xSign * textR;
    const nameEscaped = escapeHtml(d.name || '');

    svgLabels += `
<text x="${textX}" y="${l.y}" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="'Segoe UI', sans-serif" class="svg-text-shadow">
  <tspan x="${textX}" dy="-1.2em" font-family="'Arial Black'" font-size="14" fill="#fff">${nameEscaped} <tspan fill="#ffd700">${pctStr}</tspan></tspan>
  <tspan x="${textX}" dy="1.4em" font-size="12" fill="#ccc">總額: ${formatDonutVal(d.val)}</tspan>
  <tspan x="${textX}" dy="1.4em" font-size="12" font-weight="bold" fill="${profitColor}">獲利: ${sign}${formatDonutVal(absProfit)} (${sign}${roiStr})</tspan>
</text>`;
  });

  // ── Assemble final SVG ───────────────────────────────────────────────
  return `
<div class="donut-container">
  <svg viewBox="-380 -280 760 560" width="100%" height="100%" style="overflow: visible;">
    ${svgPaths}
    ${svgLabels}
    <!-- 內圈科技感裝飾線 -->
    <circle cx="0" cy="0" r="75" fill="none" stroke="rgba(255,204,0,0.2)" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="0" cy="0" r="85" fill="none" stroke="rgba(0,247,255,0.1)" stroke-width="1"/>
  </svg>
</div>`;
}

// =============================================================================
// Main Arena Renderer
// =============================================================================

/**
 * Render the complete investment arena section.
 *
 * 1. Flattens portfolios (groups) into a single strategy array.
 * 2. Computes strategy metrics via the engine.
 * 3. Sorts by ROI descending.
 * 4. Builds leaderboard, donut chart, and YT link card HTML.
 * 5. Inserts everything into <div id="arenaContainer">.
 *
 * @param {Object<string, Object[]>} portfolios - Grouped strategies, e.g.
 *   { '台股組': [strategy1, strategy2, ...], '美股組': [...], ... }.
 *   Each strategy object must have: code, name, deck[], isUSD.
 * @param {Object<string, Object>}   cardsData   - Map of cardCode → CardData.
 * @param {Object}                    configData  - Config with ytUrl, title, etc.
 * @param {number}                    currentRate - USD/TWD exchange rate.
 */
export function renderArena(portfolios, cardsData, configData, currentRate) {
  const container = document.getElementById('arenaContainer');
  if (!container) return;

  // ── 1. Flatten all strategies from all groups ────────────────────────────
  const allStrategyObjects = [];
  if (portfolios) {
    Object.values(portfolios).forEach((group) => {
      if (Array.isArray(group)) {
        group.forEach((s) => allStrategyObjects.push(s));
      }
    });
  }

  if (allStrategyObjects.length === 0) {
    container.innerHTML =
      '<div class="arena-dashboard-v15"><div class="leaderboard-panel"><div class="lb-header"><span class="title">LIVE BATTLE</span><span class="lbl-inv">盈虧金額</span><span class="lbl-roi">報酬率</span></div><div class="lb-list"><div style="padding:20px;text-align:center;color:#555;font-family:var(--font-num);">NO STRATEGIES</div></div></div></div>';
    return;
  }

  // ── 2. Compute metrics for all strategies ────────────────────────────────
  const enriched = computeAllStrategyMetrics(
    allStrategyObjects,
    cardsData,
    currentRate
  );

  // ── 3. Sort by ROI descending ────────────────────────────────────────────
  const sorted = enriched.sort((a, b) => b.roi - a.roi);

  // ── 4. Build leaderboard HTML ────────────────────────────────────────────
  const rowsHTML = buildLeaderboardHTML(sorted, cardsData);

  // ── 5. Build donut chart data (aggregated, same logic as original) ───────
  const aggregatedMap = {};

  sorted.forEach((s) => {
    // Metrics already computed via computeAllStrategyMetrics — use them
    const curSum = s.curSum || 0;
    const invSum = s.invSum || 0;
    const divSum = s.divSum || 0;
    const effectiveCur = curSum + divSum;
    const rate = s.isUSD ? currentRate : 1;

    let displayName = s.name || '';

    // Merge 0050 strategies under one label
    if (displayName.includes('0050')) {
      displayName = '0050';
    }
    // Merge gold (黃金) and bitcoin (比特幣) into '其他'
    else if (
      displayName.includes('黃金') ||
      displayName.includes('比特幣')
    ) {
      displayName = '其他';
    }

    if (!aggregatedMap[displayName]) {
      aggregatedMap[displayName] = {
        code: s.code,
        name: displayName,
        val: 0,
        inv: 0,
        profit: 0,
      };
    }

    aggregatedMap[displayName].val += effectiveCur * rate;
    aggregatedMap[displayName].inv += invSum * rate;
    aggregatedMap[displayName].profit += (effectiveCur - invSum) * rate;
  });

  const pieData = Object.values(aggregatedMap)
    .filter((d) => d.val > 0)
    .sort((a, b) => b.val - a.val);

  // ── 6. Build donut chart HTML ────────────────────────────────────────────
  const chartHTML = `<div class="chart-panel">${buildDonutChart(pieData, currentRate)}</div>`;

  // ── 7. Build YouTube link card HTML ──────────────────────────────────────
  const ytHTML = buildYTPanel(configData);

  // ── 8. Insert into container ─────────────────────────────────────────────
  container.innerHTML = `<div class="arena-dashboard-v15">
  <div class="leaderboard-panel">
    <div class="lb-header">
      <span class="title">LIVE BATTLE</span>
      <span class="lbl-inv">盈虧金額</span>
      <span class="lbl-roi">報酬率</span>
    </div>
    <div class="lb-list">${rowsHTML}</div>
  </div>
  ${chartHTML}
  ${ytHTML}
</div>`;
}