// =============================================================================
// PROJECT COLISEUM — Google Sheet TSV Parser
// =============================================================================
// Parses the published TSV export from the master investment tracking
// spreadsheet and returns structured Card, Strategy, Event, Config, and
// Logo data.  All column references go through COLUMN_MAP so that
// reordering the sheet only requires updating the map.
//
// Every row is validated via validateRow() before being consumed.
// Validation errors are collected in an errors[] array instead of
// crashing the parse — the UI can then surface the issues.
// =============================================================================

import {
  GOOGLE_SHEET_URL,
  COLUMN_MAP,
  CONFIG_DEFAULTS,
  DEFAULT_YT,
} from './config.js';

import {
  DataValidationError,
  SCHEMA_CONFIG,
  validateRow,
  EMPTY_CARD,
  EMPTY_STRATEGY,
  EMPTY_CONFIG,
} from './models.js';

// -- Constants ----------------------------------------------------------------

/** Regex for extracting a YouTube video ID from various URL formats. */
const YT_REGEX = /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]{11}).*/;

// -- Utility Functions --------------------------------------------------------

/**
 * Fix a Google Drive share URL to a direct-view URL suitable for <img> tags.
 * If the URL does not contain 'drive.google.com' it is returned unchanged.
 *
 * @param {string} url - Raw URL (possibly a Drive sharing link).
 * @returns {string} Direct-view URL or the original if no Drive match.
 */
export function fixDriveUrl(url) {
  if (!url) return '';
  if (url.includes('drive.google.com')) {
    const match = url.match(/(?:\/d\/|id=)([\w-]+)/);
    return match
      ? `https://drive.google.com/uc?export=view&id=${match[1]}`
      : url;
  }
  return url;
}

/**
 * Extract the 11-character video ID from a YouTube URL.
 *
 * @param {string} url - YouTube watch / short link.
 * @returns {string|null} The video ID, or null if no match.
 */
export function getYoutubeId(url) {
  if (!url) return null;
  const match = url.match(YT_REGEX);
  return match && match[1].length === 11 ? match[1] : null;
}

/**
 * Detect whether a card row represents a USD-denominated investment.
 *
 * Logic mirrors the original parseSheetData() currency detection:
 *  - 'NT' in budget        → isUSD = false
 *  - '$' / 'US' in budget  → isUSD = true
 *  - strategy starts '00' or includes 'BTC' → isUSD = false
 *  - strategy includes 'QQQ', 'QLD', 'IAU'   → isUSD = true
 *
 * @param {string} budgetRaw  - Raw budget cell value.
 * @param {string} strategy   - Raw strategy cell value.
 * @returns {boolean}
 */
function detectIsUSD(budgetRaw, strategy) {
  const budgetStr = (budgetRaw || '').toUpperCase();
  const strategyStr = (strategy || '').toUpperCase();

  let isUSD = false;

  if (budgetStr.includes('NT')) {
    isUSD = false;
  } else if (budgetStr.includes('$') || budgetStr.includes('US')) {
    isUSD = true;
  }

  if (strategyStr.startsWith('00') || strategyStr.includes('BTC')) {
    isUSD = false;
  }
  if (
    strategyStr.includes('QQQ') ||
    strategyStr.includes('QLD') ||
    strategyStr.includes('IAU')
  ) {
    isUSD = true;
  }

  return isUSD;
}

/**
 * Parse a numeric string that may contain a currency prefix (NT$, USD$, …)
 * and thousand separators, returning the float value.
 *
 * @param {string} raw  - Raw cell string, e.g. "NT$ 1,234,567" or "USD$ 500".
 * @returns {number}
 */
function parseCurrency(raw) {
  return parseFloat((raw || '0').replace(/[NT$US,\s]/g, '')) || 0;
}

// -- Main Parse Function -----------------------------------------------------

/**
 * Parse raw TSV text from the Google Sheet into structured data.
 *
 * The parsing follows the original inline logic with these enhancements:
 *  - Column references use COLUMN_MAP instead of hard-coded indices.
 *  - Every row is validated via validateRow(); failures are collected in
 *    errors[] and the row is skipped (no crash).
 *  - All parsed sections (cards, strategies, events, config, logo) are
 *    returned in a single result object.
 *
 * @param {string} text  - The raw TSV content from the published sheet.
 * @returns {{
 *   cards:      Object<string, CardData>,
 *   strategies: Object<string, StrategyData>,
 *   events:     Array<EventData>,
 *   config:     ConfigData,
 *   logoUrl:    string,
 *   errors:     string[],
 *   groups:     Object<string, Array>,
 *   laws:       Array<{title: string, content: string}>,
 *   ytUrl:      string
 * }}
 */
export function parseSheetData(text) {
  // -- Result accumulators --------------------------------------------------
  const cards = {};
  const strategies = {};
  const groups = {}; // groupName → array of strategy objects
  const events = [];
  const laws = [];
  const errors = [];

  const config = {
    title: CONFIG_DEFAULTS.title,
    meta: CONFIG_DEFAULTS.meta,
    ytUrl: CONFIG_DEFAULTS.ytUrl || '',
  };
  let logoUrl = '';
  let sheetYtUrl = ''; // per-row detection (first YouTube URL wins)

  // -- Pre-scan: extract default YouTube URL from any cell ------------------
  const rows = text.split('\n').map((r) => r.trim());
  for (const row of rows) {
    if (!row) continue;
    const cells = row.split('\t');
    let found = false;
    for (const cell of cells) {
      if (
        cell &&
        (cell.includes('youtube.com') || cell.includes('youtu.be'))
      ) {
        sheetYtUrl = cell.trim();
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!sheetYtUrl) {
    sheetYtUrl = DEFAULT_YT;
  }
  config.ytUrl = sheetYtUrl;

  // -- Main row-by-row parse ------------------------------------------------
  let currentGroup = '未分類';
  let mode = 'CARDS'; // 'CARDS' | 'STRATEGIES' | 'EVENTS'

  rows.forEach((row, rowIndex) => {
    if (!row) return;

    const cells = row.split('\t');

    // Schema validation — catch and collect instead of crashing
    try {
      // Pad short rows to expectedMinColumns so validation passes for
      // meta/config rows that have fewer columns than data rows.
      while (cells.length < SCHEMA_CONFIG.expectedMinColumns) {
        cells.push('');
      }
      validateRow(cells, rowIndex);
    } catch (err) {
      if (err instanceof DataValidationError) {
        errors.push(err.message);
      } else {
        errors.push(`[第 ${rowIndex} 列] 未預期的驗證錯誤: ${err.message}`);
      }
      return; // skip this row
    }

    // Helper to get a cell by COLUMN_MAP key, defaulting to ''
    const col = (key) => (cells[COLUMN_MAP[key]] || '').trim();

    // -- Special / control rows ---------------------------------------------
    const firstCell = cells[0].trim();

    if (firstCell === 'Title') {
      config.title = cells[1] ? cells[1].trim() : config.title;
      return;
    }

    if (firstCell === 'Meta') {
      config.meta = cells[1] ? cells[1].trim() : config.meta;
      return;
    }

    if (firstCell === 'Logo' && cells[1]) {
      logoUrl = fixDriveUrl(cells[1].trim());
      return;
    }

    // Laws rows — still parsed so dead code is removed only at render level.
    // @deprecated Laws data is retained for backward compatibility but no
    // longer rendered in the UI. Remove this block when the laws section is
    // officially excised from the schema.
    if (firstCell.startsWith('L')) {
      laws.push({
        title: cells[1] ? cells[1].trim() : '',
        content: cells[2] ? cells[2].trim() : '',
      });
      return;
    }

    // -- Mode switches ------------------------------------------------------
    if (firstCell === '代號' && cells[1] && cells[1].trim() === '名稱') {
      mode = 'STRATEGIES';
      return;
    }

    if (firstCell === '事件簿') {
      mode = 'EVENTS';
      return;
    }

    // -- Card rows (C-prefixed) ---------------------------------------------
    if (firstCell.startsWith('C')) {
      const code = col('code');
      const name = col('name');
      const rpg = col('rpg');
      const target = col('target');
      const skill = col('skill');
      const budgetRaw = col('budget') || '0';
      const currentRaw = col('current') || '0';
      const strategy = col('strategy');
      const sop = col('sop');
      const mediaRaw = col('media');
      const shares = col('shares') || '0';
      const investedRaw = col('invested') || '0';
      const divCumRaw = col('divCum') || '0';
      const taxRefundRaw = col('taxRefund') || '0';
      const divTotalRaw = col('divTotal') || '0';
      const ytUrlRaw = col('ytUrl');

      const isUSD = detectIsUSD(budgetRaw, strategy);
      const imgUrl = fixDriveUrl(mediaRaw);

      cards[code] = {
        code,
        name,
        rpg,
        target,
        skill,
        isUSD,
        budget: parseCurrency(budgetRaw),
        current: parseCurrency(currentRaw),
        invested: parseCurrency(investedRaw),
        shares,
        divCum: parseCurrency(divCumRaw),
        taxRefund: parseCurrency(taxRefundRaw),
        divTotal: parseCurrency(divTotalRaw),
        ytUrl: ytUrlRaw || '',
        strategy: strategy || '-',
        sop: sop || '-',
        imgUrl,
        // 'media' is the HTML-ready <img> tag used by the original renderer;
        // compute it here so consumers can use it directly.
        media: imgUrl
          ? `<img src="${imgUrl}" class="mc-media">`
          : `<svg class="mc-media" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="2" fill="none"/></svg>`,
      };
      return;
    }

    // -- Strategy rows (P-prefixed) -----------------------------------------
    if (firstCell.startsWith('P')) {
      if (!groups[currentGroup]) {
        groups[currentGroup] = [];
      }

      const code = firstCell;
      const name = cells[1] ? cells[1].trim() : '';
      const deckRaw = cells[2] ? cells[2].trim() : '';
      const deck = deckRaw ? deckRaw.split('+').map((s) => s.trim()) : [];
      const mainCardCode = deck[0];

      // Determine isUSD from the first card in the deck
      let isStrategyUSD = false;
      if (mainCardCode && cards[mainCardCode]) {
        isStrategyUSD = cards[mainCardCode].isUSD;
      }

      const rawInv = cells[9] ? cells[9].trim() : '0';
      const cleanVal = rawInv.replace(/[NT$US,\s]/g, '');
      const displayInv = isStrategyUSD
        ? `USD$ ${cleanVal}`
        : `NT$ ${cleanVal}`;

      // Find the last cell that contains a '%' — that's the sheet ROI
      let sheetROI = '0';
      for (let k = cells.length - 1; k >= 0; k--) {
        if (cells[k] && cells[k].includes('%')) {
          sheetROI = cells[k].replace('%', '').trim();
          break;
        }
      }

      const highlight = cells[3] ? cells[3].trim() : null;
      const explain = cells[4] ? cells[4].trim() : null;
      const budget = cells[5] ? cells[5].trim() : '-';

      const sObj = {
        code,
        name,
        deck,
        sheetROI: parseFloat(sheetROI) || 0,
        sheetInvested: displayInv,
        budget,
        invested: displayInv,
        highlight,
        explain,
        investedVal: parseFloat(cleanVal) || 0,
        isUSD: isStrategyUSD,
      };

      groups[currentGroup].push(sObj);
      strategies[code] = sObj;
      return;
    }

    // -- Group-name rows (STRATEGIES mode, non-P, short rows) ---------------
    if (mode === 'STRATEGIES' && firstCell && !firstCell.startsWith('P') && cells.length < 5) {
      currentGroup = firstCell;
      return;
    }

    // -- Event rows (EVENTS mode, start with a digit) -----------------------
    if (mode === 'EVENTS' && firstCell && /^\d/.test(firstCell)) {
      events.push({
        date: firstCell,
        status: cells[1] ? cells[1].trim() : 'Info',
        content: cells[2] ? cells[2].trim() : '',
        isUrgent: (cells[1] || '').includes('緊急'),
      });
      return;
    }
  });

  return {
    cards,
    strategies,
    events,
    config,
    logoUrl,
    errors,
    groups,
    laws,
    ytUrl: sheetYtUrl,
  };
}

// -- Fetch + Parse ------------------------------------------------------------

/**
 * Fetch the published Google Sheet TSV (with cache-busting timestamp) and
 * parse it into structured data.
 *
 * @returns {Promise<{
 *   cards:      Object<string, CardData>,
 *   strategies: Object<string, StrategyData>,
 *   events:     Array<EventData>,
 *   config:     ConfigData,
 *   logoUrl:    string,
 *   errors:     string[],
 *   groups:     Object<string, Array>,
 *   laws:       Array<{title: string, content: string}>,
 *   ytUrl:      string
 * }>}
 */
export async function fetchSheet() {
  const url = `${GOOGLE_SHEET_URL}&t=${Date.now()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Google Sheet fetch failed: ${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();
  return parseSheetData(text);
}