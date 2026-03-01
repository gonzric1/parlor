import { useMemo } from 'react';
import { usePrevious } from '../../../hooks/usePrevious';
import type { PokerPublicState } from '../types';

export interface CommunityCardEvent {
  newCardStartIndex: number;
  newCardCount: number;
}

export interface PlayerBetEvent {
  playerId: string;
  delta: number;
}

export interface PokerAnimationEvents {
  communityCards: CommunityCardEvent | null;
  showdownEnter: boolean;
  showdownExit: boolean;
  newHand: boolean;
  phaseChange: boolean;
  turnChange: { playerId: string } | null;
  playerBets: PlayerBetEvent[];
}

export function usePokerAnimations(state: PokerPublicState | null): PokerAnimationEvents {
  const prev = usePrevious(state);

  return useMemo(() => {
    const events: PokerAnimationEvents = {
      communityCards: null,
      showdownEnter: false,
      showdownExit: false,
      newHand: false,
      phaseChange: false,
      turnChange: null,
      playerBets: [],
    };

    if (!state) return events;

    const prevCardCount = prev?.communityCards.length ?? 0;
    const currCardCount = state.communityCards.length;

    // Detect new community cards
    if (currCardCount > prevCardCount) {
      events.communityCards = {
        newCardStartIndex: prevCardCount,
        newCardCount: currCardCount - prevCardCount,
      };
    }

    // Detect new hand (cards went from some to 0)
    if (prevCardCount > 0 && currCardCount === 0) {
      events.newHand = true;
    }

    // Detect showdown enter/exit
    if (!prev?.showdown && state.showdown) {
      events.showdownEnter = true;
    }
    if (prev?.showdown && !state.showdown) {
      events.showdownExit = true;
    }

    // Detect phase change
    if (prev && prev.phase !== state.phase) {
      events.phaseChange = true;
    }

    // Detect turn change
    if (prev && state.activePlayerId && prev.activePlayerId !== state.activePlayerId) {
      events.turnChange = { playerId: state.activePlayerId };
    }

    // Detect player bet changes
    if (prev) {
      for (const player of state.players) {
        const prevPlayer = prev.players.find(p => p.id === player.id);
        if (prevPlayer && player.currentBet > prevPlayer.currentBet) {
          events.playerBets.push({
            playerId: player.id,
            delta: player.currentBet - prevPlayer.currentBet,
          });
        }
      }
    }

    return events;
  }, [state, prev]);
}
