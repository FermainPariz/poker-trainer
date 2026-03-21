// === Leak Finder: Aggregate Analysis with Pro Benchmarks ===
// Compares your stats against winning 6-max player ranges.
// Based on research from PokerTracker, 2+2 forums, and pro training sites.

import { getHistory, getAggregateStats } from './history.js';

// === Pro Benchmarks for 6-Max Cash Games ===
// Source: Aggregated from PokerTracker databases, Upswing Poker, Run It Once
const BENCHMARKS = {
  vpip:         { min: 22, max: 27, label: 'VPIP', unit: '%', desc: 'Voluntarily Put In Pot' },
  pfr:          { min: 18, max: 23, label: 'PFR', unit: '%', desc: 'Preflop Raise' },
  threeBet:     { min: 7,  max: 10, label: '3-Bet', unit: '%', desc: '3-Bet Frequenz' },
  cbetPct:      { min: 55, max: 65, label: 'C-Bet', unit: '%', desc: 'Continuation Bet' },
  foldToCbetPct:{ min: 42, max: 57, label: 'Fold to C-Bet', unit: '%', desc: 'Fold gegen Continuation Bet' },
  wtsdPct:      { min: 27, max: 32, label: 'WTSD', unit: '%', desc: 'Went to Showdown' },
  wsdPct:       { min: 50, max: 55, label: 'W$SD', unit: '%', desc: 'Won $ at Showdown' },
  limpPct:      { min: 0,  max: 3,  label: 'Limp', unit: '%', desc: 'Open-Limp Frequenz' },
};

// Position-specific VPIP benchmarks
const POSITION_BENCHMARKS = {
  UTG: { vpip: { min: 14, max: 18 }, pfr: { min: 13, max: 17 } },
  MP:  { vpip: { min: 17, max: 22 }, pfr: { min: 16, max: 21 } },
  CO:  { vpip: { min: 25, max: 30 }, pfr: { min: 23, max: 28 } },
  BTN: { vpip: { min: 38, max: 48 }, pfr: { min: 30, max: 42 } },
  SB:  { vpip: { min: 28, max: 36 }, pfr: { min: 22, max: 30 } },
  BB:  { vpip: { min: 25, max: 35 }, pfr: { min: 10, max: 16 } },
};

// === Find leaks in player's game ===
export function findLeaks(minHands = 20) {
  const hands = getHistory();
  if (hands.length < minHands) {
    return {
      ready: false,
      handsNeeded: minHands - hands.length,
      message: `Spiele noch ${minHands - hands.length} Haende fuer eine aussagekraeftige Analyse.`,
    };
  }

  const stats = getAggregateStats(hands);
  if (!stats) return { ready: false, message: 'Keine Daten verfuegbar.' };

  const leaks = [];

  // --- PREFLOP LEAKS ---

  // VPIP too high (playing too many hands)
  const vpip = parseFloat(stats.vpip);
  if (vpip > BENCHMARKS.vpip.max + 5) {
    leaks.push({
      severity: 'critical',
      category: 'preflop',
      title: 'Zu viele Haende gespielt',
      stat: `VPIP: ${stats.vpip}% (Optimal: ${BENCHMARKS.vpip.min}-${BENCHMARKS.vpip.max}%)`,
      message: `Du spielst ${(vpip - BENCHMARKS.vpip.max).toFixed(0)}% zu viele Haende. Das kostet dich langfristig am meisten Geld, weil du mit schwachen Haenden in schlechte Situationen geraetst.`,
      fix: 'Tighte dein Opening-Range. Folde offsuited Haende wie K8o, Q7o, J6o. Spiele nur Haende die in der Standard-Range fuer deine Position sind.',
      priority: 1,
    });
  } else if (vpip > BENCHMARKS.vpip.max) {
    leaks.push({
      severity: 'moderate',
      category: 'preflop',
      title: 'VPIP leicht zu hoch',
      stat: `VPIP: ${stats.vpip}% (Optimal: ${BENCHMARKS.vpip.min}-${BENCHMARKS.vpip.max}%)`,
      message: 'Du spielst etwas zu viele Haende. Kleine Anpassung noetig.',
      fix: 'Entferne die schwachsten Haende aus deiner Range, besonders aus frueher Position.',
      priority: 3,
    });
  }

  // VPIP too low (playing too tight)
  if (vpip < BENCHMARKS.vpip.min - 3) {
    leaks.push({
      severity: 'moderate',
      category: 'preflop',
      title: 'Zu tight — zu wenige Haende gespielt',
      stat: `VPIP: ${stats.vpip}% (Optimal: ${BENCHMARKS.vpip.min}-${BENCHMARKS.vpip.max}%)`,
      message: 'Du spielst zu wenige Haende. Dadurch verpasst du profitable Spots und bist vorhersagbar.',
      fix: 'Oeffne mehr Haende vom Button und Cutoff: suited connectors (87s, 76s), suited aces (A5s-A2s), und broadways.',
      priority: 2,
    });
  }

  // PFR gap (VPIP - PFR should be small)
  const pfr = parseFloat(stats.pfr);
  const vpipPfrGap = vpip - pfr;
  if (vpipPfrGap > 8) {
    leaks.push({
      severity: 'critical',
      category: 'preflop',
      title: 'Zu viel Limpen / zu passiv preflop',
      stat: `VPIP-PFR Gap: ${vpipPfrGap.toFixed(1)}% (Optimal: < 5%)`,
      message: `Grosser Gap zwischen VPIP (${stats.vpip}%) und PFR (${stats.pfr}%) bedeutet du limpst oder callst zu oft statt zu raisen.`,
      fix: 'Regel: Wenn eine Hand gut genug zum Spielen ist, ist sie gut genug zum Raisen. Eliminiere Open-Limps komplett aus deinem Spiel.',
      priority: 1,
    });
  }

  // Limp frequency
  const limpPct = parseFloat(stats.limpPct);
  if (limpPct > 5) {
    leaks.push({
      severity: 'critical',
      category: 'preflop',
      title: 'Open-Limping',
      stat: `Limp: ${stats.limpPct}% (Optimal: 0-3%)`,
      message: 'Open-Limping (callen ohne vorherigen Raise) ist einer der groessten Fehler. Du baust keinen Pot auf und gibst Initiative ab.',
      fix: 'Komplett eliminieren! Jede Hand die du spielst, spielst du mit einem Raise. Wenn sie nicht gut genug zum Raisen ist, folde.',
      priority: 1,
    });
  }

  // 3-Bet frequency
  const threeBet = parseFloat(stats.threeBet);
  if (threeBet < 4 && hands.length >= 30) {
    leaks.push({
      severity: 'moderate',
      category: 'preflop',
      title: 'Zu selten 3-Bettet',
      stat: `3-Bet: ${stats.threeBet}% (Optimal: ${BENCHMARKS.threeBet.min}-${BENCHMARKS.threeBet.max}%)`,
      message: 'Du 3-bettest zu selten. Dadurch lassen dich Gegner billig Flops sehen und du baust keine grossen Pots mit starken Haenden.',
      fix: '3-Bette mit Premium-Haenden (AA-QQ, AK) fuer Value UND mit einigen Bluffs (A5s, A4s, KQs aus Position).',
      priority: 2,
    });
  }

  // --- POSTFLOP LEAKS ---

  // C-Bet frequency
  const cbet = parseFloat(stats.cbetPct);
  if (stats.cbetPct !== '--') {
    if (cbet < BENCHMARKS.cbetPct.min - 10) {
      leaks.push({
        severity: 'moderate',
        category: 'postflop',
        title: 'Zu selten Continuation-Bettet',
        stat: `C-Bet: ${stats.cbetPct}% (Optimal: ${BENCHMARKS.cbetPct.min}-${BENCHMARKS.cbetPct.max}%)`,
        message: 'Als Preflop-Aggressor hast du einen natuerlichen Vorteil auf dem Flop. Diesen Vorteil nutzt du nicht genug.',
        fix: 'C-Bette auf trockenen Boards (z.B. K-7-2 rainbow) fast immer. Auf nassen Boards selektiver, aber mindestens 50% der Zeit.',
        priority: 2,
      });
    }
    if (cbet > BENCHMARKS.cbetPct.max + 15) {
      leaks.push({
        severity: 'moderate',
        category: 'postflop',
        title: 'Zu oft Continuation-Bettet',
        stat: `C-Bet: ${stats.cbetPct}% (Optimal: ${BENCHMARKS.cbetPct.min}-${BENCHMARKS.cbetPct.max}%)`,
        message: 'Du C-Bettest zu oft. Gegner koennen das exploiten indem sie dich floating oder check-raisen.',
        fix: 'Auf nassen Boards mit Whiffs (keine Hand, keine Draws) checken. Checke auch manchmal mit starken Haenden fuer Balance.',
        priority: 3,
      });
    }
  }

  // Fold to C-Bet
  const foldCbet = parseFloat(stats.foldToCbetPct);
  if (stats.foldToCbetPct !== '--') {
    if (foldCbet > 65) {
      leaks.push({
        severity: 'critical',
        category: 'postflop',
        title: 'Foldest zu oft gegen C-Bets',
        stat: `Fold to C-Bet: ${stats.foldToCbetPct}% (Optimal: ${BENCHMARKS.foldToCbetPct.min}-${BENCHMARKS.foldToCbetPct.max}%)`,
        message: `${stats.foldToCbetPct}% Fold-Rate gegen C-Bets ist viel zu hoch. Gegner koennen dich mit jedem Bluff ausnutzen.`,
        fix: 'Verteidige mehr Haende: Top Pair, mittlere Paare, Gutshots, Backdoor-Draws. Du brauchst nur ~40% Equity zum Callen.',
        priority: 1,
      });
    }
    if (foldCbet < 30) {
      leaks.push({
        severity: 'moderate',
        category: 'postflop',
        title: 'Foldest zu selten gegen C-Bets',
        stat: `Fold to C-Bet: ${stats.foldToCbetPct}% (Optimal: ${BENCHMARKS.foldToCbetPct.min}-${BENCHMARKS.foldToCbetPct.max}%)`,
        message: 'Du callst zu viel. Das kostet Geld wenn Gegner fuer Value betten.',
        fix: 'Folde Haende ohne Pair und ohne Draw. Nicht jeder Flop muss verteidigt werden.',
        priority: 3,
      });
    }
  }

  // WTSD
  const wtsd = parseFloat(stats.wtsdPct);
  if (stats.wtsdPct !== '--') {
    if (wtsd > 35) {
      leaks.push({
        severity: 'moderate',
        category: 'postflop',
        title: 'Zu oft zum Showdown (Calling Station Tendenz)',
        stat: `WTSD: ${stats.wtsdPct}% (Optimal: ${BENCHMARKS.wtsdPct.min}-${BENCHMARKS.wtsdPct.max}%)`,
        message: 'Du gehst zu oft zum Showdown. Das bedeutet du callst zu viele Bets mit marginalen Haenden.',
        fix: 'Lerne wann du aufgeben musst. Auf dem River ohne starke Hand gegen grosse Bets: Fold ist meistens richtig.',
        priority: 2,
      });
    }
    if (wtsd < 22) {
      leaks.push({
        severity: 'moderate',
        category: 'postflop',
        title: 'Zu selten zum Showdown — zu fit-or-fold',
        stat: `WTSD: ${stats.wtsdPct}% (Optimal: ${BENCHMARKS.wtsdPct.min}-${BENCHMARKS.wtsdPct.max}%)`,
        message: 'Du gibst zu oft auf. Gegner koennen dich mit Bluffs vom Pot vertreiben.',
        fix: 'Verteidige oefter mit mittelstarken Haenden. Nicht jeder Gegner-Bet ist Value.',
        priority: 3,
      });
    }
  }

  // --- POSITION LEAKS ---
  if (stats.byPosition) {
    for (const [pos, data] of Object.entries(stats.byPosition)) {
      if (data.hands < 5) continue;
      const bench = POSITION_BENCHMARKS[pos];
      if (!bench) continue;

      const posVpip = parseFloat(data.vpip);
      if (posVpip > bench.vpip.max + 10) {
        leaks.push({
          severity: 'moderate',
          category: 'position',
          title: `Zu loose aus ${pos}`,
          stat: `${pos} VPIP: ${data.vpip}% (Optimal: ${bench.vpip.min}-${bench.vpip.max}%)`,
          message: `Du spielst aus ${pos} zu viele Haende. ${pos === 'UTG' || pos === 'MP' ? 'Fruehe Position braucht eine enge Range.' : ''}`,
          fix: `Reduziere deine Range aus ${pos}. ${pos === 'UTG' ? 'UTG: Nur Premium und starke Haende (AA-77, AK-ATs, KQs).' : ''}`,
          priority: pos === 'UTG' || pos === 'MP' ? 2 : 3,
        });
      }
    }
  }

  // Sort by priority
  leaks.sort((a, b) => a.priority - b.priority);

  return {
    ready: true,
    totalHands: hands.length,
    stats,
    leaks,
    benchmarks: BENCHMARKS,
    positionBenchmarks: POSITION_BENCHMARKS,
    overallGrade: calculateGrade(stats),
  };
}

// === Calculate overall player grade ===
function calculateGrade(stats) {
  let score = 0;
  let checks = 0;

  function checkStat(value, min, max, weight = 1) {
    if (value === '--' || isNaN(parseFloat(value))) return;
    const v = parseFloat(value);
    checks += weight;
    if (v >= min && v <= max) score += weight;
    else if (v >= min - 3 && v <= max + 3) score += weight * 0.5;
  }

  checkStat(stats.vpip, BENCHMARKS.vpip.min, BENCHMARKS.vpip.max, 3);
  checkStat(stats.pfr, BENCHMARKS.pfr.min, BENCHMARKS.pfr.max, 3);
  checkStat(stats.threeBet, BENCHMARKS.threeBet.min, BENCHMARKS.threeBet.max, 2);
  checkStat(stats.cbetPct, BENCHMARKS.cbetPct.min, BENCHMARKS.cbetPct.max, 2);
  checkStat(stats.foldToCbetPct, BENCHMARKS.foldToCbetPct.min, BENCHMARKS.foldToCbetPct.max, 2);
  checkStat(stats.wtsdPct, BENCHMARKS.wtsdPct.min, BENCHMARKS.wtsdPct.max, 1);
  checkStat(stats.limpPct, BENCHMARKS.limpPct.min, BENCHMARKS.limpPct.max, 2);

  if (checks === 0) return { grade: '?', score: 0, label: 'Zu wenig Daten' };

  const pct = score / checks * 100;
  if (pct >= 85) return { grade: 'A', score: pct, label: 'Excellent — Pro-Level' };
  if (pct >= 70) return { grade: 'B', score: pct, label: 'Gut — Solider Spieler' };
  if (pct >= 50) return { grade: 'C', score: pct, label: 'Durchschnitt — Leaks vorhanden' };
  if (pct >= 30) return { grade: 'D', score: pct, label: 'Schwach — Deutliche Leaks' };
  return { grade: 'F', score: pct, label: 'Anfaenger — Fundamentale Fehler' };
}

// === Render Leak Finder Panel ===
export function renderLeakFinder(container) {
  const result = findLeaks(10);

  if (!result.ready) {
    container.innerHTML = `
      <div style="text-align:center; color: var(--text2); font-size: 0.75em; padding: 20px;">
        ${result.message}
      </div>`;
    return;
  }

  const { stats, leaks, overallGrade } = result;

  // Grade badge color
  const gradeColors = { A: 'var(--green)', B: '#60a5fa', C: 'var(--gold)', D: '#ff8c00', F: 'var(--accent)' };
  const gradeColor = gradeColors[overallGrade.grade] || 'var(--text2)';

  let html = '';

  // Overall Grade
  html += `
    <div style="text-align:center; margin-bottom:12px;">
      <div style="font-size:2em; font-weight:800; color:${gradeColor};">${overallGrade.grade}</div>
      <div style="font-size:0.65em; color:var(--text2);">${overallGrade.label}</div>
      <div style="font-size:0.55em; color:var(--text2); margin-top:2px;">${stats.totalHands} Haende analysiert</div>
    </div>`;

  // Key Stats vs Benchmarks
  html += '<div class="stats-grid" style="margin-bottom:12px;">';
  const statPairs = [
    ['VPIP', stats.vpip, BENCHMARKS.vpip],
    ['PFR', stats.pfr, BENCHMARKS.pfr],
    ['3-Bet', stats.threeBet, BENCHMARKS.threeBet],
    ['C-Bet', stats.cbetPct, BENCHMARKS.cbetPct],
    ['Fold C-Bet', stats.foldToCbetPct, BENCHMARKS.foldToCbetPct],
    ['WTSD', stats.wtsdPct, BENCHMARKS.wtsdPct],
    ['Limp', stats.limpPct, BENCHMARKS.limpPct],
  ];

  for (const [label, value, bench] of statPairs) {
    const v = parseFloat(value);
    let color = 'var(--text)';
    if (!isNaN(v)) {
      if (v >= bench.min && v <= bench.max) color = 'var(--green)';
      else if (v >= bench.min - 3 && v <= bench.max + 3) color = 'var(--gold)';
      else color = 'var(--accent)';
    }
    html += `
      <div class="stat-card">
        <span class="stat-label">${label}</span>
        <span class="stat-value" style="color:${color}">${value === '--' ? '--' : value + '%'}</span>
        <span style="font-size:0.45em; color:var(--text2);">${bench.min}-${bench.max}%</span>
      </div>`;
  }
  html += '</div>';

  // P&L
  const pnlColor = stats.totalPnL >= 0 ? 'var(--green)' : 'var(--accent)';
  html += `
    <div style="text-align:center; margin-bottom:12px; padding:6px; background:rgba(255,255,255,.02); border-radius:6px;">
      <div style="font-size:0.5em; color:var(--text2); text-transform:uppercase;">Profit / Loss</div>
      <div style="font-size:1.1em; font-weight:800; color:${pnlColor};">
        ${stats.totalPnL >= 0 ? '+' : ''}$${stats.totalPnL}
      </div>
      <div style="font-size:0.5em; color:var(--text2);">${stats.bbPer100} BB/100</div>
    </div>`;

  // Leaks
  if (leaks.length > 0) {
    html += '<div style="font-size:0.7em; font-weight:700; color:var(--text); margin-bottom:6px;">Gefundene Leaks:</div>';
    for (const leak of leaks) {
      const sevColors = { critical: 'var(--accent)', moderate: 'var(--gold)', minor: 'var(--text2)' };
      const sevLabels = { critical: 'KRITISCH', moderate: 'MITTEL', minor: 'GERING' };
      html += `
        <div style="padding:8px; margin-bottom:6px; border-radius:6px; background:rgba(255,255,255,.02); border-left:3px solid ${sevColors[leak.severity]};">
          <div style="font-size:0.5em; font-weight:700; color:${sevColors[leak.severity]}; text-transform:uppercase;">${sevLabels[leak.severity]} — ${leak.category}</div>
          <div style="font-size:0.7em; font-weight:700; color:var(--text); margin:2px 0;">${leak.title}</div>
          <div style="font-size:0.6em; color:var(--text2);">${leak.stat}</div>
          <div style="font-size:0.6em; color:var(--text2); margin-top:4px;">${leak.message}</div>
          <div style="font-size:0.55em; color:var(--green); margin-top:4px; padding:4px 6px; background:rgba(34,197,94,.06); border-radius:4px;">
            Fix: ${leak.fix}
          </div>
        </div>`;
    }
  } else {
    html += '<div style="text-align:center; font-size:0.7em; color:var(--green); padding:12px;">Keine signifikanten Leaks gefunden! Weiter so.</div>';
  }

  // Position breakdown
  if (stats.byPosition && Object.keys(stats.byPosition).length > 0) {
    html += '<div style="font-size:0.7em; font-weight:700; color:var(--text); margin:10px 0 6px;">Nach Position:</div>';
    html += '<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:4px;">';
    for (const [pos, data] of Object.entries(stats.byPosition)) {
      const posColor = data.pnl >= 0 ? 'var(--green)' : 'var(--accent)';
      html += `
        <div style="padding:4px; background:rgba(255,255,255,.02); border-radius:4px; text-align:center;">
          <div style="font-size:0.55em; font-weight:700; color:var(--gold);">${pos}</div>
          <div style="font-size:0.5em; color:var(--text2);">${data.hands}h | V:${data.vpip}%</div>
          <div style="font-size:0.55em; font-weight:700; color:${posColor};">${data.pnl >= 0 ? '+' : ''}$${data.pnl}</div>
        </div>`;
    }
    html += '</div>';
  }

  container.innerHTML = html;
}
