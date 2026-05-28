// =============================================================================
// PROJECT COLISEUM — Event Timeline Renderer
// =============================================================================
// Renders the event timeline section of PROJECT COLISEUM dashboard.
// Each event is a timeline card with date, status badge, and content.
// Color-coded nodes reflect the action type (buy, dividend, sell, emergency).
// ES module — no side effects at import time.
// =============================================================================

import { DISPLAY_EVENTS_INITIAL } from './config.js';

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Minimal HTML escaping for interpolating user-provided strings into HTML.
 *
 * @param {string} str - Raw string to escape.
 * @returns {string} Escaped string safe for innerHTML.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/**
 * Determine the action CSS class based on event content keywords.
 *
 * @param {string} content - Event content text.
 * @param {boolean} isUrgent - Whether the event is flagged as urgent.
 * @returns {string} CSS class name: action-buy, action-div, action-sell, or emergency.
 */
function getActionClass(content, isUrgent) {
  if (isUrgent) return 'emergency';

  // Buy signals → cyan node
  if (/加碼|買|新增|進場/.test(content)) return 'action-buy';
  // Dividend signals → purple node
  if (/除息|收息|配息/.test(content)) return 'action-div';
  // Sell signals → gold node
  if (/平倉|移除|賣|停損/.test(content)) return 'action-sell';

  // Default: no action-specific class
  return '';
}

/**
 * Create a single event card DOM element.
 *
 * @param {Object} event - Event object with { date, status, content, isUrgent }.
 * @returns {HTMLElement} The event card <div>.
 */
function createEventCard(event) {
  const actionClass = getActionClass(event.content, event.isUrgent);

  const card = document.createElement('div');
  card.className = 'event-card' + (actionClass ? ' ' + actionClass : '');

  // ── Header: date + status badge ───────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'event-header';

  const dateEl = document.createElement('span');
  dateEl.className = 'event-date';
  dateEl.textContent = event.date || '';

  const statusEl = document.createElement('span');
  statusEl.className = 'event-status';
  statusEl.textContent = event.status || 'Info';

  header.appendChild(dateEl);
  header.appendChild(statusEl);

  // ── Content body ──────────────────────────────────────────────────────
  const contentEl = document.createElement('div');
  contentEl.className = 'event-content';
  contentEl.textContent = event.content || '';

  card.appendChild(header);
  card.appendChild(contentEl);

  return card;
}

/**
 * Create the "展開更多" expand button.
 *
 * @param {number} totalCount - Total number of events available.
 * @returns {HTMLElement} The expand button <button>.
 */
function createExpandButton(totalCount) {
  const btn = document.createElement('button');
  btn.className = 'events-expand-btn';
  btn.textContent = '📋 查看更多 (共 ' + totalCount + ' 筆)';
  btn.onclick = window.expandEvents;
  return btn;
}

// =============================================================================
// Global Expand Handler
// =============================================================================

/**
 * Global expand handler attached to window.
 * Removes the expand button and re-renders all events into the container.
 */
window.expandEvents = function () {
  const allData = window._allEventsData;
  if (!allData || allData.length === 0) return;

  const container = document.getElementById('eventContainer');

  // Remove the expand button (last child of container)
  const expandBtn = container && container.querySelector('.events-expand-btn');
  if (expandBtn) expandBtn.remove();

  // Render the remaining hidden events
  const visibleCount = Math.min(DISPLAY_EVENTS_INITIAL, allData.length);
  const hiddenEvents = allData.slice(visibleCount);

  hiddenEvents.forEach(function (event) {
    const card = createEventCard(event);
    container.appendChild(card);
  });

  // Clean up stored data
  delete window._allEventsData;
};

// =============================================================================
// Main Event Renderer
// =============================================================================

/**
 * Render the event timeline inside `<div id="eventContainer">`.
 *
 * Displays DISPLAY_EVENTS_INITIAL (4) events initially. If more events exist,
 * appends a "展開更多" button that reveals all remaining events on click.
 *
 * @param {Object[]} eventsData - Array of event objects, each with:
 *   - {string}  date     - Event date string.
 *   - {string}  status   - Event status / type label.
 *   - {string}  content  - Event description text.
 *   - {boolean} isUrgent - Whether the event is flagged as urgent/emergency.
 */
export function renderEvents(eventsData) {
  const container = document.getElementById('eventContainer');
  if (!container) return;

  // Store all data for the global expand handler
  window._allEventsData = eventsData || [];

  const data = eventsData || [];
  const totalCount = data.length;
  const initialCount = Math.min(DISPLAY_EVENTS_INITIAL, totalCount);

  // ── Clear container ───────────────────────────────────────────────────
  container.innerHTML = '';

  // ── Render initial events ─────────────────────────────────────────────
  for (let i = 0; i < initialCount; i++) {
    const card = createEventCard(data[i]);
    container.appendChild(card);
  }

  // ── Add expand button if there are hidden events ──────────────────────
  if (totalCount > DISPLAY_EVENTS_INITIAL) {
    const expandBtn = createExpandButton(totalCount);
    container.appendChild(expandBtn);
  }
}