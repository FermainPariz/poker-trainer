// === Hand Evaluator: pokersolver wrapper + hand strength categories ===

import { cardToSolverFormat } from './engine.js';

// Hand strength categories (0 = trash, 9 = nuts)
const STRENGTH_CATEGORIES = {
  'High Card': 0,
  'Pair': 1,
  'Two Pair': 2,
  'Three of a Kind': 3,
  'Straight': 4,
  'Flush': 5,
  'Full House': 6,
  'Four of a Kind': 7,
  'Straight Flush': 8,
  'Royal Flush': 9,
};

// Preflop hand rankings — realistic 6-max ranges
const PREMIUM_HANDS = ['AA', 'KK', 'QQ', 'JJ', 'AKs'];
const STRONG_HANDS = ['TT', '99', 'AK', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs'];
const PLAYABLE_HANDS = [
  '88', '77', '66', '55', '44', '33', '22',     // all pairs
  'AQ', 'AJ', 'AT', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', // suited aces
  'KQ', 'KJ', 'KT', 'KJs', 'KTs', 'K9s',       // king broadway (suited + offsuit)
  'QJ', 'QT', 'QJs', 'QTs', 'Q9s',              // queen broadway (suited + offsuit)
  'JT', 'JTs', 'J9s',                            // jack broadway (suited + offsuit)
  'T9s', '98s', '87s', '76s', '65s', '54s',      // suited connectors
];

export function evaluateHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards].map(cardToSolverFormat);

  if (!window.Hand || allCards.length < 5) return null;

  try {
    const solved = window.Hand.solve(allCards);
    return {
      name: solved.name,
      descr: solved.descr,
      rank: solved.rank,
      strength: STRENGTH_CATEGORIES[solved.name] ?? 0,
      solved,
    };
  } catch (e) {
    console.warn('Hand evaluation error:', e);
    return null;
  }
}

export function compareHands(hand1Cards, hand2Cards, communityCards) {
  const h1 = [...hand1Cards, ...communityCards].map(cardToSolverFormat);
  const h2 = [...hand2Cards, ...communityCards].map(cardToSolverFormat);

  if (!window.Hand) return 0;

  const solved1 = window.Hand.solve(h1);
  const solved2 = window.Hand.solve(h2);
  const winners = window.Hand.winners([solved1, solved2]);

  if (winners.length === 2) return 0; // tie
  if (winners[0] === solved1) return 1; // hand1 wins
  return -1; // hand2 wins
}

export function getPreflopStrength(holeCards) {
  const r1 = holeCards[0].rank;
  const r2 = holeCards[1].rank;
  const suited = holeCards[0].suit === holeCards[1].suit;

  // Normalize: higher rank first
  const ranks = 'AKQJT98765432';
  const [high, low] = ranks.indexOf(r1) < ranks.indexOf(r2) ? [r1, r2] : [r2, r1];
  const key = high === low ? `${high}${low}` : `${high}${low}${suited ? 's' : ''}`;
  const keyOffsuit = `${high}${low}`;

  if (PREMIUM_HANDS.includes(key) || PREMIUM_HANDS.includes(keyOffsuit)) return 'premium';
  if (STRONG_HANDS.includes(key) || STRONG_HANDS.includes(keyOffsuit)) return 'strong';
  if (PLAYABLE_HANDS.includes(key) || PLAYABLE_HANDS.includes(keyOffsuit)) return 'playable';
  return 'weak';
}

export function getHandDescription(evalResult) {
  if (!evalResult) return '';
  return evalResult.descr || evalResult.name;
}
