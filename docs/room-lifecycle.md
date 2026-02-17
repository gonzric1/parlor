# Room and Lobby Lifecycle

Room management is handled by `packages/server/src/platform/room-manager.ts` with lobby state transitions in `packages/server/src/platform/lobby.ts`.

## Room Phases

```
waiting  -->  configuring  -->  playing  -->  showdown/results
                  ^                                |
                  |________________________________|
                          (return to lobby)
```

| Phase         | Description                                                    |
|---------------|----------------------------------------------------------------|
| `waiting`     | Room created, no game selected. Players can join.              |
| `configuring` | A game has been selected. Host can adjust settings and start.  |
| `playing`     | Game is in progress. New players cannot join (reconnect only). |
| `results`     | Game over. Host can return to lobby.                           |

Phase transitions are handled by pure functions in `lobby.ts`:

- `selectGame(room, gameId)` -- `waiting` or `configuring` to `configuring`. Populates `gameSettings` with defaults from the plugin's `settingDefs`.
- `updateSettings(room, settings)` -- Only during `configuring`. Merges new settings into existing ones.
- `canStart(room)` -- Checks: game selected, connected player count within `minPlayers`..`maxPlayers`.
- `startGame(room)` -- `configuring` to `playing`.
- `returnToLobby(room)` -- Back to `configuring` if a game was previously selected, otherwise `waiting`.

## Room Codes

Room codes are 4 uppercase characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ`. The letters **I** and **O** are excluded to avoid ambiguity with the digits 1 and 0.

Generation is in `packages/shared/src/utils/room-codes.ts`. Codes are re-rolled if they collide with an existing room.

## Host Management

- **First player** to join a room becomes the host. The TV socket is not a player and is not the host.
- **Host privileges**: select game, update settings, start game, return to lobby.
- **Voluntary leave**: If the host leaves (`room:leave`), the next connected player becomes host immediately. If no connected players exist, the first player in the list becomes host.
- **Disconnect with transfer**: If the host disconnects (socket drop, not explicit leave), a **30-second timer** starts. After 30 seconds, if the host is still disconnected, host status transfers to the next connected player. The player's identity is preserved for reconnection.

## TV Socket

The TV socket (`/tv` route) creates the room via `room:create`. The socket is:

- Added to the Socket.IO room so it receives all broadcasts (`lobbyUpdate`, `publicState`, etc.).
- Tracked in a separate `socketToRoom` map (not `socketToPlayer`).
- **Not a player entity**: it does not appear in the players list and has no `playerId`.
- Acts on behalf of the host for lobby operations. When the TV socket emits `lobby:selectGame` or `lobby:startGame`, the platform's `getPlayerMapping()` looks up the TV socket's room, finds the current host, and uses the host's `playerId` for authorization. This means the TV can only perform actions the host is authorized to do.

This design avoids creating a phantom player for the TV display.

## Reconnection

### Token Flow

1. On successful `room:join`, the server generates a `reconnectToken` (UUID) and returns it to the client.
2. The client stores the token in `sessionStorage`.
3. On page reload or reconnect, the client sends the stored token with `room:join`.
4. The server looks up the token in `reconnectTokens` map, finds the matching `roomCode` and `playerId`, and restores the player's connection.

### Reconnection During Game

When a player reconnects during an active game (`phase === 'playing'`):

1. The player's `connected` flag is set to `true`.
2. The plugin's `onPlayerReconnect(state, playerId)` is called, returning new state.
3. Game state is redistributed (public + private) so the reconnecting player gets the current state.
4. A `room:playerConnectionChange` event is broadcast.

### Disconnection During Game

When a player disconnects during an active game:

1. The player's `connected` flag is set to `false` (player is **not** removed).
2. The plugin's `onPlayerDisconnect(state, playerId)` is called.
3. Game state is redistributed.
4. A `room:playerConnectionChange` event is broadcast.
5. Host transfer timer starts if the disconnected player was the host (30 seconds).

## Room Cleanup

When all players in a room are disconnected, a **5-minute cleanup timer** starts (`config.roomTimeout = 5 * 60 * 1000`).

- If any player reconnects before the timer fires, it is cancelled.
- When the timer fires, the room is destroyed: all timers are cleared, all reconnect tokens for the room are deleted, and the room is removed from the rooms map.

If a player explicitly leaves (`room:leave`) and is the last player, the same 5-minute cleanup timer starts. Explicit leave removes the player entirely (no reconnection possible), unlike disconnect which preserves the player for reconnection.
