import type { ActionResult, GameAction } from '@parlor/shared';
import type { PokerState, PokerActionType } from './state.js';
import { getNextActivePlayer, isRoundComplete, advancePhase, calculatePots } from './engine.js';

interface PokerActionPayload {
  amount?: number;
}

export function validateAction(
  state: PokerState,
  action: GameAction<PokerActionPayload>,
): ActionResult {
  const playerIndex = state.players.findIndex(p => p.id === action.playerId);
  if (playerIndex === -1) return { valid: false, reason: 'Player not found' };
  if (playerIndex !== state.activePlayerIndex) return { valid: false, reason: 'Not your turn' };

  const player = state.players[playerIndex];
  if (player.folded) return { valid: false, reason: 'Already folded' };
  if (player.allIn) return { valid: false, reason: 'Already all-in' };

  const actionType = action.type as PokerActionType;
  const maxBet = Math.max(...state.players.filter(p => !p.folded).map(p => p.bet));
  const toCall = maxBet - player.bet;

  switch (actionType) {
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
  const actionType = action.type as PokerActionType;
  const maxBet = Math.max(...newState.players.filter(p => !p.folded).map(p => p.bet));

  switch (actionType) {
    case 'fold':
      player.folded = true;
      break;
    case 'check':
      // No chip movement
      break;
    case 'call': {
      const toCall = Math.min(maxBet - player.bet, player.chips);
      player.chips -= toCall;
      player.bet += toCall;
      player.totalBet += toCall;
      if (player.chips === 0) player.allIn = true;
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
    newState.phase = 'showdown';
    return newState;
  }

  // Advance to next player or next phase
  if (isRoundComplete(newState)) {
    // Check if all remaining players are all-in (or only 1 active)
    const activePlayers = newState.players.filter(p => !p.folded && !p.allIn);
    if (activePlayers.length <= 1 && newState.phase !== 'river') {
      // Run out remaining community cards
      newState = calculatePots(newState);
      while (newState.phase !== 'showdown') {
        newState = advancePhase(newState);
      }
    } else {
      newState = advancePhase(newState);
    }
  } else {
    newState.activePlayerIndex = getNextActivePlayer(newState, playerIndex);
  }

  return newState;
}
