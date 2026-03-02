import type { PlayerId } from '@parlor/shared';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'h' | 'd' | 'c' | 's';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PokerPhase = 'dealing' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'winner-decide' | 'showdown';

export type PokerActionType = 'fold' | 'check' | 'call' | 'raise' | 'all-in' | 'reveal';

export interface PokerPlayer {
  id: PlayerId;
  name: string;
  chips: number;
  bet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  holeCards: [Card, Card] | null;
  disconnected: boolean;
  lastAction: PokerActionType | 'bet' | null;
  sittingOut: boolean;
  missedBlinds: number;
  waitingForBB: boolean;
  postingBlinds: boolean;
}

export interface Pot {
  amount: number;
  eligible: PlayerId[];
}

export interface PokerState {
  players: PokerPlayer[];
  communityCards: Card[];
  deck: Card[];
  pots: Pot[];
  phase: PokerPhase;
  dealerIndex: number;
  activePlayerIndex: number;
  lastRaiseAmount: number;
  minRaise: number;
  bigBlind: number;
  smallBlind: number;
  handNumber: number;
  lastAggressor: number | null;
  playersActedThisRound: string[];
  mucked: boolean;
  allInRunout: boolean;
  minBuyIn: number;
}

export interface PokerPublicState {
  players: {
    id: PlayerId;
    chips: number;
    bet: number;
    totalBet: number;
    folded: boolean;
    allIn: boolean;
    isDealer: boolean;
    isActive: boolean;
    disconnected: boolean;
    sittingOut: boolean;
    missedBlinds: number;
    waitingForBB: boolean;
  }[];
  communityCards: Card[];
  pots: Pot[];
  phase: PokerPhase;
  activePlayerIndex: number;
}

export interface PokerPrivateState {
  holeCards: [Card, Card] | null;
}
