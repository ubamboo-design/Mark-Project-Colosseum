// =============================================================================
// PROJECT COLISEUM — comments.js
// Visitor comments section with reply threading
//
// Primary: localStorage (immediate, persistent)
// Upgrade: Google Apps Script (shared across visitors, URL pending)
// Notification: local webhook → Hermes cron → Telegram
// =============================================================================

const COMMENT_STORAGE_KEY = 'pc-comments-v2';

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

function addLocalComment(name, message, replyTo) {
  const comments = loadLocalComments();
  comments.push({
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    message: message.trim(),
    timestamp: Date.now(),
    replyTo: replyTo || null
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

async function postCommentToServer(name, message, replyTo) {
  const url = getScriptUrl();
  if (!url) return false;
  try {
    let params = `action=addcomment&name=${encodeURIComponent(name)}&message=${encodeURIComponent(message)}`;
    if (replyTo) params += `&replyTo=${encodeURIComponent(replyTo)}`;
    const res = await fetch(`${url}?${params}`, {
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

// ── Notify local webhook (Hermes notification relay) ──
const LOCAL_WEBHOOK_URL = 'http://127.0.0.1:18521';

async function notifyLocalWebhook(name, message, replyTo) {
  try {
    const payload = {
      name: name,
      message: message,
      timestamp: Date.now(),
      page: 'Project Colosseum'
    };
    if (replyTo) payload.replyTo = replyTo;
    await fetch(LOCAL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000)
    });
  } catch (_) {
    // Webhook not running — silent fail
  }
}

// ═══════════════════════════════════════════════════════════════
//  Grouping: top-level vs replies
// ═══════════════════════════════════════════════════════════════

function groupComments(comments) {
  const topLevel = [];
  const replyMap = {};

  comments.forEach(c => {
    if (c.replyTo) {
      if (!replyMap[c.replyTo]) replyMap[c.replyTo] = [];
      replyMap[c.replyTo].push(c);
    } else {
      topLevel.push(c);
    }
  });

  // Sort each reply group by timestamp
  Object.keys(replyMap).forEach(parentId => {
    replyMap[parentId].sort((a, b) => a.timestamp - b.timestamp);
  });

  return { topLevel, replyMap };
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

  const { topLevel, replyMap } = groupComments(comments);

  // Sort top-level newest first
  const sorted = [...topLevel].sort((a, b) => b.timestamp - a.timestamp);

  container.innerHTML = sorted.map(parent => {
    const parentHtml = renderCommentItem(parent);
    const replies = replyMap[parent.id];
    let repliesHtml = '';
    if (replies && replies.length > 0) {
      repliesHtml = '<div class="cmt-replies">' +
        replies.map(r => renderCommentItem(r, true)).join('') +
        '</div>';
    }
    return parentHtml + repliesHtml;
  }).join('');
}

function renderCommentItem(c, isReply) {
  const name = escapeHtml(c.name || '匿名');
  const msg = escapeHtml(c.message);
  const time = formatTime(c.timestamp);
  const replyAttr = isReply ? '' : ` data-cmt-id="${escapeHtml(c.id)}"`;

  return `
    <div class="cmt-item${isReply ? ' cmt-item--reply' : ''}"${replyAttr}>
      <div class="cmt-head">
        <div class="cmt-head-left">
          <span class="cmt-name">${name}</span>
          ${isReply ? '<span class="cmt-reply-badge">↩</span>' : ''}
        </div>
        <div class="cmt-head-right">
          <span class="cmt-time">${time}</span>
          ${isReply ? '' : `<button class="cmt-reply-btn" onclick="window.__openReply('${escapeHtml(c.id)}', '${escapeHtml(name)}')" title="回覆">↩</button>`}
        </div>
      </div>
      <div class="cmt-body">${msg}</div>
      ${isReply ? '' : `<div class="cmt-reply-form" id="cmtReplyForm-${escapeHtml(c.id)}" style="display:none"></div>`}
    </div>
  `;
}

// ── Global reply opener (called from inline onclick) ──
window.__openReply = function(parentId, parentName) {
  // Close any other open reply forms
  document.querySelectorAll('.cmt-reply-form-inline').forEach(el => el.remove());

  const container = document.getElementById(`cmtReplyForm-${parentId}`);
  if (!container) return;

  // Check if a reply form is already open for this parent
  if (container.querySelector('.cmt-reply-form-inline')) {
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="cmt-reply-form-inline">
      <div class="cmt-reply-form-row">
        <input type="text" class="cmt-input cmt-reply-name" placeholder="稱呼（選填）" maxlength="30">
        <input type="text" class="cmt-input cmt-reply-msg" placeholder="回覆 ${escapeHtml(parentName)}…" maxlength="500">
        <button class="cmt-reply-send" data-parent="${escapeHtml(parentId)}" data-parent-name="${escapeHtml(parentName)}">送出</button>
        <button class="cmt-reply-cancel">✕</button>
      </div>
    </div>
  `;

  // Focus the message input
  const msgInput = container.querySelector('.cmt-reply-msg');
  if (msgInput) setTimeout(() => msgInput.focus(), 100);

  // Wire up send
  container.querySelector('.cmt-reply-send').addEventListener('click', function() {
    const name = this.closest('.cmt-reply-form-inline').querySelector('.cmt-reply-name').value.trim() || '匿名';
    const msg = this.closest('.cmt-reply-form-inline').querySelector('.cmt-reply-msg').value.trim();
    if (!msg) return;
    doReply(this.dataset.parent, name, msg);
  });

  // Wire up cancel
  container.querySelector('.cmt-reply-cancel').addEventListener('click', function() {
    container.style.display = 'none';
    container.innerHTML = '';
  });

  // Enter to send
  container.querySelector('.cmt-reply-msg').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const sendBtn = this.closest('.cmt-reply-form-inline').querySelector('.cmt-reply-send');
      if (sendBtn) sendBtn.click();
    }
  });
};

// ── Submit a reply ──
function doReply(parentId, name, message) {
  const comments = addLocalComment(name, message, parentId);
  renderComments(comments);
  notifyLocalWebhook(name, `↩ 回覆: ${message}`);
}

// ═══════════════════════════════════════════════════════════════
//  Submit handler (top-level comment)
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

    // Always save locally
    const comments = addLocalComment(name, msg);
    renderComments(comments);

    // Notify Hermes via local webhook
    notifyLocalWebhook(name, msg);

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

  // 4. Wire up top-level form
  setupSubmitHandler();
}
