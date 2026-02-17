# Architectural Decisions

This document records key architectural decisions and their rationale.

## pnpm Workspaces

**Decision**: Use pnpm workspaces with three packages (`shared`, `server`, `client`).

**Rationale**: pnpm provides strict dependency isolation -- each package only has access to its declared dependencies, preventing phantom dependency issues common with npm. The workspace protocol (`"@parlor/shared": "workspace:*"`) lets `server` and `client` depend on `shared` without publishing it. This keeps shared types in sync without manual copying or build-time code generation.

## Socket.IO

**Decision**: Use Socket.IO for all real-time communication instead of raw WebSockets.

**Rationale**: Socket.IO provides WebSocket transport with automatic fallback to long-polling, built-in room management (used for broadcasting to all sockets in a room), typed events (via `ClientToServerEvents`/`ServerToClientEvents` interfaces), acknowledgement callbacks (used by `room:create` and `room:join`), and automatic reconnection. These features would all need to be built from scratch with raw WebSockets.

## Single React SPA with Role-Based Routing

**Decision**: Use one React application for both the TV display and player controller, differentiated by routes.

**Rationale**: Simpler than maintaining two separate frontend applications. The TV and player views share the same Socket.IO connection logic, game state hooks, and type definitions. The `GamePage` component simply renders `TVView` or `PlayerView` based on the `role` prop derived from the route (`/tv/:roomCode` vs `/play/:roomCode`). Code splitting via dynamic imports could be added later if bundle size becomes a concern.

## phe for Hand Evaluation

**Decision**: Use the `phe` library for poker hand evaluation.

**Rationale**: `poker-evaluator-ts` was tried first but `phe` proved more reliable. The `phe` library implements the Two Plus Two lookup table algorithm for fast hand evaluation. A lower score from `evaluateCards()` indicates a better hand. The library is approximately 100KB, compared to `poker-evaluator-ts` which required a 130MB lookup table file.

## Immutable Game State

**Decision**: All game state transitions use `structuredClone()` and pure functions. The engine never mutates state in place.

**Rationale**: Immutability prevents subtle bugs from shared references. When `applyAction()` is called, it clones the state, applies changes to the clone, and returns it. This makes state transitions predictable and testable -- given the same state and action, the result is always the same. It also makes it safe to call `getStateViews()` at any point without worrying about the state being modified by a concurrent operation.

## TV is Not a Player

**Decision**: The TV socket creates the room and joins the Socket.IO room for broadcasts, but is not a player entity. It acts on behalf of the host for lobby operations.

**Rationale**: If the TV were a player, it would appear in the players list, count toward min/max player limits, and need to be handled in game logic. Instead, the TV socket is tracked in a separate `socketToRoom` map. When the TV emits lobby events (`lobby:selectGame`, `lobby:startGame`), the `getPlayerMapping()` function resolves the TV socket to the current host's player ID. This avoids a phantom player while still allowing the TV to trigger lobby actions. The TV receives `publicState` broadcasts because it has joined the Socket.IO room, but it never receives `privateState`.

## Auto-Select When Only One Game

**Decision**: If only one game plugin is registered, it is automatically selected when a room is created, transitioning the room directly to `configuring` phase.

**Rationale**: With a single game available, requiring the host to manually select it is unnecessary friction. The room skips the `waiting` phase and goes straight to `configuring` where the host can adjust settings and start. If more games are added later, the selection step will be shown automatically since `getAllGames().length` will be greater than 1.

## SPA Fallback

**Decision**: The server's static middleware tries `express.static` first, then falls back to serving `index.html` for any unmatched route.

**Rationale**: React Router handles client-side routing with paths like `/tv/ABCD` and `/play/ABCD`. When a user refreshes the page or navigates directly to one of these URLs, the server needs to return `index.html` so React Router can handle the route. The static middleware (`packages/server/src/middleware/static.ts`) reads `index.html` into memory at startup, attempts to serve a static file for each request, and falls back to the cached HTML if no file matches. Socket.IO requests (`/socket.io/*`) are skipped to avoid interfering with the WebSocket transport.

## State Distribution After Every Action

**Decision**: After every action (including timeouts and disconnect/reconnect events), the server calls `getStateViews()` and emits `game:publicState` to all sockets in the room plus `game:privateState` to each individual player socket.

**Rationale**: This ensures the TV and all players always have fresh, consistent state. The alternative -- sending incremental diffs -- would require tracking what each client has seen and building a diffing mechanism. Full state distribution is simpler and more reliable, especially given the small state sizes in card games. If a player reconnects mid-game, they automatically get the full current state on the next distribution cycle.
