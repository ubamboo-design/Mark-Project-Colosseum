// =============================================================================
// PROJECT COLISEUM — visitor.js
// Cumulative visitor counter + concurrent online tracking
//
// Primary: Google Apps Script (real shared counters across all visitors)
// Fallback: localStorage + heartbeat (per-browser estimate)
//
// SETUP:
//   1. (Optional) Deploy the Apps Script — see GOOGLE_APPS_SCRIPT section
//   2. Replace GOOGLE_SCRIPT_URL with your deployed URL
//   3. Done — counters work immediately with/without the script
// =============================================================================

// ── Configuration ──
const GOOGLE_SCRIPT_URL = '';  // Replace after deployment

const LS_PREFIX = 'pc-vis6';  // v6: reset counter to 0 (was pc-vis5)
const SESSION_ID_KEY = LS_PREFIX + '-sid';
const HEARTBEAT_KEY = LS_PREFIX + '-hb';
const COUNTED_KEY = LS_PREFIX + '-cnt';
const FALLBACK_VID_KEY = LS_PREFIX + '-vid';
const FALLBACK_TOTAL_KEY = LS_PREFIX + '-total';  // Persistent running total counter

const HEARTBEAT_INTERVAL_MS = 30000;  // 30s between heartbeats
const SESSION_TIMEOUT_MS = 120000;    // 2min without heartbeat = offline

// ── Session identity ──
const sessionId = generateSessionId();

function generateSessionId() {
  let sid = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sid) {
    sid = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(SESSION_ID_KEY, sid);
  }
  return sid;
}

// ── Format number with comma separators ──
function formatCount(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Update DOM: total cumulative visits ──
function updateTotalDisplay(count) {
  const el = document.getElementById('totalVisits');
  if (el) el.textContent = formatCount(count);
  // Also update visitorCount (no longer overwritten by renderCacheStatus)
  const vcEl = document.getElementById('visitorCount');
  if (vcEl) vcEl.textContent = formatCount(count);
}

// ── Update DOM: concurrent online count ──
function updateOnlineDisplay(count) {
  const el = document.getElementById('onlineCount');
  if (el) el.textContent = formatCount(count);
}

// ═══════════════════════════════════════════════════════════════
//  CONCURRENT ONLINE — localStorage heartbeat fallback
// ═══════════════════════════════════════════════════════════════

// Count active sessions across all tabs on this browser via localStorage
function countLocalActiveSessions() {
  const now = Date.now();
  let active = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(HEARTBEAT_KEY + '-')) continue;

      const ts = parseInt(localStorage.getItem(key), 10);
      if (now - ts < SESSION_TIMEOUT_MS) {
        active++;
      } else {
        // Stale entry — clean up
        localStorage.removeItem(key);
        i--; // adjust index after removal
      }
    }
  } catch (_) {}

  // Always count this session (even if heartbeat not yet written)
  return Math.max(1, active);
}

// Write our heartbeat timestamp
function writeHeartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY + '-' + sessionId, String(Date.now()));
  } catch (_) {}
}

// Remove our heartbeat (on page unload or visibility hidden)
function removeHeartbeat() {
  try {
    localStorage.removeItem(HEARTBEAT_KEY + '-' + sessionId);
  } catch (_) {}
}

// Recalculate and update the online count display
function refreshOnlineCount() {
  const count = countLocalActiveSessions();
  updateOnlineDisplay(count);
  return count;
}

// Start the heartbeat loop
function startHeartbeat() {
  // Initial write + count
  writeHeartbeat();
  refreshOnlineCount();

  // Periodic heartbeat
  const heartbeatTimer = setInterval(() => {
    writeHeartbeat();
    refreshOnlineCount();
  }, HEARTBEAT_INTERVAL_MS);

  // Clean up on page unload
  const cleanup = () => {
    removeHeartbeat();
    clearInterval(heartbeatTimer);
  };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  // Re-count when tab becomes visible again (user might have multiple tabs)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      writeHeartbeat();
      refreshOnlineCount();
    }
  });

  return heartbeatTimer;
}

// ═══════════════════════════════════════════════════════════════
//  CUMULATIVE VISITOR COUNT — fallback
// ═══════════════════════════════════════════════════════════════

function fallbackTotalCounter() {
  // Read current running total (default 0)
  let total = parseInt(localStorage.getItem(FALLBACK_TOTAL_KEY) || '0', 10);

  // Only increment once per session (sessionStorage flags)
  const alreadyCounted = sessionStorage.getItem(COUNTED_KEY);
  if (!alreadyCounted) {
    total += 1;
    localStorage.setItem(FALLBACK_TOTAL_KEY, String(total));
    sessionStorage.setItem(COUNTED_KEY, '1');
  }

  return total;
}

// ═══════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT — online tracking
// ═══════════════════════════════════════════════════════════════

async function totalViaGoogleScript() {
  if (!GOOGLE_SCRIPT_URL) return null;
  const alreadyCounted = sessionStorage.getItem(COUNTED_KEY);
  const url = alreadyCounted
    ? `${GOOGLE_SCRIPT_URL}?action=get`
    : `${GOOGLE_SCRIPT_URL}?action=hit`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && typeof data.count === 'number') {
    if (!alreadyCounted) sessionStorage.setItem(COUNTED_KEY, '1');
    return data.count;
  }
  throw new Error('invalid response');
}

async function onlineViaGoogleScript() {
  if (!GOOGLE_SCRIPT_URL) return null;
  const res = await fetch(
    `${GOOGLE_SCRIPT_URL}?action=getactive`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && typeof data.online === 'number') return data.online;
  throw new Error('invalid response');
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTED API
// ═══════════════════════════════════════════════════════════════

// Track a visit (cumulative counter)
export async function trackVisitor() {
  if (GOOGLE_SCRIPT_URL) {
    try {
      const count = await totalViaGoogleScript();
      if (count !== null) { updateTotalDisplay(count); return count; }
    } catch (err) { console.warn('[visitor] Apps Script total failed:', err.message); }
  }
  const f = fallbackTotalCounter();
  updateTotalDisplay(f);
  return f;
}

// Get cumulative count without incrementing
export async function getVisitorCount() {
  if (GOOGLE_SCRIPT_URL) {
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=get`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) { const d = await res.json(); if (d?.count) { updateTotalDisplay(d.count); return d.count; } }
    } catch (_) {}
  }
  const f = fallbackTotalCounter();
  updateTotalDisplay(f);
  return f;
}

// Get concurrent online count (starts heartbeat on first call)
export function trackOnline() {
  // Try Google Apps Script once
  if (GOOGLE_SCRIPT_URL) {
    onlineViaGoogleScript()
      .then(c => { if (c !== null) updateOnlineDisplay(c); })
      .catch(() => { /* fallback handles it */ });
  }

  // Start localStorage heartbeat (always, as baseline + fallback)
  startHeartbeat();
}

// ═══════════════════════════════════════════════════════════════
//  GOOGLE APPS SCRIPT — Deployment Instructions
// ═══════════════════════════════════════════════════════════════
//
// 1. Go to https://script.google.com/home
// 2. Click "New project"
// 3. Replace Code.gs content with the block below
// 4. Deploy → New deployment → Web app
// 5. Execute as: "Me", Who has access: "Anyone"
// 6. Copy the Web app URL → paste into GOOGLE_SCRIPT_URL above
//
// ──── Code.gs ─────────────────────────────────────────────────
//
// // Store: { VISITOR_COUNT: N, SESSIONS: { sid: timestamp, ... } }
// function doGet(e) {
//   const props = PropertiesService.getScriptProperties();
//   const action = e?.parameter?.action || 'get';
//
//   // ── Total visit counter ──
//   if (action === 'hit') {
//     const cur = parseInt(props.getProperty('VISITOR_COUNT') || '0', 10);
//     const next = cur + 1;
//     props.setProperty('VISITOR_COUNT', next.toString());
//     return json({ count: next });
//   }
//
//   if (action === 'get') {
//     return json({ count: parseInt(props.getProperty('VISITOR_COUNT') || '0', 10) });
//   }
//
//   // ── Concurrent online tracking ──
//   if (action === 'heartbeat') {
//     const sid = e?.parameter?.sid;
//     if (sid) {
//       const sessions = JSON.parse(props.getProperty('SESSIONS') || '{}');
//       sessions[sid] = Date.now();
//       // Keep max 500 sessions, oldest evicted
//       const entries = Object.entries(sessions).sort((a, b) => a[1] - b[1]);
//       if (entries.length > 500) {
//         const cleaned = Object.fromEntries(entries.slice(-500));
//         props.setProperty('SESSIONS', JSON.stringify(cleaned));
//       } else {
//         props.setProperty('SESSIONS', JSON.stringify(sessions));
//       }
//     }
//     return json({ ok: true });
//   }
//
//   if (action === 'getactive') {
//     const now = Date.now();
//     const sessions = JSON.parse(props.getProperty('SESSIONS') || '{}');
//     const cutoff = now - 120000; // 2 minutes
//     const active = Object.values(sessions).filter(ts => ts > cutoff).length;
//     // Clean stale
//     const fresh = Object.fromEntries(
//       Object.entries(sessions).filter(([, ts]) => ts > cutoff)
//     );
//     props.setProperty('SESSIONS', JSON.stringify(fresh));
//     return json({ online: active, sessions: Object.keys(fresh).length });
//   }
//
//   if (action === 'leave') {
//     const sid = e?.parameter?.sid;
//     if (sid) {
//       const sessions = JSON.parse(props.getProperty('SESSIONS') || '{}');
//       delete sessions[sid];
//       props.setProperty('SESSIONS', JSON.stringify(sessions));
//     }
//     return json({ ok: true });
//   }
//
//   return json({ error: 'unknown action' });
// }
//
// function json(obj) {
//   return ContentService
//     .createTextOutput(JSON.stringify(obj))
//     .setMimeType(ContentService.MimeType.JSON);
// }
//
// ── EXTENSION: Comment actions ─────────────────────────────
//
// Add these cases to the doGet function's if/else chain:
//
//   if (action === 'addcomment') {
//     const name = e?.parameter?.name || '匿名';
//     const message = e?.parameter?.message;
//     if (!message) return json({ error: 'message required' });
//
//     const comments = JSON.parse(props.getProperty('COMMENTS') || '[]');
//     comments.push({
//       id: 'c_' + Date.now().toString(36),
//       name: name.slice(0, 30),
//       message: message.slice(0, 500),
//       timestamp: Date.now()
//     });
//     // Keep last 200
//     const trimmed = comments.slice(-200);
//     props.setProperty('COMMENTS', JSON.stringify(trimmed));
//     return json({ ok: true });
//   }
//
//   if (action === 'getcomments') {
//     const comments = JSON.parse(props.getProperty('COMMENTS') || '[]');
//     return json({ comments: comments.reverse() });
//   }
//
// ──── End Code.gs ──────────────────────────────────────────────
// =============================================================================
