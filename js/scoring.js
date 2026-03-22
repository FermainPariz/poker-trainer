// === GTO Scoring System — rates every decision like GTO Wizard ===
// Compares player's action to GTO frequencies, assigns score and EV loss.

import { ACTIONS, PHASES } from './engine.js';

// === Session State ===
let sessionData = {
  decisions: [],       // { score, evLoss, classification, phase, timestamp, sessionElapsedMs, decisionTimeMs }
  totalEVLoss: 0,      // in big blinds
  handsPlayed: 0,
  bestMoves: 0,
  correctMoves: 0,
  inaccuracies: 0,
  mistakes: 0,
  blunders: 0,
  sessionStartTime: Date.now(),
  lastActionTime: null, // for measuring per-decision time
};

export function resetScoring() {
  sessionData = {
    decisions: [], totalEVLoss: 0, handsPlayed: 0,
    bestMoves: 0, correctMoves: 0, inaccuracies: 0, mistakes: 0, blunders: 0,
    sessionStartTime: Date.now(), lastActionTime: null,
  };
}

// Call when player's turn starts (to measure think time)
export function markTurnStart() {
  sessionData.lastActionTime = Date.now();
}

export function recordHandPlayed() {
  sessionData.handsPlayed++;
}

export function getSessionScoring() {
  const total = sessionData.decisions.length;
  const accuracy = total > 0
    ? ((sessionData.bestMoves + sessionData.correctMoves) / total * 100)
    : 100;
  return {
    ...sessionData,
    accuracy: Math.round(accuracy * 10) / 10,
    avgEVLossPerHand: sessionData.handsPlayed > 0
      ? Math.round(sessionData.totalEVLoss / sessionData.handsPlayed * 100) / 100
      : 0,
    avgEVLossPerMistake: (sessionData.inaccuracies + sessionData.mistakes + sessionData.blunders) > 0
      ? Math.round(sessionData.totalEVLoss / (sessionData.inaccuracies + sessionData.mistakes + sessionData.blunders) * 100) / 100
      : 0,
    totalDecisions: total,
  };
}

// === Score a player's action against GTO frequencies ===
// gtoFreqs: { fold: 0-100, check: 0-100, call: 0-100, raise: 0-100 }
// playerAction: ACTIONS.FOLD | CHECK | CALL | RAISE | BET | ALLIN
// pot: current pot size (for EV loss calculation)
// bigBlind: big blind amount
export function scoreDecision(gtoFreqs, playerAction, pot, bigBlind) {
  if (!gtoFreqs) return null;

  // Map player action to frequency key
  const actionKey = mapActionToKey(playerAction);
  const playerFreq = gtoFreqs[actionKey] || 0;

  // Find the best (highest frequency) action
  const entries = Object.entries(gtoFreqs).filter(([, v]) => v > 0);
  entries.sort((a, b) => b[1] - a[1]);
  const bestAction = entries[0];
  const bestFreq = bestAction ? bestAction[1] : 0;

  // Calculate score: -100 to +100
  // Best move = +100, proportional for mixed strategies, wrong move = negative
  let score, classification, evLossBB;

  if (playerFreq >= bestFreq - 1) {
    // Player chose the highest-frequency (best) action
    score = 100;
    classification = 'best';
    evLossBB = 0;
    sessionData.bestMoves++;
  } else if (playerFreq >= 15) {
    // Significant frequency — correct mixed strategy play
    score = Math.round(playerFreq / bestFreq * 100);
    classification = 'correct';
    evLossBB = 0;
    sessionData.correctMoves++;
  } else if (playerFreq >= 5) {
    // Low frequency — inaccuracy (taken sometimes but rarely)
    score = Math.round(playerFreq / bestFreq * 50);
    classification = 'inaccuracy';
    // Small EV loss: proportional to how far from best
    evLossBB = Math.round((1 - playerFreq / bestFreq) * (pot / bigBlind) * 0.03 * 100) / 100;
    sessionData.inaccuracies++;
  } else if (playerFreq > 0) {
    // Very low frequency — mistake
    score = -Math.round((1 - playerFreq / 100) * 50);
    classification = 'mistake';
    evLossBB = Math.round((1 - playerFreq / bestFreq) * (pot / bigBlind) * 0.08 * 100) / 100;
    sessionData.mistakes++;
  } else {
    // 0% frequency — blunder (never do this in GTO)
    score = -100;
    classification = 'blunder';
    evLossBB = Math.round((pot / bigBlind) * 0.15 * 100) / 100;
    sessionData.blunders++;
  }

  const now = Date.now();
  const decisionTimeMs = sessionData.lastActionTime ? (now - sessionData.lastActionTime) : null;
  const sessionElapsedMs = now - sessionData.sessionStartTime;

  sessionData.totalEVLoss += evLossBB;
  sessionData.decisions.push({
    score, evLossBB, classification, actionKey, phase: null,
    timestamp: now, sessionElapsedMs, decisionTimeMs,
  });

  return {
    score,             // -100 to +100
    classification,    // 'best' | 'correct' | 'inaccuracy' | 'mistake' | 'blunder'
    evLossBB,          // EV loss in big blinds
    playerFreq,        // GTO frequency of chosen action (0-100)
    bestAction: bestAction ? bestAction[0] : 'check',
    bestFreq,
    gtoFreqs,
  };
}

function mapActionToKey(action) {
  switch (action) {
    case ACTIONS.FOLD: return 'fold';
    case ACTIONS.CHECK: return 'check';
    case ACTIONS.CALL: return 'call';
    case ACTIONS.RAISE:
    case ACTIONS.BET:
    case ACTIONS.ALLIN: return 'raise';
    default: return 'check';
  }
}

// === Format score for display ===
export function formatScoreResult(result) {
  if (!result) return null;

  const labels = {
    best: { text: 'Best Move', icon: '✓', cls: 'score-best' },
    correct: { text: 'Correct', icon: '✓', cls: 'score-correct' },
    inaccuracy: { text: 'Inaccuracy', icon: '△', cls: 'score-inaccuracy' },
    mistake: { text: 'Mistake', icon: '✗', cls: 'score-mistake' },
    blunder: { text: 'Blunder', icon: '✗✗', cls: 'score-blunder' },
  };

  const label = labels[result.classification] || labels.correct;
  const evText = result.evLossBB > 0 ? ` (−${result.evLossBB.toFixed(2)}bb)` : '';
  const freqText = result.playerFreq < 100 ? ` [${result.playerFreq}%]` : '';

  return {
    text: `${label.icon} ${label.text}${evText}${freqText}`,
    className: label.cls,
    classification: result.classification,
    evLossBB: result.evLossBB,
  };
}

// === Decision Fatigue Analysis ===
// Analyzes quality degradation over session duration
export function getFatigueAnalysis() {
  const decisions = sessionData.decisions;
  if (decisions.length < 8) return null;

  // Split decisions into time windows (every ~10 decisions)
  const windowSize = Math.max(5, Math.floor(decisions.length / 4));
  const windows = [];

  for (let i = 0; i < decisions.length; i += windowSize) {
    const slice = decisions.slice(i, i + windowSize);
    if (slice.length < 3) break;

    const avgScore = slice.reduce((s, d) => s + d.score, 0) / slice.length;
    const avgEVLoss = slice.reduce((s, d) => s + d.evLossBB, 0) / slice.length;
    const mistakes = slice.filter(d => d.classification === 'mistake' || d.classification === 'blunder').length;
    const avgDecisionTime = slice.filter(d => d.decisionTimeMs).length > 0
      ? slice.filter(d => d.decisionTimeMs).reduce((s, d) => s + d.decisionTimeMs, 0) / slice.filter(d => d.decisionTimeMs).length
      : null;
    const elapsedMin = slice[0].sessionElapsedMs ? Math.round(slice[0].sessionElapsedMs / 60000) : 0;

    windows.push({
      startDecision: i,
      endDecision: i + slice.length,
      elapsedMin,
      avgScore: Math.round(avgScore),
      avgEVLoss: Math.round(avgEVLoss * 100) / 100,
      mistakeRate: Math.round(mistakes / slice.length * 100),
      avgDecisionTimeMs: avgDecisionTime ? Math.round(avgDecisionTime) : null,
    });
  }

  if (windows.length < 2) return null;

  // Compare first window vs last window
  const first = windows[0];
  const last = windows[windows.length - 1];
  const scoreDrop = first.avgScore - last.avgScore;
  const evLossIncrease = last.avgEVLoss - first.avgEVLoss;
  const mistakeRateIncrease = last.mistakeRate - first.mistakeRate;

  // Calculate optimal session length (where quality starts dropping)
  let optimalMinutes = null;
  for (let i = 1; i < windows.length; i++) {
    if (windows[i].avgScore < windows[0].avgScore - 15 && windows[i].mistakeRate > windows[0].mistakeRate + 10) {
      optimalMinutes = windows[i].elapsedMin || (i * 10);
      break;
    }
  }

  return {
    windows,
    scoreDrop,           // positive = quality dropped
    evLossIncrease,      // positive = more EV loss per decision
    mistakeRateIncrease, // positive = more mistakes over time
    isFatigued: scoreDrop > 15 || mistakeRateIncrease > 15,
    optimalMinutes,
    sessionMinutes: Math.round((Date.now() - sessionData.sessionStartTime) / 60000),
  };
}

// === Fatigue Warning (for real-time display) ===
export function getFatigueWarning() {
  const analysis = getFatigueAnalysis();
  if (!analysis) return null;

  const mins = analysis.sessionMinutes;

  if (analysis.isFatigued) {
    return {
      level: 'warning',
      message: `Deine Entscheidungsqualitaet sinkt! Score: ${analysis.windows[0].avgScore} → ${analysis.windows[analysis.windows.length - 1].avgScore}. ` +
        (analysis.optimalMinutes ? `Optimale Session-Laenge: ~${analysis.optimalMinutes} Min.` : `Session laeuft seit ${mins} Min.`),
      scoreDrop: analysis.scoreDrop,
      sessionMinutes: mins,
    };
  }

  if (mins > 60 && analysis.scoreDrop > 8) {
    return {
      level: 'mild',
      message: `Session laeuft seit ${mins} Min. Leichter Qualitaetsrueckgang erkennbar. Pause empfohlen.`,
      scoreDrop: analysis.scoreDrop,
      sessionMinutes: mins,
    };
  }

  return null;
}
