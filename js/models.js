// =============================================================================
// PROJECT COLISEUM — 資料模型與驗證
// =============================================================================
// JSDoc 型別定義、結構驗證、空值預設物件。
// ES 模組，無副作用。
// =============================================================================

// -- JSDoc 型別定義 -----------------------------------------------------------

/**
 * @typedef {Object} CardData
 * @property {string}  code       - 代號（例如 C01）
 * @property {string}  name       - 名稱／類型
 * @property {string}  rpg        - RPG 職業／分類
 * @property {string}  target     - 目標
 * @property {string}  skill      - 技能
 * @property {string}  budget     - 初始資金（原始字串，可能含 NT$/USD$ 前綴）
 * @property {string}  current    - 現值
 * @property {string}  strategy   - 戰略定位
 * @property {string}  sop        - 嚴格執行 SOP
 * @property {string}  media      - 媒體／卡片圖示 URL
 * @property {string}  shares     - 持有股數
 * @property {string}  invested   - 實際投入
 * @property {string}  divCum     - 累計股息（QQQI）
 * @property {string}  taxRefund  - 30% 退稅
 * @property {string}  divTotal   - 總入帳（QQQI 股息總計）
 * @property {string}  ytUrl      - YouTube URL（每張卡片可覆寫）
 */

/**
 * @typedef {Object} StrategyData
 * @property {string}  code     - 策略代號
 * @property {string}  name     - 策略名稱
 * @property {string}  rpg      - RPG 分類
 * @property {string}  target   - 目標
 * @property {string}  skill    - 技能
 * @property {string}  budget   - 初始資金
 * @property {string}  current  - 現值
 * @property {string}  strategy - 戰略定位
 * @property {string}  sop      - SOP
 * @property {string}  media    - 媒體 URL
 * @property {string}  shares   - 持有股數
 * @property {string}  invested - 實際投入
 * @property {string}  divCum   - 累計股息
 * @property {string}  taxRefund- 退稅
 * @property {string}  divTotal - 股息總計
 * @property {string}  ytUrl    - YouTube URL
 */

/**
 * @typedef {Object} EventData
 * @property {string}  date     - 事件日期
 * @property {string}  type     - 事件類型（例如 buy、sell、dividend）
 * @property {string}  summary  - 事件摘要
 * @property {string}  [detail] - 事件詳情（選填）
 * @property {string}  [code]   - 關聯卡片代號（選填）
 */

/**
 * @typedef {Object} ConfigData
 * @property {string} title - 頁面標題
 * @property {string} meta  - 版本／後設資訊
 * @property {string} ytUrl - 預設 YouTube URL
 */

/**
 * @typedef {Object} StrategyMetrics
 * @property {string}  code        - 策略代號
 * @property {string}  name        - 策略名稱
 * @property {number}  cardCount   - 策略中包含的卡片數量
 * @property {number}  totalBudget - 策略總初始資金
 * @property {number}  totalValue  - 策略總現值
 * @property {number}  profitLoss  - 總損益（正值為獲利、負值為虧損）
 * @property {number}  roiPercent  - 策略報酬率（百分比）
 */

/**
 * @typedef {Object} SheetParseResult
 * @property {CardData[]}     cards    - 解析出的卡片資料陣列
 * @property {StrategyData[]} strategies - 解析出的策略資料陣列
 * @property {ConfigData}     config   - 解析出的設定資料
 * @property {EventData[]}    events   - 解析出的事件資料陣列
 * @property {string[]}       errors   - 解析過程中產生的錯誤訊息陣列
 */

// -- 結構定義 (Schema) --------------------------------------------------------

/**
 * 欄位名稱陣列，依出現順序對應 config.COLUMN_MAP 中的索引。
 * 用於校驗匯入資料的欄位寬度。
 * @type {string[]}
 */
const FIELD_NAMES = [
  'code',       // 0
  'name',       // 1
  'rpg',        // 2
  'target',     // 3
  'skill',      // 4
  'budget',     // 5
  'current',    // 6
  'strategy',   // 7
  'sop',        // 8
  'media',      // 9
  'reserved10', // 10
  'shares',     // 11
  'reserved12', // 12
  'invested',   // 13
  'divCum',     // 14
  'taxRefund',  // 15
  'divTotal',   // 16
  'reserved17', // 17
  'reserved18', // 18
  'reserved19', // 19
  'reserved20', // 20
  'reserved21', // 21
  'reserved22', // 22
  'reserved23', // 23
  'reserved24', // 24
  'reserved25', // 25
  'reserved26', // 26
  'reserved27', // 27
  'reserved28', // 28
  'reserved29', // 29
  'ytUrl',      // 30
];

/**
 * 預設的結構組態，提供給外部模組參照。
 * @type {{ fieldNames: string[], expectedMinColumns: number, expectedMaxColumns: number }}
 */
export const SCHEMA_CONFIG = {
  /** 完整的欄位名稱陣列（0–30，含保留欄位） */
  fieldNames: FIELD_NAMES,
  /** 最小預期欄位數（包含到 ytUrl 30 號欄位 + 至少 1 個保留欄位） */
  expectedMinColumns: 31,
  /** 最大預期欄位數（允許額外保留欄位） */
  expectedMaxColumns: 35,
};

// -- 資料驗證例外類別 ---------------------------------------------------------

/**
 * 資料驗證失敗時拋出的例外。
 * 包含失敗所在列號、欄位名稱及錯誤訊息。
 */
export class DataValidationError extends Error {
  /**
   * @param {number} row     - 錯誤發生的列號（0-based 或 1-based，視呼叫端而定）
   * @param {string} field   - 發生錯誤的欄位名稱
   * @param {string} message - 人類可讀的錯誤描述
   */
  constructor(row, field, message) {
    super(`[第 ${row} 列, 欄位: ${field}] ${message}`);
    this.name = 'DataValidationError';
    this.row = row;
    this.field = field;
    this.message = message;

    // 維持 Error 原型鏈 (針對 ES2015+ 環境)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// -- 資料驗證函式 -------------------------------------------------------------

/**
 * 驗證單列資料的欄位數量是否符合 SCHEMA_CONFIG 的預期範圍。
 *
 * @param {string[]} cells    - 該列分割後的儲存格陣列
 * @param {number}   rowIndex - 該列在原始資料中的索引（用於錯誤訊息）
 * @returns {boolean} 驗證通過回傳 true
 * @throws {DataValidationError} 若欄位數量超出 expectedMaxColumns
 * @throws {DataValidationError} 若欄位數量少於 expectedMinColumns
 */
export function validateRow(cells, rowIndex) {
  const { expectedMinColumns, expectedMaxColumns } = SCHEMA_CONFIG;

  if (!Array.isArray(cells)) {
    throw new DataValidationError(
      rowIndex,
      '(整列)',
      `輸入並非陣列，實際型別: ${typeof cells}`
    );
  }

  if (cells.length > expectedMaxColumns) {
    throw new DataValidationError(
      rowIndex,
      '(整列)',
      `欄位過多：預期最多 ${expectedMaxColumns} 欄，實際 ${cells.length} 欄`
    );
  }

  if (cells.length < expectedMinColumns) {
    throw new DataValidationError(
      rowIndex,
      '(整列)',
      `欄位不足：預期至少 ${expectedMinColumns} 欄，實際 ${cells.length} 欄`
    );
  }

  return true;
}

// -- 空值預設物件 -------------------------------------------------------------

/**
 * 空白的卡片資料物件，用於初始化或做為預設值。
 * @type {CardData}
 */
export const EMPTY_CARD = {
  code: '',
  name: '',
  rpg: '',
  target: '',
  skill: '',
  budget: '',
  current: '',
  strategy: '',
  sop: '',
  media: '',
  shares: '',
  invested: '',
  divCum: '',
  taxRefund: '',
  divTotal: '',
  ytUrl: '',
};

/**
 * 空白的策略資料物件，用於初始化或做為預設值。
 * @type {StrategyData}
 */
export const EMPTY_STRATEGY = {
  code: '',
  name: '',
  rpg: '',
  target: '',
  skill: '',
  budget: '',
  current: '',
  strategy: '',
  sop: '',
  media: '',
  shares: '',
  invested: '',
  divCum: '',
  taxRefund: '',
  divTotal: '',
  ytUrl: '',
};

/**
 * 空白的設定資料物件，對應 CONFIG_DEFAULTS 結構。
 * @type {ConfigData}
 */
export const EMPTY_CONFIG = {
  title: '',
  meta: '',
  ytUrl: '',
};

// =============================================================================