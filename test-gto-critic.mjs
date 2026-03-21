#!/usr/bin/env node
// === GTO Coach Critic Test — validates coaching logic without browser ===
// Tests the core GTO logic for correctness. No pokersolver needed.

// We can't import the actual modules (they use DOM/browser APIs),
// so we replicate the core logic inline and test it.

// ============================================================
// 1. REPLICATE: getPreflopStrength from evaluator.js
// ============================================================
const PREMIUM_HANDS = ['AA', 'KK', 'QQ', 'JJ', 'AKs'];
const STRONG_HANDS = ['TT', '99', 'AK', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs'];
const PLAYABLE_HANDS = [
  '88', '77', '66', '55', '44', '33', '22',
  'AQ', 'AJ', 'AT', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
  'KQ', 'KJ', 'KT', 'KJs', 'KTs', 'K9s',
  'QJ', 'QT', 'QJs', 'QTs', 'Q9s',
  'JT', 'JTs', 'J9s',
  'T9s', '98s', '87s', '76s', '65s', '54s',
];

function getPreflopStrength(key) {
  // key like 'AKs', 'AKo', 'AA', '72o', etc.
  const base = key.replace(/[so]$/, '');
  if (PREMIUM_HANDS.includes(key) || PREMIUM_HANDS.includes(base)) return 'premium';
  if (STRONG_HANDS.includes(key) || STRONG_HANDS.includes(base)) return 'strong';
  if (PLAYABLE_HANDS.includes(key) || PLAYABLE_HANDS.includes(base)) return 'playable';
  return 'weak';
}

// ============================================================
// 2. REPLICATE: matrix.js hand scores (169 hands)
// ============================================================
function buildPreflopRanges() {
  const scores = {};
  scores['AA'] = 100; scores['KK'] = 98; scores['QQ'] = 95; scores['JJ'] = 92;
  scores['TT'] = 87; scores['99'] = 82; scores['88'] = 77; scores['77'] = 72;
  scores['66'] = 67; scores['55'] = 62; scores['44'] = 57; scores['33'] = 52; scores['22'] = 47;
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

const RANGES = buildPreflopRanges();

// ============================================================
// 3. REPLICATE: matrix.js getHandFrequencies
// ============================================================
function matrixFrequencies(handKey, position, facingRaise) {
  const score = RANGES[handKey] || 0;
  const isLate = ['BTN', 'CO', 'SB'].includes(position);
  const isMid = ['MP', 'HJ'].includes(position);
  const isBB = position === 'BB';
  let threshold;
  if (position === 'BTN') threshold = 35;
  else if (position === 'CO') threshold = 45;
  else if (position === 'SB') threshold = 40;
  else if (isBB) threshold = 30;
  else if (isMid) threshold = 55;
  else threshold = 65;

  if (!facingRaise) {
    if (score >= 90) return { raise: 100, call: 0, check: 0, fold: 0 };
    if (score >= threshold + 20) return { raise: 90, call: 5, check: 0, fold: 5 };
    if (score >= threshold + 5) return { raise: 75, call: 10, check: 0, fold: 15 };
    if (score >= threshold) return { raise: 55, call: 15, check: 0, fold: 30 };
    if (score >= threshold - 10) return { raise: 25, call: 15, check: 0, fold: 60 };
    if (score >= threshold - 20) return { raise: 10, call: 10, check: 0, fold: 80 };
    return { raise: 2, call: 3, check: 0, fold: 95 };
  } else {
    const defThreshold = isBB ? threshold + 5 : threshold + 15;
    if (score >= 95) return { raise: 85, call: 15, check: 0, fold: 0 };
    if (score >= defThreshold + 10) return { raise: 20, call: 70, check: 0, fold: 10 };
    if (score >= defThreshold) return { raise: 10, call: 55, check: 0, fold: 35 };
    if (score >= defThreshold - 10) return { raise: 5, call: 30, check: 0, fold: 65 };
    if (isBB && score >= defThreshold - 20) return { raise: 3, call: 25, check: 0, fold: 72 };
    return { raise: 2, call: 5, check: 0, fold: 93 };
  }
}

// ============================================================
// 4. REPLICATE: coach.js getGTOFrequencies (NOW uses matrix scores!)
// ============================================================
function coachFrequencies(handKey, position, facingRaise) {
  // After fix: coach now delegates to matrixFrequencies (single source of truth)
  const mf = matrixFrequencies(handKey, position, facingRaise);
  return { fold: mf.fold, check: mf.check || 0, call: mf.call, raise: mf.raise };
}

// ============================================================
// 5. REPLICATE: scoring.js scoreDecision
// ============================================================
function scoreDecision(gtoFreqs, actionKey) {
  const playerFreq = gtoFreqs[actionKey] || 0;
  const entries = Object.entries(gtoFreqs).filter(([, v]) => v > 0);
  entries.sort((a, b) => b[1] - a[1]);
  const bestAction = entries[0];
  const bestFreq = bestAction ? bestAction[1] : 0;

  if (playerFreq >= bestFreq - 1) return 'best';
  if (playerFreq >= 15) return 'correct';
  if (playerFreq >= 5) return 'inaccuracy';
  if (playerFreq > 0) return 'mistake';
  return 'blunder';
}

// ============================================================
// TESTS
// ============================================================
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.log(`  FAIL: ${message}`);
  }
}

console.log('=== GTO CRITIC TEST SUITE ===\n');

// ─────────────────────────────────────────
// TEST 1: Hands in same category get identical frequencies (BAD!)
// ─────────────────────────────────────────
console.log('--- TEST 1: Coach treats different hands identically ---');

// All "playable" hands get EXACT SAME frequencies from coach
const playableHands = ['88', '22', 'AQo', '54s', 'K9s', 'QTs'];
const btnOpenFreqs = playableHands.map(h => coachFrequencies(h, 'BTN', false));

let allSame = true;
for (let i = 1; i < btnOpenFreqs.length; i++) {
  if (btnOpenFreqs[i].raise !== btnOpenFreqs[0].raise) allSame = false;
}
// This SHOULD fail — 88 and 22 should have different open frequencies
assert(!allSame,
  `Coach gives IDENTICAL frequencies for 88 and 22 from BTN (both "playable"): Raise ${btnOpenFreqs[0].raise}%. ` +
  `Matrix gives 88=${matrixFrequencies('88', 'BTN', false).raise}%, 22=${matrixFrequencies('22', 'BTN', false).raise}%`);

// ─────────────────────────────────────────
// TEST 2: Matrix vs Coach disagreement
// ─────────────────────────────────────────
console.log('\n--- TEST 2: Matrix vs Coach frequency disagreements ---');

const testHands = ['AA', 'KK', 'AKs', 'TT', '88', '55', '22', 'AQo', 'KJo', 'T9s', '87s', '65s', '72o', 'J6o', 'Q8o'];
const positions = ['UTG', 'BTN'];

let disagreements = 0;
for (const hand of testHands) {
  for (const pos of positions) {
    const matrixF = matrixFrequencies(hand, pos, false);
    const coachF = coachFrequencies(hand, pos, false);
    const matrixRaise = matrixF.raise;
    const coachRaise = coachF.raise;
    const diff = Math.abs(matrixRaise - coachRaise);

    if (diff > 20) {
      disagreements++;
      console.log(`  CONFLICT: ${hand} from ${pos} — Matrix: Raise ${matrixRaise}%, Coach: Raise ${coachRaise}% (diff: ${diff}pp)`);
    }
  }
}
assert(disagreements === 0,
  `${disagreements} major disagreements (>20pp) between Matrix and Coach frequencies. Player sees conflicting advice!`);

// ─────────────────────────────────────────
// TEST 3: Scoring system — mixed strategy fairness
// ─────────────────────────────────────────
console.log('\n--- TEST 3: Scoring fairness for mixed strategies ---');

// GTO says: 40% Raise, 35% Call, 25% Fold
// In true GTO, ALL three actions are "correct" (they yield identical EV)
const mixedFreqs = { fold: 25, check: 0, call: 35, raise: 40 };

const raiseScore = scoreDecision(mixedFreqs, 'raise');  // 40% — should be "best"
const callScore = scoreDecision(mixedFreqs, 'call');    // 35% — should be at least "correct"
const foldScore = scoreDecision(mixedFreqs, 'fold');    // 25% — should be "correct" in GTO

assert(raiseScore === 'best', `Raise at 40% (highest freq) scores "${raiseScore}" — expected "best"`);
assert(callScore === 'correct', `Call at 35% scores "${callScore}" — expected "correct"`);
assert(foldScore === 'correct', `Fold at 25% in true GTO mixed strategy scores "${foldScore}" — expected "correct" (got "${foldScore}"). In GTO, all actions in a mixed strategy have EQUAL EV!`);

// ─────────────────────────────────────────
// TEST 4: Scoring edge case — 10% frequency
// ─────────────────────────────────────────
console.log('\n--- TEST 4: Scoring threshold edge cases ---');

// If GTO says Raise 10%, that means sometimes it IS correct to raise
const marginalFreqs = { fold: 50, check: 0, call: 40, raise: 10 };
const marginalRaise = scoreDecision(marginalFreqs, 'raise');
assert(marginalRaise !== 'mistake' && marginalRaise !== 'blunder',
  `Raising at 10% GTO frequency scores "${marginalRaise}". In GTO, 10% frequency means it's a valid action — should NOT be "mistake" or "blunder"`);

// 3% frequency
const rareFreqs = { fold: 85, check: 0, call: 12, raise: 3 };
const rareRaise = scoreDecision(rareFreqs, 'raise');
assert(rareRaise !== 'blunder',
  `Raising at 3% GTO frequency scores "${rareRaise}". Non-zero frequency = not a blunder`);

// ─────────────────────────────────────────
// TEST 5: Critical hands — Coach recommendations
// ─────────────────────────────────────────
console.log('\n--- TEST 5: Critical hand scenarios ---');

// AKo from UTG should be strong open (not just "strong" bucket)
const AKo_UTG = coachFrequencies('AKo', 'UTG', false);
assert(AKo_UTG.raise >= 90,
  `AKo from UTG: Coach says Raise ${AKo_UTG.raise}%, expected >=90%. Matrix says ${matrixFrequencies('AKo', 'UTG', false).raise}%`);

// 22 from UTG should be much tighter than 88 from UTG
const pair22_UTG_coach = coachFrequencies('22', 'UTG', false);
const pair88_UTG_coach = coachFrequencies('88', 'UTG', false);
assert(pair22_UTG_coach.raise !== pair88_UTG_coach.raise,
  `22 and 88 from UTG get IDENTICAL raise freq: ${pair22_UTG_coach.raise}%. 22 should be much tighter!`);

// A5s from BTN should be an open (GTO staple: wheel draw + nut flush)
const A5s_BTN = matrixFrequencies('A5s', 'BTN', false);
assert(A5s_BTN.raise >= 70,
  `A5s from BTN: Matrix says Raise ${A5s_BTN.raise}%. A5s is a GTO must-open from BTN (nut flush draw + wheel potential)`);

// ─────────────────────────────────────────
// TEST 6: BB Defense — the most important spot
// ─────────────────────────────────────────
console.log('\n--- TEST 6: BB Defense scenarios ---');

// BB should defend ~60% of hands vs BTN open in GTO
// Coach uses generic "facing raise" logic for BB just like UTG
const bbHands = ['K9s', 'Q9s', 'J9s', 'T8s', '87s', '76s', '65s', 'A2o', 'K5o'];
let bbDefendCount = 0;
for (const h of bbHands) {
  const freq = coachFrequencies(h, 'BB', true);
  if (freq.fold < 50) bbDefendCount++;
}
// In GTO, BB should defend most of these vs BTN open
assert(bbDefendCount >= 5,
  `BB defends only ${bbDefendCount}/${bbHands.length} hands vs raise. GTO says BB should defend ~60% of hands vs BTN open. Coach is WAY too tight in BB defense.`);

// ─────────────────────────────────────────
// TEST 7: SB vs BB frequency inconsistency
// ─────────────────────────────────────────
console.log('\n--- TEST 7: Position awareness ---');

// SB should open wider than UTG but tighter than BTN
const testHand = '76s';
const sb_freq = matrixFrequencies(testHand, 'SB', false);
const btn_freq = matrixFrequencies(testHand, 'BTN', false);
const utg_freq = matrixFrequencies(testHand, 'UTG', false);

assert(btn_freq.raise > utg_freq.raise,
  `76s: BTN raise ${btn_freq.raise}% should be > UTG raise ${utg_freq.raise}%`);

// ─────────────────────────────────────────
// TEST 8: Weak hand categorization gaps
// ─────────────────────────────────────────
console.log('\n--- TEST 8: Weak hand granularity ---');

// Coach gives ALL weak hands the same advice
const weakHands = ['72o', 'J6o', 'T7o', 'K2o', 'Q4o', '93o'];
const weakBTN = weakHands.map(h => coachFrequencies(h, 'BTN', false));

let weakAllSame = true;
for (let i = 1; i < weakBTN.length; i++) {
  if (weakBTN[i].raise !== weakBTN[0].raise) weakAllSame = false;
}

// K2o from BTN should be different from 72o from BTN
const K2o_score = RANGES['K2o'];  // 22
const sevTwo_score = RANGES['72o'];  // 4
assert(!weakAllSame || K2o_score === sevTwo_score,
  `Coach treats ALL weak hands identically from BTN: Raise ${weakBTN[0].raise}%. But K2o (score ${K2o_score}) and 72o (score ${sevTwo_score}) are worlds apart!`);

// ─────────────────────────────────────────
// TEST 9: Frequency consistency — must sum to ~100%
// ─────────────────────────────────────────
console.log('\n--- TEST 9: Frequency sum validation ---');

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
let sumErrors = 0;
for (let r = 0; r < 13; r++) {
  for (let c = 0; c < 13; c++) {
    let key;
    if (r === c) key = RANKS[r] + RANKS[c];
    else if (r < c) key = RANKS[r] + RANKS[c] + 's';
    else key = RANKS[c] + RANKS[r] + 'o';

    for (const pos of ['BTN', 'UTG', 'BB']) {
      const mf = matrixFrequencies(key, pos, false);
      const sum = mf.raise + mf.call + (mf.check || 0) + mf.fold;
      if (sum !== 100) {
        sumErrors++;
        if (sumErrors <= 3) console.log(`  SUM ERROR: ${key} ${pos} open = ${sum}% (not 100)`);
      }

      const cf = coachFrequencies(key, pos, false);
      const cSum = cf.raise + cf.call + (cf.check || 0) + cf.fold;
      if (cSum !== 100) {
        sumErrors++;
        if (sumErrors <= 3) console.log(`  SUM ERROR (coach): ${key} ${pos} open = ${cSum}% (not 100)`);
      }
    }
  }
}
assert(sumErrors === 0, `${sumErrors} frequency sums != 100%`);

// ─────────────────────────────────────────
// TEST 10: Does scoring punish GTO-correct play?
// ─────────────────────────────────────────
console.log('\n--- TEST 10: Scoring must not punish GTO-correct plays ---');

// Scenario: GTO says Fold 85%, Call 10%, Raise 5%
// Player folds — this should be "best" (85% is highest)
const tightFreqs = { fold: 85, check: 0, call: 10, raise: 5 };
const foldingScore = scoreDecision(tightFreqs, 'fold');
assert(foldingScore === 'best', `Folding when GTO says 85% fold scores "${foldingScore}" — should be "best"`);

// Calling here (10%) — in GTO this is a valid mixed strategy action
const callingHere = scoreDecision(tightFreqs, 'call');
assert(callingHere !== 'blunder' && callingHere !== 'mistake',
  `Calling at 10% frequency scores "${callingHere}". Should not be "mistake" — it's a GTO-valid action`);

// ============================================================
// RESULTS
// ============================================================
console.log('\n=== RESULTS ===');
console.log(`Passed: ${passed}/${passed + failed}`);
console.log(`Failed: ${failed}/${passed + failed}`);

if (failures.length > 0) {
  console.log('\n=== FAILURES (Issues to fix) ===');
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
}

console.log('\n=== CRITIC VERDICT ===');
if (failed >= 8) {
  console.log('BLUNDER: Dieser Coach macht dich NICHT zum Poker-Profi. Fundamentale GTO-Fehler.');
} else if (failed >= 5) {
  console.log('MISTAKE: Ernsthafte Maengel. Coach gibt teilweise falsche GTO-Ratschlaege.');
} else if (failed >= 3) {
  console.log('INACCURACY: Guter Ansatz, aber zu ungenau fuer Profi-Training.');
} else if (failed >= 1) {
  console.log('CORRECT: Fast gut. Kleine Korrekturen noetig.');
} else {
  console.log('BEST MOVE: Coach ist solide. Weitermachen.');
}
