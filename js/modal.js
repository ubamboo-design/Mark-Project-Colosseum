// =============================================================================
// PROJECT COLISEUM — Strategy Detail Modal
// =============================================================================
// Pure DOM manipulation module.  Populates <div id="cardModal"> with strategy
// data when a portfolio card is clicked in the dashboard.
// =============================================================================

// -----------------------------------------------------------------------------
// openStrategyModal — display a strategy's detailed information in the overlay
// -----------------------------------------------------------------------------
// @param {string}                  code          - Strategy code key
// @param {Object<string, Object>}  strategiesData - All strategies (keyed by code)
// @param {Object<string, Object>}  cardsData      - All card data (keyed by code)
// @param {Object}                  configData     - Config with ytUrl, title, etc.
// -----------------------------------------------------------------------------
export function openStrategyModal(code, strategiesData, cardsData, configData) {
  const s = strategiesData[code];
  if (!s) return;

  // ── Basic fields ──────────────────────────────────────────────────────────
  document.getElementById('mCode').textContent = s.code || '';
  document.getElementById('mSkill').textContent = s.name || '';

  // ── Budget / Invested ─────────────────────────────────────────────────────
  document.getElementById('val1').textContent = s.budget || '-';
  document.getElementById('val_invested').textContent = s.invested || '-';

  // ── Shares row is not used in the modal currently ─────────────────────────
  document.getElementById('row_shares').style.display = 'none';

  // ── YouTube link ──────────────────────────────────────────────────────────
  const ytContainer = document.getElementById('yt_container');
  const ytLink      = document.getElementById('btn_yt');
  const ytUrl       = configData && configData.ytUrl;
  if (ytUrl && ytUrl.length > 5) {
    ytLink.href = ytUrl;
    ytContainer.style.display = 'block';
  } else {
    ytContainer.style.display = 'none';
  }

  // ── Strategy (highlight) & SOP (explain) ──────────────────────────────────
  // If either is '-', inherit from the first (core) card in the deck.
  let displayStrategy = s.highlight || s.strategy;
  let displaySOP      = s.explain   || s.sop;

  if (!displayStrategy || displayStrategy === '-') {
    const coreCode = s.deck && s.deck[0];
    const coreCard = coreCode && cardsData[coreCode];
    if (coreCard && coreCard.strategy) {
      displayStrategy = coreCard.strategy + ' (Inherited)';
    }
  }

  if (!displaySOP || displaySOP === '-') {
    const coreCode = s.deck && s.deck[0];
    const coreCard = coreCode && cardsData[coreCode];
    if (coreCard && coreCard.sop) {
      displaySOP = coreCard.sop + ' (Inherited)';
    }
  }

  document.getElementById('val2').textContent = displayStrategy || '-';
  document.getElementById('val3').textContent = displaySOP || '-';

  // ── Show the modal ────────────────────────────────────────────────────────
  const modal = document.getElementById('cardModal');
  modal.style.display = 'flex';
  modal.classList.add('modal-active');
}

// -----------------------------------------------------------------------------
// closeModal — hide the strategy detail overlay
// -----------------------------------------------------------------------------
export function closeModal() {
  document.getElementById('cardModal').style.display = 'none';
}
