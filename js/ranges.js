// === Range Visualizer ===
// 13x13 grid showing GTO opening ranges per position.

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Build hand matrix: row=first rank, col=second rank
// Above diagonal = suited, below diagonal = offsuit, diagonal = pairs
function getHandName(row, col) {
  if (row === col) return RANKS[row] + RANKS[col]; // pair
  if (row < col) return RANKS[row] + RANKS[col] + 's'; // suited (above diagonal)
  return RANKS[col] + RANKS[row] + 'o'; // offsuit (below diagonal)
}

let rangeData = null;

export async function loadRanges() {
  if (rangeData) return rangeData;
  try {
    const resp = await fetch('./data/ranges.json');
    rangeData = await resp.json();
    return rangeData;
  } catch (e) {
    console.warn('Failed to load ranges:', e);
    return null;
  }
}

export function renderRangeVisualizer(container, selectedPosition = 'UTG') {
  if (!rangeData) {
    container.innerHTML = '<div style="text-align:center; color:var(--text2); font-size:0.7em; padding:20px;">Ranges werden geladen...</div>';
    loadRanges().then(() => renderRangeVisualizer(container, selectedPosition));
    return;
  }

  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const posData = rangeData.positions[selectedPosition];
  if (!posData) {
    container.innerHTML = `<div style="text-align:center; color:var(--text2); font-size:0.7em; padding:20px;">Position "${selectedPosition}" nicht gefunden.</div>`;
    return;
  }
  const raiseHands = new Set(posData.raise || []);
  const callHands = new Set(posData.call || posData.defend_vs_raise || []);
  const threeBetHands = new Set(posData['3bet'] || []);

  // Count raise hands for percentage
  const totalCombos = 169;
  const raiseCount = raiseHands.size;
  const raisePct = (raiseCount / totalCombos * 100).toFixed(0);

  let html = '';

  // Position tabs
  html += '<div style="display:flex; gap:3px; margin-bottom:8px; justify-content:center;">';
  for (const pos of positions) {
    const isActive = pos === selectedPosition;
    html += `<button class="range-pos-btn${isActive ? ' active' : ''}" data-pos="${pos}" style="
      padding:3px 8px; border-radius:4px; border:1px solid ${isActive ? 'var(--gold)' : 'rgba(255,255,255,.08)'};
      background:${isActive ? 'rgba(255,215,0,.15)' : 'rgba(255,255,255,.03)'};
      color:${isActive ? 'var(--gold)' : 'var(--text2)'}; font-size:0.55em; font-weight:700;
      cursor:pointer; font-family:inherit;">${pos}</button>`;
  }
  html += '</div>';

  // Position info
  html += `<div style="text-align:center; font-size:0.55em; color:var(--text2); margin-bottom:6px;">
    ${posData.description || ''} — <span style="color:var(--gold); font-weight:700;">${raisePct}%</span> der Hände
  </div>`;

  // Legend
  html += `<div style="display:flex; gap:8px; justify-content:center; margin-bottom:6px; font-size:0.45em;">
    <span><span style="display:inline-block; width:8px; height:8px; background:rgba(34,197,94,.5); border-radius:2px; margin-right:2px;"></span> Raise</span>
    <span><span style="display:inline-block; width:8px; height:8px; background:rgba(59,130,246,.5); border-radius:2px; margin-right:2px;"></span> Call/Defend</span>
    <span><span style="display:inline-block; width:8px; height:8px; background:rgba(233,69,96,.5); border-radius:2px; margin-right:2px;"></span> 3-Bet</span>
    <span><span style="display:inline-block; width:8px; height:8px; background:rgba(255,255,255,.03); border-radius:2px; margin-right:2px;"></span> Fold</span>
  </div>`;

  // 13x13 grid
  html += '<div style="display:grid; grid-template-columns:repeat(13,1fr); gap:1px; font-size:0.4em;">';
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const hand = getHandName(row, col);
      const isPair = row === col;
      const isSuited = row < col;

      let bg = 'rgba(255,255,255,.02)';
      let color = 'var(--text2)';
      let border = 'none';

      if (threeBetHands.has(hand)) {
        bg = 'rgba(233,69,96,.35)';
        color = '#ff8a8a';
        border = '1px solid rgba(233,69,96,.3)';
      } else if (raiseHands.has(hand)) {
        bg = 'rgba(34,197,94,.25)';
        color = 'var(--green)';
        border = '1px solid rgba(34,197,94,.15)';
      } else if (callHands.has(hand)) {
        bg = 'rgba(59,130,246,.25)';
        color = '#60a5fa';
        border = '1px solid rgba(59,130,246,.15)';
      }

      const label = isPair ? RANKS[row] + RANKS[col]
        : isSuited ? RANKS[row] + RANKS[col] + 's'
        : RANKS[col] + RANKS[row] + 'o';

      html += `<div style="
        padding:2px 1px; text-align:center; background:${bg}; color:${color};
        border-radius:2px; font-weight:600; border:${border}; line-height:1.4;
        ${isPair ? 'font-weight:800;' : ''}
      " title="${hand}">${label}</div>`;
    }
  }
  html += '</div>';

  container.innerHTML = html;

  // Bind position tab clicks
  container.querySelectorAll('.range-pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      renderRangeVisualizer(container, btn.dataset.pos);
    });
  });
}
