# AGENTS.md — PROJECT COLISEUM

投資組合儀表板。Single-page 前端 app（無後端，無 build step），
從 Google Sheet TSV feed 撈取資料，在瀏覽器中渲染全端儀表板。
賽博暗黑 HUD 美學。純靜態 HTML + CSS + Vanilla JS (ES modules)。

## Startup Workflow

1. **確認工作目錄**：`cd Project_Colosseum_Analysis/Mark-Project-Colosseum`
2. **讀取此檔案**（AGENTS.md）
3. **讀取 `feature_list.json`** 確認當前激活 feature 與狀態
4. **讀取 `progress.md`** 確認前一 session 的進度與 blocker
5. **檢查 Git 狀態**：`git status` + `git log --oneline -5`
6. **瀏覽器驗證**：將 `index.html` 在本地瀏覽器打開，檢查 Console 無紅色錯誤

Baseline 驗證失敗（console error / DOM ID mismatch）時，先修復再開新 scope。

## 架構約束

### 檔案所有權

| 目錄 | 負責範圍 | 不可改動 |
|------|---------|---------|
| `index.html` | HTML 骨架（僅 DOM 結構） | 不包含 inline JS/CSS |
| `js/main.js` | 應用程式編排器 | 不包含渲染邏輯 |
| `js/arena.js` | Leaderboard + Donut + 競技場渲染 | 不包含資料擷取 |
| `js/dashboard.js` | HUD 面板渲染 | 不包含策略計算 |
| `js/engine.js` | 中央化計算引擎 | 不可引入 DOM 操作 |
| `js/parser.js` | TSV 解析 + Schema 驗證 | 不包含 UI 邏輯 |
| `js/modal.js` | 策略詳情模態框 | — |
| `js/cache.js` | localStorage 快取層 | — |
| `js/config.js` | 所有常數、欄位映射、色票 | 不可寫死 magic number |
| `css/main.css` | 基本 reset + CSS 變數 + 版型 | 不包含元件樣式 |
| `css/components.css` | 所有 UI 元件樣式 | 元件樣式集中於此 |
| `assets/` | 圖片資產（壓縮後 <200KB） | 不存放 JS/CSS |

### 約束規則

- **P0 不可跨越**：`index.html` 保持精簡（<150 行），僅定義骨架 + 外部資源引用
- **DOM ID 必須雙向同步**：JS 中 `getElementById()` 引用的每個 ID 必須在 `index.html` 中定義
- **無第三方 runtime 依賴**：不引入 npm / CDN 的 JS 框架
- **clamp() 優先於 media query**：響應式字型使用 `clamp()`，非固定 px + media
- **新元件必須有對應 CSS class**：新增 UI 元件時，元件樣式寫入 `components.css`
- **不要用 innerHTML 覆蓋有 DOM ID 的容器**：使用 CSS class toggle + overlay pattern
- **數據格式化統一使用 engine.js 的 format 函數**：不重複實作 formatCompact / formatBattleAmount
- **Git commit message 格式**：前綴 `T2-N:`（Tier 2-第 N 項），如 `T2-2: Flip profit/loss colors to finance convention`
- **先讀後寫**：修改任何 JS/CSS 前先完整讀取該檔案

## Verification Commands

```bash
# 1. DOM ID 雙向驗證 — 確保 JS 使用的每個 ID 在 HTML 中存在
grep -oP 'id="\K[^"]+' index.html | sort > /tmp/html_ids.txt
grep -roP 'getElementById\("\K[^"]+' js/*.js | sort > /tmp/js_ids.txt
echo "=== MISSING IN HTML ===" && comm -13 /tmp/html_ids.txt /tmp/js_ids.txt
echo "=== MISSING IN JS ===" && comm -23 /tmp/html_ids.txt /tmp/js_ids.txt

# 2. Console error 檢查 — 用瀏覽器開 index.html 手檢
# 預期：無紅色 JS Error、所有 HUD 面板顯示數據非 "..."

# 3. 檢查無殘留 inline style（新加的元件樣式必須在 CSS 中）
grep -n 'style="' index.html | grep -v 'style="display:none"' | grep -v 'style="display:' | grep -v 'style="cursor'

# 4. 確認圖片資產 < 200KB（C05/C06 已壓縮）
ls -lh assets/*.png | awk '{if(NR>1) print $5, $NF}' | while read size file; do
  kb=${size%K}; if (( $(echo "$kb > 200" | bc -l 2>/dev/null || echo 0) )); then
    echo "WARNING: $file is $size";
  fi;
done
```

## Definition of Done

一個 feature 完成的條件（全部滿足）：

- [ ] 功能行為符合 feature_list.json 中該項目的 description
- [ ] 所有 DOM ID 雙向驗證通過（無 missing）
- [ ] 瀏覽器 Console 無紅色錯誤
- [ ] 無殘留 inline style（CSS 中已定義）
- [ ] 已 push 至 GitHub（commit message 含 feature ID）
- [ ] feature_list.json 中該項目標記為 `completed` 並填寫 evidence
- [ ] progress.md 已追加本 session 紀錄

## End of Session

1. 更新 `progress.md`（追加非覆寫）
2. 更新 `feature_list.json`（標記完成 + 填寫 evidence）
3. 確認無未 push commits：`git log --oneline --branches --not --remotes`
4. 如果需要多 session：寫入 `session-handoff.md`
5. 確保 repo 處於 clean state（`git status` 無 dirty files）

## Escalation

- **架構決策**：維持 modular JS + 無 build 原則；超出此範圍先問 Mark
- **不明確的需求**：回到 feature_list.json 檢查 description；仍不明則問
- **重複測試失敗**：更新 progress.md 後標記 blocker
- **GUI 視覺判斷**：以實際瀏覽器渲染為準，非程式碼邏輯推斷
