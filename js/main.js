// =============================================================================
// PROJECT COLISEUM — Main Application Orchestrator
// =============================================================================
// Coordinates data fetching, caching, rendering, and error recovery across all
// dashboard modules. Runs on DOMContentLoaded.
// =============================================================================

import { GOOGLE_SHEET_URL, FALLBACK_RATE, DEFAULT_YT, CONFIG_DEFAULTS } from './config.js';
import { fetchSheet, parseSheetData } from './parser.js';
import { saveToCache, loadFromCache, getCacheMeta, isCacheFresh, validateCacheStructure } from './cache.js';
import { computeAllStrategyMetrics } from './engine.js';
import { renderHeader, renderDashboard, renderCacheStatus, showDashboardError, showDashboardLoading } from './dashboard.js';
import { renderArena } from './arena.js';
import { renderEvents } from './events.js';
import { openStrategyModal, closeModal } from './modal.js';
import { trackVisitor, trackOnline } from './visitor.js';
import { initComments } from './comments.js';

// =============================================================================
// Global State
// =============================================================================

let currentRate = FALLBACK_RATE;
let cardsData = {};
let strategiesData = {};   // keyed by strategy code
let eventsData = [];
let configData = { ...CONFIG_DEFAULTS };
let logoUrl = '';
let portfolios = {};       // { groupName: [strategy, ...], ... }

// =============================================================================
// Expose modal functions globally for inline onclick handlers in generated HTML
// =============================================================================

window.openStrategyModal = (code) => openStrategyModal(code, strategiesData, cardsData, configData);
window.closeModal = closeModal;

// =============================================================================
// Exchange Rate Fetching
// =============================================================================

async function fetchExchangeRate() {
    try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.rates?.TWD) {
            currentRate = data.rates.TWD;
        }
    } catch (err) {
        console.warn('匯率 API 失敗，啟用備用匯率', FALLBACK_RATE, err);
        // currentRate stays at FALLBACK_RATE default
    }
    // Update rateInfo element if it exists
    const rateEl = document.getElementById('rateInfo');
    if (rateEl) {
        const isOffline = currentRate === FALLBACK_RATE;
        rateEl.textContent = `USD/TWD: ${currentRate}`;
        rateEl.style.color = isOffline ? 'var(--emergency)' : 'var(--mute)';
        rateEl.style.textShadow = isOffline ? '0 0 5px rgba(255,0,0,0.8)' : 'none';
    }
}

// =============================================================================
// Data Fetching with Cache Fallback
// =============================================================================

async function loadData() {
    // Try cache first — show stale data while fetching fresh
    const cached = loadFromCache();
    let cacheValid = false;
    if (cached && validateCacheStructure(cached)) {
        const meta = getCacheMeta();
        if (meta.exists) {
            applyParsedData(cached);
            renderAll();
            renderCacheStatus({ cached: true }, currentRate);
            cacheValid = true;
        }
    }

    // Fetch fresh data from Google Sheets
    try {
        const result = await fetchSheet();

        if (result && result.cards && Object.keys(result.cards).length > 0) {
            // Save to cache
            const cacheData = {
                cards: result.cards,
                strategies: result.strategies,
                events: result.events,
                config: result.config,
                logoUrl: result.logoUrl,
                portfolios: result.groups || result.strategies,
                timestamp: Date.now()
            };
            saveToCache(cacheData);

            applyParsedData(cacheData);
            renderAll();
            renderCacheStatus({ cached: false }, currentRate);

            // Show any parse errors as a subtle console warning
            if (result.errors && result.errors.length > 0) {
                console.warn('資料解析時發生以下錯誤:');
                result.errors.forEach(e => console.warn(`  [Row ${e.row}] ${e.message || e}`));
            }
        } else {
            throw new Error('解析結果無卡片資料');
        }
    } catch (err) {
        console.error('資料載入失敗:', err);

        if (!cacheValid) {
            // No cache, no network — show error state
            showDashboardError(`⚠️ 資料載入失敗<br><small>${err.message || '請確認網路連線或稍後再試'}</small>`);
        } else {
            // We have cached data — just show a warning badge
            const rateEl = document.getElementById('rateInfo');
            if (rateEl) {
                rateEl.textContent += ' | OFFLINE (CACHE)';
                rateEl.style.color = 'var(--trap)';
            }
        }
    }
}

// =============================================================================
// Apply Parsed Data to Global State
// =============================================================================

function applyParsedData(data) {
    if (data.cards) cardsData = data.cards;
    if (data.events) eventsData = data.events;
    if (data.config) configData = { ...CONFIG_DEFAULTS, ...data.config };
    if (data.logoUrl) logoUrl = data.logoUrl;
    if (data.portfolios) {
        portfolios = data.portfolios;
        // Build strategiesData lookup from portfolios
        strategiesData = {};
        Object.values(portfolios).forEach(group => {
            if (Array.isArray(group)) {
                group.forEach(s => {
                    strategiesData[s.code] = s;
                });
            }
        });
    }
    if (data.strategies) {
        // If portfolios not set, use flat strategies as fallback
        if (Object.keys(strategiesData).length === 0) {
            strategiesData = {};
            Object.values(data.strategies).forEach(s => {
                strategiesData[s.code] = s;
            });
        }
    }
}

// =============================================================================
// Render Orchestration
// =============================================================================

function renderAll() {
    renderHeader(logoUrl, configData);
    renderDashboard(Object.values(cardsData), currentRate);
    renderArena(portfolios, cardsData, configData, currentRate);
    renderEvents(eventsData);
}

// =============================================================================
// Global Refresh
// =============================================================================

window.init = async function init() {
    const indicator = document.getElementById('refresh-indicator');
    const spinner = indicator?.querySelector('.spinner');
    const text = indicator?.querySelector('.refresh-text span');

    if (indicator) indicator.style.height = '40px';
    if (spinner) spinner.style.display = 'inline-block';
    if (text) text.textContent = 'SYNCING...';

    // Show loading shimmer on first load (not on refresh if we have data)
    if (Object.keys(cardsData).length === 0) {
        showDashboardLoading();
    }

    // Fetch rate and data in parallel
    await Promise.all([
        fetchExchangeRate(),
        loadData(),
        trackVisitor()
    ]);

    // Start concurrent online tracking (heartbeat loop)
    trackOnline();

    // Load comments
    initComments();

    if (indicator) {
        if (text) text.textContent = 'SYNC COMPLETE';
        setTimeout(() => { indicator.style.height = '0'; }, 800);
    }
    if (spinner) setTimeout(() => { spinner.style.display = 'none'; }, 800);
};

// =============================================================================
// Bootstrap
// =============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.init());
} else {
    window.init();
}