// =============================================================================
// PROJECT COLISEUM — comments.js
// Visitor comments section with localStorage fallback
//
// Primary: Google Apps Script (shared across all visitors)
// Fallback: localStorage (per-browser, immediate)
// =============================================================================

const COMMENT_STORAGE_KEY = 'pc-comments-v1';

// ── Format timestamp ──
function formatTime(ts) {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${min}`;
}

// ── Escape HTML to prevent XSS ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
//  LocalStorage persistence
// ═══════════════════════════════════════════════════════════════

function loadLocalComments() {
  try {
    const raw = localStorage.getItem(COMMENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveLocalComments(comments) {
  try {
    localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(comments));
  } catch (_) {}
}

function addLocalComment(name, message) {
  const comments = loadLocalComments();
  comments.push({
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    message: message.trim(),
    timestamp: Date.now()
  });
  // Keep last 100 comments
  const trimmed = comments.slice(-100);
  saveLocalComments(trimmed);
  return trimmed;
}

// ═══════════════════════════════════════════════════════════════
//  Google Apps Script integration (same script as visitor.js)
// ═══════════════════════════════════════════════════════════════

function getScriptUrl() {
  // Share the same GOOGLE_SCRIPT_URL from visitor.js if available
  // We access it via the same constant which is in visitor.js scope
  return window.__GAS_URL || '';
}

async function fetchCommentsFromServer() {
  const url = getScriptUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}?action=getcomments`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.comments)) return data.comments;
    return null;
  } catch (err) {
    console.warn('[comments] server fetch failed:', err.message);
    return null;
  }
}

async function postCommentToServer(name, message) {
  const url = getScriptUrl();
  if (!url) return false;
  try {
    const res = await fetch(
      `${url}?action=addcomment&name=${encodeURIComponent(name)}&message=${encodeURIComponent(message)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    return res.ok;
  } catch (_) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Rendering
// ═══════════════════════════════════════════════════════════════

function renderComments(comments) {
  const container = document.getElementById('commentList');
  if (!container) return;

  if (!comments || comments.length === 0) {
    container.innerHTML = '<div class="cmt-empty">還沒有留言，來寫第一則吧 📝</div>';
    return;
  }

  // Show newest first
  const sorted = [...comments].sort((a, b) => b.timestamp - a.timestamp);

  container.innerHTML = sorted.map(c => {
    const name = escapeHtml(c.name || '匿名');
    const msg = escapeHtml(c.message);
    const time = formatTime(c.timestamp);
    return `
      <div class="cmt-item">
        <div class="cmt-head">
          <span class="cmt-name">${name}</span>
          <span class="cmt-time">${time}</span>
        </div>
        <div class="cmt-body">${msg}</div>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//  Submit handler
// ═══════════════════════════════════════════════════════════════

function setupSubmitHandler() {
  const form = document.getElementById('commentForm');
  const input = document.getElementById('commentInput');
  const nameInput = document.getElementById('commentName');
  const sendBtn = document.getElementById('commentSend');
  if (!form || !input || !sendBtn) return;

  const doSubmit = async () => {
    const name = (nameInput?.value || '匿名').trim();
    const msg = input.value.trim();
    if (!msg) return;

    sendBtn.disabled = true;
    sendBtn.textContent = 'POSTING...';

    // Try server first
    const serverOk = await postCommentToServer(name, msg);

    // Always save locally (as primary storage or as fallback)
    const comments = addLocalComment(name, msg);
    renderComments(comments);

    input.value = '';
    sendBtn.disabled = false;
    sendBtn.textContent = 'SEND';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    doSubmit();
  });

  sendBtn.addEventListener('click', doSubmit);

  // Ctrl/Cmd+Enter to send from textarea
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doSubmit();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  Exported API
// ═══════════════════════════════════════════════════════════════

export function initComments() {
  // 1. Try server for comments
  fetchCommentsFromServer().then(serverComments => {
    if (serverComments && serverComments.length > 0) {
      renderComments(serverComments);
      return;
    }
    // 2. Fallback to local
    const local = loadLocalComments();
    renderComments(local);
  }).catch(() => {
    // 3. Local only
    const local = loadLocalComments();
    renderComments(local);
  });

  // 4. Wire up form
  setupSubmitHandler();
}
