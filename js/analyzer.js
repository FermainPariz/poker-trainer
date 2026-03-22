// === Pro-Level Post-Hand Analyzer: GTO + Exploitative Coaching ===

import { ACTIONS, PHASES } from './engine.js';
import { getPreflopStrength, evaluateHand } from './evaluator.js';

// === Load GTO ranges ===
let GTO_RANGES = null;
fetch('./data/ranges.json')
  .then(r => r.json())
  .then(data => { GTO_RANGES = data; })
  .catch(() => { console.warn('Could not load GTO ranges'); });

// === Hand notation helper ===
function handToKey(holeCards) {
  const ranks = 'AKQJT98765432';
  const r1 = holeCards[0].rank;
  const r2 = holeCards[1].rank;
  const suited = holeCards[0].suit === holeCards[1].suit;
  const [high, low] = ranks.indexOf(r1) < ranks.indexOf(r2) ? [r1, r2] : [r2, r1];
  if (high === low) return `${high}${low}`;
  return `${high}${low}${suited ? 's' : 'o'}`;
}

function handToKeyNoSuit(holeCards) {
  const ranks = 'AKQJT98765432';
  const r1 = holeCards[0].rank;
  const r2 = holeCards[1].rank;
  const suited = holeCards[0].suit === holeCards[1].suit;
  const [high, low] = ranks.indexOf(r1) < ranks.indexOf(r2) ? [r1, r2] : [r2, r1];
  if (high === low) return `${high}${low}`;
  return `${high}${low}${suited ? 's' : ''}`;
}

// === Check if hand is in GTO range for position ===
function isInGTORange(holeCards, position, rangeType = 'raise') {
  if (!GTO_RANGES) return null; // unknown
  const pos = GTO_RANGES.positions[position];
  if (!pos) return null;
  const key = handToKeyNoSuit(holeCards);
  const keyFull = handToKey(holeCards);
  const range = pos[rangeType] || pos.raise || [];
  return range.includes(key) || range.includes(keyFull);
}

// === Check if hand is in 3-bet range vs raiser position ===
function isIn3BetRange(holeCards, raiserPosition) {
  if (!GTO_RANGES) return null;
  const rangeKey = `vs_${raiserPosition}`;
  const range = GTO_RANGES['3bet_ranges']?.[rangeKey];
  if (!range) return null;
  const key = handToKeyNoSuit(holeCards);
  const keyFull = handToKey(holeCards);
  return range.includes(key) || range.includes(keyFull);
}

// === Check if 3-bet is value or bluff ===
function is3BetValue(holeCards, raiserPosition) {
  if (!GTO_RANGES?.['3bet_value']) return null;
  const rangeKey = `vs_${raiserPosition}`;
  const range = GTO_RANGES['3bet_value']?.[rangeKey];
  if (!range) return null;
  const key = handToKeyNoSuit(holeCards);
  const keyFull = handToKey(holeCards);
  return range.includes(key) || range.includes(keyFull);
}

// === Board texture analysis ===
function analyzeBoardTexture(communityCards) {
  if (!communityCards || communityCards.length < 3) return null;

  const cards = communityCards.slice(0, Math.min(communityCards.length, 5));
  const ranks = 'AKQJT98765432';
  const rankValues = cards.map(c => ranks.indexOf(c.rank));
  const suits = cards.map(c => c.suit);

  // Flush draw detection — 3+ same suit = flush possible, 2 = two-tone
  const suitCounts = {};
  suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const isTwoTone = maxSuitCount === 2; // potential flush draw with 2 suited hole cards
  const hasFlushDraw = maxSuitCount >= 3; // one card needed for flush draw
  const isMonotone = maxSuitCount >= 3 && cards.length === 3 ? maxSuitCount === 3 : maxSuitCount >= 4;
  const flushComplete = maxSuitCount >= 5;

  // Straight draw detection — sliding window: how many board ranks fall within any 5-rank window?
  // Ranks: A=0, K=1, Q=2, J=3, T=4, 9=5, 8=6, 7=7, 6=8, 5=9, 4=10, 3=11, 2=12
  // If 3+ ranks exist in a 5-rank window, straights are possible on that board.
  const uniqueRanks = [...new Set(rankValues)].sort((a, b) => a - b);
  let maxConnected = 1;
  for (let windowStart = 0; windowStart <= 8; windowStart++) { // windows: A-5, K-9, Q-8, ..., 6-2
    const windowEnd = windowStart + 4; // 5-card straight window
    const count = uniqueRanks.filter(r => r >= windowStart && r <= windowEnd).length;
    maxConnected = Math.max(maxConnected, count);
  }
  // Wheel window (A-2-3-4-5): A=0, 5=9, 4=10, 3=11, 2=12
  const wheelRanks = [0, 9, 10, 11, 12];
  const wheelCount = uniqueRanks.filter(r => wheelRanks.includes(r)).length;
  maxConnected = Math.max(maxConnected, wheelCount);
  const hasStraightDraw = maxConnected >= 3;

  // Paired board
  const rankCounts = {};
  cards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
  const isPaired = Object.values(rankCounts).some(v => v >= 2);
  const isTrips = Object.values(rankCounts).some(v => v >= 3);

  // High/low board
  const highCards = cards.filter(c => 'AKQJ'.includes(c.rank)).length;
  const isHighBoard = highCards >= 2;
  const isLowBoard = highCards === 0;

  // Wetness score (0-10)
  let wetness = 0;
  if (isTwoTone) wetness += 1;
  if (hasFlushDraw) wetness += 3;
  if (isMonotone) wetness += 2;
  if (hasStraightDraw) wetness += 3;
  if (maxConnected >= 4) wetness += 2;

  // Range advantage: high boards favor preflop raiser, low boards favor caller
  let rangeAdvantage = 'neutral';
  if (isHighBoard && !isPaired) rangeAdvantage = 'raiser'; // raiser has more Ax, Kx, Qx
  if (isLowBoard && hasStraightDraw) rangeAdvantage = 'caller'; // caller has more suited connectors, small pairs

  // Board archetype for solver-backed C-Bet strategy
  // High-Dry (A72r): Range-bet small ~80%, Low-Connected (876): Check most ~30%
  // Paired (K88): Range-bet small ~70%, Monotone: Check most, only bet with suit equity
  // High-Connected (KQJ): Selective ~45% larger sizing, Mid-Disconnected (J73): Range-bet small
  let archetype = 'neutral';
  let cbetFrequency = 50; // default
  let cbetSizing = '50%';
  if (isPaired) {
    archetype = 'paired';
    cbetFrequency = 70;
    cbetSizing = '25-33%';
  } else if (isMonotone) {
    archetype = 'monotone';
    cbetFrequency = 25;
    cbetSizing = '50-66%';
  } else if (isHighBoard && !hasStraightDraw && wetness <= 3) {
    archetype = 'high-dry';
    cbetFrequency = 80;
    cbetSizing = '25-33%';
  } else if (isHighBoard && hasStraightDraw) {
    archetype = 'high-connected';
    cbetFrequency = 45;
    cbetSizing = '66-75%';
  } else if (isLowBoard && hasStraightDraw) {
    archetype = 'low-connected';
    cbetFrequency = 30;
    cbetSizing = '66-75%';
  } else if (isLowBoard && !hasStraightDraw) {
    archetype = 'low-disconnected';
    cbetFrequency = 55;
    cbetSizing = '33-50%';
  } else {
    archetype = 'mid-disconnected';
    cbetFrequency = 65;
    cbetSizing = '25-33%';
  }

  return {
    isPaired,
    isTrips,
    isMonotone,
    isTwoTone,
    hasFlushDraw,
    hasStraightDraw,
    flushComplete,
    isHighBoard,
    isLowBoard,
    wetness,
    isDry: wetness <= 2,
    isWet: wetness >= 5,
    highCards,
    maxSuitCount,
    maxConnected,
    rangeAdvantage,
    archetype,
    cbetFrequency,
    cbetSizing,
    description: describeBoard(wetness, isPaired, isMonotone, isHighBoard, isLowBoard, hasStraightDraw),
  };
}

function describeBoard(wetness, isPaired, isMonotone, isHighBoard, isLowBoard, hasStraightDraw) {
  const parts = [];
  if (isMonotone) parts.push('Monotone');
  else if (wetness >= 5) parts.push('Wet');
  else if (wetness <= 2) parts.push('Dry');
  else parts.push('Semi-wet');
  if (isPaired) parts.push('Paired');
  if (isHighBoard) parts.push('High');
  if (isLowBoard) parts.push('Low');
  if (hasStraightDraw) parts.push('Connected');
  return parts.join(', ');
}

// === Opponent profiling ===
function getOpponentProfile(game, opponentIndex) {
  const p = game.players[opponentIndex];
  if (!p) return null;
  // AI players have aiPlayer property
  if (p.aiPlayer) {
    const prof = p.aiPlayer.profile;
    return {
      name: p.name,
      style: prof.style,
      bluffRate: prof.bluffRate,
      foldToRaiseRate: prof.foldToRaiseRate,
      raiseRate: prof.raiseRate,
      callRate: prof.preflopCallRate,
    };
  }
  return { name: p.name, style: 'Unknown', bluffRate: 0.15, foldToRaiseRate: 0.35, raiseRate: 0.3, callRate: 0.4 };
}

// === SPR calculation ===
function calculateSPR(effectiveStack, potSize) {
  if (potSize <= 0) return Infinity;
  return effectiveStack / potSize;
}

// === Bet sizing analysis ===
function analyzeBetSizing(betAmount, potSize) {
  if (potSize <= 0 || betAmount <= 0) return { ratio: 0, label: '', quality: 'ok' };
  const ratio = betAmount / potSize;
  let label, quality;
  if (ratio < 0.25) { label = 'Sehr klein'; quality = 'warning'; }
  else if (ratio < 0.38) { label = 'Klein (1/3 Pot)'; quality = 'ok'; }
  else if (ratio < 0.55) { label = 'Medium (40-50% Pot)'; quality = 'good'; }
  else if (ratio < 0.72) { label = 'Standard (2/3 Pot)'; quality = 'good'; }
  else if (ratio < 0.85) { label = 'Stark (3/4 Pot)'; quality = 'good'; }
  else if (ratio <= 1.1) { label = 'Pot-Size'; quality = 'ok'; }
  else { label = 'Overbet'; quality = 'polarized'; }
  return { ratio, label, quality };
}

// === Draw detection on hole cards + board ===
function detectDraws(holeCards, communityCards) {
  if (!communityCards || communityCards.length < 3) return { hasFlushDraw: false, hasStraightDraw: false, hasOvercards: false };

  const allCards = [...holeCards, ...communityCards];
  const boardCards = communityCards;
  const ranks = 'AKQJT98765432';

  // Flush draw: 4 cards of same suit including at least one hole card
  const suitCounts = {};
  allCards.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const holeSuits = holeCards.map(c => c.suit);
  let hasFlushDraw = false;
  let hasFlush = false;
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count >= 4 && holeSuits.includes(suit)) hasFlushDraw = true;
    if (count >= 5 && holeSuits.includes(suit)) hasFlush = true;
  }
  if (hasFlush) hasFlushDraw = false; // already made

  // Straight draw detection: OESD or gutshot
  // Aces can be high (14) or low (1) for wheel draws (A2345)
  const allRankValues = allCards.map(c => 14 - ranks.indexOf(c.rank));
  const boardRankValues = boardCards.map(c => 14 - ranks.indexOf(c.rank));
  const holeRankValues = holeCards.map(c => 14 - ranks.indexOf(c.rank));
  // Duplicate aces as value 1 for wheel straight detection
  if (allRankValues.includes(14)) allRankValues.push(1);
  if (holeRankValues.includes(14)) holeRankValues.push(1);
  const uniqueAll = [...new Set(allRankValues)].sort((a, b) => a - b);

  let hasStraightDraw = false;
  let hasOESD = false;
  let hasGutshot = false;
  // Check windows of 5 for straight possibilities
  for (let i = 0; i <= uniqueAll.length - 4; i++) {
    const window5 = uniqueAll.filter(v => v >= uniqueAll[i] && v <= uniqueAll[i] + 4);
    const holeInWindow = holeRankValues.some(v => v >= uniqueAll[i] && v <= uniqueAll[i] + 4);
    if (window5.length >= 4 && holeInWindow) {
      hasStraightDraw = true;
      if (window5.length === 4) {
        const span = window5[window5.length - 1] - window5[0];
        if (span === 3) hasOESD = true;
        else hasGutshot = true;
      }
    }
  }

  // Overcards
  const boardMax = Math.max(...boardRankValues);
  const hasOvercards = holeRankValues.filter(v => v > boardMax).length >= 1;
  const hasTwoOvercards = holeRankValues.filter(v => v > boardMax).length >= 2;

  // Combo draw
  const isComboDraws = hasFlushDraw && hasStraightDraw;

  // Nut flush draw detection: is our flush draw to the ace?
  let isNutFlushDraw = false;
  if (hasFlushDraw) {
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count >= 4 && holeSuits.includes(suit)) {
        // Check if we have the ace of this suit
        const hasAceOfSuit = holeCards.some(c => c.suit === suit && c.rank === 'A');
        if (hasAceOfSuit) isNutFlushDraw = true;
      }
    }
  }

  // Reverse implied odds: non-nut draws can make second-best hands
  const hasReverseImpliedOdds = (hasFlushDraw && !isNutFlushDraw);

  return { hasFlushDraw, hasStraightDraw, hasOESD, hasGutshot, hasOvercards, hasTwoOvercards, isComboDraws, isNutFlushDraw, hasReverseImpliedOdds };
}

// === Pair sub-category analysis ===
// Returns: 'overpair', 'top_pair_good_kicker', 'top_pair_weak_kicker', 'middle_pair', 'bottom_pair', 'underpair', or null
function analyzePairStrength(holeCards, communityCards, evalResult) {
  if (!evalResult || evalResult.strength !== 1) return null; // only for one-pair hands
  if (!communityCards || communityCards.length < 3) return null;

  const ranks = 'AKQJT98765432';
  const holeRanks = holeCards.map(c => ranks.indexOf(c.rank));
  const boardRanks = communityCards.map(c => ranks.indexOf(c.rank));
  const boardMin = Math.min(...boardRanks); // highest card = lowest index
  const boardMax = Math.max(...boardRanks); // lowest card = highest index
  const boardSorted = [...boardRanks].sort((a, b) => a - b);

  // Check for pocket pair (overpair or underpair)
  if (holeRanks[0] === holeRanks[1]) {
    const pairRank = holeRanks[0];
    if (pairRank < boardMin) return 'overpair'; // pair higher than all board cards
    if (pairRank > boardMax) return 'underpair'; // pair lower than all board cards
    return 'middle_pair'; // pair between board cards
  }

  // Check which hole card pairs with the board
  const pairedHoleCards = holeCards.filter(c => communityCards.some(bc => bc.rank === c.rank));
  if (pairedHoleCards.length === 0) return null;

  const pairedRank = ranks.indexOf(pairedHoleCards[0].rank);

  // Is it top pair?
  if (pairedRank === boardMin) {
    // Kicker quality: the other hole card
    const kicker = holeCards.find(c => c !== pairedHoleCards[0]);
    const kickerRank = ranks.indexOf(kicker.rank);
    // Good kicker: A, K, Q (top 3 ranks = index 0, 1, 2)
    return kickerRank <= 2 ? 'top_pair_good_kicker' : 'top_pair_weak_kicker';
  }

  // Is it bottom pair?
  if (pairedRank === boardMax) return 'bottom_pair';

  // Otherwise middle pair
  return 'middle_pair';
}

function pairLabel(pairType) {
  const labels = {
    overpair: 'Overpair',
    top_pair_good_kicker: 'Top Pair (starker Kicker)',
    top_pair_weak_kicker: 'Top Pair (schwacher Kicker)',
    middle_pair: 'Middle Pair',
    bottom_pair: 'Bottom Pair',
    underpair: 'Underpair',
  };
  return labels[pairType] || 'Pair';
}

// === Set vs Trips distinction ===
// Set = pocket pair + one board card matches (hidden, much stronger)
// Trips = one hole card + board pair (visible, weaker — reverse implied odds)
function analyzeThreeOfAKind(holeCards, communityCards, evalResult) {
  if (!evalResult || evalResult.strength !== 3) return null;
  if (!communityCards || communityCards.length < 3) return null;

  const isPocketPair = holeCards[0].rank === holeCards[1].rank;
  const boardHasPair = (() => {
    const rankCounts = {};
    communityCards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
    return Object.values(rankCounts).some(v => v >= 2);
  })();

  if (isPocketPair && !boardHasPair) {
    return 'set'; // Pocket pair hit — hidden, disguised, very strong
  }
  if (!isPocketPair && boardHasPair) {
    return 'trips'; // Board pair + hole card — visible, reverse implied odds
  }
  return 'set'; // edge case fallback
}

function threeOfAKindLabel(type) {
  return type === 'set' ? 'Set' : 'Trips';
}

// === Main analysis function ===
// solverData: optional array of { phase, action, gtoFreqs, isSolverBased, score } per decision
export function analyzeHand(game, handHistory, result, solverData = []) {
  const feedback = [];
  const humanSeat = game.humanSeat;
  const humanActions = handHistory.filter(h => h.player === humanSeat);
  const human = game.players[humanSeat];

  if (humanActions.length === 0) return feedback;

  const handStrength = human.hand.length === 2 ? getPreflopStrength(human.hand) : null;
  const position = game.getPosition(humanSeat);
  const isLatePosition = ['BTN', 'CO', 'BTN/SB'].includes(position);
  const isBlind = ['SB', 'BB'].includes(position);
  const handKey = human.hand.length === 2 ? handToKey(human.hand) : '';

  // Identify active opponents and their profiles
  const opponents = [];
  for (let i = 0; i < game.players.length; i++) {
    if (i !== humanSeat && !game.players[i].sittingOut) {
      opponents.push({ index: i, profile: getOpponentProfile(game, i) });
    }
  }

  // Track raiser info and callers for squeeze detection
  const preflopHistory = handHistory.filter(h => h.phase === PHASES.PREFLOP);
  const raiserInfo = findFirstRaiser(preflopHistory, humanSeat, game);

  // Count callers between raiser and hero (squeeze detection)
  let callersBefore = 0;
  if (raiserInfo) {
    let afterRaiser = false;
    for (const h of preflopHistory) {
      if (h.player === raiserInfo.player) { afterRaiser = true; continue; }
      if (h.player === humanSeat) break;
      if (afterRaiser && h.action === ACTIONS.CALL) callersBefore++;
    }
  }

  // Was human the preflop raiser? (important for C-bet analysis)
  const humanWasPFR = preflopHistory.some(h =>
    h.player === humanSeat && (h.action === ACTIONS.RAISE || h.action === ACTIONS.BET)
  );

  // Count players remaining at each phase (multiway detection)
  const playersInHand = game.players.filter(p => !p.sittingOut && !p.folded).length;

  // Is human in position? (acted last preflop = later position vs remaining opponents)
  const humanHasPosition = isLatePosition && !isBlind;

  let solverIdx = 0;
  for (const action of humanActions) {
    // Match solver data by index (each human action has corresponding solver entry)
    const solverEntry = solverData[solverIdx] || null;
    solverIdx++;
    const analysis = analyzeAction(action, game, handHistory, result, {
      handStrength, position, isLatePosition, isBlind, human, handKey,
      opponents, raiserInfo, callersBefore, humanWasPFR, playersInHand, humanHasPosition,
      solverEntry,
    });
    if (analysis) feedback.push(analysis);
  }

  const overall = overallAssessment(humanActions, game, result, {
    handStrength, position, isLatePosition, opponents,
  });
  if (overall) feedback.push(overall);

  return feedback;
}

// === Find first raiser before human ===
function findFirstRaiser(preflopHistory, humanSeat, game) {
  for (const h of preflopHistory) {
    if (h.player === humanSeat) break;
    if (h.action === ACTIONS.RAISE || h.action === ACTIONS.BET || h.action === ACTIONS.ALLIN) {
      return {
        player: h.player,
        position: game.getPosition(h.player),
        profile: getOpponentProfile(game, h.player),
        amount: h.amount,
      };
    }
  }
  return null;
}

// === Route to phase-specific analysis ===
function analyzeAction(action, game, history, result, ctx) {
  let analysis;
  if (action.phase === PHASES.PREFLOP) {
    analysis = analyzePreflopAction(action, game, history, ctx);
  } else {
    analysis = analyzePostflopAction(action, game, history, result, ctx);
  }

  // Append solver context to postflop analysis when available
  if (analysis && ctx.solverEntry && ctx.solverEntry.isSolverBased && ctx.solverEntry.gtoFreqs) {
    const freqs = ctx.solverEntry.gtoFreqs;
    const entries = Object.entries(freqs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const freqStr = entries.map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)} ${v}%`).join(', ');
      analysis.message += ` [Solver: ${freqStr}]`;
      // Upgrade analysis if solver confirms it was a mistake
      if (ctx.solverEntry.score && ctx.solverEntry.score.classification === 'blunder') {
        analysis.type = 'error';
      }
    }
  }

  return analysis;
}

// ================================================================
//  PREFLOP ANALYSIS — GTO Range + Position + Opponent Aware
// ================================================================
function analyzePreflopAction(action, game, history, ctx) {
  const { action: act, amount } = action;
  const { handStrength, position, isLatePosition, isBlind, human, handKey, raiserInfo, callersBefore } = ctx;

  const raisesBefore = history.filter(h =>
    h.phase === PHASES.PREFLOP &&
    h.player !== game.humanSeat &&
    (h.action === ACTIONS.RAISE || h.action === ACTIONS.BET || h.action === ACTIONS.ALLIN)
  ).length;

  const inGTORange = isInGTORange(human.hand, position);
  const in3BetRange = raiserInfo ? isIn3BetRange(human.hand, raiserInfo.position) : null;

  // === FOLD ANALYSIS ===
  if (act === ACTIONS.FOLD) {
    // Facing 3-bet after hero opened — fold analysis
    const { humanWasPFR: heroWasPFR } = ctx;
    if (heroWasPFR && raisesBefore >= 1) {
      if (handStrength === 'premium') {
        return {
          phase: 'Preflop', type: 'error',
          title: 'Premium gegen 3-Bet gefoldet!',
          message: `${handKey} gegen 3-Bet folden ist ein schwerer Fehler. Du hast eine der stärksten Hände — 4-Bet oder Call.`,
          tip: 'AA/KK: IMMER 4-bet oder Call. QQ/JJ: mindestens callen, oft 4-betten.',
        };
      }
      if (handStrength === 'strong') {
        return {
          phase: 'Preflop', type: 'warning',
          title: 'Starke Hand gegen 3-Bet gefoldet',
          message: `${handKey} gegen 3-Bet folden. Hände wie TT, AQs, AKo sind stark genug für einen Call oder 4-Bet.`,
          tip: isLatePosition
            ? 'In Position: Call gegen 3-Bet mit TT+, AQs+. Postflop Skill-Vorteil nutzen.'
            : 'OOP: 4-Bet oder Fold ist oft besser als Flat — aber mit AK/TT+ nicht folden.',
        };
      }
      // Folding playable/weak hands against 3-bet is correct
      if (handStrength === 'playable' || handStrength === 'weak') {
        return {
          phase: 'Preflop', type: 'success',
          title: 'Korrekt gegen 3-Bet gefoldet',
          message: `${handKey} gegen 3-Bet folden ist richtig. ${handKey} hat nicht genug Equity für den vergrößerten Pot.`,
          tip: 'Gegen 3-Bets: Nur mit Top-Range weiterspielen (TT+, AQs+, AKo). Rest aufgeben.',
        };
      }
    }

    // Folded a hand that's in our GTO opening range
    if (raisesBefore === 0 && inGTORange === true) {
      return {
        phase: 'Preflop', type: 'error',
        title: 'GTO-Hand gefoldet',
        message: `${handKey} gehoert zur Standard-Opening-Range aus ${position}. Du solltest hier raisen.`,
        tip: `Aus ${position} kannst du laut GTO ca. ${getRangePercent(position)}% der Hände oeffnen.`,
      };
    }
    // Folded premium/strong to a raise
    if (raisesBefore > 0 && (handStrength === 'premium' || handStrength === 'strong')) {
      return {
        phase: 'Preflop', type: 'error',
        title: 'Starke Hand gegen Raise gefoldet',
        message: `${handKey} ist stark genug um gegen einen Raise zu spielen — mindestens callen, oft 3-betten.`,
        tip: handStrength === 'premium'
          ? 'Premium Hände (AA-JJ, AKs) fast nie preflop folden.'
          : 'Starke Hände in Position callen, manchmal 3-betten.',
      };
    }
    // Folded a hand in 3-bet range
    if (raisesBefore === 1 && in3BetRange === true) {
      return {
        phase: 'Preflop', type: 'warning',
        title: '3-Bet Hand gefoldet',
        message: `${handKey} ist in der 3-Bet Range vs. ${raiserInfo.position}-Open. Du könntest hier 3-betten oder callen.`,
        tip: `Gegen ${raiserInfo.profile?.name || 'Gegner'} (${raiserInfo.profile?.style || '?'}) ist ein 3-Bet hier profitabel.`,
      };
    }
    // Folded BB with good odds — adjust defense range by raise sizing
    if (position === 'BB' && raisesBefore === 1) {
      const bbDefendRange = GTO_RANGES?.positions?.BB?.defend_vs_raise || [];
      const key = handToKeyNoSuit(human.hand);
      const keyFull = handToKey(human.hand);
      const isInDefendRange = bbDefendRange.includes(key) || bbDefendRange.includes(keyFull);
      // Scale defense by raise size: vs 2x defend ~65%, vs 3x ~50%, vs 4x+ ~35%
      const raiseSize = amount ? amount / game.bigBlind : 2.5;
      const raiseIsLarge = raiseSize >= 3.5;
      if (isInDefendRange && !raiseIsLarge) {
        return {
          phase: 'Preflop', type: 'warning',
          title: 'BB Defense verpasst',
          message: `${handKey} ist in der BB-Defend-Range vs. Standard-Raise (${raiseSize.toFixed(1)}x). Du bekommst gute Pot Odds.`,
          tip: 'Im BB verteidigst du ca. 55% deiner Hände gegen einen Standard-Raise (2-2.5x BB).',
        };
      }
      if (isInDefendRange && raiseIsLarge) {
        // Large raise — only defend top of range, don't flag marginal folds
        if (handStrength === 'premium' || handStrength === 'strong') {
          return {
            phase: 'Preflop', type: 'warning',
            title: 'Starke Hand im BB gefoldet',
            message: `${handKey} gegen ${raiseSize.toFixed(1)}x Raise folden. Auch gegen grosse Raises: starke Hände verteidigen.`,
            tip: 'Gegen grosse Raises (3.5x+): Defend-Range schrumpft auf ~35-40%. Premium/Strong Hände trotzdem spielen.',
          };
        }
        // Marginal hand vs large raise — fold is acceptable
      }
    }
    // Correctly folded trash — no feedback needed
    return null;
  }

  // === SB LIMP (completing from SB without raising) ===
  if (act === ACTIONS.CALL && raisesBefore === 0 && position === 'SB') {
    return {
      phase: 'Preflop', type: 'warning',
      title: 'SB Limp — Raise or Fold',
      message: `${handKey} im SB nur gecompletet. Im 6-Max ist die SB-Strategie: Raise oder Fold.`,
      tip: inGTORange === true
        ? `${handKey} ist in der SB-Opening-Range — raise auf 3x BB statt zu limpen.`
        : `${handKey} ist zu schwach für den SB — fold statt limpen. Limpen baut einen kleinen Pot OOP.`,
    };
  }

  // === LIMP (call preflop without a raise) ===
  if (act === ACTIONS.CALL && raisesBefore === 0 && !isBlind) {
    if (handStrength === 'premium' || handStrength === 'strong') {
      return {
        phase: 'Preflop', type: 'warning',
        title: 'Limp statt Raise',
        message: `${handKey} ist zu stark zum Limpen. Ein Raise gibt dir Initiative und baut den Pot.`,
        tip: 'In 6-Max gibt es keine Limping-Strategie. Raise or Fold.',
      };
    }
    if (inGTORange === true) {
      return {
        phase: 'Preflop', type: 'warning',
        title: 'Open-Limp',
        message: `${handKey} aus ${position} — wenn du spielst, dann raise. Limpen macht dich vorhersehbar.`,
        tip: 'GTO-Strategie in 6-Max: Raise First In oder Fold. Kein Limp.',
      };
    }
    return null;
  }

  // === CALL vs RAISE (facing action) ===
  if (act === ACTIONS.CALL && raisesBefore > 0) {
    // Facing a 3-bet after hero opened (hero was PFR, opponent re-raised)
    const { humanWasPFR } = ctx;
    if (humanWasPFR && raisesBefore >= 1) {
      // Hero opened, got 3-bet, now calling
      if (handStrength === 'premium') {
        return {
          phase: 'Preflop', type: 'success',
          title: 'Call der 3-Bet mit Premium',
          message: `${handKey} gegen 3-Bet callen — solide Linie. Alternativ: 4-Bet für maximalen Value.`,
          tip: 'AA/KK: 4-Bet ist Standard. QQ/AKs: Call oder 4-Bet — beide Optionen sind GTO-korrekt.',
        };
      }
      if (handStrength === 'strong') {
        return {
          phase: 'Preflop', type: 'success',
          title: 'Call der 3-Bet in Position',
          message: `${handKey} gegen 3-Bet callen. In Position kannst du postflop deinen Skill-Vorteil nutzen.`,
          tip: isLatePosition
            ? 'IP gegen 3-Bet: Call mit TT-JJ, AQs, KQs. Postflop Set-Mining und gute Playability.'
            : 'OOP gegen 3-Bet: Weniger Flat-Calls, mehr 4-Bet-or-Fold. Die fehlende Position kostet Equity.',
        };
      }
      if (handStrength === 'playable') {
        if (isLatePosition) {
          return {
            phase: 'Preflop', type: 'info',
            title: 'Marginaler 3-Bet Call',
            message: `${handKey} gegen 3-Bet callen ist grenzwertig. Du brauchst gute Implied Odds und Position.`,
            tip: 'Suited Connectors und kleine Pairs (Set-Mining) koennen profitabel sein bei tiefen Stacks. Ansonsten Fold.',
          };
        }
        return {
          phase: 'Preflop', type: 'warning',
          title: 'Zu loose 3-Bet Call',
          message: `${handKey} OOP gegen 3-Bet callen ist unprofitabel. Du spielst einen vergrößerten Pot ohne Position.`,
          tip: 'OOP gegen 3-Bet: Fold die meisten Hände. Nur 4-Bet (Value/Bluff) oder Call mit Top-Range.',
        };
      }
      if (handStrength === 'weak') {
        return {
          phase: 'Preflop', type: 'error',
          title: 'Schwache Hand gegen 3-Bet gecallt',
          message: `${handKey} gegen 3-Bet callen ist ein Leak. Schwache Hände haben nicht genug Equity für den grossen Pot.`,
          tip: 'Gegen 3-Bets: Nur mit Top 15-20% der Hände weiterspielen. Rest folden.',
        };
      }
    }

    // Calling with premium — should 3-bet
    if (handStrength === 'premium' && raisesBefore === 1) {
      const raiserStyle = raiserInfo?.profile?.style || '';
      // Against fish/maniac, calling to trap can be okay
      if (raiserStyle === 'Loose-Passive' || raiserStyle === 'Maniac') {
        return {
          phase: 'Preflop', type: 'info',
          title: 'Flat Call mit Premium',
          message: `Call mit ${handKey} gegen ${raiserInfo.profile.name} (${raiserStyle}). Flat-Call gegen loose Spieler kann okay sein um sie im Pot zu halten.`,
          tip: '3-Bet ist Standard, aber gegen Spieler die zu viel callen kann Flat profitabler sein.',
        };
      }
      return {
        phase: 'Preflop', type: 'warning',
        title: '3-Bet verpasst',
        message: `${handKey} ist eine klare 3-Bet gegen ${raiserInfo?.position || 'den Raise'}. Flat-Call verschenkt Value.`,
        tip: 'Premium Hände 3-betten für Value — du willst den Pot vergrößern.',
      };
    }
    // Calling in position with playable hand — good
    if (isLatePosition && (handStrength === 'strong' || handStrength === 'playable')) {
      return {
        phase: 'Preflop', type: 'success',
        title: 'Guter Call in Position',
        message: `${handKey} in Position gegen den Raise callen — solides Spiel. Du hast Positionsvorteil postflop.`,
        tip: null,
      };
    }
    // Calling OOP with marginal hand
    if (!isLatePosition && !isBlind && handStrength === 'playable') {
      return {
        phase: 'Preflop', type: 'info',
        title: 'Marginaler Call OOP',
        message: `${handKey} ohne Position gegen den Raise callen ist grenzwertig. Überlege ob 3-Bet oder Fold nicht besser wäre.`,
        tip: 'Out of Position: 3-Bet oder Fold ist oft besser als Flat-Call.',
      };
    }
    return null;
  }

  // === RAISE / BET (aggressive action) ===
  if (act === ACTIONS.RAISE || act === ACTIONS.BET) {
    // Open raise
    if (raisesBefore === 0) {
      if (inGTORange === true) {
        // Check bet sizing
        const sizing = amount ? analyzeBetSizing(amount, game.bigBlind * 2) : null;
        const bbMultiple = amount ? amount / game.bigBlind : 0;
        let sizingTip = null;
        // Count limpers for sizing adjustment
        const limperCount = history.filter(h =>
          h.phase === PHASES.PREFLOP && h.player !== game.humanSeat && h.action === ACTIONS.CALL
        ).length;
        const idealSize = (isLatePosition ? 2.2 : 2.5) + limperCount;
        if (bbMultiple > 0 && bbMultiple < idealSize - 0.5) {
          sizingTip = `Dein Raise (${bbMultiple.toFixed(1)}x BB) ist zu klein. Standard: ${idealSize.toFixed(1)}x BB${limperCount > 0 ? ` (+1x pro Limper)` : ''}.`;
        } else if (bbMultiple > idealSize + 1.5) {
          sizingTip = `Dein Raise (${bbMultiple.toFixed(1)}x BB) ist sehr gross. Standard: ${idealSize.toFixed(1)}x BB${limperCount > 0 ? ` (+1x pro Limper)` : ''}.`;
        }
        return {
          phase: 'Preflop', type: 'success',
          title: 'Standard Open-Raise',
          message: `${handKey} aus ${position} — korrekt nach GTO.`,
          tip: sizingTip,
        };
      }
      if (inGTORange === false) {
        if (isLatePosition) {
          return {
            phase: 'Preflop', type: 'info',
            title: 'Steal-Raise',
            message: `${handKey} ist nicht in der Standard-Range für ${position}, aber Steals aus später Position sind profitabel.`,
            tip: 'Achte auf die Spieler in den Blinds — gegen tight Spieler steale oefter, gegen loose Spieler weniger.',
          };
        }
        return {
          phase: 'Preflop', type: 'warning',
          title: 'Zu loose aus frueher Position',
          message: `${handKey} ist nicht in der ${position}-Opening-Range. Aus frueher Position solltest du tighter spielen.`,
          tip: `GTO-Range für ${position} ist ca. ${getRangePercent(position)}%. ${handKey} liegt ausserhalb.`,
        };
      }
      // GTO range unknown, fall back to hand strength
      if (handStrength === 'premium' || handStrength === 'strong' || handStrength === 'playable') {
        return { phase: 'Preflop', type: 'success', title: 'Guter Raise', message: `Open-Raise mit ${handKey} aus ${position}.`, tip: null };
      }
      return null;
    }

    // 3-Bet (raise vs raise) — includes squeeze detection
    if (raisesBefore === 1) {
      const isSqueeze = callersBefore >= 1;

      if (in3BetRange === true) {
        const isValue = is3BetValue(human.hand, raiserInfo?.position);
        const betType = isValue ? 'Value' : 'Bluff';
        const tip4bet = isValue
          ? 'Value-3-Bet: Bei einer 4-Bet callen oder 5-bet All-In gehen.'
          : 'Bluff-3-Bet: Bei einer 4-Bet aufgeben (Fold). Nicht zu viel investieren.';
        return {
          phase: 'Preflop', type: 'success',
          title: isSqueeze ? `Guter Squeeze (${betType})` : `Gute 3-Bet (${betType})`,
          message: isSqueeze
            ? `Squeeze mit ${handKey} — Raise + ${callersBefore} Caller. Dead Money macht das sehr profitabel.`
            : `3-Bet mit ${handKey} gegen ${raiserInfo?.position || 'Open'} — korrekt nach GTO (${betType === 'Value' ? 'Value-Hand' : 'Bluff mit Blocker-Wirkung'}).`,
          tip: isSqueeze
            ? `Squeeze-Sizing: 4x Open + 1x pro Caller = ~${4 + callersBefore}x. Caller haben gecappte Ranges und folden oft.`
            : `${tip4bet}${raiserInfo?.profile ? ` Gegen ${raiserInfo.profile.name} (${raiserInfo.profile.style}): ${get3BetAdvice(raiserInfo.profile)}` : ''}`,
        };
      }
      if (in3BetRange === false) {
        // Squeeze spot with a weaker hand — still might be profitable due to dead money
        if (isSqueeze && (handStrength === 'playable' || handStrength === 'strong')) {
          return {
            phase: 'Preflop', type: 'info',
            title: 'Squeeze-Play',
            message: `Squeeze mit ${handKey} — ${callersBefore} Caller haben gecappte Ranges. ${handKey} ist nicht in der Standard-3-Bet Range, aber Dead Money macht den Squeeze profitabel.`,
            tip: `Squeeze-Sizing: 4x Open + 1x pro Caller. Caller müssen mehr Hände folden als direkt gegen eine 3-Bet.`,
          };
        }
        if (handStrength === 'playable' && isLatePosition) {
          return {
            phase: 'Preflop', type: 'info',
            title: 'Light 3-Bet',
            message: `${handKey} ist nicht in der Standard-3-Bet-Range vs. ${raiserInfo?.position}, aber als Light-3-Bet in Position vertretbar.`,
            tip: 'Light 3-Bets funktionieren am besten gegen Spieler die zu viel folden. Sei bereit aufzugeben bei einer 4-Bet.',
          };
        }
        if (handStrength === 'weak') {
          return {
            phase: 'Preflop', type: 'warning',
            title: 'Zu loose 3-Bet',
            message: `${handKey} ist zu schwach für eine 3-Bet gegen ${raiserInfo?.position || 'den Open'}. ${raiserInfo?.profile ? `${raiserInfo.profile.name} ist ${raiserInfo.profile.style}` : ''}.`,
            tip: raiserInfo?.profile?.foldToRaiseRate > 0.4
              ? 'Dieser Gegner foldet oft auf Raises — ein Bluff kann funktionieren, aber waehle bessere Blocker.'
              : 'Dieser Gegner foldet selten — spare dir die 3-Bet ohne starke Hand.',
          };
        }
      }
      return null;
    }

    // 4-Bet+
    if (raisesBefore >= 2) {
      if (handStrength === 'premium') {
        return { phase: 'Preflop', type: 'success', title: 'Starke 4-Bet', message: `${handKey} — 4-Bet für Value. Korrekt.`, tip: null };
      }
      return {
        phase: 'Preflop', type: 'warning',
        title: 'Riskante 4-Bet',
        message: `4-Bet mit ${handKey} ist sehr aggressiv. Bei diesem Action-Level sind meistens nur Premium-Hände profitabel.`,
        tip: '4-Bet Bluffs nur mit Blocker-Händen (Ax, Kx) die gegnerische Premium-Hände blocken.',
      };
    }
  }

  // === ALL-IN ===
  if (act === ACTIONS.ALLIN) {
    const spr = calculateSPR(human.stack + (amount || 0), game.pot);
    if (handStrength === 'premium') {
      return { phase: 'Preflop', type: 'success', title: 'All-In mit Premium', message: `${handKey} All-In — korrekt.`, tip: null };
    }
    if (spr < 3 && (handStrength === 'strong' || handStrength === 'playable')) {
      return {
        phase: 'Preflop', type: 'info',
        title: 'Short-Stack Shove',
        message: `Mit ${spr.toFixed(1)} SPR ist ein All-In mit ${handKey} akzeptabel. Short-Stack-Strategie.`,
        tip: 'Bei niedrigem SPR (<3) ist Push-or-Fold oft die beste Strategie.',
      };
    }
    if (handStrength === 'weak' && spr > 5) {
      return {
        phase: 'Preflop', type: 'error',
        title: 'Riskantes All-In',
        message: `All-In mit ${handKey} bei ${spr.toFixed(1)} SPR ist zu riskant. Du riskierst deinen ganzen Stack mit einer schwachen Hand.`,
        tip: 'All-In Bluffs preflop nur als Short-Stack (< 15 BB) oder mit Blocker-Händen.',
      };
    }
  }

  return null;
}

// ================================================================
//  POSTFLOP ANALYSIS — Board Texture + Draws + Sizing + Opponents
//  + C-Bet, Multiway, IP/OOP, River-specific, Implied Odds
// ================================================================
function analyzePostflopAction(action, game, history, result, ctx) {
  const { phase, action: act, amount } = action;
  const { human, opponents, humanWasPFR, playersInHand, humanHasPosition, solverEntry } = ctx;

  // Use only the community cards visible on THIS street (not the full final board)
  const cardsForStreet = phase === PHASES.FLOP ? game.communityCards.slice(0, 3)
    : phase === PHASES.TURN ? game.communityCards.slice(0, 4)
    : game.communityCards.slice(0, 5);
  const eval_ = cardsForStreet.length >= 3
    ? evaluateHand(human.hand, cardsForStreet)
    : null;
  const strength = eval_ ? eval_.strength : 0;
  const handName = eval_ ? (eval_.descr || eval_.name) : '';

  // Pair sub-category for nuanced pair advice
  const pairType = analyzePairStrength(human.hand, cardsForStreet, eval_);
  const pairName = pairType ? pairLabel(pairType) : handName;
  // Set vs Trips distinction (both strength === 3 but very different strategy)
  const tripsType = analyzeThreeOfAKind(human.hand, cardsForStreet, eval_);
  const tripsName = tripsType ? threeOfAKindLabel(tripsType) : handName;
  // Effective strength: fine-grained pair sub-categories
  const effectiveStrength = pairType === 'overpair' ? 2
    : pairType === 'top_pair_good_kicker' ? 1.5
    : pairType === 'top_pair_weak_kicker' ? 1.1
    : pairType === 'middle_pair' ? 0.8
    : (pairType === 'bottom_pair' || pairType === 'underpair') ? 0.5
    : strength;

  const board = analyzeBoardTexture(cardsForStreet);
  const draws = detectDraws(human.hand, cardsForStreet);
  const pot = game.pot + game.getCurrentBetsTotal();
  const spr = calculateSPR(human.stack, pot);

  // Find who bet/raised this street
  const streetActions = history.filter(h => h.phase === phase);
  const opponentBets = streetActions.filter(h =>
    h.player !== game.humanSeat && (h.action === ACTIONS.BET || h.action === ACTIONS.RAISE)
  );
  const facedBet = opponentBets.length > 0;
  const betterProfile = facedBet ? getOpponentProfile(game, opponentBets[0].player) : null;
  const betAmount = facedBet ? opponentBets[opponentBets.length - 1].amount : 0;

  // Multiway detection: more than 2 players still in the pot
  const activePlayers = game.players.filter(p => !p.folded && !p.sittingOut).length;
  const isMultiway = activePlayers >= 3;
  const isRiver = phase === PHASES.RIVER;

  // C-Bet detection: human was PFR and is first to bet postflop
  const isCBetSpot = humanWasPFR && phase === PHASES.FLOP && !facedBet;

  // Donk-bet detection: opponent bets into PFR (human was PFR but opponent bets first)
  const isDonkBet = humanWasPFR && facedBet && phase === PHASES.FLOP;

  // IP/OOP context string for tips
  const posContext = humanHasPosition ? 'in Position' : 'Out of Position';
  const isTurn = phase === PHASES.TURN;

  // Turn-specific: Did hero c-bet the flop? (for double-barrel analysis)
  const flopActions = history.filter(h => h.phase === PHASES.FLOP && h.player === game.humanSeat);
  const heroCBetFlop = flopActions.some(h => h.action === ACTIONS.BET || h.action === ACTIONS.RAISE);
  const heroCheckedFlop = flopActions.some(h => h.action === ACTIONS.CHECK);
  const isDoubleBarrelSpot = isTurn && heroCBetFlop && humanWasPFR && !facedBet;
  const isProbeSpot = isTurn && !humanHasPosition && !facedBet && !humanWasPFR && heroCheckedFlop;

  // Turn card analysis: what did the turn change?
  let turnCardImpact = null;
  if (isTurn && game.communityCards.length >= 4) {
    const turnCard = game.communityCards[3];
    const flopBoard = analyzeBoardTexture(game.communityCards.slice(0, 3));
    const turnRank = 'AKQJT98765432'.indexOf(turnCard.rank);
    const flopRanks = game.communityCards.slice(0, 3).map(c => 'AKQJT98765432'.indexOf(c.rank));
    const flopMax = Math.min(...flopRanks); // lowest index = highest rank

    // Turn card classifications
    const isOvercard = turnRank < flopMax; // turn card higher than all flop cards
    const flopSuits = game.communityCards.slice(0, 3).map(c => c.suit);
    const turnBringsDraw = flopSuits.filter(s => s === turnCard.suit).length >= 2; // 3rd card of a suit
    const turnCompletesDraw = flopBoard?.hasFlushDraw && game.communityCards.slice(0, 4).filter(c => c.suit === turnCard.suit).length >= 4;
    const boardPairsOnTurn = game.communityCards.slice(0, 3).some(c => c.rank === turnCard.rank);

    turnCardImpact = {
      isOvercard,
      turnBringsDraw,
      turnCompletesDraw,
      boardPairsOnTurn,
      isBrick: !isOvercard && !turnBringsDraw && !turnCompletesDraw && !boardPairsOnTurn,
      description: isOvercard ? 'Overcard' : turnCompletesDraw ? 'Draw-Completor' : turnBringsDraw ? 'Brings Draw' : boardPairsOnTurn ? 'Board Pairs' : 'Brick',
    };
  }

  // Implied odds factor for draws — higher on flop (2 streets to extract value), lower on turn (1 street)
  const baseImplied = (human.stack > pot * 3) ? 1.3 : (human.stack > pot) ? 1.15 : 1.0;
  const streetMultiplier = (phase === PHASES.FLOP) ? 1.3 : 1.0; // flop has more implied odds (2 streets left)
  const positionBonus = humanHasPosition ? 1.1 : 1.0; // IP extracts more value
  const impliedOddsFactor = baseImplied * streetMultiplier * positionBonus;

  // === CHECK ANALYSIS ===
  if (act === ACTIONS.CHECK) {
    // === TURN-SPECIFIC: Missed double barrel ===
    if (isDoubleBarrelSpot && strength >= 1) {
      // Should we barrel the turn?
      const shouldBarrel = (strength >= 2) ||
        (turnCardImpact?.isOvercard && board?.rangeAdvantage === 'raiser') ||
        (turnCardImpact?.isBrick && strength >= 1 && !isMultiway);
      if (shouldBarrel) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'Double Barrel verpasst',
          message: `Du hast den Flop c-bettet aber den Turn gecheckt mit ${pairType ? pairName : handName}. ${turnCardImpact?.description || 'Turn'}-Karte — hier weiterbetten.`,
          tip: turnCardImpact?.isOvercard
            ? 'Overcards auf dem Turn sind gute Barrel-Karten — sie verbessern deine wahrgenommene Range als PFR.'
            : turnCardImpact?.isBrick
              ? 'Brick Turn-Karten ändern nichts. Wenn du am Flop gebettet hast, setze deine Story fort.'
              : 'Wer am Flop bettet und am Turn aufgibt, verschenkt oft das Ergebnis der Flop-Investition.',
        };
      }
      // Good check when turn completes draws or is bad for our range
      if (turnCardImpact?.turnCompletesDraw || (turnCardImpact?.turnBringsDraw && strength <= 1)) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Guter Check am Turn',
          message: `Turn ${turnCardImpact.description} — Check ist korrekt. Die Turn-Karte verbessert die Range des Gegners.`,
          tip: 'Wenn der Turn Draws komplettiert oder neue Draws bringt, ist Pot Control oft besser als weiter zu barreln.',
        };
      }
    }
    // === TURN-SPECIFIC: Missed probe bet (OOP after IP checked flop back) ===
    if (isProbeSpot && strength >= 1) {
      if (!isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'Probe-Bet Gelegenheit',
          message: `Gegner hat den Flop zurückgecheckt — seine Range ist gecappt. ${pairType ? pairName : handName} ist stark genug für eine Probe-Bet.`,
          tip: 'Probe-Bets: Wenn der IP-Spieler den Flop checkt, hat er meistens keine starke Hand. Bet 50-66% Pot.',
        };
      }
    }

    // Missed C-Bet as PFR
    if (isCBetSpot && strength >= 1) {
      const shouldCBet = (board?.cbetFrequency >= 50) || (board?.rangeAdvantage === 'raiser') || strength >= 2;
      if (shouldCBet && !isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'C-Bet verpasst',
          message: `Als PFR ${posContext} auf ${board?.description || ''} Board (${board?.archetype || ''}) — du solltest hier c-betten.`,
          tip: `Board-Archetype "${board?.archetype || ''}": C-Bet ~${board?.cbetFrequency || 50}% Frequency, Sizing ${board?.cbetSizing || '50%'} Pot.`,
        };
      }
      if (isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'Kein C-Bet Multiway',
          message: `Check als PFR in Multiway-Pot ist oft korrekt. C-Bets in Multiway-Pots brauchen stärkere Hände.`,
          tip: 'In Multiway-Pots c-bette nur mit Top Pair+ oder starken Draws. Air und schwache Hände checken.',
        };
      }
    }
    // Checked with monster — missed value
    if (strength >= 4) {
      return {
        phase: phaseLabel(phase), type: 'warning',
        title: 'Starke Hand gecheckt — Value verpasst',
        message: `${handName} ist eine starke Hand. Durch Checken laesst du Value liegen.`,
        tip: board?.isWet
          ? 'Auf nassem Board unbedingt betten — dein Gegner kann auf vielen Turn/River-Karten verbessern.'
          : 'Auch auf trockenem Board Value betten — der Gegner kann mit schwächeren Händen callen.',
      };
    }
    // Checked with overpair — should almost always bet
    if (pairType === 'overpair') {
      return {
        phase: phaseLabel(phase), type: 'warning',
        title: 'Overpair gecheckt — Value verpasst',
        message: `${pairName} gecheckt. Overpairs sind stark genug zum Betten auf fast allen Boards.`,
        tip: board?.isWet
          ? 'Auf nassem Board: Bet 66-75% Pot für Value + Protection gegen Draws.'
          : 'Auch auf trockenem Board: Bet 50% Pot für Value. Overpairs sind fast immer vorne.',
      };
    }
    // Checked with two pair/trips/set on wet board
    if (strength >= 2 && board?.isWet) {
      const tripsNote = tripsType === 'trips'
        ? ' Trips (Board Pair) sind sichtbar — Vorsicht vor besserem Kicker oder Full House.'
        : tripsType === 'set'
          ? ' Set ist versteckt und sehr stark — unbedingt Value betten!'
          : '';
      return {
        phase: phaseLabel(phase), type: 'warning',
        title: tripsType ? `${threeOfAKindLabel(tripsType)} gecheckt — Value verpasst` : 'Protection Bet verpasst',
        message: `${tripsType ? tripsName : handName} auf ${board.description} Board — du solltest betten um Draws teuer zu machen.${tripsNote}`,
        tip: isMultiway
          ? 'In Multiway-Pots auf nassen Boards IMMER betten — mehr Spieler = mehr Draws gegen dich.'
          : 'Auf wet Boards: Bet 66-75% Pot für Value + Protection.',
      };
    }
    // Checked with pair on dry board — depends on pair type
    if (strength === 1 && board?.isDry) {
      // Top pair should bet for value
      if (pairType === 'top_pair_good_kicker') {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'Top Pair gecheckt',
          message: `${pairName} auf ${board.description} Board — Bet für Thin Value ist hier Standard.`,
          tip: humanHasPosition
            ? 'In Position mit TPTK: Bet 50% Pot für Value. Du wirst von schwächeren Paaren gecallt.'
            : 'OOP: Check ist vertretbar, aber Bet für Value/Protection ist oft besser.',
        };
      }
      // Bottom pair / underpair — checking is correct
      if (pairType === 'bottom_pair' || pairType === 'underpair') {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: `${pairName} gecheckt — korrekt`,
          message: `Check mit ${pairName} ist richtig. Dein Pair ist zu schwach für eine Value-Bet.`,
          tip: facedBet ? null : 'Gegen einen Bet: Fold, ausser du bekommst sehr gute Pot Odds.',
        };
      }
      if (humanHasPosition) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Pot Control in Position',
          message: `Check mit ${pairName} auf ${board.description} Board ${posContext} — gutes Pot Control.`,
          tip: null,
        };
      }
      // OOP with pair on dry board — check-call or check-raise potential
      return {
        phase: phaseLabel(phase), type: 'info',
        title: 'Check OOP',
        message: `Check mit ${pairName} ${posContext}. Plane einen Check-Call oder Check-Raise gegen aggressive Gegner.`,
        tip: 'OOP checken und den Gegner betten lassen kann profitabler sein als selbst zu betten.',
      };
    }
    // Check with draw — potentially missed semi-bluff
    if (strength === 0 && (draws.hasFlushDraw || draws.hasOESD || draws.isComboDraws)) {
      if (isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Check mit Draw Multiway',
          message: `Check mit Draw in Multiway-Pot ist korrekt. Semi-Bluffs gegen mehrere Gegner sind weniger effektiv.`,
          tip: 'In Multiway-Pots Draws günstig sehen — die Pot Odds sind ohnehin besser durch den größeren Pot.',
        };
      }
      return {
        phase: phaseLabel(phase), type: 'info',
        title: 'Semi-Bluff Gelegenheit',
        message: `Du hast einen ${draws.isComboDraws ? 'Combo-Draw' : draws.hasFlushDraw ? 'Flush-Draw' : 'Straight-Draw'}. Ein Semi-Bluff hätte Fold Equity + Draw Equity.`,
        tip: humanHasPosition
          ? 'In Position Semi-Bluffs aggressiver spielen — du siehst die Reaktion des Gegners.'
          : 'OOP Semi-Bluffs sind riskanter — überlege Check-Raise als Alternative zum Lead.',
      };
    }
    return null;
  }

  // === FOLD ANALYSIS ===
  if (act === ACTIONS.FOLD) {
    if (facedBet && betAmount > 0) {
      // Use actual call amount (what hero needs to put in), not the bet amount
      const callAmount = betAmount - (human.bet || 0);
      const totalPot = pot + callAmount;
      const potOdds = callAmount / totalPot;

      // === RIVER FOLD — Bluff-Catching Logic ===
      if (isRiver && strength >= 1) {
        // MDF (Minimum Defense Frequency) = 1 - (bet / (pot + bet))
        const mdf = 1 - (betAmount / (pot + betAmount));
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'River Fold',
          message: `${handName} am River gefoldet. MDF (Minimum Defense Frequency): ${(mdf * 100).toFixed(0)}% — du musst mindestens so oft callen um nicht exploitbar zu sein.`,
          tip: betterProfile?.bluffRate > 0.2
            ? `${betterProfile.name} blufft oft — du solltest oefter callen als MDF vorschreibt.`
            : betterProfile?.bluffRate < 0.1
              ? `${betterProfile.name} blufft fast nie — Fold mit marginaler Hand ist korrekt.`
              : 'Überlege: Welche Bluffs kann der Gegner realistisch haben? Wenn er kaum Bluffs hat, ist Fold okay.',
        };
      }
      // Folded bottom pair or underpair — usually correct
      if ((pairType === 'bottom_pair' || pairType === 'underpair') && strength === 1) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: `${pairName} gefoldet — korrekt`,
          message: `Fold mit ${pairName} gegen einen Bet ist diszipliniert. ${pairName} hat oft nur 2-5 Outs zur Verbesserung.`,
          tip: betterProfile?.bluffRate > 0.3 ? `${betterProfile.name} blufft allerdings oft — ein Call wäre auch vertretbar.` : null,
        };
      }
      // Folded overpair — too strong to fold on most boards
      if (pairType === 'overpair') {
        return {
          phase: phaseLabel(phase), type: 'error',
          title: 'Overpair gefoldet',
          message: `${pairName} gefoldet — Overpairs sind auf den meisten Boards zu stark zum Folden.`,
          tip: 'Overpairs nur gegen sehr starke Action (Raise + Reraise) auf gefährlichen Boards folden.',
        };
      }
      // Folded a strong made hand (two pair+)
      if (strength >= 2) {
        return {
          phase: phaseLabel(phase), type: 'error',
          title: 'Starke Hand gefoldet',
          message: `${handName} gefoldet gegen einen Bet — diese Hand ist zu stark zum Folden ${isMultiway ? 'auch in Multiway-Pots' : ''}.`,
          tip: betterProfile?.bluffRate > 0.2
            ? `${betterProfile.name} blufft oft (${Math.round(betterProfile.bluffRate * 100)}% Bluff-Rate). Call oder Raise.`
            : 'Selbst gegen einen starken Bet ist Two Pair+ meistens ein Call.',
        };
      }
      // Folded draw with good odds (incl. implied odds)
      if (strength === 0 && (draws.hasFlushDraw || draws.hasOESD)) {
        const outs = draws.isComboDraws ? (draws.hasOESD ? 15 : 12) : draws.hasFlushDraw ? 9 : draws.hasOESD ? 8 : 4;
        const directOdds = outs * 2 / 100;
        const effectiveOdds = directOdds * impliedOddsFactor; // implied odds boost
        if (potOdds < effectiveOdds + 0.05) {
          return {
            phase: phaseLabel(phase), type: 'warning',
            title: 'Draw mit guten Odds gefoldet',
            message: `Du hattest einen ${draws.isComboDraws ? 'Combo' : draws.hasFlushDraw ? 'Flush' : 'Straight'}-Draw (~${outs} Outs). Pot Odds: ${(potOdds * 100).toFixed(0)}% — du brauchst ~${(directOdds * 100).toFixed(0)}%${impliedOddsFactor > 1 ? ` (+ Implied Odds)` : ''}.`,
            tip: draws.hasReverseImpliedOdds
              ? 'Vorsicht: Dein Draw ist nicht zur Nuts — Reverse Implied Odds reduzieren den Wert. Fold kann trotz Odds korrekt sein.'
              : impliedOddsFactor > 1.2
                ? 'Implied Odds: Du kannst mehr gewinnen wenn du triffst, weil der Gegner noch Stacks hat.'
                : 'Berechne immer Pot Odds vs. Draw Odds. Bei günstigen Odds ist ein Call profitabel.',
          };
        }
      }
      // Good fold with nothing
      if (strength === 0 && !draws.hasFlushDraw && !draws.hasStraightDraw) {
        if (isDonkBet) {
          return {
            phase: phaseLabel(phase), type: 'info',
            title: 'Fold gegen Donk-Bet',
            message: `Gegner bettet in den Preflop-Raiser (Donk-Bet). Ohne Hand ist Fold okay, aber Donk-Bets signalisieren oft schwache bis mittlere Hände.`,
            tip: 'Gegen Donk-Bets: Raise als Bluff kann profitabel sein, da Donk-Bets selten starke Hände sind.',
          };
        }
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Disziplinierter Fold',
          message: `Fold ohne Made Hand und ohne Draw gegen einen Bet — korrekt.`,
          tip: null,
        };
      }
    }
    return null;
  }

  // === CALL ANALYSIS ===
  if (act === ACTIONS.CALL && facedBet) {
    const callAmount = betAmount - (human.bet || 0);
    const totalPot = pot + callAmount;
    const potOdds = callAmount / totalPot;

    // === RIVER CALL — Bluff-Catching ===
    if (isRiver) {
      const mdf = 1 - (betAmount / (pot + betAmount));
      if (strength >= 1) {
        const isGoodBluffCatch = betterProfile?.bluffRate > 0.15;
        return {
          phase: phaseLabel(phase), type: isGoodBluffCatch ? 'success' : 'info',
          title: 'River Call (Bluff-Catch)',
          message: `Call am River mit ${handName}. ${betterProfile ? `${betterProfile.name} (${betterProfile.style}) blufft ~${Math.round((betterProfile.bluffRate || 0.15) * 100)}%` : 'Gegner-Bluffrate unbekannt'}.`,
          tip: `Du brauchst ${(potOdds * 100).toFixed(0)}% Equity am River. MDF: ${(mdf * 100).toFixed(0)}%. Frage: Hat der Gegner genug Bluffs in seiner Range?`,
        };
      }
      if (strength === 0) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'Hero-Call ohne Made Hand',
          message: `Call am River ohne Made Hand. Du brauchst eine starke Read dass der Gegner blufft.`,
          tip: betterProfile?.bluffRate > 0.25
            ? `${betterProfile.name} blufft oft genug — Hero-Call kann korrekt sein.`
            : 'Ohne klaren Bluff-Read ist ein Fold am River fast immer besser als ein Hero-Call.',
        };
      }
    }

    // Calling with monster — should raise for value
    if (strength >= 4) {
      if (isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Slowplay in Multiway',
          message: `Call mit ${handName} in Multiway-Pot. Smooth-Call kann hier mehr Spieler im Pot halten.`,
          tip: board?.isWet ? 'Vorsicht: Auf nassem Board in Multiway lieber raisen für Protection.' : null,
        };
      }
      return {
        phase: phaseLabel(phase), type: 'warning',
        title: 'Raise verpasst',
        message: `${handName} ist stark genug zum Raisen. Durch nur Callen laesst du Value liegen.`,
        tip: betterProfile?.foldToRaiseRate < 0.3
          ? `${betterProfile.name} foldet selten auf Raises — perfekt für einen Value-Raise.`
          : 'Raise für Value — du willst den Pot vergrößern mit der besten Hand.',
      };
    }
    // Calling with nothing and no draw
    if (strength === 0 && !draws.hasFlushDraw && !draws.hasStraightDraw && !draws.hasOvercards) {
      return {
        phase: phaseLabel(phase), type: 'warning',
        title: 'Teurer Call ohne Equity',
        message: `Call ohne Made Hand und ohne Draw ${isMultiway ? 'in einem Multiway-Pot' : ''}. Du brauchst mindestens einen Draw oder Overcards.`,
        tip: betterProfile?.bluffRate > 0.25
          ? `${betterProfile.name} blufft oft — ein Hero-Call kann okay sein, aber sei vorsichtig.`
          : 'Ohne Equity ist ein Fold fast immer die beste Option.',
      };
    }
    // Calling with draw — check pot odds
    if (strength === 0 && (draws.hasFlushDraw || draws.hasStraightDraw)) {
      const outs = draws.isComboDraws ? (draws.hasOESD ? 15 : 12) : draws.hasFlushDraw ? 9 : draws.hasOESD ? 8 : 4;
      const oneCardEquity = outs * 2 / 100; // Rule of 2: next card only
      const twoCardEquity = Math.min(outs * 4, 100) / 100; // Rule of 4: flop-to-river
      const isFlop = phase === PHASES.FLOP;
      // On flop: use one-card equity for direct pot odds, but show two-card equity for context
      const neededOdds = oneCardEquity;
      // Effective odds include implied odds (especially on flop with 2 streets left)
      const effectiveNeeded = neededOdds * impliedOddsFactor;
      if (potOdds > effectiveNeeded + 0.08) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'Zu teurer Draw-Call',
          message: `${outs} Outs. Direkte Equity: ~${(oneCardEquity * 100).toFixed(0)}%${isFlop ? ` (gesamt bis River: ~${(twoCardEquity * 100).toFixed(0)}%)` : ''}. Pot Odds: ${(potOdds * 100).toFixed(0)}%.`,
          tip: isFlop
            ? 'Auf dem Flop: Du zahlst für eine Karte, aber hast noch 2 Chancen. Implied Odds und Semi-Bluff Raise als Alternative.'
            : 'Alternative: Semi-Bluff Raise — du gibst dir eine zweite Chance zu gewinnen (Fold Equity).',
        };
      }
      return {
        phase: phaseLabel(phase), type: 'success',
        title: 'Korrekter Draw-Call',
        message: `${draws.isComboDraws ? 'Combo-Draw' : draws.hasFlushDraw ? 'Flush-Draw' : 'Straight-Draw'} mit ${outs} Outs (~${(oneCardEquity * 100).toFixed(0)}% direkt${isFlop ? `, ~${(twoCardEquity * 100).toFixed(0)}% bis River` : ''}). Pot Odds (${(potOdds * 100).toFixed(0)}%) sind günstig.`,
        tip: draws.hasReverseImpliedOdds
          ? 'Vorsicht: Dein Flush-Draw ist nicht zum Ass — Reverse Implied Odds. Wenn du triffst, kann ein höherer Flush dich schlagen.'
          : isFlop ? 'Am Flop: Implied Odds machen Draws profitabler — du kannst auf Turn+River noch viel gewinnen.' : null,
      };
    }
    // Calling with made hand — generally fine
    if (strength >= 1 && strength <= 3) {
      return {
        phase: phaseLabel(phase), type: 'success',
        title: 'Solider Call',
        message: `Call mit ${handName} — korrekte Pot Control mit mittelstarker Hand.`,
        tip: null,
      };
    }
    return null;
  }

  // === BET / RAISE ANALYSIS ===
  if (act === ACTIONS.BET || act === ACTIONS.RAISE) {
    const sizing = analyzeBetSizing(amount || 0, pot);

    // --- CHECK-RAISE DETECTION: Hero checked earlier this street, then raises after opponent bet ---
    const heroStreetActions = streetActions.filter(h => h.player === game.humanSeat);
    const heroCheckedFirst = heroStreetActions.length >= 1 && heroStreetActions[0].action === ACTIONS.CHECK;
    const isCheckRaise = heroCheckedFirst && act === ACTIONS.RAISE;

    if (isCheckRaise) {
      if (strength >= 4) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Check-Raise für Value!',
          message: `Check-Raise mit ${handName} — starke Linie. Du laesst den Gegner betten, dann raisest für maximalen Value.`,
          tip: humanHasPosition
            ? 'IP Check-Raise ist ungewoehnlich — kann sehr profitabel sein wenn der Gegner nicht damit rechnet.'
            : 'OOP Check-Raise mit Monster ist die beste Value-Linie. Größe: 3-3.5x des Opponent Bets.',
        };
      }
      if (strength >= 2 || (draws.isComboDraws)) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Check-Raise',
          message: `Check-Raise mit ${draws.isComboDraws ? 'Combo-Draw' : handName}. ${draws.isComboDraws ? 'Semi-Bluff Check-Raise mit hoher Equity.' : 'Value + Protection Check-Raise.'}`,
          tip: draws.isComboDraws
            ? 'Combo-Draw Check-Raise: Du gewinnst sofort (Fold Equity) oder hast 12-15 Outs wenn gecallt.'
            : 'Check-Raise mit mittelstarker Hand: Gut für Protection, aber sei bereit für eine 3-Bet zu folden.',
        };
      }
      if (strength <= 1 && !draws.hasFlushDraw && !draws.hasStraightDraw) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'Check-Raise Bluff',
          message: `Check-Raise als Bluff mit ${handName}. Riskant — du baust einen grossen Pot mit einer schwachen Hand.`,
          tip: betterProfile?.foldToRaiseRate > 0.4
            ? `${betterProfile.name} foldet oft auf Raises — Check-Raise Bluff kann hier funktionieren.`
            : 'Check-Raise Bluffs brauchen hohe Fold Equity. Waehle Hände mit Blocker-Wirkung oder Backdoor-Equity.',
        };
      }
      if (draws.hasFlushDraw || draws.hasStraightDraw) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Semi-Bluff Check-Raise',
          message: `Check-Raise als Semi-Bluff mit ${describeDraw(draws)}. Fold Equity + Draw Equity = profitabel.`,
          tip: 'Semi-Bluff Check-Raise OOP ist eine der stärksten Linien. Wenn gecallt, hast du Outs zum Treffen.',
        };
      }
    }

    // --- TURN: Double Barrel as PFR ---
    if (isDoubleBarrelSpot && act === ACTIONS.BET) {
      if (strength >= 1) {
        let turnTip = null;
        if (turnCardImpact?.isOvercard) {
          turnTip = 'Overcard Turn — gute Barrel-Karte. Du repraesentiertst stärkere Hände als PFR.';
        } else if (turnCardImpact?.isBrick) {
          turnTip = 'Brick Turn — konsistente Story. Wenn du den Flop gebettet hast, setze fort.';
        } else if (turnCardImpact?.turnCompletesDraw) {
          turnTip = 'Vorsicht: Turn komplettiert Draws. Barrel nur mit starker Hand oder wenn du den Draw hast.';
        }
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Guter Double Barrel',
          message: `Turn Bet nach Flop-C-Bet mit ${pairType ? pairName : handName}. ${turnCardImpact?.description || 'Turn'}-Karte. ${sizing.label} (${(sizing.ratio * 100).toFixed(0)}% Pot).`,
          tip: turnTip,
        };
      }
      if (strength === 0 && (draws.hasFlushDraw || draws.hasStraightDraw)) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Turn Semi-Bluff Barrel',
          message: `Double Barrel als Semi-Bluff mit ${describeDraw(draws)}. Fold Equity + Draw Equity.`,
          tip: turnCardImpact?.turnBringsDraw
            ? 'Die Turn-Karte bringt neue Draws — das gibt deinem Bluff Glaubwürdigkeit.'
            : 'Barrel mit Draws: Du hast zwei Wege zu gewinnen (Gegner foldet oder du triffst).',
        };
      }
      if (strength === 0 && turnCardImpact?.isOvercard) {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'Turn Bluff Barrel',
          message: `Double Barrel als Bluff auf ${turnCardImpact.description}-Karte. Deine PFR-Range trifft Overcards — glaubwürdige Story.`,
          tip: 'Barrel-Bluffs auf Overcards funktionieren gut. Plane aber den River: Wirst du auch die dritte Kugel feuern?',
        };
      }
    }

    // --- TURN: Probe Bet OOP after IP checked back flop ---
    if (isProbeSpot && act === ACTIONS.BET) {
      return {
        phase: phaseLabel(phase), type: 'success',
        title: 'Probe-Bet',
        message: `Probe-Bet nach Flop-Check-Through ${posContext}. Gegner-Range ist gecappt. ${sizing.label} (${(sizing.ratio * 100).toFixed(0)}% Pot).`,
        tip: strength >= 1
          ? 'Probe-Bet für Value/Protection — Gegner hat keine starke Hand (hätte Flop gebettet).'
          : draws.hasFlushDraw || draws.hasStraightDraw
            ? 'Probe-Bet als Semi-Bluff — profitabel gegen gecappte Ranges.'
            : 'Probe-Bet als Bluff — kann funktionieren, aber sei bereit bei Resistance aufzugeben.',
      };
    }

    // --- C-Bet as PFR on flop ---
    if (isCBetSpot && act === ACTIONS.BET) {
      if (strength >= 2) {
        let sizingTip = null;
        if (board?.isDry && sizing.ratio > 0.5) {
          sizingTip = 'Auf trockenen Boards reicht eine kleine C-Bet (25-33% Pot) — du erreichst denselben Fold Equity.';
        } else if (board?.isWet && sizing.ratio < 0.5) {
          sizingTip = `Auf ${board.description} Board größer c-betten (66-75% Pot) um Draws teuer zu machen.`;
        }
        if (isMultiway) {
          return {
            phase: phaseLabel(phase), type: 'success',
            title: 'C-Bet mit starker Hand Multiway',
            message: `C-Bet mit ${handName} in Multiway-Pot ${posContext}. Korrekt — du hast die Hand dafuer.`,
            tip: sizingTip || 'In Multiway-Pots größer c-betten (66%+ Pot). Mehr Spieler = mehr Protection nötig.',
          };
        }
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Gute C-Bet',
          message: `C-Bet als PFR mit ${handName} ${posContext}. ${sizing.label} (${(sizing.ratio * 100).toFixed(0)}% Pot).`,
          tip: sizingTip,
        };
      }
      if (strength <= 1 && isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'C-Bet Multiway ohne starke Hand',
          message: `C-Bet mit ${strength === 0 ? 'keiner Made Hand' : handName} in Multiway-Pot. In Multiway nur mit starken Händen oder Draws c-betten.`,
          tip: 'In Multiway-Pots braucht deine C-Bet mehr Equity. Air c-betten funktioniert nur Heads-Up.',
        };
      }
      if (strength === 0 && (draws.hasFlushDraw || draws.hasStraightDraw || draws.isComboDraws)) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'C-Bet als Semi-Bluff',
          message: `C-Bet mit ${draws.isComboDraws ? 'Combo-Draw' : draws.hasFlushDraw ? 'Flush-Draw' : 'Straight-Draw'} als PFR. Fold Equity + Draw Equity + Initiative.`,
          tip: humanHasPosition ? 'In Position hast du mehr Kontrolle über späteren Streets wenn du gecallt wirst.' : null,
        };
      }
      if (strength === 0 && board?.isDry) {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'C-Bet als Bluff',
          message: `C-Bet auf ${board.description} Board ohne Made Hand. Auf trockenen Boards ist das als PFR profitabel.`,
          tip: board?.rangeAdvantage === 'raiser' ? 'Du hast Range-Vorteil auf diesem Board — C-Bet ist Standard.' : 'Achte auf Frequenz: nicht 100% c-betten, sonst wirst du exploitbar.',
        };
      }
      if (strength === 0 && board?.isWet) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'C-Bet ohne Equity auf nassem Board',
          message: `C-Bet ohne Made Hand oder Draw auf ${board.description} Board. Auf wet Boards wird oefter gecallt.`,
          tip: 'Auf nassen Boards: C-Bet nur mit Equity (Pair+, Draws). Mit Air: Check und aufgeben.',
        };
      }
    }

    // --- Raising a donk-bet ---
    if (isDonkBet && act === ACTIONS.RAISE) {
      if (strength >= 2) {
        return {
          phase: phaseLabel(phase), type: 'success',
          title: 'Raise gegen Donk-Bet',
          message: `Raise gegen Donk-Bet mit ${handName}. Donk-Bets signalisieren oft schwache bis mittlere Hände — guter Raise für Value.`,
          tip: null,
        };
      }
      return {
        phase: phaseLabel(phase), type: 'info',
        title: 'Bluff-Raise gegen Donk-Bet',
        message: `Raise gegen Donk-Bet als Bluff. Donk-Bets sind oft schwach, aber du brauchst eine gute Read.`,
        tip: betterProfile?.foldToRaiseRate > 0.4
          ? `${betterProfile.name} foldet oft auf Raises — guter Bluff-Spot.`
          : 'Vorsicht: Manche Gegner donk-betten auch mit starken Händen.',
      };
    }

    // --- RIVER SPECIFIC BET/RAISE ---
    if (isRiver) {
      if (strength >= 2) {
        // Board scare card check: 4-flush or 4-straight boards devalue non-nut hands
        const fourFlush = board && board.maxSuitCount >= 4;
        const fourStraight = board && board.maxConnected >= 4;
        const scaryBoard = fourFlush || fourStraight;

        // With scary board, only nuts (strength >= 5 for flush/straight+) should value bet big
        if (scaryBoard && strength <= 3) {
          const threat = fourFlush ? '4-Flush' : '4-Straight';
          return {
            phase: phaseLabel(phase), type: 'warning',
            title: `Vorsicht: ${threat} Board`,
            message: `${act === ACTIONS.RAISE ? 'Raise' : 'Bet'} mit ${handName} auf einem ${threat} Board. Deine Hand ist hier ein Bluff-Catcher — viele schlechtere Hände folden, bessere callen.`,
            tip: `Auf ${threat} Boards: Nur mit der Nuts (${fourFlush ? 'Nut Flush' : 'Nut Straight'}+) für Value betten. Zwei Paar / Trips sind hier Check-Call oder Check-Fold.`,
          };
        }

        // Value betting on river — need to be called by worse
        const isThickValue = strength >= 4;
        // On scary boards with strong hands, still warn about sizing
        const scaryBoardNote = scaryBoard && isThickValue
          ? ` Achtung: ${fourFlush ? '4-Flush' : '4-Straight'} Board — nur Top-Range Hände sollten hier gross betten.`
          : '';
        return {
          phase: phaseLabel(phase), type: 'success',
          title: isThickValue ? 'River Value Bet!' : 'River Thin Value',
          message: `${act === ACTIONS.RAISE ? 'Raise' : 'Bet'} am River mit ${handName}. ${isThickValue ? 'Starke Hand — maximalen Value extrahieren.' + scaryBoardNote : 'Thin Value — welche schwächeren Hände callen?'}`,
          tip: isThickValue
            ? (sizing.ratio < 0.6 ? 'Am River größer betten für maximalen Value (75%+ Pot).' : null)
            : 'Thin Value am River: Frage dich immer — welche schwächeren Hände rufen? Wenn keine, lieber Check.',
        };
      }
      if (strength === 0 && !draws.hasFlushDraw && !draws.hasStraightDraw) {
        // River bluff — need fold equity
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'River Bluff',
          message: `${act === ACTIONS.RAISE ? 'Raise' : 'Bet'} am River als Bluff. ${sizing.label} (${(sizing.ratio * 100).toFixed(0)}% Pot).`,
          tip: betterProfile?.foldToRaiseRate > 0.35
            ? `${betterProfile.name} foldet oft genug — Bluff kann profitabel sein. Größere Sizing (75%+ Pot) erzeugt mehr Fold Equity.`
            : betterProfile?.foldToRaiseRate < 0.2
              ? `${betterProfile.name} foldet fast nie — River-Bluff ist unprofitabel. Nur bluffen mit guter Blocker-Wirkung.`
              : 'River-Bluffs: Waehle Hände die gegnerische Value-Hände blocken (z.B. Ax auf Ace-high Board).',
        };
      }
    }

    // --- Value bet with strong hand (non-river, non-cbet) ---
    if (strength >= 2) {
      let sizingFeedback = null;
      if (sizing.ratio < 0.3 && strength >= 4) {
        sizingFeedback = 'Dein Bet ist zu klein für die Handstärke. Bet mindestens 50-66% Pot.';
      } else if (sizing.ratio > 1.2 && strength >= 4) {
        sizingFeedback = 'Overbet mit Monster-Hand — polarisierte Strategie. Sehr profitabel wenn du Nut Advantage hast.';
      } else if (sizing.ratio > 1.2 && strength <= 3) {
        sizingFeedback = 'Overbet mit mittelstarker Hand ist riskant — schwächere Hände folden, stärkere callen. Overbets nur mit Nuts oder Air.';
      } else if (board?.isWet && sizing.ratio < 0.5) {
        sizingFeedback = `Auf ${board.description} Board größer betten (66-75% Pot) um Draws teuer zu machen.`;
      }
      if (isMultiway && strength <= 3) {
        sizingFeedback = (sizingFeedback || '') + ' In Multiway-Pots größer betten — mehr Spieler haben mehr Draws.';
      }

      // CRITICAL: When raising INTO an opponent who bet, check if our hand is strong enough
      // Two pair is marginal when facing aggression — could be dominated by better two pair, sets, etc.
      if (facedBet && act === ACTIONS.RAISE && strength <= 2) {
        // Raising with two pair or less vs an opponent's bet — warn about range
        const opponentAggressive = opponentBets.length >= 1;
        const multiStreetAggression = history.filter(h =>
          h.player !== game.humanSeat && h.phase !== phase &&
          (h.action === ACTIONS.BET || h.action === ACTIONS.RAISE)
        ).length > 0;

        if (multiStreetAggression) {
          return {
            phase: phaseLabel(phase), type: 'warning',
            title: 'Raise gegen Multi-Street Aggression',
            message: `Raise mit ${handName} gegen einen Gegner der über mehrere Streets bettet/raist. Seine Range ist sehr stark — Two Pair ist hier oft dominiert.`,
            tip: 'Wenn ein Gegner Flop UND Turn bettet, hat er meist eine starke Hand. Call ist die sichere Linie, Raise nur mit Nuts.',
          };
        }
        if (opponentAggressive && !humanHasPosition) {
          return {
            phase: phaseLabel(phase), type: 'info',
            title: `Raise mit ${handName}`,
            message: `Raise mit ${handName} gegen Opponent-Bet ${posContext}. ${strength === 2 ? 'Two Pair ist gut aber nicht die Nuts — Call ist sicherer.' : 'Mittelstarke Hand, Raise baut den Pot gegen bessere Hände.'}`,
            tip: 'OOP Raise gegen Bet: Nur mit sehr starken Händen (Sets+). Two Pair = Call, nicht Raise.',
          };
        }
      }

      return {
        phase: phaseLabel(phase), type: 'success',
        title: strength >= 4 ? 'Value Bet!' : 'Guter Bet für Value',
        message: `${handName} aggressiv gespielt ${posContext} — korrekt. ${sizing.label} (${(sizing.ratio * 100).toFixed(0)}% Pot).`,
        tip: sizingFeedback,
      };
    }

    // --- Bet with one pair — context dependent by pair type ---
    if (strength === 1) {
      // Betting with bottom pair / underpair — usually a mistake
      if (pairType === 'bottom_pair' || pairType === 'underpair') {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: `Bet mit ${pairName}`,
          message: `Bet mit ${pairName} ${posContext}. Dein Pair ist zu schwach — welche schwächeren Hände callen?`,
          tip: 'Mit Bottom Pair/Underpair: Check-Call oder Check-Fold. Betten bringt nur Calls von besseren Händen.',
        };
      }
      if (board?.isDry) {
        let tip = null;
        if (sizing.ratio > 0.75) tip = 'Etwas kleiner betten (33-50% Pot) würde auf trockenem Board genügen.';
        if (!humanHasPosition && !tip) tip = 'OOP mit Pair auf Dry Board: Check-Call ist oft besser als eine Lead-Bet.';
        return {
          phase: phaseLabel(phase), type: pairType === 'top_pair_good_kicker' ? 'success' : 'info',
          title: `${pairName} — Value Bet`,
          message: `Bet mit ${pairName} auf ${board.description} Board ${posContext}.${pairType === 'top_pair_good_kicker' ? ' Starker Kicker gibt dir Confidence.' : ''}`,
          tip,
        };
      }
      if (board?.isWet) {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: `Bet mit ${pairName} auf nassem Board`,
          message: `Bet mit ${pairName} auf ${board.description} Board ${posContext}. ${isMultiway ? 'In Multiway mit einem Pair vorsichtig sein.' : 'Protection-Bet, aber sei bereit auf einen Raise zu folden.'}`,
          tip: isMultiway
            ? 'In Multiway-Pots auf nassem Board: Mit einem Pair eher Check-Call als Lead-Bet.'
            : pairType === 'top_pair_weak_kicker'
              ? 'Top Pair mit schwachem Kicker: Kleinere Sizing (33% Pot) und vorsichtig auf Raises.'
              : 'Auf nassem Board mit Pair: kleinere Sizing (33-50% Pot) und bereit sein aufzugeben.',
        };
      }
    }

    // --- Bluff / Semi-bluff with no made hand ---
    if (strength === 0) {
      // Semi-bluff with draw
      if (draws.hasFlushDraw || draws.hasStraightDraw || draws.isComboDraws) {
        if (isMultiway) {
          return {
            phase: phaseLabel(phase), type: 'info',
            title: 'Semi-Bluff Multiway',
            message: `Semi-Bluff mit ${draws.isComboDraws ? 'Combo-Draw' : draws.hasFlushDraw ? 'Flush-Draw' : 'Straight-Draw'} in Multiway-Pot. Weniger Fold Equity, aber starke Draws haben genug Equity.`,
            tip: draws.isComboDraws
              ? 'Combo-Draws haben ~50%+ Equity — Semi-Bluff auch Multiway vertretbar.'
              : 'Einzelne Draws in Multiway lieber callen als semi-bluffen — zu wenig Fold Equity.',
          };
        }
        return {
          phase: phaseLabel(phase), type: 'success',
          title: draws.isComboDraws ? 'Starker Semi-Bluff!' : 'Semi-Bluff',
          message: `Semi-Bluff mit ${draws.isComboDraws ? 'Combo-Draw' : draws.hasFlushDraw ? 'Flush-Draw' : 'Straight-Draw'} ${posContext} — du hast Fold Equity + Draw Equity.`,
          tip: betterProfile?.foldToRaiseRate > 0.35
            ? `${betterProfile?.name || 'Gegner'} foldet oft — guter Spot für Semi-Bluffs.`
            : humanHasPosition
              ? 'In Position: Wenn du gecallt wirst, hast du Kontrolle über den Turn.'
              : 'OOP Semi-Bluffs sind riskanter — du musst auf dem Turn oft wieder Druck machen.',
        };
      }
      // Pure bluff
      if (isMultiway) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'Bluff in Multiway-Pot',
          message: `Bluff ohne Equity in Multiway-Pot. Sehr geringe Fold Equity — mindestens ein Gegner hat meistens etwas.`,
          tip: 'In Multiway-Pots: Fast nie ohne Equity bluffen. Jeder zusaetzliche Spieler reduziert deine Fold Equity drastisch.',
        };
      }
      if (board?.isDry) {
        return {
          phase: phaseLabel(phase), type: 'info',
          title: 'Bluff auf trockenem Board',
          message: `Bluff auf ${board.description} Board ${posContext}. Trockene Boards sind gute Bluff-Spots weil weniger Draws den Gegner halten.`,
          tip: betterProfile?.foldToRaiseRate < 0.3
            ? `Vorsicht: ${betterProfile.name} foldet selten. Bluffs gegen Calling Stations sind unprofitabel.`
            : humanHasPosition
              ? 'In Position kannst du Bluffs auf mehreren Streets durchziehen — aber plane die ganze Linie.'
              : 'OOP Bluffs sind riskanter. Waehle gute Blocker-Hände (Ax blockt Top Pair).',
        };
      }
      if (board?.isWet) {
        return {
          phase: phaseLabel(phase), type: 'warning',
          title: 'Riskanter Bluff',
          message: `Bluff auf ${board.description} Board ohne Draw ${posContext}. Auf nassem Board halten Gegner oefter wegen eigener Draws.`,
          tip: 'Auf nassen Boards nur mit Equity (Draws) bluffen, nie als reiner Bluff.',
        };
      }
      return {
        phase: phaseLabel(phase), type: 'info',
        title: 'Bluff',
        message: `Bluff ohne Made Hand ${posContext}. Achte auf Frequenz und Board-Textur.`,
        tip: null,
      };
    }
  }

  // === ALL-IN ===
  if (act === ACTIONS.ALLIN) {
    if (strength >= 4) {
      return { phase: phaseLabel(phase), type: 'success', title: 'All-In mit Monster!', message: `${handName} — maximalen Value extrahieren. Perfekt.`, tip: null };
    }
    if (strength >= 2) {
      return {
        phase: phaseLabel(phase), type: 'info',
        title: 'All-In mit guter Hand',
        message: `${handName} All-In. Akzeptabel, aber ein Raise könnte mehr Value extrahieren.`,
        tip: spr > 3 ? 'Bei hohem SPR lieber raisen statt All-In — du willst den Gegner nicht verscheuchen.' : null,
      };
    }
    if (draws.isComboDraws) {
      return {
        phase: phaseLabel(phase), type: 'info',
        title: 'All-In Semi-Bluff',
        message: `All-In mit Combo-Draw — maximaler Druck + gute Equity. Aggressiv aber vertretbar.`,
        tip: null,
      };
    }
    if (strength === 0 && !draws.hasFlushDraw && !draws.hasStraightDraw) {
      return {
        phase: phaseLabel(phase), type: 'error',
        title: 'Riskantes All-In ohne Equity',
        message: `All-In Bluff ohne Made Hand und ohne Draw. Du riskierst alles ohne Sicherheitsnetz.`,
        tip: 'All-In Bluffs nur mit Draws oder auf River als letzten Bluff mit ausreichender Fold Equity.',
      };
    }
  }

  return null;
}

// ================================================================
//  OVERALL ASSESSMENT
// ================================================================
function overallAssessment(humanActions, game, result, ctx) {
  const { opponents, position, isLatePosition } = ctx;
  const raises = humanActions.filter(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.BET).length;
  const calls = humanActions.filter(a => a.action === ACTIONS.CALL).length;
  const checks = humanActions.filter(a => a.action === ACTIONS.CHECK).length;
  const totalActions = humanActions.length;

  // Decision quality assessment — NEVER evaluate based on outcome
  // A good fold can lose a pot but still be correct; a bad call can win but still be wrong

  // Pattern: Too passive (many calls, no raises)
  if (calls >= 3 && raises === 0 && totalActions >= 4) {
    return {
      phase: 'Gesamt', type: 'warning',
      title: 'Passives Spiel',
      message: `${calls}x gecallt ohne zu raisen. Passives Spiel kostet dich Fold Equity und macht dich lesbar.`,
      tip: 'Poker ist ein Spiel der Aggression. Mische Raises in dein Spiel für Balance. Frage dich: Hätte ich hier Raisen sollen?',
    };
  }

  // Pattern: Too aggressive (raising every street without strong hands)
  if (raises >= 3 && totalActions >= 4) {
    return {
      phase: 'Gesamt', type: 'info',
      title: 'Aggressive Linie',
      message: `${raises}x gebettet/geraist. Aggression ist gut, aber übertriebene Aggression wird exploitbar.`,
      tip: 'Pruefe: Hast du auf jeder Street genug Equity gehabt? Multi-Street Bluffs müssen geplant sein.',
    };
  }

  // Pattern: Check-Call line (passive calling station behavior)
  if (checks >= 2 && calls >= 2 && raises === 0 && totalActions >= 4) {
    return {
      phase: 'Gesamt', type: 'warning',
      title: 'Check-Call Linie',
      message: `Durchgehend Check-Call gespielt. Diese Linie ist vorhersehbar und gibt dem Gegner volle Kontrolle.`,
      tip: 'Mische Check-Raises in dein Spiel. Gelegentlich selbst betten statt nur reagieren.',
    };
  }

  // Pattern: Good aggression with position
  if (raises >= 2 && isLatePosition && totalActions >= 3 && calls <= 1) {
    return {
      phase: 'Gesamt', type: 'success',
      title: 'Gute Aggression in Position',
      message: `Aggressives Spiel aus ${position} — du nutzt deinen Positionsvorteil gut.`,
      tip: null,
    };
  }

  return null;
}

// ================================================================
//  STREET-BY-STREET REVIEW (detailed post-hand)
// ================================================================
export function generateStreetReview(game, handHistory, result) {
  const humanSeat = game.humanSeat;
  const human = game.players[humanSeat];
  const humanActions = handHistory.filter(h => h.player === humanSeat);
  const position = game.getPosition(humanSeat);
  const handStrength = human.hand.length === 2 ? getPreflopStrength(human.hand) : null;
  const handKey = human.hand.length === 2 ? handToKey(human.hand) : '';
  const humanWon = result.winners && result.winners.some(w => w.player.id === humanSeat);
  const inGTORange = isInGTORange(human.hand, position);

  const streets = [];

  // --- PREFLOP ---
  const preflopActions = humanActions.filter(a => a.phase === PHASES.PREFLOP);
  const allPreflopActions = handHistory.filter(a => a.phase === PHASES.PREFLOP);
  if (preflopActions.length > 0) {
    const raisesBefore = allPreflopActions.filter(a =>
      a.player !== humanSeat && (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET || a.action === ACTIONS.ALLIN)
    ).length;
    const callersBefore = allPreflopActions.filter(a =>
      a.player !== humanSeat && a.action === ACTIONS.CALL
    ).length;

    const yourAction = preflopActions.map(a => actionLabel(a.action, a.amount)).join(', ');
    let optimal = '';
    let grade = 'ok';

    if (raisesBefore === 0) {
      // First in
      if (inGTORange === true) {
        optimal = `Open-Raise 2.5-3x BB. ${handKey} ist in der ${position}-Range.`;
        if (preflopActions.some(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.BET)) grade = 'good';
        else if (preflopActions.some(a => a.action === ACTIONS.CALL)) { grade = 'ok'; optimal += ' Nicht limpen.'; }
        else grade = 'bad';
      } else if (inGTORange === false) {
        optimal = `Fold. ${handKey} ist nicht in der ${position}-Opening-Range (${getRangePercent(position)}%).`;
        if (preflopActions.some(a => a.action === ACTIONS.FOLD)) grade = 'good';
        else if (preflopActions.some(a => a.action === ACTIONS.RAISE) && ['BTN', 'CO'].includes(position)) grade = 'ok'; // steals ok
        else grade = 'bad';
      } else {
        // Fallback to hand strength
        if (handStrength === 'premium' || handStrength === 'strong') {
          optimal = 'Open-Raise für Value.';
          grade = preflopActions.some(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.BET) ? 'good' : 'ok';
        } else if (handStrength === 'playable') {
          optimal = ['BTN', 'CO'].includes(position) ? 'Open-Raise aus später Position.' : 'Raise oder Fold.';
          grade = 'ok';
        } else {
          optimal = 'Fold.';
          grade = preflopActions.some(a => a.action === ACTIONS.FOLD) ? 'good' : 'bad';
        }
      }
    } else {
      // Facing raise(s)
      const raiserPos = findFirstRaiser(allPreflopActions, humanSeat, game)?.position || '';
      const in3Bet = isIn3BetRange(human.hand, raiserPos);
      if (in3Bet === true) {
        optimal = `3-Bet für Value vs. ${raiserPos}-Open. ${handKey} ist in der 3-Bet Range.`;
        if (preflopActions.some(a => a.action === ACTIONS.RAISE)) grade = 'good';
        else if (preflopActions.some(a => a.action === ACTIONS.CALL)) grade = 'ok';
        else grade = 'bad';
      } else if (handStrength === 'premium') {
        optimal = '3-Bet / 4-Bet für Value. Premium Hände wollen grosse Pots.';
        grade = preflopActions.some(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.ALLIN) ? 'good' : 'ok';
      } else if (handStrength === 'strong' || handStrength === 'playable') {
        optimal = ['BTN', 'CO', 'BB'].includes(position) ? 'Call in Position oder 3-Bet.' : 'Call oder Fold OOP.';
        grade = preflopActions.some(a => a.action === ACTIONS.FOLD) && handStrength === 'strong' ? 'bad' : 'ok';
      } else {
        optimal = 'Fold. Schwache Hände gegen Raises nicht spielen.';
        grade = preflopActions.some(a => a.action === ACTIONS.FOLD) ? 'good' : 'bad';
      }
    }

    streets.push({
      street: 'Preflop',
      hand: handKey,
      position,
      yourAction,
      optimal,
      grade,
      context: raisesBefore > 0 ? `${raisesBefore} Raise(s) vor dir` : callersBefore > 0 ? `${callersBefore} Limper` : 'Erster im Pot',
      gtoRange: inGTORange !== null ? (inGTORange ? 'In Range' : 'Ausserhalb') : null,
    });
  }

  // --- Context: was human PFR, position, players in hand ---
  const preflopHistory = handHistory.filter(a => a.phase === PHASES.PREFLOP);
  const humanWasPFR = preflopHistory.some(h =>
    h.player === humanSeat && (h.action === ACTIONS.RAISE || h.action === ACTIONS.BET)
  );
  const isLatePosition = ['BTN', 'CO', 'BTN/SB'].includes(position);
  const isBlind = ['SB', 'BB'].includes(position);
  const humanHasPosition = isLatePosition && !isBlind;
  const posContext = humanHasPosition ? 'IP' : 'OOP';

  // --- POSTFLOP STREETS ---
  const postflopPhases = [
    { phase: PHASES.FLOP, label: 'Flop', minCards: 3 },
    { phase: PHASES.TURN, label: 'Turn', minCards: 4 },
    { phase: PHASES.RIVER, label: 'River', minCards: 5 },
  ];

  for (const { phase, label, minCards } of postflopPhases) {
    const streetActions = humanActions.filter(a => a.phase === phase);
    if (streetActions.length === 0) continue;

    const allStreetActions = handHistory.filter(a => a.phase === phase);
    const cards = game.communityCards.slice(0, minCards);
    if (cards.length < minCards) continue;

    const eval_ = evaluateHand(human.hand, cards);
    const rawStrength = eval_ ? eval_.strength : 0;
    const handName = eval_ ? (eval_.descr || eval_.name) : 'Unknown';
    const pairType = analyzePairStrength(human.hand, cards, eval_);
    const tripsType = analyzeThreeOfAKind(human.hand, cards, eval_);
    // Adjust strength for pair sub-categories
    const strength = pairType === 'overpair' ? 2
      : (pairType === 'bottom_pair' || pairType === 'underpair') ? 0.5
      : rawStrength;
    const displayName = tripsType ? threeOfAKindLabel(tripsType) : (pairType ? pairLabel(pairType) : handName);
    const board = analyzeBoardTexture(cards);
    const draws = detectDraws(human.hand, cards);
    const isRiver = phase === PHASES.RIVER;

    const opponentBets = allStreetActions.filter(a =>
      a.player !== humanSeat && (a.action === ACTIONS.BET || a.action === ACTIONS.RAISE)
    );
    const facedBet = opponentBets.length > 0;
    const betAmount = opponentBets.length > 0 ? opponentBets[opponentBets.length - 1].amount : 0;
    const betterProfile = facedBet ? getOpponentProfile(game, opponentBets[0].player) : null;

    // Multiway and C-bet awareness
    const activePlayers = game.players.filter(p => !p.folded && !p.sittingOut).length;
    const isMultiway = activePlayers >= 3;
    const isCBetSpot = humanWasPFR && phase === PHASES.FLOP && !facedBet;

    const yourAction = streetActions.map(a => actionLabel(a.action, a.amount)).join(', ');
    let optimal = '';
    let grade = 'ok';

    if (strength >= 6) {
      optimal = `Bet/Raise für Value. Monster-Hand maximal Value extrahieren ${posContext}.`;
      grade = streetActions.some(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE || a.action === ACTIONS.ALLIN) ? 'good' : 'ok';
    } else if (strength >= 4) {
      if (isRiver) {
        optimal = facedBet ? 'Raise für Value.' : 'Value Bet 66-80% Pot — maximalen Value am River extrahieren.';
      } else {
        optimal = facedBet ? 'Raise für Value.' : `Bet 60-75% Pot für Value${board?.isWet ? ' + Protection' : ''} ${posContext}.`;
      }
      grade = streetActions.some(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE) ? 'good' : streetActions.some(a => a.action === ACTIONS.CALL) ? 'ok' : 'bad';
    } else if (strength >= 2) {
      if (isRiver) {
        optimal = facedBet ? 'Call — Thin Value Hand am River.' : 'Thin Value Bet oder Check. Welche schwächeren Hände callen?';
      } else {
        optimal = facedBet ? 'Call oder Raise je nach Board-Textur.' : `Bet 50-66% Pot${board?.isWet ? ' für Protection' : ' für Thin Value'} ${posContext}.`;
      }
      grade = streetActions.some(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE) ? 'good' : streetActions.some(a => a.action === ACTIONS.CALL) ? 'ok' : 'bad';
    } else if (strength === 1) {
      if (facedBet) {
        if (isRiver) {
          optimal = betterProfile?.bluffRate > 0.15
            ? `Bluff-Catch Call — ${betterProfile.name} blufft oft genug.`
            : 'Fold mit schwachem Pair am River gegen Value-Bet.';
        } else {
          optimal = betAmount > game.pot * 0.6 ? 'Call mit Top Pair, Fold mit schwachem Pair.' : 'Call — gute Pot Odds.';
        }
      } else {
        if (isCBetSpot) {
          optimal = board?.isDry ? 'C-Bet 25-33% Pot als PFR.' : 'C-Bet 50-66% Pot für Value + Protection.';
        } else {
          optimal = board?.isWet ? `Bet 50% Pot für Value + Protection ${posContext}.` : `Check oder kleine Bet für Thin Value ${posContext}.`;
        }
      }
      grade = 'ok';
    } else {
      // No made hand
      if (draws.hasFlushDraw || draws.hasStraightDraw) {
        // Discounted outs: on paired or monotone boards, reduce outs
        let rawOuts = draws.isComboDraws ? (draws.hasOESD ? 15 : 12) : draws.hasFlushDraw ? 9 : draws.hasOESD ? 8 : 4;
        let outs = rawOuts;
        if (board?.isPaired && draws.hasFlushDraw) outs = Math.max(rawOuts - 1, 1); // Full house possible for opponent
        if (board?.isMonotone) outs = Math.max(rawOuts - 2, 1); // Higher flush possible

        if (facedBet) {
          const callAmount = betAmount - (human.bet || 0);
          const totalPot = game.pot + callAmount;
          const potOdds = callAmount / totalPot;
          const neededOdds = outs * 2 / 100;
          const impliedOddsFactor = (human.stack > game.pot * 3) ? 1.3 : (human.stack > game.pot) ? 1.15 : 1.0;
          const effectiveOdds = neededOdds * impliedOddsFactor;
          optimal = potOdds < effectiveOdds ? `Call mit ${outs} Outs — Odds stimmen${impliedOddsFactor > 1 ? ' (inkl. Implied Odds)' : ''}.` : `Fold oder Semi-Bluff Raise — Call ist zu teuer.`;
          grade = streetActions.some(a => a.action === ACTIONS.CALL) && potOdds < effectiveOdds ? 'good' : 'ok';
        } else {
          if (isMultiway) {
            optimal = `Check mit Draw in Multiway — Semi-Bluffs weniger effektiv gegen mehrere Gegner.`;
            grade = streetActions.some(a => a.action === ACTIONS.CHECK) ? 'good' : 'ok';
          } else if (isCBetSpot) {
            optimal = `C-Bet als Semi-Bluff mit ${describeDraw(draws)} + Fold Equity + Initiative.`;
            grade = streetActions.some(a => a.action === ACTIONS.BET) ? 'good' : 'ok';
          } else {
            optimal = `Semi-Bluff Bet ${posContext} — ${describeDraw(draws)} + Fold Equity.`;
            grade = streetActions.some(a => a.action === ACTIONS.BET) ? 'good' : 'ok';
          }
        }
      } else {
        if (facedBet) {
          optimal = 'Fold ohne Hand und ohne Draw.';
          grade = streetActions.some(a => a.action === ACTIONS.FOLD) ? 'good' : streetActions.some(a => a.action === ACTIONS.RAISE) ? 'ok' : 'bad';
        } else {
          if (isCBetSpot && board?.isDry && !isMultiway) {
            optimal = `C-Bet als Bluff auf ${board.description} Board — Range-Vorteil als PFR.`;
            grade = streetActions.some(a => a.action === ACTIONS.BET) ? 'good' : 'ok';
          } else if (isMultiway) {
            optimal = 'Check. Ohne Equity in Multiway-Pots nicht bluffen.';
            grade = streetActions.some(a => a.action === ACTIONS.CHECK) ? 'good' : 'ok';
          } else {
            optimal = `Check oder gelegentlich Bluff-Bet auf trockenen Boards ${posContext}.`;
            grade = 'ok';
          }
        }
      }
    }

    streets.push({
      street: label,
      board: cards.map(c => c.rank + c.suit).join(' '),
      boardTexture: board?.description || '',
      handName,
      strength,
      draws: draws.hasFlushDraw || draws.hasStraightDraw ? describeDraw(draws) : null,
      yourAction,
      optimal,
      grade,
      position: posContext,
      context: facedBet
        ? `${betterProfile?.name || 'Gegner'} bettet $${betAmount}${betterProfile ? ` (${betterProfile.style})` : ''}${isMultiway ? ' [Multiway]' : ''}`
        : isCBetSpot ? 'C-Bet Spot (du bist PFR)' : 'Checked to you',
    });
  }

  const grades = streets.map(s => s.grade);
  const goodCount = grades.filter(g => g === 'good').length;
  const badCount = grades.filter(g => g === 'bad').length;
  const overallGrade = badCount > 0 ? 'bad' : goodCount >= grades.length / 2 ? 'good' : 'ok';

  return { streets, overallGrade, humanWon, potSize: result.potWon || 0 };
}

// ================================================================
//  HELPERS
// ================================================================
function actionLabel(action, amount) {
  const labels = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise', bet: 'Bet', allin: 'All-In' };
  const label = labels[action] || action;
  return amount > 0 ? `${label} $${amount}` : label;
}

function phaseLabel(phase) {
  return { flop: 'Flop', turn: 'Turn', river: 'River', preflop: 'Preflop' }[phase] || phase;
}

function getRangePercent(position) {
  const pcts = { UTG: 16, MP: 22, CO: 30, BTN: 45, SB: 45, BB: 55 };
  return pcts[position] || 25;
}

function get3BetAdvice(profile) {
  if (profile.foldToRaiseRate > 0.5) return 'Dieser Spieler foldet sehr oft auf 3-Bets — oefter light 3-betten.';
  if (profile.foldToRaiseRate < 0.2) return 'Dieser Spieler foldet fast nie — nur mit Value 3-betten.';
  if (profile.style === 'Loose-Aggressive' || profile.style === 'Maniac') return 'Gegen LAGs/Maniacs mit Value 3-betten — sie spielen zurück mit schlechteren Händen.';
  if (profile.style === 'Tight-Aggressive') return 'Gegen TAGs selektiver 3-betten — sie haben meistens etwas.';
  return '';
}

function describeDraw(draws) {
  const parts = [];
  if (draws.isComboDraws) return 'Combo-Draw (Flush + Straight)';
  if (draws.hasFlushDraw) parts.push('Flush-Draw');
  if (draws.hasOESD) parts.push('OESD');
  else if (draws.hasGutshot) parts.push('Gutshot');
  if (draws.hasTwoOvercards) parts.push('2 Overcards');
  return parts.join(' + ') || null;
}

// === Session-level tips ===
export function getSessionTips(handResults) {
  const tips = [];
  const totalHands = handResults.length;
  if (totalHands < 5) return tips;

  const folds = handResults.filter(h => h.folded).length;
  const foldRate = folds / totalHands;

  if (foldRate > 0.75) {
    tips.push({
      type: 'warning',
      title: 'Zu tight!',
      message: `Du hast ${Math.round(foldRate * 100)}% deiner Hände gefoldet. In 6-Max solltest du ca. 60-70% folden (VPIP 25-35%).`,
    });
  }
  if (foldRate < 0.55) {
    tips.push({
      type: 'warning',
      title: 'Zu loose!',
      message: `Du spielst ${Math.round((1 - foldRate) * 100)}% deiner Hände. Standard-VPIP in 6-Max ist 25-30%. Fokussiere dich auf bessere Starting Hands.`,
    });
  }

  return tips;
}
