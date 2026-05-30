/**
 * PROJECT COLISEUM — Google Apps Script Backend
 *
 * Handles:
 *   1. Cumulative visitor counter (hit/get)
 *   2. Concurrent online tracking (heartbeat/getactive/leave)
 *   3. Shared guestbook (addcomment/getcomments)
 *
 * Deploy as Web App: Execute as "Me", Who has access "Anyone"
 * After deployment, copy the Web App URL into visitor.js: GOOGLE_SCRIPT_URL
 *
 * @OnlyCurrentDoc
 */

// ──── Storage Keys ──────────────────────────────────────────
var STORE = PropertiesService.getScriptProperties();
var KEY_COUNT  = 'VISITOR_COUNT';
var KEY_SESS   = 'SESSIONS';
var KEY_COMMENTS = 'COMMENTS';
var SESSION_TTL = 120000;   // 2 minutes without heartbeat = offline
var MAX_SESSIONS = 500;
var MAX_COMMENTS = 200;

// ──── Main Router ───────────────────────────────────────────
function doGet(e) {
  var action = e && e.parameter && e.parameter.action ? e.parameter.action : 'get';
  var sid = e && e.parameter ? e.parameter.sid : '';

  switch (action) {

    // ── Visitor counter ──
    case 'hit':
      return jsonResponse(doHit());

    case 'get':
      return jsonResponse(doGetCount());

    // ── Online tracking ──
    case 'heartbeat':
      return jsonResponse(doHeartbeat(sid));

    case 'getactive':
      return jsonResponse(doGetActive());

    case 'leave':
      return jsonResponse(doLeave(sid));

    // ── Comments ──
    case 'addcomment':
      return jsonResponse(doAddComment(e));

    case 'getcomments':
      return jsonResponse(doGetComments());

    default:
      return jsonResponse({ error: 'unknown action' });
  }
}

// Allow POST for comment submissions (larger payloads)
function doPost(e) {
  // e.postData.contents is raw POST body (JSON string)
  // e.parameter still works for query-string params
  return doGet(e);
}

// ──── Visitor Counter ───────────────────────────────────────

function doHit() {
  var cur = parseInt(STORE.getProperty(KEY_COUNT) || '0', 10);
  var next = cur + 1;
  STORE.setProperty(KEY_COUNT, next.toString());
  return { count: next };
}

function doGetCount() {
  return { count: parseInt(STORE.getProperty(KEY_COUNT) || '0', 10) };
}

// ──── Online Tracking ───────────────────────────────────────

function doHeartbeat(sid) {
  if (!sid) return { ok: false, error: 'sid required' };
  var sessions = getSessions();
  sessions[sid] = Date.now();
  // Evict oldest if over limit
  var entries = Object.entries(sessions).sort(function(a, b) { return a[1] - b[1]; });
  if (entries.length > MAX_SESSIONS) {
    var cleaned = {};
    var keep = entries.slice(-MAX_SESSIONS);
    for (var i = 0; i < keep.length; i++) {
      cleaned[keep[i][0]] = keep[i][1];
    }
    STORE.setProperty(KEY_SESS, JSON.stringify(cleaned));
  } else {
    STORE.setProperty(KEY_SESS, JSON.stringify(sessions));
  }
  return { ok: true };
}

function doGetActive() {
  var now = Date.now();
  var sessions = getSessions();
  var cutoff = now - SESSION_TTL;
  var active = 0;
  var fresh = {};
  for (var key in sessions) {
    if (sessions.hasOwnProperty(key)) {
      if (sessions[key] > cutoff) {
        active++;
        fresh[key] = sessions[key];
      }
    }
  }
  STORE.setProperty(KEY_SESS, JSON.stringify(fresh));
  return { online: active };
}

function doLeave(sid) {
  if (!sid) return { ok: false, error: 'sid required' };
  var sessions = getSessions();
  delete sessions[sid];
  STORE.setProperty(KEY_SESS, JSON.stringify(sessions));
  return { ok: true };
}

function getSessions() {
  try {
    return JSON.parse(STORE.getProperty(KEY_SESS) || '{}');
  } catch (e) {
    return {};
  }
}

// ──── Comments ──────────────────────────────────────────────

function doAddComment(e) {
  var name = (e && e.parameter && e.parameter.name) || '匿名';
  var message = e && e.parameter ? e.parameter.message : '';
  if (!message) return { error: 'message required' };

  var comments = getComments();
  comments.push({
    id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    name: name.slice(0, 30),
    message: message.slice(0, 500),
    timestamp: Date.now()
  });

  // Keep last MAX_COMMENTS
  var trimmed = comments.slice(-MAX_COMMENTS);
  STORE.setProperty(KEY_COMMENTS, JSON.stringify(trimmed));
  return { ok: true, id: trimmed[trimmed.length - 1].id };
}

function doGetComments() {
  return { comments: getComments().reverse() };
}

function getComments() {
  try {
    return JSON.parse(STORE.getProperty(KEY_COMMENTS) || '[]');
  } catch (e) {
    return [];
  }
}

// ──── Utility ───────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ──── Test / Reset (run from editor) ────────────────────────

function resetAll() {
  STORE.deleteAllProperties();
  return 'All properties cleared';
}

function testHit() {
  var result = doHit();
  Logger.log(JSON.stringify(result));
}

function testGetCount() {
  var result = doGetCount();
  Logger.log(JSON.stringify(result));
}

function testGetActive() {
  var result = doGetActive();
  Logger.log(JSON.stringify(result));
}
