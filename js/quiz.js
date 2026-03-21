// === Preflop Range Quiz with Spaced Repetition ===
// Practice GTO preflop decisions: RFI, facing raise, 3-bet, BB defense.
// Uses Leitner-style spaced repetition to drill weak spots.

const QUIZ_STORAGE_KEY = 'pokerQuizState';
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// All 169 unique starting hands
const ALL_HANDS = [];
for (let i = 0; i < 13; i++) {
  for (let j = i; j < 13; j++) {
    if (i === j) ALL_HANDS.push(RANKS[i] + RANKS[j]); // pair
    else {
      ALL_HANDS.push(RANKS[i] + RANKS[j] + 's'); // suited
      ALL_HANDS.push(RANKS[i] + RANKS[j] + 'o'); // offsuit
    }
  }
}

// === Scenario Types ===
const SCENARIOS = [
  { id: 'rfi', label: 'Open Raise (RFI)', description: 'Erster im Pot — Raise oder Fold?', positions: ['UTG', 'MP', 'CO', 'BTN', 'SB'], actions: ['Raise', 'Fold'] },
  { id: 'vs_raise', label: 'Facing Raise', description: 'Gegner hat geraised — 3-Bet, Call oder Fold?', positions: ['MP', 'CO', 'BTN', 'SB', 'BB'], actions: ['3-Bet', 'Call', 'Fold'] },
  { id: 'bb_defense', label: 'BB Defense', description: 'Du bist im Big Blind — Defend, 3-Bet oder Fold?', positions: ['BB'], actions: ['3-Bet', 'Call', 'Fold'] },
];

// === GTO Ranges (expanded from ranges.json) ===
// RFI ranges per position
let rangeData = null;

async function loadRangeData() {
  if (rangeData) return rangeData;
  try {
    const resp = await fetch('./data/ranges.json');
    rangeData = await resp.json();
    return rangeData;
  } catch (e) {
    console.warn('Failed to load ranges for quiz:', e);
    return null;
  }
}

// Facing-raise ranges: what to do when someone raised before you
// Based on standard 6-max GTO solutions
const FACING_RAISE_RANGES = {
  // When UTG raises, what do other positions do?
  vs_UTG: {
    MP:  { '3bet': ['AA','KK','QQ','AKs'], call: ['JJ','TT','AQs','AJs','KQs','AKo'], fold: 'rest' },
    CO:  { '3bet': ['AA','KK','QQ','JJ','AKs','AKo'], call: ['TT','99','AQs','AJs','ATs','KQs','KJs','QJs','AQo'], fold: 'rest' },
    BTN: { '3bet': ['AA','KK','QQ','JJ','TT','AKs','AQs','AKo'], call: ['99','88','77','AJs','ATs','KQs','KJs','QJs','JTs','T9s','98s','AQo','KQo'], fold: 'rest' },
    SB:  { '3bet': ['AA','KK','QQ','JJ','AKs','AKo'], call: ['TT','AQs','AQo'], fold: 'rest' },
    BB:  { '3bet': ['AA','KK','QQ','JJ','AKs','AKo'], call: ['TT','99','88','77','66','AQs','AJs','ATs','A9s','A5s','KQs','KJs','KTs','QJs','QTs','JTs','T9s','98s','87s','AQo','AJo','KQo'], fold: 'rest' },
  },
  vs_MP: {
    CO:  { '3bet': ['AA','KK','QQ','JJ','TT','AKs','AQs','AKo'], call: ['99','88','AJs','ATs','KQs','KJs','QJs','JTs','AQo','KQo'], fold: 'rest' },
    BTN: { '3bet': ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AKo','AQo'], call: ['88','77','AJs','ATs','A9s','KQs','KJs','KTs','QJs','QTs','JTs','T9s','98s','KQo'], fold: 'rest' },
    SB:  { '3bet': ['AA','KK','QQ','JJ','TT','AKs','AQs','AKo'], call: ['99','AJs','AQo'], fold: 'rest' },
    BB:  { '3bet': ['AA','KK','QQ','JJ','TT','AKs','AQs','AKo'], call: ['99','88','77','66','55','AJs','ATs','A9s','A5s','A4s','KQs','KJs','KTs','K9s','QJs','QTs','JTs','T9s','98s','87s','76s','AQo','AJo','KQo','KJo'], fold: 'rest' },
  },
  vs_CO: {
    BTN: { '3bet': ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AJs','A5s','AKo','AQo'], call: ['88','77','66','ATs','A9s','A4s','KQs','KJs','KTs','K9s','QJs','QTs','Q9s','JTs','J9s','T9s','98s','87s','76s','65s','AJo','KQo','KJo'], fold: 'rest' },
    SB:  { '3bet': ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AJs','AKo','AQo'], call: ['88','ATs','KQs','AJo'], fold: 'rest' },
    BB:  { '3bet': ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AJs','A5s','AKo','AQo'], call: ['88','77','66','55','44','33','22','ATs','A9s','A8s','A7s','A6s','A4s','A3s','A2s','KQs','KJs','KTs','K9s','K8s','K7s','QJs','QTs','Q9s','Q8s','JTs','J9s','J8s','T9s','T8s','98s','97s','87s','86s','76s','75s','65s','64s','54s','53s','43s','AJo','ATo','A9o','KQo','KJo','KTo','QJo','QTo','JTo','T9o'], fold: 'rest' },
  },
  vs_BTN: {
    SB:  { '3bet': ['AA','KK','QQ','JJ','TT','99','88','AKs','AQs','AJs','ATs','A5s','KQs','AKo','AQo'], call: ['77','A9s','KJs','AJo'], fold: 'rest' },
    BB:  { '3bet': ['AA','KK','QQ','JJ','TT','99','88','AKs','AQs','AJs','ATs','A5s','A4s','KQs','KJs','AKo','AQo','AJo'], call: ['77','66','55','44','33','22','A9s','A8s','A7s','A6s','A3s','A2s','KTs','K9s','K8s','K7s','K6s','K5s','K4s','K3s','K2s','QJs','QTs','Q9s','Q8s','Q7s','Q6s','JTs','J9s','J8s','J7s','T9s','T8s','T7s','98s','97s','87s','86s','76s','75s','65s','64s','54s','53s','43s','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o','A2o','KQo','KJo','KTo','K9o','K8o','QJo','QTo','Q9o','JTo','J9o','T9o','98o','87o','76o'], fold: 'rest' },
  },
  vs_SB: {
    BB:  { '3bet': ['AA','KK','QQ','JJ','TT','99','88','AKs','AQs','AJs','ATs','A5s','A4s','KQs','KJs','AKo','AQo'], call: ['77','66','55','44','33','22','A9s','A8s','A7s','A6s','A3s','A2s','KTs','K9s','K8s','K7s','K6s','QJs','QTs','Q9s','Q8s','JTs','J9s','J8s','T9s','T8s','98s','97s','87s','86s','76s','75s','65s','64s','54s','53s','43s','AJo','ATo','A9o','A8o','A7o','KQo','KJo','KTo','K9o','QJo','QTo','Q9o','JTo','J9o','T9o','98o','87o'], fold: 'rest' },
  },
};

// === Spaced Repetition State ===
// Leitner system: 5 boxes. Correct → move up. Wrong → back to box 1.
// Box 1 = every round, Box 2 = every 2, Box 3 = every 4, Box 4 = every 8, Box 5 = every 16
let quizState = {
  hands: {}, // handKey -> { box: 1-5, lastSeen: roundNumber, correct: 0, wrong: 0 }
  round: 0,
  totalAnswered: 0,
  totalCorrect: 0,
  streak: 0,
  bestStreak: 0,
  sessionCorrect: 0,
  sessionTotal: 0,
};

export function initQuiz() {
  try {
    const stored = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (stored) quizState = JSON.parse(stored);
  } catch (e) {
    console.warn('Failed to load quiz state:', e);
  }
  loadRangeData();
}

function persistQuiz() {
  try {
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(quizState));
  } catch (e) {
    console.warn('Failed to save quiz state:', e);
  }
}

// === Generate a quiz question ===
export function generateQuestion(scenarioFilter = null) {
  if (!rangeData) return null;

  // Pick scenario
  const scenarios = scenarioFilter ? SCENARIOS.filter(s => s.id === scenarioFilter) : SCENARIOS;
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  // Pick position
  const position = scenario.positions[Math.floor(Math.random() * scenario.positions.length)];

  // Pick hand — prioritize hands the player gets wrong (lower Leitner box)
  const hand = pickHandBySpacedRepetition(scenario.id, position);

  // Build context string + determine raiser position BEFORE looking up correct action
  let context = '';
  let raiserPos = '';
  if (scenario.id === 'rfi') {
    context = `Alle vor dir haben gefoldet. Du bist ${position}.`;
  } else if (scenario.id === 'vs_raise') {
    // Pick a raiser position before the player's position
    const allPos = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    const myIdx = allPos.indexOf(position);
    const possibleRaisers = allPos.slice(0, myIdx);
    raiserPos = possibleRaisers.length > 0 ? possibleRaisers[Math.floor(Math.random() * possibleRaisers.length)] : 'UTG';
    context = `${raiserPos} raised auf 2.5 BB. Du bist ${position}.`;
  } else if (scenario.id === 'bb_defense') {
    const raisers = ['UTG', 'MP', 'CO', 'BTN', 'SB'];
    raiserPos = raisers[Math.floor(Math.random() * raisers.length)];
    context = `${raiserPos} raised auf 2.5 BB. Du bist im Big Blind.`;
  }

  // Determine correct action (needs raiserPos for facing-raise scenarios)
  const correctAction = getCorrectAction(hand, scenario.id, position, raiserPos);

  return {
    hand,
    handDisplay: formatHand(hand),
    scenario: scenario.id,
    scenarioLabel: scenario.label,
    position,
    raiserPos,
    context,
    actions: scenario.actions,
    correctAction,
    explanation: getExplanation(hand, correctAction, scenario.id, position, raiserPos),
  };
}

// === Pick hand using spaced repetition ===
function pickHandBySpacedRepetition(scenarioId, position) {
  const candidates = [];

  for (const hand of ALL_HANDS) {
    const key = `${scenarioId}_${position}_${hand}`;
    const entry = quizState.hands[key];

    if (!entry) {
      // Never seen — highest priority (box 0)
      candidates.push({ hand, priority: 100 });
    } else {
      // Leitner: box N → show every 2^(N-1) rounds
      const interval = Math.pow(2, entry.box - 1);
      const roundsSince = quizState.round - entry.lastSeen;
      if (roundsSince >= interval) {
        // Due for review — lower box = higher priority
        candidates.push({ hand, priority: 50 - entry.box * 10 + Math.random() * 5 });
      }
    }
  }

  if (candidates.length === 0) {
    // All hands mastered for this round — pick random
    return ALL_HANDS[Math.floor(Math.random() * ALL_HANDS.length)];
  }

  // Sort by priority (highest first), pick from top 10 randomly
  candidates.sort((a, b) => b.priority - a.priority);
  const topN = candidates.slice(0, Math.min(10, candidates.length));
  return topN[Math.floor(Math.random() * topN.length)].hand;
}

// === Determine correct GTO action ===
function getCorrectAction(hand, scenarioId, position, raiserPos) {
  if (scenarioId === 'rfi') {
    const posRanges = rangeData?.positions?.[position];
    if (!posRanges) return 'Fold';
    if (posRanges.raise && posRanges.raise.includes(hand)) return 'Raise';
    return 'Fold';
  }

  if (scenarioId === 'vs_raise' || scenarioId === 'bb_defense') {
    // Look up facing-raise ranges
    const vsKey = `vs_${raiserPos || 'BTN'}`;
    const vsRanges = FACING_RAISE_RANGES[vsKey]?.[position];
    if (!vsRanges) {
      // Fallback: use 3-bet ranges from ranges.json
      const threeBetRange = rangeData?.['3bet_ranges']?.[vsKey];
      if (threeBetRange && threeBetRange.includes(hand)) return '3-Bet';
      // Check BB defend
      const bbDefend = rangeData?.positions?.BB?.defend_vs_raise;
      if (position === 'BB' && bbDefend && bbDefend.includes(hand)) return 'Call';
      return 'Fold';
    }
    if (vsRanges['3bet'] && vsRanges['3bet'].includes(hand)) return '3-Bet';
    if (vsRanges.call && vsRanges.call.includes(hand)) return 'Call';
    return 'Fold';
  }

  return 'Fold';
}

// === Record answer ===
export function recordAnswer(question, playerAnswer) {
  const key = `${question.scenario}_${question.position}_${question.hand}`;
  const isCorrect = playerAnswer === question.correctAction;

  if (!quizState.hands[key]) {
    quizState.hands[key] = { box: 1, lastSeen: quizState.round, correct: 0, wrong: 0 };
  }

  const entry = quizState.hands[key];
  entry.lastSeen = quizState.round;

  if (isCorrect) {
    entry.correct++;
    entry.box = Math.min(entry.box + 1, 5);
    quizState.totalCorrect++;
    quizState.streak++;
    quizState.sessionCorrect++;
    if (quizState.streak > quizState.bestStreak) quizState.bestStreak = quizState.streak;
  } else {
    entry.wrong++;
    entry.box = 1; // Back to box 1
    quizState.streak = 0;
  }

  quizState.totalAnswered++;
  quizState.sessionTotal++;
  quizState.round++;
  persistQuiz();

  return {
    isCorrect,
    correctAction: question.correctAction,
    explanation: question.explanation,
    streak: quizState.streak,
    accuracy: quizState.sessionTotal > 0 ? Math.round(quizState.sessionCorrect / quizState.sessionTotal * 100) : 0,
  };
}

// === Get explanation for correct action ===
function getExplanation(hand, correctAction, scenarioId, position, raiserPos) {
  const isPair = hand.length === 2;
  const isSuited = hand.endsWith('s');
  const highRank = hand[0];
  const lowRank = hand.length >= 3 ? hand[1] : hand[0]; // second rank char (pairs have length 2)

  if (scenarioId === 'rfi') {
    if (correctAction === 'Raise') {
      if (isPair) return `${hand} ist ein Pocket Pair — immer raisen als RFI aus ${position}.`;
      if (isSuited && highRank === 'A') return `${hand} ist ein suited Ace — stark genug fuer einen Open-Raise aus ${position}. Suited Aces haben Flush- und Straight-Potential.`;
      if (isSuited) return `${hand} (suited) hat gutes Postflop-Potential durch Flush-Draws. Aus ${position} profitabel zu raisen.`;
      return `${hand} ist stark genug fuer einen Open-Raise aus ${position}.`;
    } else {
      const isLate = ['BTN', 'CO'].includes(position);
      if (isLate) return `${hand} ist aus ${position} zu schwach zum Raisen. Auch wenn ${position} loose spielt, gibt es bessere Haende.`;
      return `${hand} ist aus ${position} zu schwach. In fruehen Positionen nur starke Haende spielen.`;
    }
  }

  if (scenarioId === 'vs_raise' || scenarioId === 'bb_defense') {
    if (correctAction === '3-Bet') {
      return `${hand} vs. ${raiserPos}-Raise: 3-Bet fuer Value! Diese Hand ist stark genug um den Pot preflop aufzubauen und Fold Equity zu gewinnen.`;
    }
    if (correctAction === 'Call') {
      return `${hand} vs. ${raiserPos}-Raise: Call. Gutes Postflop-Potential aber nicht stark genug fuer eine 3-Bet. Spielbar wegen Implied Odds${position === 'BB' ? ' und guten Pot Odds im BB' : ''}.`;
    }
    return `${hand} vs. ${raiserPos}-Raise: Fold. Zu schwach um profitabel gegen eine Raise zu spielen${position !== 'BB' ? '. Aus ' + position + ' brauchst du eine staerkere Hand.' : '.'}`;
  }

  return '';
}

// === Format hand for display ===
function formatHand(hand) {
  const suits = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const isPair = hand.length === 2;
  const isSuited = hand.endsWith('s');
  const rank1 = hand[0];
  const rank2 = isPair ? hand[1] : hand[1];

  // Assign random but visually consistent suits
  let suit1, suit2;
  if (isPair) {
    suit1 = 's'; suit2 = 'h';
  } else if (isSuited) {
    suit1 = suit2 = ['s', 'h', 'd', 'c'][Math.floor(Math.random() * 4)];
  } else {
    suit1 = 's'; suit2 = 'h';
  }

  return {
    card1: { rank: rank1, suit: suit1 },
    card2: { rank: rank2, suit: suit2 },
    name: hand,
    label: isPair ? `${rank1}${rank2}` : isSuited ? `${rank1}${rank2}s` : `${rank1}${rank2}o`,
    suited: isSuited,
    pair: isPair,
  };
}

// === Get quiz stats ===
export function getQuizStats() {
  const entries = Object.values(quizState.hands);
  const mastered = entries.filter(e => e.box >= 4).length;
  const learning = entries.filter(e => e.box >= 2 && e.box < 4).length;
  const struggling = entries.filter(e => e.box === 1 && e.wrong > 0).length;
  const unseen = ALL_HANDS.length * SCENARIOS.length * 5 - entries.length; // rough estimate

  return {
    totalAnswered: quizState.totalAnswered,
    totalCorrect: quizState.totalCorrect,
    accuracy: quizState.totalAnswered > 0 ? Math.round(quizState.totalCorrect / quizState.totalAnswered * 100) : 0,
    streak: quizState.streak,
    bestStreak: quizState.bestStreak,
    sessionCorrect: quizState.sessionCorrect,
    sessionTotal: quizState.sessionTotal,
    sessionAccuracy: quizState.sessionTotal > 0 ? Math.round(quizState.sessionCorrect / quizState.sessionTotal * 100) : 0,
    mastered,
    learning,
    struggling,
    handsStudied: entries.length,
  };
}

// === Reset session stats ===
export function resetSessionStats() {
  quizState.sessionCorrect = 0;
  quizState.sessionTotal = 0;
  persistQuiz();
}

// === Render quiz panel ===
export function renderQuizPanel(container) {
  const stats = getQuizStats();
  const question = generateQuestion();

  if (!question) {
    container.innerHTML = '<div style="text-align:center; color:var(--text2); font-size:0.7em; padding:20px;">Ranges werden geladen...</div>';
    return;
  }

  let html = '';

  // Stats bar
  html += `
    <div style="display:flex; justify-content:space-between; padding:4px 0; margin-bottom:10px; font-size:0.55em; color:var(--text2);">
      <span>Streak: <span style="color:var(--gold); font-weight:700;">${stats.streak}</span></span>
      <span>Session: <span style="color:${stats.sessionAccuracy >= 70 ? 'var(--green)' : 'var(--accent)'}; font-weight:700;">${stats.sessionAccuracy}%</span> (${stats.sessionCorrect}/${stats.sessionTotal})</span>
      <span>Gesamt: <span style="font-weight:700;">${stats.accuracy}%</span></span>
    </div>`;

  // Scenario context
  html += `
    <div style="text-align:center; padding:8px; background:rgba(255,255,255,.03); border-radius:8px; margin-bottom:10px;">
      <div style="font-size:0.5em; font-weight:700; color:var(--gold); text-transform:uppercase; margin-bottom:4px;">${question.scenarioLabel}</div>
      <div style="font-size:0.65em; color:var(--text);">${question.context}</div>
    </div>`;

  // Hand display
  const { card1, card2 } = question.handDisplay;
  const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const suitColors = { s: '#fff', h: '#e94560', d: '#60a5fa', c: '#22c55e' };
  const rankDisplay = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

  html += `
    <div style="display:flex; justify-content:center; gap:8px; margin-bottom:14px;">
      <div style="width:64px; height:88px; background:white; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.3);">
        <span style="font-size:1.3em; font-weight:800; color:${suitColors[card1.suit]};">${rankDisplay[card1.rank] || card1.rank}</span>
        <span style="font-size:1em; color:${suitColors[card1.suit]};">${suitSymbols[card1.suit]}</span>
      </div>
      <div style="width:64px; height:88px; background:white; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.3);">
        <span style="font-size:1.3em; font-weight:800; color:${suitColors[card2.suit]};">${rankDisplay[card2.rank] || card2.rank}</span>
        <span style="font-size:1em; color:${suitColors[card2.suit]};">${suitSymbols[card2.suit]}</span>
      </div>
    </div>
    <div style="text-align:center; font-size:0.7em; font-weight:700; color:var(--text); margin-bottom:10px;">${question.handDisplay.label}</div>`;

  // Action buttons
  html += '<div style="display:flex; gap:6px; justify-content:center; margin-bottom:10px;" id="quizActions">';
  const btnColors = {
    'Raise': 'var(--gold)', 'Fold': 'var(--text2)', 'Call': '#60a5fa',
    '3-Bet': 'var(--accent)', 'Check': 'var(--green)',
  };
  for (const action of question.actions) {
    const color = btnColors[action] || 'var(--text)';
    html += `<button class="quiz-action-btn" data-action="${action}" style="
      padding:8px 18px; border-radius:8px; border:2px solid ${color}; background:transparent;
      color:${color}; font-size:0.75em; font-weight:700; cursor:pointer; font-family:inherit;
      transition:all 0.2s;
    ">${action}</button>`;
  }
  html += '</div>';

  // Feedback area (hidden until answer)
  html += '<div id="quizFeedback" style="display:none;"></div>';

  // Progress indicators
  html += `
    <div style="display:flex; gap:8px; justify-content:center; margin-top:8px; font-size:0.45em; color:var(--text2);">
      <span style="color:var(--green);">Gemeistert: ${stats.mastered}</span>
      <span style="color:var(--gold);">Lernend: ${stats.learning}</span>
      <span style="color:var(--accent);">Schwierig: ${stats.struggling}</span>
    </div>`;

  container.innerHTML = html;

  // Store question data for answer handling
  container.dataset.questionJson = JSON.stringify(question);

  // Bind action buttons
  container.querySelectorAll('.quiz-action-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuizAnswer(container, btn.dataset.action));
  });
}

function handleQuizAnswer(container, playerAnswer) {
  const question = JSON.parse(container.dataset.questionJson);
  const result = recordAnswer(question, playerAnswer);

  // Disable all buttons
  container.querySelectorAll('.quiz-action-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'default';

    // Highlight correct answer
    if (btn.dataset.action === result.correctAction) {
      btn.style.background = 'rgba(34,197,94,.2)';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green)';
      btn.style.opacity = '1';
    }
    // Mark wrong answer
    if (btn.dataset.action === playerAnswer && !result.isCorrect) {
      btn.style.background = 'rgba(233,69,96,.2)';
      btn.style.borderColor = 'var(--accent)';
      btn.style.color = 'var(--accent)';
      btn.style.opacity = '1';
    }
  });

  // Show feedback
  const feedbackEl = document.getElementById('quizFeedback');
  if (feedbackEl) {
    const icon = result.isCorrect ? '✓' : '✗';
    const color = result.isCorrect ? 'var(--green)' : 'var(--accent)';
    const label = result.isCorrect ? 'Richtig!' : `Falsch — Korrekt: ${result.correctAction}`;

    feedbackEl.innerHTML = `
      <div style="padding:10px; border-radius:8px; background:rgba(255,255,255,.03); border-left:3px solid ${color};">
        <div style="font-size:0.8em; font-weight:700; color:${color}; margin-bottom:4px;">${icon} ${label}</div>
        <div style="font-size:0.6em; color:var(--text2); line-height:1.5;">${result.explanation}</div>
      </div>
      <button id="quizNextBtn" style="
        width:100%; margin-top:8px; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.1);
        background:rgba(255,255,255,.05); color:var(--text); font-size:0.7em; font-weight:600;
        cursor:pointer; font-family:inherit;
      ">Naechste Frage →</button>`;
    feedbackEl.style.display = 'block';

    // Bind next button
    document.getElementById('quizNextBtn').addEventListener('click', () => {
      renderQuizPanel(container);
    });
  }

  // Update stats bar
  const statsBar = container.querySelector('div:first-child');
  if (statsBar) {
    const stats = getQuizStats();
    statsBar.innerHTML = `
      <span>Streak: <span style="color:var(--gold); font-weight:700;">${stats.streak}</span></span>
      <span>Session: <span style="color:${stats.sessionAccuracy >= 70 ? 'var(--green)' : 'var(--accent)'}; font-weight:700;">${stats.sessionAccuracy}%</span> (${stats.sessionCorrect}/${stats.sessionTotal})</span>
      <span>Gesamt: <span style="font-weight:700;">${stats.accuracy}%</span></span>`;
  }
}

// === Reset all quiz progress ===
export function resetQuizProgress() {
  quizState = {
    hands: {},
    round: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    streak: 0,
    bestStreak: 0,
    sessionCorrect: 0,
    sessionTotal: 0,
  };
  persistQuiz();
}
