// === Psychology Module: Tilt Detection + Emotional Coaching ===

import { ACTIONS } from './engine.js';

// === State ===
const sessionData = {
  handsPlayed: 0,
  handResults: [], // { won: bool, potSize: number, timestamp: number, actions: [] }
  recentDecisionTimes: [], // ms per decision (last 10)
  consecutiveLosses: 0,
  consecutiveWins: 0,
  bigLosses: 0,  // lost > 20BB in one hand
  aggressionAfterLoss: 0, // raises immediately after losing
  tiltScore: 0, // 0-100, higher = more tilted
  lastHandTimestamp: 0,
};

// === Record a completed hand ===
export function recordHand(result, game, humanActions) {
  const humanWon = result.winners && result.winners.some(w => w.player.id === game.humanSeat);
  const potSize = result.potWon || 0;
  const bb = game.bigBlind;
  const now = Date.now();
  const human = game.players[game.humanSeat];

  // Folding is not a loss — it's a strategic decision
  const humanFolded = human.folded;
  const investedSignificant = human.totalInvested > bb; // more than just blinds

  sessionData.handsPlayed++;

  // Separate preflop vs postflop actions for accurate VPIP/PFR
  const preflopActions = humanActions.filter(a => a.phase === 'preflop').map(a => a.action);
  const allActions = humanActions.map(a => a.action);

  const handRecord = {
    won: humanWon,
    folded: humanFolded,
    potSize,
    invested: human.totalInvested,
    timestamp: now,
    actions: allActions,
    preflopActions,
  };
  sessionData.handResults.push(handRecord);

  // Track streaks — only count hands where we invested significantly and lost
  if (humanWon) {
    sessionData.consecutiveWins++;
    sessionData.consecutiveLosses = 0;
  } else if (humanFolded && !investedSignificant) {
    // Simple fold (just blinds) — neutral, don't affect streak
  } else {
    sessionData.consecutiveLosses++;
    sessionData.consecutiveWins = 0;

    // Big loss — based on chips invested, not pot won
    if (human.totalInvested > bb * 20) {
      sessionData.bigLosses++;
    }
  }

  // Check for aggression after loss
  if (!humanWon && sessionData.handResults.length >= 2) {
    const prevHand = sessionData.handResults[sessionData.handResults.length - 2];
    if (!prevHand.won) {
      const hasRaise = humanActions.some(a => a.action === ACTIONS.RAISE || a.action === ACTIONS.BET || a.action === ACTIONS.ALLIN);
      if (hasRaise) sessionData.aggressionAfterLoss++;
    }
  }

  // Speed check
  if (sessionData.lastHandTimestamp > 0) {
    const timeBetweenHands = now - sessionData.lastHandTimestamp;
    sessionData.recentDecisionTimes.push(timeBetweenHands);
    if (sessionData.recentDecisionTimes.length > 10) {
      sessionData.recentDecisionTimes.shift();
    }
  }
  sessionData.lastHandTimestamp = now;

  // Update tilt score
  updateTiltScore();

  return getTiltFeedback();
}

// === Tilt Score Calculation ===
function updateTiltScore() {
  let score = 0;

  // Consecutive losses increase tilt
  if (sessionData.consecutiveLosses >= 3) score += 15;
  if (sessionData.consecutiveLosses >= 5) score += 20;
  if (sessionData.consecutiveLosses >= 8) score += 25;

  // Big losses
  score += sessionData.bigLosses * 10;

  // Aggression after losses (revenge play)
  score += sessionData.aggressionAfterLoss * 8;

  // Fast play (decisions too quick = emotional, not thoughtful)
  if (sessionData.recentDecisionTimes.length >= 5) {
    const avgTime = sessionData.recentDecisionTimes.reduce((a, b) => a + b, 0) / sessionData.recentDecisionTimes.length;
    if (avgTime < 3000) score += 15; // less than 3 seconds between hands
    if (avgTime < 2000) score += 15; // less than 2 seconds
  }

  // Clamp 0-100
  sessionData.tiltScore = Math.min(100, Math.max(0, score));
}

// === Generate Tilt Feedback ===
function getTiltFeedback() {
  const score = sessionData.tiltScore;

  if (score >= 70) {
    return {
      level: 'critical',
      score,
      title: 'TILT-WARNUNG!',
      message: 'Dein Spielmuster zeigt starke Anzeichen von Tilt. Empfehlung: Mach eine Pause, atme durch, und komm mit klarem Kopf zurück.',
      tips: [
        'Steh auf und beweg dich für 5 Minuten',
        'Erinnere dich: Poker ist ein Langzeit-Spiel. Eine Session ändert nichts.',
        'Setze dir ein Stop-Loss für die Session',
      ],
    };
  }

  if (score >= 40) {
    return {
      level: 'warning',
      score,
      title: 'Achtung: Tilt-Gefahr',
      message: `Du hast ${sessionData.consecutiveLosses} Hände in Folge verloren. Achte darauf, deine Entscheidungen nicht von Emotionen beeinflussen zu lassen.`,
      tips: [
        'Spiele nur Hände in deiner Range — keine Revenge-Plays',
        'Nimm dir bewusst 5 Sekunden vor jeder Entscheidung',
        'Akzeptiere Varianz: Auch perfekte Entscheidungen verlieren kurzfristig',
      ],
    };
  }

  if (score >= 15) {
    return {
      level: 'mild',
      score,
      message: 'Leichte Frustration erkannt. Bleib fokussiert auf die Qualitaet deiner Entscheidungen, nicht auf das Ergebnis.',
      tips: [],
    };
  }

  return null; // No tilt detected
}

// === Session Stats ===
export function getSessionStats() {
  const total = sessionData.handsPlayed;
  if (total === 0) return null;

  const wins = sessionData.handResults.filter(h => h.won).length;
  const losses = total - wins;
  const winRate = (wins / total * 100).toFixed(1);

  // VPIP (Voluntarily Put In Pot) — hands where player put money in preflop (not just BB check)
  const vpipHands = sessionData.handResults.filter(h => {
    const pf = h.preflopActions || h.actions; // fallback for old records
    return pf.includes(ACTIONS.CALL) || pf.includes(ACTIONS.RAISE) || pf.includes(ACTIONS.BET) || pf.includes(ACTIONS.ALLIN);
  }).length;
  const vpip = (vpipHands / total * 100).toFixed(1);

  // PFR (Preflop Raise) — hands where player raised preflop
  const pfrHands = sessionData.handResults.filter(h => {
    const pf = h.preflopActions || h.actions;
    return pf.includes(ACTIONS.RAISE) || pf.includes(ACTIONS.BET) || pf.includes(ACTIONS.ALLIN);
  }).length;
  const pfr = (pfrHands / total * 100).toFixed(1);

  // Aggression Factor
  const totalRaises = sessionData.handResults.reduce((sum, h) =>
    sum + h.actions.filter(a => a === ACTIONS.RAISE || a === ACTIONS.BET).length, 0);
  const totalCalls = sessionData.handResults.reduce((sum, h) =>
    sum + h.actions.filter(a => a === ACTIONS.CALL).length, 0);
  const af = totalCalls > 0 ? (totalRaises / totalCalls).toFixed(1) : '∞';

  return {
    handsPlayed: total,
    wins, losses, winRate,
    vpip, pfr, af,
    tiltScore: sessionData.tiltScore,
    consecutiveLosses: sessionData.consecutiveLosses,
    consecutiveWins: sessionData.consecutiveWins,
    bigLosses: sessionData.bigLosses,
  };
}

// === Reset Session ===
export function resetSession() {
  Object.assign(sessionData, {
    handsPlayed: 0,
    handResults: [],
    recentDecisionTimes: [],
    consecutiveLosses: 0,
    consecutiveWins: 0,
    bigLosses: 0,
    aggressionAfterLoss: 0,
    tiltScore: 0,
    lastHandTimestamp: 0,
  });
}
