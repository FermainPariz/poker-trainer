// === Bankroll Manager ===
// Virtual bankroll that feels like real money.
// Buy-in management, session tracking, risk-of-ruin awareness.

import { getCurrentUser } from './auth.js';

const BANKROLL_BASE = 'pokerBankroll';

function storageKey() {
  const user = getCurrentUser();
  return user?.id ? `${BANKROLL_BASE}_${user.id}` : BANKROLL_BASE;
}

const DEFAULTS = {
  bankroll: 10000,
  totalDeposited: 10000,
  sessions: [],
  currentSession: null,
  settings: {
    maxBuyIn: 100, // max buy-in in BB
    stopLoss: -30,  // stop-loss in BB per session
    stopWin: 50,    // stop-win in BB per session
  },
};

let state = null;

// === Init ===
export function initBankroll() {
  try {
    const key = storageKey();
    let stored = localStorage.getItem(key);

    // Migration: copy guest data to user-specific key on first login
    if (!stored && key !== BANKROLL_BASE) {
      const guestData = localStorage.getItem(BANKROLL_BASE);
      if (guestData) {
        stored = guestData;
        localStorage.setItem(key, guestData);
      }
    }

    if (stored) {
      state = JSON.parse(stored);
      if (!state.settings) state.settings = DEFAULTS.settings;
      if (!state.sessions) state.sessions = [];
    } else {
      state = { ...DEFAULTS, sessions: [] };
      persist();
    }
  } catch (e) {
    console.warn('Failed to load bankroll:', e);
    state = { ...DEFAULTS, sessions: [] };
  }
}

// === Start Session ===
export function startSession(bigBlind) {
  const buyIn = Math.min(state.bankroll, bigBlind * state.settings.maxBuyIn);
  if (buyIn <= 0) return null;

  state.bankroll -= buyIn;
  state.currentSession = {
    id: Date.now(),
    startTime: Date.now(),
    buyIn,
    bigBlind,
    handsPlayed: 0,
    currentStack: buyIn,
    peakStack: buyIn,
    lowStack: buyIn,
    rebuys: 0,
    rebuyTotal: 0,
  };
  persist();
  return state.currentSession;
}

// === Update after each hand ===
export function updateSession(stack) {
  if (!state.currentSession) return;
  const s = state.currentSession;
  s.handsPlayed++;
  s.currentStack = stack;
  if (stack > s.peakStack) s.peakStack = stack;
  if (stack < s.lowStack) s.lowStack = stack;
  persist();
}

// === Rebuy ===
export function rebuy(bigBlind) {
  if (!state.currentSession) return 0;
  const amount = Math.min(state.bankroll, bigBlind * state.settings.maxBuyIn);
  if (amount <= 0) return 0;

  state.bankroll -= amount;
  state.currentSession.currentStack += amount;
  state.currentSession.rebuys++;
  state.currentSession.rebuyTotal += amount;
  persist();
  return amount;
}

// === End Session ===
export function endSession() {
  if (!state.currentSession) return null;
  const s = state.currentSession;
  const cashOut = s.currentStack;
  const totalInvested = s.buyIn + s.rebuyTotal;
  const pnl = cashOut - totalInvested;

  state.bankroll += cashOut;

  const sessionRecord = {
    id: s.id,
    startTime: s.startTime,
    endTime: Date.now(),
    duration: Date.now() - s.startTime,
    bigBlind: s.bigBlind,
    buyIn: s.buyIn,
    rebuys: s.rebuys,
    rebuyTotal: s.rebuyTotal,
    totalInvested,
    cashOut,
    pnl,
    pnlBB: Math.round(pnl / s.bigBlind * 10) / 10,
    handsPlayed: s.handsPlayed,
    bbPer100: s.handsPlayed >= 10 ? Math.round(pnl / s.bigBlind / s.handsPlayed * 100 * 10) / 10 : null,
    peakStack: s.peakStack,
    lowStack: s.lowStack,
  };

  state.sessions.push(sessionRecord);
  // Keep last 100 sessions
  if (state.sessions.length > 100) state.sessions = state.sessions.slice(-100);

  state.currentSession = null;
  persist();
  return sessionRecord;
}

// === Get current state ===
export function getBankroll() {
  return state.bankroll;
}

export function getCurrentSession() {
  return state.currentSession;
}

export function getSessionHistory() {
  return state.sessions;
}

// === Risk of Ruin calculation ===
// Simplified: based on current win rate and bankroll in BB
export function getRiskOfRuin() {
  if (state.sessions.length < 5) return null;

  const recentSessions = state.sessions.slice(-20);
  const totalHands = recentSessions.reduce((sum, s) => sum + s.handsPlayed, 0);
  const totalPnLBB = recentSessions.reduce((sum, s) => sum + (s.pnlBB || 0), 0);

  if (totalHands < 50) return null;

  const bbPer100 = totalPnLBB / totalHands * 100;
  const bankrollInBB = state.bankroll / (state.currentSession?.bigBlind || 10);

  // Simplified RoR: e^(-2 * winrate * bankroll / variance)
  // Using estimated variance of 80 BB/100 (typical for 6-max)
  const variance = 80;
  const ror = Math.exp(-2 * bbPer100 * bankrollInBB / (variance * variance));

  return {
    ror: Math.min(ror * 100, 100),
    bbPer100,
    bankrollInBB: Math.round(bankrollInBB),
    recommendation: bankrollInBB < 20 ? 'STOP — Zu wenig Bankroll fuer dieses Limit!'
      : bankrollInBB < 30 ? 'WARNUNG — Bankroll ist duenn. Vorsichtig spielen.'
      : bankrollInBB < 50 ? 'OK — Standard Bankroll Management.'
      : 'GUT — Komfortable Bankroll.',
  };
}

// === Session stop-loss / stop-win check ===
export function checkSessionLimits() {
  if (!state.currentSession) return null;
  const s = state.currentSession;
  const pnlBB = (s.currentStack - s.buyIn - s.rebuyTotal) / s.bigBlind;

  if (pnlBB <= state.settings.stopLoss) {
    return {
      type: 'stop-loss',
      message: `Stop-Loss erreicht: ${pnlBB.toFixed(1)} BB. Session beenden empfohlen.`,
      pnlBB,
    };
  }
  if (pnlBB >= state.settings.stopWin) {
    return {
      type: 'stop-win',
      message: `Stop-Win erreicht: +${pnlBB.toFixed(1)} BB. Gewinne sichern!`,
      pnlBB,
    };
  }
  return null;
}

// === Lifetime stats ===
export function getLifetimeStats() {
  if (state.sessions.length === 0) return null;

  const totalHands = state.sessions.reduce((s, x) => s + x.handsPlayed, 0);
  const totalPnL = state.sessions.reduce((s, x) => s + x.pnl, 0);
  const winningSessions = state.sessions.filter(s => s.pnl > 0).length;
  const totalTime = state.sessions.reduce((s, x) => s + x.duration, 0);

  return {
    sessions: state.sessions.length,
    totalHands,
    totalPnL,
    avgPnL: Math.round(totalPnL / state.sessions.length),
    winningSessions,
    winRate: (winningSessions / state.sessions.length * 100).toFixed(0),
    bbPer100: totalHands >= 50 ? (totalPnL / (state.currentSession?.bigBlind || 10) / totalHands * 100).toFixed(1) : '--',
    totalTime,
    bankroll: state.bankroll,
    totalDeposited: state.totalDeposited,
    roi: ((state.bankroll - state.totalDeposited) / state.totalDeposited * 100).toFixed(1),
  };
}

// === Reset bankroll ===
export function resetBankroll(amount = 10000) {
  state = { ...DEFAULTS, bankroll: amount, totalDeposited: amount, sessions: [] };
  persist();
}

// === Render bankroll panel ===
export function renderBankrollPanel(container) {
  const session = state.currentSession;
  const lifetime = getLifetimeStats();
  const risk = getRiskOfRuin();

  let html = '';

  // Current bankroll
  const brColor = state.bankroll >= state.totalDeposited ? 'var(--green)' : 'var(--accent)';
  html += `
    <div style="text-align:center; margin-bottom:12px;">
      <div style="font-size:0.5em; color:var(--text2); text-transform:uppercase;">Bankroll</div>
      <div style="font-size:1.6em; font-weight:800; color:${brColor};">$${state.bankroll.toLocaleString()}</div>
    </div>`;

  // Current session
  if (session) {
    const pnl = session.currentStack - session.buyIn - session.rebuyTotal;
    const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--accent)';
    const pnlBB = (pnl / session.bigBlind).toFixed(1);
    html += `
      <div style="padding:8px; margin-bottom:10px; background:rgba(255,255,255,.03); border-radius:8px;">
        <div style="font-size:0.55em; font-weight:700; color:var(--gold); text-transform:uppercase; margin-bottom:4px;">Aktuelle Session</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.65em;">
          <div>Stack: <span style="color:var(--text); font-weight:700;">$${session.currentStack}</span></div>
          <div>P&L: <span style="color:${pnlColor}; font-weight:700;">${pnl >= 0 ? '+' : ''}$${pnl} (${pnlBB} BB)</span></div>
          <div>Buy-in: <span style="color:var(--text2);">$${session.buyIn}</span></div>
          <div>Haende: <span style="color:var(--text2);">${session.handsPlayed}</span></div>
        </div>
      </div>`;
  }

  // Risk of Ruin
  if (risk) {
    const rorColor = risk.ror > 20 ? 'var(--accent)' : risk.ror > 5 ? 'var(--gold)' : 'var(--green)';
    html += `
      <div style="padding:8px; margin-bottom:10px; background:rgba(255,255,255,.03); border-radius:8px;">
        <div style="font-size:0.55em; font-weight:700; color:var(--text2); text-transform:uppercase; margin-bottom:4px;">Bankroll Health</div>
        <div style="font-size:0.6em; color:var(--text2);">
          Risk of Ruin: <span style="color:${rorColor}; font-weight:700;">${risk.ror.toFixed(1)}%</span>
        </div>
        <div style="font-size:0.6em; color:var(--text2);">
          Bankroll: <span style="font-weight:700;">${risk.bankrollInBB} BB</span>
        </div>
        <div style="font-size:0.55em; color:${rorColor}; margin-top:4px; font-weight:600;">${risk.recommendation}</div>
      </div>`;
  }

  // Lifetime stats
  if (lifetime) {
    const ltColor = lifetime.totalPnL >= 0 ? 'var(--green)' : 'var(--accent)';
    html += `
      <div style="padding:8px; margin-bottom:10px; background:rgba(255,255,255,.03); border-radius:8px;">
        <div style="font-size:0.55em; font-weight:700; color:var(--text2); text-transform:uppercase; margin-bottom:4px;">Lifetime</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.6em; color:var(--text2);">
          <div>Sessions: <span style="font-weight:700; color:var(--text);">${lifetime.sessions}</span></div>
          <div>Win Rate: <span style="font-weight:700; color:var(--text);">${lifetime.winRate}%</span></div>
          <div>Total P&L: <span style="font-weight:700; color:${ltColor};">${lifetime.totalPnL >= 0 ? '+' : ''}$${lifetime.totalPnL}</span></div>
          <div>BB/100: <span style="font-weight:700; color:var(--text);">${lifetime.bbPer100}</span></div>
          <div>Haende: <span style="font-weight:700; color:var(--text);">${lifetime.totalHands}</span></div>
          <div>ROI: <span style="font-weight:700; color:${ltColor};">${lifetime.roi}%</span></div>
        </div>
      </div>`;
  }

  // Session history (last 5)
  if (state.sessions.length > 0) {
    html += '<div style="font-size:0.6em; font-weight:700; color:var(--text); margin-bottom:4px;">Letzte Sessions:</div>';
    const recent = state.sessions.slice(-5).reverse();
    for (const s of recent) {
      const c = s.pnl >= 0 ? 'var(--green)' : 'var(--accent)';
      const date = new Date(s.startTime).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      html += `
        <div style="display:flex; justify-content:space-between; padding:3px 0; font-size:0.55em; color:var(--text2); border-bottom:1px solid rgba(255,255,255,.03);">
          <span>${date} | ${s.handsPlayed}h</span>
          <span style="color:${c}; font-weight:700;">${s.pnl >= 0 ? '+' : ''}$${s.pnl} (${s.pnlBB || 0} BB)</span>
        </div>`;
    }
  }

  container.innerHTML = html;
}

function persist() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save bankroll:', e);
  }
}
