// === UI Module: 6-Max rendering ===

import { cardSuitName, cardRankDisplay, SUIT_SYMBOLS, ACTIONS } from './engine.js';

// Track which cards have been rendered to avoid re-animating
const renderedCards = new Set(); // "seat-0-Ah", "cc-2-Ts" etc.

// === Card Elements ===
export function createCardElement(card, faceDown = false, small = false, cardKey = '') {
  const el = document.createElement('div');
  el.classList.add('card');
  if (small) el.classList.add('card-sm');

  if (faceDown) {
    const back = document.createElement('div');
    back.classList.add('card-back');
    el.appendChild(back);
    return el;
  }

  const suit = cardSuitName(card);
  const rank = cardRankDisplay(card);
  const symbol = SUIT_SYMBOLS[card.suit];

  const face = document.createElement('div');
  face.classList.add('card-face', suit);

  // Skip animation if already rendered this hand
  if (cardKey && renderedCards.has(cardKey)) {
    face.classList.add('no-anim');
  } else if (cardKey) {
    renderedCards.add(cardKey);
  }

  face.innerHTML = `
    <div class="card-corner">
      <span class="card-rank">${rank}</span>
      <span class="card-suit-small">${symbol}</span>
    </div>
    <div class="card-center">${symbol}</div>
    <div class="card-corner card-corner-bottom">
      <span class="card-rank">${rank}</span>
      <span class="card-suit-small">${symbol}</span>
    </div>
  `;
  el.appendChild(face);
  return el;
}

// === Render a single seat ===
export function renderSeat(game, seatIndex) {
  const el = document.getElementById(`seat${seatIndex}`);
  const player = game.players[seatIndex];
  if (!el) return;

  // Don't render sitting-out players
  if (player.sittingOut) {
    el.innerHTML = '';
    el.style.opacity = '0.2';
    el.innerHTML = `
      <div class="player-info is-folded">
        <span class="player-name">${player.name}</span>
        <span class="player-stack" style="color: var(--text2)">Sitting Out</span>
      </div>
    `;
    return;
  }

  el.style.opacity = '1';
  const isHuman = seatIndex === game.humanSeat;
  const isCurrent = game.currentPlayerIndex === seatIndex && game.phase !== 'showdown' && game.phase !== 'idle';
  const position = game.getPosition(seatIndex);
  const isBtn = position === 'BTN' || position === 'BTN/SB';

  // Position badge class
  let posClass = '';
  if (position.includes('BTN')) posClass = 'btn-pos';
  else if (position.includes('SB')) posClass = 'sb-pos';
  else if (position.includes('BB')) posClass = 'bb-pos';

  // Cards
  const cardsHTML = document.createElement('div');
  cardsHTML.classList.add('player-cards');

  if (player.hand.length === 2) {
    if (isHuman || (game.phase === 'showdown' && !player.folded)) {
      // Show face-up
      for (let ci = 0; ci < player.hand.length; ci++) {
        const card = player.hand[ci];
        const key = `seat-${seatIndex}-${card.rank}${card.suit}`;
        const cardEl = createCardElement(card, false, !isHuman, key);
        if (game.phase === 'showdown' && !isHuman) cardEl.classList.add('card-reveal');
        cardsHTML.appendChild(cardEl);
      }
    } else if (player.folded) {
      // Folded — show greyed out backs
      for (let i = 0; i < 2; i++) {
        const cardEl = createCardElement(null, true, true);
        cardEl.classList.add('card-folded');
        cardsHTML.appendChild(cardEl);
      }
    } else {
      // Face down
      for (let i = 0; i < 2; i++) {
        cardsHTML.appendChild(createCardElement(null, true, true));
      }
    }
  }

  // Info box
  const infoClass = `player-info${isCurrent ? ' is-current' : ''}${player.folded ? ' is-folded' : ''}`;

  // Build seat HTML
  el.innerHTML = '';

  // Dealer chip
  if (isBtn) {
    const chip = document.createElement('div');
    chip.classList.add('dealer-chip');
    chip.textContent = 'D';
    el.appendChild(chip);
  }

  // Bet display
  const betEl = document.createElement('div');
  betEl.classList.add('player-bet');
  betEl.id = `bet${seatIndex}`;
  betEl.textContent = player.bet > 0 ? `$${player.bet}` : '';
  el.appendChild(betEl);

  // Action label
  const actionEl = document.createElement('div');
  actionEl.classList.add('player-action-label');
  actionEl.id = `action${seatIndex}`;
  el.appendChild(actionEl);

  // Cards
  el.appendChild(cardsHTML);

  // Info
  const infoEl = document.createElement('div');
  infoEl.className = infoClass;
  infoEl.innerHTML = `
    <span class="player-name">${player.name}${position ? ` <span class="position-badge ${posClass}">${position}</span>` : ''}</span>
    <span class="player-stack">${player.allIn ? 'ALL-IN' : '$' + player.stack.toLocaleString()}</span>
  `;
  el.appendChild(infoEl);
}

// === Render all seats ===
export function renderAllSeats(game) {
  for (let i = 0; i < game.numPlayers; i++) {
    renderSeat(game, i);
  }
}

// === Community Cards ===
export function renderCommunityCards(cards) {
  for (let i = 0; i < 5; i++) {
    const slot = document.getElementById(`cc${i}`);
    slot.innerHTML = '';
    if (i < cards.length) {
      const key = `cc-${i}-${cards[i].rank}${cards[i].suit}`;
      slot.appendChild(createCardElement(cards[i], false, false, key));
      slot.classList.remove('card-slot');
    } else {
      slot.classList.add('card-slot');
    }
  }
}

export function clearCommunityCards() {
  for (let i = 0; i < 5; i++) {
    const slot = document.getElementById(`cc${i}`);
    slot.innerHTML = '';
    slot.classList.add('card-slot');
  }
}

// === Pot + Stacks ===
export function updatePot(pot, currentBets = 0) {
  const total = pot + currentBets;
  document.getElementById('potDisplay').textContent = `Pot: $${total.toLocaleString()}`;
}

export function updateTopBar(game) {
  const human = game.humanPlayer;
  document.getElementById('stackInfo').textContent = `Stack: $${human.stack.toLocaleString()}`;
  document.getElementById('handCounter').textContent = `Hand #${game.handNumber}`;
}

export function updateBlindsInfo(sb, bb) {
  document.getElementById('blindsInfo').textContent = `Blinds: $${sb}/$${bb}`;
}

// === Action Label ===
export function showActionLabel(seatIndex, action, amount = 0) {
  const el = document.getElementById(`action${seatIndex}`);
  if (!el) return;

  el.className = 'player-action-label';

  let text;
  switch (action) {
    case ACTIONS.FOLD: text = 'Fold'; el.classList.add('fold'); break;
    case ACTIONS.CHECK: text = 'Check'; el.classList.add('check'); break;
    case ACTIONS.CALL: text = `Call $${amount}`; el.classList.add('call'); break;
    case ACTIONS.BET: text = `Bet $${amount}`; el.classList.add('bet'); break;
    case ACTIONS.RAISE: text = `Raise $${amount}`; el.classList.add('raise'); break;
    case ACTIONS.ALLIN: text = amount > 0 ? `ALL-IN $${amount}` : 'ALL-IN!'; el.classList.add('allin'); break;
    default: text = action;
  }

  el.textContent = text;
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => { el.textContent = ''; }, 4000);
}

// === Action Buttons ===
export function updateActionButtons(game) {
  const available = game.getAvailableActions();
  const callAmount = game.getCallAmount();
  const minRaise = game.getMinRaise();
  const maxRaise = game.getMaxRaise();

  const canFold = available.includes(ACTIONS.FOLD);
  document.getElementById('btnFold').disabled = !canFold;
  document.getElementById('btnFold').style.display = canFold ? '' : 'none';
  document.getElementById('btnCheck').disabled = !available.includes(ACTIONS.CHECK);
  document.getElementById('btnCall').disabled = !available.includes(ACTIONS.CALL);
  const canRaise = available.includes(ACTIONS.RAISE) || available.includes(ACTIONS.BET);
  document.getElementById('btnRaise').disabled = !canRaise;
  document.getElementById('btnAllIn').disabled = !available.includes(ACTIONS.ALLIN);

  document.getElementById('btnCheck').style.display = available.includes(ACTIONS.CHECK) ? '' : 'none';
  document.getElementById('btnCall').style.display = available.includes(ACTIONS.CALL) ? '' : 'none';

  document.getElementById('callAmount').textContent = callAmount > 0 ? `$${callAmount}` : '';

  if (canRaise) {
    const slider = document.getElementById('raiseSlider');
    slider.min = minRaise;
    slider.max = maxRaise;
    slider.value = minRaise;
    document.getElementById('raiseDisplay').textContent = `$${minRaise}`;
    document.getElementById('raiseAmount').textContent = `$${minRaise}`;
  }
}

export function getRaiseAmount() {
  return parseInt(document.getElementById('raiseSlider').value);
}

// === Show/Hide ===
export function showActionBar(show) {
  document.getElementById('actionBar').style.display = show ? 'flex' : 'none';
  if (window.fitLayout) requestAnimationFrame(window.fitLayout);
}

export function showContinueBar(show, resultText = '', resultClass = '') {
  const bar = document.getElementById('continueBar');
  const result = document.getElementById('handResult');
  bar.style.display = show ? 'flex' : 'none';
  result.textContent = resultText;
  result.className = 'hand-result ' + resultClass;
  if (window.fitLayout) requestAnimationFrame(window.fitLayout);
}

// === Message Overlay ===
export function showMessage(text, duration = 1500) {
  const overlay = document.getElementById('messageOverlay');
  const msg = document.getElementById('messageText');
  msg.textContent = text;
  overlay.style.display = 'block';
  setTimeout(() => { overlay.style.display = 'none'; }, duration);
}

// === Winner Highlight ===
export function highlightWinnerCards(seatIndex) {
  const seat = document.getElementById(`seat${seatIndex}`);
  if (!seat) return;
  for (const card of seat.querySelectorAll('.card')) {
    card.classList.add('card-winner');
  }
}

// === Reset Table ===
export function resetTable(game) {
  renderedCards.clear();
  clearCommunityCards();
  updatePot(0);
  showContinueBar(false);
  renderAllSeats(game);
}
