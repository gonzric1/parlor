export interface CardData {
  rank: string;
  suit: string;
}

export interface PokerPlayer {
  id: string;
  name: string;
  chips: number;
  currentBet: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  lastAction: string | null;
  sittingOut: boolean;
  missedBlinds: number;
  waitingForBB: boolean;
}

export interface ShowdownResult {
  playerHands: {
    id: string;
    name: string;
    holeCards: [CardData, CardData];
    handDescription: string;
  }[];
  winners: string[];
  winnerDescription: string;
}

export interface PokerPublicState {
  phase: string;
  handNumber: number;
  communityCards: CardData[];
  pot: number;
  roundBets: number;
  currentBet: number;
  activePlayerId: string | null;
  dealerIndex: number;
  players: PokerPlayer[];
  minRaise: number;
  showdown: ShowdownResult | null;
  mucked?: boolean;
}

export interface PokerPrivateState {
  holeCards: CardData[];
  playerId: string;
}
