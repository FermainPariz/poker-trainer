// === Opponent Profiler: Track & Classify AI Opponents ===
// Tracks per-opponent stats across hands, auto-classifies player type,
// displays inline stats on the table + coaching advice.

const PROFILER_KEY = 'pokerOpponentProfiles';

// === Player Type Classification Thresholds ===
// Based on PokerTracker/HM3 conventions
const PLAYER_TYPES = {
  fish: {
    label: 'Fish',
    icon: '🐟',
    color: '#60a5fa', // blue
    description: 'Loose-Passive: Spielt viele Hände, callt zu viel, raist selten.',
    exploit: 'Value bet breit! Bluff selten — er callt alles.',
    match: (s) => s.vpip > 40 && s.pfr < 15,
  },
  calling_station: {
    label: 'Calling Station',
    icon: '📞',
    color: '#a78bfa', // purple
    description: 'Callt fast alles. Foldet extrem selten.',
    exploit: 'Nie bluffen! Nur für Value betten. Grosse Bets mit starken Händen.',
    match: (s) => s.vpip > 35 && s.af < 1.2 && s.foldToBet < 30,
  },
  nit: {
    label: 'Nit',
    icon: '🔒',
    color: '#94a3b8', // gray
    description: 'Spielt nur Premium-Hände. Extrem tight.',
    exploit: 'Steal seine Blinds aggressiv! Wenn er raist, geh aus dem Weg.',
    match: (s) => s.vpip < 18 && s.pfr < 16,
  },
  tag: {
    label: 'TAG',
    icon: '🎯',
    color: '#22c55e', // green
    description: 'Tight-Aggressive: Solider Spieler. Spielt wenige Hände, aber aggressiv.',
    exploit: 'Vorsicht! Respektiere seine Raises. 3-Bette Light aus Position.',
    match: (s) => s.vpip >= 18 && s.vpip <= 28 && s.pfr >= 16 && s.af >= 2,
  },
  lag: {
    label: 'LAG',
    icon: '🔥',
    color: '#f59e0b', // amber
    description: 'Loose-Aggressive: Spielt viele Hände und ist aggressiv. Schwer zu lesen.',
    exploit: 'Tighte up! Warte auf starke Hände und lass ihn in deine Traps laufen.',
    match: (s) => s.vpip > 28 && s.pfr > 22 && s.af >= 2.5,
  },
  maniac: {
    label: 'Maniac',
    icon: '💥',
    color: '#ef4444', // red
    description: 'Ultra-aggressiv. Raist und bettet staendig. Oft mit Luft.',
    exploit: 'Warte auf eine Hand und lass ihn sich selbst zerstoeren. Check-Raise!',
    match: (s) => s.vpip > 50 && s.af > 3,
  },
  rock: {
    label: 'Rock',
    icon: '🪨',
    color: '#6b7280', // dark gray
    description: 'Noch tighter als ein Nit. Spielt nur die Nuts.',
    exploit: 'Steal alles! Fold sofort wenn er Action macht.',
    match: (s) => s.vpip < 12,
  },
};

// Classification order: more specific types first
const CLASSIFY_ORDER = ['rock', 'maniac', 'calling_station', 'nit', 'lag', 'tag', 'fish'];

// === Per-opponent tracking ===
let profiles = {}; // seatIndex -> { stats, history }

export function initProfiler() {
  try {
    const stored = localStorage.getItem(PROFILER_KEY);
    if (stored) profiles = JSON.parse(stored);
  } catch (e) {
    console.warn('Failed to load opponent profiles:', e);
    profiles = {};
  }
}

function persistProfiles() {
  try {
    localStorage.setItem(PROFILER_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('Failed to save profiles:', e);
  }
}

// === Record an opponent's action ===
export function recordOpponentAction(seatIndex, action, phase, amount, context) {
  if (!profiles[seatIndex]) {
    profiles[seatIndex] = createProfile();
  }

  const p = profiles[seatIndex];
  p.totalActions++;

  if (phase === 'preflop') {
    p.preflopHands++;
    if (action === 'fold') {
      p.preflopFolds++;
    } else {
      p.vpipHands++; // voluntarily put in pot
      if (action === 'raise' || action === 'bet' || action === 'allin') {
        p.pfrHands++;
      }
      if (action === 'call' && !context?.facingRaise) {
        p.limpHands++;
      }
    }
    if (action === 'raise' && context?.isThreeBet) {
      p.threeBetHands++;
    }
  }

  // Track postflop aggression
  if (phase !== 'preflop') {
    if (action === 'bet' || action === 'raise' || action === 'allin') {
      p.aggressiveActions++;
    } else if (action === 'call') {
      p.passiveActions++;
    }
    if (action === 'fold' && context?.facingBet) {
      p.foldToBetCount++;
      p.facedBetCount++;
    } else if (context?.facingBet) {
      p.facedBetCount++;
    }
  }

  // Track showdown
  if (context?.wentToShowdown) {
    p.showdownHands++;
    if (context.wonAtShowdown) p.showdownWins++;
  }

  persistProfiles();
}

// === Record a full hand for an opponent ===
export function recordOpponentHand(seatIndex, handData) {
  if (!profiles[seatIndex]) {
    profiles[seatIndex] = createProfile();
  }

  const p = profiles[seatIndex];
  p.handsPlayed++;

  // VPIP: did they voluntarily put money in?
  if (handData.vpip) p.vpipHands++;

  // PFR: did they raise preflop?
  if (handData.pfr) p.pfrHands++;

  // Count preflop hands
  p.preflopHands++;
  if (handData.folded && handData.foldedPreflop) p.preflopFolds++;

  // Limp
  if (handData.limped) p.limpHands++;

  // 3-bet
  if (handData.threeBet) p.threeBetHands++;
  if (handData.facedRaise) p.facedRaiseCount++;

  // Postflop aggression
  p.aggressiveActions += handData.aggressiveActions || 0;
  p.passiveActions += handData.passiveActions || 0;

  // C-bet
  if (handData.couldCbet) {
    p.cbetOpportunities++;
    if (handData.didCbet) p.cbetCount++;
  }

  // Fold to bet
  if (handData.facedBet) {
    p.facedBetCount++;
    if (handData.foldedToBet) p.foldToBetCount++;
  }

  // Showdown
  if (handData.wentToShowdown) {
    p.showdownHands++;
    if (handData.wonAtShowdown) p.showdownWins++;
  }

  persistProfiles();
}

function createProfile() {
  return {
    handsPlayed: 0,
    preflopHands: 0,
    preflopFolds: 0,
    vpipHands: 0,
    pfrHands: 0,
    limpHands: 0,
    threeBetHands: 0,
    facedRaiseCount: 0,
    aggressiveActions: 0,
    passiveActions: 0,
    cbetOpportunities: 0,
    cbetCount: 0,
    facedBetCount: 0,
    foldToBetCount: 0,
    showdownHands: 0,
    showdownWins: 0,
    totalActions: 0,
  };
}

// === Compute stats for display ===
export function getOpponentStats(seatIndex) {
  const p = profiles[seatIndex];
  if (!p || p.preflopHands < 3) return null;

  const vpip = p.preflopHands > 0 ? (p.vpipHands / p.preflopHands * 100) : 0;
  const pfr = p.preflopHands > 0 ? (p.pfrHands / p.preflopHands * 100) : 0;
  const af = p.passiveActions > 0 ? (p.aggressiveActions / p.passiveActions) : p.aggressiveActions > 0 ? 99 : 0;
  const foldToBet = p.facedBetCount > 0 ? (p.foldToBetCount / p.facedBetCount * 100) : 50;
  const cbet = p.cbetOpportunities > 0 ? (p.cbetCount / p.cbetOpportunities * 100) : 50;
  const wtsd = p.vpipHands > 0 ? (p.showdownHands / p.vpipHands * 100) : 0;
  const wsd = p.showdownHands > 0 ? (p.showdownWins / p.showdownHands * 100) : 0;
  const limpPct = p.preflopHands > 0 ? (p.limpHands / p.preflopHands * 100) : 0;
  const threeBet = p.preflopHands > 0 ? (p.threeBetHands / p.preflopHands * 100) : 0;

  return {
    vpip: Math.round(vpip),
    pfr: Math.round(pfr),
    af: Math.round(af * 10) / 10,
    foldToBet: Math.round(foldToBet),
    cbet: Math.round(cbet),
    wtsd: Math.round(wtsd),
    wsd: Math.round(wsd),
    limpPct: Math.round(limpPct),
    threeBet: Math.round(threeBet),
    hands: p.preflopHands,
    reliable: p.preflopHands >= 15, // minimum for basic reads
  };
}

// === Classify player type ===
export function classifyOpponent(seatIndex) {
  const stats = getOpponentStats(seatIndex);
  if (!stats) return null;

  for (const typeKey of CLASSIFY_ORDER) {
    const type = PLAYER_TYPES[typeKey];
    if (type.match(stats)) {
      return {
        key: typeKey,
        ...type,
        stats,
      };
    }
  }

  // Default: Unknown / Average
  return {
    key: 'unknown',
    label: 'Unknown',
    icon: '❓',
    color: 'var(--text2)',
    description: 'Noch nicht genug Daten oder durchschnittlicher Spieler.',
    exploit: 'Sammle mehr Hände für eine bessere Einschätzung.',
    stats,
  };
}

// === Get coaching advice for current situation ===
export function getOpponentAdvice(seatIndex, situation) {
  const classification = classifyOpponent(seatIndex);
  if (!classification || !classification.stats.reliable) return null;

  const stats = classification.stats;
  const type = classification.key;

  if (situation === 'facing_bet') {
    if (type === 'fish' || type === 'calling_station') {
      return `${classification.label} bettet — wahrscheinlich Value. Nur callen mit guter Hand.`;
    }
    if (type === 'maniac' || type === 'lag') {
      return `${classification.label} bettet — kann Bluff sein! AF: ${stats.af}. Oefter callen.`;
    }
    if (type === 'nit' || type === 'rock') {
      return `${classification.label} bettet — STARK! Nur mit Premium-Hand weiterspielen.`;
    }
  }

  if (situation === 'our_turn') {
    if (type === 'fish' || type === 'calling_station') {
      return `Gegen ${classification.label}: Value bet breit! Fold-to-Bet nur ${stats.foldToBet}%.`;
    }
    if (type === 'nit' || type === 'rock') {
      return `Gegen ${classification.label}: Bluff hat gute Chancen. Fold-Rate: ${stats.foldToBet}%.`;
    }
  }

  return null;
}

// === Generate HTML for opponent HUD badge ===
export function getOpponentBadgeHTML(seatIndex) {
  const classification = classifyOpponent(seatIndex);
  if (!classification) return '';

  const stats = classification.stats;
  const reliable = stats.reliable;
  const opacity = reliable ? '1' : '0.6';

  return `
    <div class="opponent-badge" style="
      display:flex; align-items:center; gap:3px;
      padding:1px 5px; border-radius:4px;
      background:rgba(0,0,0,.5); border:1px solid ${classification.color}30;
      font-size:0.5em; opacity:${opacity}; cursor:help;
    " title="${classification.description}\n${classification.exploit}\nVPIP:${stats.vpip} PFR:${stats.pfr} AF:${stats.af} (${stats.hands}h)">
      <span style="font-size:0.9em;">${classification.icon}</span>
      <span style="color:${classification.color}; font-weight:700;">${stats.vpip}/${stats.pfr}</span>
      ${reliable ? '' : `<span style="color:var(--text2);">(${stats.hands}h)</span>`}
    </div>`;
}

// === Process hand history to update all opponent profiles ===
export function processHandForProfiles(game, winners = []) {
  const humanSeat = game.humanSeat;
  const winnerIds = new Set(winners.map(w => w.player?.id ?? w.player));

  for (let i = 0; i < game.players.length; i++) {
    if (i === humanSeat) continue; // Skip human
    const player = game.players[i];
    if (player.sittingOut) continue;

    const playerActions = game.handHistory.filter(a => a.player === i);
    const preflopActions = playerActions.filter(a => a.phase === 'preflop');
    const postflopActions = playerActions.filter(a => a.phase !== 'preflop');

    // Calculate per-hand data
    const foldedPreflop = preflopActions.some(a => a.action === 'fold');
    // VPIP: voluntarily put money in — BB checking is NOT vpip
    const vpip = !foldedPreflop && preflopActions.some(a => a.action === 'call' || a.action === 'raise' || a.action === 'bet' || a.action === 'allin');
    const pfr = preflopActions.some(a => a.action === 'raise' || a.action === 'bet' || a.action === 'allin');
    const limped = preflopActions.some(a => a.action === 'call') && !pfr;

    // Was there a raise before this player preflop?
    const allPreflopRaises = game.handHistory.filter(a =>
      a.phase === 'preflop' && (a.action === 'raise' || a.action === 'bet')
    );
    const threeBet = pfr && allPreflopRaises.length >= 2 &&
      allPreflopRaises.indexOf(allPreflopRaises.find(a => a.player === i)) >= 1;

    // Postflop aggression
    const aggressive = postflopActions.filter(a => a.action === 'bet' || a.action === 'raise' || a.action === 'allin').length;
    const passive = postflopActions.filter(a => a.action === 'call').length;

    // C-bet: was this player the preflop aggressor?
    const wasPreAggressor = pfr;
    const flopActions = playerActions.filter(a => a.phase === 'flop');
    const couldCbet = wasPreAggressor && !player.folded && game.communityCards.length >= 3;
    const didCbet = couldCbet && flopActions.some(a => a.action === 'bet' || a.action === 'raise');

    // Fold to bet
    const facedBet = postflopActions.length > 0 && game.handHistory.some(a =>
      a.phase !== 'preflop' && a.player !== i && (a.action === 'bet' || a.action === 'raise')
    );
    const foldedToBet = facedBet && postflopActions.some(a => a.action === 'fold');

    // Showdown
    const wentToShowdown = !player.folded && game.communityCards.length >= 5 && game.phase === 'showdown';
    const wonAtShowdown = wentToShowdown && winnerIds.has(i);

    recordOpponentHand(i, {
      vpip,
      pfr,
      folded: player.folded,
      foldedPreflop,
      limped,
      threeBet,
      facedRaise: allPreflopRaises.length > 0,
      aggressiveActions: aggressive,
      passiveActions: passive,
      couldCbet,
      didCbet,
      facedBet,
      foldedToBet,
      wentToShowdown,
      wonAtShowdown,
    });
  }
}

// === Exploit Recommendations Engine ===
// Returns specific, actionable exploits based on opponent stats + current context
export function getExploitRecommendations(seatIndex, context = {}) {
  const stats = getOpponentStats(seatIndex);
  if (!stats || !stats.reliable) return null;

  const classification = classifyOpponent(seatIndex);
  const exploits = [];

  // === Preflop Exploits ===
  if (context.phase === 'preflop' || !context.phase) {
    // Over-folding preflop (fold >65%)
    if (stats.vpip < 20) {
      exploits.push({
        type: 'steal',
        priority: 'high',
        action: 'Steal seine Blinds mit jeder 2 Karten!',
        reason: `VPIP nur ${stats.vpip}% — foldet ${100 - stats.vpip}% preflop.`,
        sizing: 'Standard 2.5x Open.',
      });
    }

    // Never 3-bets (3bet < 3%)
    if (stats.threeBet < 3 && stats.hands > 20) {
      exploits.push({
        type: 'no-3bet',
        priority: 'medium',
        action: 'Open breiter wenn er in den Blinds sitzt.',
        reason: `3-Bet nur ${stats.threeBet}% — gibt kaum Widerstand.`,
      });
    }

    // Over-limping
    if (stats.limpPct > 25) {
      exploits.push({
        type: 'iso-raise',
        priority: 'high',
        action: 'Iso-Raise auf 4x wenn er limpt!',
        reason: `Limpt ${stats.limpPct}% — schwache Range, kein Plan postflop.`,
        sizing: '4x + 1x pro Limper.',
      });
    }
  }

  // === Postflop Exploits ===
  if (context.phase !== 'preflop') {
    // Folds too much to bets
    if (stats.foldToBet > 60) {
      exploits.push({
        type: 'bluff',
        priority: 'high',
        action: 'Bluff-Bet! Er foldet zu oft.',
        reason: `Fold-to-Bet: ${stats.foldToBet}% (>60% = profitabler Bluff).`,
        sizing: context.pot ? `${Math.round(context.pot * 0.6)}–${Math.round(context.pot * 0.75)} (60-75% Pot)` : '60-75% Pot.',
      });
    }

    // Never folds to bets (calling station)
    if (stats.foldToBet < 25) {
      exploits.push({
        type: 'value',
        priority: 'high',
        action: 'NIE bluffen! Nur Value betten.',
        reason: `Fold-to-Bet nur ${stats.foldToBet}% — callt fast alles.`,
        sizing: context.pot ? `${Math.round(context.pot * 0.8)}–${context.pot} (80-100% Pot für max Value)` : 'Grosse Bets für Value.',
      });
    }

    // High C-bet frequency
    if (stats.cbet > 75) {
      exploits.push({
        type: 'float',
        priority: 'medium',
        action: 'Float seine C-Bets und Take-Away am Turn!',
        reason: `C-Bet ${stats.cbet}% — bettet den Flop oft mit Luft.`,
      });
    }

    // Low aggression factor — never raises
    if (stats.af < 1.0 && stats.vpip > 25) {
      exploits.push({
        type: 'thin-value',
        priority: 'medium',
        action: 'Duenne Value Bets! Er check-raist fast nie.',
        reason: `AF nur ${stats.af} — passiv postflop, gibt keinen Widerstand.`,
      });
    }

    // High aggression — might be bluffing a lot
    if (stats.af > 4 && stats.wsd < 45) {
      exploits.push({
        type: 'call-down',
        priority: 'high',
        action: 'Call ihn leichter runter! Viele Bluffs.',
        reason: `AF ${stats.af}, aber WSD nur ${stats.wsd}% — bettet viel, zeigt selten die beste Hand.`,
      });
    }
  }

  // === Showdown-basierte Exploits ===
  if (stats.wtsd > 35 && stats.wsd < 40) {
    exploits.push({
      type: 'showdown-weak',
      priority: 'medium',
      action: 'Value bette breit am River — er callt zu viel und verliert.',
      reason: `Geht ${stats.wtsd}% zum Showdown, gewinnt nur ${stats.wsd}%.`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  exploits.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    playerType: classification?.label || 'Unknown',
    playerIcon: classification?.icon || '?',
    exploits,
    topExploit: exploits[0] || null,
  };
}

// === Get concise exploit tip for coach bubble ===
export function getExploitTip(activePlayers, phase, pot) {
  if (!activePlayers || activePlayers.length === 0) return null;

  const tips = [];
  for (const seatIndex of activePlayers) {
    const rec = getExploitRecommendations(seatIndex, { phase, pot });
    if (rec && rec.topExploit) {
      const stats = getOpponentStats(seatIndex);
      const classification = classifyOpponent(seatIndex);
      if (classification && stats?.reliable) {
        tips.push({
          seat: seatIndex,
          name: classification.label,
          icon: classification.icon,
          tip: rec.topExploit.action,
          reason: rec.topExploit.reason,
          sizing: rec.topExploit.sizing || null,
        });
      }
    }
  }

  return tips.length > 0 ? tips : null;
}

// === Reset all profiles ===
export function resetProfiles() {
  profiles = {};
  persistProfiles();
}
