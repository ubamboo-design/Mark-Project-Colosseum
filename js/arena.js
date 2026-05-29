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
import { fixDriveUrl } from './parser.js';
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
      const region = s._region || 'other';

      const clickHandler = `window.openStrategyModal && window.openStrategyModal('${codeEscaped}')`;

      return `<div class="lb-row rank-${rank}" onclick="${clickHandler}">
  <div class="lb-region lb-region-${region}"></div>
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
// Battle Summary Card — Top 3 Profit + Top 3 ROI
// =============================================================================

/**
 * Build a battle summary card showing top 3 by profit amount and top 3 by ROI.
 * YT link is downsized to a small footer element.
 *
 * @param {Object[]} sortedStrategies - Strategies sorted by ROI descending (enriched).
 * @param {Object}   configData - Configuration with ytUrl.
 * @returns {string} HTML string for the battle-summary panel.
 */
export function buildBattleSummary(sortedStrategies, configData) {
  const count = sortedStrategies.length;
  if (count === 0) {
    return '<div class="battle-summary"><div class="bs-header">BATTLE SUMMARY</div><div class="bs-empty">NO DATA</div></div>';
  }

  // Top 3 by profit amount (profitVal = currency amount including sign)
  const byProfit = [...sortedStrategies].sort((a, b) => (b.profitVal || 0) - (a.profitVal || 0));
  const top3Profit = byProfit.slice(0, 3);

  // Top 3 by ROI (already sortedStrategies is by ROI desc)
  const top3ROI = sortedStrategies.slice(0, 3);

  // Count profit/loss
  let profitCount = 0, lossCount = 0;
  sortedStrategies.forEach(s => {
    const roi = s.roi != null ? s.roi : 0;
    if (roi >= 0) profitCount++; else lossCount++;
  });

  // Helper: build a ranked item row
  function rankRow(s, rank, type) {
    const name = escapeHtml(s.name || '');
    const code = escapeHtml(s.code || '');
    const roi = s.roi != null ? s.roi : 0;
    const roiSign = roi >= 0 ? '+' : '';
    const roiDisplay = roiSign + floorDec(Math.abs(roi), 1).toFixed(1) + '%';
    const pv = s.profitVal || 0;
    const pvSign = pv >= 0 ? '+' : '';
    const pvDisplay = pvSign + formatBattleAmount(Math.abs(pv), s.isUSD);  // Fixed: use formatBattleAmount which handles currency prefixes
    const pvClass = pv >= 0 ? 'color-profit' : 'color-loss';

    return `<div class="bs-item" onclick="window.openStrategyModal && window.openStrategyModal('${code}')">
      <span class="bs-rank bs-rank-${rank}">${rank}</span>
      <span class="bs-rank-name">${name}</span>
      <span class="bs-rank-val ${type === 'profit' ? pvClass : (roi >= 0 ? 'color-profit' : 'color-loss')}">${type === 'profit' ? pvDisplay : roiDisplay}</span>
    </div>`;
  }

  const profitRows = top3Profit.map((s, i) => rankRow(s, i + 1, 'profit')).join('');
  const roiRows = top3ROI.map((s, i) => rankRow(s, i + 1, 'roi')).join('');

  // YT link (small)
  const ytUrl = (configData && configData.ytUrl) || DEFAULT_YT;
  const escapedUrl = escapeHtml(ytUrl);

  return `<div class="battle-summary">
  <div class="bs-header">⚔ TOP PERFORMERS</div>
  <div class="bs-body">
    <div class="bs-section">
      <div class="bs-sectitle profit-title">💰 獲利金額</div>
      ${profitRows}
    </div>
    <div class="bs-divider"></div>
    <div class="bs-section">
      <div class="bs-sectitle roi-title">📈 報酬率</div>
      ${roiRows}
    </div>
    <div class="bs-divider"></div>
    <div class="bs-stats">
      <span class="bs-stat-profit">▲ ${profitCount} 賺</span>
      <span class="bs-stat-sep">|</span>
      <span class="bs-stat-loss">▼ ${lossCount} 賠</span>
      <span class="bs-stat-total">／ ${count} 策略</span>
    </div>
  </div>
  <div class="bs-yt-footer" onclick="window.open('${escapedUrl}', '_blank')" style="cursor:pointer;">
    <span class="bs-yt-icon">▶</span>
    <span class="bs-yt-label">最新影片</span>
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

  // Distinct color palette for each strategy (not gradient — T2-5b)
  const PALETTE = [
    '#00eaff', '#ffd700', '#d455ff', '#ff6b6b',
    '#4ecdc4', '#ff8c42', '#95e1d3', '#ffb3b3',
  ];

  // ── Aggregate data ─────────────────────────────────────────────────────
  const totalVal = data.reduce((sum, d) => sum + d.val, 0);
  if (totalVal <= 0) {
    return '<div class="donut-container"><div style="text-align:center;color:#555;padding:40px;font-family:var(--font-num);">NO VALUE</div></div>';
  }

  // Staggered entrance animation: each slice fades in sequentially
  let sliceIndex = 0;

  // ── Build segments + legend data ───────────────────────────────────────
  const legendItems = [];
  let svgPaths = '';
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

    // Distinct color per strategy (palette cycles if >8 strategies)
    const colorIndex = sliceIndex % PALETTE.length;
    const fill = PALETTE[colorIndex];

    // Segment is clickable
    const code = escapeHtml(d.code || '');
    const animDelay = sliceIndex * 0.08;
    sliceIndex++;
    svgPaths += `<path d="${pathD}" fill="${fill}" stroke="#1a1a1e" stroke-width="2" class="donut-slice donut-reveal" style="animation-delay:${animDelay}s" onclick="window.openStrategyModal && window.openStrategyModal('${code}')"/>`;

    // ── Short inline percentage label ──────────────────────────────────
    const pctStr = ((d.val / totalVal) * 100).toFixed(1) + '%';
    const lx = Math.cos(midAngle) * (r + (R - r) * 0.65);
    const ly = Math.sin(midAngle) * (r + (R - r) * 0.65);
    // Only show label if slice is big enough (> 6%)
    if ((d.val / totalVal) >= 0.06) {
      svgPaths += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central"
        font-family="'Rajdhani',sans-serif" font-size="13" font-weight="700" fill="#fff"
        class="donut-reveal" style="animation-delay:${animDelay + 0.15}s;pointer-events:none;">
        ${pctStr}
      </text>`;
    }

    // ── Collect legend data ────────────────────────────────────────────
    const absProfit = Math.abs(d.profit);
    const roiPct = d.inv > 0 ? ((absProfit / d.inv) * 100).toFixed(1) + '%' : 'N/A';
    const sign = d.profit >= 0 ? '+' : '-';

    legendItems.push({
      code: code,
      name: escapeHtml(d.name || ''),
      fill: fill,
      pct: pctStr,
      profit: sign + formatDonutVal(absProfit),
      roi: sign + roiPct,
      isProfit: d.profit >= 0,
    });

    startAngle = endAngle;
  });

  // ── Build legend HTML ──────────────────────────────────────────────────
  // Sort legend: profit items first, then by percentage descending
  legendItems.sort((a, b) => {
    if (a.isProfit !== b.isProfit) return a.isProfit ? -1 : 1;
    return parseFloat(b.pct) - parseFloat(a.pct);
  });

  const legendHTML = legendItems.map(item =>
    `<div class="dl-item" onclick="window.openStrategyModal && window.openStrategyModal('${item.code}')">
      <span class="dl-dot" style="background:${item.fill};box-shadow:0 0 4px ${item.fill};"></span>
      <span class="dl-name">${item.name}</span>
      <span class="dl-pct">${item.pct}</span>
      <span class="dl-profit ${item.isProfit ? 'profit' : 'loss'}">${item.profit}</span>
    </div>`
  ).join('');

  // ── Assemble final SVG ───────────────────────────────────────────────
  const totalProfit = data.reduce((sum, d) => sum + d.profit, 0);
  const profitSign = totalProfit >= 0 ? '+' : '';
  const profitColor = totalProfit >= 0 ? '#00ff6a' : '#ff4d4d';
  const centerTotal = formatDonutVal(totalVal);
  const centerProfit = profitSign + formatDonutVal(Math.abs(totalProfit));

  return `
<div class="donut-wrapper">
  <div class="donut-container">
    <svg viewBox="-160 -160 320 320" width="100%" height="100%" style="overflow: visible;">
      ${svgPaths}
      <!-- 內圈科技感裝飾線 -->
      <circle cx="0" cy="0" r="73" fill="none" stroke="rgba(255,204,0,0.2)" stroke-width="1" stroke-dasharray="4 4"/>
      <circle cx="0" cy="0" r="82" fill="none" stroke="rgba(0,247,255,0.1)" stroke-width="1"/>
      <!-- Donut 中心數字 (T2-5) -->
      <text x="0" y="-8" text-anchor="middle" dominant-baseline="central"
        font-family="'Rajdhani', sans-serif" font-size="24" font-weight="700" fill="#fff">
        ${centerTotal}
      </text>
      <text x="0" y="22" text-anchor="middle" dominant-baseline="central"
        font-family="'Rajdhani', sans-serif" font-size="14" font-weight="700" fill="${profitColor}">
        ${centerProfit}
      </text>
    </svg>
  </div>
  <div class="donut-legend">
    <div class="dl-header">分配佔比</div>
    ${legendHTML}
  </div>
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

  // ── 1. Flatten all strategies from all groups with region tagging ───────
  const allStrategyObjects = [];
  const regionMap = {
    '台股組': 'tw',   '台灣組': 'tw',   '台股': 'tw',
    '美股組': 'us',   '美國組': 'us',   '美股': 'us',
  };
  function detectRegion(groupName, code) {
    const lower = (groupName || '').trim();
    if (regionMap[lower]) return regionMap[lower];
    if (/QQQI/i.test(code)) return 'qqqi';
    return 'other';
  }
  if (portfolios) {
    Object.entries(portfolios).forEach(([groupName, group]) => {
      if (Array.isArray(group)) {
        group.forEach((s) => {
          s._region = detectRegion(groupName, s.code);
          allStrategyObjects.push(s);
        });
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

  // ── 7. Build battle summary card (T2-1 replaces YT panel) ─────────────────
  const summaryHTML = buildBattleSummary(sorted, configData);

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
  ${summaryHTML}
</div>`;
}