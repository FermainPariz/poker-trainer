// === Equity Calculator Web Worker ===
// Monte Carlo simulation for hand equity estimation
// Runs in background thread to avoid blocking UI

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// Build full deck
function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(r + s);
    }
  }
  return deck;
}

// Remove known cards from deck
function removeCards(deck, cards) {
  const set = new Set(cards);
  return deck.filter(c => !set.has(c));
}

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// === Hand Evaluation (optimized 5-7 card evaluator) ===
// Returns numeric rank: higher = better hand

function evaluateCards(cards) {
  // Parse cards into rank/suit arrays
  const parsed = cards.map(c => ({
    rank: RANK_VALUES[c[0]],
    suit: c[1],
  }));

  // Generate all 5-card combinations from available cards (5, 6, or 7)
  const combos = getCombinations(parsed, 5);
  let bestRank = -1;

  for (const combo of combos) {
    const rank = evaluate5(combo);
    if (rank > bestRank) bestRank = rank;
  }

  return bestRank;
}

function getCombinations(arr, k) {
  if (k === arr.length) return [arr];
  if (k === 1) return arr.map(x => [x]);

  const result = [];
  function combine(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }
  combine(0, []);
  return result;
}

// Evaluate exactly 5 cards — returns numeric rank (higher = better)
// Hand categories: 0=high card, 1=pair, 2=two pair, 3=trips, 4=straight, 5=flush, 6=full house, 7=quads, 8=straight flush
function evaluate5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including wheel A-2-3-4-5)
  let isStraight = false;
  let straightHigh = 0;
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true;
    straightHigh = ranks[0];
  }
  // Wheel: A-5-4-3-2
  if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count rank frequencies
  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1;
  const counts = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Determine hand category + kickers
  if (isStraight && isFlush) {
    return 8 * 10000000 + straightHigh;
  }
  if (isFlush) {
    return 5 * 10000000 + ranks[0] * 50625 + ranks[1] * 3375 + ranks[2] * 225 + ranks[3] * 15 + ranks[4];
  }
  if (isStraight) {
    return 4 * 10000000 + straightHigh;
  }

  // Rank-based hands
  if (counts[0][1] === 4) {
    const quad = parseInt(counts[0][0]);
    const kicker = parseInt(counts[1][0]);
    return 7 * 10000000 + quad * 15 + kicker;
  }
  if (counts[0][1] === 3 && counts[1][1] === 2) {
    const trips = parseInt(counts[0][0]);
    const pair = parseInt(counts[1][0]);
    return 6 * 10000000 + trips * 15 + pair;
  }
  if (counts[0][1] === 3) {
    const trips = parseInt(counts[0][0]);
    const kickers = counts.slice(1).map(c => parseInt(c[0])).sort((a, b) => b - a);
    return 3 * 10000000 + trips * 225 + kickers[0] * 15 + kickers[1];
  }
  if (counts[0][1] === 2 && counts[1][1] === 2) {
    const pairs = [parseInt(counts[0][0]), parseInt(counts[1][0])].sort((a, b) => b - a);
    const kicker = parseInt(counts[2][0]);
    return 2 * 10000000 + pairs[0] * 225 + pairs[1] * 15 + kicker;
  }
  if (counts[0][1] === 2) {
    const pair = parseInt(counts[0][0]);
    const kickers = counts.slice(1).map(c => parseInt(c[0])).sort((a, b) => b - a);
    return 1 * 10000000 + pair * 3375 + kickers[0] * 225 + kickers[1] * 15 + kickers[2];
  }

  // High card
  return ranks[0] * 50625 + ranks[1] * 3375 + ranks[2] * 225 + ranks[3] * 15 + ranks[4];
}

// === Monte Carlo Equity Simulation ===
function simulateEquity(heroHand, communityCards, numOpponents, numSimulations) {
  const knownCards = [...heroHand, ...communityCards];
  const remainingDeck = removeCards(buildDeck(), knownCards);
  const cardsToReveal = 5 - communityCards.length;

  let wins = 0;
  let ties = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    const shuffled = shuffle([...remainingDeck]);
    let idx = 0;

    // Deal remaining community cards
    const board = [...communityCards];
    for (let c = 0; c < cardsToReveal; c++) {
      board.push(shuffled[idx++]);
    }

    // Evaluate hero
    const heroCards = [...heroHand, ...board];
    const heroRank = evaluateCards(heroCards);

    // Deal + evaluate opponents
    let heroBest = true;
    let tiedWithAll = true;

    for (let opp = 0; opp < numOpponents; opp++) {
      const oppHand = [shuffled[idx++], shuffled[idx++]];
      const oppCards = [...oppHand, ...board];
      const oppRank = evaluateCards(oppCards);

      if (oppRank > heroRank) {
        heroBest = false;
        tiedWithAll = false;
        break;
      }
      if (oppRank < heroRank) {
        tiedWithAll = false;
      }
    }

    if (heroBest && !tiedWithAll) wins++;
    else if (heroBest && tiedWithAll) ties++;
  }

  return {
    equity: ((wins + ties * 0.5) / numSimulations * 100).toFixed(1),
    win: (wins / numSimulations * 100).toFixed(1),
    tie: (ties / numSimulations * 100).toFixed(1),
  };
}

// === Outs Calculator ===
function calculateOuts(heroHand, communityCards) {
  if (communityCards.length < 3 || communityCards.length >= 5) return { outs: [], count: 0 };

  const knownCards = [...heroHand, ...communityCards];
  const remaining = removeCards(buildDeck(), knownCards);

  const currentRank = evaluateCards([...heroHand, ...communityCards]);
  const currentCategory = Math.floor(currentRank / 10000000);

  // Hero's hole card ranks — for filtering board-pair noise
  const heroRanks = new Set(heroHand.map(c => RANK_VALUES[c[0]]));

  const outs = [];

  for (const card of remaining) {
    const newBoard = [...communityCards, card];
    const newRank = evaluateCards([...heroHand, ...newBoard]);
    const newCategory = Math.floor(newRank / 10000000);

    if (newCategory <= currentCategory) continue;

    const cardRank = RANK_VALUES[card[0]];
    const isHoleRank = heroRanks.has(cardRank);

    // Straights, flushes and better (cat >= 4) always count — these inherently
    // require hole card participation to be meaningful.
    if (newCategory >= 4) {
      outs.push({ card, improvesTo: getCategoryName(newCategory) });
      continue;
    }

    // For lower improvements (pair, two pair, trips, full house):
    // Only count if the card matches a hole card rank, OR if it's a big
    // jump (2+ categories). Board-only improvements (pairing/tripling board
    // cards) benefit all players equally and aren't real "outs."
    if (isHoleRank || (newCategory - currentCategory >= 2)) {
      outs.push({ card, improvesTo: getCategoryName(newCategory) });
    }
  }

  return { outs, count: outs.length };
}

function getCategoryName(cat) {
  const names = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
  return names[cat] || 'Unknown';
}

// === Message Handler ===
self.onmessage = function(e) {
  const { type, heroHand, communityCards, numOpponents, numSimulations, seq } = e.data;

  if (type === 'equity') {
    const result = simulateEquity(heroHand, communityCards, numOpponents || 5, numSimulations || 2000);
    self.postMessage({ type: 'equity', seq, ...result });
  }

  if (type === 'outs') {
    const result = calculateOuts(heroHand, communityCards);
    self.postMessage({ type: 'outs', seq, ...result });
  }
};
