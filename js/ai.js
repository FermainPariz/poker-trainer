// === AI Opponents: 5 distinct playing styles ===

import { ACTIONS, PHASES } from './engine.js';
import { getPreflopStrength, evaluateHand } from './evaluator.js';

// AI Profiles
const PROFILES = {
  fish: {
    name: 'Nemo',
    style: 'Loose-Passive',
    preflopCallRate: 0.7,
    postflopCallRate: 0.6,
    bluffRate: 0.05,
    raiseRate: 0.15,
    foldToRaiseRate: 0.2,
  },
  tag: {
    name: 'Viktor',
    style: 'Tight-Aggressive',
    preflopCallRate: 0.35,
    postflopCallRate: 0.4,
    bluffRate: 0.15,
    raiseRate: 0.4,
    foldToRaiseRate: 0.4,
  },
  lag: {
    name: 'Blaze',
    style: 'Loose-Aggressive',
    preflopCallRate: 0.6,
    postflopCallRate: 0.5,
    bluffRate: 0.25,
    raiseRate: 0.45,
    foldToRaiseRate: 0.25,
  },
  nit: {
    name: 'Luna',
    style: 'Tight-Passive',
    preflopCallRate: 0.25,
    postflopCallRate: 0.35,
    bluffRate: 0.02,
    raiseRate: 0.2,
    foldToRaiseRate: 0.6,
  },
  maniac: {
    name: 'Shark',
    style: 'Maniac',
    preflopCallRate: 0.8,
    postflopCallRate: 0.65,
    bluffRate: 0.35,
    raiseRate: 0.5,
    foldToRaiseRate: 0.1,
  },
};

export const AI_ASSIGNMENTS = ['tag', 'nit', 'fish', 'lag', 'maniac', 'tag', 'fish', 'lag'];

export class AIPlayer {
  constructor(profileKey) {
    this.profile = PROFILES[profileKey] || PROFILES.fish;
    this.profileKey = profileKey;
  }

  async decide(game, playerIndex) {
    const player = game.players[playerIndex];
    const available = game.getAvailableActions();
    if (available.length === 0) return null;

    const hand = player.hand;
    const community = game.communityCards;
    const toCall = game.getCallAmount();
    const pot = game.pot + game.getCurrentBetsTotal();
    const stack = player.stack;
    const minRaise = game.getMinRaise();
    const position = game.getPosition(playerIndex);

    // Position modifier: late position = more aggressive, early = tighter
    const positionBonus = this._getPositionModifier(position);

    // Variable think time: fast for easy decisions, slower for hard ones
    const isEasyDecision = (toCall === 0) || (available.length <= 2);
    const baseTime = isEasyDecision ? 300 : 600;
    const variance = isEasyDecision ? 500 : 1200;
    await new Promise(r => setTimeout(r, baseTime + Math.random() * variance));

    let decision;
    if (game.phase === PHASES.PREFLOP) {
      decision = this._preflopDecision(hand, available, toCall, pot, stack, minRaise, positionBonus);
    } else {
      decision = this._postflopDecision(hand, community, available, toCall, pot, stack, minRaise, positionBonus);
    }

    return decision;
  }

  // Position affects play: late position = more aggressive, early = tighter
  _getPositionModifier(position) {
    const mods = {
      'BTN': 0.25,    // much looser on button
      'BTN/SB': 0.15,
      'CO': 0.15,     // cutoff still good
      'MP': 0.0,      // baseline
      'HJ': 0.0,
      'UTG': -0.15,   // tighter from early position
      'UTG+1': -0.1,
      'SB': -0.05,    // SB out of position postflop
      'BB': 0.1,      // BB gets good odds to defend
    };
    return mods[position] || 0;
  }

  _preflopDecision(hand, available, toCall, pot, stack, minRaise = 0, posBonus = 0) {
    const strength = getPreflopStrength(hand);
    const p = this.profile;

    // Position-adjusted rates
    const callRate = Math.min(1, p.preflopCallRate + posBonus);
    const raiseRate = Math.min(1, p.raiseRate + posBonus * 0.5);
    const foldRate = Math.max(0, p.foldToRaiseRate - posBonus);

    // Premium hands — always play, usually raise
    if (strength === 'premium') {
      if (Math.random() < raiseRate + 0.3 && this._canRaise(available)) {
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'big', minRaise) };
      }
      return this._callOrCheck(available);
    }

    // Strong hands
    if (strength === 'strong') {
      if (toCall > stack * 0.25 && Math.random() < foldRate) {
        return { action: ACTIONS.FOLD };
      }
      if (Math.random() < raiseRate && this._canRaise(available)) {
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'medium', minRaise) };
      }
      if (Math.random() < callRate) return this._callOrCheck(available);
      return toCall === 0 ? this._callOrCheck(available) : { action: ACTIONS.FOLD };
    }

    // Playable hands — position matters most here
    if (strength === 'playable') {
      if (toCall > stack * 0.15 && Math.random() < foldRate + 0.1) {
        return { action: ACTIONS.FOLD };
      }
      if (Math.random() < raiseRate * 0.6 && this._canRaise(available) && posBonus > 0) {
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'small', minRaise) };
      }
      if (Math.random() < callRate * 0.8) return this._callOrCheck(available);
      return toCall === 0 ? this._callOrCheck(available) : { action: ACTIONS.FOLD };
    }

    // Weak hands
    if (toCall === 0) {
      if (Math.random() < p.bluffRate + posBonus * 0.3 && this._canRaise(available)) {
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'small', minRaise) };
      }
      return this._callOrCheck(available);
    }

    // Loose players in late position may call with weak hands
    if (Math.random() < callRate * 0.3) return this._callOrCheck(available);
    return { action: ACTIONS.FOLD };
  }

  _postflopDecision(hand, community, available, toCall, pot, stack, minRaise = 0, posBonus = 0) {
    const eval_ = evaluateHand(hand, community);
    const strength = eval_ ? eval_.strength : 0;
    const p = this.profile;

    // Monster (two pair+)
    if (strength >= 2) {
      if (Math.random() < p.raiseRate + 0.2 && this._canRaise(available)) {
        const size = strength >= 4 ? 'big' : 'medium';
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, size, minRaise) };
      }
      return this._callOrCheck(available);
    }

    // Pair
    if (strength === 1) {
      if (toCall > pot * 0.7 && Math.random() < p.foldToRaiseRate) {
        return { action: ACTIONS.FOLD };
      }
      if (Math.random() < p.raiseRate * 0.5 && this._canRaise(available)) {
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'small', minRaise) };
      }
      if (Math.random() < p.postflopCallRate) return this._callOrCheck(available);
      return toCall === 0 ? { action: ACTIONS.CHECK } : { action: ACTIONS.FOLD };
    }

    // Nothing — bluff or give up
    if (toCall === 0) {
      if (Math.random() < p.bluffRate && this._canRaise(available)) {
        return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'medium', minRaise) };
      }
      return { action: ACTIONS.CHECK };
    }

    if (toCall <= pot * 0.3 && Math.random() < p.postflopCallRate * 0.5) {
      return this._callOrCheck(available);
    }

    if (Math.random() < p.bluffRate * 0.5 && this._canRaise(available)) {
      return { action: this._raiseAction(available), amount: this._raiseSize(toCall, pot, stack, 'big', minRaise) };
    }

    return { action: ACTIONS.FOLD };
  }

  _canRaise(available) {
    return available.includes(ACTIONS.RAISE) || available.includes(ACTIONS.BET);
  }

  _raiseAction(available) {
    return available.includes(ACTIONS.RAISE) ? ACTIONS.RAISE : ACTIONS.BET;
  }

  _callOrCheck(available) {
    if (available.includes(ACTIONS.CHECK)) return { action: ACTIONS.CHECK };
    if (available.includes(ACTIONS.CALL)) return { action: ACTIONS.CALL };
    if (available.includes(ACTIONS.ALLIN)) return { action: ACTIONS.ALLIN };
    return { action: ACTIONS.FOLD };
  }

  _raiseSize(toCall, pot, stack, size, minRaise = 0) {
    const totalPot = pot + toCall;
    let raiseAmount;

    switch (size) {
      case 'small': raiseAmount = toCall + Math.floor(totalPot * 0.33); break;
      case 'medium': raiseAmount = toCall + Math.floor(totalPot * 0.66); break;
      case 'big': raiseAmount = toCall + totalPot; break;
      default: raiseAmount = toCall + Math.floor(totalPot * 0.5);
    }

    // Enforce minimum legal raise
    raiseAmount = Math.max(raiseAmount, minRaise);
    // Add slight randomness
    raiseAmount += Math.floor(Math.random() * 6) - 3;
    raiseAmount = Math.max(minRaise || (toCall + 1), raiseAmount);
    raiseAmount = Math.min(raiseAmount, stack);

    return raiseAmount;
  }
}
