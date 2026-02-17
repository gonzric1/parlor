import { evaluateCards, rankDescription, handRank } from 'phe';
import type { Card, Rank, Suit, PokerState, Pot } from './state.js';
import type { PlayerId } from '@parlor/shared';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['h', 'd', 'c', 's'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function dealHoleCards(state: PokerState): PokerState {
  const newState = structuredClone(state);
  for (const player of newState.players) {
    if (player.chips > 0 || player.allIn) {
      const card1 = newState.deck.pop()!;
      const card2 = newState.deck.pop()!;
      player.holeCards = [card1, card2];
    }
  }
  return newState;
}

export function dealCommunityCards(state: PokerState, count: number): PokerState {
  const newState = structuredClone(state);
  for (let i = 0; i < count; i++) {
    newState.communityCards.push(newState.deck.pop()!);
  }
  return newState;
}

export function calculatePots(state: PokerState): PokerState {
  const newState = structuredClone(state);
  const activePlayers = newState.players.filter(p => !p.folded);

  // Collect all distinct bet levels from all-in players
  const betLevels = [...new Set(activePlayers.map(p => p.totalBet))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let processed = 0;

  for (const level of betLevels) {
    const amount = level - processed;
    if (amount <= 0) continue;

    let potAmount = 0;
    const eligible: PlayerId[] = [];

    for (const player of newState.players) {
      const contribution = Math.min(amount, Math.max(0, player.totalBet - processed));
      potAmount += contribution;
      if (!player.folded && player.totalBet >= level) {
        eligible.push(player.id);
      }
    }

    if (potAmount > 0) {
      pots.push({ amount: potAmount, eligible });
    }
    processed = level;
  }

  newState.pots = pots;
  return newState;
}

export function advancePhase(state: PokerState): PokerState {
  let newState = structuredClone(state);

  // Reset per-round betting state
  for (const player of newState.players) {
    player.bet = 0;
  }
  newState.lastRaiseAmount = newState.bigBlind;
  newState.minRaise = newState.bigBlind;
  newState.lastAggressor = null;
  newState.playersActedThisRound = [];

  switch (newState.phase) {
    case 'dealing':
      newState.phase = 'pre-flop';
      break;
    case 'pre-flop':
      newState.phase = 'flop';
      newState = dealCommunityCards(newState, 3);
      newState.activePlayerIndex = getFirstToAct(newState);
      break;
    case 'flop':
      newState.phase = 'turn';
      newState = dealCommunityCards(newState, 1);
      newState.activePlayerIndex = getFirstToAct(newState);
      break;
    case 'turn':
      newState.phase = 'river';
      newState = dealCommunityCards(newState, 1);
      newState.activePlayerIndex = getFirstToAct(newState);
      break;
    case 'river':
      newState.phase = 'showdown';
      newState = calculatePots(newState);
      newState = evaluateShowdown(newState);
      break;
  }

  return newState;
}

function getFirstToAct(state: PokerState): number {
  // Post-flop: first active player after dealer
  const n = state.players.length;
  let idx = (state.dealerIndex + 1) % n;
  for (let i = 0; i < n; i++) {
    const player = state.players[idx];
    if (!player.folded && !player.allIn && player.chips > 0) {
      return idx;
    }
    idx = (idx + 1) % n;
  }
  return state.activePlayerIndex;
}

export function getNextActivePlayer(state: PokerState, fromIndex: number): number {
  const n = state.players.length;
  let idx = (fromIndex + 1) % n;
  for (let i = 0; i < n; i++) {
    const player = state.players[idx];
    if (!player.folded && !player.allIn) {
      return idx;
    }
    idx = (idx + 1) % n;
  }
  return fromIndex;
}

export function isRoundComplete(state: PokerState): boolean {
  const activePlayers = state.players.filter(p => !p.folded && !p.allIn);

  // If only one player is not folded (including all-in), round is complete
  if (state.players.filter(p => !p.folded).length <= 1) return true;

  // If no active (non-all-in) players can act, round is done
  if (activePlayers.length <= 1) {
    // If 0 or 1 active player, everyone is either folded or all-in
    // Check if bets are matched among non-folded players
    const nonFolded = state.players.filter(p => !p.folded);
    if (nonFolded.length <= 1) return true;

    // If only 1 active player left and they've acted, round is complete
    if (activePlayers.length === 0) return true;
    if (activePlayers.length === 1) {
      return state.playersActedThisRound.includes(activePlayers[0].id);
    }
  }

  // All active players must have acted
  const allActed = activePlayers.every(p => state.playersActedThisRound.includes(p.id));
  if (!allActed) return false;

  // All active players must have matching bets
  const maxBet = Math.max(...state.players.filter(p => !p.folded).map(p => p.bet));
  return activePlayers.every(p => p.bet === maxBet);
}

function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function evaluateShowdown(state: PokerState): PokerState {
  const newState = structuredClone(state);
  const nonFolded = newState.players.filter(p => !p.folded);

  // Evaluate each player's hand
  const handStrengths = new Map<PlayerId, number>();
  for (const player of nonFolded) {
    if (!player.holeCards) continue;
    const cards = [
      ...player.holeCards.map(cardToString),
      ...newState.communityCards.map(cardToString),
    ];
    const strength = evaluateCards(cards);
    handStrengths.set(player.id, strength);
  }

  // Distribute each pot to winners
  for (const pot of newState.pots) {
    const eligibleWithHands = pot.eligible.filter(id => handStrengths.has(id));
    if (eligibleWithHands.length === 0) continue;

    // Lower score = better hand in phe
    const bestScore = Math.min(...eligibleWithHands.map(id => handStrengths.get(id)!));
    const winners = eligibleWithHands.filter(id => handStrengths.get(id) === bestScore);

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;

    for (const winnerId of winners) {
      const player = newState.players.find(p => p.id === winnerId)!;
      player.chips += share;
    }

    // Give remainder to first winner (closest to dealer)
    if (remainder > 0) {
      const first = newState.players.find(p => winners.includes(p.id))!;
      first.chips += remainder;
    }
  }

  return newState;
}

export function rotateDealerButton(state: PokerState): PokerState {
  const newState = structuredClone(state);
  const n = newState.players.length;
  let idx = (newState.dealerIndex + 1) % n;
  for (let i = 0; i < n; i++) {
    if (newState.players[idx].chips > 0) {
      newState.dealerIndex = idx;
      break;
    }
    idx = (idx + 1) % n;
  }
  return newState;
}

export function postBlinds(state: PokerState): PokerState {
  const newState = structuredClone(state);
  const n = newState.players.length;

  let sbIndex: number;
  let bbIndex: number;

  if (n === 2) {
    // Heads-up: dealer is small blind
    sbIndex = newState.dealerIndex;
    bbIndex = (newState.dealerIndex + 1) % n;
  } else {
    sbIndex = (newState.dealerIndex + 1) % n;
    bbIndex = (newState.dealerIndex + 2) % n;
  }

  // Post small blind
  const sbPlayer = newState.players[sbIndex];
  const sbAmount = Math.min(newState.smallBlind, sbPlayer.chips);
  sbPlayer.chips -= sbAmount;
  sbPlayer.bet = sbAmount;
  sbPlayer.totalBet = sbAmount;
  if (sbPlayer.chips === 0) sbPlayer.allIn = true;

  // Post big blind
  const bbPlayer = newState.players[bbIndex];
  const bbAmount = Math.min(newState.bigBlind, bbPlayer.chips);
  bbPlayer.chips -= bbAmount;
  bbPlayer.bet = bbAmount;
  bbPlayer.totalBet = bbAmount;
  if (bbPlayer.chips === 0) bbPlayer.allIn = true;

  // Set active player (UTG in multi-way, SB in heads-up after dealing)
  if (n === 2) {
    // Pre-flop heads-up: SB (dealer) acts first
    newState.activePlayerIndex = sbIndex;
  } else {
    newState.activePlayerIndex = (bbIndex + 1) % n;
    // Skip to first non-folded non-all-in player
    for (let i = 0; i < n; i++) {
      const p = newState.players[newState.activePlayerIndex];
      if (!p.folded && !p.allIn && p.chips > 0) break;
      newState.activePlayerIndex = (newState.activePlayerIndex + 1) % n;
    }
  }

  newState.lastRaiseAmount = newState.bigBlind;
  newState.minRaise = newState.bigBlind;

  return newState;
}

/** Start a new hand: reset player states, rotate dealer, shuffle, deal, post blinds */
export function startNewHand(state: PokerState): PokerState {
  let newState = structuredClone(state);

  // Remove eliminated players (0 chips)
  // Actually keep them but skip them — they're out
  // Reset per-hand player state
  for (const player of newState.players) {
    player.bet = 0;
    player.totalBet = 0;
    player.folded = player.chips === 0; // auto-fold eliminated players
    player.allIn = false;
    player.holeCards = null;
    player.disconnected = player.disconnected; // preserve
  }

  newState.communityCards = [];
  newState.pots = [];
  newState.lastAggressor = null;
  newState.playersActedThisRound = [];
  newState.handNumber += 1;
  newState.deck = createDeck();

  // Rotate dealer
  newState = rotateDealerButton(newState);

  // Post blinds
  newState = postBlinds(newState);

  // Deal hole cards
  newState = dealHoleCards(newState);

  newState.phase = 'pre-flop';

  return newState;
}

export function evaluateHandStrength(cards: string[]): number {
  return evaluateCards(cards);
}

export function getHandDescription(cards: string[]): string {
  const strength = evaluateCards(cards);
  const rank = handRank(strength);
  return rankDescription(rank);
}
