// === Hand History Database ===
// Persistent storage of every hand for review, leak finding, and progression tracking.
// Uses localStorage. Caps at 500 hands (rotates oldest).

import { getPreflopStrength } from './evaluator.js';
import { PHASES } from './engine.js';
import { getCurrentUser } from './auth.js';

const STORAGE_BASE = 'pokerHandHistory';
const MAX_HANDS = 500;

let history = [];
let nextId = 1;

function storageKey() {
  const user = getCurrentUser();
  return user?.id ? `${STORAGE_BASE}_${user.id}` : STORAGE_BASE;
}

// === Initialize: load from localStorage ===
export function initHistory() {
  try {
    const key = storageKey();
    let stored = localStorage.getItem(key);

    // Migration: if user just logged in and has no user-specific data,
    // check for guest data and copy it over
    if (!stored && key !== STORAGE_BASE) {
      const guestData = localStorage.getItem(STORAGE_BASE);
      if (guestData) {
        stored = guestData;
        localStorage.setItem(key, guestData);
      }
    }

    if (stored) {
      history = JSON.parse(stored);
      nextId = history.length > 0 ? Math.max(...history.map(h => h.id)) + 1 : 1;
    }
  } catch (e) {
    console.warn('Failed to load hand history:', e);
    history = [];
  }
}

// === Save a completed hand ===
export function saveHand(game, result, analysis, streetSnapshots) {
  const human = game.players[game.humanSeat];
  const humanWon = result.winners && result.winners.some(w => w.player.id === game.humanSeat);
  const humanActions = game.handHistory.filter(a => a.player === game.humanSeat);

  // Derive situational booleans for leak finder
  const preflopActions = humanActions.filter(a => a.phase === 'preflop');
  const flopActions = humanActions.filter(a => a.phase === 'flop');
  const turnActions = humanActions.filter(a => a.phase === 'turn');
  const riverActions = humanActions.filter(a => a.phase === 'river');

  const wasPreflop3Bet = preflopActions.some(a => a.action === 'raise') &&
    game.handHistory.filter(a => a.phase === 'preflop' && (a.action === 'raise' || a.action === 'bet')).length >= 2;

  const sawFlop = game.communityCards.length >= 3 && (!human.folded || flopActions.length > 0);
  const foldedPreflop = preflopActions.some(a => a.action === 'fold') && flopActions.length === 0;

  // C-bet: did we bet the flop as preflop aggressor?
  const wasPreAggressor = preflopActions.some(a => a.action === 'raise' || a.action === 'bet');
  const cbet = wasPreAggressor && flopActions.some(a => a.action === 'bet' || a.action === 'raise');
  const couldCbet = wasPreAggressor && sawFlop && !human.folded;

  // Fold to c-bet: did opponent c-bet and we folded?
  const opponentFlopBets = game.handHistory.filter(a =>
    a.phase === 'flop' && a.player !== game.humanSeat && (a.action === 'bet' || a.action === 'raise')
  );
  const facedCbet = opponentFlopBets.length > 0;
  const foldedToCbet = facedCbet && flopActions.some(a => a.action === 'fold');

  // WTSD: did we go to showdown?
  const wentToShowdown = !human.folded && game.communityCards.length >= 5 && game.phase === PHASES.SHOWDOWN;
  const wonAtShowdown = wentToShowdown && humanWon;

  // Position
  const position = game.getPosition(game.humanSeat);

  // Preflop strength
  let preflopStrength = 'weak';
  try {
    preflopStrength = getPreflopStrength(human.hand);
  } catch { /* fallback */ }

  const record = {
    id: nextId++,
    timestamp: Date.now(),
    handNumber: game.handNumber,
    position,
    humanHand: human.hand.map(c => ({ rank: c.rank, suit: c.suit })),
    communityCards: game.communityCards.map(c => ({ rank: c.rank, suit: c.suit })),
    potSize: result.potWon || game.pot || 0,
    result: human.folded ? 'folded' : humanWon ? 'won' : 'lost',
    amountWon: humanWon ? (result.potWon || 0) : -(human.totalInvested || 0),
    totalInvested: human.totalInvested || 0,

    // Full action history
    actions: game.handHistory.map(a => ({ ...a })),
    humanActions: humanActions.map(a => ({ ...a })),

    // Per-street snapshots for replayer
    streetSnapshots: streetSnapshots || {},

    // Player info snapshot
    players: game.players.map(p => ({
      name: p.name,
      position: game.getPosition(p.id),
      hand: p.hand.map(c => ({ rank: c.rank, suit: c.suit })),
      startStack: p.stack + (p.totalInvested || 0),
      folded: p.folded,
      isHuman: p.id === game.humanSeat,
    })),

    // Derived booleans for leak finder
    derived: {
      preflopStrength,
      foldedPreflop,
      sawFlop,
      wasPreAggressor,
      was3Bet: wasPreflop3Bet,
      cbet,
      couldCbet,
      facedCbet,
      foldedToCbet,
      wentToShowdown,
      wonAtShowdown,
      vpip: !foldedPreflop && preflopActions.some(a => a.action === 'call' || a.action === 'raise' || a.action === 'bet' || a.action === 'allin'), // voluntarily put in pot (BB check is NOT vpip)
      pfr: preflopActions.some(a => a.action === 'raise' || a.action === 'bet' || a.action === 'allin'),
      limped: preflopActions.some(a => a.action === 'call') && !preflopActions.some(a => a.action === 'raise'),
    },

    // Analysis results
    analysis: analysis || [],
  };

  history.push(record);

  // Cap at MAX_HANDS
  if (history.length > MAX_HANDS) {
    history = history.slice(-MAX_HANDS);
  }

  persist();
  return record;
}

// === Capture street snapshot (call at each phase transition) ===
export function captureSnapshot(game) {
  return {
    phase: game.phase,
    pot: game.pot + game.getCurrentBetsTotal(),
    communityCards: game.communityCards.map(c => ({ rank: c.rank, suit: c.suit })),
    stacks: game.players.map(p => p.stack),
    bets: game.players.map(p => p.bet),
  };
}

// === Get all history ===
export function getHistory() {
  return history;
}

// === Get single hand ===
export function getHand(id) {
  return history.find(h => h.id === id) || null;
}

// === Get last N hands ===
export function getRecentHands(n = 20) {
  return history.slice(-n);
}

// === Get hands by filter ===
export function filterHands(filterFn) {
  return history.filter(filterFn);
}

// === Stats aggregation helpers ===
export function getAggregateStats(hands = null) {
  const h = hands || history;
  if (h.length === 0) return null;

  const total = h.length;
  const vpip = h.filter(x => x.derived.vpip).length;
  const pfr = h.filter(x => x.derived.pfr).length;
  const threeBet = h.filter(x => x.derived.was3Bet).length;
  const sawFlop = h.filter(x => x.derived.sawFlop).length;
  const limped = h.filter(x => x.derived.limped).length;

  const cbetOpps = h.filter(x => x.derived.couldCbet).length;
  const cbets = h.filter(x => x.derived.cbet).length;

  const facedCbet = h.filter(x => x.derived.facedCbet).length;
  const foldedToCbet = h.filter(x => x.derived.foldedToCbet).length;

  const wtsd = h.filter(x => x.derived.wentToShowdown).length;
  const wsd = h.filter(x => x.derived.wonAtShowdown).length;

  const won = h.filter(x => x.result === 'won').length;
  const folded = h.filter(x => x.result === 'folded').length;

  const totalPnL = h.reduce((sum, x) => sum + x.amountWon, 0);

  // Per-position stats
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const byPosition = {};
  for (const pos of positions) {
    const posHands = h.filter(x => x.position === pos);
    if (posHands.length > 0) {
      byPosition[pos] = {
        hands: posHands.length,
        vpip: (posHands.filter(x => x.derived.vpip).length / posHands.length * 100).toFixed(1),
        pfr: (posHands.filter(x => x.derived.pfr).length / posHands.length * 100).toFixed(1),
        pnl: posHands.reduce((sum, x) => sum + x.amountWon, 0),
      };
    }
  }

  return {
    totalHands: total,
    vpip: (vpip / total * 100).toFixed(1),
    pfr: (pfr / total * 100).toFixed(1),
    threeBet: total > 0 ? (threeBet / total * 100).toFixed(1) : '0.0',
    limpPct: total > 0 ? (limped / total * 100).toFixed(1) : '0.0',
    cbetPct: cbetOpps > 0 ? (cbets / cbetOpps * 100).toFixed(1) : '--',
    foldToCbetPct: facedCbet > 0 ? (foldedToCbet / facedCbet * 100).toFixed(1) : '--',
    wtsdPct: sawFlop > 0 ? (wtsd / sawFlop * 100).toFixed(1) : '--',
    wsdPct: wtsd > 0 ? (wsd / wtsd * 100).toFixed(1) : '--',
    winRate: (won / total * 100).toFixed(1),
    foldRate: (folded / total * 100).toFixed(1),
    totalPnL,
    bbPer100: total >= 10 ? (totalPnL / total * 100 / 10).toFixed(1) : '--', // assuming BB=10
    byPosition,
  };
}

// === Export as JSON ===
export function exportHistory() {
  return JSON.stringify(history, null, 2);
}

// === Clear history ===
export function clearHistory() {
  history = [];
  nextId = 1;
  persist();
}

// === Persist to localStorage ===
function persist() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(history));
  } catch (e) {
    console.warn('Failed to save hand history:', e);
  }
}
