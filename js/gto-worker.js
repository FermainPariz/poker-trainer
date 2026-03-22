// === GTO Solver Web Worker ===
// Runs the WASM postflop solver in a background thread.
// Communicates via postMessage with the main thread.

// Import the WASM solver (--target web build)
import init, { GameManager } from '../wasm/solver/solver.js';

let solverReady = false;
let game = null;

// Initialize WASM
async function initSolver() {
  try {
    await init();
    solverReady = true;
    self.postMessage({ type: 'ready' });
  } catch (e) {
    self.postMessage({ type: 'error', error: `WASM init failed: ${e.message}` });
  }
}

// === Solve a postflop spot ===
// params: { oopRange, ipRange, board, startingPot, effectiveStack, betSizes, maxIterations, targetExploitability }
function solveSpot(params) {
  if (!solverReady) {
    self.postMessage({ type: 'error', error: 'Solver not ready', id: params.id });
    return;
  }

  try {
    game = GameManager.new();

    const {
      oopRange,    // Float32Array[1326]
      ipRange,     // Float32Array[1326]
      board,       // Uint8Array[3-5]
      startingPot, // number (in chips)
      effectiveStack, // number (in chips)
      maxIterations = 200,
      targetExploitability = null, // null = auto (0.5% of pot)
      id,
    } = params;

    // Bet sizing config — minimal for browser memory constraints
    // No raise sizes to keep tree small enough for browser (<500MB)
    const betSizes = params.betSizes || {};
    const oopFlopBet    = betSizes.oopFlopBet    || '33%';
    const oopFlopRaise  = '';
    const oopTurnBet    = betSizes.oopTurnBet    || '67%';
    const oopTurnRaise  = '';
    const oopTurnDonk   = '';
    const oopRiverBet   = betSizes.oopRiverBet   || '75%';
    const oopRiverRaise = '';
    const oopRiverDonk  = '';
    const ipFlopBet     = betSizes.ipFlopBet     || '33%';
    const ipFlopRaise   = '';
    const ipTurnBet     = betSizes.ipTurnBet     || '67%';
    const ipTurnRaise   = '';
    const ipRiverBet    = betSizes.ipRiverBet    || '75%';
    const ipRiverRaise  = '';

    // Initialize the game tree
    const error = game.init(
      oopRange, ipRange, board,
      startingPot, effectiveStack,
      0.0, 0.0,     // rake_rate, rake_cap (no rake for training)
      false,         // donk_option
      oopFlopBet, oopFlopRaise,
      oopTurnBet, oopTurnRaise, oopTurnDonk,
      oopRiverBet, oopRiverRaise, oopRiverDonk,
      ipFlopBet, ipFlopRaise,
      ipTurnBet, ipTurnRaise,
      ipRiverBet, ipRiverRaise,
      1.5,   // add_allin_threshold
      0.15,  // force_allin_threshold
      0.1,   // merging_threshold
      '',    // added_lines
      ''     // removed_lines
    );

    if (error) {
      self.postMessage({ type: 'error', error: `Solver init: ${error}`, id });
      game.free();
      game = null;
      return;
    }

    // Check memory usage — cap at 800MB for browser safety
    const memUsage = game.memory_usage(false);
    const memMB = Number(memUsage / BigInt(1024 * 1024));
    if (memMB > 800) {
      self.postMessage({ type: 'error', error: `Tree zu gross (${memMB}MB). Spot wird mit Heuristik bewertet.`, id });
      game.free();
      game = null;
      return;
    }

    // Allocate memory
    game.allocate_memory(false);

    // Solve with CFR iterations
    const target = targetExploitability || (startingPot * 0.005); // 0.5% of pot
    let exploitability = game.exploitability();
    let iterations = 0;

    self.postMessage({ type: 'progress', iterations: 0, exploitability, id });

    for (let i = 0; i < maxIterations; i++) {
      game.solve_step(i);
      iterations = i + 1;

      // Check exploitability every 10 iterations
      if (iterations % 10 === 0) {
        exploitability = game.exploitability();
        self.postMessage({ type: 'progress', iterations, exploitability, id });

        if (exploitability <= target) break;
      }
    }

    // Finalize (convert cumulative regrets to strategy)
    game.finalize();

    // Extract results
    const result = extractResults(game, id);
    result.iterations = iterations;
    result.exploitability = exploitability;

    self.postMessage({ type: 'solved', result, id });

  } catch (e) {
    self.postMessage({ type: 'error', error: `Solve failed: ${e.message}`, id });
  } finally {
    if (game) {
      game.free();
      game = null;
    }
  }
}

// === Extract strategy and EV from solved game ===
function extractResults(game, id) {
  // Get root node actions
  const actionsStr = game.actions_after(new Uint32Array([]));
  if (actionsStr === 'terminal' || actionsStr === 'chance') {
    return { actions: [], strategy: {}, ev: {} };
  }

  const actions = actionsStr.split('/').map(a => {
    const [name, amount] = a.split(':');
    return { name, amount: parseInt(amount) };
  });

  const numActions = game.num_actions();
  const currentPlayer = game.current_player(); // "oop" or "ip"
  const playerIdx = currentPlayer === 'oop' ? 0 : 1;

  // Get private cards for current player
  const privateCardsRaw = game.private_cards(playerIdx);
  const numHands = privateCardsRaw.length;

  // Get results blob
  const results = game.get_results();

  // Parse results layout:
  // [0] = OOP pot contribution
  // [1] = IP pot contribution
  // [2] = isEmpty flag
  // Then per player: weights[numHands], normalized_weights[numHands], equity[numHands], ev[numHands], eqr[numHands]
  // Then: strategy[numActions * numHands], ev_detail[numActions * numHands]

  const oopHands = game.private_cards(0).length;
  const ipHands = game.private_cards(1).length;
  const isEmptyFlag = results[2];

  if (isEmptyFlag > 0) {
    return { actions: actions.map(a => a.name), strategy: {}, ev: {}, currentPlayer };
  }

  // Skip header: 3 values + weights + normalized_weights + equity + ev + eqr for both players
  const headerSize = 3 + (oopHands + ipHands) * 5;
  const strategyStart = headerSize;
  const evDetailStart = strategyStart + numActions * numHands;

  // Build strategy and EV per hand combo
  const strategy = {};
  const evDetail = {};

  for (let h = 0; h < numHands; h++) {
    const packed = privateCardsRaw[h];
    const c1 = packed & 0xFF;
    const c2 = (packed >> 8) & 0xFF;
    const comboKey = `${Math.min(c1, c2)}_${Math.max(c1, c2)}`;

    const handStrategy = {};
    const handEV = {};

    for (let a = 0; a < numActions; a++) {
      const freq = results[strategyStart + a * numHands + h];
      const ev = results[evDetailStart + a * numHands + h];
      handStrategy[actions[a].name] = Math.round(freq * 10000) / 10000; // 4 decimal places
      handEV[actions[a].name] = Math.round(ev * 100) / 100;
    }

    strategy[comboKey] = handStrategy;
    evDetail[comboKey] = handEV;
  }

  // Also extract overall (range-averaged) strategy
  const overallStrategy = {};
  // Get weights for averaging
  const weightsStart = 3 + (currentPlayer === 'oop' ? 0 : oopHands);
  const normWeightsStart = 3 + oopHands + ipHands + (currentPlayer === 'oop' ? 0 : oopHands);

  let totalWeight = 0;
  for (let h = 0; h < numHands; h++) {
    totalWeight += results[normWeightsStart + h];
  }

  for (let a = 0; a < numActions; a++) {
    let weightedFreq = 0;
    for (let h = 0; h < numHands; h++) {
      const w = results[normWeightsStart + h];
      const freq = results[strategyStart + a * numHands + h];
      weightedFreq += w * freq;
    }
    overallStrategy[actions[a].name] = totalWeight > 0
      ? Math.round(weightedFreq / totalWeight * 1000) / 10 // percentage
      : 0;
  }

  // === Also extract IP strategy (navigate to each OOP child node) ===
  // At the root, OOP acts. After each OOP action, it's IP's turn.
  // This lets us return strategy for BOTH players.
  const ipStrategies = {}; // keyed by OOP action name: { "Check": { combo_strategy }, "Bet": { ... } }
  if (currentPlayer === 'oop') {
    for (let a = 0; a < numActions; a++) {
      try {
        // Navigate to this child node (after OOP takes action a)
        game.apply_history(new Uint32Array([a]));
        const childActionsStr = game.actions_after(new Uint32Array([a]));
        if (childActionsStr === 'terminal' || childActionsStr === 'chance') {
          game.apply_history(new Uint32Array([])); // back to root
          continue;
        }
        const childActions = childActionsStr.split('/').map(x => {
          const [n, amt] = x.split(':');
          return { name: n, amount: parseInt(amt) };
        });
        const ipNumActions = childActions.length;
        const ipPlayer = game.current_player(); // should be "ip"
        if (ipPlayer !== 'ip') {
          game.apply_history(new Uint32Array([]));
          continue;
        }
        const ipPrivateCards = game.private_cards(1);
        const ipNumHands = ipPrivateCards.length;
        const ipResults = game.get_results();
        const ipEmpty = ipResults[2];
        if (ipEmpty > 0) {
          game.apply_history(new Uint32Array([]));
          continue;
        }
        const ipOopHands = game.private_cards(0).length;
        const ipIpHands = ipNumHands;
        const ipHeaderSize = 3 + (ipOopHands + ipIpHands) * 5;
        const ipStratStart = ipHeaderSize;

        const childStrategy = {};
        for (let h = 0; h < ipNumHands; h++) {
          const packed = ipPrivateCards[h];
          const c1 = packed & 0xFF;
          const c2 = (packed >> 8) & 0xFF;
          const key = `${Math.min(c1, c2)}_${Math.max(c1, c2)}`;
          const hs = {};
          for (let ca = 0; ca < ipNumActions; ca++) {
            const freq = ipResults[ipStratStart + ca * ipNumHands + h];
            hs[childActions[ca].name] = Math.round(freq * 10000) / 10000;
          }
          childStrategy[key] = hs;
        }
        ipStrategies[actions[a].name] = {
          actions: childActions.map(x => x.name),
          strategy: childStrategy,
        };
        // Navigate back to root
        game.apply_history(new Uint32Array([]));
      } catch (e) {
        // Navigation failed — skip this child
        try { game.apply_history(new Uint32Array([])); } catch (_) {}
      }
    }
  }

  return {
    actions: actions.map(a => a.name),
    actionAmounts: actions.reduce((o, a) => { o[a.name] = a.amount; return o; }, {}),
    strategy,      // per-combo OOP strategy: { "0_4": { "Check": 0.65, "Bet": 0.35 } }
    evDetail,      // per-combo EV: { "0_4": { "Check": 12.5, "Bet": 14.2 } }
    overallStrategy, // range-averaged OOP: { "Check": 55.3, "Bet": 44.7 }
    ipStrategies,  // IP strategy after each OOP action: { "Check": { strategy: {...} }, "Bet": { ... } }
    currentPlayer,
    numHands,
  };
}

// === Message handler ===
self.onmessage = function(e) {
  const { type, params } = e.data;

  switch (type) {
    case 'solve':
      solveSpot(params);
      break;

    case 'cancel':
      // Not easily cancellable mid-solve, but we can clean up
      if (game) {
        game.free();
        game = null;
      }
      break;

    default:
      self.postMessage({ type: 'error', error: `Unknown message type: ${type}` });
  }
};

// Auto-initialize on load
initSolver();
