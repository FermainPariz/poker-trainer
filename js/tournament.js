// === Tournament / SNG Engine ===
// Manages blind levels, eliminations, payouts, and tournament state.

import { playBlindsUp, playElimination, playTournamentWin } from './sound.js';

// === Blind Structures ===
const BLIND_STRUCTURES = {
  turbo: {
    name: 'Turbo',
    handsPerLevel: 6,
    levels: [
      { sb: 10, bb: 20, ante: 0 },
      { sb: 15, bb: 30, ante: 0 },
      { sb: 25, bb: 50, ante: 5 },
      { sb: 50, bb: 100, ante: 10 },
      { sb: 75, bb: 150, ante: 15 },
      { sb: 100, bb: 200, ante: 20 },
      { sb: 150, bb: 300, ante: 30 },
      { sb: 200, bb: 400, ante: 40 },
      { sb: 300, bb: 600, ante: 60 },
      { sb: 500, bb: 1000, ante: 100 },
      { sb: 750, bb: 1500, ante: 150 },
      { sb: 1000, bb: 2000, ante: 200 },
    ],
  },
  normal: {
    name: 'Normal',
    handsPerLevel: 10,
    levels: [
      { sb: 10, bb: 20, ante: 0 },
      { sb: 15, bb: 30, ante: 0 },
      { sb: 20, bb: 40, ante: 0 },
      { sb: 25, bb: 50, ante: 5 },
      { sb: 30, bb: 60, ante: 5 },
      { sb: 50, bb: 100, ante: 10 },
      { sb: 75, bb: 150, ante: 15 },
      { sb: 100, bb: 200, ante: 20 },
      { sb: 150, bb: 300, ante: 30 },
      { sb: 200, bb: 400, ante: 40 },
      { sb: 300, bb: 600, ante: 60 },
      { sb: 500, bb: 1000, ante: 100 },
    ],
  },
};

// === Payout Structures ===
const PAYOUTS = {
  6: { 1: 0.65, 2: 0.35 },                       // 6-max: top 2 paid
  9: { 1: 0.50, 2: 0.30, 3: 0.20 },              // 9-max: top 3 paid
};

let tournamentState = null;

// === Start Tournament ===
export function startTournament(config = {}) {
  const numPlayers = config.numPlayers || 6;
  const structure = BLIND_STRUCTURES[config.speed || 'normal'];
  const buyIn = config.buyIn || 1000;

  tournamentState = {
    active: true,
    numPlayers,
    startingPlayers: numPlayers,
    buyIn,
    prizePool: buyIn * numPlayers,
    structure,
    currentLevel: 0,
    handsAtLevel: 0,
    totalHandsPlayed: 0,
    eliminationOrder: [], // seat indices in order of elimination
    payouts: PAYOUTS[numPlayers] || PAYOUTS[6],
    startTime: Date.now(),
    finished: false,
    humanFinishPosition: null,
  };

  return getCurrentBlinds();
}

// === Get current blinds ===
export function getCurrentBlinds() {
  if (!tournamentState) return null;
  const level = tournamentState.structure.levels[tournamentState.currentLevel];
  return {
    sb: level.sb,
    bb: level.bb,
    ante: level.ante,
    level: tournamentState.currentLevel + 1,
    handsRemaining: tournamentState.structure.handsPerLevel - tournamentState.handsAtLevel,
  };
}

// === After each hand: check blind increase + eliminations ===
export function onTournamentHandComplete(game) {
  if (!tournamentState || !tournamentState.active) return null;

  tournamentState.totalHandsPlayed++;
  tournamentState.handsAtLevel++;

  const events = [];

  // Check for eliminated players (stack <= 0)
  for (const p of game.players) {
    if (p.stack <= 0 && !p.sittingOut) {
      p.sittingOut = true;
      p.stack = 0;
      tournamentState.eliminationOrder.push(p.id);
      events.push({
        type: 'elimination',
        player: p,
        position: game.numPlayers - tournamentState.eliminationOrder.length + 1,
      });
      playElimination();
    }
  }

  // Count remaining players
  const remaining = game.players.filter(p => !p.sittingOut);
  const remainingCount = remaining.length;

  // Check if human is eliminated
  const human = game.players[game.humanSeat];
  if (human.sittingOut && !tournamentState.finished) {
    const humanPos = game.numPlayers - tournamentState.eliminationOrder.indexOf(game.humanSeat);
    tournamentState.humanFinishPosition = humanPos;
    // Tournament continues but human watches? No — end it for human.
    tournamentState.finished = true;
    const payout = getPlayerPayout(humanPos);
    events.push({
      type: 'human_eliminated',
      position: humanPos,
      payout,
      prizePool: tournamentState.prizePool,
    });
    return events;
  }

  // Check if tournament is over (1 player remaining)
  if (remainingCount <= 1) {
    tournamentState.finished = true;
    const winner = remaining[0];
    const isHumanWinner = winner && winner.id === game.humanSeat;
    const humanPos = isHumanWinner ? 1 : (tournamentState.humanFinishPosition || 2);
    tournamentState.humanFinishPosition = humanPos;
    const payout = getPlayerPayout(humanPos);

    if (isHumanWinner) playTournamentWin();

    events.push({
      type: 'tournament_end',
      winner,
      humanPosition: humanPos,
      payout,
      prizePool: tournamentState.prizePool,
      isHumanWinner,
    });
    return events;
  }

  // Check blind level increase
  if (tournamentState.handsAtLevel >= tournamentState.structure.handsPerLevel) {
    const maxLevel = tournamentState.structure.levels.length - 1;
    if (tournamentState.currentLevel < maxLevel) {
      tournamentState.currentLevel++;
      tournamentState.handsAtLevel = 0;
      const newBlinds = getCurrentBlinds();

      // Update game blinds
      game.smallBlind = newBlinds.sb;
      game.bigBlind = newBlinds.bb;

      playBlindsUp();
      events.push({
        type: 'blinds_up',
        level: tournamentState.currentLevel + 1,
        sb: newBlinds.sb,
        bb: newBlinds.bb,
        ante: newBlinds.ante,
      });
    }
  }

  return events.length > 0 ? events : null;
}

// === Post antes (for tournament) ===
export function postAntes(game) {
  if (!tournamentState) return 0;
  const blinds = getCurrentBlinds();
  if (!blinds || !blinds.ante) return 0;

  let totalAntes = 0;
  for (const p of game.players) {
    if (!p.sittingOut && p.stack > 0) {
      const ante = Math.min(p.stack, blinds.ante);
      p.stack -= ante;
      totalAntes += ante;
    }
  }
  game.pot += totalAntes;
  return totalAntes;
}

// === Get payout for position ===
function getPlayerPayout(position) {
  if (!tournamentState) return 0;
  const pct = tournamentState.payouts[position];
  return pct ? Math.round(tournamentState.prizePool * pct) : 0;
}

// === Get tournament info for HUD ===
export function getTournamentInfo() {
  if (!tournamentState) return null;
  const blinds = getCurrentBlinds();
  const remaining = tournamentState.startingPlayers - tournamentState.eliminationOrder.length;
  return {
    active: tournamentState.active,
    finished: tournamentState.finished,
    level: blinds?.level || 1,
    sb: blinds?.sb || 10,
    bb: blinds?.bb || 20,
    ante: blinds?.ante || 0,
    handsRemaining: blinds?.handsRemaining || 0,
    playersRemaining: remaining,
    totalPlayers: tournamentState.startingPlayers,
    prizePool: tournamentState.prizePool,
    eliminationOrder: tournamentState.eliminationOrder,
    totalHandsPlayed: tournamentState.totalHandsPlayed,
    humanFinishPosition: tournamentState.humanFinishPosition,
    duration: Date.now() - tournamentState.startTime,
  };
}

// === Is tournament active? ===
export function isTournament() {
  return tournamentState !== null && tournamentState.active;
}

export function isTournamentFinished() {
  return tournamentState?.finished || false;
}

// === End / Reset Tournament ===
export function endTournament() {
  const result = tournamentState ? { ...tournamentState } : null;
  tournamentState = null;
  return result;
}

// === Render tournament HUD overlay ===
export function renderTournamentHUD(container) {
  const info = getTournamentInfo();
  if (!info || !container) return;

  const nextLevel = tournamentState.structure.levels[tournamentState.currentLevel + 1];
  const nextBlindsStr = nextLevel ? `${nextLevel.sb}/${nextLevel.bb}` : 'MAX';

  container.innerHTML = `
    <div class="tourney-hud">
      <div class="tourney-hud-item">
        <span class="tourney-label">Level</span>
        <span class="tourney-value">${info.level}</span>
      </div>
      <div class="tourney-hud-item">
        <span class="tourney-label">Blinds</span>
        <span class="tourney-value">${info.sb}/${info.bb}${info.ante ? ' +' + info.ante : ''}</span>
      </div>
      <div class="tourney-hud-item">
        <span class="tourney-label">Naechstes</span>
        <span class="tourney-value tourney-next">${nextBlindsStr} (${info.handsRemaining}h)</span>
      </div>
      <div class="tourney-hud-item">
        <span class="tourney-label">Spieler</span>
        <span class="tourney-value">${info.playersRemaining}/${info.totalPlayers}</span>
      </div>
      <div class="tourney-hud-item">
        <span class="tourney-label">Preisgeld</span>
        <span class="tourney-value tourney-prize">$${info.prizePool.toLocaleString()}</span>
      </div>
    </div>`;
}

// === Get payout table for display ===
export function getPayoutTable() {
  if (!tournamentState) return [];
  const result = [];
  for (const [pos, pct] of Object.entries(tournamentState.payouts)) {
    result.push({
      position: parseInt(pos),
      percentage: (pct * 100).toFixed(0),
      amount: Math.round(tournamentState.prizePool * pct),
    });
  }
  return result;
}
