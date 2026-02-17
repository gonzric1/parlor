import { describe, it, expect } from 'vitest';
import type { PokerState, Card } from '../state.js';
import {
  createDeck,
  dealHoleCards,
  dealCommunityCards,
  calculatePots,
  advancePhase,
  evaluateShowdown,
  postBlinds,
  rotateDealerButton,
  getNextActivePlayer,
  isRoundComplete,
} from '../engine.js';

function makeState(overrides: Partial<PokerState> = {}): PokerState {
  return {
    players: [
      { id: 'p1', name: 'P1', chips: 1000, bet: 0, totalBet: 0, folded: false, allIn: false, holeCards: null, disconnected: false },
      { id: 'p2', name: 'P2', chips: 1000, bet: 0, totalBet: 0, folded: false, allIn: false, holeCards: null, disconnected: false },
      { id: 'p3', name: 'P3', chips: 1000, bet: 0, totalBet: 0, folded: false, allIn: false, holeCards: null, disconnected: false },
    ],
    communityCards: [],
    deck: createDeck(),
    pots: [],
    phase: 'dealing',
    dealerIndex: 0,
    activePlayerIndex: 0,
    lastRaiseAmount: 20,
    minRaise: 20,
    bigBlind: 20,
    smallBlind: 10,
    handNumber: 1,
    lastAggressor: null,
    playersActedThisRound: [],
    ...overrides,
  };
}

describe('createDeck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);

    const cardStrings = deck.map(c => `${c.rank}${c.suit}`);
    const unique = new Set(cardStrings);
    expect(unique.size).toBe(52);
  });

  it('contains all ranks and suits', () => {
    const deck = createDeck();
    const ranks = new Set(deck.map(c => c.rank));
    const suits = new Set(deck.map(c => c.suit));
    expect(ranks.size).toBe(13);
    expect(suits.size).toBe(4);
  });
});

describe('dealHoleCards', () => {
  it('deals 2 cards to each player', () => {
    const state = makeState();
    const dealt = dealHoleCards(state);

    for (const player of dealt.players) {
      expect(player.holeCards).toHaveLength(2);
    }
    // 3 players * 2 cards = 6 cards dealt
    expect(dealt.deck).toHaveLength(52 - 6);
  });

  it('does not mutate original state', () => {
    const state = makeState();
    const deckLength = state.deck.length;
    dealHoleCards(state);
    expect(state.deck).toHaveLength(deckLength);
    expect(state.players[0].holeCards).toBeNull();
  });
});

describe('dealCommunityCards', () => {
  it('deals 3 cards for flop', () => {
    const state = makeState();
    const dealt = dealCommunityCards(state, 3);
    expect(dealt.communityCards).toHaveLength(3);
    expect(dealt.deck).toHaveLength(52 - 3);
  });

  it('deals 1 card for turn', () => {
    const state = makeState({ communityCards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' }, { rank: 'Q', suit: 'd' }] as Card[] });
    const dealt = dealCommunityCards(state, 1);
    expect(dealt.communityCards).toHaveLength(4);
  });
});

describe('calculatePots', () => {
  it('creates a single main pot when no side pots needed', () => {
    const state = makeState();
    state.players[0].totalBet = 100;
    state.players[1].totalBet = 100;
    state.players[2].totalBet = 100;

    const result = calculatePots(state);
    expect(result.pots).toHaveLength(1);
    expect(result.pots[0].amount).toBe(300);
    expect(result.pots[0].eligible).toEqual(['p1', 'p2', 'p3']);
  });

  it('creates side pots for all-in players', () => {
    const state = makeState();
    state.players[0].totalBet = 50;
    state.players[0].allIn = true;
    state.players[1].totalBet = 100;
    state.players[2].totalBet = 100;

    const result = calculatePots(state);
    expect(result.pots).toHaveLength(2);
    // Main pot: 50 * 3 = 150
    expect(result.pots[0].amount).toBe(150);
    expect(result.pots[0].eligible).toEqual(['p1', 'p2', 'p3']);
    // Side pot: 50 * 2 = 100
    expect(result.pots[1].amount).toBe(100);
    expect(result.pots[1].eligible).toEqual(['p2', 'p3']);
  });

  it('handles folded players correctly', () => {
    const state = makeState();
    state.players[0].totalBet = 50;
    state.players[0].folded = true;
    state.players[1].totalBet = 100;
    state.players[2].totalBet = 100;

    const result = calculatePots(state);
    // Folded player contributed but is not eligible
    const totalEligible = result.pots.flatMap(p => p.eligible);
    expect(totalEligible).not.toContain('p1');
  });
});

describe('advancePhase', () => {
  it('advances from dealing to pre-flop', () => {
    const state = makeState({ phase: 'dealing' });
    const result = advancePhase(state);
    expect(result.phase).toBe('pre-flop');
  });

  it('advances from pre-flop to flop with 3 community cards', () => {
    const state = makeState({ phase: 'pre-flop' });
    const result = advancePhase(state);
    expect(result.phase).toBe('flop');
    expect(result.communityCards).toHaveLength(3);
  });

  it('advances from flop to turn with 1 more card', () => {
    const state = makeState({
      phase: 'flop',
      communityCards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' }, { rank: 'Q', suit: 'd' }] as Card[],
    });
    const result = advancePhase(state);
    expect(result.phase).toBe('turn');
    expect(result.communityCards).toHaveLength(4);
  });

  it('advances from turn to river with 1 more card', () => {
    const state = makeState({
      phase: 'turn',
      communityCards: [
        { rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' },
        { rank: 'Q', suit: 'd' }, { rank: 'J', suit: 'c' },
      ] as Card[],
    });
    const result = advancePhase(state);
    expect(result.phase).toBe('river');
    expect(result.communityCards).toHaveLength(5);
  });

  it('resets bets when advancing phase', () => {
    const state = makeState({ phase: 'pre-flop' });
    state.players[0].bet = 100;
    state.players[1].bet = 100;
    const result = advancePhase(state);
    expect(result.players[0].bet).toBe(0);
    expect(result.players[1].bet).toBe(0);
  });
});

describe('evaluateShowdown', () => {
  it('awards pot to player with best hand', () => {
    const state = makeState({
      phase: 'river',
      communityCards: [
        { rank: '2', suit: 'h' },
        { rank: '3', suit: 'd' },
        { rank: '7', suit: 'c' },
        { rank: '9', suit: 's' },
        { rank: 'J', suit: 'h' },
      ] as Card[],
      pots: [{ amount: 200, eligible: ['p1', 'p2'] }],
    });
    // Give p1 pocket aces, p2 pocket twos
    state.players[0].holeCards = [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'c' }];
    state.players[1].holeCards = [{ rank: '4', suit: 's' }, { rank: '5', suit: 'c' }];
    state.players[2].folded = true;
    state.players[0].chips = 0;
    state.players[1].chips = 0;

    const result = evaluateShowdown(state);
    // p1 with aces should win
    expect(result.players[0].chips).toBe(200);
    expect(result.players[1].chips).toBe(0);
  });

  it('splits pot for tied hands', () => {
    const state = makeState({
      phase: 'river',
      communityCards: [
        { rank: 'A', suit: 'h' },
        { rank: 'K', suit: 'h' },
        { rank: 'Q', suit: 'h' },
        { rank: 'J', suit: 'h' },
        { rank: 'T', suit: 'h' },
      ] as Card[],
      pots: [{ amount: 200, eligible: ['p1', 'p2'] }],
      players: [
        { id: 'p1', name: 'P1', chips: 0, bet: 0, totalBet: 100, folded: false, allIn: false, holeCards: [{ rank: '2', suit: 's' }, { rank: '3', suit: 's' }], disconnected: false },
        { id: 'p2', name: 'P2', chips: 0, bet: 0, totalBet: 100, folded: false, allIn: false, holeCards: [{ rank: '4', suit: 's' }, { rank: '5', suit: 's' }], disconnected: false },
      ],
    });

    const result = evaluateShowdown(state);
    // Both should get 100 each (royal flush on board)
    expect(result.players[0].chips).toBe(100);
    expect(result.players[1].chips).toBe(100);
  });
});

describe('postBlinds', () => {
  it('posts small and big blinds', () => {
    const state = makeState();
    const result = postBlinds(state);

    // Dealer is index 0, SB is index 1, BB is index 2
    expect(result.players[1].bet).toBe(10); // small blind
    expect(result.players[1].chips).toBe(990);
    expect(result.players[2].bet).toBe(20); // big blind
    expect(result.players[2].chips).toBe(980);
  });

  it('handles heads-up blinds correctly', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'P1', chips: 1000, bet: 0, totalBet: 0, folded: false, allIn: false, holeCards: null, disconnected: false },
        { id: 'p2', name: 'P2', chips: 1000, bet: 0, totalBet: 0, folded: false, allIn: false, holeCards: null, disconnected: false },
      ],
    });
    const result = postBlinds(state);

    // Heads-up: dealer (p1 index 0) is SB
    expect(result.players[0].bet).toBe(10);
    expect(result.players[1].bet).toBe(20);
  });

  it('handles player with fewer chips than blind', () => {
    const state = makeState();
    state.players[1].chips = 5; // Less than small blind
    const result = postBlinds(state);

    expect(result.players[1].bet).toBe(5);
    expect(result.players[1].chips).toBe(0);
    expect(result.players[1].allIn).toBe(true);
  });
});

describe('rotateDealerButton', () => {
  it('advances dealer to next player with chips', () => {
    const state = makeState();
    const result = rotateDealerButton(state);
    expect(result.dealerIndex).toBe(1);
  });

  it('skips players with no chips', () => {
    const state = makeState();
    state.players[1].chips = 0;
    const result = rotateDealerButton(state);
    expect(result.dealerIndex).toBe(2);
  });
});

describe('getNextActivePlayer', () => {
  it('skips folded players', () => {
    const state = makeState();
    state.players[1].folded = true;
    const next = getNextActivePlayer(state, 0);
    expect(next).toBe(2);
  });

  it('skips all-in players', () => {
    const state = makeState();
    state.players[1].allIn = true;
    const next = getNextActivePlayer(state, 0);
    expect(next).toBe(2);
  });
});

describe('isRoundComplete', () => {
  it('returns true when only one player not folded', () => {
    const state = makeState();
    state.players[1].folded = true;
    state.players[2].folded = true;
    expect(isRoundComplete(state)).toBe(true);
  });

  it('returns false when not all players have acted', () => {
    const state = makeState({ playersActedThisRound: ['p1'] });
    state.players[0].bet = 20;
    state.players[1].bet = 20;
    expect(isRoundComplete(state)).toBe(false);
  });

  it('returns true when all players acted and bets match', () => {
    const state = makeState({ playersActedThisRound: ['p1', 'p2', 'p3'] });
    state.players[0].bet = 20;
    state.players[1].bet = 20;
    state.players[2].bet = 20;
    expect(isRoundComplete(state)).toBe(true);
  });
});
