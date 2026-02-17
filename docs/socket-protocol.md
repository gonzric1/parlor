# Socket.IO Event Protocol

All real-time communication in Parlor uses Socket.IO with typed events. The protocol is defined in `packages/shared/src/types/protocol.ts`.

## Design Principle

The platform never inspects game payloads. Game actions are an opaque `{ type, payload }` pair that the platform passes through to the game plugin's `validateAction` and `applyAction` methods. Game state views (`publicState`, `privateState`) are similarly opaque to the platform -- it distributes them without parsing. This makes the platform completely game-agnostic.

## Client to Server Events

### `room:create`

Creates a new room. Used by the TV screen.

```typescript
'room:create': (
  callback: (response: { roomCode: RoomCode }) => void
) => void;
```

- The TV socket is added to the Socket.IO room so it receives all broadcasts.
- The TV socket is **not** a player entity. It acts on behalf of the host for lobby operations (game select, start).
- If only one game plugin is registered, it is auto-selected on room creation.

### `room:join`

Joins an existing room as a player. Supports reconnection via token.

```typescript
'room:join': (
  data: { roomCode: RoomCode; playerName: string; reconnectToken?: ReconnectToken },
  callback: (response:
    | { success: true; playerId: PlayerId; reconnectToken: ReconnectToken }
    | { success: false; error: string }
  ) => void
) => void;
```

- On success, returns a `playerId` and `reconnectToken` (a UUID).
- The first player to join becomes the host.
- Joining fails if the room is in `playing` phase (unless reconnecting).
- Reconnection: if a valid `reconnectToken` is provided for the same room, the player's existing identity is restored and their `connected` flag is set back to `true`.

### `room:leave`

Player explicitly leaves the room.

```typescript
'room:leave': () => void;
```

- Removes the player from the room entirely.
- If the leaving player was the host, the next connected player becomes host.
- If no players remain, a 5-minute cleanup timer starts.

### `lobby:selectGame`

Host selects a game from the available list. Transitions room phase to `configuring`.

```typescript
'lobby:selectGame': (data: { gameId: GameId }) => void;
```

- Only the host can select a game. Non-host requests are silently ignored.

### `lobby:updateSettings`

Host updates game settings during the configuring phase.

```typescript
'lobby:updateSettings': (data: { settings: Record<string, unknown> }) => void;
```

- Only the host can update settings.
- Settings are merged (not replaced) with the current settings object.

### `lobby:startGame`

Host starts the game.

```typescript
'lobby:startGame': () => void;
```

- Only the host can start.
- The platform checks `canStart()`: a game must be selected, and the number of connected players must be within the plugin's `minPlayers`/`maxPlayers` range.
- On start: initializes the plugin with connected player IDs and settings, emits `game:start`, distributes initial state views, and broadcasts the updated lobby state.

### `lobby:returnToLobby`

Host returns the room to the lobby (configuring phase) after a game ends.

```typescript
'lobby:returnToLobby': () => void;
```

- Clears game state and plugin reference.
- Room phase returns to `configuring` if a game was selected, `waiting` otherwise.

### `game:action`

Player sends a game action during play.

```typescript
'game:action': (action: Omit<GameAction, 'playerId'>) => void;
```

- The `playerId` is **not** sent by the client. The platform injects it from the socket-to-player mapping, preventing spoofing.
- The payload structure (`{ type, payload }`) is game-specific. The platform passes it through to the plugin without inspection.

## Server to Client Events

### `room:lobbyUpdate`

Broadcast to all sockets in the room whenever lobby state changes.

```typescript
'room:lobbyUpdate': (lobby: LobbyState) => void;
```

Payload:

```typescript
interface LobbyState {
  roomCode: RoomCode;
  phase: RoomPhase;           // 'waiting' | 'configuring' | 'playing' | 'results'
  players: Player[];          // { id, name, connected, isHost }
  hostId: PlayerId;
  selectedGameId: GameId | null;
  availableGames: GameMeta[]; // All registered game plugins
  gameSettings: Record<string, unknown>;
}
```

### `game:start`

Broadcast when the host starts a game.

```typescript
'game:start': (data: { gameId: GameId }) => void;
```

### `game:publicState`

Broadcast to all sockets in the room after every state change.

```typescript
'game:publicState': (state: unknown) => void;
```

The payload is whatever the plugin's `getStateViews()` returns as `publicState`. The platform does not inspect it.

### `game:privateState`

Sent to individual player sockets after every state change.

```typescript
'game:privateState': (state: unknown) => void;
```

Each player receives only their own private state from the `playerStates` map.

### `game:over`

Broadcast when `checkGameOver()` returns a non-null result.

```typescript
'game:over': (result: {
  winners: string[];
  playerResults: Record<string, unknown>;
  summary: string;
}) => void;
```

Note: `playerResults` is serialized from a `Map` to a plain object for transport.

### `room:playerConnectionChange`

Broadcast when a player connects or disconnects.

```typescript
'room:playerConnectionChange': (data: {
  playerId: PlayerId;
  connected: boolean;
}) => void;
```

### `room:error`

Sent to a single socket when an action validation fails.

```typescript
'room:error': (data: { message: string }) => void;
```

## Connection Flow

### TV Screen

1. Connect socket.
2. Emit `room:create` -- receive `roomCode`.
3. Listen for `room:lobbyUpdate` to display the lobby.
4. When host starts game, listen for `game:start` and `game:publicState`.

### Player Phone

1. Connect socket.
2. Emit `room:join` with room code and name (and optionally `reconnectToken` from `sessionStorage`).
3. On success, store `reconnectToken` in `sessionStorage`.
4. Listen for `room:lobbyUpdate`, `game:start`, `game:publicState`, `game:privateState`.
5. Send `game:action` during play.

### Socket Identity Mapping

The server maintains three maps:

| Map                  | Key              | Value                           | Purpose                                         |
|----------------------|------------------|---------------------------------|-------------------------------------------------|
| `socketToPlayer`     | Socket ID        | `{ roomCode, playerId }`        | Map socket to authenticated player.             |
| `reconnectTokens`    | ReconnectToken   | `{ roomCode, playerId }`        | Restore identity on reconnect.                  |
| `socketToRoom`       | Socket ID        | `RoomCode`                      | Track TV sockets (not players) that created rooms. |

The `getPlayerMapping()` function checks `socketToPlayer` first, then falls back to `socketToRoom` (returning the host's ID for TV sockets). This allows the TV to act on behalf of the host for lobby operations like game selection and start.
