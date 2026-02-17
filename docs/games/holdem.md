# Texas Hold'em Poker

Implementation in `packages/server/src/games/poker/` (server) and `packages/client/src/games/poker/` (client).

**Current status**: Playable with 2-8 players.

## Game Identity

```typescript
meta: {
  id: 'poker',
  name: "Texas Hold'em",
  description: 'Classic poker game with community cards. Try to make the best 5-card hand.',
  minPlayers: 2,
  maxPlayers: 8,
}
```

Turn model: `sequential` with 30-second timeout per turn.

## Configurable Settings

| Setting          | Type   | Default | Min  | Max    |
|------------------|--------|---------|------|--------|
| Starting Chips   | number | 1000    | 1000 | 10000  |
| Big Blind        | number | 20      | 20   | 200    |

Small blind is automatically `Math.floor(bigBlind / 2)`.

## Game Phases

```
dealing  -->  pre-flop  -->  flop  -->  turn  -->  river  -->  showdown
                                                                   |
                                                        (5s delay, new hand)
```

| Phase      | Community Cards | Description                                        |
|------------|----------------|----------------------------------------------------|
| `dealing`  | 0              | Transient phase during initialization.             |
| `pre-flop` | 0              | Blinds posted, hole cards dealt. Betting round.    |
| `flop`     | 3              | Three community cards revealed. Betting round.     |
| `turn`     | 4              | Fourth community card. Betting round.              |
| `river`    | 5              | Fifth community card. Betting round.               |
| `showdown` | 5              | Hands evaluated, pots awarded, results displayed.  |

## Actions

| Action   | Payload          | When Legal                                                  |
|----------|------------------|-------------------------------------------------------------|
| `fold`   | none             | Always (when it's your turn).                               |
| `check`  | none             | When there is no bet to call (current bet matches yours).   |
| `call`   | none             | When there is a bet to call. Puts in the minimum to match.  |
| `raise`  | `{ amount }`     | `amount` is the total bet level. Raise must be at least the current `minRaise` above the highest bet. |
| `all-in` | none             | When you have chips remaining. Puts all chips in.           |

Validation rules (in `actions.ts`):
- Only the active player can act.
- Folded or all-in players cannot act.
- `check` fails if there is an outstanding bet.
- `call` fails if there is nothing to call (use `check`).
- `raise` amount must be at least `minRaise` above the current highest bet, unless going all-in.
- `raise` cannot exceed the player's total chips.

## Hand Evaluation

Uses the **phe** library (`evaluateCards`, `rankDescription`, `handRank`).

- Cards are represented as `"Ah"`, `"Td"`, `"2c"` strings (rank + suit).
- `evaluateCards(cards)` returns a numeric strength where **lower = better** (Two Plus Two lookup table).
- `rankDescription(handRank(strength))` returns a human-readable string like "Full House" or "Straight Flush".
- At showdown, all non-folded players' hands are evaluated and compared. Lowest score wins.

## State Structure

### Server State (`PokerState`)

```typescript
interface PokerState {
  players: PokerPlayer[];       // All players (including eliminated)
  communityCards: Card[];       // 0-5 community cards
  deck: Card[];                 // Remaining deck
  pots: Pot[];                  // Settled pots with eligible players
  phase: PokerPhase;            // Current phase
  dealerIndex: number;          // Dealer button position
  activePlayerIndex: number;    // Whose turn it is
  lastRaiseAmount: number;      // Size of the last raise
  minRaise: number;             // Minimum raise increment
  bigBlind: number;             // Big blind amount
  smallBlind: number;           // Small blind amount
  handNumber: number;           // Current hand number
  lastAggressor: number | null; // Index of last player who raised
  playersActedThisRound: string[]; // IDs of players who have acted this betting round
}
```

### Player State (`PokerPlayer`)

```typescript
interface PokerPlayer {
  id: PlayerId;
  name: string;
  chips: number;                // Remaining chips
  bet: number;                  // Bet in current betting round
  totalBet: number;             // Total bet in current hand (for pot calculation)
  folded: boolean;
  allIn: boolean;
  holeCards: [Card, Card] | null;
  disconnected: boolean;
}
```

### Public State (sent to all)

Contains: phase, community cards, total pot, round bets, current highest bet, active player ID, dealer index, min raise, player list (id, name, chips, currentBet, folded, allIn, connected), and showdown info (if applicable).

Private state is not included in the public view. Hole cards are stripped out.

### Private State (sent to each player)

Contains only: `playerId` and `holeCards`.

### Showdown Info (in public state)

When phase is `showdown`, the public state includes:

```typescript
showdown: {
  playerHands: { id, name, holeCards, handDescription }[];
  winners: string[];          // IDs of winning players
  winnerDescription: string;  // e.g. "Alice wins with Full House"
}
```

## Blind and Dealer Rotation

- **Dealer rotation**: After each hand, the dealer button moves to the next player with chips (skips eliminated players).
- **Heads-up special case** (2 players): The dealer is the small blind and acts first pre-flop. Post-flop, the non-dealer acts first (standard heads-up rules).
- **Multi-way** (3+ players): Small blind is dealer+1, big blind is dealer+2. First to act pre-flop is dealer+3 (UTG). Post-flop, first to act is dealer+1.
- If a player cannot cover the full blind, they post what they have and are marked all-in.

## Side Pots

Side pots are calculated from the distinct bet levels of non-folded players (`calculatePots` in `engine.ts`):

1. Collect all unique `totalBet` values from active (non-folded) players.
2. Sort ascending.
3. For each level, calculate how much each player contributed at that level.
4. Create a `Pot` with the total amount and the list of eligible players (non-folded players who bet at least that level).

Each pot is awarded independently at showdown to the best hand among its eligible players.

Remainder chips from uneven splits go to the first winner (closest to dealer position).

## Showdown and New Hand

1. When the river betting round completes (or all players are all-in), the phase transitions to `showdown`.
2. `evaluateShowdown()` evaluates all non-folded hands and distributes each pot to its winner(s).
3. State views are distributed, including showdown info with revealed hands and winner description.
4. The TV displays a winner announcement overlay with all hands and descriptions.
5. After a **5-second delay**, a new hand starts automatically:
   - Player state is reset (bets cleared, folded/allIn reset).
   - Eliminated players (0 chips) are auto-folded rather than removed.
   - Dealer rotates, new deck is shuffled, blinds are posted, hole cards are dealt.
   - Phase returns to `pre-flop`.

If only one player remains with chips at showdown, `checkGameOver()` returns a `GameResult` and the game ends entirely.

## Last Player Standing

If all but one player folds during a hand, the remaining player wins all pots immediately. The phase jumps to `showdown`, pots are calculated and awarded, but no hands are revealed (the winner's cards stay hidden since there's no contest).

## Timeout

- Each turn has a 30-second timeout (`getTimerDuration()` returns `30000` during active play).
- `onTimeout()` auto-folds the active player.
- During `showdown` and `dealing` phases, the timer is disabled (`null`).

## Disconnect/Reconnect

- `onPlayerDisconnect`: Sets the player's `disconnected` flag to `true`. The player remains in the game and will be auto-folded if it becomes their turn.
- `onPlayerReconnect`: Sets the `disconnected` flag back to `false`. State is redistributed so they receive current game state.

## TV View

The TV view (`TVView.tsx`) renders:

- An **oval green table** with radial gradient (felt texture) and brown border.
- **Community cards** in the center, with face-down placeholders for undealt cards.
- **Total pot** display with chip stack visualization.
- **Player seats** arranged around the table (up to 8 positions).
- Each seat shows: player name, chip count, current bet (during active rounds), fold/all-in status.
- **Dealer button**: Gold "D" circle next to the dealer's seat.
- **Active player highlight**: Red border with glow effect on the current player's seat.
- **Turn indicator**: "[Name]'s turn" in the top-right corner.
- **Phase display**: Current phase in the top-left corner.
- **Showdown overlay**: When in showdown phase, a dark overlay at the bottom shows all hands, each player's hole cards, their hand description, and the winner highlighted in gold.

## Player View

The player view (`PlayerView.tsx`) renders:

- **Hole cards**: Player's two cards displayed prominently at the top (face-down if not yet dealt).
- **Community cards**: Smaller display of community cards.
- **Info bar**: Pot total, current bet, and the player's chip count.
- **Betting controls** (`BettingControls` component): Active only during the player's turn.
  - Fold, Check/Call, Bet/Raise buttons.
  - Raise slider for selecting bet amounts.
  - All-in button.

## Known Issues and Future Improvements

- **Betting UX**: Button label shows "Bet" when no prior bet exists and "Raise" when there is one; the distinction could be clearer.
- **No timer UI**: The backend tracks 30-second turn timeouts, but there is no visual countdown displayed on TV or player views.
- **No animations**: Card dealing, chip movements, and pot awards happen instantly.
- **No sound effects**.
- **Showdown reveal order**: Currently all hands are revealed simultaneously. Standard poker reveals in order: last aggressor first, then positionally.
- **No hand history**: No record of previous hands is kept or displayed.
- **No chat**.
- **No spectator mode**: Non-player viewers cannot watch without creating a room.
- **No tournament mode**: Currently plays as a cash game -- the game ends when one player has all chips. No blind level increases, no rebuy, no multi-table support.
- **Reconnection UX**: Server-side reconnection during game works correctly, but the client may not always restore the game view gracefully (e.g., the game page may show "Waiting for game to start" briefly).
- **Player elimination**: Eliminated players (0 chips) remain in the state array and are auto-folded each hand. They are not removed or given a spectator view.
