// === Stats & Bankroll Tracking ===
import { getFatigueAnalysis, getFatigueWarning } from './scoring.js';

// === Session P&L Tracking ===
const session = {
  startStack: 0,
  handsPlayed: 0,
  history: [], // { hand: number, stack: number, pnl: number }
};

export function initSession(startStack) {
  session.startStack = startStack;
  session.handsPlayed = 0;
  session.history = [{ hand: 0, stack: startStack, pnl: 0 }];
}

export function recordHandResult(handNumber, currentStack) {
  session.handsPlayed++;
  const pnl = currentStack - session.startStack;
  session.history.push({ hand: handNumber, stack: currentStack, pnl });
}

export function getSessionPnL() {
  if (session.history.length === 0) return 0;
  return session.history[session.history.length - 1].pnl;
}

// === Render Stats Panel ===
export function renderStatsOverlay(containerEl, sessionStats, pnl) {
  if (!containerEl) return;

  const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--accent)';
  const pnlSign = pnl >= 0 ? '+' : '';

  containerEl.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Session P&L</span>
        <span class="stat-value" style="color: ${pnlColor}; font-size: 1.3em">${pnlSign}$${pnl}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Haende</span>
        <span class="stat-value">${sessionStats ? sessionStats.handsPlayed : 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Win-Rate</span>
        <span class="stat-value">${sessionStats ? sessionStats.winRate + '%' : '--'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">VPIP</span>
        <span class="stat-value">${sessionStats ? sessionStats.vpip + '%' : '--'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">PFR</span>
        <span class="stat-value">${sessionStats ? sessionStats.pfr + '%' : '--'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Aggression</span>
        <span class="stat-value">${sessionStats ? sessionStats.af : '--'}</span>
      </div>
    </div>
    ${sessionStats && sessionStats.tiltScore > 0 ? `
      <div class="tilt-meter">
        <span class="stat-label">Tilt-Level</span>
        <div class="tilt-bar">
          <div class="tilt-fill" style="width: ${sessionStats.tiltScore}%; background: ${getTiltColor(sessionStats.tiltScore)}"></div>
        </div>
        <span class="tilt-value">${sessionStats.tiltScore}/100</span>
      </div>
    ` : ''}
    ${renderPnLChart(session.history)}
    ${renderFatigueSection()}
  `;
}

function getTiltColor(score) {
  if (score >= 70) return 'var(--accent)';
  if (score >= 40) return 'var(--gold)';
  return 'var(--green)';
}

// === Decision Fatigue Section ===
function renderFatigueSection() {
  const analysis = getFatigueAnalysis();
  if (!analysis) return '';

  const warning = getFatigueWarning();
  const windows = analysis.windows;

  // Build quality-over-time chart
  const scores = windows.map(w => w.avgScore);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = max - min || 1;

  const points = scores.map((v, i) => {
    const x = (i / Math.max(1, scores.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const lastScore = scores[scores.length - 1];
  const lineColor = lastScore >= 60 ? 'var(--green)' : lastScore >= 30 ? 'var(--gold)' : 'var(--accent)';

  let warningHTML = '';
  if (warning) {
    const bgColor = warning.level === 'warning' ? 'rgba(233,69,96,.15)' : 'rgba(255,215,0,.1)';
    const borderColor = warning.level === 'warning' ? 'rgba(233,69,96,.3)' : 'rgba(255,215,0,.2)';
    const textColor = warning.level === 'warning' ? 'var(--accent)' : 'var(--gold)';
    warningHTML = `
      <div style="padding:6px 10px; margin-top:8px; border-radius:6px; background:${bgColor}; border:1px solid ${borderColor};">
        <span style="font-size:0.7em; color:${textColor}; font-weight:600;">
          ${warning.level === 'warning' ? 'FATIGUE WARNUNG' : 'HINWEIS'}: ${warning.message}
        </span>
      </div>`;
  }

  const optimalHTML = analysis.optimalMinutes
    ? `<div class="stat-card"><span class="stat-label">Optimale Dauer</span><span class="stat-value" style="color:var(--gold)">${analysis.optimalMinutes} Min</span></div>`
    : '';

  return `
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,.06);">
      <span class="stat-label" style="display:block; margin-bottom:6px; font-size:0.75em;">Decision Fatigue</span>
      <div class="stats-grid" style="grid-template-columns: 1fr 1fr 1fr;">
        <div class="stat-card">
          <span class="stat-label">Session</span>
          <span class="stat-value">${analysis.sessionMinutes} Min</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Score-Drop</span>
          <span class="stat-value" style="color:${analysis.scoreDrop > 15 ? 'var(--accent)' : analysis.scoreDrop > 5 ? 'var(--gold)' : 'var(--green)'}">
            ${analysis.scoreDrop > 0 ? '-' : '+'}${Math.abs(analysis.scoreDrop)}
          </span>
        </div>
        ${optimalHTML}
      </div>
      <div class="pnl-chart" style="margin-top:6px;">
        <span class="stat-label">Qualitaet ueber Zeit</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="pnl-svg">
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
          <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>
      ${warningHTML}
    </div>`;
}

// === P&L Chart (CSS-based sparkline) ===
function renderPnLChart(history) {
  if (history.length < 3) return '';

  const values = history.map(h => h.pnl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  // Zero line
  const zeroY = 100 - ((0 - min) / range) * 100;

  return `
    <div class="pnl-chart">
      <span class="stat-label">P&L Verlauf</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="pnl-svg">
        <line x1="0" y1="${zeroY}" x2="100" y2="${zeroY}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>
        <polyline points="${points}" fill="none" stroke="${values[values.length - 1] >= 0 ? 'var(--green)' : 'var(--accent)'}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      </svg>
    </div>
  `;
}
