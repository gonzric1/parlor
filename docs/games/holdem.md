# Texas Hold'em Poker

Implementation in `packages/server/src/games/poker/` (server) and `packages/client/src/games/poker/` (client).

**Current status**: Playable with 2-8 players. Animated TV display with responsive scaling.

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
dealing --> pre-flop --> flop --> turn --> river --> winner-decide* --> showdown
                                                                          |
                                                               (5s delay, new hand)
```

*`winner-decide` only occurs on last-player-standing (fold) wins. Multi-player showdowns skip directly to `showdown`.

| Phase           | Community Cards | Description                                                       |
|-----------------|----------------|-------------------------------------------------------------------|
| `dealing`       | 0              | Transient phase during initialization.                            |
| `pre-flop`      | 0              | Blinds posted, hole cards dealt. Betting round.                   |
| `flop`          | 3              | Three community cards revealed. Betting round.                    |
| `turn`          | 4              | Fourth community card. Betting round.                             |
| `river`         | 5              | Fifth community card. Betting round.                              |
| `winner-decide` | 0-5            | Fold-win: winner has 5s to reveal or muck cards.                  |
| `showdown`      | 5              | Hands evaluated, pots awarded, results displayed.                 |

## Actions

| Action   | Payload          | When Legal                                                           |
|----------|------------------|----------------------------------------------------------------------|
| `fold`   | none             | Always (when it's your turn, during betting phases).                 |
| `check`  | none             | When there is no bet to call (current bet matches yours).            |
| `call`   | none             | When there is a bet to call. Puts in the minimum to match.           |
| `raise`  | `{ amount }`     | `amount` is the total bet level. Must be at least `minRaise` above the highest bet. |
| `all-in` | none             | When you have chips remaining. Puts all chips in.                    |
| `reveal` | none             | Only during `winner-decide` phase, only for the winning player.      |

Validation rules (in `actions.ts`):
- Only the active player can act.
- Folded or all-in players cannot act.
- `check` fails if there is an outstanding bet.
- `call` fails if there is nothing to call (use `check`).
- `raise` amount must be at least `minRaise` above the current highest bet, unless going all-in.
- `raise` cannot exceed the player's total chips.
- `reveal` is only valid during `winner-decide` phase for the active player (the winner).

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
  mucked: boolean;              // Whether the winner chose to muck cards (fold-win only)
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
  lastAction: PokerActionType | 'bet' | null;  // Last action taken this round
}
```

The `lastAction` field tracks what each player last did. For raises when no prior bet exists (`maxBet === 0`), it is set to `'bet'` instead of `'raise'` so the UI can display "bet 40" vs "raise 80".

### Public State (sent to all)

Contains: phase, handNumber, community cards, total pot, round bets, current highest bet, active player ID, dealer index, min raise, player list (id, name, chips, currentBet, folded, allIn, connected, lastAction), showdown info (if applicable).

### Private State (sent to each player)

Contains only: `playerId` and `holeCards`.

### Showdown Info (in public state)

When phase is `showdown` or `winner-decide`, the public state includes:

```typescript
showdown: {
  playerHands: { id, name, holeCards, handDescription }[];  // Empty if mucked
  winners: string[];          // IDs of winning players
  winnerDescription: string;  // e.g. "Alice wins with Full House" or "Alice wins!"
}
```

During `winner-decide`, `playerHands` is always empty and `winnerDescription` is just `"{name} wins!"`. After the winner decides:
- **Muck** (default/timeout): `playerHands` stays empty, description is `"{name} wins!"`
- **Reveal**: `playerHands` is populated with the winner's cards, description includes hand name.

## Muck or Reveal (Fold-Win Flow)

When all other players fold, the last-player-standing flow is:

1. Pots are awarded to the winner immediately.
2. Phase transitions to `winner-decide` (not directly to `showdown`).
3. The winner becomes the active player with a 5-second timer.
4. A lightweight showdown overlay appears on TV: `"{name} wins!"` with no cards.
5. The winner's phone shows a "Reveal Cards" button and a "Cards will be mucked in 5s..." message.
6. If the winner taps "Reveal": `mucked = false`, phase transitions to `showdown` with cards visible.
7. If the timer expires: `mucked = true`, phase transitions to `showdown` with cards hidden.
8. The 5-second showdown display timer then starts, followed by the new hand.

The room manager (`room-manager.ts`) handles the `winner-decide` timer via a `gameTimer` field on the room state. It calls the plugin's `onTimeout()` when the timer fires, then processes the resulting `showdown` phase normally.

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
   - Player state is reset (bets cleared, folded/allIn/lastAction reset).
   - Eliminated players (0 chips) are auto-folded rather than removed.
   - Dealer rotates, new deck is shuffled, blinds are posted, hole cards are dealt.
   - Phase returns to `pre-flop`.

For fold-wins, the total time is up to **10 seconds** (5s winner-decide + 5s showdown display).

If only one player remains with chips at showdown, `checkGameOver()` returns a `GameResult` and the game ends entirely.

## Timeout

- Each turn has a 30-second timeout (`getTimerDuration()` returns `30000` during active play).
- `winner-decide` phase has a 5-second timeout (`getTimerDuration()` returns `5000`).
- `onTimeout()` auto-folds during betting phases, auto-mucks during `winner-decide`.
- During `showdown` and `dealing` phases, the timer is disabled (`null`).

## Disconnect/Reconnect

- `onPlayerDisconnect`: Sets the player's `disconnected` flag to `true`. The player remains in the game and will be auto-folded if it becomes their turn.
- `onPlayerReconnect`: Sets the `disconnected` flag back to `false`. State is redistributed so they receive current game state.

## TV View

The TV view (`TVView.tsx`) uses a **scale-to-fit** approach for responsive display:

- The game area is designed at a fixed reference size (960x620px).
- A `useScaleToFit` hook uses `ResizeObserver` to compute `scale = Math.min(windowW / DESIGN_W, windowH / DESIGN_H)`.
- The entire game area (table, seats, overlay) is wrapped in a div with `transform: scale(scale)`.
- This ensures the table fills any screen size (laptop, TV, projector) while preserving aspect ratio.

### Visual Elements

- **Oval green table** with radial gradient (felt texture), brown border, drop shadow.
- **Community cards** in the center with flip animations (spring physics, staggered on flop).
- **Total pot** display with animated counter (smooth number transitions).
- **Player seats** arranged around the table (8 fixed positions with absolute offsets).
- Each seat shows: player name, chip count, fold/all-in status.
- **Bet badge** above each player's card: shows last action + amount (e.g. "call 20", "raise 80", "bet 40").
- **Dealer button**: Gold "D" circle, animated between seats using `layoutId`.
- **Active player glow**: Red border with pulsing box-shadow animation.
- **Winner glow**: Gold pulsing box-shadow during showdown.
- **Deal animation**: Face-down cards fly into each seat in deal order (staggered timing).
- **Chip fly animation**: Chips animate from player seats toward the pot area on bets.
- **Showdown overlay**: Dark panel at bottom with winner description, revealed hands, and card components.
- **Phase display**: Top-left corner. **Turn indicator**: Top-right corner (hidden during showdown).

### Animation Hooks

| Hook                  | File                          | Purpose                                               |
|-----------------------|-------------------------------|-------------------------------------------------------|
| `usePokerAnimations`  | `hooks/usePokerAnimations.ts` | Detects bet events by diffing player states.          |
| `useAnimatedCounter`  | `hooks/useAnimatedCounter.ts` | Smooth number transition for pot display.             |
| `useDealAnimation`    | `hooks/useDealAnimation.ts`   | Tracks which players have been "dealt" cards.         |
| `usePrevious`         | `hooks/usePrevious.ts`        | Generic hook returning the previous value of a prop.  |

## Player View

The player view (`PlayerView.tsx`) uses **viewport-relative sizing** for phone responsiveness:

- Container fills `100dvh x 100vw` (using `dvh` for mobile browser chrome).
- Flex column distributes space: hole cards expand to fill center, controls fixed at bottom.
- Padding uses `max()` and viewport units. Bottom area respects `safe-area-inset-bottom` for notched phones.
- Max width capped at 600px for tablets.

### Visual Elements

- **Phase indicator**: Uppercase text at top.
- **Hole cards**: Large cards centered in the flex-grow area. Cards use `clamp()` for responsive sizing (80-140px wide).
- **Community cards**: Smaller cards in a row below hole cards.
- **Info bar**: Pot total, current bet, and player's chip count.
- **Betting controls** (`BettingControls.tsx`): Active only during the player's turn.
  - Fold, Check/Call, Bet/Raise, All-in buttons with responsive padding/font sizing.
  - Raise slider with numeric input for precise amounts.
- **Winner-decide UI**: When the player wins by fold, shows "You win!" text, "Cards will be mucked in 5s..." countdown message, and a "Reveal Cards" button.
- **Waiting message**: "Waiting for your turn..." when it's not the player's turn.

### Card Sizing

The `Card` component (`components/Card.tsx`) uses `clamp()` for all three sizes:

| Size   | Width                    | Height                    | Font                        |
|--------|--------------------------|---------------------------|-----------------------------|
| small  | `clamp(36px, 5vw, 50px)` | `clamp(50px, 7vw, 70px)` | `clamp(0.6rem, 1.2vw, 0.8rem)` |
| medium | `clamp(44px, 6vw, 64px)` | `clamp(62px, 8.5vw, 90px)` | `clamp(0.7rem, 1.5vw, 1rem)` |
| large  | `clamp(80px, 28vw, 140px)` | `clamp(112px, 40vw, 196px)` | `clamp(1.2rem, 5vw, 2rem)` |

`small` is used on the TV (seats, community cards, showdown). `large` is used for the player's hole cards on their phone.

## Client File Structure

```
packages/client/src/games/poker/
  types.ts                          Client-side type definitions
  TVView.tsx                        TV display component (scale-to-fit)
  PlayerView.tsx                    Phone controller component (viewport-responsive)
  components/
    Card.tsx                        Playing card (face-up/face-down, 3 sizes)
    ChipStack.tsx                   Chip icon + amount display
    BettingControls.tsx             Fold/Check/Call/Raise/All-in controls
    AnimatedPlayerSeat.tsx          Player seat with glow, deal, showdown animations
    AnimatedCommunityCards.tsx      Community cards with flip-in animation
    ShowdownOverlay.tsx             Winner announcement overlay
    ChipFlyAnimation.tsx            Chip-to-pot fly animation
  hooks/
    usePokerAnimations.ts           Bet event detection
    useAnimatedCounter.ts           Smooth number transitions
    useDealAnimation.ts             Deal sequence tracking
  utils/
    dealOrder.ts                    Compute deal order from dealer position
```

## Server File Structure

```
packages/server/src/games/poker/
  state.ts          Type definitions (PokerState, PokerPlayer, Card, phases, actions)
  engine.ts         Pure functions: deck, deal, blinds, pots, showdown, hand evaluation
  actions.ts        validateAction and applyAction (fold, check, call, raise, all-in, reveal)
  index.ts          ServerGamePlugin implementation wiring engine + actions
  __tests__/
    engine.test.ts  Unit tests for engine functions
```

## Known Issues and Future Improvements

- **No timer UI**: The backend tracks timeouts, but there is no visual countdown on TV or player views.
- **No sound effects**.
- **Showdown reveal order**: Currently all hands are revealed simultaneously. Standard poker reveals in order: last aggressor first, then positionally.
- **No hand history**: No record of previous hands is kept or displayed.
- **No chat**.
- **No spectator mode**: Non-player viewers cannot watch without creating a room.
- **No tournament mode**: Currently plays as a cash game. No blind level increases, no rebuy, no multi-table support.
- **Player elimination**: Eliminated players (0 chips) remain in the state array and are auto-folded each hand. They are not removed or given a spectator view.
