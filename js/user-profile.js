// === User Profile: Personalized Coaching ===
// Builds a coaching profile from the player's historical stats.
// Identifies weaknesses, provides real-time tips during play,
// and tracks improvement over time. Each user gets their own profile.

import { getAggregateStats } from './history.js';
import { getCurrentUser } from './auth.js';

const PROFILE_PREFIX = 'pokerProfile_';

let profile = null;

// GTO benchmarks for 6-max cash (from leakfinder.js, kept in sync)
const GTO = {
  vpip:          { min: 22, max: 27, name: 'VPIP' },
  pfr:           { min: 18, max: 23, name: 'PFR' },
  cbetPct:       { min: 55, max: 65, name: 'C-Bet' },
  foldToCbetPct: { min: 42, max: 57, name: 'Fold to C-Bet' },
  wtsdPct:       { min: 27, max: 32, name: 'WTSD' },
  wsdPct:        { min: 50, max: 55, name: 'W$SD' },
  threeBet:      { min: 7,  max: 10, name: '3-Bet' },
  limpPct:       { min: 0,  max: 3,  name: 'Limp' },
};

// === Init: load existing profile from localStorage ===
export function initUserProfile() {
  const key = getStorageKey();
  try {
    const stored = localStorage.getItem(key);
    if (stored) profile = JSON.parse(stored);
  } catch (e) { /* fresh start */ }

  if (!profile) {
    profile = { leaks: [], strengths: [], lastUpdated: 0, handsAnalyzed: 0 };
  }
}

// === Rebuild profile from current hand history ===
export function updateUserProfile() {
  const stats = getAggregateStats();
  if (!stats || stats.totalHands < 15) return;

  const leaks = [];
  const strengths = [];

  for (const [key, bench] of Object.entries(GTO)) {
    const value = parseFloat(stats[key]);
    if (isNaN(value) || stats[key] === '--') continue;

    if (value < bench.min) {
      const dev = bench.min - value;
      leaks.push({
        stat: key, name: bench.name, value,
        gtoMin: bench.min, gtoMax: bench.max,
        direction: 'low',
        severity: dev > 10 ? 'high' : dev > 5 ? 'medium' : 'low',
        tip: buildLeakTip(key, 'low', value, bench),
      });
    } else if (value > bench.max) {
      const dev = value - bench.max;
      leaks.push({
        stat: key, name: bench.name, value,
        gtoMin: bench.min, gtoMax: bench.max,
        direction: 'high',
        severity: dev > 10 ? 'high' : dev > 5 ? 'medium' : 'low',
        tip: buildLeakTip(key, 'high', value, bench),
      });
    } else {
      strengths.push({ stat: key, name: bench.name, value });
    }
  }

  // Sort: worst leaks first
  const sev = { high: 0, medium: 1, low: 2 };
  leaks.sort((a, b) => sev[a.severity] - sev[b.severity]);

  profile = { leaks, strengths, lastUpdated: Date.now(), handsAnalyzed: stats.totalHands };
  persist();
}

export function getUserProfile() { return profile; }
export function getTopLeaks(n = 3) { return profile?.leaks?.slice(0, n) || []; }

// === Situational Coaching: match user's leaks to current game context ===
// ctx: { phase, position, facingBet, isAggressor, handStrength, equity }
// Returns a coaching tip object { type, text } or null.
export function getPersonalizedTip(ctx) {
  if (!profile || profile.leaks.length === 0) return null;

  for (const leak of profile.leaks) {
    const tip = matchLeak(leak, ctx);
    if (tip) return tip;
  }
  return null;
}

function matchLeak(leak, ctx) {
  const { stat, direction, value, gtoMin, gtoMax } = leak;
  const range = `${gtoMin}-${gtoMax}%`;

  // --- PREFLOP ---
  if (ctx.phase === 'preflop') {
    if (stat === 'vpip' && direction === 'high' && ctx.handStrength <= 1) {
      return w(`Dein VPIP ist ${value}% (GTO: ${range}). Du spielst zu viele schwache Hände — diese Hand folden.`);
    }
    if (stat === 'vpip' && direction === 'low' && ctx.handStrength >= 2 && isLatePos(ctx.position)) {
      return n(`Dein VPIP ist nur ${value}% (GTO: ${range}). In ${ctx.position} kannst du mehr Hände spielen.`);
    }
    if (stat === 'pfr' && direction === 'low' && !ctx.facingBet && ctx.handStrength >= 2) {
      return n(`Dein PFR ist ${value}% (GTO: ${range}). Raise statt limpen — nutze deine Fold Equity.`);
    }
    if (stat === 'limpPct' && direction === 'high' && !ctx.facingBet) {
      return w(`Du limpst ${value}% (GTO: max ${gtoMax}%). In 6-Max: Raise oder Fold. Limpen ist fast nie korrekt.`);
    }
    if (stat === 'threeBet' && direction === 'low' && ctx.facingBet && ctx.handStrength >= 3) {
      return n(`Deine 3-Bet Rate ist ${value}% (GTO: ${range}). Starke Hände wie diese oefter 3-betten.`);
    }
  }

  // --- FLOP ---
  if (ctx.phase === 'flop') {
    if (stat === 'cbetPct' && direction === 'low' && ctx.isAggressor && !ctx.facingBet) {
      return n(`Deine C-Bet Rate ist ${value}% (GTO: ${range}). Als Preflop-Aggressor hier oefter c-betten.`);
    }
    if (stat === 'cbetPct' && direction === 'high' && ctx.isAggressor && !ctx.facingBet && ctx.handStrength <= 1) {
      return w(`Deine C-Bet Rate ist ${value}% (GTO: ${range}). Nicht jedes Board c-betten — hier Check erwägen.`);
    }
    if (stat === 'foldToCbetPct' && direction === 'high' && ctx.facingBet && !ctx.isAggressor) {
      return w(`Du foldest ${value}% gegen C-Bets (GTO: ${range}). Calle oder raise oefter — du gibst zu viel Equity auf.`);
    }
    if (stat === 'foldToCbetPct' && direction === 'low' && ctx.facingBet && !ctx.isAggressor && ctx.handStrength <= 1) {
      return n(`Du callst C-Bets zu oft (${value}%, GTO: ${range}). Schwache Hände oefter aufgeben.`);
    }
  }

  // --- TURN / RIVER ---
  if (ctx.phase === 'turn' || ctx.phase === 'river') {
    if (stat === 'wtsdPct' && direction === 'high' && ctx.facingBet && ctx.handStrength <= 1) {
      return w(`Dein WTSD ist ${value}% (GTO: ${range}). Du gehst zu oft zum Showdown. Hier folden.`);
    }
    if (stat === 'wtsdPct' && direction === 'low' && ctx.handStrength >= 3 && ctx.facingBet) {
      return n(`Dein WTSD ist nur ${value}% (GTO: ${range}). Mit starken Händen oefter callen und zum Showdown gehen.`);
    }
    if (stat === 'wsdPct' && direction === 'low' && ctx.facingBet && ctx.handStrength <= 2) {
      return w(`Deine Showdown Win Rate ist nur ${value}% (GTO: ${range}). Waehle deine Showdown-Spots besser.`);
    }
  }

  return null;
}

function isLatePos(pos) {
  return ['BTN', 'CO', 'SB'].includes(pos);
}

function w(text) { return { type: 'warning', text: 'DEIN LEAK: ' + text }; }
function n(text) { return { type: 'neutral', text: 'COACHING: ' + text }; }

function buildLeakTip(stat, dir, value, bench) {
  const tips = {
    vpip_high:          `VPIP zu hoch (${value}% vs GTO ${bench.min}-${bench.max}%). Tighter spielen.`,
    vpip_low:           `VPIP zu niedrig (${value}% vs GTO ${bench.min}-${bench.max}%). Mehr Hände in Late Position.`,
    pfr_low:            `PFR zu niedrig (${value}% vs GTO ${bench.min}-${bench.max}%). Raise statt limpen.`,
    pfr_high:           `PFR zu hoch (${value}% vs GTO ${bench.min}-${bench.max}%). Tighter raisen in EP.`,
    cbetPct_low:        `C-Bet zu niedrig (${value}% vs GTO ${bench.min}-${bench.max}%). Als Aggressor oefter betten.`,
    cbetPct_high:       `C-Bet zu hoch (${value}% vs GTO ${bench.min}-${bench.max}%). Mehr Check-Backs.`,
    foldToCbetPct_high: `Fold to C-Bet zu hoch (${value}% vs GTO ${bench.min}-${bench.max}%). Oefter floaten.`,
    foldToCbetPct_low:  `Fold to C-Bet zu niedrig (${value}% vs GTO ${bench.min}-${bench.max}%). Schwache Hände folden.`,
    wtsdPct_high:       `WTSD zu hoch (${value}% vs GTO ${bench.min}-${bench.max}%). Oefter folden wenn geschlagen.`,
    wtsdPct_low:        `WTSD zu niedrig (${value}% vs GTO ${bench.min}-${bench.max}%). Oefter zum Showdown gehen.`,
    wsdPct_low:         `W$SD niedrig (${value}%). Bessere Showdown-Spots waehlen.`,
    wsdPct_high:        `W$SD hoch (${value}%). Eventuell zu tight zum Showdown.`,
    threeBet_low:       `3-Bet zu niedrig (${value}% vs GTO ${bench.min}-${bench.max}%). Mehr 3-Bets.`,
    threeBet_high:      `3-Bet zu hoch (${value}% vs GTO ${bench.min}-${bench.max}%). Tighter 3-betten.`,
    limpPct_high:       `Limp Rate zu hoch (${value}%). In 6-Max: Raise oder Fold.`,
    limpPct_low:        `Gutes Limp-Verhalten.`,
  };
  return tips[`${stat}_${dir}`] || `${bench.name}: ${value}% (GTO: ${bench.min}-${bench.max}%)`;
}

function getStorageKey() {
  const user = getCurrentUser();
  return PROFILE_PREFIX + (user?.id || 'guest');
}

function persist() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(profile));
  } catch (e) { console.warn('Profile persist failed:', e); }
}
