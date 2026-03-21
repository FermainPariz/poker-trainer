// === Game Engine: 6-Max Texas Hold'em ===

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_DISPLAY = {
  '2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',
  'T':'10','J':'J','Q':'Q','K':'K','A':'A'
};

export const PHASES = {
  IDLE: 'idle',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
};

export const ACTIONS = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise',
  ALLIN: 'allin',
};

export { SUIT_SYMBOLS, SUIT_NAMES, RANK_DISPLAY };

// === Deck ===
export class Deck {
  constructor() {
    this.cards = [];
    for (const s of SUITS) {
      for (const r of RANKS) {
        this.cards.push({ rank: r, suit: s });
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  burn() { this.cards.splice(0, 1); }

  deal(n = 1) {
    return this.cards.splice(0, n);
  }
}

// === Card Helpers ===
export function cardToString(card) {
  return RANK_DISPLAY[card.rank] + SUIT_SYMBOLS[card.suit];
}

export function cardSuitName(card) {
  return SUIT_NAMES[card.suit];
}

export function cardRankDisplay(card) {
  return RANK_DISPLAY[card.rank];
}

export function cardToSolverFormat(card) {
  return card.rank + card.suit;
}

// === Game ===
export class Game {
  constructor(config = {}) {
    this.numPlayers = config.numPlayers || 6;
    this.smallBlind = config.smallBlind || 5;
    this.bigBlind = config.bigBlind || 10;
    this.startingStack = config.startingStack || 1000;
    this.humanSeat = config.humanSeat ?? 0;
    this.reset();
  }

  reset() {
    this.players = [];
    const aiNames = ['Viktor', 'Luna', 'Nemo', 'Blaze', 'Shark', 'Alex', 'Rio', 'Mika'];
    for (let i = 0; i < this.numPlayers; i++) {
      this.players.push({
        id: i,
        name: i === this.humanSeat ? 'Du' : aiNames[i > this.humanSeat ? i - 1 : i] || `AI ${i}`,
        stack: this.startingStack,
        hand: [],
        bet: 0,
        totalInvested: 0, // track total contribution for side pots
        folded: false,
        isAI: i !== this.humanSeat,
        allIn: false,
        sittingOut: false,
      });
    }
    this.btnIndex = this.numPlayers - 1;
    this.phase = PHASES.IDLE;
    this.pot = 0;
    this.communityCards = [];
    this.deck = null;
    this.currentPlayerIndex = 0;
    this.lastRaiseSize = this.bigBlind;
    this.playersActedThisRound = new Set();
    this.handNumber = 0;
    this.handHistory = [];
  }

  get humanPlayer() { return this.players[this.humanSeat]; }

  // === Position helpers ===
  get sbIndex() { return this._nextActive(this.btnIndex); }
  get bbIndex() { return this._nextActive(this.sbIndex); }

  getPosition(seatIndex) {
    const activePlayers = this.players.filter(p => !p.sittingOut);
    const numActive = activePlayers.length;
    if (numActive <= 1) return '';

    if (numActive === 2) {
      return seatIndex === this.btnIndex ? 'BTN/SB' : 'BB';
    }

    // Find distance from BTN
    let pos = 0;
    let idx = this.btnIndex;
    while (idx !== seatIndex && pos < this.numPlayers) {
      idx = this._nextActive(idx);
      pos++;
    }

    if (pos === 0) return 'BTN';
    if (pos === 1) return 'SB';
    if (pos === 2) return 'BB';

    const remaining = numActive - 3;
    const posFromBB = pos - 3;
    if (remaining <= 0) return '';
    if (remaining === 1) return 'UTG';
    if (remaining === 2) return posFromBB === 0 ? 'UTG' : 'CO';
    if (remaining === 3) return ['UTG', 'MP', 'CO'][posFromBB] || '';
    if (remaining === 4) return ['UTG', 'MP', 'HJ', 'CO'][posFromBB] || '';
    if (remaining === 5) return ['UTG', 'UTG+1', 'MP', 'HJ', 'CO'][posFromBB] || '';
    return ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'][posFromBB] || '';
  }

  _nextActive(from) {
    let idx = (from + 1) % this.numPlayers;
    for (let i = 0; i < this.numPlayers; i++) {
      if (!this.players[idx].sittingOut) return idx;
      idx = (idx + 1) % this.numPlayers;
    }
    return from; // fallback
  }

  _nextInHand(from) {
    let idx = (from + 1) % this.numPlayers;
    for (let i = 0; i < this.numPlayers; i++) {
      const p = this.players[idx];
      if (!p.folded && !p.sittingOut && !p.allIn) return idx;
      idx = (idx + 1) % this.numPlayers;
    }
    return -1; // no actionable player
  }

  _activePlayers() {
    return this.players.filter(p => !p.folded && !p.sittingOut);
  }

  _actionablePlayers() {
    return this.players.filter(p => !p.folded && !p.sittingOut && !p.allIn);
  }

  // === Start New Hand ===
  startHand() {
    for (const p of this.players) {
      if (p.stack <= 0) p.sittingOut = true;
    }

    const activePlayers = this.players.filter(p => !p.sittingOut);
    if (activePlayers.length < 2) return null;

    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.phase = PHASES.PREFLOP;
    this.handNumber++;
    this.handHistory = [];
    this.lastRaiseSize = this.bigBlind;
    this.playersActedThisRound = new Set();

    for (const p of this.players) {
      p.hand = [];
      p.bet = 0;
      p.totalInvested = 0;
      p.folded = p.sittingOut;
      p.allIn = false;
    }

    this.btnIndex = this._nextActive(this.btnIndex);

    const isHeadsUp = activePlayers.length === 2;
    if (isHeadsUp) {
      this._postBlind(this.btnIndex, this.smallBlind);
      this._postBlind(this._nextActive(this.btnIndex), this.bigBlind);
    } else {
      this._postBlind(this.sbIndex, this.smallBlind);
      this._postBlind(this.bbIndex, this.bigBlind);
    }

    for (const p of this.players) {
      if (!p.sittingOut) {
        p.hand = this.deck.deal(2);
      }
    }

    if (isHeadsUp) {
      this.currentPlayerIndex = this.btnIndex;
    } else {
      this.currentPlayerIndex = this._nextActive(this.bbIndex);
    }

    return { phase: this.phase, btnIndex: this.btnIndex };
  }

  _postBlind(playerIndex, amount) {
    const p = this.players[playerIndex];
    const actual = Math.min(amount, p.stack);
    p.stack -= actual;
    p.bet = actual;
    p.totalInvested += actual;
    if (p.stack === 0) p.allIn = true;
  }

  // === Available Actions ===
  getAvailableActions() {
    const cp = this.players[this.currentPlayerIndex];
    if (cp.folded || cp.allIn || cp.sittingOut) return [];

    const toCall = this._getCallAmount();
    const actions = [];

    if (toCall === 0) {
      actions.push(ACTIONS.CHECK);
      if (cp.stack > 0) {
        actions.push(ACTIONS.BET);
        actions.push(ACTIONS.ALLIN);
      }
    } else {
      actions.push(ACTIONS.FOLD);
      if (cp.stack > toCall) {
        actions.push(ACTIONS.CALL);
        // Only allow raise if stack > call + minRaise
        if (cp.stack >= this.getMinRaise()) {
          actions.push(ACTIONS.RAISE);
        }
        actions.push(ACTIONS.ALLIN);
      } else {
        actions.push(ACTIONS.ALLIN);
      }
    }

    return actions;
  }

  _getCallAmount() {
    const maxBet = Math.max(...this.players.map(p => p.bet));
    return maxBet - this.players[this.currentPlayerIndex].bet;
  }

  getCallAmount() { return this._getCallAmount(); }

  getMinRaise() {
    const toCall = this._getCallAmount();
    return Math.min(toCall + this.lastRaiseSize, this.players[this.currentPlayerIndex].stack);
  }

  getMaxRaise() {
    return this.players[this.currentPlayerIndex].stack;
  }

  // === Perform Action ===
  performAction(action, amount = 0) {
    const cp = this.players[this.currentPlayerIndex];
    const result = { done: false, nextPhase: null, winners: null, showdown: false };

    // Validate action is legal
    const available = this.getAvailableActions();
    if (!available.includes(action)) {
      // Silently map illegal fold to check when check is available
      if (action === ACTIONS.FOLD && available.includes(ACTIONS.CHECK)) {
        action = ACTIONS.CHECK;
      } else if (!available.includes(action)) {
        console.warn(`Illegal action: ${action}. Available: ${available}`);
        return result;
      }
    }

    this.handHistory.push({ phase: this.phase, player: cp.id, action, amount });

    switch (action) {
      case ACTIONS.FOLD:
        cp.folded = true;
        this.playersActedThisRound.add(cp.id);
        if (this._activePlayers().length === 1) {
          const winner = this._activePlayers()[0];
          this._collectBets();
          winner.stack += this.pot;
          result.winners = [{ player: winner, amount: this.pot }];
          result.potWon = this.pot;
          result.done = true;
          this.phase = PHASES.SHOWDOWN;
          return result;
        }
        break;

      case ACTIONS.CHECK:
        this.playersActedThisRound.add(cp.id);
        break;

      case ACTIONS.CALL: {
        const toCall = Math.min(this._getCallAmount(), cp.stack);
        cp.stack -= toCall;
        cp.bet += toCall;
        cp.totalInvested += toCall;
        if (cp.stack === 0) cp.allIn = true;
        this.playersActedThisRound.add(cp.id);
        // Record actual call amount in history (overwrite the 0 from parameter)
        this.handHistory[this.handHistory.length - 1].amount = toCall;
        break;
      }

      case ACTIONS.BET:
      case ACTIONS.RAISE: {
        const callNeeded = this._getCallAmount();
        // Enforce minimum raise
        const minRaise = this.getMinRaise();
        let raiseTotal = Math.max(amount, minRaise);
        raiseTotal = Math.min(raiseTotal, cp.stack);

        const raisePortion = raiseTotal - callNeeded;
        if (raisePortion > 0) {
          this.lastRaiseSize = Math.max(raisePortion, this.lastRaiseSize);
        }
        cp.stack -= raiseTotal;
        cp.bet += raiseTotal;
        cp.totalInvested += raiseTotal;
        if (cp.stack === 0) cp.allIn = true;
        this.playersActedThisRound = new Set([cp.id]);
        break;
      }

      case ACTIONS.ALLIN: {
        const callNeeded = this._getCallAmount();
        const allInAmount = cp.stack;
        cp.bet += allInAmount;
        cp.totalInvested += allInAmount;
        cp.stack = 0;
        cp.allIn = true;
        // Only reopen betting if all-in constitutes a full raise
        const raiseOver = allInAmount - callNeeded;
        if (raiseOver >= this.lastRaiseSize) {
          this.lastRaiseSize = raiseOver;
          this.playersActedThisRound = new Set([cp.id]);
        } else {
          this.playersActedThisRound.add(cp.id);
        }
        break;
      }
    }

    if (this._isRoundOver()) {
      this._collectBets();
      return this._advancePhase(result);
    }

    const next = this._nextInHand(this.currentPlayerIndex);
    if (next === -1) {
      // No one else can act — advance
      this._collectBets();
      return this._advancePhase(result);
    }
    this.currentPlayerIndex = next;
    return result;
  }

  _isRoundOver() {
    const actionable = this._actionablePlayers();
    if (actionable.length === 0) return true;

    const allActed = actionable.every(p => this.playersActedThisRound.has(p.id));
    if (!allActed) return false;

    // Bets equal among actionable players
    const bets = actionable.map(p => p.bet);
    return bets.every(b => b === bets[0]);
  }

  _collectBets() {
    for (const p of this.players) {
      this.pot += p.bet;
      p.bet = 0;
    }
  }

  _advancePhase(result) {
    const active = this._activePlayers();
    const actionable = this._actionablePlayers();
    const needsRunout = active.length > 1 && actionable.length <= 1;

    switch (this.phase) {
      case PHASES.PREFLOP:
        this.phase = PHASES.FLOP;
        this.deck.burn();
        this.communityCards = this.deck.deal(3);
        break;
      case PHASES.FLOP:
        this.phase = PHASES.TURN;
        this.deck.burn();
        this.communityCards.push(...this.deck.deal(1));
        break;
      case PHASES.TURN:
        this.phase = PHASES.RIVER;
        this.deck.burn();
        this.communityCards.push(...this.deck.deal(1));
        break;
      case PHASES.RIVER:
        return this._showdown(result);
    }

    result.nextPhase = this.phase;

    if (needsRunout) {
      return this.completeRunout(result);
    }

    this.playersActedThisRound = new Set();
    this.lastRaiseSize = this.bigBlind;

    const nextActor = this._nextInHand(this.btnIndex);
    if (nextActor === -1) {
      return this.completeRunout(result);
    }
    this.currentPlayerIndex = nextActor;
    return result;
  }

  // Public: deal remaining community cards to showdown
  completeRunout(result) {
    while (this.communityCards.length < 5) {
      this.deck.burn();
      this.communityCards.push(...this.deck.deal(1));
    }
    result.nextPhase = PHASES.SHOWDOWN;
    return this._showdown(result);
  }

  // === Side Pot Calculation + Showdown ===
  _showdown(result) {
    this.phase = PHASES.SHOWDOWN;
    result.showdown = true;
    result.done = true;

    const active = this._activePlayers();

    if (active.length === 1) {
      active[0].stack += this.pot;
      result.winners = [{ player: active[0], amount: this.pot }];
      result.potWon = this.pot;
      return result;
    }

    if (!window.Hand) {
      const share = Math.floor(this.pot / active.length);
      active.forEach(p => p.stack += share);
      result.winners = active.map(p => ({ player: p, amount: share }));
      result.potWon = this.pot;
      return result;
    }

    // Evaluate all hands
    const handResults = active.map(p => ({
      player: p,
      solved: window.Hand.solve([...p.hand, ...this.communityCards].map(cardToSolverFormat)),
    }));

    // Calculate side pots
    const pots = this._calculateSidePots(active);
    result.winners = [];
    let totalDistributed = 0;

    for (const pot of pots) {
      const eligible = handResults.filter(h => pot.eligible.includes(h.player.id));
      if (eligible.length === 0) continue;

      const winners = window.Hand.winners(eligible.map(h => h.solved));
      const winnerHands = eligible.filter(h => winners.includes(h.solved));

      const share = Math.floor(pot.amount / winnerHands.length);
      const remainder = pot.amount - share * winnerHands.length;

      winnerHands.forEach((w, i) => {
        const won = share + (i === 0 ? remainder : 0);
        w.player.stack += won;
        totalDistributed += won;

        const existing = result.winners.find(rw => rw.player.id === w.player.id);
        if (existing) {
          existing.amount += won;
        } else {
          result.winners.push({ player: w.player, amount: won });
        }
      });
    }

    // Safety: distribute any remaining chips (rounding)
    const undistributed = this.pot - totalDistributed;
    if (undistributed > 0 && result.winners.length > 0) {
      result.winners[0].player.stack += undistributed;
      result.winners[0].amount += undistributed;
    }

    result.potWon = this.pot;
    result.hands = handResults.map(h => ({
      playerId: h.player.id,
      name: h.solved.name,
      descr: h.solved.descr,
    }));

    return result;
  }

  _calculateSidePots(activePlayers) {
    // Get all unique investment levels from ALL players (including folded)
    const allNonSittingOut = this.players.filter(p => !p.sittingOut);
    const levels = [...new Set(allNonSittingOut.map(p => p.totalInvested))]
      .filter(l => l > 0)
      .sort((a, b) => a - b);

    const pots = [];
    let prevLevel = 0;

    for (const level of levels) {
      if (level <= prevLevel) continue;

      // Each player contributes: min(totalInvested, level) - min(totalInvested, prevLevel)
      let potAmount = 0;
      for (const p of allNonSittingOut) {
        const contribution = Math.min(p.totalInvested, level) - Math.min(p.totalInvested, prevLevel);
        potAmount += Math.max(0, contribution);
      }

      // Eligible to win: only ACTIVE (non-folded) players who invested >= this level
      const eligible = activePlayers
        .filter(p => p.totalInvested >= level)
        .map(p => p.id);

      if (potAmount > 0 && eligible.length > 0) {
        pots.push({ amount: potAmount, eligible });
      }

      prevLevel = level;
    }

    // Safety: verify total
    const potsTotal = pots.reduce((s, p) => s + p.amount, 0);
    if (potsTotal < this.pot && pots.length > 0) {
      pots[pots.length - 1].amount += this.pot - potsTotal;
    }

    return pots;
  }

  // === Rebuy ===
  rebuyPlayer(index) {
    const p = this.players[index];
    if (p.stack <= 0) {
      p.stack = this.startingStack;
      p.sittingOut = false;
    }
  }

  getCurrentBetsTotal() {
    return this.players.reduce((s, p) => s + p.bet, 0);
  }
}
