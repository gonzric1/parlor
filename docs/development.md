# Development Guide

## Prerequisites

- **Node.js 22** (LTS)
- **pnpm** -- installed via [mise](https://mise.jdx.dev/) (formerly rtx)

Activate mise in your shell:

```bash
eval "$(mise activate zsh)"
```

## Install Dependencies

```bash
pnpm install
```

This installs all dependencies across the three workspace packages (`shared`, `server`, `client`) and links `@parlor/shared` into both `server` and `client` via the workspace protocol.

## Development Mode

Start the dev servers:

```bash
pnpm dev
```

This runs all three packages' `dev` scripts in parallel (`pnpm -r --parallel dev`):

| Package  | Dev Command            | What It Does                                              |
|----------|------------------------|-----------------------------------------------------------|
| `shared` | (typically `tsc -w`)   | Watches and rebuilds shared types.                        |
| `server` | `tsx watch src/index.ts` | Runs the Express/Socket.IO server with auto-reload on file changes. |
| `client` | `vite`                 | Runs the Vite dev server with HMR.                        |

### Ports

- **Server**: `3000` (Express + Socket.IO)
- **Client dev server**: `5174` (Vite; port 5173 was already taken)

In dev mode, the Vite dev server handles the React app and proxies Socket.IO requests to the Express server on port 3000. The server's static middleware detects that `packages/client/dist/` doesn't exist and disables itself, so there's no conflict.

## Build

Build all packages for production:

```bash
pnpm build
```

This runs `pnpm -r build`, which builds each package in dependency order:

1. `shared` -- `tsc` (TypeScript compilation to `dist/`)
2. `server` -- `tsc` (TypeScript compilation to `dist/`)
3. `client` -- `vite build` (bundled to `dist/`)

## Test

### Unit Tests

```bash
pnpm test
```

Runs `pnpm -r test` across all packages:

- **Server**: `vitest run` -- unit tests for game engine functions (`packages/server/src/games/poker/__tests__/`).
- **Client**: No unit tests yet.

### End-to-End Tests (Playwright)

Playwright tests run against a **production build** on port 3000 (not the dev server):

```bash
pnpm build
bash scripts/restart-server.sh
npx playwright test tests/poker-animations.spec.ts
```

The `scripts/restart-server.sh` helper kills any existing server process and starts a fresh one from the production build.

Playwright tests create isolated browser contexts for TV and player views, join a room, start a game, and verify animations, UI state, and game flow. See `tests/poker-animations.spec.ts` for test helpers like `createRoomAndJoin`, `findActivePlayer`, and `advanceUntilPhaseChanges`.

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

The `Dockerfile` uses a multi-stage build:

1. **deps** -- Installs pnpm dependencies with `--frozen-lockfile`.
2. **build** -- Copies source and runs `pnpm build` for all three packages.
3. **production** -- Copies only built artifacts (`dist/` directories) and production dependencies. Runs `node packages/server/dist/index.js`.

The container exposes port `3000`. The `docker-compose.yml` maps it to host port `3000` with `NODE_ENV=production`.

## Project Structure

```
parlor/
  package.json              Root workspace config
  pnpm-workspace.yaml       Workspace packages definition
  Dockerfile                Multi-stage production build
  docker-compose.yml        Single-service compose file
  tsconfig.base.json        Shared TypeScript config
  packages/
    shared/
      src/
        types/
          platform.ts       Room, Player, LobbyState types
          game-plugin.ts    ServerGamePlugin interface
          protocol.ts       Socket.IO event types
        utils/
          room-codes.ts     Room code generation (no I/O chars)
    server/
      src/
        index.ts            Express + Socket.IO setup, plugin registration
        config.ts           Port, CORS, timeouts
        middleware/
          cors.ts           CORS configuration
          static.ts         Static file serving with SPA fallback
        platform/
          game-registry.ts  Plugin registration map
          room-manager.ts   Room state, join/leave/disconnect, state distribution
          socket-handler.ts Socket.IO event routing
          lobby.ts          Lobby phase transitions
        games/
          poker/            Texas Hold'em implementation
    client/
      src/
        App.tsx             Route definitions
        hooks/
          useSocket.ts      Singleton Socket.IO connection
          useRoom.ts        Room/lobby state and actions
          useGameState.ts   Game state subscription and action dispatch
        pages/
          JoinPage.tsx      Player entry point
          TVLobby.tsx       TV room creation and lobby display
          GamePage.tsx      Game view router (TV or player)
        games/
          registry.ts       Client plugin registry
          poker/            Poker TV and player views
```
