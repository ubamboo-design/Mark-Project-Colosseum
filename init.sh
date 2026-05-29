#!/bin/bash
# Project Colosseum — Harness Initialization
# 前端純靜態專案（無 build step、無依賴管理）
set -e

echo "=== PROJECT COLISEUM — HARNESS INIT ==="

# ── 1. 確認 Git 狀態 ──────────────────────────────────────
echo "=== Git Status ==="
git status --short
echo ""

echo "=== Recent Commits ==="
git log --oneline -5
echo ""

# ── 2. DOM ID 雙向驗證 ────────────────────────────────────
echo "=== DOM ID Cross-Reference ==="
grep -oP 'id="\K[^"]+' index.html | sort > /tmp/pc_html_ids.txt 2>/dev/null || true
grep -roP 'getElementById\("\K[^"]+' js/*.js | sort > /tmp/pc_js_ids.txt 2>/dev/null || true

missing_in_html=$(comm -13 /tmp/pc_html_ids.txt /tmp/pc_js_ids.txt 2>/dev/null)
missing_in_js=$(comm -23 /tmp/pc_html_ids.txt /tmp/pc_js_ids.txt 2>/dev/null)

if [ -n "$missing_in_html" ]; then
  echo "⚠  JS 引用但 HTML 缺漏的 ID:"
  echo "$missing_in_html"
else
  echo "✓  All JS IDs have corresponding HTML elements"
fi

if [ -n "$missing_in_js" ]; then
  echo "ℹ  HTML-only IDs (可能為 CSS target 或非 JS 層級):"
  echo "$missing_in_js"
fi
echo ""

# ── 3. 圖片資產大小檢查 ──────────────────────────────────
echo "=== Asset Size Check (threshold: 200KB) ==="
if ls assets/*.png 2>/dev/null; then
  for f in assets/*.png; do
    size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null)
    if [ "$size" -gt 204800 ] 2>/dev/null; then
      echo "⚠  $f is $(($size/1024)) KB (exceeds 200KB)"
    fi
  done
else
  echo "(no png assets)"
fi
echo ""

# ── 4. Inline style 殘留檢查 ──────────────────────────────
echo "=== Inline Style Check ==="
inline_styles=$(grep -n 'style="' index.html | grep -v 'style="display:none"' | grep -v 'style="cursor' || true)
if [ -n "$inline_styles" ]; then
  echo "ℹ  Inline styles found (verify intentional):"
  echo "$inline_styles"
else
  echo "✓  No unexpected inline styles"
fi
echo ""

# ── 5. Feature state quick reference ──────────────────────
echo "=== Feature Status ==="
python -c "
import json
with open('feature_list.json') as f:
    data = json.load(f)
for feat in data['features']:
    icon = {'completed':'✓','in_progress':'◐','not-started':'○','blocked':'✗'}.get(feat['status'], '?')
    print(f\"  {icon} {feat['id']}: {feat['name']} — {feat['status']}\")
" 2>/dev/null || echo "(no feature_list.json)"
echo ""

echo "=== Harness Init Complete ==="
echo "Next: Read AGENTS.md → Pick one feature from feature_list.json → Implement"
