// === App: 6-Max Game Loop with HUD + Analysis + Psychology + Stats + Auth ===

import { Game, PHASES, ACTIONS } from './engine.js';
import { AIPlayer, AI_ASSIGNMENTS } from './ai.js';
import { analyzeHand, generateStreetReview } from './analyzer.js';
import { initHUD, requestEquity, updateFullHUD, clearHUD, onEquityUpdate } from './hud.js';
import { recordHand, getSessionStats } from './psychology.js';
import { initSession, recordHandResult, getSessionPnL, renderStatsOverlay } from './stats.js';
import { getPreflopComment, getPostflopComment, getActionComment, getHandSummary, getSituationComment, getAIActionComment, challengeCoachAdvice, getGTOFrequencies } from './coach.js';
import { initHistory, saveHand, captureSnapshot, getAggregateStats } from './history.js';
import { renderLeakFinder } from './leakfinder.js';
import { initBankroll, startSession, updateSession, endSession, getCurrentSession, checkSessionLimits, renderBankrollPanel, getBankroll, getSessionHistory, getLifetimeStats } from './bankroll.js';
import { loadRanges, renderRangeVisualizer } from './ranges.js';
import { initQuiz, renderQuizPanel } from './quiz.js';
import { initProfiler, processHandForProfiles, getOpponentBadgeHTML, getOpponentAdvice, getExploitTip } from './profiler.js';
import { scoreDecision, formatScoreResult, getSessionScoring, recordHandPlayed, resetScoring, markTurnStart, getFatigueWarning } from './scoring.js';
import { initMatrix, renderMatrix, toggleMatrix, isMatrixVisible } from './matrix.js';
import { initAuth, onAuthReady, getCurrentUser, isGuestMode, isLoggedIn, getDisplayName, signOut } from './auth.js';
import { cloudSaveSession, cloudSaveHand, cloudUpdateStats, cloudLoadUserData, cloudGetLeaderboard } from './db.js';
import { initUserProfile, updateUserProfile, getPersonalizedTip, getTopLeaks } from './user-profile.js';
import * as UI from './ui.js';

// === State ===
const game = new Game({ numPlayers: 6, smallBlind: 5, bigBlind: 10, startingStack: 1000, humanSeat: 0 });
const aiPlayers = {}; // seatIndex -> AIPlayer
let streetSnapshots = {}; // captured at each phase transition

// Create AI players for all non-human seats
for (let i = 0; i < game.numPlayers; i++) {
  if (i !== game.humanSeat) {
    const profileIdx = i > game.humanSeat ? i - 1 : i;
    aiPlayers[i] = new AIPlayer(AI_ASSIGNMENTS[profileIdx] || 'fish');
  }
}

let isPlayerTurn = false;
let gameInProgress = false;
let actionLock = false;

// === Initialize ===
function init() {
  if (!window.Hand) {
    UI.showMessage('Fehler: Poker-Engine nicht geladen!', 5000);
  }

  initHUD();
  initHistory();
  initBankroll();
  initQuiz();
  initProfiler();
  initMatrix();
  initUserProfile();
  startSession(game.bigBlind);
  initSession(game.startingStack);
  loadRanges(); // preload range data
  bindEvents();
  UI.updateBlindsInfo(game.smallBlind, game.bigBlind);
  UI.updateTopBar(game);
  UI.renderAllSeats(game);
  UI.showActionBar(false);
  UI.showContinueBar(true, '6-Max Texas Hold\'em Trainer — Druecke Start!', '');
  document.getElementById('btnDeal').textContent = 'Spiel starten';

  // Save session on page unload
  window.addEventListener('beforeunload', () => {
    if (getCurrentSession()) {
      const record = endSession();
      // Fire-and-forget cloud sync (may not complete on unload)
      syncSessionToCloud(record);
    }
  });
}

// === Events ===
function bindEvents() {
  document.getElementById('btnDeal').addEventListener('click', startNewHand);
  document.getElementById('btnFold').addEventListener('click', () => playerAction(ACTIONS.FOLD));
  document.getElementById('btnCheck').addEventListener('click', () => playerAction(ACTIONS.CHECK));
  document.getElementById('btnCall').addEventListener('click', () => playerAction(ACTIONS.CALL));
  document.getElementById('btnRaise').addEventListener('click', () => {
    const amount = UI.getRaiseAmount();
    const available = game.getAvailableActions();
    const action = available.includes(ACTIONS.RAISE) ? ACTIONS.RAISE : ACTIONS.BET;
    playerAction(action, amount);
  });
  document.getElementById('btnAllIn').addEventListener('click', () => playerAction(ACTIONS.ALLIN));

  // Raise slider
  const slider = document.getElementById('raiseSlider');
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    document.getElementById('raiseDisplay').textContent = `$${val}`;
    document.getElementById('raiseAmount').textContent = `$${val}`;
  });

  // Pot-size presets — raise = toCall + fraction of (pot after calling)
  document.getElementById('btnHalfPot').addEventListener('click', () => {
    const toCall = game.getCallAmount();
    const potAfterCall = game.pot + game.getCurrentBetsTotal() + toCall;
    const betSize = Math.floor(potAfterCall / 2);
    setSliderValue(Math.max(toCall + betSize, game.getMinRaise()));
  });

  document.getElementById('btnFullPot').addEventListener('click', () => {
    const toCall = game.getCallAmount();
    const potAfterCall = game.pot + game.getCurrentBetsTotal() + toCall;
    setSliderValue(Math.max(toCall + potAfterCall, game.getMinRaise()));
  });

  // Panel toggles
  document.getElementById('btnToggleAnalysis').addEventListener('click', toggleAnalysis);
  document.getElementById('btnCloseAnalysis').addEventListener('click', toggleAnalysis);
  document.getElementById('btnToggleStats').addEventListener('click', toggleStats);
  document.getElementById('btnCloseStats').addEventListener('click', toggleStats);
  document.getElementById('btnDismissTilt').addEventListener('click', () => {
    document.getElementById('tiltOverlay').classList.remove('visible');
  });
  document.getElementById('btnToggleLeaks').addEventListener('click', toggleLeaks);
  document.getElementById('btnCloseLeaks').addEventListener('click', toggleLeaks);
  document.getElementById('btnToggleBankroll').addEventListener('click', toggleBankroll);
  document.getElementById('btnCloseBankroll').addEventListener('click', toggleBankroll);
  document.getElementById('btnToggleRanges').addEventListener('click', toggleRanges);
  document.getElementById('btnCloseRanges').addEventListener('click', toggleRanges);
  document.getElementById('btnToggleQuiz').addEventListener('click', toggleQuiz);
  document.getElementById('btnCloseQuiz').addEventListener('click', toggleQuiz);
  document.getElementById('btnToggleMatrix').addEventListener('click', () => {
    toggleMatrix();
    if (isMatrixVisible()) renderMatrix(game);
  });
  document.getElementById('btnToggleLeaderboard').addEventListener('click', toggleLeaderboard);
  document.getElementById('btnCloseLeaderboard').addEventListener('click', toggleLeaderboard);

  // Logout
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (getCurrentSession()) endSession();
    await signOut();
  });

  // HUD toggle
  document.getElementById('btnToggleHud').addEventListener('click', toggleHud);

  // Coach feedback — challenge the coach's advice
  document.getElementById('btnCoachFeedback').addEventListener('click', () => {
    if (!gameInProgress) return;
    const critique = challengeCoachAdvice(game);
    if (critique) showCoachComment(critique);
  });

  // Mobile menu
  initMobileMenu();

  // Panel backdrop (close panel when tapping backdrop on mobile)
  document.getElementById('panelBackdrop')?.addEventListener('click', closeAllPanels);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore when typing in input fields
    if (e.target.tagName === 'INPUT') return;

    if (!isPlayerTurn || actionLock) return;
    const avail = game.getAvailableActions();
    switch (e.key.toLowerCase()) {
      case 'f':
        if (avail.includes(ACTIONS.FOLD)) playerAction(ACTIONS.FOLD);
        break;
      case 'c':
        if (avail.includes(ACTIONS.CHECK)) playerAction(ACTIONS.CHECK);
        else if (avail.includes(ACTIONS.CALL)) playerAction(ACTIONS.CALL);
        break;
      case 'r':
        if (avail.includes(ACTIONS.RAISE)) playerAction(ACTIONS.RAISE, UI.getRaiseAmount());
        else if (avail.includes(ACTIONS.BET)) playerAction(ACTIONS.BET, UI.getRaiseAmount());
        break;
      case 'a':
        if (avail.includes(ACTIONS.ALLIN)) playerAction(ACTIONS.ALLIN);
        break;
    }
  });
}

function setSliderValue(val) {
  const slider = document.getElementById('raiseSlider');
  val = Math.min(val, parseInt(slider.max));
  val = Math.max(val, parseInt(slider.min));
  slider.value = val;
  document.getElementById('raiseDisplay').textContent = `$${val}`;
  document.getElementById('raiseAmount').textContent = `$${val}`;
}

// === Start New Hand ===
async function startNewHand() {
  // Auto-rebuy busted players
  for (let i = 0; i < game.numPlayers; i++) {
    if (game.players[i].stack <= 0) {
      // Human bust = end bankroll session, start new one
      if (i === game.humanSeat && getCurrentSession()) {
        const record = endSession();
        syncSessionToCloud(record);
        startSession(game.bigBlind);
      }
      game.rebuyPlayer(i);
    }
  }

  UI.resetTable(game);
  clearHUD();
  hideCoachBubble();
  streetSnapshots = {};

  const info = game.startHand();
  if (!info) {
    UI.showMessage('Nicht genug Spieler!', 2000);
    return;
  }

  gameInProgress = true;
  recordHandPlayed();
  streetSnapshots.preflop = captureSnapshot(game);

  UI.renderAllSeats(game);
  UI.updateTopBar(game);
  updatePotDisplay();

  // Update matrix if visible
  if (isMatrixVisible()) renderMatrix(game);
  UI.showContinueBar(false);

  UI.showMessage(`Hand #${game.handNumber}`, 700);
  updateOpponentBadges();
  await delay(800);

  // Request initial equity
  requestEquity(game);
  updateFullHUD(game);

  await gameLoop();
}

// === Game Loop ===
async function gameLoop() {
  let loopGuard = 0;

  while (gameInProgress) {
    try {
    if (game.phase === PHASES.SHOWDOWN || game.phase === PHASES.IDLE) break;
    if (++loopGuard > 100) { console.error('gameLoop: safety break'); break; }

    if (game.currentPlayerIndex < 0 || game.currentPlayerIndex >= game.players.length) {
      console.error('gameLoop: invalid currentPlayerIndex', game.currentPlayerIndex);
      break;
    }
    const cp = game.players[game.currentPlayerIndex];

    if (cp.folded || cp.allIn || cp.sittingOut) {
      const next = game._nextInHand(game.currentPlayerIndex);
      if (next === -1) break; // no one can act
      game.currentPlayerIndex = next;
      continue;
    }

    if (cp.isAI) {
      await aiTurn(game.currentPlayerIndex);
    } else {
      // Human player's turn
      isPlayerTurn = true;
      actionLock = false;
      markTurnStart(); // Track decision timing for fatigue analysis
      UI.showActionBar(true);
      UI.updateActionButtons(game);
      UI.renderAllSeats(game);

      // Update HUD with current game state
      requestEquity(game);
      updateFullHUD(game);
      updateGTOFrequencies();
      if (isMatrixVisible()) renderMatrix(game);

      // Coach: preflop comment (range-based), then situation comment (equity-based)
      if (game.phase === 'preflop') {
        const preflopCoach = getPreflopComment(game);
        if (preflopCoach) showCoachComment(preflopCoach);
      }
      const sitComment = getSituationComment(game);
      if (sitComment) showCoachComment(sitComment);

      // Exploit recommendations for opponents still in the hand
      showExploitTips(game);

      // Personalized coaching: warn about player's specific leaks
      showPersonalizedCoaching(game);

      // Re-run coach once equity calculation completes (async from web worker)
      onEquityUpdate(() => {
        if (!isPlayerTurn) return; // player already acted
        updateFullHUD(game);
        updateGTOFrequencies();
        const updated = getSituationComment(game);
        if (updated) showCoachComment(updated);
      });
      return;
    }
    } catch (err) {
      console.error('gameLoop error:', err);
      gameInProgress = false;
      isPlayerTurn = false;
      break;
    }
  }
}

// === AI Turn ===
async function aiTurn(seatIndex) {
  isPlayerTurn = false;
  UI.showActionBar(false);

  const aiPlayer = aiPlayers[seatIndex];
  if (!aiPlayer) return;

  UI.renderAllSeats(game);

  const decision = await aiPlayer.decide(game, seatIndex);
  if (!decision) return;

  const callAmount = game.getCallAmount();
  const allInAmount = game.players[seatIndex].stack;
  const result = game.performAction(decision.action, decision.amount || 0);



  let labelAmount = decision.action === ACTIONS.CALL ? callAmount : (decision.amount || 0);
  if (decision.action === ACTIONS.ALLIN) labelAmount = allInAmount;
  UI.showActionLabel(seatIndex, decision.action, labelAmount);

  // Coach: comment on notable AI actions
  const aiComment = getAIActionComment(game, seatIndex, decision.action, labelAmount);
  if (aiComment) showCoachComment(aiComment);

  UI.renderAllSeats(game);
  updatePotDisplay();

  if (result.nextPhase) {
    await handlePhaseTransition(result);
  }

  if (result.done) {
    await handleHandEnd(result);
    return;
  }
}

// === Player Action ===
async function playerAction(action, amount = 0) {
  if (!isPlayerTurn || !gameInProgress || actionLock) return;
  actionLock = true;
  isPlayerTurn = false;
  UI.showActionBar(false);

  const callAmount = game.getCallAmount();
  const allInAmount = game.humanPlayer.stack;

  // Score the decision BEFORE performing it (need current game state)
  const gtoFreqs = getGTOFrequencies(game);
  const pot = game.pot + game.getCurrentBetsTotal();
  const scoreResult = scoreDecision(gtoFreqs, action, pot, game.bigBlind);
  if (scoreResult) {
    showScorePopup(scoreResult);
    updateScoringHUD();
  }

  const result = game.performAction(action, amount);

  let labelAmount = action === ACTIONS.CALL ? callAmount : amount;
  if (action === ACTIONS.ALLIN) labelAmount = allInAmount;
  UI.showActionLabel(game.humanSeat, action, labelAmount);

  // Coach: action review
  const actionCoach = getActionComment(action, game, callAmount);
  if (actionCoach) showCoachComment(actionCoach);

  // Update matrix if visible
  if (isMatrixVisible()) renderMatrix(game);

  UI.renderAllSeats(game);
  updatePotDisplay();

  // When human folds: skip AI play, resolve hand immediately
  if (action === ACTIONS.FOLD) {
    await handleHumanFold(result);
    return;
  }

  if (result.nextPhase) {
    await handlePhaseTransition(result);
  }

  if (result.done) {
    await handleHandEnd(result);
    return;
  }

  await delay(300);
  await gameLoop();
}

// === Human Fold: Skip AI play, show result immediately ===
async function handleHumanFold(engineResult) {
  gameInProgress = false;
  isPlayerTurn = false;
  actionLock = false;
  UI.showActionBar(false);

  await delay(500);

  // Reveal all remaining players' hands
  game.phase = PHASES.SHOWDOWN;
  UI.renderAllSeats(game);

  // Deal remaining community cards if any
  while (game.communityCards.length < 5) {
    game.deck.burn();
    game.communityCards.push(...game.deck.deal(1));
  }
  UI.renderCommunityCards(game.communityCards);

  const active = game.players.filter(p => !p.folded && !p.sittingOut);
  let resultText = '';
  let resultClass = 'lose';

  // If engine already resolved (fold left only 1 player), use engine result
  if (engineResult.done && engineResult.winners && engineResult.winners.length > 0) {
    const winnerNames = engineResult.winners.map(w => w.player.name).join(', ');
    resultText = `${winnerNames} gewinnt $${engineResult.potWon}`;
    engineResult.winners.forEach(w => UI.highlightWinnerCards(w.player.id));
  } else if (active.length === 1) {
    // Shouldn't happen if engine works correctly, but safety fallback
    const winner = active[0];
    game._collectBets();
    winner.stack += game.pot;
    resultText = `${winner.name} gewinnt $${game.pot}`;
    UI.highlightWinnerCards(winner.id);
  } else if (window.Hand && active.length > 1) {
    // Multiple players remain — evaluate hands to show what would have happened
    game._collectBets();
    try {
      const handResults = active.filter(p => p.hand && p.hand.length >= 2).map(p => ({
        player: p,
        solved: window.Hand.solve([...p.hand, ...game.communityCards].map(c => c.rank + c.suit)),
      }));
      const winners = window.Hand.winners(handResults.map(h => h.solved));
      const winnerHands = handResults.filter(h => winners.includes(h.solved));
      const share = Math.floor(game.pot / winnerHands.length);
      winnerHands.forEach(w => { w.player.stack += share; });

      const winnerNames = winnerHands.map(w => w.player.name).join(', ');
      const handDescs = handResults.map(h => `${h.player.name}: ${h.solved.descr || h.solved.name}`).join(' | ');
      resultText = `${winnerNames} gewinnt $${game.pot} — ${handDescs}`;
      winnerHands.forEach(w => UI.highlightWinnerCards(w.player.id));
    } catch (e) {
      console.warn('Hand evaluation failed in fold handler:', e);
      const winner = active[0];
      winner.stack += game.pot;
      resultText = `${winner.name} gewinnt $${game.pot}`;
    }
  } else {
    // Fallback: split
    game._collectBets();
    const share = Math.floor(game.pot / active.length);
    active.forEach(p => { p.stack += share; });
    resultText = `Pot aufgeteilt: $${game.pot}`;
  }

  UI.renderAllSeats(game);
  UI.updateTopBar(game);
  UI.updatePot(0);
  clearHUD();

  // Coach: fold summary
  const foldSummary = getHandSummary(game, { winners: [], potWon: 0 });
  if (foldSummary) showCoachComment(foldSummary);

  // Run analysis on the fold
  const feedback = analyzeHand(game, game.handHistory, { winners: [], potWon: 0 });
  const streetReview = generateStreetReview(game, game.handHistory, { winners: [], potWon: 0 });
  showAnalysisFeedback(feedback, streetReview);

  // Psychology + stats
  const humanActions = game.handHistory.filter(h => h.player === game.humanSeat);
  const tiltFeedback = recordHand({ winners: [], potWon: 0 }, game, humanActions);
  if (tiltFeedback && tiltFeedback.level === 'critical') {
    showTiltWarning(tiltFeedback);
  }
  recordHandResult(game.handNumber, game.humanPlayer.stack);
  updateStatsPanel();

  // Save to hand history for leak finder
  saveHand(game, { winners: [], potWon: 0 }, feedback, streetSnapshots);

  // Opponent profiling
  processHandForProfiles(game);

  // Bankroll tracking
  updateSession(game.humanPlayer.stack);

  // Update personalized coaching profile
  updateUserProfile();

  await delay(400);
  UI.showContinueBar(true, resultText, resultClass);
  document.getElementById('btnDeal').textContent = 'Naechste Hand';
}

// === Phase Transition ===
async function handlePhaseTransition(result) {
  await delay(400);
  UI.renderCommunityCards(game.communityCards);
  updatePotDisplay();

  const phaseNames = {
    [PHASES.FLOP]: 'Flop',
    [PHASES.TURN]: 'Turn',
    [PHASES.RIVER]: 'River',
  };

  if (phaseNames[result.nextPhase]) {
    UI.showMessage(phaseNames[result.nextPhase], 600);
    streetSnapshots[result.nextPhase] = captureSnapshot(game);
    await delay(700);
  }

  // Update equity after new community cards
  requestEquity(game);
  updateFullHUD(game);

  // Coach: postflop comment
  const postflopCoach = getPostflopComment(game);
  if (postflopCoach) showCoachComment(postflopCoach);
}

// === Hand End ===
async function handleHandEnd(result) {
  gameInProgress = false;
  isPlayerTurn = false;
  actionLock = false;
  UI.showActionBar(false);

  const potWon = result.potWon || game.pot;

  if (result.showdown) {
    UI.renderCommunityCards(game.communityCards);
    UI.renderAllSeats(game);
    await delay(800);
  }

  // Build result text
  let resultText = '';
  let resultClass = '';

  if (result.winners && result.winners.length > 0) {
    const humanWon = result.winners.find(w => w.player.id === game.humanSeat);

    if (result.winners.length > 1 && result.winners.some(w => w.player.id === game.humanSeat)) {
      resultText = `Split Pot! Du bekommst $${humanWon.amount}`;
      resultClass = 'tie';
      UI.showMessage('Split Pot!', 1500);
    } else if (humanWon) {
      resultText = `Du gewinnst $${potWon}!`;
      resultClass = 'win';
      UI.highlightWinnerCards(game.humanSeat);
      UI.showMessage(`Gewonnen! +$${potWon}`, 1500);
    } else {
      const winnerNames = result.winners.map(w => w.player.name).join(', ');
      resultText = `${winnerNames} gewinnt $${potWon}`;
      resultClass = 'lose';
      result.winners.forEach(w => UI.highlightWinnerCards(w.player.id));
      UI.showMessage(`${winnerNames} gewinnt!`, 1500);
    }

    if (result.hands) {
      const handDescs = result.hands
        .map(h => `${game.players[h.playerId].name}: ${h.descr || h.name}`)
        .join(' | ');
      resultText += ` — ${handDescs}`;
    }
  }

  UI.renderAllSeats(game);
  UI.updateTopBar(game);
  UI.updatePot(0);
  clearHUD();

  // Coach: hand summary
  const summaryCoach = getHandSummary(game, result);
  if (summaryCoach) showCoachComment(summaryCoach);

  // Run post-hand analysis
  const feedback = analyzeHand(game, game.handHistory, result);
  const streetReview = generateStreetReview(game, game.handHistory, result);
  showAnalysisFeedback(feedback, streetReview);

  // Auto-open analysis panel if there are warnings or errors
  if (feedback.some(f => f.type === 'warning' || f.type === 'error') || (streetReview && streetReview.overallGrade === 'bad')) {
    const panel = document.getElementById('analysisPanel');
    if (!panel.classList.contains('visible')) {
      panel.classList.add('visible');
      showPanelBackdrop();
    }
  }

  // Psychology: record hand and check for tilt
  const humanActions = game.handHistory.filter(h => h.player === game.humanSeat);
  const tiltFeedback = recordHand(result, game, humanActions);
  if (tiltFeedback && tiltFeedback.level === 'critical') {
    showTiltWarning(tiltFeedback);
  }

  // Stats: record result and update panel
  recordHandResult(game.handNumber, game.humanPlayer.stack);
  updateStatsPanel();

  // Save to hand history for leak finder
  saveHand(game, result, feedback, streetSnapshots);

  // Opponent profiling — record all AI actions this hand
  processHandForProfiles(game, result.winners || []);

  // Bankroll tracking
  updateSession(game.humanPlayer.stack);
  const limitCheck = checkSessionLimits();
  if (limitCheck) showCoachComment({ type: 'warning', text: limitCheck.message });

  // Decision fatigue check
  checkFatigue();

  // Update personalized coaching profile with new data
  updateUserProfile();

  await delay(800);
  UI.showContinueBar(true, resultText, resultClass);
  document.getElementById('btnDeal').textContent = 'Naechste Hand';
}

// === Analysis Panel ===
function showAnalysisFeedback(feedback, streetReview) {
  const body = document.getElementById('analysisBody');
  if (!body) return;

  body.innerHTML = '';

  // Street-by-street review
  if (streetReview && streetReview.streets.length > 0) {
    const gradeColors = { good: 'var(--green)', ok: 'var(--gold)', bad: 'var(--accent)' };
    const gradeLabels = { good: 'GUT', ok: 'OK', bad: 'FEHLER' };

    // Overall grade header
    const overallColor = gradeColors[streetReview.overallGrade];
    const resultLabel = streetReview.humanWon ? `Gewonnen $${streetReview.potSize}` : streetReview.potSize ? `Verloren` : 'Gefoldet';
    body.innerHTML += `
      <div style="text-align:center; margin-bottom:8px; padding:6px; background:rgba(255,255,255,.02); border-radius:8px;">
        <div style="font-size:0.75em; font-weight:800; color:${overallColor};">${gradeLabels[streetReview.overallGrade]}</div>
        <div style="font-size:0.55em; color:var(--text2);">${resultLabel}</div>
      </div>`;

    for (const s of streetReview.streets) {
      const color = gradeColors[s.grade];
      const label = gradeLabels[s.grade];
      body.innerHTML += `
        <div style="padding:8px; margin-bottom:6px; border-radius:8px; background:rgba(255,255,255,.02); border-left:3px solid ${color};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:0.65em; font-weight:700; color:var(--text);">${s.street}</span>
            <span style="font-size:0.5em; font-weight:700; color:${color}; padding:1px 6px; background:rgba(255,255,255,.05); border-radius:4px;">${label}</span>
          </div>
          ${s.board ? `<div style="font-size:0.55em; color:var(--text2); margin-bottom:2px;">Board: ${s.board} — ${s.handName}</div>` : ''}
          <div style="font-size:0.55em; color:var(--text2); margin-bottom:2px;">${s.context}</div>
          <div style="font-size:0.6em; margin-bottom:4px;">
            <span style="color:var(--text2);">Du: </span>
            <span style="color:var(--text); font-weight:600;">${s.yourAction}</span>
          </div>
          <div style="font-size:0.55em; color:var(--green); padding:3px 6px; background:rgba(34,197,94,.04); border-radius:4px;">
            Optimal: ${s.optimal}
          </div>
        </div>`;
    }
  }

  // Standard feedback cards
  if (feedback && feedback.length > 0) {
    for (const item of feedback) {
      const card = document.createElement('div');
      card.className = `feedback-card ${item.type}`;
      card.innerHTML = `
        <div class="feedback-phase">${item.phase}</div>
        <div class="feedback-title">${item.title}</div>
        <div class="feedback-message">${item.message}</div>
        ${item.tip ? `<div class="feedback-tip">${item.tip}</div>` : ''}
      `;
      body.appendChild(card);
    }
  }

  if ((!feedback || feedback.length === 0) && (!streetReview || streetReview.streets.length === 0)) {
    body.innerHTML = `<div style="text-align:center; color: var(--text2); font-size: 0.75em; padding: 20px;">
      Keine besonderen Anmerkungen zu dieser Hand.
    </div>`;
  }
}

// Helper: toggle a panel, closing others first. Returns true if panel is now open.
function togglePanel(panelId, onOpen) {
  const panel = document.getElementById(panelId);
  const wasOpen = panel.classList.contains('visible');

  // Close ALL panels (including this one)
  closeAllPanels();

  // If it was closed, open it; if it was open, leave it closed
  if (!wasOpen) {
    panel.classList.add('visible');
    showPanelBackdrop();
    if (onOpen) onOpen();
  }
}

function toggleAnalysis() {
  togglePanel('analysisPanel');
}

function toggleStats() {
  togglePanel('statsPanel', updateStatsPanel);
}

function updateStatsPanel() {
  const sessionStats = getSessionStats();
  const pnl = getSessionPnL();
  const body = document.getElementById('statsBody');
  renderStatsOverlay(body, sessionStats, pnl);
}

function toggleLeaks() {
  togglePanel('leaksPanel', updateLeaksPanel);
}

function updateLeaksPanel() {
  const body = document.getElementById('leaksBody');
  if (body) renderLeakFinder(body);
}

function toggleBankroll() {
  togglePanel('bankrollPanel', updateBankrollPanel);
}

function updateBankrollPanel() {
  const body = document.getElementById('bankrollBody');
  if (body) renderBankrollPanel(body);
}

function toggleRanges() {
  togglePanel('rangesPanel', () => {
    const body = document.getElementById('rangesBody');
    if (body) renderRangeVisualizer(body);
  });
}

function toggleQuiz() {
  togglePanel('quizPanel', () => {
    const body = document.getElementById('quizBody');
    if (body) renderQuizPanel(body);
  });
}

// === Mobile Menu ===
function initMobileMenu() {
  const btn = document.getElementById('btnMobileMenu');
  const menu = document.getElementById('mobileMenu');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  const closeBtn = document.getElementById('btnCloseMobileMenu');

  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    menu.classList.add('visible');
    backdrop.classList.add('visible');
  });

  const closeMenu = () => {
    menu.classList.remove('visible');
    backdrop.classList.remove('visible');
  };

  closeBtn?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);

  // Menu item handlers
  const toggleMap = {
    hud: toggleHud,
    stats: toggleStats,
    leaks: toggleLeaks,
    bankroll: toggleBankroll,
    ranges: toggleRanges,
    quiz: toggleQuiz,
    analysis: toggleAnalysis,
    matrix: () => { toggleMatrix(); if (isMatrixVisible()) renderMatrix(game); },
    leaderboard: toggleLeaderboard,
  };

  menu.querySelectorAll('.mobile-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const toggle = item.dataset.toggle;
      if (toggleMap[toggle]) {
        closeMenu();
        // Small delay so menu animation finishes
        setTimeout(() => toggleMap[toggle](), 150);
      }
    });
  });
}

function toggleHud() {
  const hud = document.getElementById('hud');
  const btn = document.getElementById('btnToggleHud');
  const isVisible = hud.style.display !== 'none';
  hud.style.display = isVisible ? 'none' : 'flex';
  if (btn) btn.textContent = isVisible ? 'HUD: AUS' : 'HUD: AN';
}

// === Panel backdrop management (mobile) ===
function isMobile() {
  return window.innerWidth <= 768;
}

function showPanelBackdrop() {
  if (isMobile()) {
    document.getElementById('panelBackdrop')?.classList.add('visible');
  }
}

function hidePanelBackdrop() {
  document.getElementById('panelBackdrop')?.classList.remove('visible');
}

function closeAllPanels() {
  const panels = ['statsPanel', 'leaksPanel', 'bankrollPanel', 'rangesPanel', 'quizPanel', 'analysisPanel', 'leaderboardPanel'];
  panels.forEach(id => document.getElementById(id)?.classList.remove('visible'));
  hidePanelBackdrop();
}

function showTiltWarning(tiltFeedback) {
  const overlay = document.getElementById('tiltOverlay');
  const title = document.getElementById('tiltTitle');
  const message = document.getElementById('tiltMessage');
  const tips = document.getElementById('tiltTips');

  title.textContent = tiltFeedback.title || 'TILT-WARNUNG!';
  message.textContent = tiltFeedback.message || '';
  tips.innerHTML = '';
  if (tiltFeedback.tips) {
    tiltFeedback.tips.forEach(tip => {
      const li = document.createElement('li');
      li.textContent = tip;
      tips.appendChild(li);
    });
  }
  overlay.classList.add('visible');
}

// === Coach Bubble ===
// === GTO Frequency Display on Action Buttons ===
function updateGTOFrequencies() {
  const freq = getGTOFrequencies(game);
  const elFold = document.getElementById('freqFold');
  const elCheck = document.getElementById('freqCheck');
  const elCall = document.getElementById('freqCall');
  const elRaise = document.getElementById('freqRaise');
  if (!elFold) return;

  if (!freq) {
    elFold.textContent = '';
    elCheck.textContent = '';
    elCall.textContent = '';
    elRaise.textContent = '';
    return;
  }

  elFold.textContent = freq.fold > 0 ? `${freq.fold}%` : '';
  elCheck.textContent = freq.check > 0 ? `${freq.check}%` : '';
  elCall.textContent = freq.call > 0 ? `${freq.call}%` : '';
  elRaise.textContent = freq.raise > 0 ? `${freq.raise}%` : '';
}

// === GTO Score Popup (flashes after each decision) ===
function showScorePopup(scoreResult) {
  const formatted = formatScoreResult(scoreResult);
  if (!formatted) return;

  const popup = document.getElementById('scorePopup');
  if (!popup) return;

  popup.textContent = formatted.text;
  popup.className = 'score-popup ' + formatted.className;

  // Force reflow then add visible class to trigger animation
  popup.classList.remove('visible');
  void popup.offsetHeight;
  popup.classList.add('visible');
}

// === Update scoring items in HUD ===
function updateScoringHUD() {
  const data = getSessionScoring();

  const elScore = document.getElementById('hudGTOScore');
  const elLoss = document.getElementById('hudEVLoss');
  const elAccuracy = document.getElementById('hudAccuracy');
  if (!elScore) return;

  // Last decision score — show just classification + EV loss
  const last = data.decisions[data.decisions.length - 1];
  if (last) {
    const labels = { best: '✓ Best', correct: '~ OK', inaccuracy: '? Inacc.', mistake: '✗ Mistake', blunder: '!! Blunder' };
    const cls = { best: 'score-best', correct: 'score-correct', inaccuracy: 'score-inaccuracy', mistake: 'score-mistake', blunder: 'score-blunder' };
    const evText = last.evLossBB > 0 ? ` −${last.evLossBB.toFixed(1)}bb` : '';
    elScore.textContent = (labels[last.classification] || '--') + evText;
    elScore.className = 'hud-value ' + (cls[last.classification] || '');
  }

  // Total EV loss
  elLoss.textContent = data.totalEVLoss > 0 ? `−${data.totalEVLoss.toFixed(2)}bb` : '0.00bb';
  elLoss.className = 'hud-value' + (data.totalEVLoss > 2 ? ' negative' : data.totalEVLoss > 0 ? ' neutral' : '');

  // Accuracy
  elAccuracy.textContent = `${data.accuracy}%`;
  elAccuracy.className = 'hud-value' + (data.accuracy >= 90 ? ' score-best' : data.accuracy >= 70 ? ' score-correct' : ' score-mistake');
}

function showCoachComment(comment) {
  const bubble = document.getElementById('coachBubble');
  const text = document.getElementById('coachText');
  if (!bubble || !text || !comment) return;

  // Remove old type classes
  bubble.classList.remove('positive', 'negative', 'neutral', 'warning');
  bubble.classList.add(comment.type || 'neutral');
  text.textContent = comment.text;
  bubble.classList.add('visible');

  // Re-trigger animation
  bubble.style.animation = 'none';
  bubble.offsetHeight; // reflow
  bubble.style.animation = '';
}

// === Exploit Recommendations ===
function showExploitTips(game) {
  const activePlayers = game.players
    .map((p, i) => ({ seat: i, folded: p.folded }))
    .filter(p => p.seat !== game.humanSeat && !p.folded)
    .map(p => p.seat);

  const tips = getExploitTip(activePlayers, game.phase, game.pot + game.getCurrentBetsTotal());
  if (!tips || tips.length === 0) return;

  // Show top exploit tip in coach bubble (append to existing)
  const text = document.getElementById('coachText');
  if (text && tips[0]) {
    const existing = text.textContent;
    const exploitLine = `${tips[0].icon} EXPLOIT vs ${tips[0].name}: ${tips[0].tip}`;
    if (!existing.includes('EXPLOIT')) {
      text.textContent = existing + ' | ' + exploitLine;
    }
  }
}

// === Personalized Coaching (based on user's historical leaks) ===
function showPersonalizedCoaching(game) {
  const human = game.humanPlayer;
  const phase = game.phase;
  const position = game.getPosition(game.humanSeat);

  // Determine hand strength category (0=trash, 1=weak, 2=marginal, 3=strong, 4=premium)
  let handStrength = 0;
  try {
    const { getPreflopStrength } = window.__evaluatorCache || {};
    // Simple strength mapping from hand cards
    const h = human.hand;
    if (h.length >= 2) {
      const ranks = 'AKQJT98765432';
      const r1 = ranks.indexOf(h[0].rank), r2 = ranks.indexOf(h[1].rank);
      const isPair = h[0].rank === h[1].rank;
      const suited = h[0].suit === h[1].suit;
      if (isPair && r1 <= 2) handStrength = 4; // AA, KK, QQ
      else if (isPair || (r1 <= 3 && r2 <= 3)) handStrength = 3; // pairs, AK, AQ, etc
      else if (r1 <= 4 || r2 <= 4 || suited) handStrength = 2; // broadway, suited
      else if (r1 <= 7 || r2 <= 7) handStrength = 1; // medium
      else handStrength = 0; // weak
    }
  } catch (e) { /* ignore */ }

  // Check if there's a bet/raise we're facing
  const preflopActions = game.handHistory.filter(a => a.phase === phase);
  const facingBet = preflopActions.some(a =>
    a.player !== game.humanSeat && (a.action === 'raise' || a.action === 'bet' || a.action === 'allin')
  );

  // Were we the preflop aggressor?
  const isAggressor = game.handHistory.some(a =>
    a.player === game.humanSeat && a.phase === 'preflop' &&
    (a.action === 'raise' || a.action === 'bet')
  );

  const ctx = { phase, position, facingBet, isAggressor, handStrength };
  const tip = getPersonalizedTip(ctx);

  if (tip) {
    showCoachComment(tip);
  }
}

// === Fatigue Check (called after each hand) ===
function checkFatigue() {
  const warning = getFatigueWarning();
  if (!warning) return;

  if (warning.level === 'warning') {
    showCoachComment({
      type: 'warning',
      text: `FATIGUE: ${warning.message}`,
    });
  }
}

function hideCoachBubble() {
  const bubble = document.getElementById('coachBubble');
  if (bubble) bubble.classList.remove('visible');
}

// === Opponent Badges: add profiling info to seats ===
function updateOpponentBadges() {
  for (let i = 0; i < game.numPlayers; i++) {
    if (i === game.humanSeat) continue;
    const seatEl = document.getElementById(`seat${i}`);
    if (!seatEl) continue;

    // Remove old badge
    const oldBadge = seatEl.querySelector('.opponent-badge');
    if (oldBadge) oldBadge.remove();

    // Add new badge
    const badgeHTML = getOpponentBadgeHTML(i);
    if (badgeHTML) {
      const infoEl = seatEl.querySelector('.player-info');
      if (infoEl) infoEl.insertAdjacentHTML('beforeend', badgeHTML);
    }
  }
}

// === User Display (top bar badge) ===
function updateUserDisplay() {
  const badge = document.getElementById('userBadge');
  const nameEl = document.getElementById('userName');
  const logoutBtn = document.getElementById('btnLogout');
  if (!badge) return;

  if (isLoggedIn()) {
    nameEl.textContent = getDisplayName();
    logoutBtn.style.display = '';
    badge.style.display = 'flex';
  } else if (isGuestMode()) {
    nameEl.textContent = 'Gast';
    logoutBtn.style.display = 'none';
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// === Leaderboard Panel ===
function toggleLeaderboard() {
  togglePanel('leaderboardPanel', loadLeaderboard);
}

async function loadLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  if (!body) return;

  if (!isLoggedIn()) {
    body.innerHTML = '<div class="leaderboard-empty">Erstelle einen Account um dein Ranking zu sehen und dich mit Freunden zu vergleichen.</div>';
    return;
  }

  body.innerHTML = '<div class="leaderboard-empty">Lade Ranking...</div>';

  try {
    const entries = await cloudGetLeaderboard();
    if (entries.length === 0) {
      body.innerHTML = '<div class="leaderboard-empty">Noch keine Spieler im Ranking. Spiele mindestens 10 Haende!</div>';
      return;
    }

    let html = '<table class="leaderboard-table"><thead><tr><th>#</th><th>Spieler</th><th>P&L</th><th>Haende</th><th>Acc.</th></tr></thead><tbody>';

    for (const e of entries) {
      const pnlCls = e.totalPnl >= 0 ? 'leaderboard-pnl-pos' : 'leaderboard-pnl-neg';
      const rankCls = e.rank <= 3 ? ` leaderboard-rank-${e.rank}` : '';
      const meCls = e.isMe ? ' is-me' : '';

      html += `<tr class="${meCls}">
        <td class="leaderboard-rank${rankCls}">${e.rank}</td>
        <td>${e.username}${e.isMe ? ' (Du)' : ''}</td>
        <td class="${pnlCls}">${e.totalPnl >= 0 ? '+' : ''}$${e.totalPnl}</td>
        <td>${e.totalHands}</td>
        <td>${e.accuracy ? e.accuracy.toFixed(0) + '%' : '--'}</td>
      </tr>`;
    }

    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div class="leaderboard-empty">Fehler beim Laden des Rankings.</div>';
    console.warn('Leaderboard error:', e);
  }
}

// === Cloud Sync: push data after session ends ===
async function syncSessionToCloud(sessionRecord) {
  if (!isLoggedIn() || !sessionRecord) return;

  try {
    // Save session
    await cloudSaveSession(sessionRecord);

    // Update lifetime stats
    const lifetime = getLifetimeStats();
    const histStats = getAggregateStats();
    if (lifetime) {
      await cloudUpdateStats({
        totalHands: lifetime.totalHands,
        totalSessions: lifetime.sessions,
        totalPnl: lifetime.totalPnL,
        bankroll: getBankroll(),
        totalDeposited: lifetime.totalDeposited || 10000,
        vpip: histStats ? parseFloat(histStats.vpip) : 0,
        pfr: histStats ? parseFloat(histStats.pfr) : 0,
        accuracy: getSessionScoring().accuracy || 0,
        totalEvLoss: getSessionScoring().totalEVLoss || 0,
        bestSessionPnl: lifetime.bestSessionPnl || Math.max(...(getSessionHistory().map(s => s.pnl) || [0])),
        worstSessionPnl: lifetime.worstSessionPnl || Math.min(...(getSessionHistory().map(s => s.pnl) || [0])),
      });
    }
  } catch (e) {
    console.warn('Cloud sync failed:', e);
  }
}

// === Utility ===
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function updatePotDisplay() {
  UI.updatePot(game.pot, game.getCurrentBetsTotal());
}

// === Boot: Auth gate → then game init ===
document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(async (user) => {
    // Auth complete — user is logged in or guest
    if (user) {
      // Load cloud data to merge with local state
      try {
        const cloudData = await cloudLoadUserData();
        if (cloudData?.stats) {
          // Show cloud bankroll if it's different from local
          console.log('Cloud data loaded:', cloudData.stats.total_hands, 'hands');
        }
      } catch (e) {
        console.warn('Cloud data load failed:', e);
      }
    }

    // Show the game UI
    document.getElementById('app').style.visibility = 'visible';
    updateUserDisplay();
    init();
  });

  // Hide game until auth resolves (prevents flash)
  document.getElementById('app').style.visibility = 'hidden';
  initAuth();
});
