// === GTO Range Matrix — 13x13 grid showing strategy for every hand ===
// Color-coded: red=raise/bet, blue=call, green=check, dark=fold

import { ACTIONS, PHASES } from './engine.js';
import { getPreflopStrength } from './evaluator.js';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Preflop opening ranges by position (simplified GTO frequencies)
// Each entry: { raise: 0-100, call: 0-100, fold: 0-100 }
export const PREFLOP_RANGES = buildPreflopRanges();

function buildPreflopRanges() {
  // Base hand strength scores (0-100)
  const scores = {};
  // Pairs
  scores['AA'] = 100; scores['KK'] = 98; scores['QQ'] = 95; scores['JJ'] = 92;
  scores['TT'] = 87; scores['99'] = 82; scores['88'] = 77; scores['77'] = 72;
  scores['66'] = 67; scores['55'] = 62; scores['44'] = 57; scores['33'] = 52; scores['22'] = 47;

  // Suited hands (above diagonal in matrix)
  scores['AKs'] = 96; scores['AQs'] = 90; scores['AJs'] = 85; scores['ATs'] = 80;
  scores['A9s'] = 68; scores['A8s'] = 65; scores['A7s'] = 62; scores['A6s'] = 60;
  scores['A5s'] = 63; scores['A4s'] = 60; scores['A3s'] = 57; scores['A2s'] = 55;
  scores['KQs'] = 88; scores['KJs'] = 83; scores['KTs'] = 78; scores['K9s'] = 65;
  scores['K8s'] = 55; scores['K7s'] = 52; scores['K6s'] = 50; scores['K5s'] = 48;
  scores['K4s'] = 45; scores['K3s'] = 43; scores['K2s'] = 40;
  scores['QJs'] = 81; scores['QTs'] = 76; scores['Q9s'] = 63; scores['Q8s'] = 50;
  scores['Q7s'] = 42; scores['Q6s'] = 40; scores['Q5s'] = 38; scores['Q4s'] = 35;
  scores['Q3s'] = 33; scores['Q2s'] = 30;
  scores['JTs'] = 79; scores['J9s'] = 66; scores['J8s'] = 52; scores['J7s'] = 40;
  scores['J6s'] = 35; scores['J5s'] = 33; scores['J4s'] = 30; scores['J3s'] = 28; scores['J2s'] = 25;
  scores['T9s'] = 72; scores['T8s'] = 58; scores['T7s'] = 45; scores['T6s'] = 35;
  scores['T5s'] = 28; scores['T4s'] = 25; scores['T3s'] = 22; scores['T2s'] = 20;
  scores['98s'] = 68; scores['97s'] = 52; scores['96s'] = 40; scores['95s'] = 30;
  scores['94s'] = 22; scores['93s'] = 20; scores['92s'] = 18;
  scores['87s'] = 64; scores['86s'] = 48; scores['85s'] = 35; scores['84s'] = 25;
  scores['83s'] = 18; scores['82s'] = 15;
  scores['76s'] = 60; scores['75s'] = 44; scores['74s'] = 30; scores['73s'] = 20;
  scores['72s'] = 12;
  scores['65s'] = 56; scores['64s'] = 40; scores['63s'] = 25; scores['62s'] = 15;
  scores['54s'] = 52; scores['53s'] = 35; scores['52s'] = 20;
  scores['43s'] = 38; scores['42s'] = 18;
  scores['32s'] = 25;

  // Offsuit hands (below diagonal — roughly 10-15 points less than suited)
  scores['AKo'] = 90; scores['AQo'] = 83; scores['AJo'] = 77; scores['ATo'] = 72;
  scores['A9o'] = 55; scores['A8o'] = 50; scores['A7o'] = 47; scores['A6o'] = 44;
  scores['A5o'] = 48; scores['A4o'] = 45; scores['A3o'] = 42; scores['A2o'] = 40;
  scores['KQo'] = 80; scores['KJo'] = 74; scores['KTo'] = 68; scores['K9o'] = 50;
  scores['K8o'] = 38; scores['K7o'] = 35; scores['K6o'] = 32; scores['K5o'] = 30;
  scores['K4o'] = 28; scores['K3o'] = 25; scores['K2o'] = 22;
  scores['QJo'] = 72; scores['QTo'] = 66; scores['Q9o'] = 48; scores['Q8o'] = 35;
  scores['Q7o'] = 28; scores['Q6o'] = 25; scores['Q5o'] = 22; scores['Q4o'] = 20;
  scores['Q3o'] = 18; scores['Q2o'] = 15;
  scores['JTo'] = 70; scores['J9o'] = 50; scores['J8o'] = 36; scores['J7o'] = 25;
  scores['J6o'] = 20; scores['J5o'] = 18; scores['J4o'] = 15; scores['J3o'] = 12; scores['J2o'] = 10;
  scores['T9o'] = 58; scores['T8o'] = 42; scores['T7o'] = 30; scores['T6o'] = 20;
  scores['T5o'] = 14; scores['T4o'] = 12; scores['T3o'] = 10; scores['T2o'] = 8;
  scores['98o'] = 52; scores['97o'] = 36; scores['96o'] = 25; scores['95o'] = 16;
  scores['94o'] = 10; scores['93o'] = 8; scores['92o'] = 6;
  scores['87o'] = 48; scores['86o'] = 32; scores['85o'] = 20; scores['84o'] = 12;
  scores['83o'] = 8; scores['82o'] = 5;
  scores['76o'] = 44; scores['75o'] = 28; scores['74o'] = 16; scores['73o'] = 8; scores['72o'] = 4;
  scores['65o'] = 40; scores['64o'] = 24; scores['63o'] = 12; scores['62o'] = 5;
  scores['54o'] = 36; scores['53o'] = 20; scores['52o'] = 8;
  scores['43o'] = 22; scores['42o'] = 6;
  scores['32o'] = 10;

  return scores;
}

// Get the hand key for a matrix cell
function getCellHandKey(row, col) {
  const r1 = RANKS[row];
  const r2 = RANKS[col];
  if (row === col) return r1 + r2;           // pair
  if (row < col) return r1 + r2 + 's';       // suited (above diagonal)
  return r2 + r1 + 'o';                      // offsuit (below diagonal)
}

// Get the display label for a cell
function getCellLabel(row, col) {
  const r1 = RANKS[row];
  const r2 = RANKS[col];
  if (row === col) return r1 + r2;
  if (row < col) return r1 + r2 + 's';
  return r2 + r1 + 'o';
}

// Calculate action frequencies for a hand given position and situation
export function getHandFrequencies(handKey, position, facingRaise, score) {
  if (score === undefined) score = PREFLOP_RANGES[handKey] || 0;

  const isLate = ['BTN', 'CO', 'SB'].includes(position);
  const isMid = ['MP', 'HJ'].includes(position);
  const isBB = position === 'BB';

  // Position adjustments
  let threshold;
  if (position === 'BTN') threshold = 35;
  else if (position === 'CO') threshold = 45;
  else if (position === 'SB') threshold = 40;
  else if (isBB) threshold = 30;   // BB defends wide (already invested)
  else if (isMid) threshold = 55;
  else threshold = 65; // UTG

  if (!facingRaise) {
    // Open raise / limp / fold
    if (score >= 90) return { raise: 100, call: 0, check: 0, fold: 0 };
    if (score >= threshold + 20) return { raise: 90, call: 5, check: 0, fold: 5 };
    if (score >= threshold + 5) return { raise: 75, call: 10, check: 0, fold: 15 };
    if (score >= threshold) return { raise: 55, call: 15, check: 0, fold: 30 };
    if (score >= threshold - 10) return { raise: 25, call: 15, check: 0, fold: 60 };
    if (score >= threshold - 20) return { raise: 10, call: 10, check: 0, fold: 80 };
    return { raise: 2, call: 3, check: 0, fold: 95 };
  } else {
    // Facing raise — tighter ranges
    // BB defends much wider (already invested 1BB, getting good pot odds)
    const defThreshold = isBB ? threshold + 5 : threshold + 15;
    if (score >= 95) return { raise: 85, call: 15, check: 0, fold: 0 };  // 4-bet
    if (score >= defThreshold + 10) return { raise: 20, call: 70, check: 0, fold: 10 };
    if (score >= defThreshold) return { raise: 10, call: 55, check: 0, fold: 35 };
    if (score >= defThreshold - 10) return { raise: 5, call: 30, check: 0, fold: 65 };
    if (isBB && score >= defThreshold - 20) return { raise: 3, call: 25, check: 0, fold: 72 };
    return { raise: 2, call: 5, check: 0, fold: 93 };
  }
}

// Determine dominant action color
function getActionColor(freqs) {
  const r = freqs.raise || 0;
  const c = freqs.call || 0;
  const ch = freqs.check || 0;
  const f = freqs.fold || 0;

  // Blend colors based on frequencies
  if (r >= 70) return `rgba(233, 69, 96, ${0.3 + r / 200})`;
  if (c >= 50) return `rgba(59, 130, 246, ${0.3 + c / 200})`;
  if (ch >= 50) return `rgba(34, 197, 94, ${0.3 + ch / 200})`;
  if (f >= 80) return 'rgba(255, 255, 255, 0.04)';

  // Mixed: blend raise + call
  if (r >= 40 && c >= 20) {
    const blend = r / (r + c);
    return `rgba(${Math.round(233 * blend + 59 * (1 - blend))}, ${Math.round(69 * blend + 130 * (1 - blend))}, ${Math.round(96 * blend + 246 * (1 - blend))}, ${0.35 + (r + c) / 300})`;
  }
  if (r >= 30) return `rgba(233, 69, 96, ${0.2 + r / 300})`;
  if (c >= 30) return `rgba(59, 130, 246, ${0.2 + c / 300})`;
  if (f >= 50) return `rgba(255, 255, 255, 0.06)`;
  return 'rgba(255, 255, 255, 0.08)';
}

// === Render the 13x13 matrix ===
export function renderMatrix(game) {
  const grid = document.getElementById('matrixGrid');
  const info = document.getElementById('matrixInfo');
  if (!grid) return;

  grid.innerHTML = '';

  const human = game?.humanPlayer;
  if (!human || !game.phase) {
    info.textContent = 'Starte ein Spiel um die Range Matrix zu sehen.';
    return;
  }

  const position = game.getPosition(game.humanSeat);
  const facingRaise = game.getCallAmount() > game.bigBlind;
  const phase = game.phase;

  // Identify hero's hand for highlighting
  let heroKey = null;
  if (human.hand && human.hand.length === 2) {
    const r1 = human.hand[0].rank;
    const r2 = human.hand[1].rank;
    const suited = human.hand[0].suit === human.hand[1].suit;
    const ri1 = RANKS.indexOf(r1);
    const ri2 = RANKS.indexOf(r2);
    if (ri1 >= 0 && ri2 >= 0) {
      if (r1 === r2) heroKey = r1 + r2;
      else if (ri1 < ri2) heroKey = r1 + r2 + 's';
      else heroKey = r2 + r1 + 'o';
    }
  }

  // Build grid
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const handKey = getCellHandKey(row, col);
      const label = getCellLabel(row, col);
      const score = PREFLOP_RANGES[handKey] || 0;

      let freqs;
      if (phase === 'preflop') {
        freqs = getHandFrequencies(handKey, position, facingRaise, score);
      } else {
        // Postflop: show preflop opening range (which hands are in range)
        freqs = getHandFrequencies(handKey, position, false, score);
      }

      const cell = document.createElement('div');
      cell.className = 'matrix-cell';
      cell.textContent = label;
      cell.style.background = getActionColor(freqs);
      cell.style.color = (freqs.fold || 0) >= 80 ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.85)';

      if (handKey === heroKey) {
        cell.classList.add('is-hero');
      }

      // Tooltip
      const parts = [];
      if (freqs.raise > 0) parts.push(`Raise: ${freqs.raise}%`);
      if (freqs.call > 0) parts.push(`Call: ${freqs.call}%`);
      if (freqs.check > 0) parts.push(`Check: ${freqs.check}%`);
      if (freqs.fold > 0) parts.push(`Fold: ${freqs.fold}%`);
      cell.title = `${label}\n${parts.join(' | ')}`;

      grid.appendChild(cell);
    }
  }

  // Info text
  const phaseLabel = phase === 'preflop' ? 'Preflop' : phase.charAt(0).toUpperCase() + phase.slice(1);
  const actionLabel = facingRaise ? 'vs Raise' : 'Opening';
  info.textContent = `${phaseLabel} | ${position} | ${actionLabel}${heroKey ? ` | Deine Hand: ${heroKey}` : ''}`;
}

// === Toggle panel ===
let matrixVisible = false;

export function initMatrix() {
  const closeBtn = document.getElementById('btnCloseMatrix');
  if (closeBtn) closeBtn.addEventListener('click', () => toggleMatrix(false));
}

export function toggleMatrix(show) {
  const panel = document.getElementById('matrixPanel');
  if (!panel) return;
  matrixVisible = show !== undefined ? show : !matrixVisible;
  panel.classList.toggle('visible', matrixVisible);
}

export function isMatrixVisible() {
  return matrixVisible;
}
