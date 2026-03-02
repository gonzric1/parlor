import type { ActionResult, GameAction } from '@parlor/shared';
import type { PokerState, PokerActionType } from './state.js';
import { getNextActivePlayer, isRoundComplete, advancePhase, calculatePots, isEligibleForHand } from './engine.js';

interface PokerActionPayload {
  amount?: number;
}

export function validateAction(
  state: PokerState,
  action: GameAction<PokerActionPayload>,
): ActionResult {
  const playerIndex = state.players.findIndex(p => p.id === action.playerId);
  if (playerIndex === -1) return { valid: false, reason: 'Player not found' };

  const player = state.players[playerIndex];
  const actionType = action.type as string;

  // Actions that don't require it to be your turn
  switch (actionType) {
    case 'sit-out':
      if (player.sittingOut) return { valid: false, reason: 'Already sitting out' };
      return { valid: true };
    case 'sit-in':
      if (!player.sittingOut) return { valid: false, reason: 'Not sitting out' };
      return { valid: true };
    case 'post-blinds':
      if (!player.sittingOut && player.missedBlinds === 0) return { valid: false, reason: 'No missed blinds to post' };
      return { valid: true };
    case 'wait-for-bb':
      if (!player.sittingOut && player.missedBlinds === 0) return { valid: false, reason: 'No missed blinds' };
      return { valid: true };
    case 'top-up': {
      const maxStack = Math.max(...state.players.map(p => p.chips));
      if (player.chips >= maxStack) return { valid: false, reason: 'Already at max stack' };
      return { valid: true };
    }
  }

  // Standard in-turn actions
  if (playerIndex !== state.activePlayerIndex) return { valid: false, reason: 'Not your turn' };
  if (player.folded) return { valid: false, reason: 'Already folded' };
  if (player.allIn) return { valid: false, reason: 'Already all-in' };

  // Reveal is only valid during winner-decide phase
  if (actionType === 'reveal') {
    if (state.phase !== 'winner-decide') return { valid: false, reason: 'Cannot reveal now' };
    return { valid: true };
  }

  const maxBet = Math.max(...state.players.filter(p => !p.folded).map(p => p.bet));
  const toCall = maxBet - player.bet;

  switch (actionType as PokerActionType) {
    case 'fold':
      return { valid: true };
    case 'check':
      if (toCall > 0) return { valid: false, reason: 'Cannot check, there is a bet to call' };
      return { valid: true };
    case 'call':
      if (toCall === 0) return { valid: false, reason: 'Nothing to call, use check' };
      return { valid: true };
    case 'raise': {
      const raiseAmount = action.payload?.amount ?? 0;
      const totalBet = raiseAmount;
      const raiseBy = totalBet - maxBet;
      if (raiseBy < state.minRaise && totalBet < player.chips + player.bet) {
        return { valid: false, reason: `Raise must be at least ${state.minRaise}` };
      }
      if (totalBet > player.chips + player.bet) {
        return { valid: false, reason: 'Not enough chips' };
      }
      return { valid: true };
    }
    case 'all-in':
      if (player.chips === 0) return { valid: false, reason: 'No chips to go all-in with' };
      return { valid: true };
    default:
      return { valid: false, reason: 'Unknown action type' };
  }
}

export function applyAction(
  state: PokerState,
  action: GameAction<PokerActionPayload>,
): PokerState {
  let newState = structuredClone(state);
  const playerIndex = newState.players.findIndex(p => p.id === action.playerId);
  const player = newState.players[playerIndex];
  const actionType = action.type as string;

  // Handle out-of-turn cash game actions
  switch (actionType) {
    case 'sit-out':
      player.sittingOut = true;
      return newState;
    case 'sit-in':
      if (player.missedBlinds > 0) {
        // Player needs to choose: post or wait. Just mark sitting in for now.
        // Client will show post/wait buttons.
        return newState;
      }
      player.sittingOut = false;
      return newState;
    case 'post-blinds':
      player.postingBlinds = true;
      player.sittingOut = false;
      player.waitingForBB = false;
      return newState;
    case 'wait-for-bb':
      player.waitingForBB = true;
      player.sittingOut = false;
      return newState;
    case 'top-up': {
      const maxStack = Math.max(...newState.players.map(p => p.chips));
      player.chips = maxStack;
      return newState;
    }
  }

  // Handle reveal action during winner-decide phase
  if (actionType === 'reveal') {
    newState.mucked = false;
    newState.phase = 'showdown';
    return newState;
  }

  const maxBet = Math.max(...newState.players.filter(p => !p.folded).map(p => p.bet));

  switch (actionType) {
    case 'fold':
      player.folded = true;
      player.lastAction = 'fold';
      break;
    case 'check':
      // No chip movement
      player.lastAction = 'check';
      break;
    case 'call': {
      const toCall = Math.min(maxBet - player.bet, player.chips);
      player.chips -= toCall;
      player.bet += toCall;
      player.totalBet += toCall;
      if (player.chips === 0) player.allIn = true;
      player.lastAction = 'call';
      break;
    }
    case 'raise': {
      const targetBet = action.payload?.amount ?? maxBet + newState.minRaise;
      const toAdd = targetBet - player.bet;
      const actualAdd = Math.min(toAdd, player.chips);
      const raiseBy = (player.bet + actualAdd) - maxBet;
      player.chips -= actualAdd;
      player.bet += actualAdd;
      player.totalBet += actualAdd;
      if (raiseBy > newState.lastRaiseAmount) {
        newState.lastRaiseAmount = raiseBy;
      }
      newState.minRaise = raiseBy;
      newState.lastAggressor = playerIndex;
      if (player.chips === 0) player.allIn = true;
      // "bet" if no one had bet yet, "raise" otherwise
      player.lastAction = maxBet === 0 ? 'bet' : 'raise';
      // After a raise, all other players need to act again
      newState.playersActedThisRound = [player.id];
      break;
    }
    case 'all-in': {
      const allInAmount = player.chips;
      player.bet += allInAmount;
      player.totalBet += allInAmount;
      player.chips = 0;
      player.allIn = true;
      player.lastAction = 'all-in';
      if (player.bet > maxBet) {
        const raiseBy = player.bet - maxBet;
        if (raiseBy >= newState.minRaise) {
          newState.minRaise = raiseBy;
          newState.lastAggressor = playerIndex;
          // Counts as a raise, reset acted
          newState.playersActedThisRound = [player.id];
        }
      }
      break;
    }
  }

  if (!newState.playersActedThisRound.includes(player.id)) {
    newState.playersActedThisRound.push(player.id);
  }

  // Check for last player standing
  const nonFolded = newState.players.filter(p => !p.folded);
  if (nonFolded.length === 1) {
    // Award pot to winner
    newState = calculatePots(newState);
    for (const pot of newState.pots) {
      const winner = newState.players.find(p => p.id === nonFolded[0].id)!;
      winner.chips += pot.amount;
    }
    // Enter winner-decide phase so winner can choose to reveal or muck
    newState.phase = 'winner-decide';
    newState.activePlayerIndex = newState.players.findIndex(p => p.id === nonFolded[0].id);
    newState.mucked = false;
    return newState;
  }

  // Advance to next player or next phase
  if (isRoundComplete(newState)) {
    // Check if all remaining players are all-in (or only 1 active)
    const activePlayers = newState.players.filter(p => !p.folded && !p.allIn);
    if (activePlayers.length <= 1 && newState.phase !== 'river') {
      // All-in runout: advance one phase at a time with delays between
      newState = advancePhase(newState);
      newState.allInRunout = true;
    } else {
      newState = advancePhase(newState);
    }
  } else {
    newState.activePlayerIndex = getNextActivePlayer(newState, playerIndex);
  }

  return newState;
}
