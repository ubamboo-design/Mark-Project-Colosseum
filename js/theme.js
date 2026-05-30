/* ============================================================
   PROJECT COLISEUM — theme.js
   Theme switching system
   Handles class toggling on <html>, localStorage persistence,
   and the floating theme-switcher UI.
   ============================================================ */

const THEMES = {
  default:       { name: '⚡ Cyberpunk HUD', fonts: 'google' },
  'linear-dark': { name: '◈ Linear Dark',     fonts: 'google' },
  'sentry-purple': { name: '✦ Sentry Purple', fonts: 'google' },
  'oled-noir':   { name: '● OLED Noir',       fonts: 'none' },
  'nvidia-green':{ name: '◆ NVIDIA Green',    fonts: 'google' },
};

const STORAGE_KEY = 'pc-colosseum-theme';

/* ── Get current theme name ── */
function getCurrentTheme() {
  // 1. Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES[stored]) return stored;

  // 2. Check <html> class
  const html = document.documentElement;
  for (const key of Object.keys(THEMES)) {
    if (key !== 'default' && html.classList.contains('theme-' + key)) {
      return key;
    }
  }

  return 'default';
}

/* ── Apply a theme ── */
function applyTheme(name) {
  const html = document.documentElement;
  const prev = getCurrentTheme();

  // Remove all theme classes
  for (const key of Object.keys(THEMES)) {
    if (key !== 'default') {
      html.classList.remove('theme-' + key);
    }
  }

  // Apply new theme class
  if (name !== 'default') {
    html.classList.add('theme-' + name);
  }

  // Persist
  localStorage.setItem(STORAGE_KEY, name);

  // Notify other modules
  document.dispatchEvent(new CustomEvent('themechange', {
    detail: { theme: name, prev: prev, themeData: THEMES[name] }
  }));

  // Update UI
  updateSwitcherUI(name);

  // Update <meta>-level indicators
  updateMetaIndicators(name);
}

/* ── Cycle to next theme ── */
function cycleTheme() {
  const names = Object.keys(THEMES);
  const current = getCurrentTheme();
  const idx = names.indexOf(current);
  const next = names[(idx + 1) % names.length];
  applyTheme(next);
}

/* ── Build the floating switcher UI ── */
function buildSwitcherUI() {
  const existing = document.getElementById('themeSwitcher');
  if (existing) return;

  const container = document.createElement('div');
  container.id = 'themeSwitcher';
  container.innerHTML = `
    <button id="themeSwitcherBtn" title="切換主題" aria-label="切換主題">
      <span class="ts-icon">🎨</span>
      <span class="ts-label" id="themeSwitcherLabel">${THEMES[getCurrentTheme()]?.name || 'Theme'}</span>
    </button>
    <div class="ts-panel" id="themeSwitcherPanel">
      ${Object.entries(THEMES).map(([key, t]) => `
        <button class="ts-option${key === getCurrentTheme() ? ' ts-active' : ''}"
                data-theme="${key}"
                title="${t.name}">
          ${t.name}
        </button>
      `).join('')}
    </div>
  `;

  document.body.appendChild(container);

  // ── Wire up toggle ──
  const btn = document.getElementById('themeSwitcherBtn');
  const panel = document.getElementById('themeSwitcherPanel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('ts-open');
    btn.classList.toggle('ts-active');
  });

  // ── Wire up options ──
  panel.querySelectorAll('.ts-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const theme = opt.dataset.theme;
      applyTheme(theme);
      panel.classList.remove('ts-open');
      btn.classList.remove('ts-active');
    });
  });

  // ── Close on outside click ──
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      panel.classList.remove('ts-open');
      btn.classList.remove('ts-active');
    }
  });
}

/* ── Update switcher button label ── */
function updateSwitcherUI(name) {
  const label = document.getElementById('themeSwitcherLabel');
  if (label) {
    label.textContent = THEMES[name]?.name || 'Theme';
  }

  // Update active state in panel
  document.querySelectorAll('.ts-option').forEach(opt => {
    opt.classList.toggle('ts-active', opt.dataset.theme === name);
  });
}

/* ── Update HTML-level indicators ── */
function updateMetaIndicators(name) {
  const meta = document.querySelector('meta[name="x-theme"]');
  if (meta) meta.setAttribute('content', name);
}

/* ── Keyboard shortcut: Alt+T to cycle ── */
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 't') {
    e.preventDefault();
    cycleTheme();
  }
});

/* ── Initialize on DOM ready ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getCurrentTheme());
    buildSwitcherUI();
  });
} else {
  applyTheme(getCurrentTheme());
  buildSwitcherUI();
}

/* ── Expose for debugging ── */
window.__theme = { getCurrentTheme, applyTheme, cycleTheme, THEMES };
