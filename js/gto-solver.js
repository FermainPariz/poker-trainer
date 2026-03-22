// === GTO Solver API ===
// Main-thread interface to the WASM postflop solver running in a Web Worker.
// Manages solve requests, caching (IndexedDB), and provides simple query API.

import {
  parseRange, engineCardToSolverId, engineBoardToSolverBoard,
  comboIndex, removeDeadCards, POSITION_RANGES, getRangesForSpot,
} from './gto-ranges.js';

// === State ===
let worker = null;
let workerReady = false;
let solverAvailable = false;
let currentSolveId = 0;
const pendingSolves = new Map(); // id → { resolve, reject }
const solveCache = new Map();    // cacheKey → result
let statusCallback = null;       // for UI updates
let lastSolveResult = null;

const MAX_CACHE_SIZE = 50;
const DB_NAME = 'poker-gto-cache';
const DB_STORE = 'solutions';

// === Public API ===

export function isSolverAvailable() {
  return solverAvailable;
}

export function isSolverReady() {
  return workerReady;
}

export function getLastSolveResult() {
  return lastSolveResult;
}

export function onSolverStatus(callback) {
  statusCallback = callback;
}

function emitStatus(status) {
  if (statusCallback) statusCallback(status);
}

// === Initialize solver ===
export function initGTOSolver() {
  try {
    // Web Workers with ES modules need type: 'module'
    worker = new Worker('./js/gto-worker.js', { type: 'module' });

    worker.onmessage = handleWorkerMessage;
    worker.onerror = (e) => {
      console.warn('GTO Worker error:', e.message);
      solverAvailable = false;
      emitStatus({ state: 'error', message: 'Solver nicht verfuegbar' });
    };

    emitStatus({ state: 'loading', message: 'GTO Solver wird geladen...' });
    solverAvailable = true; // optimistic — will set false on error
  } catch (e) {
    console.warn('GTO Solver not available:', e);
    solverAvailable = false;
    emitStatus({ state: 'unavailable', message: 'WASM nicht unterstuetzt' });
  }
}

// === Handle worker messages ===
function handleWorkerMessage(e) {
  const { type, id, result, error, iterations, exploitability } = e.data;

  switch (type) {
    case 'ready':
      workerReady = true;
      emitStatus({ state: 'ready', message: 'GTO Solver bereit' });
      break;

    case 'progress':
      emitStatus({
        state: 'solving',
        message: `Solving... (${iterations} iter, expl: ${exploitability?.toFixed(1)})`,
        iterations,
        exploitability,
      });
      break;

    case 'solved': {
      const pending = pendingSolves.get(id);
      if (pending) {
        pendingSolves.delete(id);
        lastSolveResult = result;
        pending.resolve(result);
      }
      emitStatus({
        state: 'solved',
        message: `GTO geloest (${result.iterations} iter)`,
        result,
      });
      break;
    }

    case 'error': {
      const pending2 = pendingSolves.get(id);
      if (pending2) {
        pendingSolves.delete(id);
        pending2.reject(new Error(error));
      }
      console.warn('Solver error:', error);
      emitStatus({ state: 'error', message: error });
      break;
    }
  }
}

// === Generate cache key for a spot ===
function makeCacheKey(board, startingPot, effectiveStack, oopRangeKey, ipRangeKey) {
  const boardStr = Array.from(board).join(',');
  return `${boardStr}|${startingPot}|${effectiveStack}|${oopRangeKey}|${ipRangeKey}`;
}

// === Solve a postflop spot ===
// Returns Promise<result> with GTO strategy for the given spot.
export function solvePostflop({
  board,           // array of engine card objects (3-5 cards)
  heroCards,       // [card1, card2] engine card objects
  heroPosition,    // 'UTG'|'HJ'|'CO'|'BTN'|'SB'|'BB'
  villainPosition, // same
  startingPot,     // pot size in chips at start of street
  effectiveStack,  // remaining stack in chips
  maxIterations = 200,
  betSizes = null,
}) {
  return new Promise((resolve, reject) => {
    if (!solverAvailable || !workerReady) {
      reject(new Error('Solver not available'));
      return;
    }

    // Convert board to solver format
    const solverBoard = engineBoardToSolverBoard(board);

    // Get ranges based on positions
    const { oopRange, ipRange, heroIsIP } = getRangesForSpot(heroPosition, villainPosition);

    // Remove dead cards (board + hero cards)
    const deadCards = [
      ...Array.from(solverBoard),
      engineCardToSolverId(heroCards[0]),
      engineCardToSolverId(heroCards[1]),
    ];
    const cleanOOP = removeDeadCards(oopRange, Array.from(solverBoard));
    const cleanIP = removeDeadCards(ipRange, Array.from(solverBoard));

    // Check cache
    const cacheKey = makeCacheKey(solverBoard, startingPot, effectiveStack, heroPosition, villainPosition);
    const cached = solveCache.get(cacheKey);
    if (cached) {
      lastSolveResult = cached;
      emitStatus({ state: 'cached', message: 'GTO aus Cache geladen' });
      resolve(cached);
      return;
    }

    // Send solve request to worker
    const id = ++currentSolveId;
    pendingSolves.set(id, { resolve: (result) => {
      // Cache the result
      solveCache.set(cacheKey, result);
      if (solveCache.size > MAX_CACHE_SIZE) {
        const firstKey = solveCache.keys().next().value;
        solveCache.delete(firstKey);
      }
      // Also try to persist in IndexedDB
      saveToDB(cacheKey, result).catch(() => {});
      resolve(result);
    }, reject });

    worker.postMessage({
      type: 'solve',
      params: {
        id,
        oopRange: cleanOOP,
        ipRange: cleanIP,
        board: solverBoard,
        startingPot: Math.round(startingPot),
        effectiveStack: Math.round(effectiveStack),
        maxIterations,
        betSizes,
      },
    });

    emitStatus({ state: 'solving', message: 'GTO wird berechnet...' });
  });
}

// === Query GTO strategy for a specific hand ===
// Returns { actions, frequencies, bestAction, ev } or null
export function getGTOForHand(solveResult, card1, card2) {
  if (!solveResult || !solveResult.strategy) return null;

  const c1 = engineCardToSolverId(card1);
  const c2 = engineCardToSolverId(card2);
  const lo = Math.min(c1, c2);
  const hi = Math.max(c1, c2);
  const comboKey = `${lo}_${hi}`;

  const handStrategy = solveResult.strategy[comboKey];
  const handEV = solveResult.evDetail?.[comboKey];

  if (!handStrategy) return null;

  // Find best action (highest frequency)
  let bestAction = null;
  let bestFreq = -1;
  const frequencies = {};

  for (const [action, freq] of Object.entries(handStrategy)) {
    const pct = Math.round(freq * 100);
    frequencies[action] = pct;
    if (freq > bestFreq) {
      bestFreq = freq;
      bestAction = action;
    }
  }

  return {
    actions: solveResult.actions,
    frequencies,       // { "Check": 65, "Bet": 35 }
    bestAction,        // "Check"
    bestFreq: Math.round(bestFreq * 100), // 65
    ev: handEV || {},  // { "Check": 12.5, "Bet": 14.2 }
    overallStrategy: solveResult.overallStrategy,
    currentPlayer: solveResult.currentPlayer,
    iterations: solveResult.iterations,
    exploitability: solveResult.exploitability,
  };
}

// === Map solver action names to engine action types ===
export function mapSolverAction(solverAction) {
  const name = solverAction.toLowerCase();
  if (name === 'fold') return 'fold';
  if (name === 'check') return 'check';
  if (name === 'call') return 'call';
  if (name.startsWith('bet') || name.startsWith('raise') || name.startsWith('allin')) return 'raise';
  return 'check';
}

// === Convert GTO result to coach-compatible format ===
// Returns { fold: 0-100, check: 0-100, call: 0-100, raise: 0-100 }
export function gtoToCoachFreqs(gtoResult) {
  if (!gtoResult) return null;

  const freqs = { fold: 0, check: 0, call: 0, raise: 0 };

  for (const [action, pct] of Object.entries(gtoResult.frequencies)) {
    const mapped = mapSolverAction(action);
    freqs[mapped] += pct;
  }

  return freqs;
}

// === Cancel current solve ===
export function cancelSolve() {
  if (worker && pendingSolves.size > 0) {
    worker.postMessage({ type: 'cancel' });
    for (const [id, { reject }] of pendingSolves) {
      reject(new Error('Cancelled'));
    }
    pendingSolves.clear();
    emitStatus({ state: 'cancelled', message: 'Solve abgebrochen' });
  }
}

// === Cleanup ===
export function destroySolver() {
  cancelSolve();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerReady = false;
  solverAvailable = false;
}

// === IndexedDB persistence ===
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToDB(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromDB(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// === Load cached solutions from IndexedDB on startup ===
export async function loadCachedSolutions() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const keys = req.result;
      // Load most recent N solutions
      const toLoad = keys.slice(-MAX_CACHE_SIZE);
      for (const key of toLoad) {
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          if (getReq.result) {
            solveCache.set(key, getReq.result);
          }
        };
      }
    };
  } catch (e) {
    // IndexedDB not available — that's fine
  }
}
