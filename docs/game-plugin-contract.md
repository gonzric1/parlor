# Game Plugin Contract

Every game in Parlor is a plugin that implements two interfaces: `ServerGamePlugin` (server-side logic) and `ClientGamePlugin` (client-side views). The platform handles rooms, connections, and state distribution; the plugin handles game rules.

## ServerGamePlugin Interface

Defined in `packages/shared/src/types/game-plugin.ts`. The interface is generic across seven type parameters:

```typescript
ServerGamePlugin<TState, TPublic, TPlayerPrivate, TPhase, TAction, TSettings, TPlayerResult>
```

### Properties

| Property       | Type               | Description                                                             |
|----------------|--------------------|-------------------------------------------------------------------------|
| `meta`         | `GameMeta`         | Game identity: `id`, `name`, `description`, `minPlayers`, `maxPlayers`. |
| `turnModel`    | `TurnModel`        | How turns work (see Turn Models below).                                 |
| `settingDefs`  | `GameSettingDef[]`  | Configurable settings shown in the lobby before game start.             |

### Methods

| Method                | Signature                                                  | Purpose                                                                                                 |
|-----------------------|------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `initialize`          | `(playerIds, settings) => TState`                          | Create the initial game state. Called once when the host starts the game.                                |
| `getStateViews`       | `(state) => { publicState, playerStates }`                 | Split full state into a public view (everyone sees) and per-player private views.                       |
| `getPhase`            | `(state) => TPhase`                                        | Return the current phase string for the platform to inspect.                                            |
| `getActivePlayerIds`  | `(state) => PlayerId[]`                                    | Return which player(s) can currently act. Empty array means no actions accepted.                        |
| `validateAction`      | `(state, action) => ActionResult`                          | Check whether an action is legal. Returns `{ valid: true }` or `{ valid: false, reason }`.              |
| `applyAction`         | `(state, action) => TState`                                | Apply a validated action and return the new state. Must be a pure function (no mutation).                |
| `getTimerDuration`    | `(state) => number \| null`                                | Return the timeout in ms for the current turn, or `null` for no timer.                                  |
| `onTimeout`           | `(state) => TState`                                        | Handle a turn timeout (e.g., auto-fold in poker). Returns new state.                                    |
| `checkGameOver`       | `(state) => GameResult \| null`                            | Check if the entire game is over. Returns result with winners and summary, or `null` to continue.       |
| `onPlayerDisconnect`  | `(state, playerId) => TState`                              | Handle a player disconnecting mid-game. Returns new state.                                              |
| `onPlayerReconnect`   | `(state, playerId) => TState`                              | Handle a player reconnecting. Returns new state.                                                        |

### GameAction

```typescript
interface GameAction<TAction = unknown> {
  playerId: PlayerId;
  type: string;
  payload: TAction;
}
```

The `playerId` is injected by the platform from the authenticated socket mapping. Clients only send `{ type, payload }`.

### ActionResult

```typescript
type ActionResult =
  | { valid: true }
  | { valid: false; reason: string };
```

### GameResult

```typescript
interface GameResult<TPlayerResult = unknown> {
  winners: PlayerId[];
  playerResults: Map<PlayerId, TPlayerResult>;
  summary: string;
}
```

### GameSettingDef

Settings displayed in the lobby configuration screen:

```typescript
interface GameSettingDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  default: unknown;
  options?: { label: string; value: unknown }[];  // for 'select' type
  min?: number;                                     // for 'number' type
  max?: number;                                     // for 'number' type
}
```

## ClientGamePlugin Interface

Defined in `packages/client/src/games/registry.ts`:

```typescript
interface ClientGamePlugin {
  meta: GameMeta;
  TVView: ComponentType<GameViewProps>;
  PlayerView: ComponentType<GameViewProps>;
}
```

### GameViewProps

Both view components receive the same props:

```typescript
interface GameViewProps {
  publicState: unknown;       // The public state from getStateViews()
  privateState: unknown;      // Per-player private state (null for TV)
  sendAction: (type: string, payload?: unknown) => void;
  roomCode: string;
  returnToLobby: () => void;
}
```

- **TVView**: Rendered on the shared screen at `/tv/:roomCode`. Displays the game board that all players can see. Does not receive `privateState` (it gets public state only). Should not have interactive controls (the TV is display-only).
- **PlayerView**: Rendered on each player's phone at `/play/:roomCode`. Shows the player's private information (e.g., hole cards) and interactive controls (e.g., betting buttons).

## Turn Models

```typescript
type TurnModel =
  | { type: 'sequential'; timeoutMs?: number }   // One player acts at a time
  | { type: 'simultaneous'; timeoutMs?: number }  // All players act at once
  | { type: 'mixed'; timeoutMs?: number };         // Game controls who acts
```

The `timeoutMs` sets the default per-turn timer. The plugin can also override this dynamically via `getTimerDuration()`.

## State Flow

Every game action follows this pipeline:

```
Client sends:     { type, payload }
                      |
Platform adds:    { type, payload, playerId }     (from socket mapping)
                      |
Plugin:           validateAction(state, action)
                      |
                  valid? ----no----> emit 'room:error' to sender
                      |
                     yes
                      |
Plugin:           applyAction(state, action)  -->  newState
                      |
Plugin:           getStateViews(newState)
                      |
                  { publicState, playerStates }
                      |
Platform:         emit 'game:publicState' to all sockets in room
                  emit 'game:privateState' to each player's socket
```

### Public vs. Private State

The `getStateViews()` method is the boundary between full server state and what clients see:

- **publicState**: Sent to every socket in the room (TV and all players). Contains information everyone should see: community cards, pot size, player chip counts, current phase, whose turn it is.
- **playerStates**: A `Map<PlayerId, TPlayerPrivate>`. Each entry is sent only to that player's socket. Contains information only that player should see: their hole cards, their private options.

The TV socket receives `publicState` only. Player sockets receive both `publicState` and their individual entry from `playerStates`.

## Adding a New Game: Step by Step

### 1. Define State Types

Create `packages/server/src/games/my-game/state.ts` with your game's state interface, phase enum, and action types.

### 2. Implement Game Engine

Create `packages/server/src/games/my-game/engine.ts` with pure functions for state transitions. Use `structuredClone()` for immutability.

### 3. Implement Action Handling

Create `packages/server/src/games/my-game/actions.ts` with `validateAction` and `applyAction` functions.

### 4. Create the Server Plugin

Create `packages/server/src/games/my-game/index.ts` that exports a `ServerGamePlugin` implementation wiring together the engine and actions.

### 5. Register the Server Plugin

In `packages/server/src/index.ts`:

```typescript
import { myGamePlugin } from './games/my-game/index.js';
registerGame(myGamePlugin);
```

### 6. Create Client Views

Create `packages/client/src/games/my-game/`:
- `TVView.tsx` -- Shared screen display
- `PlayerView.tsx` -- Phone controller
- `types.ts` -- Client-side type definitions for your public/private state
- `index.ts` -- Export a `ClientGamePlugin`

### 7. Register the Client Plugin

In `packages/client/src/games/registry.ts`:

```typescript
import { myGamePlugin } from './my-game/index';

export const gameRegistry: Record<string, ClientGamePlugin> = {
  poker: pokerPlugin,
  'my-game': myGamePlugin,
};
```

The game ID string must match between server and client registries.
