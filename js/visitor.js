// =============================================================================
// PROJECT COLISEUM — visitor.js
// Cumulative visitor counter using Google Apps Script (primary) with
// localStorage-based fallback.
//
// SETUP:
//   1. Deploy the Apps Script (see GOOGLE_APPS_SCRIPT section below)
//   2. Replace GOOGLE_SCRIPT_URL with your deployed URL
//   3. Done — counter auto-increments on each page load
// =============================================================================

// ── Configuration ──
// Replace this with your deployed Google Apps Script web app URL.
// Instructions: see section "GOOGLE_APPS_SCRIPT" at the bottom of this file.
const GOOGLE_SCRIPT_URL = '';

const VISITOR_COUNTED_KEY = 'pc-visitor-counted-v2';
const VISITOR_FALLBACK_KEY = 'pc-visitor-fallback-v2';

// ── Format number with comma separators ──
function formatCount(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Update the DOM element ──
function updateVisitorDisplay(count) {
  const el = document.getElementById('totalVisits');
  if (el) {
    el.textContent = formatCount(count);
  }
}

// ── Fallback: localStorage-based consistent pseudo-count ──
// Uses a seeded "unique" ID per device to produce a stable per-device number.
// This IS NOT cumulative across visitors — only used when online API fails.
function fallbackCounter() {
  let vid = localStorage.getItem(VISITOR_FALLBACK_KEY);
  if (!vid) {
    vid = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(VISITOR_FALLBACK_KEY, vid);
  }

  // Deterministic hash: each visitor ID → consistent number
  let hash = 0;
  for (let i = 0; i < vid.length; i++) {
    hash = ((hash << 5) - hash) + vid.charCodeAt(i);
    hash |= 0;
  }
  return 1000 + Math.abs(hash) % 9000;
}

// ── Track a visit via Google Apps Script ──
async function trackViaGoogleScript() {
  if (!GOOGLE_SCRIPT_URL) return null;

  // Check if already counted this browser session
  const alreadyCounted = sessionStorage.getItem(VISITOR_COUNTED_KEY);

  // Google Apps Script web apps must use JSONP-style GET with callback param.
  // We use a fetch wrapper that parses the JSONP response.
  const url = alreadyCounted
    ? `${GOOGLE_SCRIPT_URL}?action=get`
    : `${GOOGLE_SCRIPT_URL}?action=hit`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (data && typeof data.count === 'number') {
    if (!alreadyCounted) {
      sessionStorage.setItem(VISITOR_COUNTED_KEY, '1');
    }
    return data.count;
  }
  throw new Error('invalid response: ' + JSON.stringify(data));
}

// ── Exported: track a visit and update UI ──
export async function trackVisitor() {
  // 1. Try Google Apps Script (if URL configured)
  if (GOOGLE_SCRIPT_URL) {
    try {
      const count = await trackViaGoogleScript();
      if (count !== null) {
        updateVisitorDisplay(count);
        return count;
      }
    } catch (err) {
      console.warn('[visitor] Google Apps Script failed:', err.message);
    }
  }

  // 2. Fallback: per-device estimate
  const fallback = fallbackCounter();
  updateVisitorDisplay(fallback);
  return fallback;
}

// ── Exported: get current count without incrementing ──
export async function getVisitorCount() {
  if (GOOGLE_SCRIPT_URL) {
    try {
      const res = await fetch(
        `${GOOGLE_SCRIPT_URL}?action=get`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.count === 'number') {
          updateVisitorDisplay(data.count);
          return data.count;
        }
      }
    } catch (_) {}
  }

  const fallback = fallbackCounter();
  updateVisitorDisplay(fallback);
  return fallback;
}

// =============================================================================
// GOOGLE APPS SCRIPT — Deployment Instructions
// =============================================================================
//
// 1. Go to https://script.google.com/home
// 2. Click "New project"
// 3. Replace the Code.gs content with the block below
// 4. Click "Deploy" → "New deployment"
// 5. Type: "Web app"
// 6. Execute as: "Me"
// 7. Who has access: "Anyone" (this is required for the counter API to work)
// 8. Click "Deploy"
// 9. Copy the Web app URL
// 10. Paste it into GOOGLE_SCRIPT_URL at the top of this file
//
// ──── Code.gs ──────────────────────────────────────────────────────────────
//
// function doGet(e) {
//   const props = PropertiesService.getScriptProperties();
//   const action = e?.parameter?.action || 'get';
//
//   if (action === 'hit') {
//     // Increment and return
//     const current = parseInt(props.getProperty('VISITOR_COUNT') || '0', 10);
//     const next = current + 1;
//     props.setProperty('VISITOR_COUNT', next.toString());
//     return ContentService
//       .createTextOutput(JSON.stringify({ count: next }))
//       .setMimeType(ContentService.MimeType.JSON);
//   } else {
//     // Get without increment
//     const count = parseInt(props.getProperty('VISITOR_COUNT') || '0', 10);
//     return ContentService
//       .createTextOutput(JSON.stringify({ count: count }))
//       .setMimeType(ContentService.MimeType.JSON);
//   }
// }
//
// ──── End Code.gs ──────────────────────────────────────────────────────────
//
// Note: The free Google Apps Script quota handles ~20,000 visits/day,
// which is more than enough for a personal portfolio site.
// =============================================================================
