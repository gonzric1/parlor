import type { PlayerId, ServerGamePlugin, GameAction, ActionResult, GameResult, GameSettingDef } from '@parlor/shared';
import type { PokerState, PokerPhase, Card } from './state.js';
import * as engine from './engine.js';
import * as actions from './actions.js';

interface PokerSettings {
  startingChips: number;
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
    minPlayers: 2,
    maxPlayers: 8,
  },

  turnModel: { type: 'sequential', timeoutMs: 30000 },

  settingDefs: [
    {
      key: 'startingChips',
      label: 'Starting Chips',
      type: 'number',
      default: 1000,
      min: 1000,
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
    const startingChips = settings.startingChips ?? 1000;
    const names = settings.playerNames ?? {};

    const players = playerIds.map(id => ({
      id,
      name: names[id] ?? 'Player',
      chips: startingChips,
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      holeCards: null as [{ rank: '2'; suit: 'h' }, { rank: '2'; suit: 'h' }] | null,
      disconnected: false,
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
    };

    state = engine.postBlinds(state);
    state = engine.dealHoleCards(state);
    state.phase = 'pre-flop';

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

    if (state.phase === 'showdown') {
      const nonFolded = state.players.filter(p => !p.folded && p.holeCards);
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

      showdown = {
        playerHands: playerHands.map(({ strength: _, ...rest }) => rest),
        winners: winners.map(w => w.id),
        winnerDescription: `${winnerNames} wins with ${winnerDesc}`,
      };
    }

    const publicState = {
      phase: state.phase,
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
    return 30000;
  },

  onTimeout(state: PokerState): PokerState {
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

    // Check if only one player has chips (or only one not eliminated)
    const playersWithChips = state.players.filter(p => p.chips > 0);

    if (playersWithChips.length <= 1) {
      const winner = playersWithChips[0] || state.players[0];
      const sorted = [...state.players].sort((a, b) => b.chips - a.chips);
      const playerResults = new Map<PlayerId, PokerPlayerResult>();
      sorted.forEach((p, i) => {
        playerResults.set(p.id, { chips: p.chips, placement: i + 1 });
      });

      return {
        winners: [winner.id],
        playerResults,
        summary: `Game over! Winner takes all.`,
      };
    }

    // Hand is over but game continues - not game over yet
    // The room manager should start a new hand
    return null;
  },

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
};
