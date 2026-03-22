// === GTO Range Parsing & Combo Utilities ===
// Converts poker range notation (e.g. "QQ+,AKs,ATs-A9s:0.5") to Float32Array[1326]
// Compatible with postflop-solver's Range::from_raw_data format.

// Card encoding: card_id = 4 * rank + suit
// Ranks: 2=0, 3=1, ..., T=8, J=9, Q=10, K=11, A=12
// Suits: c=0, d=1, h=2, s=3

const RANK_CHARS = '23456789TJQKA';
const SUIT_CHARS = 'cdhs';
const NUM_COMBOS = 1326; // C(52,2)

// === Card ID helpers ===
export function cardId(rank, suit) {
  return 4 * rank + suit;
}

export function rankFromChar(c) {
  const i = RANK_CHARS.indexOf(c.toUpperCase());
  if (i < 0) throw new Error(`Invalid rank: ${c}`);
  return i;
}

export function suitFromChar(c) {
  const i = SUIT_CHARS.indexOf(c.toLowerCase());
  if (i < 0) throw new Error(`Invalid suit: ${c}`);
  return i;
}

export function parseCard(str) {
  return cardId(rankFromChar(str[0]), suitFromChar(str[1]));
}

// === Combo index ===
// For cards c1 < c2: standard triangular indexing matching postflop-solver
export function comboIndex(c1, c2) {
  const lo = Math.min(c1, c2);
  const hi = Math.max(c1, c2);
  return lo * 51 - (lo * (lo - 1)) / 2 + (hi - lo - 1);
}

// === Generate all combos for a hand type ===
function getCombos(rank1, rank2, suited) {
  const combos = [];
  if (rank1 === rank2) {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) {
        combos.push([cardId(rank1, s1), cardId(rank2, s2)]);
      }
    }
  } else if (suited) {
    for (let s = 0; s < 4; s++) {
      combos.push([cardId(rank1, s), cardId(rank2, s)]);
    }
  } else {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = 0; s2 < 4; s2++) {
        if (s1 !== s2) {
          combos.push([cardId(rank1, s1), cardId(rank2, s2)]);
        }
      }
    }
  }
  return combos;
}

// === Parse hand notation ===
function parseHandNotation(hand) {
  const r1 = rankFromChar(hand[0]);
  const r2 = rankFromChar(hand[1]);
  const suitChar = hand.length > 2 ? hand[2].toLowerCase() : null;
  const suited = suitChar === 's' ? true : suitChar === 'o' ? false : null;
  return {
    rank1: Math.max(r1, r2),
    rank2: Math.min(r1, r2),
    suited: r1 === r2 ? null : suited,
  };
}

// === Parse a single hand token ===
function parseToken(token, weights) {
  let weight = 1.0;
  const colonIdx = token.indexOf(':');
  if (colonIdx > 0) {
    weight = parseFloat(token.substring(colonIdx + 1));
    token = token.substring(0, colonIdx);
  }

  // Specific combo: "AsKh"
  if (token.length === 4 && SUIT_CHARS.includes(token[1].toLowerCase()) && SUIT_CHARS.includes(token[3].toLowerCase())) {
    const c1 = parseCard(token.substring(0, 2));
    const c2 = parseCard(token.substring(2, 4));
    weights[comboIndex(c1, c2)] = weight;
    return;
  }

  // Dash range: "QQ-88" or "ATs-A8s"
  if (token.includes('-')) {
    const parts = token.split('-');
    parseDashRange(parts[0], parts[1], weight, weights);
    return;
  }

  // Plus range: "TT+" or "ATs+"
  if (token.endsWith('+')) {
    parsePlusRange(token.substring(0, token.length - 1), weight, weights);
    return;
  }

  // Single hand: "AA", "AKs", "AKo"
  const { rank1, rank2, suited } = parseHandNotation(token);
  const combos = getCombos(rank1, rank2, suited);
  for (const [c1, c2] of combos) {
    weights[comboIndex(c1, c2)] = weight;
  }
}

function parsePlusRange(hand, weight, weights) {
  const { rank1, rank2, suited } = parseHandNotation(hand);
  if (rank1 === rank2) {
    for (let r = rank1; r <= 12; r++) {
      const combos = getCombos(r, r, null);
      for (const [c1, c2] of combos) weights[comboIndex(c1, c2)] = weight;
    }
  } else {
    for (let r2 = rank2; r2 < rank1; r2++) {
      const combos = getCombos(rank1, r2, suited);
      for (const [c1, c2] of combos) weights[comboIndex(c1, c2)] = weight;
    }
  }
}

function parseDashRange(startHand, endHand, weight, weights) {
  const s = parseHandNotation(startHand);
  const e = parseHandNotation(endHand);

  if (s.rank1 === s.rank2 && e.rank1 === e.rank2) {
    const hi = Math.max(s.rank1, e.rank1);
    const lo = Math.min(s.rank1, e.rank1);
    for (let r = lo; r <= hi; r++) {
      const combos = getCombos(r, r, null);
      for (const [c1, c2] of combos) weights[comboIndex(c1, c2)] = weight;
    }
  } else {
    const hi = Math.max(s.rank2, e.rank2);
    const lo = Math.min(s.rank2, e.rank2);
    for (let r2 = lo; r2 <= hi; r2++) {
      const combos = getCombos(s.rank1, r2, s.suited);
      for (const [c1, c2] of combos) weights[comboIndex(c1, c2)] = weight;
    }
  }
}

// === Parse full range string → Float32Array[1326] ===
export function parseRange(rangeStr) {
  const weights = new Float32Array(NUM_COMBOS);
  if (!rangeStr || rangeStr.trim() === '') return weights;
  const tokens = rangeStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
  for (const token of tokens) {
    parseToken(token, weights);
  }
  return weights;
}

// === Engine card ↔ Solver card conversion ===
// Engine uses: rank = '2'..'9','T','J','Q','K','A', suit = 's','h','d','c'
// Solver uses: card_id = 4 * rankIdx + suitIdx (rankIdx: 2=0..A=12, suitIdx: c=0,d=1,h=2,s=3)
const ENGINE_RANK_MAP = { '2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12 };
const ENGINE_SUIT_MAP = { c: 0, d: 1, h: 2, s: 3 };

export function engineCardToSolverId(card) {
  const rank = ENGINE_RANK_MAP[card.rank];
  const suit = ENGINE_SUIT_MAP[card.suit];
  if (rank === undefined || suit === undefined) {
    console.warn('Invalid card for solver:', card);
    return 0;
  }
  return 4 * rank + suit;
}

export function engineBoardToSolverBoard(communityCards) {
  return new Uint8Array(communityCards.map(c => engineCardToSolverId(c)));
}

export function handComboIndex(card1, card2) {
  return comboIndex(engineCardToSolverId(card1), engineCardToSolverId(card2));
}

// === Remove dead cards from range ===
export function removeDeadCards(range, deadCardIds) {
  const dead = new Set(deadCardIds);
  const result = new Float32Array(range);
  for (let c1 = 0; c1 < 52; c1++) {
    for (let c2 = c1 + 1; c2 < 52; c2++) {
      if (dead.has(c1) || dead.has(c2)) {
        result[comboIndex(c1, c2)] = 0;
      }
    }
  }
  return result;
}

// === Default ranges by position (6-max, 100bb cash) ===
export const POSITION_RANGES = {
  // RFI (Raise First In)
  UTG: 'AA-22,AKs-A2s,KQs-K9s,QJs-QTs,JTs-J9s,T9s-T8s,98s-97s,87s-86s,76s-75s,65s,54s,AKo-ATo,KQo-KJo,QJo',
  HJ:  'AA-22,AKs-A2s,KQs-K8s,QJs-Q9s,JTs-J8s,T9s-T8s,98s-97s,87s-86s,76s-75s,65s-64s,54s,43s,AKo-A9o,KQo-KTo,QJo-QTo,JTo',
  CO:  'AA-22,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s-53s,43s,AKo-A7o,KQo-K9o,QJo-Q9o,JTo-J9o,T9o',
  BTN: 'AA-22,AKs-A2s,KQs-K2s,QJs-Q5s,JTs-J6s,T9s-T6s,98s-95s,87s-84s,76s-73s,65s-62s,54s-52s,43s-42s,32s,AKo-A2o,KQo-K7o,QJo-Q8o,JTo-J8o,T9o-T8o,98o-97o,87o,76o',
  SB:  'AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s-53s,43s,AKo-A5o,KQo-K9o,QJo-Q9o,JTo-J9o,T9o',
  BB:  'AA-22,AKs-A2s,KQs-K2s,QJs-Q2s,JTs-J2s,T9s-T5s,98s-94s,87s-84s,76s-74s,65s-63s,54s-53s,43s-42s,32s,AKo-A2o,KQo-K5o,QJo-Q7o,JTo-J8o,T9o-T8o,98o-97o,87o-86o,76o-75o,65o',

  // Calling/defending ranges
  BB_vs_BTN: 'AA-22,AKs-A2s,KQs-K2s,QJs-Q4s,JTs-J5s,T9s-T6s,98s-96s,87s-85s,76s-74s,65s-63s,54s-53s,43s,AKo-A2o,KQo-K6o,QJo-Q8o,JTo-J9o,T9o,98o',
  BB_vs_CO:  'AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s-53s,43s,AKo-A5o,KQo-K9o,QJo-Q9o,JTo-J9o,T9o',
  BB_vs_UTG: 'AA-22,AKs-A4s,KQs-K9s,QJs-QTs,JTs-J9s,T9s,98s,87s,76s,65s,AKo-ATo,KQo-KJo,QJo',

  // 3-bet ranges
  '3BET_vs_UTG': 'AA-QQ,AKs,AKo',
  '3BET_vs_CO':  'AA-TT,AKs-AJs,AKo-AQo,KQs',
  '3BET_vs_BTN': 'AA-88,AKs-A8s,KQs-KTs,QJs,AKo-ATo,KQo',
};

// === Get ranges for a postflop spot ===
export function getRangesForSpot(heroPos, villainPos) {
  const posOrder = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  const heroIdx = posOrder.indexOf(heroPos);
  const villainIdx = posOrder.indexOf(villainPos);
  const heroIsIP = heroIdx > villainIdx;

  let oopStr, ipStr;
  if (heroIsIP) {
    ipStr = POSITION_RANGES[heroPos] || POSITION_RANGES.CO;
    oopStr = POSITION_RANGES[`BB_vs_${heroPos}`] || POSITION_RANGES[villainPos] || POSITION_RANGES.BB;
  } else {
    oopStr = POSITION_RANGES[heroPos] || POSITION_RANGES.BB;
    ipStr = POSITION_RANGES[villainPos] || POSITION_RANGES.BTN;
  }

  return { oopRange: parseRange(oopStr), ipRange: parseRange(ipStr), heroIsIP };
}
