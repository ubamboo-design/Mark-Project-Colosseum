// =============================================================================
// PROJECT COLISEUM — Centralized Computation Engine
// =============================================================================
// This is the SINGLE source of truth for all financial computations in the
// dashboard.  Previously the aggregation logic (iterating a strategy's deck,
// summing card values, computing P&L, formatting numbers) was duplicated
// across three separate code paths in the original index.html
// (renderDashboard, renderArena, and the donut-chart aggregation).
//
// All consumers (arena, dashboard HUD, donut chart, etc.) must go through
// this module so that metric computation is consistent everywhere.
//
// ES module — pure computation, zero side effects, no DOM references.
// =============================================================================

import { COLUMN_MAP, FALLBACK_RATE, COLORS, CLEC523_CONFIG } from './config.js';

// =============================================================================
// Utility: Safe Floor
// =============================================================================

/**
 * Safe floor with configurable precision.  Handles negative numbers correctly.
 *
 * Math.floor(-1.5) === -2, and floorDec(-1.5, 1) === -1.5 while
 * floorDec(-1.55, 1) === -1.6 — the same directional rounding applies.
 *
 * @param {number}  num       - The value to floor.
 * @param {number}  [precision=0] - Number of decimal places to preserve.
 * @returns {number}
 */
export function floorDec(num, precision = 0) {
  const factor = Math.pow(10, precision);
  return Math.floor(num * factor) / factor;
}

// =============================================================================
// Single Strategy Metric Computation
// =============================================================================

/**
 * Compute financial metrics for a single strategy by aggregating its deck
 * of cards.  This is the SINGLE source of truth — any UI that shows strategy
 * P&L, ROI, or dividend data must call this function.
 *
 * QQQI dividend adjustment: for cards whose strategy is 'QQQI' (case-insensitive),
 * `card.divTotal` is accumulated into `divSum` and added to `curSum` before
 * the profit calculation, reflecting that reinvested dividends increase the
 * effective current value.
 *
 * @param {Object}                   strategy   - Strategy descriptor.
 * @param {string}                   strategy.code    - Strategy code (e.g. 'P01').
 * @param {string}                   strategy.name    - Display name.
 * @param {string[]}                 strategy.deck    - Array of card codes.
 * @param {number|string}            strategy.invested - Sheet-supplied invested amount.
 * @param {boolean}                  strategy.isUSD   - Whether this strategy is USD-denominated.
 * @param {Object<string, Object>}   cardsData  - Map of cardCode → CardData objects.
 * @param {number}                   currentRate - USD/TWD exchange rate.
 * @returns {{
 *   curSum:    number,
 *   invSum:    number,
 *   divSum:    number,
 *   profitVal: number,
 *   roi:       number,
 *   isUSD:     boolean
 * }}
 */
export function computeStrategyMetrics(strategy, cardsData, currentRate) {
  let curSum = 0;
  let invSum = 0;
  let divSum = 0;

  const deck = strategy.deck || [];

  for (const cardCode of deck) {
    const card = cardsData[cardCode];
    if (!card) continue;

    curSum += Number(card.current) || 0;
    invSum += Number(card.invested) || 0;

    // QQQI dividend adjustment: accumulate divTotal and later fold it into curSum
    if (
      card.strategy &&
      String(card.strategy).toUpperCase() === 'QQQI'
    ) {
      divSum += Number(card.divTotal) || 0;
    }
  }

  // Fold dividends into effective current value
  const effectiveCur = curSum + divSum;
  const profitVal = effectiveCur - invSum;
  const roi = invSum > 0 ? (profitVal / invSum) * 100 : 0;

  return {
    curSum,
    invSum,
    divSum,
    profitVal,
    roi,
    isUSD: !!strategy.isUSD,
  };
}

// =============================================================================
// Bulk Strategy Metrics
// =============================================================================

/**
 * Map `computeStrategyMetrics` over an array of strategy objects and return
 * the enriched array.  Each element receives the original strategy properties
 * merged with the computed metrics.
 *
 * @param {Object[]}                 allStrategies - Array of strategy descriptors.
 * @param {Object<string, Object>}   cardsData     - Map of cardCode → CardData.
 * @param {number}                   currentRate   - USD/TWD exchange rate.
 * @returns {Object[]} Enriched strategies (original props + computed metrics).
 */
export function computeAllStrategyMetrics(allStrategies, cardsData, currentRate) {
  return (allStrategies || []).map((strategy) => {
    const metrics = computeStrategyMetrics(strategy, cardsData, currentRate);
    return { ...strategy, ...metrics };
  });
}

// =============================================================================
// Per-Card Dashboard Enrichment
// =============================================================================

/**
 * Enrich each card with computed P&L fields for dashboard rendering.
 *
 * For QQQI cards the effective current value includes divTotal.
 * P&L is computed in the card's native currency; TW/USD cross-currency
 * fields use the provided exchange rate.
 *
 * @param {Object<string, Object>}   cards       - Map of cardCode → CardData.
 * @param {number}                   currentRate - USD/TWD exchange rate.
 * @returns {Object[]} Array of enriched card objects.
 */
export function enrichDashboardCards(cards, currentRate) {
  return Object.values(cards).map((card) => {
    const code = String(card.code || '');
    const isUSD = !!card.isUSD;
    const invested = Number(card.invested) || 0;
    const current = Number(card.current) || 0;

    // QQQI effective current
    const isQQQI =
      card.strategy && String(card.strategy).toUpperCase() === 'QQQI';
    const divTotal = isQQQI ? Number(card.divTotal) || 0 : 0;
    const effectiveCurrent = current + divTotal;

    // P&L in native currency
    const pl = effectiveCurrent - invested;
    const plPct = invested > 0 ? (pl / invested) * 100 : 0;

    // Cross-currency estimates
    const plTW = isUSD ? pl * currentRate : pl;
    const plUS = isUSD ? pl : pl / currentRate;

    return {
      code,
      isUSD,
      invested,
      current: effectiveCurrent,
      pl,
      plPct,
      plTW,
      plUS,
      // Pass through original card fields for any consumer that needs them
      name: card.name || '',
      strategy: card.strategy || '',
      budget: card.budget || 0,
      shares: card.shares || '',
      divCum: card.divCum || 0,
      taxRefund: card.taxRefund || 0,
      divTotal,
    };
  });
}

// =============================================================================
// Portfolio Aggregation
// =============================================================================

/**
 * Aggregate all cards into portfolio-level figures, split by currency.
 *
 * Returns values for the three HUD panels (TWD, USD, Total) consumed by
 * `renderDashboard()` in the original code.
 *
 * @param {Object<string, Object>}   cards       - Map of cardCode → CardData.
 * @param {number}                   currentRate - USD/TWD exchange rate.
 * @returns {{
 *   investedTW:       number,
 *   assetTW:          number,
 *   investedUS:       number,
 *   assetUS:          number,
 *   totalAssetTWD:    number,
 *   totalInvestedTWD: number,
 *   totalPL:          number,
 *   totalPLPct:       number
 * }}
 */
export function aggregatePortfolio(cards, currentRate) {
  let investedTW = 0;
  let assetTW = 0;
  let investedUS = 0;
  let assetUS = 0;

  for (const card of Object.values(cards)) {
    const isUSD = !!card.isUSD;
    const inv = Number(card.invested) || 0;
    const cur = Number(card.current) || 0;

    // QQQI dividends fold into effective current value
    const isQQQI =
      card.strategy && String(card.strategy).toUpperCase() === 'QQQI';
    const effectiveCur = isQQQI ? cur + (Number(card.divTotal) || 0) : cur;

    if (isUSD) {
      investedUS += inv;
      assetUS += effectiveCur;
    } else {
      investedTW += inv;
      assetTW += effectiveCur;
    }
  }

  const totalAssetTWD = assetTW + assetUS * currentRate;
  const totalInvestedTWD = investedTW + investedUS * currentRate;
  const totalPL = totalAssetTWD - totalInvestedTWD;
  const totalPLPct = totalInvestedTWD > 0
    ? (totalPL / totalInvestedTWD) * 100
    : 0;

  return {
    investedTW,
    assetTW,
    investedUS,
    assetUS,
    totalAssetTWD,
    totalInvestedTWD,
    totalPL,
    totalPLPct,
  };
}

// =============================================================================
// Compact Number Formatting (zh-TW style)
// =============================================================================

/**
 * Format a number in Taiwanese compact notation with configurable decimal precision.
 *
 * - >= 100,000,000  → "X.XX億"   (hundred millions, always 2 decimals)
 * - >= 10,000       → "X.X萬"    (ten-thousands, 1 decimal by default)
 * - else            → locale string (always integer)
 *
 * The precision parameter controls decimal places in the "萬" range.
 * When precision > 0 the function uses round-half-away-from-zero (toFixed semantic)
 * instead of floor, so display arithmetic is verifiable.
 *
 * @param {number}  num       - The number to format.
 * @param {number}  [precision=1] - Decimal places for 萬 values (0 = floor, same as before).
 * @returns {string}
 */
export function formatCompact(num, precision = 1) {
  const abs = Math.abs(num);
  if (abs >= 100_000_000) {
    // 億: always 2 decimals
    const val = (num / 100_000_000).toFixed(2);
    return val + '億';
  }
  if (abs >= 10_000) {
    // 萬: configurable precision
    const val = (num / 10_000).toFixed(precision);
    // Trim trailing zeros after decimal when precision > 0
    // e.g. "41.0" → "41.0" (keep one decimal for consistency)
    return val + '萬';
  }
  // Below 10_000: locale integer
  return Math.round(num).toLocaleString('en-US');
}

// =============================================================================
// Battle Amount Formatting
// =============================================================================

/**
 * Format a number for the battle arena leaderboard with currency prefix.
 *
 * - Prefixes: "USD$ " or "NT$ " depending on `isUSD`.
 * - >= 10,000 → "USD$ X.X萬" or "NT$ X.X萬" (1 decimal place of 萬).
 * - < 10,000  → "USD$ X,XXX" or "NT$ X,XXX" (locale integer).
 *
 * @param {number}  num   - The absolute P&L value.
 * @param {boolean} isUSD - Whether the amount is USD-denominated.
 * @returns {string}
 */
export function formatBattleAmount(num, isUSD) {
  const prefix = isUSD ? 'USD$ ' : 'NT$ ';
  if (Math.abs(num) >= 10_000) {
    const val = floorDec(Math.abs(num) / 10_000, 1);
    return prefix + val + '萬';
  }
  return prefix + Math.floor(Math.abs(num)).toLocaleString();
}

// =============================================================================
// P&L Calculator
// =============================================================================

/**
 * Compute a P&L result object with colour class, arrow indicator, and sign.
 *
 * Colour classes map to the original dashboard's CSS scheme:
 * - ROI >= 0.5%    → 'color-gold'   (strong profit)
 * - ROI >= 0%      → 'color-profit' (moderate profit)
 * - ROI <= -0.5%   → 'color-dead'   (severe loss)
 * - else           → 'color-loss'   (moderate loss)
 *
 * @param {number} cost - Cost basis (invested amount).
 * @param {number} cur  - Current value.
 * @returns {{
 *   roi:   string,    // ROI formatted to 1 decimal, e.g. "3.4"
 *   arrow: string,    // "▲" | "▼" | "-"
 *   cls:   string,    // CSS class name
 *   diff:  number,    // cur - cost
 *   sign:  string     // "+" | "" | "-"
 * }}
 */
export function calc(cost, cur) {
  if (!cost) {
    return { roi: '0', arrow: '-', cls: '', diff: 0, sign: '' };
  }

  const diff = cur - cost;
  const roi = ((diff / cost) * 100).toFixed(1);

  let cls;
  if (roi >= 0.5) {
    cls = 'color-gold';
  } else if (roi >= 0) {
    cls = 'color-profit';
  } else if (roi <= -0.5) {
    cls = 'color-dead';
  } else {
    cls = 'color-loss';
  }

  return {
    roi,
    arrow: diff >= 0 ? '▲' : '▼',
    sign: diff >= 0 ? '+' : '',
    cls,
    diff,
  };
}

// =============================================================================
// USD Formatter
// =============================================================================

/**
 * Format a number as USD with exactly 2 fraction digits.
 *
 * Uses Intl.NumberFormat('en-US') so output includes US locale separators
 * (e.g. "1,234.56").
 *
 * @param {number} val - The value to format.
 * @returns {string}
 */
export function formatUSD(val) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

// =============================================================================
// DOM Animation: Count-Up Effect
// =============================================================================

/**
 * Animate an element's textContent from its current numeric value to a target
 * value using an easeOutExpo curve over the specified duration.
 *
 * Works with elements already displaying numbers (e.g. "1,234萬" or "567").
 * Parses numbers by stripping non-numeric chars except '.' and '-'.
 *
 * @param {HTMLElement} el        - Target DOM element.
 * @param {number}      endVal    - Target numeric value.
 * @param {number}      [duration=800] - Animation duration in ms.
 * @param {function}    [formatter]    - Optional (val: number) => string formatter.
 */
export function animateValue(el, endVal, duration = 800, formatter) {
  if (!el) return;

  const raw = el.textContent || '0';
  const parsed = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
  const startVal = isNaN(parsed) ? 0 : parsed;

  if (startVal === endVal) return;

  const startTime = performance.now();

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutExpo(progress);
    const current = startVal + (endVal - startVal) * eased;

    el.innerHTML = formatter ? formatter(current) : Math.floor(current).toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.innerHTML = formatter ? formatter(endVal) : Math.floor(endVal).toLocaleString();
    }
  }

  requestAnimationFrame(step);
}

// =============================================================================
// QQQI Dividend Aggregation (convenience)
// =============================================================================

/**
 * Aggregate QQQI-specific dividend figures (cumulative, tax refund, total)
 * across all cards for the nested QQQI HUD panel.
 *
 * @param {Object<string, Object>} cards - Map of cardCode → CardData.
 * @returns {{ divCum: number, taxRefund: number, divTotal: number }}
 */
export function aggregateQQQIDividends(cards) {
  let divCum = 0;
  let taxRefund = 0;
  let divTotal = 0;

  for (const card of Object.values(cards)) {
    if (card.strategy && String(card.strategy).toUpperCase() === 'QQQI') {
      divCum += Number(card.divCum) || 0;
      taxRefund += Number(card.taxRefund) || 0;
      divTotal += Number(card.divTotal) || 0;
    }
  }

  return { divCum, taxRefund, divTotal };
}

// =============================================================================
// CLEC 523 Portfolio Computation
// =============================================================================

/**
 * Compute the CLEC 523 portfolio allocation (00662 / QLD / 現金) from card data.
 *
 * 00662 value is summed from cards listed in CLEC523_CONFIG.card00662.
 * QLD value     is summed from cards listed in CLEC523_CONFIG.cardQLD.
 * 現金          = totalPortfolioTWD - 00662 - QLD.
 *
 * @param {Object<string, Object>} cards       - Map of cardCode → CardData.
 * @param {number}                  currentRate - USD/TWD exchange rate.
 * @returns {{
 *   val00662: number, pct00662: number,
 *   valQLD:   number, pctQLD:   number,
 *   cash:     number, pctCash:  number,
 *   total:    number
 * }}
 */
export function computeCLEC523(cards, currentRate) {
  const { card00662, cardQLD, defaultCashTWD } = CLEC523_CONFIG;

  // Sum current values for 00662 cards
  let val00662 = 0;
  for (const code of card00662) {
    const card = cards[code];
    if (!card) continue;
    const cur = Number(card.current) || 0;
    // Convert USD to TWD if needed
    val00662 += card.isUSD ? cur * currentRate : cur;
  }

  // Sum current values for QLD cards
  let valQLD = 0;
  for (const code of cardQLD) {
    const card = cards[code];
    if (!card) continue;
    const cur = Number(card.current) || 0;
    valQLD += card.isUSD ? cur * currentRate : cur;
  }

  // Get total portfolio value in TWD (all cards aggregated)
  const pf = aggregatePortfolio(cards, currentRate);
  const totalPortfolio = pf.totalAssetTWD;

  // Cash = total portfolio - tracked investments
  // If tracked investments exceed total (edge case), cash defaults to the
  // configured anchor value and total is recalculated as 00662 + QLD + cash.
  let cash, total;
  const tracked = val00662 + valQLD;
  if (totalPortfolio > tracked) {
    cash = totalPortfolio - tracked;
    total = totalPortfolio;
  } else {
    // Fallback: use configured cash anchor and compute total from tracked
    cash = defaultCashTWD;
    total = tracked + cash;
  }

  // Guard against division by zero
  if (total <= 0) {
    return {
      val00662: 0, pct00662: 0,
      valQLD: 0,   pctQLD: 0,
      cash: 0,     pctCash: 0,
      total: 0,
    };
  }

  const pct00662 = (val00662 / total) * 100;
  const pctQLD   = (valQLD   / total) * 100;
  const pctCash  = (cash     / total) * 100;

  return {
    val00662, pct00662,
    valQLD,   pctQLD,
    cash,     pctCash,
    total,
  };
}