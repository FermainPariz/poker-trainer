// === HUD: Live Poker Statistics Overlay ===

import { cardToSolverFormat } from './engine.js';

let worker = null;
let hudEnabled = true;
let currentEquity = '--';
let currentOuts = { count: 0, outs: [] };
let equitySeq = 0; // sequence counter to discard stale results
let equityCallback = null; // called when equity updates

// === Initialize Web Worker ===
export function initHUD() {
  worker = new Worker('./js/equity-worker.js?v=2');
  worker.onmessage = handleWorkerMessage;

  // Toggle HUD with 'h' key
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') {
      toggleHUD();
    }
  });

  // Toggle button
  const btn = document.getElementById('btnToggleHud');
  if (btn) btn.addEventListener('click', toggleHUD);
}

function handleWorkerMessage(e) {
  const data = e.data;

  // Discard stale results from previous requests
  if (data.seq !== undefined && data.seq < equitySeq) return;

  if (data.type === 'equity') {
    currentEquity = data.equity;
    updateHUDDisplay();
    if (equityCallback) equityCallback();
  }

  if (data.type === 'outs') {
    currentOuts = data;
    updateHUDDisplay();
  }
}

// === Request Equity Calculation ===
export function requestEquity(game) {
  if (!worker || !hudEnabled) return;

  const human = game.humanPlayer;
  if (human.folded || human.hand.length < 2) {
    clearHUD();
    return;
  }

  const heroHand = human.hand.map(c => c.rank + c.suit);
  const community = game.communityCards.map(c => c.rank + c.suit);
  const activeOpponents = game.players.filter(p => !p.folded && !p.sittingOut && p.id !== game.humanSeat).length;

  equitySeq++; // increment to invalidate pending results
  const seq = equitySeq;

  worker.postMessage({
    type: 'equity',
    heroHand,
    communityCards: community,
    numOpponents: activeOpponents,
    numSimulations: 3000,
    seq,
  });

  // Calculate outs on flop or turn only; clear on river
  if (community.length >= 3 && community.length < 5) {
    worker.postMessage({
      type: 'outs',
      heroHand,
      communityCards: community,
      seq,
    });
  } else if (community.length >= 5) {
    currentOuts = { count: 0, outs: [] };
    const outsEl = document.getElementById('hudOuts');
    if (outsEl) outsEl.textContent = '--';
  }
}

// === Calculate Pot Odds ===
export function getPotOdds(game) {
  const toCall = game.getCallAmount();
  if (toCall <= 0) return null;

  const pot = game.pot + game.getCurrentBetsTotal();
  const potOdds = (toCall / (pot + toCall) * 100).toFixed(1);
  const ratio = (pot / toCall).toFixed(1);

  return { potOdds, ratio, toCall, pot };
}

// === Calculate EV (Expected Value) ===
export function getEV(game) {
  const equity = parseFloat(currentEquity);
  if (isNaN(equity)) return null;

  const toCall = game.getCallAmount();
  const pot = game.pot + game.getCurrentBetsTotal();

  if (toCall <= 0) return null;

  // EV = (equity% * pot) - ((1 - equity%) * toCall)
  const ev = ((equity / 100) * (pot + toCall)) - toCall;
  return ev.toFixed(0);
}

// === Update HUD Display ===
function updateHUDDisplay() {
  const hudEl = document.getElementById('hud');
  if (!hudEl || !hudEnabled) return;

  const equityEl = document.getElementById('hudEquity');
  const outsEl = document.getElementById('hudOuts');

  if (equityEl) {
    equityEl.textContent = currentEquity !== '--' ? `${currentEquity}%` : '--';

    // Color code equity
    const eq = parseFloat(currentEquity);
    if (!isNaN(eq)) {
      if (eq >= 65) equityEl.style.color = 'var(--green)';
      else if (eq >= 45) equityEl.style.color = 'var(--gold)';
      else equityEl.style.color = 'var(--accent)';
    }
  }

  if (outsEl) {
    outsEl.textContent = currentOuts.count > 0 ? `${currentOuts.count}` : '--';
  }
}

// === Update full HUD with pot odds + EV ===
export function updateFullHUD(game) {
  if (!hudEnabled) return;

  const potOddsEl = document.getElementById('hudPotOdds');
  const evEl = document.getElementById('hudEV');
  const handStrEl = document.getElementById('hudHandStrength');

  // Pot odds
  const odds = getPotOdds(game);
  if (potOddsEl) {
    if (odds) {
      potOddsEl.textContent = `${odds.potOdds}% (${odds.ratio}:1)`;
    } else {
      potOddsEl.textContent = '--';
    }
  }

  // EV
  const ev = getEV(game);
  if (evEl) {
    if (ev !== null) {
      const evNum = parseInt(ev);
      evEl.textContent = `${evNum >= 0 ? '+' : ''}$${ev}`;
      evEl.style.color = evNum >= 0 ? 'var(--green)' : 'var(--accent)';
    } else {
      evEl.textContent = '--';
      evEl.style.color = '';
    }
  }

  // Hand strength (using pokersolver if available)
  if (handStrEl) {
    const human = game.humanPlayer;
    if (human.hand.length === 2 && game.communityCards.length >= 3 && window.Hand) {
      try {
        const allCards = [...human.hand, ...game.communityCards].map(cardToSolverFormat);
        const solved = window.Hand.solve(allCards);
        handStrEl.textContent = solved.descr || solved.name;
      } catch {
        handStrEl.textContent = '--';
      }
    } else if (human.hand.length === 2) {
      handStrEl.textContent = getPreflopLabel(human.hand);
    } else {
      handStrEl.textContent = '--';
    }
  }
}

// === Preflop hand label ===
function getPreflopLabel(hand) {
  const ranks = 'AKQJT98765432';
  const r1 = hand[0].rank, r2 = hand[1].rank;
  const suited = hand[0].suit === hand[1].suit;
  const [high, low] = ranks.indexOf(r1) < ranks.indexOf(r2) ? [r1, r2] : [r2, r1];

  if (high === low) return `Pocket ${high}${low}`;
  return `${high}${low}${suited ? 's' : 'o'}`;
}

// === Toggle ===
export function toggleHUD() {
  hudEnabled = !hudEnabled;
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.style.display = hudEnabled ? 'flex' : 'none';

  const btn = document.getElementById('btnToggleHud');
  if (btn) btn.textContent = hudEnabled ? 'HUD: AN' : 'HUD: AUS';
}

export function clearHUD() {
  currentEquity = '--';
  currentOuts = { count: 0, outs: [] };
  updateHUDDisplay();

  const potOddsEl = document.getElementById('hudPotOdds');
  const evEl = document.getElementById('hudEV');
  const handStrEl = document.getElementById('hudHandStrength');
  if (potOddsEl) potOddsEl.textContent = '--';
  if (evEl) { evEl.textContent = '--'; evEl.style.color = ''; }
  if (handStrEl) handStrEl.textContent = '--';

  // Reset GTO scoring display for new hand
  const scoreEl = document.getElementById('hudGTOScore');
  const lossEl = document.getElementById('hudEVLoss');
  const accEl = document.getElementById('hudAccuracy');
  if (scoreEl) { scoreEl.textContent = '--'; scoreEl.className = 'hud-value'; }
  if (lossEl) { lossEl.textContent = '0.00bb'; lossEl.className = 'hud-value'; }
  if (accEl) { accEl.textContent = '--'; accEl.className = 'hud-value'; }
}

export function isEnabled() { return hudEnabled; }

// === Data accessors for coach ===
export function getCurrentEquity() {
  const eq = parseFloat(currentEquity);
  return isNaN(eq) ? null : eq;
}

export function getCurrentOuts() {
  return currentOuts;
}

export function onEquityUpdate(callback) {
  equityCallback = callback;
}
