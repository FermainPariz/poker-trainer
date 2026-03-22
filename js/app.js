// === App: 6-Max Game Loop with HUD + Analysis + Psychology + Stats + Auth ===

import { Game, PHASES, ACTIONS } from './engine.js';
import { AIPlayer, AI_ASSIGNMENTS } from './ai.js';
import { analyzeHand, generateStreetReview } from './analyzer.js';
import { initHUD, requestEquity, updateFullHUD, clearHUD, onEquityUpdate, toggleHUD, getCurrentEquity } from './hud.js';
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
import { initAuth, onAuthReady, getCurrentUser, isGuestMode, isLoggedIn, getDisplayName, signOut, showLoginScreen } from './auth.js';
import { cloudSaveSession, cloudSaveHand, cloudUpdateStats, cloudLoadUserData, cloudGetLeaderboard } from './db.js';
import { initUserProfile, updateUserProfile, getPersonalizedTip, getTopLeaks } from './user-profile.js';
import { escapeHtml, safeNum } from './utils.js';
import { startTournament, onTournamentHandComplete, isTournament, isTournamentFinished, getTournamentInfo, renderTournamentHUD, postAntes, endTournament, getPayoutTable, getCurrentBlinds } from './tournament.js';
import { playCardDeal, playCardFlip, playChipBet, playChipPot, playCheck, playFold, playAllIn, playWinPot, playLosePot, playYourTurn, ensureResumed, setSoundEnabled, isSoundEnabled } from './sound.js';
import * as UI from './ui.js';

// === Game Modes ===
const MODES = { CASH_6: 'cash6', CASH_9: 'cash9', SNG_6: 'sng6', SNG_9: 'sng9' };
let currentMode = MODES.CASH_6;

// === State ===
let game = new Game({ numPlayers: 6, smallBlind: 5, bigBlind: 10, startingStack: 1000, humanSeat: 0 });
let aiPlayers = {}; // seatIndex -> AIPlayer
let streetSnapshots = {}; // captured at each phase transition

function createAIPlayers() {
  aiPlayers = {};
  for (let i = 0; i < game.numPlayers; i++) {
    if (i !== game.humanSeat) {
      const profileIdx = i > game.humanSeat ? i - 1 : i;
      aiPlayers[i] = new AIPlayer(AI_ASSIGNMENTS[profileIdx] || 'fish');
    }
  }
}
createAIPlayers();

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
  setupModeSelector();

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
    updateActionEVs();
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

  // Login (from guest mode — show auth screen)
  document.getElementById('btnLogin')?.addEventListener('click', () => {
    showLoginScreen();
  });

  // HUD toggle — handled by hud.js initHUD(), no duplicate listener here

  // Sound toggle
  document.getElementById('btnToggleSound')?.addEventListener('click', toggleSound);

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
  updateActionEVs();
}

// === Start New Hand ===
async function startNewHand() {
  ensureResumed(); // Unlock Web Audio on first user click

  // If tournament just ended, restart in same mode
  const isSNG = currentMode.startsWith('sng');
  if (isSNG && !isTournament()) {
    switchMode(currentMode); // re-creates game + starts tournament
    return; // let player click "Spiel starten" from the setup screen
  }

  if (isTournament()) {
    // Tournament: check if finished
    if (isTournamentFinished()) {
      showTournamentSummary();
      return;
    }
    // Tournament: eliminate busted players (no rebuy)
    for (const p of game.players) {
      if (p.stack <= 0 && !p.sittingOut) {
        p.sittingOut = true;
      }
    }
    // Check if human is busted
    if (game.humanPlayer.sittingOut) {
      showTournamentSummary();
      return;
    }
  } else {
    // Cash game: auto-rebuy busted players
    for (let i = 0; i < game.numPlayers; i++) {
      if (game.players[i].stack <= 0) {
        if (i === game.humanSeat && getCurrentSession()) {
          const record = endSession();
          syncSessionToCloud(record);
          startSession(game.bigBlind);
        }
        game.rebuyPlayer(i);
      }
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

  // Tournament: post antes
  if (isTournament()) {
    const anteTotal = postAntes(game);
    if (anteTotal > 0) updatePotDisplay();
    updateTournamentDisplay();
  }

  streetSnapshots.preflop = captureSnapshot(game);

  UI.renderAllSeats(game);
  UI.updateTopBar(game);
  updatePotDisplay();

  // Update matrix if visible
  if (isMatrixVisible()) renderMatrix(game);
  UI.showContinueBar(false);

  playCardDeal();
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
      playYourTurn();
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

  // Sound effects for AI actions
  if (decision.action === ACTIONS.FOLD) playFold();
  else if (decision.action === ACTIONS.CHECK) playCheck();
  else if (decision.action === ACTIONS.ALLIN) playAllIn();
  else if (decision.action === ACTIONS.CALL || decision.action === ACTIONS.RAISE || decision.action === ACTIONS.BET) playChipBet();

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

  // Sound effects for player actions
  if (action === ACTIONS.FOLD) playFold();
  else if (action === ACTIONS.CHECK) playCheck();
  else if (action === ACTIONS.ALLIN) playAllIn();
  else if (action === ACTIONS.CALL || action === ACTIONS.RAISE || action === ACTIONS.BET) playChipBet();

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
      resultText = `${winnerNames} gewinnt $${game.pot}`;
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

  // Tournament events after fold
  if (isTournament()) {
    const events = onTournamentHandComplete(game);
    if (events) {
      for (const ev of events) {
        if (ev.type === 'blinds_up') {
          UI.showMessage(`Blinds erhoehen: ${ev.sb}/${ev.bb}`, 2000);
        } else if (ev.type === 'human_eliminated' || ev.type === 'tournament_end') {
          await delay(400);
          showTournamentSummary();
          return;
        }
      }
    }
    updateTournamentDisplay();
  }

  await delay(400);
  UI.showContinueBar(true, resultText, resultClass);
  document.getElementById('btnDeal').textContent = 'Naechste Hand';
}

// === Phase Transition ===
async function handlePhaseTransition(result) {
  // Skip redundant rendering if this is a showdown transition (handleHandEnd will handle it)
  if (result.nextPhase === PHASES.SHOWDOWN) return;

  await delay(400);
  playCardFlip();
  playChipPot();
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
    // Show community cards first
    UI.renderCommunityCards(game.communityCards);
    await delay(600);

    // Reveal all hands at showdown — single render to preserve card-reveal animation
    UI.renderAllSeats(game);
    await delay(2000); // Give player time to see all hands
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
      playWinPot();
      UI.highlightWinnerCards(game.humanSeat);
      UI.showMessage(`Gewonnen! +$${potWon}`, 1500);
    } else {
      const winnerNames = result.winners.map(w => w.player.name).join(', ');
      resultText = `${winnerNames} gewinnt $${potWon}`;
      resultClass = 'lose';
      playLosePot();
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

  // Don't re-render seats if showdown already rendered them
  if (!result.showdown) UI.renderAllSeats(game);
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

  // Analysis panel available via "Analyse" button — not auto-opened

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

  // Tournament: check for eliminations, blind increases
  if (isTournament()) {
    const events = onTournamentHandComplete(game);
    if (events) {
      for (const ev of events) {
        if (ev.type === 'elimination') {
          resultText += ` | ${ev.player.name} eliminated (#${ev.position})`;
        } else if (ev.type === 'blinds_up') {
          UI.showMessage(`Blinds erhoehen: ${ev.sb}/${ev.bb}`, 2000);
        } else if (ev.type === 'human_eliminated' || ev.type === 'tournament_end') {
          await delay(800);
          showTournamentSummary();
          return;
        }
      }
    }
    updateTournamentDisplay();
  }

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
            <span style="font-size:0.65em; font-weight:700; color:var(--text);">${escapeHtml(s.street)}</span>
            <span style="font-size:0.5em; font-weight:700; color:${color}; padding:1px 6px; background:rgba(255,255,255,.05); border-radius:4px;">${escapeHtml(label)}</span>
          </div>
          ${s.board ? `<div style="font-size:0.55em; color:var(--text2); margin-bottom:2px;">Board: ${escapeHtml(s.board)} — ${escapeHtml(s.handName)}</div>` : ''}
          <div style="font-size:0.55em; color:var(--text2); margin-bottom:2px;">${escapeHtml(s.context)}</div>
          <div style="font-size:0.6em; margin-bottom:4px;">
            <span style="color:var(--text2);">Du: </span>
            <span style="color:var(--text); font-weight:600;">${escapeHtml(s.yourAction)}</span>
          </div>
          <div style="font-size:0.55em; color:var(--green); padding:3px 6px; background:rgba(34,197,94,.04); border-radius:4px;">
            Optimal: ${escapeHtml(s.optimal)}
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
        <div class="feedback-phase">${escapeHtml(item.phase)}</div>
        <div class="feedback-title">${escapeHtml(item.title)}</div>
        <div class="feedback-message">${escapeHtml(item.message)}</div>
        ${item.tip ? `<div class="feedback-tip">${escapeHtml(item.tip)}</div>` : ''}
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
    sound: toggleSound,
    hud: toggleHUD,
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

// toggleHud removed — hud.js toggleHUD() is the single source of truth

function toggleSound() {
  const on = !isSoundEnabled();
  setSoundEnabled(on);
  const btn = document.getElementById('btnToggleSound');
  if (btn) btn.textContent = on ? 'Sound: AN' : 'Sound: AUS';
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
// === GTO Frequency + EV Display on Action Buttons ===
function updateGTOFrequencies() {
  const freq = getGTOFrequencies(game);
  const elFold = document.getElementById('freqFold');
  const elCheck = document.getElementById('freqCheck');
  const elCall = document.getElementById('freqCall');
  const elRaise = document.getElementById('freqRaise');
  const evFold = document.getElementById('evFold');
  const evCheck = document.getElementById('evCheck');
  const evCall = document.getElementById('evCall');
  const evRaise = document.getElementById('evRaise');
  if (!elFold) return;

  if (!freq) {
    elFold.textContent = '';
    elCheck.textContent = '';
    elCall.textContent = '';
    elRaise.textContent = '';
    if (evFold) { evFold.textContent = ''; evCheck.textContent = ''; evCall.textContent = ''; evRaise.textContent = ''; }
    return;
  }

  elFold.textContent = freq.fold > 0 ? `${freq.fold}%` : '';
  elCheck.textContent = freq.check > 0 ? `${freq.check}%` : '';
  elCall.textContent = freq.call > 0 ? `${freq.call}%` : '';
  elRaise.textContent = freq.raise > 0 ? `${freq.raise}%` : '';

  // Compute and display EV for each action
  if (evFold) updateActionEVs();
}

function estimateFoldEquity(game) {
  // Dynamic fold equity based on game state
  const phase = game.phase;
  const players = game.players;
  const hero = players[game.currentPlayerIndex];

  // Count players who voluntarily put money in (not just blinds)
  const bbAmt = game.bb || 10;
  const activeInvested = players.filter(p =>
    !p.folded && !p.sittingOut && p !== hero && p.bet > 0
  );
  const raisers = activeInvested.filter(p => p.bet > bbAmt);
  const callers = activeInvested.filter(p => p.bet === Math.max(...activeInvested.map(x => x.bet)) && p.bet > bbAmt);
  const numInvested = activeInvested.length;
  const hasRaiser = raisers.length > 0;
  const numCallers = Math.max(0, numInvested - (hasRaiser ? 1 : 0));

  if (phase === 'preflop') {
    if (!hasRaiser) {
      // Open raise vs blinds only
      return Math.max(0.05, 0.50 - numInvested * 0.05);
    } else if (numCallers === 0) {
      // 3-bet vs single raiser
      return 0.55; // 3-bets get a lot of folds
    } else {
      // 3-bet vs raiser + caller(s): very low fold equity
      return Math.max(0.03, 0.15 - (numCallers - 1) * 0.05);
    }
  } else {
    // Postflop: fold equity depends on number of opponents
    if (numInvested <= 1) return 0.40;
    if (numInvested === 2) return 0.25;
    return Math.max(0.05, 0.20 - (numInvested - 2) * 0.05);
  }
}

function updateActionEVs() {
  const equity = getCurrentEquity();
  const evFold = document.getElementById('evFold');
  const evCheck = document.getElementById('evCheck');
  const evCall = document.getElementById('evCall');
  const evRaise = document.getElementById('evRaise');
  if (!evFold) return;

  // Clear all first
  evFold.textContent = ''; evFold.className = 'ev-label';
  evCheck.textContent = ''; evCheck.className = 'ev-label';
  evCall.textContent = ''; evCall.className = 'ev-label';
  evRaise.textContent = ''; evRaise.className = 'ev-label';

  if (equity === null || !game) return;

  const pot = game.pot + game.getCurrentBetsTotal();
  const toCall = game.getCallAmount();
  const eqPct = equity / 100;
  const foldEq = estimateFoldEquity(game);

  // Count opponents still in hand (for multiway equity adjustment)
  const hero = game.players[game.currentPlayerIndex];
  const oppsInHand = game.players.filter(p => !p.folded && !p.sittingOut && p !== hero).length;

  // Fold EV: always 0 (you lose nothing more)
  setEV(evFold, 0);

  if (toCall > 0) {
    // Facing a bet: Call EV = equity * (pot + call) - call
    const callEV = eqPct * (pot + toCall) - toCall;
    setEV(evCall, callEV);

    // Raise EV: fold equity * pot + (1 - fold equity) * (equity when called * new pot - raise cost)
    const raiseAmt = parseInt(document.getElementById('raiseSlider')?.value) || game.getMinRaise();
    // When called, the new pot = current pot + our raise + opponent's call
    const calledPot = pot + raiseAmt + raiseAmt;
    // Against calling range, our equity is worse (they only call with strong hands)
    // Discount equity by ~20-30% vs calling range
    const eqVsCalling = eqPct * (oppsInHand > 1 ? 0.65 : 0.75);
    const raiseEV = foldEq * pot + (1 - foldEq) * (eqVsCalling * calledPot - raiseAmt);
    setEV(evRaise, raiseEV);
  } else {
    // No bet facing: Check EV = 0 (keep current equity), Bet EV estimated
    setEV(evCheck, 0);

    const betAmt = parseInt(document.getElementById('raiseSlider')?.value) || Math.round(pot * 0.66);
    const calledPot = pot + betAmt * 2;
    const eqVsCalling = eqPct * (oppsInHand > 1 ? 0.65 : 0.75);
    const betEV = foldEq * pot + (1 - foldEq) * (eqVsCalling * calledPot - betAmt);
    setEV(evRaise, betEV);
  }
}

function setEV(el, ev) {
  if (!el) return;
  const rounded = Math.round(ev);
  const sign = rounded >= 0 ? '+' : '';
  el.textContent = `EV ${sign}$${rounded}`;
  el.className = 'ev-label ' + (rounded > 0 ? 'ev-pos' : rounded < 0 ? 'ev-neg' : 'ev-zero');
}

// === GTO Score Popup (flashes after each decision) ===
function showScorePopup(scoreResult) {
  // Score popup disabled — results shown in HUD only
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
    const labels = { best: '✓ Best', correct: '✓ OK', inaccuracy: '△ Inacc.', mistake: '✗ Mistake', blunder: '✗✗ Blunder' };
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
  const loginBtn = document.getElementById('btnLogin');
  if (!badge) return;

  if (isLoggedIn()) {
    nameEl.textContent = getDisplayName();
    logoutBtn.style.display = '';
    if (loginBtn) loginBtn.style.display = 'none';
    badge.style.display = 'flex';
  } else if (isGuestMode()) {
    nameEl.textContent = 'Gast';
    logoutBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = '';
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
        <td class="leaderboard-rank${rankCls}">${safeNum(e.rank)}</td>
        <td>${escapeHtml(e.username)}${e.isMe ? ' (Du)' : ''}</td>
        <td class="${pnlCls}">${safeNum(e.totalPnl) >= 0 ? '+' : ''}$${safeNum(e.totalPnl)}</td>
        <td>${safeNum(e.totalHands)}</td>
        <td>${e.accuracy ? safeNum(e.accuracy).toFixed(0) + '%' : '--'}</td>
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

// === Game Mode Selector ===
function setupModeSelector() {
  const container = document.getElementById('modeSelector');
  if (!container) return;

  container.innerHTML = `
    <button class="mode-btn active" data-mode="cash6">Cash<span class="mode-sub">6-Max</span></button>
    <button class="mode-btn" data-mode="cash9">Cash<span class="mode-sub">9-Max</span></button>
    <button class="mode-btn" data-mode="sng6">SNG<span class="mode-sub">6-Max</span></button>
    <button class="mode-btn" data-mode="sng9">SNG<span class="mode-sub">9-Max</span></button>
  `;

  container.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (gameInProgress) return; // can't switch mid-hand
      container.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchMode(btn.dataset.mode);
    });
  });
}

function switchMode(mode) {
  currentMode = mode;
  const isSNG = mode.startsWith('sng');
  const is9Max = mode.endsWith('9');
  const numPlayers = is9Max ? 9 : 6;

  // End any existing tournament
  if (isTournament()) endTournament();

  // Recreate game with new player count
  game = new Game({
    numPlayers,
    smallBlind: isSNG ? 10 : 5,
    bigBlind: isSNG ? 20 : 10,
    startingStack: isSNG ? 1500 : 1000,
    humanSeat: 0,
  });
  createAIPlayers();

  // Toggle 9-max CSS class on table
  const table = document.querySelector('.poker-table');
  if (table) table.classList.toggle('table-9max', is9Max);

  // Hide unused seats
  for (let i = 0; i < 9; i++) {
    const seat = document.getElementById(`seat${i}`);
    if (seat) seat.style.display = i < numPlayers ? '' : 'none';
  }

  // Start tournament if SNG
  if (isSNG) {
    startTournament({ numPlayers, speed: 'normal', buyIn: 1500 });
    updateTournamentDisplay();
  }

  // Re-init subsystems
  resetScoring();
  initBankroll();
  startSession(game.bigBlind);
  initSession(game.startingStack);

  // Clear community cards from previous game
  const cc = document.getElementById('communityCards');
  if (cc) cc.innerHTML = '';

  // Re-render
  UI.renderAllSeats(game);
  UI.updateTopBar(game);
  UI.updateBlindsInfo(game.smallBlind, game.bigBlind);

  const modeLabel = isSNG
    ? `SNG ${numPlayers}-Max — $${game.startingStack} Buy-in`
    : `Cash ${numPlayers}-Max — $${game.smallBlind}/$${game.bigBlind}`;
  UI.showContinueBar(true, `${modeLabel} — Druecke Start!`, '');
  document.getElementById('btnDeal').textContent = 'Spiel starten';

  // Toggle tournament HUD
  const tourneyHUD = document.getElementById('tournamentHUD');
  if (tourneyHUD) tourneyHUD.style.display = isSNG ? '' : 'none';
}

function updateTournamentDisplay() {
  const container = document.getElementById('tournamentHUD');
  if (container && isTournament()) {
    renderTournamentHUD(container);
    // Also update blind info in top bar
    const info = getTournamentInfo();
    if (info) UI.updateBlindsInfo(info.sb, info.bb);
  }
}

function showTournamentSummary() {
  gameInProgress = false;
  isPlayerTurn = false;

  const info = getTournamentInfo();
  if (!info) return;

  const pos = info.humanFinishPosition || (info.playersRemaining <= 1 ? 1 : info.totalPlayers);
  const payouts = getPayoutTable();
  const myPayout = payouts.find(p => p.position === pos);
  const payout = myPayout ? myPayout.amount : 0;
  const profit = payout - 1500; // buy-in
  const profitColor = profit >= 0 ? 'var(--green)' : 'var(--accent)';
  const duration = Math.round(info.duration / 60000);

  let payoutHTML = payouts.map(p =>
    `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:0.65em; color:${p.position === pos ? 'var(--gold)' : 'var(--text2)'}; font-weight:${p.position === pos ? '700' : '400'};">
      <span>#${p.position} (${p.percentage}%)</span><span>$${p.amount}</span>
    </div>`
  ).join('');

  const body = document.getElementById('analysisBody');
  if (body) {
    body.innerHTML = `
      <div style="text-align:center; padding:12px;">
        <div style="font-size:1em; font-weight:800; color:var(--gold); margin-bottom:4px;">TURNIER BEENDET</div>
        <div style="font-size:1.4em; font-weight:800; color:${pos <= 2 ? 'var(--green)' : 'var(--text)'};">Platz #${pos}</div>
        <div style="font-size:0.8em; color:${profitColor}; font-weight:700; margin:8px 0;">${profit >= 0 ? '+' : ''}$${profit} Profit</div>
        <div style="font-size:0.6em; color:var(--text2);">${info.totalHandsPlayed} Haende | ${duration} Min</div>
      </div>
      <div style="padding:8px; margin:8px 0; background:rgba(255,255,255,.03); border-radius:8px;">
        <div style="font-size:0.6em; font-weight:700; color:var(--text); margin-bottom:4px;">Auszahlung:</div>
        ${payoutHTML}
      </div>
    `;
    const panel = document.getElementById('analysisPanel');
    if (panel && !panel.classList.contains('visible')) {
      panel.classList.add('visible');
      showPanelBackdrop();
    }
  }

  UI.showContinueBar(true, `Turnier beendet — Platz #${pos} | ${payout > 0 ? '+' : ''}$${profit}`, pos <= 2 ? 'win' : 'lose');
  document.getElementById('btnDeal').textContent = 'Neues Turnier';

  // End tournament state — next "start" will re-create
  endTournament();
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
