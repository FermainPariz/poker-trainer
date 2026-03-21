// === AI Coach v3: GTO-Based Poker Trainer ===
// Uses Game Theory Optimal (GTO) principles, opponent profiling,
// board texture, equity, outs, pot odds, range advantage, SPR, blockers,
// MDF, equity realization — gives concrete best-move recommendations.

import { ACTIONS, PHASES } from './engine.js';
import { getPreflopStrength, evaluateHand } from './evaluator.js';
import { getCurrentEquity, getCurrentOuts, getPotOdds, getEV } from './hud.js';
import { classifyOpponent, getOpponentStats } from './profiler.js';
import { getHandFrequencies, PREFLOP_RANGES } from './matrix.js';

// === GTO Postflop Data (loaded async) ===
let gtoData = null;
fetch('./data/gto-postflop.json').then(r => r.json()).then(d => { gtoData = d; }).catch(() => {});

// === Rank helpers ===
const RANK_ORDER = 'AKQJT98765432';
const RANK_NAMES = { A: 'Ass', K: 'Koenig', Q: 'Dame', J: 'Bube', T: 'Zehn' };
function rankName(r) { return RANK_NAMES[r] || r; }
function rankValue(r) { return 14 - RANK_ORDER.indexOf(r); }

function normalizeHand(hand) {
  const r1 = hand[0].rank, r2 = hand[1].rank;
  const suited = hand[0].suit === hand[1].suit;
  const [high, low] = RANK_ORDER.indexOf(r1) < RANK_ORDER.indexOf(r2) ? [r1, r2] : [r2, r1];
  const isPair = high === low;
  const gap = Math.abs(rankValue(high) - rankValue(low));
  const connected = gap === 1;
  const oneGap = gap === 2;
  const name = isPair ? `Pocket ${high}${low}` : `${high}${low}${suited ? 's' : 'o'}`;
  return { high, low, suited, isPair, gap, connected, oneGap, name };
}

// === Board Texture Analysis (comprehensive) ===
function analyzeBoard(community) {
  if (community.length < 3) return null;

  const suits = {};
  const rankValues = [];
  const rankCounts = {};

  for (const c of community) {
    suits[c.suit] = (suits[c.suit] || 0) + 1;
    rankValues.push(rankValue(c.rank));
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  }

  const maxSuit = Math.max(...Object.values(suits));
  const flushSuit = maxSuit >= 3 ? Object.entries(suits).find(([, v]) => v >= maxSuit)?.[0] : null;
  const flushComplete = maxSuit >= 5;
  const flushDraw = maxSuit === 4;
  const flushPossible = maxSuit >= 3;
  const isMonotone = community.length >= 3 && community.slice(0, 3).every(c => c.suit === community[0].suit);
  const isRainbow = community.length >= 3 && new Set(community.slice(0, 3).map(c => c.suit)).size === 3;
  const isTwoTone = !isMonotone && !isRainbow && community.length >= 3;

  const uniqueRanks = [...new Set(rankValues)].sort((a, b) => a - b);
  let straightPossible = false;
  let straightComplete = false;
  for (let i = 0; i <= uniqueRanks.length - 3; i++) {
    const span = uniqueRanks[Math.min(i + 4, uniqueRanks.length - 1)] - uniqueRanks[i];
    if (uniqueRanks.length >= 5 && i + 4 < uniqueRanks.length && span === 4) straightComplete = true;
    if (uniqueRanks[Math.min(i + 2, uniqueRanks.length - 1)] - uniqueRanks[i] <= 4) straightPossible = true;
  }

  const boardPaired = Object.values(rankCounts).some(c => c >= 2);
  const boardTrips = Object.values(rankCounts).some(c => c >= 3);
  const doublePaired = Object.values(rankCounts).filter(c => c >= 2).length >= 2;
  const highestRank = Math.max(...rankValues);
  const lowestRank = Math.min(...rankValues);
  const avgRank = rankValues.reduce((a, b) => a + b, 0) / rankValues.length;
  const hasAce = rankValues.includes(14);
  const hasKing = rankValues.includes(13);

  // Board height classification
  const isHighBoard = avgRank >= 11 || (rankValues.filter(v => v >= 10).length >= 2);
  const isLowBoard = avgRank <= 7 && highestRank <= 9;
  const isMediumBoard = !isHighBoard && !isLowBoard;

  // Connectivity analysis
  const sorted = [...rankValues].sort((a, b) => a - b);
  let maxGap = 0;
  let minGap = 99;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0) { // ignore pairs
      maxGap = Math.max(maxGap, gap);
      minGap = Math.min(minGap, gap);
    }
  }
  const spread = sorted[sorted.length - 1] - sorted[0];
  const isConnected = spread <= 4 && minGap <= 2;
  const isDisconnected = spread >= 8 || maxGap >= 5;
  const isGapped = !isConnected && !isDisconnected;

  // Enhanced wetness scoring (0-10 scale)
  let wetness = 0;
  if (isMonotone) wetness += 4;
  else if (flushDraw) wetness += 3;
  else if (flushPossible) wetness += 2;
  if (isRainbow) wetness -= 1;
  if (straightComplete) wetness += 3;
  else if (straightPossible) wetness += 2;
  if (isConnected) wetness += 2;
  if (boardPaired) wetness -= 1; // paired boards reduce draw potential
  if (isDisconnected) wetness -= 1;
  wetness = Math.max(0, Math.min(10, wetness));
  const isWet = wetness >= 4;
  const isDry = wetness <= 1;

  // C-bet favorability for preflop raiser
  // High + dry + rainbow = great for raiser. Low + connected + suited = bad for raiser.
  let raiserAdvantage = 0;
  if (isHighBoard) raiserAdvantage += 2;
  else if (isMediumBoard) raiserAdvantage += 0;
  else raiserAdvantage -= 1;
  if (isDry) raiserAdvantage += 2;
  else if (isWet) raiserAdvantage -= 2;
  if (isRainbow) raiserAdvantage += 1;
  if (hasAce) raiserAdvantage += 1;

  const textures = [];
  if (isMonotone) textures.push('Monoton — Flush dominiert');
  else if (flushComplete) textures.push('Flush auf dem Board');
  else if (flushDraw) textures.push('4 gleiche Farbe — Flush Draw');
  else if (flushPossible) textures.push('3 gleiche Farbe — Flush moeglich');
  if (straightComplete) textures.push('Straight auf dem Board');
  else if (isConnected) textures.push('Connected Board — viele Straight-Moeglichkeiten');
  else if (straightPossible) textures.push('Straight moeglich');
  if (boardTrips) textures.push('Drilling auf dem Board');
  else if (doublePaired) textures.push('Double-Paired — Full House dominiert');
  else if (boardPaired) textures.push('Board gepaart');
  if (isDry && textures.length === 0) textures.push('Trockenes Board — wenig Gefahr');
  if (isHighBoard) textures.push('High Board');
  else if (isLowBoard) textures.push('Low Board');

  return {
    flushPossible, flushDraw, flushComplete, flushSuit,
    isMonotone, isRainbow, isTwoTone,
    straightPossible, straightComplete,
    boardPaired, boardTrips, doublePaired,
    isHighBoard, isLowBoard, isMediumBoard,
    isConnected, isDisconnected, isGapped,
    hasAce, hasKing,
    isWet, isDry, wetness, textures,
    highestRank, lowestRank, avgRank, spread,
    uniqueRanks, rankCounts, rankValues,
    raiserAdvantage,
  };
}

// === Turn/River Card Impact Analysis ===
function analyzeTurnRiverImpact(community, phase) {
  if (phase === PHASES.FLOP || community.length < 4) return null;

  const newCardIdx = phase === PHASES.TURN ? 3 : 4;
  if (newCardIdx >= community.length) return null;
  const newCard = community[newCardIdx];
  const newRV = rankValue(newCard.rank);
  const prevCards = community.slice(0, newCardIdx);
  const prevRanks = prevCards.map(c => rankValue(c.rank));
  const prevSuits = {};
  prevCards.forEach(c => { prevSuits[c.suit] = (prevSuits[c.suit] || 0) + 1; });

  const impact = {
    card: newCard,
    isOvercard: newRV > Math.max(...prevRanks),
    isBrick: false,
    completesFlush: false,
    bringsFlushDraw: false,
    completesStraight: false,
    pairsBoard: prevRanks.includes(newRV),
    isAce: newCard.rank === 'A',
    description: '',
    dangerLevel: 'low', // low, medium, high
  };

  // Flush analysis
  const newSuitCount = (prevSuits[newCard.suit] || 0) + 1;
  if (newSuitCount >= 4 && phase === PHASES.TURN) impact.bringsFlushDraw = true;
  if (newSuitCount >= 4 && phase === PHASES.RIVER) impact.completesFlush = true;

  // Check if new card brings flush draw (3 suited on flop, now 4 suited on turn)
  const allSuits = {};
  community.slice(0, newCardIdx + 1).forEach(c => { allSuits[c.suit] = (allSuits[c.suit] || 0) + 1; });
  const maxSuitNow = Math.max(...Object.values(allSuits));
  if (maxSuitNow === 3 && phase === PHASES.TURN) impact.bringsFlushDraw = true;
  if (maxSuitNow >= 4) {
    if (phase === PHASES.RIVER) impact.completesFlush = true;
    else impact.bringsFlushDraw = true;
  }

  // Straight completion check
  const allRanks = community.slice(0, newCardIdx + 1).map(c => rankValue(c.rank));
  const unique = [...new Set(allRanks)].sort((a, b) => a - b);
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i + 4] - unique[i] === 4) {
      impact.completesStraight = true;
      break;
    }
  }

  // Brick detection
  impact.isBrick = !impact.isOvercard && !impact.completesFlush && !impact.bringsFlushDraw &&
                   !impact.completesStraight && !impact.pairsBoard;

  // Build description
  const parts = [];
  if (impact.isAce) parts.push('Ace am ' + (phase === PHASES.TURN ? 'Turn' : 'River') + ' — veraendert alles');
  else if (impact.isOvercard) parts.push('Overcard — neue hoechste Karte');
  if (impact.completesFlush) parts.push('Flush komplettiert!');
  else if (impact.bringsFlushDraw) parts.push('Flush Draw jetzt moeglich');
  if (impact.completesStraight) parts.push('Straight moeglich!');
  if (impact.pairsBoard) parts.push('Board gepaart — Full House moeglich');
  if (impact.isBrick) parts.push('Brick — aendert wenig');
  impact.description = parts.join('. ');

  // Danger level
  let danger = 0;
  if (impact.completesFlush) danger += 3;
  if (impact.completesStraight) danger += 2;
  if (impact.bringsFlushDraw) danger += 1;
  if (impact.pairsBoard) danger += 1;
  if (impact.isOvercard) danger += 1;
  if (impact.isAce) danger += 1;
  impact.dangerLevel = danger >= 3 ? 'high' : danger >= 1 ? 'medium' : 'low';

  return impact;
}

// === Blocker Analysis ===
// What cards in our hand block opponent's possible holdings
function analyzeBlockers(hand, community, board) {
  if (!board || community.length < 3) return null;

  const holeSuits = hand.map(c => c.suit);
  const holeRanks = hand.map(c => c.rank);
  const blockers = [];
  let bluffValue = 0; // how good our hand is as a bluff (high = good bluff candidate)
  let callValue = 0;  // how confident we can be calling (our blockers reduce opponent combos)

  // Nut flush blocker
  if (board.flushPossible && board.flushSuit) {
    const hasNutFlushBlocker = hand.some(c => c.suit === board.flushSuit && c.rank === 'A');
    const hasKingFlushBlocker = hand.some(c => c.suit === board.flushSuit && c.rank === 'K');
    const hasAnyFlushBlocker = hand.some(c => c.suit === board.flushSuit);

    if (hasNutFlushBlocker) {
      blockers.push('Nut-Flush-Blocker (A' + board.flushSuit + ') — Gegner hat seltener den Nut Flush');
      bluffValue += 3; // excellent bluff candidate
      callValue += 2;
    } else if (hasKingFlushBlocker) {
      blockers.push('K-Flush-Blocker — blockst den 2nd-Nut Flush');
      bluffValue += 2;
      callValue += 1;
    } else if (hasAnyFlushBlocker && board.flushDraw) {
      blockers.push('Flush-Blocker — reduziert Flush-Draw-Combos');
      bluffValue += 1;
    }
  }

  // Set blocker (we hold a card of a board rank → opponent can't have that set)
  const boardRanks = community.map(c => c.rank);
  for (const r of holeRanks) {
    if (boardRanks.includes(r)) {
      blockers.push(`Blockst Set von ${rankName(r)} (hast eine davon)`);
      callValue += 1;
    }
  }

  // Overpair blocker (we hold high cards that block opponent's overpairs)
  if (holeRanks.includes('A')) {
    blockers.push('Blockst AA');
    callValue += 1;
  }
  if (holeRanks.includes('K')) {
    blockers.push('Blockst KK');
    callValue += 1;
  }

  // Straight blocker — if board has straight potential
  if (board.straightPossible) {
    const boardVals = community.map(c => rankValue(c.rank));
    for (const card of hand) {
      const v = rankValue(card.rank);
      // Check if this card would complete a straight
      const allVals = [...boardVals, v];
      const uniq = [...new Set(allVals)].sort((a, b) => a - b);
      for (let i = 0; i <= uniq.length - 5; i++) {
        if (uniq[i + 4] - uniq[i] === 4) {
          blockers.push(`Blockst Straight-Combos (hast ${rankName(card.rank)})`);
          callValue += 1;
          break;
        }
      }
    }
  }

  return {
    blockers,
    bluffValue: Math.min(5, bluffValue),
    callValue: Math.min(5, callValue),
    hasNutBlocker: blockers.some(b => b.includes('Nut-Flush')),
    summary: blockers.length > 0 ? blockers.slice(0, 2).join('. ') + '.' : '',
  };
}

// === SPR (Stack-to-Pot Ratio) Strategy ===
function getSPRStrategy(stack, pot) {
  if (pot <= 0) return null;
  const spr = stack / pot;

  if (spr <= 3) {
    return {
      spr, zone: 'low',
      strategy: 'Low SPR — Commit-oder-Fold. Top Pair+ ist genug zum All-In. Keine halben Sachen.',
      commitThreshold: 1, // pair is enough
    };
  }
  if (spr <= 8) {
    return {
      spr, zone: 'medium',
      strategy: 'Mittlerer SPR — Standard-Poker. Two Pair+ fuer grossen Pot, Top Pair fuer mittleren.',
      commitThreshold: 2, // two pair
    };
  }
  return {
    spr, zone: 'high',
    strategy: 'Hoher SPR — Set-Mining lohnt sich. Implied Odds stark. Kein grosser Pot mit nur einem Paar.',
    commitThreshold: 3, // trips
  };
}

// === MDF (Minimum Defense Frequency) ===
function calculateMDF(pot, betSize) {
  if (betSize <= 0) return null;
  // MDF = pot / (pot + bet) — how often we MUST defend to prevent profitable bluffs
  const mdf = (pot / (pot + betSize)) * 100;
  return {
    mdf: Math.round(mdf),
    description: `MDF: ${Math.round(mdf)}% — du musst mindestens ${Math.round(mdf)}% deiner Range verteidigen, sonst kann der Gegner profitabel mit Luft betten.`,
  };
}

// === Equity Realization Factor ===
// IP realizes ~100% of equity, OOP only ~70-85%
function getEquityRealization(position, handStrength, hasDraw) {
  const inPosition = ['BTN', 'CO', 'BTN/SB'].includes(position);
  if (inPosition) {
    // IP: realize most of equity
    return { factor: hasDraw ? 0.95 : 1.0, note: 'In Position — du realisierst deine Equity fast komplett.' };
  }
  // OOP: draws realize less, made hands realize a bit more
  if (hasDraw) {
    return { factor: 0.7, note: 'Out of Position mit Draw — du realisierst nur ~70% deiner Equity (schwerer den Pot zu kontrollieren).' };
  }
  if (handStrength >= 2) {
    return { factor: 0.85, note: 'OOP mit starker Made Hand — ~85% Equity-Realisierung.' };
  }
  return { factor: 0.75, note: 'OOP — Equity-Realisierung eingeschraenkt (~75%). Position matters!' };
}

// =====================================================
// GTO ENGINE — Range Advantage, C-Bet, Value/Bluff Ratio
// =====================================================

// === Range Advantage: Who has the stronger range on this board? ===
function calculateRangeAdvantage(board, position, wasPFR) {
  if (!board) return { advantage: 'neutral', score: 0, explanation: '' };

  let pfrScore = 0; // positive = PFR advantage, negative = caller advantage

  // High cards favor PFR (more AK, AQ, KQ, Overpairs)
  if (board.hasAce) pfrScore += 3;
  else if (board.hasKing) pfrScore += 2;
  if (board.isHighBoard) pfrScore += 2;
  else if (board.isMediumBoard) pfrScore -= 1;
  else if (board.isLowBoard) pfrScore += 1; // PFR has overpairs

  // Dry boards favor PFR (more overpairs, fewer caller combos)
  if (board.isDry) pfrScore += 2;
  if (board.isRainbow) pfrScore += 1;

  // Connected boards favor caller (suited connectors, small pairs = sets)
  if (board.isConnected) pfrScore -= 3;
  if (board.isMediumBoard && board.isConnected) pfrScore -= 2; // especially bad for PFR

  // Monotone boards favor caller (broader suited range)
  if (board.isMonotone) pfrScore -= 3;

  // Paired boards are neutral-to-PFR
  if (board.boardPaired) pfrScore += 1;

  // Wet boards reduce PFR advantage
  if (board.isWet) pfrScore -= 1;

  let advantage, explanation;
  if (pfrScore >= 3) {
    advantage = 'pfr_strong';
    explanation = 'Raiser hat klaren Range-Advantage — hoch-frequentes C-Bet mit kleinem Sizing (GTO).';
  } else if (pfrScore >= 1) {
    advantage = 'pfr_slight';
    explanation = 'Raiser hat leichten Range-Advantage — moderates C-Bet moeglich.';
  } else if (pfrScore <= -3) {
    advantage = 'caller_strong';
    explanation = 'Caller hat Range-Advantage! Board trifft Caller-Range besser. PFR sollte viel checken.';
  } else if (pfrScore <= -1) {
    advantage = 'caller_slight';
    explanation = 'Caller hat leichten Range-Advantage. PFR selektiver c-betten.';
  } else {
    advantage = 'neutral';
    explanation = 'Ausgeglichener Range-Advantage — Standard-Strategie.';
  }

  return {
    advantage,
    score: pfrScore,
    explanation,
    pfrFavored: pfrScore > 0,
    callerFavored: pfrScore < 0,
  };
}

// === GTO C-Bet Strategy ===
function getGTOCbetStrategy(board, position, wasPFR) {
  if (!board || !wasPFR) return null;

  const inPosition = ['BTN', 'CO', 'BTN/SB'].includes(position);
  const rangeAdv = calculateRangeAdvantage(board, position, wasPFR);

  // Determine board type for GTO lookup
  let boardType = 'high_dry_rainbow'; // default
  if (board.isMonotone) boardType = 'monotone';
  else if (board.boardPaired) boardType = 'paired';
  else if (board.isMediumBoard && board.isConnected) boardType = 'medium_connected';
  else if (board.isHighBoard && board.isWet) boardType = 'high_wet';
  else if (board.isHighBoard && board.isTwoTone) boardType = 'high_dry_twotone';
  else if (board.isHighBoard && board.isDry) boardType = 'high_dry_rainbow';
  else if (board.isLowBoard && board.isDry) boardType = 'low_dry';
  else if (board.isWet) boardType = 'high_wet';

  // Get GTO data if loaded
  const gtoStrat = gtoData?.cbet_strategy?.ip_as_pfr?.[boardType];
  let frequency = gtoStrat?.frequency || 50;
  let sizingPct = gtoStrat?.sizing_pct || 50;
  let reason = gtoStrat?.reason || '';

  // OOP adjustment: reduce frequency by 15%
  if (!inPosition) {
    frequency = Math.max(10, frequency - 15);
    reason += ' (OOP: Frequenz reduziert)';
  }

  return {
    boardType,
    frequency,
    sizingPct,
    reason,
    rangeAdvantage: rangeAdv,
    shouldCbet: true, // will be modified by hand strength check
  };
}

// === GTO Value-to-Bluff Ratio ===
function getValueBluffRatio(betSizePct) {
  // GTO optimal ratios based on bet size
  if (betSizePct >= 150) return { value: 40, bluff: 60, note: 'Overbet: paradoxerweise mehr Bluffs erlaubt (Gegner muss weniger verteidigen)' };
  if (betSizePct >= 100) return { value: 50, bluff: 50, note: 'Pot-Size: 1 Bluff pro 1 Value-Hand' };
  if (betSizePct >= 75) return { value: 57, bluff: 43, note: '3/4 Pot: ~57% Value, ~43% Bluffs' };
  if (betSizePct >= 66) return { value: 60, bluff: 40, note: '2/3 Pot: 60% Value, 40% Bluffs' };
  if (betSizePct >= 50) return { value: 65, bluff: 35, note: '1/2 Pot: 65% Value, 35% Bluffs' };
  if (betSizePct >= 33) return { value: 70, bluff: 30, note: '1/3 Pot: 70% Value, 30% Bluffs' };
  return { value: 75, bluff: 25, note: '1/4 Pot: 75% Value, 25% Bluffs' };
}

// === GTO River Strategy ===
function getRiverGTOAdvice(game, handStrength, board, blockerData, equity) {
  if (game.phase !== PHASES.RIVER) return null;

  const toCall = game.getCallAmount();
  const pot = game.pot + game.getCurrentBetsTotal();
  const human = game.humanPlayer;

  // No bet facing — should we bet?
  if (toCall === 0) {
    if (handStrength >= 3) {
      // Strong hand — value bet
      const sizing = board?.isWet ? 75 : 66;
      return {
        action: 'value_bet',
        note: `River Value-Bet (${sizing}% Pot). GTO: Bette nur wenn schlechtere Haende callen.`,
      };
    }
    if (handStrength === 0 && blockerData && blockerData.bluffValue >= 2) {
      // Busted draw with blockers — bluff candidate
      return {
        action: 'bluff',
        note: `River Bluff-Kandidat! ${blockerData.summary} GTO: Busted Draws mit Blockern sind die besten Bluffs.`,
      };
    }
    if (handStrength <= 1) {
      // Marginal/no showdown value — check or thin value
      return {
        action: 'check',
        note: 'River Check. GTO: Schwache Haende mit Showdown-Value checken. Nicht bluffen ohne Blocker.',
      };
    }
  }

  // Facing a bet — call, fold, or raise?
  if (toCall > 0) {
    const mdf = calculateMDF(pot - toCall, toCall);
    if (handStrength >= 4) {
      return {
        action: 'raise_value',
        note: `River Value-Raise! ${mdf?.description || ''} Monster-Hand — maximiere Value.`,
      };
    }
    if (handStrength >= 1 && handStrength <= 2) {
      // Bluff catcher territory
      return {
        action: 'bluff_catcher',
        note: `Bluff-Catcher Situation. ${mdf?.description || ''} GTO: Du brauchst nur zu glauben, dass der Gegner in >${(100 - (mdf?.mdf || 50))}% der Faelle blufft, damit ein Call profitabel ist.`,
      };
    }
  }

  return null;
}

// === Facing 3-Bet Logic ===
const FACING_3BET = {
  fourbet_value: new Set(['AA', 'KK', 'QQ', 'AKs']),
  fourbet_bluff: new Set(['A5s', 'A4s']),
  call_ip: new Set(['JJ', 'TT', '99', 'AQs', 'AJs', 'ATs', 'KQs', 'QJs', 'JTs', 'T9s', '98s', '87s', '76s', 'AKo', 'AQo']),
  call_oop: new Set(['JJ', 'TT', 'AQs', 'AJs', 'KQs', 'AKo']),
};

function getFacing3BetAdvice(hand, position) {
  const h = normalizeHand(hand);
  const key = h.isPair ? `${h.high}${h.low}` : `${h.high}${h.low}${h.suited ? 's' : 'o'}`;
  const inPosition = ['BTN', 'CO', 'BTN/SB'].includes(position);

  if (FACING_3BET.fourbet_value.has(key)) {
    return { action: '4-Bet', type: 'positive', note: `4-Bet fuer Value! ${h.name} ist stark genug. Sizing: ${inPosition ? '2.5x' : '3x'} der 3-Bet.` };
  }
  if (FACING_3BET.fourbet_bluff.has(key)) {
    return { action: '4-Bet Bluff', type: 'neutral', note: `4-Bet als Bluff (GTO). ${h.name} hat Ace-Blocker (blockst AA/AK) und wird zum Nut-Flush-Draw wenn gecallt.` };
  }
  if (inPosition && FACING_3BET.call_ip.has(key)) {
    return { action: 'Call', type: 'neutral', note: `Call die 3-Bet. ${h.name} hat genug Playability in Position. Set-Mine mit Pairs, realisiere Equity mit suited Hands.` };
  }
  if (!inPosition && FACING_3BET.call_oop.has(key)) {
    return { action: 'Call', type: 'neutral', note: `Call die 3-Bet OOP. ${h.name} ist stark genug, aber passe auf — du hast keine Position.` };
  }

  return { action: 'Fold', type: 'negative', note: `Fold gegen 3-Bet. ${h.name} ist zu schwach. GTO: Nicht jede Hand muss verteidigt werden — nur ~30-40% deiner Opening-Range.` };
}

// === Hand-Board Connection ===
function handBoardConnection(hand, community) {
  const holeRanks = hand.map(c => c.rank);
  const holeSuits = hand.map(c => c.suit);
  const boardRanks = community.map(c => c.rank);
  const boardSuits = community.map(c => c.suit);

  const pairedWithBoard = holeRanks.filter(r => boardRanks.includes(r));
  const boardValues = boardRanks.map(r => rankValue(r));
  const highestBoard = Math.max(...boardValues);
  const hasTopPair = pairedWithBoard.some(r => rankValue(r) === highestBoard);
  const hasOverpair = hand[0].rank === hand[1].rank && rankValue(hand[0].rank) > highestBoard;

  const suitCount = {};
  for (const s of [...holeSuits, ...boardSuits]) {
    suitCount[s] = (suitCount[s] || 0) + 1;
  }
  const hasFlushDraw = holeSuits.some(s => suitCount[s] >= 4) && !holeSuits.some(s => suitCount[s] >= 5);
  const hasFlush = holeSuits.some(s => suitCount[s] >= 5);
  const overcards = holeRanks.filter(r => rankValue(r) > highestBoard);

  return { pairedWithBoard, hasTopPair, hasOverpair, hasFlushDraw, hasFlush, overcards };
}

// === Describe straight draws ===
function describeDraws(hand, community) {
  const allCards = [...hand, ...community];
  const holeValues = new Set(hand.map(c => rankValue(c.rank)));
  let rankVals = [...new Set(allCards.map(c => rankValue(c.rank)))].sort((a, b) => a - b);

  // Add Ace as low (1) for wheel detection (A-2-3-4-5)
  if (rankVals.includes(14)) {
    rankVals = [1, ...rankVals];
  }

  for (let i = 0; i <= rankVals.length - 4; i++) {
    const span = rankVals[i + 3] - rankVals[i];
    // Verify at least one hole card participates in this draw
    const windowVals = rankVals.slice(i, i + 4);
    const holeInDraw = windowVals.some(v => holeValues.has(v) || (v === 1 && holeValues.has(14)));
    if (!holeInDraw) continue;

    if (span === 3) return 'Open-Ended Straight Draw (8 Outs)';
    if (span === 4) {
      let count = 0;
      for (let j = rankVals[i]; j <= rankVals[i + 3]; j++) {
        if (rankVals.includes(j)) count++;
      }
      if (count >= 4) return 'Gutshot Straight Draw (4 Outs)';
    }
  }
  return null;
}

// === Get villain info (who bet/raised last) ===
function getVillainInfo(game) {
  const phaseActions = game.handHistory.filter(a => a.phase === game.phase);
  const bets = phaseActions.filter(a =>
    a.action === ACTIONS.BET || a.action === ACTIONS.RAISE || a.action === ACTIONS.ALLIN
  );
  if (bets.length === 0) return null;

  const lastBet = bets[bets.length - 1];
  const villainSeat = lastBet.player;
  const villain = game.players[villainSeat];
  const classification = classifyOpponent(villainSeat);
  const stats = getOpponentStats(villainSeat);

  return {
    seat: villainSeat,
    name: villain?.name || 'Gegner',
    classification,
    stats,
    type: classification?.key || 'unknown',
    label: classification?.label || 'Unknown',
    action: lastBet.action,
    amount: lastBet.amount,
  };
}

// === Range & Strategy Analysis ===
// Estimates what the opponent likely holds based on their actions this hand
function estimateOpponentRange(game) {
  const history = game.handHistory;
  const community = game.communityCards;
  const phase = game.phase;
  const humanSeat = game.humanSeat;

  // Collect opponent actions across all streets
  const oppActions = {};
  for (const a of history) {
    if (a.player === humanSeat) continue;
    if (!oppActions[a.player]) oppActions[a.player] = [];
    oppActions[a.player].push(a);
  }

  const analyses = [];
  for (const [seatStr, actions] of Object.entries(oppActions)) {
    const seat = parseInt(seatStr);
    const player = game.players[seat];
    if (!player || player.folded || player.sittingOut) continue;

    const stats = getOpponentStats(seat);
    const classification = classifyOpponent(seat);
    const position = game.getPosition(seat);

    // Track aggression per street
    const preflopActions = actions.filter(a => a.phase === 'preflop');
    const flopActions = actions.filter(a => a.phase === 'flop');
    const turnActions = actions.filter(a => a.phase === 'turn');
    const riverActions = actions.filter(a => a.phase === 'river');

    const preflopRaised = preflopActions.some(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.ALLIN);
    const preflopCalled = preflopActions.some(a => a.action === ACTIONS.CALL);
    const flopBet = flopActions.some(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE);
    const flopChecked = flopActions.some(a => a.action === ACTIONS.CHECK);
    const flopCalled = flopActions.some(a => a.action === ACTIONS.CALL);
    const turnBet = turnActions.some(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE);
    const turnChecked = turnActions.some(a => a.action === ACTIONS.CHECK);
    const turnCalled = turnActions.some(a => a.action === ACTIONS.CALL);
    const riverBet = riverActions.some(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE);

    // Count aggressive streets
    const aggressiveStreets = [flopBet, turnBet, riverBet].filter(Boolean).length;
    const totalBetAmount = actions
      .filter(a => a.action === ACTIONS.BET || a.action === ACTIONS.RAISE)
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    // Bet sizing analysis — extract last bet size relative to pot
    const lastBetAction = [...actions].reverse().find(a =>
      a.action === ACTIONS.BET || a.action === ACTIONS.RAISE || a.action === ACTIONS.ALLIN
    );
    let betSizingTell = null;
    if (lastBetAction && lastBetAction.amount > 0) {
      // Approximate pot at time of bet (rough — use current pot as proxy)
      const potAtBet = game.pot + game.getCurrentBetsTotal();
      const betPct = potAtBet > 0 ? (lastBetAction.amount / potAtBet) * 100 : 0;
      if (betPct > 100) {
        betSizingTell = { size: 'overbet', pct: betPct, meaning: 'Overbet = extrem polarisiert (Nuts oder Bluff)' };
      } else if (betPct > 75) {
        betSizingTell = { size: 'large', pct: betPct, meaning: 'Grosser Bet = polarisiert (starke Hand oder Bluff)' };
      } else if (betPct > 35) {
        betSizingTell = { size: 'medium', pct: betPct, meaning: 'Standard-Bet = Value oder Semi-Bluff' };
      } else if (betPct > 0) {
        betSizingTell = { size: 'small', pct: betPct, meaning: 'Kleiner Bet = Blocking Bet, thin Value, oder Draw auf guenstige Odds' };
      }
    }

    // Estimate range based on action pattern
    let rangeEstimate = [];
    let rangeStrength = 'unknown'; // weak, medium, strong, very_strong, polarized
    let confidence = 'low';

    if (community.length >= 3) {
      const board = analyzeBoard(community);
      const boardRanks = community.map(c => c.rank);
      const topCard = boardRanks.sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))[0];
      const flushPossible = board?.flushPossible || false;
      const boardPaired = board?.boardPaired || false;

      // Pattern: Preflop raise + multi-street aggression
      if (preflopRaised && aggressiveStreets >= 2) {
        rangeEstimate = [`Overpair (AA-${topCard}${topCard})`, `Top Pair + starker Kicker (A${topCard}, K${topCard})`, 'Set', 'Starker Draw (Flush/Straight)'];
        rangeStrength = 'very_strong';
        confidence = 'high';
      }
      // Pattern: Preflop raise + bet one street
      else if (preflopRaised && aggressiveStreets === 1) {
        rangeEstimate = [`Top Pair`, `Overpair`, 'C-Bet (kann auch Bluff sein)', 'Draw'];
        rangeStrength = 'medium';
        confidence = 'medium';
        // Adjust by board texture: on dry boards, c-bet can be wider (less meaningful)
        if (board?.isDry && board?.raiserAdvantage >= 3) {
          rangeStrength = 'weak'; // c-bet on dry board = often air
          rangeEstimate.push('Wahrscheinlich C-Bet Bluff (trockenes Board)');
        }
      }
      // Pattern: Preflop call + postflop aggression
      else if (preflopCalled && aggressiveStreets >= 1) {
        rangeEstimate = ['Set (hat preflop gecallt = oft Pocket Pair)', 'Two Pair', 'Starker Draw', `Top Pair (schwacher Kicker)`];
        rangeStrength = 'strong';
        confidence = 'medium';
        if (aggressiveStreets >= 2) {
          rangeEstimate = ['Set (sehr wahrscheinlich)', 'Two Pair', 'Straight/Flush'];
          rangeStrength = 'very_strong';
          confidence = 'high';
        }
      }
      // Pattern: Check-Call line (passive)
      else if (flopCalled || turnCalled) {
        rangeEstimate = ['Mittelstarkes Pair', 'Draw (wartet auf Verbesserung)', 'Schwaches Top Pair'];
        rangeStrength = 'weak';
        confidence = 'medium';
      }
      // Pattern: Check-then-raise (check-raise)
      else if ((flopChecked && flopActions.some(a => a.action === ACTIONS.RAISE)) ||
               (turnChecked && turnActions.some(a => a.action === ACTIONS.RAISE))) {
        rangeEstimate = ['Monster (Set, Two Pair+)', 'Semi-Bluff (starker Draw)', 'Air (Bluff)'];
        rangeStrength = 'polarized';
        confidence = 'high';
      }
      // Pattern: Only checked
      else if (!flopBet && !turnBet && !riverBet) {
        rangeEstimate = ['Schwache Hand / aufgegeben', 'Marginal Hand (Bottom Pair, High Card)', 'Slowplay (selten)'];
        rangeStrength = 'weak';
        confidence = 'low';
      }

      // === Bet sizing adjustments ===
      if (betSizingTell) {
        if (betSizingTell.size === 'overbet') {
          rangeStrength = 'polarized';
          confidence = 'high';
          rangeEstimate.unshift('Overbet = Nuts oder totaler Bluff');
        } else if (betSizingTell.size === 'small' && rangeStrength === 'medium') {
          // Small bet often = blocking or thin value, not monster
          rangeStrength = 'weak';
          rangeEstimate.push('Kleiner Bet = blockt oder thin Value');
        } else if (betSizingTell.size === 'large' && rangeStrength === 'medium') {
          rangeStrength = 'strong';
        }
      }

      // Adjust for specific board textures
      if (flushPossible && aggressiveStreets >= 2) {
        rangeEstimate.push('Flush/Flush-Draw');
      }
      if (boardPaired && aggressiveStreets >= 1) {
        rangeEstimate.push('Full House / Trips moeglich');
      }
      // Monotone board: heavy aggression = likely flush
      if (board?.isMonotone && aggressiveStreets >= 1) {
        rangeEstimate.unshift('Flush sehr wahrscheinlich (monotones Board)');
        if (rangeStrength !== 'very_strong') rangeStrength = 'strong';
      }
      // Connected board: caller from BB has strong range advantage
      if (board?.isConnected && board?.isMediumBoard && preflopCalled) {
        confidence = 'high'; // callers hit connected medium boards hard
      }
    }

    // Player type adjustments
    let typeNote = '';
    if (classification) {
      if (classification.key === 'nit' || classification.key === 'rock') {
        typeNote = `${player.name} ist tight — wenn er bettet, hat er fast immer was.`;
        if (rangeStrength === 'medium') rangeStrength = 'strong';
      } else if (classification.key === 'maniac' || classification.key === 'lag') {
        typeNote = `${player.name} blufft oft — Range ist breiter als normal.`;
        if (rangeStrength === 'strong') rangeStrength = 'medium';
      } else if (classification.key === 'fish' || classification.key === 'whale') {
        typeNote = `${player.name} spielt zu viele Haende — kann alles haben.`;
        confidence = 'low';
      }
    }

    analyses.push({
      seat, name: player.name, position, classification,
      rangeEstimate, rangeStrength, confidence, typeNote,
      preflopRaised, aggressiveStreets, totalBetAmount,
      betSizingTell,
      pattern: describeActionPattern(preflopRaised, preflopCalled, flopBet, flopChecked, flopCalled, turnBet, turnChecked, turnCalled, riverBet),
    });
  }
  return analyses;
}

function describeActionPattern(pfRaise, pfCall, fBet, fCheck, fCall, tBet, tCheck, tCall, rBet) {
  const parts = [];
  if (pfRaise) parts.push('PF-Raise');
  else if (pfCall) parts.push('PF-Call');
  if (fBet) parts.push('Flop-Bet');
  else if (fCall) parts.push('Flop-Call');
  else if (fCheck) parts.push('Flop-Check');
  if (tBet) parts.push('Turn-Bet');
  else if (tCall) parts.push('Turn-Call');
  else if (tCheck) parts.push('Turn-Check');
  if (rBet) parts.push('River-Bet');
  return parts.join(' → ');
}

// Suggest strategic moves (information bets, probe raises, etc.)
function getStrategicOptions(game, equity, handStrength, opponentAnalyses) {
  const human = game.humanPlayer;
  const toCall = game.getCallAmount();
  const pot = game.pot + game.getCurrentBetsTotal();
  const position = game.getPosition(game.humanSeat);
  const inPosition = ['BTN', 'CO', 'BTN/SB'].includes(position);
  const phase = game.phase;
  const options = [];

  // Find most relevant opponent
  const mainOpp = opponentAnalyses.find(a => a.aggressiveStreets > 0) || opponentAnalyses[0];
  if (!mainOpp) return options;

  // === Information Raise ===
  // When you have a marginal hand and want to test the opponent's strength
  if (handStrength >= 1 && handStrength <= 2 && toCall > 0 && toCall < pot * 0.5 && phase !== PHASES.RIVER) {
    if (mainOpp.rangeStrength === 'medium' || mainOpp.rangeStrength === 'weak') {
      options.push({
        move: 'Information-Raise',
        desc: `Raise als Test: Wenn ${mainOpp.name} re-raist, hat er eine starke Hand → Fold. Wenn er callt, hat er wahrscheinlich einen Draw oder marginale Hand. Wenn er foldet, war seine Hand schwach.`,
        risk: 'mittel',
      });
    }
  }

  // === Probe Bet (when checked to you in position) ===
  if (toCall === 0 && inPosition && mainOpp.rangeStrength !== 'very_strong') {
    if (handStrength <= 1) {
      options.push({
        move: 'Probe-Bet (33% Pot)',
        desc: `Kleiner Bet um den Gegner zu testen. ${mainOpp.name} hat gecheckt — das zeigt Schwaeche. Ein kleiner Bet gewinnt den Pot oft sofort oder gibt dir Information ueber seine Hand.`,
        risk: 'niedrig',
      });
    }
  }

  // === Fold tells information ===
  if (mainOpp.rangeStrength === 'weak' || (mainOpp.classification?.key === 'nit' && !mainOpp.preflopRaised)) {
    options.push({
      move: 'Aggression nutzen',
      desc: `${mainOpp.name} zeigt Schwaeche (${mainOpp.pattern}). Eine Bet/Raise wird oft einen Fold erzwingen. Jede gecheckte Hand von einem tighten Gegner ist ein Zeichen von Schwaeche.`,
      risk: 'niedrig',
    });
  }

  // === What opponent fold/call/raise means ===
  if (toCall > 0 && mainOpp.aggressiveStreets >= 1) {
    const foldSignal = mainOpp.rangeStrength === 'very_strong'
      ? `Wenn ${mainOpp.name} auf deinen Raise foldet, war es ein Bluff (unwahrscheinlich bei seiner Linie).`
      : `Wenn ${mainOpp.name} auf deinen Raise foldet, hatte er einen Draw oder schwaches Pair.`;
    const callSignal = `Wenn er callt, hat er wahrscheinlich ein Made Hand (Pair-Two Pair) und will Showdown sehen.`;
    const raiseSignal = `Wenn er RE-RAIST, hat er fast sicher eine starke Hand (Set, Straight, Flush). Dann Fold.`;

    options.push({
      move: 'Read durch Raise',
      desc: `${foldSignal} ${callSignal} ${raiseSignal}`,
      risk: 'hoch',
    });
  }

  return options;
}

// Format range analysis for display in coach bubble
function formatRangeAnalysis(opponentAnalyses, game) {
  if (!opponentAnalyses || opponentAnalyses.length === 0) return '';

  let text = '';
  for (const opp of opponentAnalyses) {
    if (opp.rangeEstimate.length === 0) continue;

    text += `[${opp.name}] Linie: ${opp.pattern}. `;

    // Strength interpretation
    if (opp.rangeStrength === 'very_strong') {
      text += `⚠ STARKE Range: ${opp.rangeEstimate.slice(0, 3).join(', ')}. `;
    } else if (opp.rangeStrength === 'strong') {
      text += `Wahrscheinlich stark: ${opp.rangeEstimate.slice(0, 3).join(', ')}. `;
    } else if (opp.rangeStrength === 'polarized') {
      text += `Polarisiert: Entweder Monster oder Bluff. ${opp.rangeEstimate.slice(0, 2).join(' oder ')}. `;
    } else if (opp.rangeStrength === 'weak') {
      text += `Zeigt Schwaeche: ${opp.rangeEstimate.slice(0, 2).join(', ')}. `;
    } else {
      text += `Moegliche Haende: ${opp.rangeEstimate.slice(0, 2).join(', ')}. `;
    }

    if (opp.betSizingTell) text += `Sizing: ${opp.betSizingTell.meaning}. `;
    if (opp.typeNote) text += opp.typeNote + ' ';
  }
  return text;
}

// === Compute comprehensive recommended action ===
function getRecommendation(game, equity, outs, oppAnalyses) {
  const toCall = game.getCallAmount();
  const pot = game.pot + game.getCurrentBetsTotal();
  const human = game.humanPlayer;
  const stack = human.stack;
  const phase = game.phase;
  const activePlayers = game.players.filter(p => !p.folded && !p.sittingOut && !p.allIn).length;
  const villain = getVillainInfo(game);
  const position = game.getPosition(game.humanSeat);
  const inPosition = ['BTN', 'CO', 'BTN/SB'].includes(position);
  const community = game.communityCards;
  const board = community.length >= 3 ? analyzeBoard(community) : null;
  const eval_ = community.length >= 3 ? evaluateHand(human.hand, community) : null;
  const handStrength = eval_ ? eval_.strength : -1;
  const conn = community.length >= 3 ? handBoardConnection(human.hand, community) : null;
  const hasDraw = conn && (conn.hasFlushDraw || describeDraws(human.hand, community));

  // SPR analysis
  const potBeforeBet = toCall > 0 ? pot - toCall : pot;
  const sprData = getSPRStrategy(stack, Math.max(potBeforeBet, 1));

  // Blocker analysis
  const blockerData = analyzeBlockers(human.hand, community, board);

  // Equity realization factor (IP vs OOP)
  const eqRealization = getEquityRealization(position, handStrength, !!hasDraw);

  // Opponent range strength (from action-based range analysis)
  const mainOppAnalysis = (oppAnalyses || []).find(a => a.aggressiveStreets > 0) || (oppAnalyses || [])[0];
  const oppRangeStrength = mainOppAnalysis?.rangeStrength || 'unknown';

  // Adjust equity down when facing strong opponent ranges
  // Raw equity is vs random — opponent who bets/raises has narrower, stronger range
  let adjustedEquity = equity;
  if (equity !== null && oppRangeStrength === 'very_strong') {
    adjustedEquity = equity * 0.55;
  } else if (equity !== null && oppRangeStrength === 'strong') {
    adjustedEquity = equity * 0.7;
  } else if (equity !== null && oppRangeStrength === 'polarized') {
    adjustedEquity = equity * 0.75;
  } else if (equity !== null && oppRangeStrength === 'medium') {
    adjustedEquity = equity * 0.85;
  }

  // Apply equity realization factor (OOP realizes less equity)
  let realizedEquity = adjustedEquity;
  if (adjustedEquity !== null) {
    realizedEquity = adjustedEquity * eqRealization.factor;
  }

  // Pot odds
  const potOddsData = getPotOdds(game);
  const potOddsPct = potOddsData ? parseFloat(potOddsData.potOdds) : 0;

  // EV of a call
  const callEV = equity !== null && toCall > 0
    ? ((equity / 100) * (pot + toCall)) - toCall
    : null;

  const result = {
    bestAction: null,
    bestSizing: null,
    reasoning: '',
    options: [],
    equity,
    potOddsPct,
    callEV,
    villain,
  };

  // === FACING A BET (toCall > 0) ===
  if (toCall > 0) {
    const spr = sprData?.spr || (stack / Math.max(potBeforeBet, 1));

    // MDF calculation
    const mdfData = calculateMDF(potBeforeBet, toCall);

    // Fold option
    const foldReason = equity !== null && equity < potOddsPct
      ? `Deine Equity (${equity.toFixed(0)}%) < Pot Odds (${potOddsPct.toFixed(0)}%) = unprofitabler Call.`
      : `Spare Chips fuer bessere Spots.`;
    result.options.push({ action: 'Fold', reasoning: foldReason });

    // Call option
    if (equity !== null) {
      const isCallProfitable = equity > potOddsPct;
      const callReason = isCallProfitable
        ? `Equity ${equity.toFixed(0)}% > Pot Odds ${potOddsPct.toFixed(0)}% = +EV Call (EV: ${callEV >= 0 ? '+' : ''}$${callEV.toFixed(0)}).`
        : `Equity ${equity.toFixed(0)}% < Pot Odds ${potOddsPct.toFixed(0)}% = -EV Call (EV: $${callEV.toFixed(0)}).`;
      result.options.push({ action: `Call $${toCall}`, reasoning: callReason });
    }

    // Raise option
    const minRaise = game.getMinRaise();
    const raiseSize = Math.round(Math.max(potBeforeBet * 0.75, minRaise));
    if (stack > toCall) {
      let raiseReason = '';
      if (equity !== null && equity >= 60) {
        raiseReason = `Mit ${equity.toFixed(0)}% Equity bist du klarer Favorit. Raise baut den Pot und maximiert Value.`;
      } else if (equity !== null && equity >= 45 && phase !== PHASES.RIVER) {
        raiseReason = 'Semi-Bluff Raise — du hast genug Equity um profitabel aggressiv zu spielen. Gegner muss oft folden.';
      } else if (villain && (villain.type === 'nit' || villain.type === 'rock') && villain.stats?.foldToBet > 60) {
        raiseReason = `Gegen ${villain.label} (Fold-to-Bet: ${villain.stats.foldToBet}%) ist ein Bluff-Raise profitabel.`;
      } else {
        raiseReason = 'Raise zeigt Staerke und gibt dir die Initiative fuer spaetere Streets.';
      }
      result.options.push({ action: `Raise ~$${raiseSize}`, reasoning: raiseReason });
    }

    // === DECIDE BEST ACTION ===
    // strength: 0=high card, 1=pair, 2=two pair, 3=trips, 4=straight, 5=flush, 6=full house, 7=quads, 8=SF

    // Use realizedEquity (discounted for opponent range + position) for decisions,
    // but show raw equity in text for transparency
    const eqText = equity !== null ? `${equity.toFixed(0)}% vs Random` : '';
    const adjText = adjustedEquity !== null && adjustedEquity !== equity
      ? `, ~${adjustedEquity.toFixed(0)}% vs Range` : '';
    const realText = realizedEquity !== null && realizedEquity !== adjustedEquity
      ? ` (realisiert: ~${realizedEquity.toFixed(0)}%)` : '';
    const eqDisplay = eqText + adjText + realText;

    // SPR context for reasoning
    const sprNote = sprData ? ` SPR: ${sprData.spr.toFixed(1)} (${sprData.zone}).` : '';

    // Blocker context
    const blockerNote = blockerData?.summary ? ` ${blockerData.summary}` : '';

    // Bet sizing tell from opponent
    const sizingNote = mainOppAnalysis?.betSizingTell ? ` ${mainOppAnalysis.betSizingTell.meaning}.` : '';

    if (realizedEquity === null && adjustedEquity === null) {
      result.bestAction = 'Call (keine Equity-Daten)';
      result.reasoning = 'Equity wird berechnet. Entscheide nach Hand-Staerke und Pot Odds.';
    }
    // === LOW SPR: commit-or-fold with top pair+ ===
    else if (sprData && sprData.zone === 'low' && handStrength >= sprData.commitThreshold) {
      result.bestAction = `All-In / Raise auf ~$${raiseSize}`;
      result.reasoning = `${eqDisplay}.${sprNote} Low SPR mit ${eval_?.descr || eval_?.name} — commit! Zu viel im Pot um aufzugeben.`;
      if (villain) result.reasoning += ` ${villainContext(villain, 'value')}`;
    }
    else if (sprData && sprData.zone === 'low' && handStrength < sprData.commitThreshold && adjustedEquity !== null && adjustedEquity < 40) {
      result.bestAction = 'Fold';
      result.reasoning = `${eqDisplay}.${sprNote} Low SPR aber nur ${eval_?.descr || eval_?.name || 'schwache Hand'} — nicht committen. Fold.`;
    }
    // === VALUE RAISE: strong hand + strong adjusted equity ===
    else if (adjustedEquity >= 65 && handStrength >= 2) {
      result.bestAction = `Raise auf ~$${raiseSize}`;
      result.reasoning = `${eqDisplay} mit ${eval_?.descr || eval_?.name || 'starker Hand'} — Raise fuer Value!${sizingNote}`;
      if (villain) result.reasoning += ` ${villainContext(villain, 'value')}`;
    } else if (adjustedEquity >= 55 && handStrength >= 3) {
      result.bestAction = `Raise auf ~$${raiseSize}`;
      result.reasoning = `${eqDisplay} mit ${eval_?.descr || eval_?.name} — stark genug fuer Value-Raise.${sizingNote}`;
      if (villain) result.reasoning += ` ${villainContext(villain, 'value')}`;
    }
    // === CALL: decent hand, not strong enough to raise ===
    else if (adjustedEquity >= 40 && handStrength >= 2) {
      result.bestAction = `Call $${toCall}`;
      const rangeLabel = oppRangeStrength === 'very_strong' ? 'sehr stark' : oppRangeStrength === 'strong' ? 'stark' : 'mittel';
      result.reasoning = `${eqDisplay}. ${eval_?.descr || eval_?.name} ist gut, aber gegen ${rangeLabel}e Gegner-Range nicht zum Raisen.${sprNote}`;
      if (villain) result.reasoning += ` ${villainContext(villain, 'call')}`;
    }
    // === HIGH RAW EQUITY BUT WEAK HAND ===
    else if (equity >= 50 && handStrength <= 1) {
      if (realizedEquity > potOddsPct) {
        result.bestAction = `Call $${toCall}`;
        result.reasoning = `${eqDisplay}. Nur ${eval_?.descr || 'schwache Hand'} — Equity hoch vs Random, aber Gegner bettet (Range staerker). Call auf Pot Odds.${sizingNote}`;
      } else {
        result.bestAction = 'Fold';
        result.reasoning = `${eqDisplay}. ${eval_?.descr || 'Schwache Hand'} gegen aktiven Gegner. Realisierte Equity < Pot Odds (${potOddsPct.toFixed(0)}%). Fold.${sizingNote}`;
      }
    }
    // === MATH CALL: equity > pot odds ===
    else if (realizedEquity > potOddsPct) {
      result.bestAction = `Call $${toCall}`;
      result.reasoning = `${eqDisplay} > Pot Odds ${potOddsPct.toFixed(0)}% — Call ist korrekt.`;
      if (outs && outs.count > 0 && phase !== PHASES.RIVER) {
        result.reasoning += ` ${outs.count} Outs.`;
      }
      if (villain) result.reasoning += ` ${villainContext(villain, 'call')}`;
      if (mdfData) result.reasoning += ` ${mdfData.description}`;
    }
    // === BELOW POT ODDS ===
    else {
      // Implied odds with strong draw + high SPR
      if (outs && outs.count >= 8 && phase === PHASES.FLOP && spr > 3) {
        result.bestAction = `Call $${toCall} (Implied Odds)`;
        result.reasoning = `${eqDisplay} < Pot Odds, aber ${outs.count} Outs + Implied Odds (SPR: ${spr.toFixed(1)}) machen den Call profitabel.`;
      }
      // Bluff-raise vs nit with good blockers
      else if (villain && (villain.type === 'nit' || villain.type === 'rock') && villain.stats?.foldToBet > 65 && stack > raiseSize) {
        result.bestAction = `Bluff-Raise auf ~$${raiseSize}`;
        result.reasoning = `${villain.label} foldet ${villain.stats.foldToBet}% — Bluff profitabel.${blockerNote}`;
      }
      // Bluff-raise with good blockers (flush blocker = great bluff candidate)
      else if (blockerData && blockerData.bluffValue >= 3 && oppRangeStrength !== 'very_strong' && stack > raiseSize && phase !== PHASES.RIVER) {
        result.bestAction = `Semi-Bluff Raise auf ~$${raiseSize}`;
        result.reasoning = `${eqDisplay}. Starke Blocker: ${blockerData.summary} Dein Bluff ist glaubwuerdig.`;
      }
      else {
        result.bestAction = 'Fold';
        result.reasoning = `${eqDisplay}. Realisierte Equity < Pot Odds ${potOddsPct.toFixed(0)}%.${sprNote} Fold. Disziplin!${sizingNote}`;
        if (villain) result.reasoning += ` ${villainContext(villain, 'fold')}`;
      }
    }

  // === NO BET FACING (toCall === 0) — Check or Bet ===
  } else {
    const strength = handStrength;

    // GTO c-bet strategy for sizing decisions
    const wasPFR = game.handHistory.some(a => a.player === game.humanSeat && a.phase === 'preflop' &&
      (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET));
    const gtoCbetLocal = board ? getGTOCbetStrategy(board, game.getPosition(game.humanSeat), wasPFR) : null;

    // Use GTO sizing on flop when we're the PFR, otherwise use street-based sizing
    let betPct;
    if (phase === PHASES.FLOP && gtoCbetLocal && wasPFR) {
      betPct = gtoCbetLocal.sizingPct / 100;
    } else {
      betPct = phase === PHASES.TURN ? 0.75 : 0.66;
      if (board?.isWet && strength >= 2 && strength <= 4) betPct = Math.min(0.85, betPct + 0.15);
      if (board?.isDry && strength >= 1) betPct = Math.max(0.33, betPct - 0.2);
    }
    const betSize66 = Math.round(pot * betPct);
    const betSize33 = Math.round(pot * 0.33);

    // Check option
    result.options.push({
      action: 'Check',
      reasoning: strength >= 3
        ? `Trap-Play — lass den Gegner bluffen.${board?.isDry ? ' Auf trockenem Board sicherer.' : ' Riskiert aber Value zu verlieren.'}`
        : 'Kostenlose Karte sehen. Sicher, aber passiv.'
    });

    // Bet option
    if (equity !== null && equity >= 55) {
      result.options.push({
        action: `Bet ~$${betSize66} (${Math.round(betPct * 100)}% Pot)`,
        reasoning: `${equity.toFixed(0)}% Equity — Value Bet.${board?.isWet ? ' Wet Board — Protection wichtig!' : ''}`
      });
    } else if (activePlayers <= 2 && (equity === null || equity >= 30)) {
      result.options.push({
        action: `Bet ~$${betSize33} (33% Pot)`,
        reasoning: 'Probe-Bet im Heads-Up. Testet den Gegner und gewinnt oft den Pot sofort.'
      });
    }

    // === DECIDE BEST ACTION ===
    const sprBetNote = sprData ? ` SPR: ${sprData.spr.toFixed(1)}.` : '';

    if (equity !== null && equity >= 65 && strength >= 2) {
      result.bestAction = `Bet $${betSize66} (${Math.round(betPct * 100)}% Pot)`;
      result.reasoning = `${equity.toFixed(0)}% Equity mit ${eval_?.descr || eval_?.name} — Value Bet!${board?.isWet ? ' Wet Board — protect!' : ''}`;
    } else if (equity !== null && equity >= 60 && strength >= 2) {
      result.bestAction = `Bet $${betSize66} (${Math.round(betPct * 100)}% Pot)`;
      result.reasoning = `${equity.toFixed(0)}% Equity mit ${eval_?.descr || eval_?.name} — Bet fuer Value.${inPosition ? ' Position nutzen!' : ''}${board?.isDry ? ' Dry Board — kleines Sizing reicht.' : ''}`;
    } else if (equity !== null && equity >= 55 && strength <= 1) {
      // High equity against random but only a weak pair — check for pot control
      result.bestAction = 'Check';
      result.reasoning = `${equity.toFixed(0)}% Equity, aber nur ${eval_?.descr || eval_?.name || 'schwache Hand'}. Check fuer Pot-Kontrolle — schwaches Paar wird selten von schlechteren gecallt.${sprBetNote}`;
    } else if (strength >= 4) {
      // Monster hand: bet for value, but consider trap on dry board
      if (board?.isDry && activePlayers <= 2 && phase !== PHASES.RIVER) {
        result.bestAction = 'Check (Trap)';
        result.reasoning = `${eval_?.descr || eval_?.name} auf trockenem Board. Trap-Play: Check und am Turn/River gross betten. Auf dry Board gibt es wenig Draws die dich einholen.`;
      } else {
        result.bestAction = `Bet $${betSize66} (${Math.round(betPct * 100)}% Pot)`;
        result.reasoning = `${eval_?.descr || eval_?.name} — Monster-Hand. Value-Bet!${board?.isWet ? ' Wet Board — sofort betten, nicht trappen!' : ''}`;
      }
    } else if (activePlayers <= 2 && equity !== null && equity < 40 && strength <= 0) {
      // Bluff opportunity heads-up
      const mainVillain = findMainVillain(game);

      if (phase === PHASES.RIVER && board) {
        const missedDrawBoard = board.flushPossible && !board.flushComplete && board.straightPossible && !board.straightComplete;
        const scaryBoard = board.hasAce || board.isHighBoard;
        const hasGoodBlockers = blockerData && blockerData.bluffValue >= 2;

        if (hasGoodBlockers) {
          result.bestAction = `Bluff Bet $${betSize66}`;
          result.reasoning = `River Bluff mit Blockern: ${blockerData.summary} Dein Bluff ist extra glaubwuerdig weil du Gegner-Value-Haende blockst.`;
        } else if (mainVillain && (mainVillain.type === 'nit' || mainVillain.type === 'rock' || mainVillain.type === 'tag')) {
          result.bestAction = `Bluff Bet $${betSize66}`;
          result.reasoning = `River Bluff gegen ${mainVillain.label}! ${scaryBoard ? 'Scary Board — glaubwuerdig.' : 'Fold-Rate hoch genug.'} Gross betten!`;
        } else if (missedDrawBoard) {
          result.bestAction = `Bluff Bet $${betSize66}`;
          result.reasoning = `Draws auf dem Board nicht angekommen. Repp die verpassten Draws.`;
        } else {
          result.bestAction = 'Check';
          result.reasoning = `${equity.toFixed(0)}% Equity. River ohne gute Bluff-Story — Check/Give Up.`;
        }
      } else if (mainVillain && (mainVillain.type === 'nit' || mainVillain.type === 'rock')) {
        result.bestAction = `Bluff Bet $${betSize33}`;
        result.reasoning = `Gegen ${mainVillain.label}: Bluff profitabel (hohe Fold-Rate).`;
      } else if (inPosition && board?.raiserAdvantage >= 2) {
        // C-bet bluff in position on favorable board
        result.bestAction = `Bet $${betSize33} (33% Pot)`;
        result.reasoning = `In Position auf guenstigem Board (Raiser-Advantage). Kleiner C-Bet gewinnt oft sofort.`;
      } else {
        result.bestAction = 'Check';
        result.reasoning = `${equity !== null ? equity.toFixed(0) + '% Equity — ' : ''}Schwache Hand. Check und kostenlose Karte mitnehmen.${!inPosition ? ' OOP — Check ist korrekt.' : ''}`;
      }
    } else {
      result.bestAction = 'Check';
      if (equity !== null) {
        const posNote = !inPosition ? ' OOP — Check besonders sinnvoll.' : '';
        result.reasoning = `${equity.toFixed(0)}% Equity — Pot Control.${posNote}${sprBetNote}`;
      } else {
        result.reasoning = 'Equity wird berechnet. Check ist die sichere Option.';
      }
    }
  }

  return result;
}

// === GTO Action Frequencies for Button Display ===
// Returns { fold: 0-100, check: 0-100, call: 0-100, raise: 0-100 }
export function getGTOFrequencies(game) {
  const human = game.humanPlayer;
  if (!human || human.folded) return null;

  const equity = getCurrentEquity();
  const outs = getCurrentOuts();
  const phase = game.phase;
  const toCall = game.getCallAmount();
  const pot = game.pot + game.getCurrentBetsTotal();
  const stack = human.stack;
  const community = game.communityCards;
  const board = community.length >= 3 ? analyzeBoard(community) : null;
  const eval_ = community.length >= 3 ? evaluateHand(human.hand, community) : null;
  const handStrength = eval_ ? eval_.strength : -1;
  const position = game.getPosition(game.humanSeat);
  const inPosition = ['BTN', 'CO'].includes(position);
  const potBeforeBet = toCall > 0 ? pot - toCall : pot;
  const potOddsData = getPotOdds(game);
  const potOddsPct = potOddsData ? parseFloat(potOddsData.potOdds) : 0;
  const sprData = getSPRStrategy(stack, Math.max(potBeforeBet, 1));
  const blockerData = analyzeBlockers(human.hand, community, board);
  const eqRealization = getEquityRealization(position, handStrength, false);

  // Preflop: use 169-hand score system from matrix.js (granular per-hand frequencies)
  if (phase === 'preflop') {
    const pos = game.getPosition(game.humanSeat);
    const facingRaise = toCall > game.bigBlind;

    // Normalize hand to matrix key
    const r1 = human.hand[0].rank, r2 = human.hand[1].rank;
    const suited = human.hand[0].suit === human.hand[1].suit;
    const RANK_ORD = 'AKQJT98765432';
    const [high, low] = RANK_ORD.indexOf(r1) < RANK_ORD.indexOf(r2) ? [r1, r2] : [r2, r1];
    let handKey;
    if (high === low) handKey = high + low;
    else handKey = high + low + (suited ? 's' : 'o');

    // Use matrix frequencies (same source as the Range Matrix panel)
    const mf = getHandFrequencies(handKey, pos, facingRaise);
    return { fold: mf.fold, check: mf.check || 0, call: mf.call, raise: mf.raise };
  }

  // Postflop
  if (equity === null) return null; // equity not yet calculated

  // Adjust equity for opponent range
  const oppAnalyses = estimateOpponentRange(game);
  const mainOpp = oppAnalyses.find(a => a.aggressiveStreets > 0) || oppAnalyses[0];
  const oppStr = mainOpp?.rangeStrength || 'unknown';
  let adjEq = equity;
  if (oppStr === 'very_strong') adjEq *= 0.55;
  else if (oppStr === 'strong') adjEq *= 0.7;
  else if (oppStr === 'polarized') adjEq *= 0.75;
  else if (oppStr === 'medium') adjEq *= 0.85;
  const realEq = adjEq * eqRealization.factor;

  // === FACING A BET ===
  if (toCall > 0) {
    const spr = sprData?.spr || (stack / Math.max(potBeforeBet, 1));

    // Low SPR: commit or fold
    if (sprData?.zone === 'low') {
      if (handStrength >= sprData.commitThreshold) return { fold: 0, check: 0, call: 25, raise: 75 };
      if (adjEq < 35) return { fold: 85, check: 0, call: 10, raise: 5 };
    }

    // Monster hand
    if (handStrength >= 4 && adjEq >= 60) {
      return { fold: 0, check: 0, call: 35, raise: 65 };
    }
    if (handStrength >= 3 && adjEq >= 55) {
      return { fold: 0, check: 0, call: 45, raise: 55 };
    }

    // Strong hand — mostly call, some raise
    if (handStrength >= 2 && adjEq >= 45) {
      return { fold: 5, check: 0, call: 65, raise: 30 };
    }

    // Decent draw
    const hasStrongDraw = outs && outs.count >= 8;
    if (hasStrongDraw && phase !== PHASES.RIVER && spr > 3) {
      const bluffVal = blockerData?.bluffValue || 0;
      const raiseFreq = bluffVal >= 3 ? 30 : 10;
      return { fold: 10, check: 0, call: 90 - raiseFreq, raise: raiseFreq };
    }

    // Medium draw
    if (outs && outs.count >= 4 && phase !== PHASES.RIVER) {
      if (realEq > potOddsPct) return { fold: 15, check: 0, call: 75, raise: 10 };
      return { fold: 55, check: 0, call: 40, raise: 5 };
    }

    // Math: equity vs pot odds
    if (realEq > potOddsPct + 10) return { fold: 5, check: 0, call: 75, raise: 20 };
    if (realEq > potOddsPct) return { fold: 15, check: 0, call: 75, raise: 10 };
    if (realEq > potOddsPct - 5) return { fold: 55, check: 0, call: 40, raise: 5 };

    // Well below pot odds
    return { fold: 85, check: 0, call: 12, raise: 3 };
  }

  // === NO BET FACING (Check or Bet) ===
  const wasPFR = game.handHistory.some(a => a.player === game.humanSeat && a.phase === 'preflop' &&
    (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET));
  const gtoCbet = board ? getGTOCbetStrategy(board, position, wasPFR) : null;
  const activePlayers = game.players.filter(p => !p.folded && !p.sittingOut && !p.allIn).length;

  // Monster — bet most of the time
  if (handStrength >= 4) {
    if (board?.isDry && activePlayers <= 2 && phase !== PHASES.RIVER) {
      // Trap on dry board sometimes
      return { fold: 0, check: 35, call: 0, raise: 65 };
    }
    return { fold: 0, check: 10, call: 0, raise: 90 };
  }

  // Strong hand (two pair, trips)
  if (handStrength >= 2 && equity >= 60) {
    return { fold: 0, check: 20, call: 0, raise: 80 };
  }
  if (handStrength >= 2 && equity >= 50) {
    return { fold: 0, check: 35, call: 0, raise: 65 };
  }

  // Good pair with good equity
  if (handStrength >= 1 && equity >= 55) {
    return { fold: 0, check: 45, call: 0, raise: 55 };
  }

  // Medium hand — check for pot control
  if (handStrength >= 1 && equity >= 40) {
    return { fold: 0, check: 65, call: 0, raise: 35 };
  }

  // Weak hand — can we bluff?
  if (handStrength <= 0) {
    // GTO c-bet spot
    if (phase === PHASES.FLOP && wasPFR && gtoCbet) {
      const cbetFreq = gtoCbet.frequency;
      return { fold: 0, check: 100 - cbetFreq, call: 0, raise: cbetFreq };
    }
    // In position bluff
    if (inPosition && activePlayers <= 2 && board?.raiserAdvantage >= 2) {
      return { fold: 0, check: 55, call: 0, raise: 45 };
    }
    // River bluff with blockers
    if (phase === PHASES.RIVER && blockerData?.bluffValue >= 2) {
      return { fold: 0, check: 55, call: 0, raise: 45 };
    }
    return { fold: 0, check: 85, call: 0, raise: 15 };
  }

  // Fallback
  return { fold: 0, check: 60, call: 0, raise: 40 };
}

// === Find main villain (strongest active opponent) ===
function findMainVillain(game) {
  const active = game.players.filter(p => !p.folded && !p.sittingOut && p.id !== game.humanSeat);
  for (const p of active) {
    const c = classifyOpponent(p.id);
    if (c && c.stats?.reliable) return c;
  }
  return active.length > 0 ? classifyOpponent(active[0].id) : null;
}

// === Villain context string ===
function villainContext(villain, context) {
  if (!villain?.classification?.stats?.reliable) return '';
  const v = villain;
  const stats = v.stats;

  if (context === 'value') {
    if (v.type === 'fish' || v.type === 'calling_station') {
      return `${v.label} callt zu oft (VPIP: ${stats.vpip}%) — Value Bet breit!`;
    }
    if (v.type === 'maniac' || v.type === 'lag') {
      return `${v.label} ist aggressiv (AF: ${stats.af}) — er koennte re-raisen. Sei bereit.`;
    }
    if (v.type === 'nit' || v.type === 'rock') {
      return `${v.label} callt nur mit starken Haenden. Kleinere Bet-Groesse waehlen.`;
    }
  }
  if (context === 'call') {
    if (v.type === 'maniac' || v.type === 'lag') {
      return `${v.label} blufft oft — dein Call ist extra profitabel.`;
    }
    if (v.type === 'nit' || v.type === 'rock') {
      return `Achtung: ${v.label} bettet selten ohne starke Hand.`;
    }
  }
  if (context === 'fold') {
    if (v.type === 'nit' || v.type === 'rock') {
      return `${v.label} bettet fast nie ohne Premium — Fold ist korrekt.`;
    }
    if (v.type === 'maniac') {
      return `Aber: ${v.label} blufft oft. Ueberlege ob ein Call doch profitabel ist.`;
    }
  }
  return '';
}

// === Describe remaining outs in detail ===
function describeOutsDetailed(hand, community, outs, conn) {
  if (!outs || outs.count === 0) return '';

  const parts = [];

  if (conn.hasFlushDraw) {
    parts.push('9 Outs zum Flush');
  }
  if (conn.hasFlush) {
    // Already have flush, no draw outs needed
  }

  // Straight draw detection
  const straightDraw = describeDraws(hand, community);
  if (straightDraw) {
    if (straightDraw.includes('Open-Ended')) parts.push('8 Outs zur Straight');
    else if (straightDraw.includes('Gutshot')) parts.push('4 Outs zur Straight');
  }

  if (conn.overcards.length >= 2) {
    parts.push(`${conn.overcards.length * 3} Outs fuer Overcards (${conn.overcards.map(r => rankName(r)).join(', ')})`);
  } else if (conn.overcards.length === 1) {
    parts.push(`3 Outs fuer Overcard ${rankName(conn.overcards[0])}`);
  }

  // Pair improvements
  const holeRanks = hand.map(c => c.rank);
  const boardRanks = community.map(c => c.rank);
  const unpaired = holeRanks.filter(r => !boardRanks.includes(r));
  if (unpaired.length > 0 && parts.length === 0) {
    parts.push(`${unpaired.length * 2} Outs fuer Pair/Set (${unpaired.map(r => rankName(r)).join(', ')})`);
  }

  if (parts.length === 0) return '';

  const cardsLeft = community.length === 3 ? 2 : 1;
  const approxPct = Math.min(outs.count * (cardsLeft === 2 ? 4 : 2), 100);

  // Use HUD outs count (accounts for overlap); parts show draw types qualitatively
  return `Outs: ${outs.count} gesamt (${parts.join(', ')}). ~${approxPct}% Chance sich zu verbessern${cardsLeft === 2 ? ' bis zum River' : ''}.`;
}

// === Possible opponent hands on this board ===
function describeScaryHands(board, eval_) {
  if (!board) return '';
  const threats = [];

  if (board.flushComplete) {
    threats.push('Jeder mit 2 passenden Karten hat einen Flush');
  } else if (board.flushDraw) {
    threats.push('Flush Draw fuer Gegner moeglich');
  }

  if (board.straightComplete) {
    threats.push('Straight auf dem Board — Split moeglich');
  } else if (board.straightPossible) {
    threats.push('Straight moeglich mit den richtigen Hole Cards');
  }

  if (board.boardPaired && eval_ && eval_.strength < 6) {
    threats.push('Full House moeglich (Board gepaart)');
  }

  if (board.hasAce && eval_ && eval_.strength <= 1) {
    threats.push('Jeder mit einem Ass hat Top Pair');
  }

  return threats.length > 0 ? `Gefahren: ${threats.join('. ')}.` : '';
}


// =====================================================
// MAIN EXPORTS — Called from app.js
// =====================================================

// === Preflop Coach Comment ===
export function getPreflopComment(game) {
  const human = game.humanPlayer;
  if (human.hand.length < 2) return null;

  const strength = getPreflopStrength(human.hand);
  const position = game.getPosition(game.humanSeat);
  const h = normalizeHand(human.hand);
  const isLate = ['BTN', 'CO'].includes(position);
  const isBlind = ['SB', 'BB'].includes(position);
  const isEarly = ['UTG', 'MP'].includes(position);

  const preflopActions = game.handHistory.filter(a => a.phase === 'preflop');
  const raises = preflopActions.filter(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.BET || a.action === ACTIONS.ALLIN);
  const facingRaise = raises.length > 0;
  const facingMultipleRaises = raises.length >= 2;
  const facing3Bet = facingMultipleRaises; // 3-bet = re-raise after initial raise
  const facingAllIn = raises.some(a => a.action === ACTIONS.ALLIN);
  const limpers = preflopActions.filter(a => a.action === ACTIONS.CALL && a.player !== game.humanSeat);
  const hasLimpers = limpers.length > 0;

  // Did WE raise and now face a 3-bet?
  const weRaised = preflopActions.some(a => a.player === game.humanSeat && (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET));
  const weRaisedAndFacing3Bet = weRaised && facing3Bet;

  // Get raiser profile if facing raise
  let raiserInfo = '';
  if (facingRaise) {
    const lastRaiser = raises[raises.length - 1];
    const raiserClass = classifyOpponent(lastRaiser.player);
    if (raiserClass?.stats?.reliable) {
      raiserInfo = ` ${game.players[lastRaiser.player]?.name} ist ein ${raiserClass.label} (VPIP: ${raiserClass.stats.vpip}%, PFR: ${raiserClass.stats.pfr}%).`;
    }
  }

  let text = '';
  let bestMove = '';

  // GTO: If we raised and face a 3-bet, use GTO facing-3-bet logic
  if (weRaisedAndFacing3Bet && !facingAllIn) {
    const gto3bet = getFacing3BetAdvice(human.hand, position);
    text = `${h.name} — du wirst 3-bettet! `;
    text += `[GTO] ${gto3bet.note}`;
    if (raiserInfo) text += raiserInfo;
    return { type: gto3bet.type, text };
  }

  if (strength === 'premium') {
    if (h.isPair) {
      text = `${h.name} — Top 1% aller Starthaende! `;
      if (h.high === 'A') text += 'Pocket Asse — die beste Hand im Poker. ';
      else if (h.high === 'K') text += 'Pocket Koenige — nur Asse schlagen dich preflop. ';
    } else {
      text = `${h.name} — Premium Hand. ${h.suited ? 'Suited fuer extra Flush-Equity. ' : ''}`;
    }
    if (facingAllIn) {
      bestMove = `BESTER MOVE: Call All-In! Premium gegen Shove = immer profitabel.`;
      if (raiserInfo) bestMove += raiserInfo;
    } else if (facingRaise) {
      bestMove = `BESTER MOVE: 3-Bet auf ${game.bigBlind * 9}-${game.bigBlind * 12}. Baue den Pot mit deiner starken Hand!`;
      if (raiserInfo) bestMove += raiserInfo;
    } else {
      bestMove = `BESTER MOVE: Raise ${game.bigBlind * 3}-${game.bigBlind * 4} (3-4x BB). Nicht limpen — du willst den Pot aufbauen.`;
    }
    return { type: 'positive', text: text + bestMove };
  }

  if (strength === 'strong') {
    text = `${h.name} — Starke Hand. `;
    if (h.isPair) text += 'Pocket Pair — Ziel: Set auf dem Flop treffen (~12%). ';
    else {
      if (h.suited) text += 'Suited = extra Flush-Equity. ';
      if (h.connected) text += 'Verbunden = Straight-Potential. ';
    }
    if (facingAllIn) {
      if (h.isPair && rankValue(h.high) >= 10) {
        bestMove = `BESTER MOVE: Call All-In. ${h.name} ist stark genug gegen einen Shove.${raiserInfo}`;
        return { type: 'positive', text: text + bestMove };
      }
      bestMove = `BESTER MOVE: Fold. ${h.name} ist gegen All-In zu riskant — nur mit AA/KK/QQ/AK callen.${raiserInfo}`;
      return { type: 'negative', text: text + bestMove };
    }
    if (facingMultipleRaises) {
      bestMove = `BESTER MOVE: Call (bei ${raises.length} Raises nicht 3-betten).${raiserInfo}`;
      return { type: 'neutral', text: text + bestMove };
    }
    if (facingRaise) {
      bestMove = `BESTER MOVE: ${h.isPair ? 'Call fuer Set-Mining.' : '3-Bet auf ~' + (game.bigBlind * 9) + ' oder Call.'} Beides profitabel.${raiserInfo}`;
    } else if (isLate) {
      bestMove = `BESTER MOVE: Raise ${game.bigBlind * 2.5}-${game.bigBlind * 3} aus ${position}. Du hast Position!`;
    } else {
      bestMove = `BESTER MOVE: Open-Raise ${game.bigBlind * 2.5}. Aus ${position} vorsichtiger — viele Spieler hinter dir.`;
    }
    return { type: 'positive', text: text + bestMove };
  }

  if (strength === 'playable') {
    text = `${h.name} — Spielbar, situationsabhaengig. `;
    if (h.isPair) {
      text += rankValue(h.high) <= 8 ? 'Kleines Paar — nur Set-Mining. Ohne Set am Flop: check/fold. ' : '';
    } else if (h.suited && h.connected) {
      text += 'Suited Connector — versteckte Straights/Flushs. Implied Odds! ';
    } else if (h.suited) {
      text += `Suited — Flush-Draw = 4 extra Outs. ${h.high === 'A' ? 'Nut Flush Draw moeglich!' : ''}`;
    }

    if (facingAllIn) {
      bestMove = `BESTER MOVE: Fold. ${h.name} ist viel zu schwach gegen einen All-In Shove.${raiserInfo}`;
      return { type: 'negative', text: text + bestMove };
    }
    if (facingMultipleRaises) {
      bestMove = `BESTER MOVE: Fold. Gegen ${raises.length} Raises zu schwach.`;
      return { type: 'negative', text: text + bestMove };
    }
    if (facingRaise && isEarly) {
      bestMove = `BESTER MOVE: Fold. Zu schwach gegen Raise aus frueher Position.${raiserInfo}`;
      return { type: 'negative', text: text + bestMove };
    }
    if (isLate && !facingRaise) {
      bestMove = hasLimpers
        ? `BESTER MOVE: Iso-Raise ${game.bigBlind * 3 + limpers.length * game.bigBlind} aus ${position}. ${limpers.length} Limper isolieren!`
        : `BESTER MOVE: Open-Raise ${game.bigBlind * 2.5} aus ${position}. Steal die Blinds!`;
      return { type: 'neutral', text: text + bestMove };
    }
    if (isBlind && facingRaise) {
      bestMove = `BESTER MOVE: Call wenn Pot Odds stimmen. Nicht ueberbezahlen.${raiserInfo}`;
      return { type: 'neutral', text: text + bestMove };
    }
    bestMove = isEarly ? 'BESTER MOVE: Fold oder kleiner Raise — Vorsicht aus frueher Position.' : 'BESTER MOVE: Call oder kleiner Raise.';
    return { type: 'neutral', text: text + bestMove };
  }

  // Weak hand
  text = `${h.name} — Schwache Hand. `;
  if (h.gap >= 4 && !h.suited) text += 'Grosser Gap, offsuited — kein Potential. ';
  else if (h.gap >= 4 && h.suited) text += 'Grosser Gap, aber suited — einziger Vorteil ist Flush-Draw. ';
  else if (!h.suited && !h.connected) text += 'Offsuited, nicht verbunden — kein Potential. ';
  else if (h.suited) text += 'Immerhin suited, aber Raenge zu schwach. ';
  else if (h.connected && !h.suited) text += 'Verbunden, aber offsuited — zu schwache Raenge fuer profitables Spiel. ';

  if (facingAllIn) {
    bestMove = `BESTER MOVE: Fold! Schwache Hand gegen All-In = Chips verbrennen.`;
    return { type: 'negative', text: text + bestMove };
  }

  // Only steal with weak hands that have SOME playability:
  // - suited (flush potential), OR
  // - connected/one-gap (straight potential), OR
  // - at least one broadway card (A/K/Q/J/T)
  // AND only from BTN (best position), not CO — CO steal range should be tighter
  const hasPlayability = h.suited || h.connected || h.oneGap || 'AKQJT'.includes(h.high);
  const isBTN = position === 'BTN' || position === 'BTN/SB';

  if (isBTN && !facingRaise && hasPlayability) {
    bestMove = hasLimpers
      ? `BESTER MOVE: Iso-Raise ${game.bigBlind * 3 + limpers.length * game.bigBlind} vom Button (${limpers.length} Limper isolieren). Fold bei 3-Bet.`
      : `BESTER MOVE: Steal-Raise ${game.bigBlind * 2.5} vom Button (Blinds klauen). Fold wenn jemand 3-bettet.`;
    return { type: 'neutral', text: text + bestMove };
  }
  if (isBlind && !facingRaise) {
    bestMove = 'BESTER MOVE: Check (BB) / Fold (SB). Kostenloser Flop im BB mitnehmen.';
    return { type: 'neutral', text: text + bestMove };
  }
  bestMove = 'BESTER MOVE: Fold. Disziplin = langfristiger Profit.';
  return { type: 'negative', text: text + bestMove };
}

// === Situation Comment (human's turn to act — MAIN COACHING MOMENT) ===
export function getSituationComment(game) {
  const human = game.humanPlayer;
  if (human.folded) return null;

  const phase = game.phase;
  const equity = getCurrentEquity();
  const outs = getCurrentOuts();
  const toCall = game.getCallAmount();

  // Preflop: only show situation comment when facing an actual raise/bet.
  // In unopened pots, the preflop comment (range-based) is better than equity-only advice
  // because equity ignores fold equity from raising.
  if (phase === 'preflop') {
    const preflopAggression = game.handHistory.filter(a =>
      a.phase === 'preflop' && (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET || a.action === ACTIONS.ALLIN)
    );
    if (preflopAggression.length === 0) return null;
  }

  // Analyze opponent ranges based on their betting patterns
  const oppAnalyses = phase !== 'preflop' ? estimateOpponentRange(game) : [];
  const eval_ = game.communityCards.length >= 3 ? evaluateHand(human.hand, game.communityCards) : null;
  const handStrength = eval_ ? eval_.strength : -1;

  // Pass range info to recommendation engine (keeps reasoning text)
  const rec = getRecommendation(game, equity, outs, oppAnalyses);

  // Override best action with GTO frequencies — same source as button percentages
  // This ensures coach recommendation and button labels never contradict
  const gtoFreqs = getGTOFrequencies(game);
  if (gtoFreqs) {
    const actionLabels = { fold: 'Fold', check: 'Check', call: 'Call', raise: toCall > 0 ? 'Raise' : 'Bet' };
    let bestKey = 'check';
    let bestPct = -1;
    for (const key of Object.keys(actionLabels)) {
      if ((gtoFreqs[key] || 0) > bestPct) {
        bestPct = gtoFreqs[key] || 0;
        bestKey = key;
      }
    }

    // Add sizing recommendation for raise/bet actions
    let sizingText = '';
    if (bestKey === 'raise' || bestKey === 'call') {
      const pot = game.pot + game.getCurrentBetsTotal();
      const stack = human.stack;
      if (bestKey === 'raise' && toCall > 0) {
        // Facing a bet — raise sizing
        const potBeforeBet = pot - toCall;
        const minRaise = game.getMinRaise();
        const raiseSize = Math.round(Math.max(potBeforeBet * 0.75, minRaise));
        if (raiseSize >= stack) {
          sizingText = ' All-In';
        } else {
          sizingText = ` auf ~$${raiseSize}`;
        }
      } else if (bestKey === 'raise' && toCall === 0) {
        // No bet facing — bet sizing based on board texture and phase
        const board_ = game.communityCards.length >= 3 ? analyzeBoard(game.communityCards) : null;
        const phase_ = game.phase;
        const wasPFR_ = game.handHistory.some(a => a.player === game.humanSeat && a.phase === 'preflop' &&
          (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET));
        const gtoCbet_ = board_ ? getGTOCbetStrategy(board_, game.getPosition(game.humanSeat), wasPFR_) : null;
        let betPct;
        if (phase_ === PHASES.FLOP && gtoCbet_ && wasPFR_) {
          betPct = gtoCbet_.sizingPct / 100;
        } else {
          betPct = phase_ === PHASES.TURN ? 0.75 : 0.66;
          if (board_?.isWet) betPct = Math.min(0.85, betPct + 0.15);
          if (board_?.isDry) betPct = Math.max(0.33, betPct - 0.2);
        }
        const betSize = Math.round(pot * betPct);
        sizingText = ` $${betSize} (${Math.round(betPct * 100)}% Pot)`;
      } else if (bestKey === 'call' && toCall > 0) {
        sizingText = ` $${toCall}`;
      }
    }

    const label = actionLabels[bestKey];
    rec.bestAction = `${label}${sizingText} (GTO ${bestPct}%)`;

    // Override reasoning when GTO action disagrees with recommendation to avoid contradictions
    // e.g. GTO says Fold but old reasoning says "Call ist korrekt"
    const recActionType = rec.reasoning?.includes('Call') && !rec.reasoning?.includes('nicht call')
      ? 'call' : rec.reasoning?.includes('Fold') ? 'fold' : rec.reasoning?.includes('Raise') ? 'raise' : 'check';
    if (bestKey !== recActionType && equity !== null) {
      const eqStr = `${equity.toFixed(0)}%`;
      const potOddsData = getPotOdds(game);
      const potOddsPct = potOddsData ? parseFloat(potOddsData.potOdds) : 0;
      if (bestKey === 'fold') {
        rec.reasoning = toCall > 0
          ? `${eqStr} vs Random, aber gegen Gegner-Range deutlich weniger. Fold spart Chips fuer bessere Spots.`
          : `Schwache Hand — Check wuerde auch gehen, aber GTO bevorzugt Fold.`;
      } else if (bestKey === 'call') {
        rec.reasoning = `${eqStr} Equity > ${potOddsPct.toFixed(0)}% Pot Odds — mathematisch profitabler Call.`;
      } else if (bestKey === 'raise') {
        rec.reasoning = toCall > 0
          ? `Starke Hand/Position. Raise baut den Pot und setzt Gegner unter Druck.`
          : `${eqStr} Equity — Bet fuer Value oder als Bluff mit Fold-Equity.`;
      } else if (bestKey === 'check') {
        rec.reasoning = `Pot-Kontrolle mit ${eqStr} Equity. Keine Notwendigkeit den Pot aufzublaehen.`;
      }
    }
  }

  // Board, blocker, SPR, GTO analysis for context
  const board = game.communityCards.length >= 3 ? analyzeBoard(game.communityCards) : null;
  const conn = game.communityCards.length >= 3 ? handBoardConnection(human.hand, game.communityCards) : null;
  const blockerData = analyzeBlockers(human.hand, game.communityCards, board);
  const turnImpact = analyzeTurnRiverImpact(game.communityCards, phase);

  // GTO: Range advantage and c-bet strategy
  const position = game.getPosition(game.humanSeat);
  const wasPFR = game.handHistory.some(a => a.player === game.humanSeat && a.phase === 'preflop' &&
    (a.action === ACTIONS.RAISE || a.action === ACTIONS.BET));
  const rangeAdv = board ? calculateRangeAdvantage(board, position, wasPFR) : null;
  const gtoCbet = board ? getGTOCbetStrategy(board, position, wasPFR) : null;
  const riverGTO = getRiverGTOAdvice(game, handStrength, board, blockerData, equity);

  // Build rich coaching text
  let text = '';

  // Line 1: Best move recommendation
  if (rec.bestAction) {
    text += `➤ ${rec.bestAction}. `;
  }

  // Line 2: Reasoning
  if (rec.reasoning) {
    text += rec.reasoning + ' ';
  }

  // Line 3: GTO context (range advantage + c-bet on flop when checked to us)
  if (phase === PHASES.FLOP && game.getCallAmount() === 0 && wasPFR && gtoCbet) {
    text += `[GTO] ${gtoCbet.rangeAdvantage.explanation} C-Bet-Freq: ${gtoCbet.frequency}% bei ${gtoCbet.sizingPct}% Pot. `;
  }

  // Line 3b: River GTO
  if (riverGTO) {
    text += `[GTO] ${riverGTO.note} `;
  }

  // Line 4: Turn/River impact (when a new card just came)
  if (turnImpact && turnImpact.description && !turnImpact.isBrick) {
    text += `Neue Karte: ${turnImpact.description}. `;
  }

  // Line 5: Opponent range reading (postflop)
  if (oppAnalyses.length > 0) {
    const rangeText = formatRangeAnalysis(oppAnalyses, game);
    if (rangeText) text += rangeText;
  }

  // Line 6: Strategic options (information bets, probe raises)
  if (phase !== 'preflop' && phase !== 'showdown') {
    const strategies = getStrategicOptions(game, equity, handStrength, oppAnalyses);
    if (strategies.length > 0) {
      const best = strategies[0];
      text += `💡 ${best.move}: ${best.desc} `;
    }
  }

  // Line 7: Blocker info (when relevant for decision — marginal spots)
  if (blockerData && blockerData.blockers.length > 0 && handStrength <= 2) {
    text += `Blocker: ${blockerData.summary} `;
  }

  // Line 8: Board + outs analysis (postflop only, and only for weak/drawing hands)
  if (game.communityCards.length >= 3 && phase !== PHASES.RIVER) {
    if (handStrength <= 2 && conn) {
      const outsDesc = describeOutsDetailed(human.hand, game.communityCards, outs, conn);
      if (outsDesc) text += outsDesc + ' ';
    }
  }

  // Line 9: Board dangers
  if (game.communityCards.length >= 3 && board) {
    const scary = describeScaryHands(board, eval_);
    if (scary) text += scary;
  }

  // Determine comment type based on recommendation
  let type = 'neutral';
  if (rec.bestAction?.includes('Fold')) type = 'negative';
  else if (rec.bestAction?.includes('Raise') || rec.bestAction?.includes('Bet')) type = 'positive';
  else if (rec.bestAction?.includes('Bluff')) type = 'warning';

  return { type, text: text.trim() };
}

// === Postflop Coach Comment (new street — board analysis) ===
export function getPostflopComment(game) {
  const human = game.humanPlayer;
  if (human.folded || human.hand.length < 2 || game.communityCards.length < 3) return null;

  const eval_ = evaluateHand(human.hand, game.communityCards);
  if (!eval_) return null;

  const phase = game.phase;
  const street = phase === PHASES.FLOP ? 'Flop' : phase === PHASES.TURN ? 'Turn' : 'River';
  const board = analyzeBoard(game.communityCards);
  const conn = handBoardConnection(human.hand, game.communityCards);
  const equity = getCurrentEquity();
  const turnImpact = analyzeTurnRiverImpact(game.communityCards, phase);
  const position = game.getPosition(game.humanSeat);
  const sprData = getSPRStrategy(human.stack, Math.max(game.pot + game.getCurrentBetsTotal(), 1));

  if (!board) return null;

  const handDesc = eval_.descr || eval_.name;
  const boardDesc = board.textures.join('. ');
  let comment = `${street}: ${handDesc}`;
  if (equity !== null) comment += ` (Equity: ${equity.toFixed(0)}%)`;
  comment += '. ';

  // Turn/River impact
  if (turnImpact && !turnImpact.isBrick) {
    comment += `⚡ ${turnImpact.description}. `;
  }

  // Board texture description
  comment += `Board: ${boardDesc}. `;

  // SPR context for strategy
  if (sprData && sprData.zone === 'low') {
    comment += `SPR ${sprData.spr.toFixed(1)} (niedrig) — Commit-oder-Fold! `;
  }

  // Hand connection analysis with enhanced board context
  if (eval_.strength >= 6) {
    comment += 'MONSTER! Spiele aggressiv — maximaler Value. ';
  } else if (eval_.strength === 5) {
    const isNutFlush = human.hand.some(c => c.rank === 'A' && c.suit === board.flushSuit);
    comment += isNutFlush ? 'Nut Flush — bestmoegliche Hand! Gross betten. ' : 'Flush, aber nicht der hoechste. Vorsicht bei starker Action. ';
    if (board.boardPaired) comment += 'Board gepaart — Full House moeglich! ';
    if (board.doublePaired) comment += 'Double-Paired — Full House dominiert! ';
  } else if (eval_.strength === 4) {
    comment += 'Straight! ';
    if (board.flushPossible) comment += 'ABER Flush moeglich — Straight verliert gegen Flush. ';
    if (board.isMonotone) comment += 'MONOTONES Board — Flush extrem wahrscheinlich beim Gegner! ';
  } else if (eval_.strength === 3) {
    const isSet = human.hand[0].rank === human.hand[1].rank;
    comment += isSet ? 'Set — versteckter Drilling, schwer zu erkennen! ' : 'Trips — Kicker beachten. ';
    if (board.isWet) comment += 'Nasses Board — Draws drohen. Protect dein Set! ';
  } else if (eval_.strength === 2) {
    comment += 'Two Pair. ';
    if (board.flushPossible) comment += 'Flush-Gefahr! Pot Control. ';
    if (board.boardPaired) comment += 'Board gepaart — Vorsicht vor Full House. ';
    if (board.isConnected) comment += 'Connected Board — Straight-Gefahr! ';
  } else if (eval_.strength === 1) {
    if (conn.hasOverpair) comment += 'Overpair — hoeher als alle Board-Karten. ';
    else if (conn.hasTopPair) comment += 'Top Pair. ';
    else comment += 'Niedriges/mittleres Paar — Pot Control! ';
  }

  // Draws (flop/turn only)
  if (eval_.strength <= 1 && game.phase !== PHASES.RIVER) {
    const outs = getCurrentOuts();
    const outsDesc = describeOutsDetailed(human.hand, game.communityCards, outs, conn);
    if (outsDesc) comment += outsDesc + ' ';
  }

  // Scary hands
  const scary = describeScaryHands(board, eval_);
  if (scary) comment += scary;

  // Type
  let type = 'neutral';
  if (eval_.strength >= 4) type = 'positive';
  else if (eval_.strength >= 2) type = 'neutral';
  else if (conn.hasFlushDraw || conn.overcards.length >= 2) type = 'neutral';
  else type = 'negative';

  return { type, text: comment.trim() };
}

// === Action Review (AFTER player acts — evaluate decision quality) ===
export function getActionComment(action, game, callAmount) {
  const human = game.humanPlayer;
  const equity = getCurrentEquity();
  const eval_ = game.communityCards.length >= 3 ? evaluateHand(human.hand, game.communityCards) : null;
  const strength = eval_ ? eval_.strength : -1;
  const pot = game.pot + game.getCurrentBetsTotal();
  const phase = game.phase;
  const h = normalizeHand(human.hand);

  switch (action) {
    case ACTIONS.FOLD: {
      if (phase === 'preflop') {
        const preflopStr = getPreflopStrength(human.hand);
        if (preflopStr === 'premium') {
          return { type: 'warning', text: `Fold mit ${h.name}?! Premium-Hand gefoldet. Nur bei massiver 4-Bet+ Action von einem Nit vertretbar.` };
        }
        if (preflopStr === 'strong') {
          return { type: 'warning', text: `Fold mit ${h.name}? Starke Hand aufgegeben. War die Action davor wirklich so stark?` };
        }
        return { type: 'neutral', text: `Fold mit ${h.name}. Disziplin — warte auf bessere Spots.` };
      }
      // Compare equity to pot odds, not a fixed threshold
      const foldPotOdds = getPotOdds(game);
      const foldNeeded = foldPotOdds ? parseFloat(foldPotOdds.potOdds) : 33;
      if (equity !== null && equity > foldNeeded + 5) {
        return { type: 'warning', text: `Fold mit ${equity.toFixed(0)}% Equity (${eval_?.descr || h.name})? Pot Odds brauchten nur ${foldNeeded.toFixed(0)}%. Das war zu tight!` };
      }
      if (strength >= 2) {
        return { type: 'warning', text: `Fold mit ${eval_.descr || eval_.name}? Starke Hand aufgegeben. Pruefe ob der Gegner wirklich so stark war.` };
      }
      if (equity !== null && equity > foldNeeded) {
        return { type: 'neutral', text: `Fold mit ${equity.toFixed(0)}% Equity. Knapp an der Grenze (${foldNeeded.toFixed(0)}% noetig). Vertretbar, aber grenzwertig.` };
      }
      return { type: 'neutral', text: `Fold. ${equity !== null ? `Equity war ${equity.toFixed(0)}% bei ${foldNeeded.toFixed(0)}% Pot Odds — ` : ''}Richtige Entscheidung. Chips gespart fuer bessere Spots.` };
    }

    case ACTIONS.CHECK: {
      if (equity !== null && equity >= 65 && strength >= 2) {
        return { type: 'warning', text: `Check mit ${equity.toFixed(0)}% Equity und ${eval_.descr || eval_.name}? Du verlierst massiv Value! Bette ~66% Pot.` };
      }
      if (strength >= 4) {
        return { type: 'warning', text: `Check mit ${eval_.descr || eval_.name}? Monster gecheckt! Nur als Trap-Play vertretbar.` };
      }
      if (strength >= 2 && eval_) {
        const board = analyzeBoard(game.communityCards);
        if (board?.isDry) {
          return { type: 'warning', text: `Check mit ${eval_.descr || eval_.name} auf trockenem Board? Dein Gegner bezahlt dich hier haeufig.` };
        }
        return { type: 'neutral', text: `Check mit ${eval_.descr || eval_.name}. ${equity !== null ? `Equity: ${equity.toFixed(0)}%. ` : ''}Pot Control auf nassem Board kann richtig sein.` };
      }
      return { type: 'neutral', text: `Check. ${equity !== null ? `Equity: ${equity.toFixed(0)}%. ` : ''}Kontrolliertes Spiel — auf der naechsten Street reagieren.` };
    }

    case ACTIONS.CALL: {
      if (callAmount <= 0 || pot <= 0) return null;
      const potOdds = (callAmount / (pot + callAmount) * 100).toFixed(0);
      let comment = `Call $${callAmount}. `;

      if (equity !== null) {
        const isGoodCall = equity > parseFloat(potOdds);
        if (isGoodCall) {
          comment += `Equity ${equity.toFixed(0)}% > Pot Odds ${potOdds}% — profitabler Call! `;
          if (equity >= 60) comment += 'Hast du ueber einen Raise nachgedacht? Bei so hoher Equity ist Value-Raise besser.';
        } else {
          comment += `Equity ${equity.toFixed(0)}% < Pot Odds ${potOdds}% — mathematisch unprofitabel. `;
          const outs = getCurrentOuts();
          if (outs && outs.count >= 8) {
            comment += `Aber ${outs.count} Outs + Implied Odds koennen es rechtfertigen.`;
          } else {
            comment += 'Naechstes Mal besser folden.';
          }
        }
      } else {
        comment += `Pot Odds: ${potOdds}%. `;
        if (strength >= 2) comment += 'Gute Hand — Call ist in Ordnung.';
        else comment += 'Achte auf Pot Odds und Implied Odds.';
      }
      return { type: 'neutral', text: comment.trim() };
    }

    case ACTIONS.BET:
    case ACTIONS.RAISE: {
      if (equity !== null && equity >= 60) {
        return { type: 'positive', text: `Raise mit ${equity.toFixed(0)}% Equity — perfekt! Maximaler Value. ${eval_?.descr ? `${eval_.descr}.` : ''}` };
      }
      if (equity !== null && equity >= 45 && phase !== PHASES.RIVER) {
        return { type: 'positive', text: `Raise mit ${equity.toFixed(0)}% Equity. Guter Semi-Bluff — genug Equity um profitabel aggressiv zu spielen.` };
      }
      if (strength >= 4) {
        return { type: 'positive', text: `Raise mit ${eval_.descr || eval_.name}! Monster-Hand — Value maximieren.` };
      }
      if (strength <= 0) {
        const activePlayers = game.players.filter(p => !p.folded && !p.sittingOut).length;
        if (activePlayers <= 2) {
          return { type: 'neutral', text: `Bluff-Raise im Heads-Up. ${equity !== null ? `Equity: ${equity.toFixed(0)}%. ` : ''}Guter Spot wenn die Board-Story stimmt.` };
        }
        return { type: 'warning', text: `Bluff gegen ${activePlayers} Gegner. ${equity !== null ? `Nur ${equity.toFixed(0)}% Equity. ` : ''}Riskant — je mehr Spieler, desto eher callt jemand.` };
      }
      return { type: 'neutral', text: `Raise. ${equity !== null ? `Equity: ${equity.toFixed(0)}%. ` : ''}Aggressive Spielweise ist langfristig profitabel.` };
    }

    case ACTIONS.ALLIN: {
      if (equity !== null) {
        if (equity >= 65) {
          return { type: 'positive', text: `All-In mit ${equity.toFixed(0)}% Equity (${eval_?.descr || h.name})! Du bist klarer Favorit. Maximaler Value!` };
        }
        if (equity >= 45) {
          return { type: 'neutral', text: `All-In mit ${equity.toFixed(0)}% Equity. Knapp — Coin-Flip oder leicht favorisiert. Hohe Varianz.` };
        }
        return { type: 'warning', text: `All-In mit nur ${equity.toFixed(0)}% Equity (${eval_?.descr || h.name}). Riskant! ${equity < 30 ? 'Eher Fold naechstes Mal.' : 'Implied Odds muessen stimmen.'}` };
      }
      if (strength >= 3) {
        return { type: 'positive', text: `All-In mit ${eval_.descr || eval_.name}! Starke Hand — wenn der Gegner callt, bist du Favorit.` };
      }
      return { type: 'warning', text: `All-In Bluff! Maximale Varianz. Nur vertretbar wenn die Board-Story glaubwuerdig ist.` };
    }

    default:
      return null;
  }
}

// === AI Action Commentary (with opponent profiling) ===
export function getAIActionComment(game, seatIndex, action, amount) {
  const player = game.players[seatIndex];
  if (!player) return null;

  const name = player.name;
  const phase = game.phase;
  const classification = classifyOpponent(seatIndex);
  const stats = getOpponentStats(seatIndex);
  const profileTag = classification?.stats?.reliable ? ` [${classification.label}]` : '';

  if (action === ACTIONS.CHECK) return null;
  if (action === ACTIONS.FOLD && phase === 'preflop') return null;

  if (action === ACTIONS.ALLIN) {
    let text = `${name}${profileTag} geht All-In! `;
    if (classification?.stats?.reliable) {
      if (classification.key === 'nit' || classification.key === 'rock') {
        text += 'ACHTUNG: Dieser Spieler ist extrem tight — All-In bedeutet fast sicher eine Monster-Hand. Nur mit Premium callen!';
      } else if (classification.key === 'maniac' || classification.key === 'lag') {
        text += `Dieser Spieler ist aggressiv (AF: ${stats.af}) — All-In kann auch ein Bluff sein. Prüfe deine Equity!`;
      } else if (classification.key === 'fish') {
        text += 'Fish geht All-In — koennte alles sein. Calle breit mit anstaendiger Hand.';
      } else {
        text += 'Ueberlege genau: Monster oder Bluff?';
      }
    } else {
      text += 'Ueberlege genau: hat er eine Monster-Hand oder blufft er?';
    }
    return { type: 'warning', text };
  }

  if (action === ACTIONS.RAISE || action === ACTIONS.BET) {
    if (phase === 'preflop') {
      if (classification?.stats?.reliable) {
        const pfr = stats.pfr;
        let text = `${name}${profileTag} raist preflop. `;
        if (classification.key === 'nit' || classification.key === 'rock') {
          text += `ACHTUNG: PFR nur ${pfr}% — das bedeutet Premium-Hand!`;
        } else if (classification.key === 'maniac' || classification.key === 'lag') {
          text += `PFR: ${pfr}% — raist breit. Nicht zu viel Respekt geben.`;
        } else if (classification.key === 'fish') {
          text += `Unberechenbarer Spieler. PFR: ${pfr}%.`;
        }
        return { type: 'neutral', text };
      }
      return null;
    }

    const pot = game.pot + game.getCurrentBetsTotal();
    let text = `${name}${profileTag} bettet $${amount}. `;

    if (amount > 0 && pot > 0 && pot > amount) {
      const betPct = ((amount / (pot - amount)) * 100).toFixed(0);
      text += `(${betPct}% Pot) `;
    }

    if (classification?.stats?.reliable) {
      const cbet = stats.cbet;
      if (classification.key === 'nit' || classification.key === 'rock') {
        text += `STARK! Dieser Spieler (VPIP: ${stats.vpip}%) bettet selten ohne gute Hand. Fold schwache Haende.`;
      } else if (classification.key === 'maniac') {
        text += `Kann Bluff sein! AF: ${stats.af}, bettet viel zu oft. Call breit.`;
      } else if (classification.key === 'lag') {
        text += `Aggressiver Spieler (AF: ${stats.af}). Koennte Value oder Bluff sein. Achte auf Sizing-Tells.`;
      } else if (classification.key === 'fish' || classification.key === 'calling_station') {
        text += `${classification.label} — Bet signalisiert eher Staerke (passive Spieler betten selten).`;
      } else {
        text += 'Achte auf Bet-Sizing und vorherige Action fuer einen Read.';
      }
    } else {
      if (amount > pot * 0.8) {
        text += 'Grosser Bet — signalisiert oft Staerke oder grossen Bluff.';
      } else if (amount < pot * 0.35) {
        text += 'Kleiner Bet — Blocker-Bet oder schwacher Value. Gute Odds zum Callen.';
      }
    }
    return { type: 'neutral', text };
  }

  return null;
}

// === End-of-Hand Summary ===
export function getHandSummary(game, result) {
  const humanWon = result.winners && result.winners.some(w => w.player.id === game.humanSeat);
  const human = game.players[game.humanSeat];
  const h = normalizeHand(human.hand);

  if (human.folded) {
    const preflopStr = getPreflopStrength(human.hand);
    if (preflopStr === 'premium' || preflopStr === 'strong') {
      return {
        type: 'warning',
        text: `Du hast ${h.name} (${preflopStr === 'premium' ? 'Premium' : 'stark'}) gefoldet. Bewerte die Entscheidung anhand deiner damaligen Information — nicht am Ergebnis.`,
      };
    }
    return {
      type: 'neutral',
      text: `Fold mit ${h.name}. Richtige Entscheidung — die aufgedeckten Haende zeigen dir, was die anderen hatten. Nutze das als Lern-Moment.`,
    };
  }

  if (humanWon) {
    const potWon = result.potWon || 0;
    const humanActions = game.handHistory.filter(a => a.player === game.humanSeat);
    const raised = humanActions.some(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.BET);
    const justCalled = !raised && humanActions.some(a => a.action === ACTIONS.CALL);

    let comment = `Gewonnen! +$${potWon} mit ${h.name}. `;
    if (justCalled && potWon < game.bigBlind * 10) {
      comment += 'Aber: haettest du mit einem Raise mehr rausholen koennen? Passives Spiel laesst oft Value liegen.';
    } else if (raised) {
      comment += 'Gut — aggressive Spielweise hat sich ausgezahlt!';
    } else {
      comment += 'Analysiere ob du maximalen Value geholt hast.';
    }
    return { type: 'positive', text: comment };
  }

  const totalInvested = human.totalInvested || 0;
  let comment = `Verloren ($${totalInvested}) mit ${h.name}. `;

  if (totalInvested <= game.bigBlind) {
    comment += 'Nur Blinds verloren — kein Drama.';
    return { type: 'neutral', text: comment };
  }

  comment += 'War jede Entscheidung korrekt mit der damaligen Info? Ergebnis ≠ Qualitaet. Auch perfektes Spiel verliert kurzfristig.';
  return { type: 'negative', text: comment };
}

// === Coach Self-Critique: Player challenges the coach's advice ===
export function challengeCoachAdvice(game) {
  const human = game.humanPlayer;
  const phase = game.phase;
  const equity = getCurrentEquity();
  const outs = getCurrentOuts();
  const toCall = game.getCallAmount();
  const pot = game.pot + game.getCurrentBetsTotal();
  const position = game.getPosition(game.humanSeat);
  const community = game.communityCards;

  let response = '';

  if (phase === 'preflop') {
    // Preflop self-critique
    const h = normalizeHand(human.hand);
    const strength = getPreflopStrength(human.hand);
    const isLate = ['BTN', 'CO', 'BTN/SB'].includes(position);

    response += `Selbstkritik: Du hast ${h.name} auf ${position}. `;

    if (strength === 'weak') {
      if (isLate) {
        const hasPlayability = h.suited || h.connected || h.oneGap || 'AKQJT'.includes(h.high);
        if (!hasPlayability) {
          response += `Stimmt, du hast recht — ${h.name} hat KEIN Playability (nicht suited, nicht connected, kein Broadway). Auch vom Button ist ein Steal hier zu riskant. Bessere Steal-Haende: suited connectors (67s, 89s), suited aces (A2s-A9s), oder Haende mit Broadway-Karten. FOLD ist korrekt.`;
        } else {
          response += `${h.name} ist schwach, aber hat etwas Playability (${h.suited ? 'suited' : h.connected ? 'connected' : 'Broadway-Karte'}). Ein Steal vom Button ist vertretbar — aber nur wenn die Blinds tight sind und du bei einem 3-Bet sofort foldest.`;
        }
      } else {
        response += `${h.name} aus ${position} ist ein klarer Fold. Keine Diskussion — aus frueher/mittlerer Position braucht man staerkere Haende.`;
      }
    } else if (strength === 'playable') {
      response += `${h.name} ist spielbar, aber situationsabhaengig. ${isLate ? 'Von ' + position + ' ist ein Raise OK.' : 'Aus ' + position + ' nur bei guenstigen Bedingungen.'} Die Staerke haengt davon ab, was die Gegner vor dir gemacht haben.`;
    } else {
      response += `${h.name} ist ${strength === 'premium' ? 'eine Premium-Hand' : 'stark'} — hier ist ein Raise fast immer korrekt.`;
    }
  } else {
    // Postflop self-critique with comprehensive analysis
    const eval_ = community.length >= 3 ? evaluateHand(human.hand, community) : null;
    const handStrength = eval_ ? eval_.strength : -1;
    const h = normalizeHand(human.hand);
    const board = community.length >= 3 ? analyzeBoard(community) : null;
    const blockerData = analyzeBlockers(human.hand, community, board);
    const conn = community.length >= 3 ? handBoardConnection(human.hand, community) : null;
    const oppAnalyses = estimateOpponentRange(game);
    const mainOpp = oppAnalyses.find(a => a.aggressiveStreets > 0) || oppAnalyses[0];
    const sprData = getSPRStrategy(human.stack, Math.max(pot, 1));

    response += `Selbstkritik: Du hast ${h.name} (${eval_?.descr || eval_?.name || '?'}) auf ${position}. `;

    if (equity !== null) {
      // Show adjusted equity
      const oppStrength = mainOpp?.rangeStrength || 'unknown';
      const adjFactor = oppStrength === 'very_strong' ? 0.55 : oppStrength === 'strong' ? 0.7 : oppStrength === 'polarized' ? 0.75 : oppStrength === 'medium' ? 0.85 : 1.0;
      const adjEq = equity * adjFactor;

      response += `Equity: ${equity.toFixed(0)}% vs Random`;
      if (adjFactor < 1.0) response += `, ~${adjEq.toFixed(0)}% vs Gegner-Range (${oppStrength})`;
      response += '. ';

      // Key insight: equity vs random ≠ equity vs betting range
      if (handStrength <= 1 && equity >= 50 && toCall > 0) {
        response += `WICHTIG: Die ${equity.toFixed(0)}% Equity ist gegen ZUFAELLIGE Haende. Gegen die Betting-Range des Gegners (${oppStrength}) sind es nur ~${adjEq.toFixed(0)}%. `;

        if (handStrength === 1) {
          const boardRanks = community.map(c => c.rank);
          const topCard = boardRanks.sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))[0];
          const isTopPair = human.hand.some(c => c.rank === topCard);

          if (isTopPair) {
            response += `Top Pair ist marginal. Call OK, Raise nur mit Kicker A/K. Value-Raise wird meistens nur von besseren gecallt.`;
          } else {
            response += `Unteres/Middle Pair — zu schwach fuer Value-Raise. Check/Call oder Check/Fold.`;
          }
        } else {
          response += `High Card — sehr schwach. Check/Fold.`;
          if (blockerData && blockerData.bluffValue >= 2) {
            response += ` Allerdings: ${blockerData.summary} — als Bluff moeglich.`;
          }
        }
      } else if (handStrength >= 3) {
        response += `Starke Hand (${eval_?.descr || eval_?.name}). Value-Raise/Bet ist korrekt.`;
        if (board?.isWet) response += ' Auf nassem Board nicht trappen — sofort betten!';
      } else if (handStrength === 2) {
        response += `Two Pair ist gut.`;
        if (board?.isWet) response += ' Nasses Board — protect gegen Draws!';
        else if (board?.isDry) response += ' Trockenes Board — kannst ruhig Value-betten.';
        if (board?.flushPossible) response += ' Flush-Gefahr!';
      }

      // Blocker insight
      if (blockerData && blockerData.blockers.length > 0) {
        response += ` Blocker: ${blockerData.summary}`;
      }

      // SPR insight
      if (sprData && sprData.zone === 'low') {
        response += ` SPR ${sprData.spr.toFixed(1)} (niedrig) — entweder committen oder folden, keine halben Sachen.`;
      }
    } else {
      response += `Equity wird berechnet. Nur mit Two Pair+ fuer Value raisen.`;
    }

    // Opponent reading
    if (mainOpp && mainOpp.rangeStrength !== 'unknown') {
      response += ` Gegner-Linie: ${mainOpp.pattern}. `;
      if (mainOpp.rangeStrength === 'very_strong') {
        response += `Warnung: Gegner zeigt extreme Staerke. Ohne starke Hand (Set+) besser folden.`;
      }
    }
  }

  return { type: 'warning', text: response };
}
