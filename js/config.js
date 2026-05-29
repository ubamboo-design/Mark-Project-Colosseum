// =============================================================================
// PROJECT COLISEUM — Central Configuration
// =============================================================================
// All shared constants, API endpoints, default values, column mappings, and
// color theme references live here.  ES module — no side effects, const only.
// Locale: zh-TW (Taiwan, Traditional Chinese)
// =============================================================================

// -- Google Sheets ------------------------------------------------------------
// Published TSV feed from the master investment tracking spreadsheet.
export const GOOGLE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQuNQc8E7BlYLR5E6WlYHVQ3l_ki95CqcEcpS8sNQESRKcg5yECE-e2bgMvLGU-Vx5HFuWo5OS1GUIT/pub?output=tsv';

// -- YouTube / Media ----------------------------------------------------------
// Fallback YouTube video URL (used when sheet does not supply one).
export const DEFAULT_YT = 'https://www.youtube.com/watch?v=7rY3QaVQrzo';

// -- Exchange Rate ------------------------------------------------------------
// Hard-coded fallback USD→TWD rate when the live API is unreachable.
export const FALLBACK_RATE = 32.5;

// -- Local Storage ------------------------------------------------------------
// Key used for any client-side caching / persistence.
export const CACHE_KEY = 'mark_colosseum_cache';

// -- Event Display ------------------------------------------------------------
// Number of event-log entries shown on initial render.
export const DISPLAY_EVENTS_INITIAL = 4;

// -- Colour Palette -----------------------------------------------------------
// Colour scheme for profit/loss states and per-strategy theming.
// Values match the CSS custom-property names defined in :root.
export const COLORS = {
  /** Profit / positive return */
  profit: {
    strong: '#ffd700',   // gold — top performer
    normal: '#00ff6a',   // green — profit (finance convention)
    cssVar: 'var(--gold)',
  },
  /** Loss / negative return */
  loss: {
    normal: '#ff2a2a',   // red — loss (finance convention)
    severe: '#bd00ff',   // purple / trap — deep loss
    cssVar: 'var(--red)',
  },
  /** Strategy-type colour mapping */
  byStrategy: {
    tw:      '#ff2a2a',   // Taiwan / TWD strategies
    us:      '#00d2ff',   // USD / US-market strategies
    yield:   '#00ff6a',   // Dividend / yield strategies
    berks:   '#ff9100',   // Berkshire-style
    trap:    '#bd00ff',   // High-risk / trap strategies
    gold:    '#ffd700',   // Gold / precious metals
  },
  /** HUD screen accent colours */
  hud: {
    cyan:   '#00eaff',
    green:  '#00ff4c',
    gold:   '#ffcc00',
    purple: '#d455ff',
  },
};

// -- Column Mapping -----------------------------------------------------------
// Maps human-readable field names to their zero-based column index in the
// Google Sheet TSV export.  Columns beyond the explicitly defined ones are
// reserved for future use.
export const COLUMN_MAP = {
  // ── Card (C‑row) columns ────────────────────────────────────────────────
  code:      0,   // 代號 (e.g. C01)
  name:      1,   // 名稱 / type
  rpg:       2,   // RPG class / category
  target:    3,   // 目標
  skill:     4,   // 技能
  budget:    5,   // 初始資金 (raw string, may contain NT$/USD$ prefix)
  current:   6,   // 現值 (current market value)
  strategy:  7,   // 戰略定位
  sop:       8,   // 嚴格執行 SOP
  media:     9,   // 媒體 / card icon URL
  // column 10  — reserved
  shares:   11,   // 持有股數
  // column 12  — reserved
  invested: 13,   // 實際投入
  divCum:   14,   // 累計股息 (QQQI)
  taxRefund:15,   // 30% 退稅
  divTotal: 16,   // 總入帳 (QQQI dividend total)
  // columns 17‑29 — reserved
  ytUrl:    30,   // YouTube URL (per-card override)
  // column 31  — reserved
};

// -- Config Defaults ----------------------------------------------------------
// Default values applied to the page header / metadata before the sheet is
// parsed.  These may be overridden by Title / Meta rows in the spreadsheet.
export const CONFIG_DEFAULTS = {
  title: 'PROJECT COLISEUM',
  meta:  'v18.00',
  ytUrl: '',
};

// -- Default Locale -----------------------------------------------------------
// Used by Intl.* formatters throughout the dashboard.
export const DEFAULT_LOCALE = 'zh-TW';

// -- Deprecated / Removed Features (documentation only) -----------------------
//
// COUNTER_API  — previously used for visit tracking via counterapi.dev;
//                NO LONGER used per requirements.
//
// YT thumbnail panel — previously rendered a YouTube thumbnail card in the
//                arena dashboard; functionality has been removed.
//                See index.html inline script for the legacy pattern.

// =============================================================================
// CSS Variable Reference (not consumed by JS — documentation only)
// =============================================================================
//
// The following custom properties are defined in index.html :root and should
// be kept in sync with the COLORS export above:
//
//   --bg          #050505      background
//   --card        #0a0a0c      card surface
//   --bar         #1a1a1e      bar / divider
//   --text        #e0e0e0      body text
//   --mute        #888         muted / secondary text
//   --tw          #ff2a2a      Taiwan / TWD region
//   --us          #00d2ff      USD region
//   --yield       #00ff6a      dividend / yield
//   --ber         #ff9100      Berkshire
//   --trap        #bd00ff      high-risk / trap
//   --gold        #ffd700      gold / premium
//   --red         #ff2a2a      profit (positive)
//   --green       #00ff6a      loss (negative)
//   --cyan        #00f7ff      accent
//   --emergency   #ff0000      urgent event
//   --hud-cyan    #00eaff      HUD cyan screen
//   --hud-green   #00ff4c      HUD green screen
//   --hud-gold    #ffcc00      HUD gold / total asset screen
//   --hud-purple  #d455ff      HUD purple accent
//   --font-tech   'Orbitron'   tech / display font
//   --font-num    'Rajdhani'   numeral font
//
// Usage example (CSS):
//   .my-element { color: var(--gold); }