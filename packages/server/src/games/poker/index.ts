import type { PlayerId, ServerGamePlugin, GameAction, ActionResult, GameResult, GameSettingDef } from '@parlor/shared';
import type { PokerState, PokerPhase, Card } from './state.js';
import * as engine from './engine.js';
import * as actions from './actions.js';

interface PokerSettings {
  buyIn: number;
  startingChips?: number; // legacy compat
  bigBlind: number;
  playerNames?: Record<string, string>;
}

interface PokerPlayerResult {
  chips: number;
  placement: number;
}

export const pokerPlugin: ServerGamePlugin<
  PokerState,
  unknown,
  unknown,
  PokerPhase,
  { amount?: number },
  PokerSettings,
  PokerPlayerResult
> = {
  meta: {
    id: 'poker',
    name: "Texas Hold'em",
    description: 'Classic poker game with community cards. Try to make the best 5-card hand.',
    minPlayers: 1,
    maxPlayers: 8,
  },

  turnModel: { type: 'sequential', timeoutMs: 30000 },

  settingDefs: [
    {
      key: 'buyIn',
      label: 'Buy-In',
      type: 'number',
      default: 1000,
      min: 400,
      max: 10000,
    },
    {
      key: 'bigBlind',
      label: 'Big Blind',
      type: 'number',
      default: 20,
      min: 20,
      max: 200,
    },
  ] satisfies GameSettingDef[],

  initialize(playerIds: PlayerId[], settings: PokerSettings): PokerState {
    const bigBlind = settings.bigBlind ?? 20;
    const buyIn = settings.buyIn ?? settings.startingChips ?? 1000;
    const minBuyIn = bigBlind * 20;
    const names = settings.playerNames ?? {};

    const players = playerIds.map(id => ({
      id,
      name: names[id] ?? 'Player',
      chips: buyIn,
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      holeCards: null as [{ rank: '2'; suit: 'h' }, { rank: '2'; suit: 'h' }] | null,
      disconnected: false,
      lastAction: null,
      sittingOut: false,
      missedBlinds: 0,
      waitingForBB: false,
      postingBlinds: false,
    }));

    let state: PokerState = {
      players,
      communityCards: [],
      deck: engine.createDeck(),
      pots: [],
      phase: 'dealing',
      dealerIndex: 0,
      activePlayerIndex: 0,
      lastRaiseAmount: bigBlind,
      minRaise: bigBlind,
      bigBlind,
      smallBlind: Math.floor(bigBlind / 2),
      handNumber: 1,
      lastAggressor: null,
      playersActedThisRound: [],
      mucked: false,
      allInRunout: false,
      minBuyIn,
    };

    // Need at least 2 players to deal a hand
    if (players.length >= 2) {
      state = engine.postBlinds(state);
      state = engine.dealHoleCards(state);
      state.phase = 'pre-flop';
    } else {
      // Single player: wait in showdown phase for more players to join
      state.phase = 'showdown';
      for (const player of state.players) {
        player.folded = true;
      }
    }

    return state;
  },

  getStateViews(state: PokerState) {
    // Pot = settled pots + current round bets
    const settledPot = state.pots.reduce((sum, p) => sum + p.amount, 0);
    const roundBets = state.players.reduce((sum, p) => sum + p.bet, 0);
    const activePlayer = state.players[state.activePlayerIndex];
    const highestBet = Math.max(...state.players.map(p => p.bet), 0);

    // Build showdown info if applicable
    let showdown: {
      playerHands: { id: string; name: string; holeCards: [Card, Card]; handDescription: string }[];
      winners: string[];
      winnerDescription: string;
    } | null = null;

    if (state.phase === 'winner-decide') {
      // Winner is deciding whether to reveal — show lightweight overlay
      const nonFolded = state.players.filter(p => !p.folded);
      const winner = nonFolded[0];
      showdown = {
        playerHands: [],
        winners: winner ? [winner.id] : [],
        winnerDescription: `${winner?.name ?? 'Unknown'} wins!`,
      };
    } else if (state.phase === 'showdown') {
      const nonFolded = state.players.filter(p => !p.folded && p.holeCards);

      // Single-player waiting state: no showdown overlay needed
      if (nonFolded.length === 0) {
        // showdown stays null
      } else if (state.mucked && nonFolded.length === 1) {
        // Fold-win with muck: hide hole cards
        const winner = nonFolded[0];
        showdown = {
          playerHands: [],
          winners: [winner.id],
          winnerDescription: `${winner.name} wins!`,
        };
      } else {
        const playerHands = nonFolded.map(p => {
          const cards = [
            ...p.holeCards!.map(c => `${c.rank}${c.suit}`),
            ...state.communityCards.map(c => `${c.rank}${c.suit}`),
          ];
          return {
            id: p.id,
            name: p.name,
            holeCards: p.holeCards! as [Card, Card],
            handDescription: engine.getHandDescription(cards),
            strength: engine.evaluateHandStrength(cards),
          };
        });

        const bestStrength = Math.min(...playerHands.map(h => h.strength));
        const winners = playerHands.filter(h => h.strength === bestStrength);
        const winnerNames = winners.map(w => w.name).join(' & ');
        const winnerDesc = winners[0]?.handDescription ?? '';

        // For fold-win reveal (1 player, not mucked), just show "{name} wins with {hand}"
        // For multi-player showdown, show full hand comparison
        showdown = {
          playerHands: playerHands.map(({ strength: _, ...rest }) => rest),
          winners: winners.map(w => w.id),
          winnerDescription: nonFolded.length === 1
            ? `${winnerNames} wins with ${winnerDesc}`
            : `${winnerNames} wins with ${winnerDesc}`,
        };
      }
    }

    const publicState = {
      phase: state.phase,
      handNumber: state.handNumber,
      communityCards: state.communityCards,
      pot: settledPot,
      roundBets,
      currentBet: highestBet,
      activePlayerId: activePlayer?.id ?? null,
      dealerIndex: state.dealerIndex,
      minRaise: state.minRaise,
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        connected: !p.disconnected,
        lastAction: p.lastAction,
        sittingOut: p.sittingOut,
        missedBlinds: p.missedBlinds,
        waitingForBB: p.waitingForBB,
      })),
      showdown,
    };

    const playerStates = new Map<PlayerId, { holeCards: typeof state.players[0]['holeCards']; playerId: PlayerId }>();
    for (const player of state.players) {
      playerStates.set(player.id, {
        playerId: player.id,
        holeCards: player.holeCards,
      });
    }

    return { publicState, playerStates };
  },

  getPhase(state: PokerState): PokerPhase {
    return state.phase;
  },

  getActivePlayerIds(state: PokerState): PlayerId[] {
    if (state.phase === 'showdown' || state.phase === 'dealing') return [];
    if (state.allInRunout) return [];
    if (state.phase === 'winner-decide') {
      const player = state.players[state.activePlayerIndex];
      return player ? [player.id] : [];
    }
    const player = state.players[state.activePlayerIndex];
    if (!player || player.folded || player.allIn) return [];
    return [player.id];
  },

  validateAction(state: PokerState, action: GameAction<{ amount?: number }>): ActionResult {
    return actions.validateAction(state, action);
  },

  applyAction(state: PokerState, action: GameAction<{ amount?: number }>): PokerState {
    return actions.applyAction(state, action);
  },

  getTimerDuration(state: PokerState): number | null {
    if (state.phase === 'showdown' || state.phase === 'dealing') return null;
    if (state.allInRunout) return null;
    if (state.phase === 'winner-decide') return 5000;
    return 30000;
  },

  onTimeout(state: PokerState): PokerState {
    // Auto-muck on winner-decide timeout
    if (state.phase === 'winner-decide') {
      const newState = structuredClone(state);
      newState.mucked = true;
      newState.phase = 'showdown';
      return newState;
    }
    // All-in runout: advance one phase
    if (state.allInRunout) {
      let newState = engine.advancePhase(state);
      if (newState.phase === 'showdown') {
        newState.allInRunout = false;
      }
      return newState;
    }
    // Auto-fold on timeout
    const player = state.players[state.activePlayerIndex];
    if (!player || player.folded || player.allIn) return state;
    return actions.applyAction(state, {
      playerId: player.id,
      type: 'fold',
      payload: {},
    });
  },

  checkGameOver(state: PokerState): GameResult<PokerPlayerResult> | null {
    if (state.phase !== 'showdown') return null;

    // Cash game: game is over when 0 players remain (all left)
    if (state.players.length === 0) {
      return {
        winners: [],
        playerResults: new Map(),
        summary: 'All players have left. Game over.',
      };
    }

    // No "last player standing" — game continues as long as players remain
    return null;
  },

  getPostActionTimer(state: PokerState): { durationMs: number; phase: PokerPhase } | null {
    if (state.allInRunout && state.phase !== 'showdown') {
      return { durationMs: 2000, phase: state.phase };
    }
    if (state.phase === 'winner-decide') {
      return { durationMs: 5000, phase: 'winner-decide' };
    }
    return null;
  },

  startNextRound(state: PokerState): PokerState | null {
    if (state.phase !== 'showdown') return null;
    // Need at least 2 eligible players to start a new hand
    const eligible = state.players.filter(p => engine.isEligibleForHand(p));
    if (eligible.length < 2) return null;
    return engine.startNewHand(state);
  },

  nextRoundDelay: 5000,

  onPlayerDisconnect(state: PokerState, playerId: PlayerId): PokerState {
    const newState = structuredClone(state);
    const player = newState.players.find(p => p.id === playerId);
    if (player) player.disconnected = true;
    return newState;
  },

  onPlayerReconnect(state: PokerState, playerId: PlayerId): PokerState {
    const newState = structuredClone(state);
    const player = newState.players.find(p => p.id === playerId);
    if (player) player.disconnected = false;
    return newState;
  },

  onPlayerJoin(state: PokerState, playerId: PlayerId, playerName: string, settings: PokerSettings): PokerState {
    const newState = structuredClone(state);
    const buyIn = settings.buyIn ?? settings.startingChips ?? 1000;
    newState.players.push({
      id: playerId,
      name: playerName,
      chips: buyIn,
      bet: 0,
      totalBet: 0,
      folded: true, // not in current hand
      allIn: false,
      holeCards: null,
      disconnected: false,
      lastAction: null,
      sittingOut: false,
      missedBlinds: 0,
      waitingForBB: false,
      postingBlinds: false,
    });
    return newState;
  },

  onPlayerLeave(state: PokerState, playerId: PlayerId): PokerState {
    const newState = structuredClone(state);
    const leavingIndex = newState.players.findIndex(p => p.id === playerId);
    if (leavingIndex === -1) return newState;

    newState.players.splice(leavingIndex, 1);

    // Adjust indices if they shifted
    if (newState.players.length > 0) {
      if (newState.dealerIndex >= newState.players.length) {
        newState.dealerIndex = 0;
      } else if (leavingIndex < newState.dealerIndex) {
        newState.dealerIndex--;
      }

      if (newState.activePlayerIndex >= newState.players.length) {
        newState.activePlayerIndex = 0;
      } else if (leavingIndex < newState.activePlayerIndex) {
        newState.activePlayerIndex--;
      }
    }

    return newState;
  },

  canPlayerLeave(state: PokerState, playerId: PlayerId): boolean {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return true;
    // Can leave if folded, sitting out, or between hands (showdown/dealing)
    if (player.folded || player.sittingOut || player.waitingForBB) return true;
    if (state.phase === 'showdown' || state.phase === 'dealing') return true;
    return false;
  },
};
