# CLAUDE.md

## Quick Reference

```bash
pnpm install          # Install all workspace dependencies
pnpm dev              # Start all dev servers (shared watch + server + client)
pnpm build            # Build all packages (shared -> server -> client)
pnpm test             # Run unit tests (vitest) across all packages
pnpm lint             # Lint all packages
```

### Server
```bash
cd packages/server
pnpm test             # vitest run
pnpm dev              # tsx watch src/index.ts (port 3000)
pnpm start            # node dist/index.js
```

### Client
```bash
cd packages/client
pnpm dev              # vite dev server (port 5174)
pnpm build            # vite build -> dist/
```

### E2E Tests (Playwright)
```bash
pnpm build
bash scripts/restart-server.sh    # Kill existing server, start fresh on port 3000
npx playwright test tests/poker-animations.spec.ts
```
Playwright runs against the **production build** on port 3000, not the dev server.

### Docker
```bash
docker compose up --build    # Multi-stage build, exposes port 3000
```

## Architecture

Parlor is a Jackbox-style multiplayer game platform. A TV screen displays the game board; players use phones as controllers. Games are plugins.

### Monorepo (pnpm workspaces)

```
packages/
  shared/   @parlor/shared   Types, protocol definitions (workspace:*)
  server/   @parlor/server   Express 5 + Socket.IO 4
  client/   @parlor/client   React 19 + React Router 7 + Vite 6
```

All three are ESM (`"type": "module"`). TypeScript strict mode throughout.

### Key Technologies

- **Server**: Express 5, Socket.IO 4, Vitest, `phe` (poker hand evaluation)
- **Client**: React 19, React Router 7, Vite 6, Framer Motion, socket.io-client
- **Testing**: Vitest (unit), Playwright (e2e)
- **Runtime**: Node.js 22

### Client Routing

| Route             | View                    |
|-------------------|-------------------------|
| `/`               | Join page (player)      |
| `/tv`             | TV lobby (creates room) |
| `/tv/:roomCode`   | TV game view            |
| `/play/:roomCode` | Player controller view  |

## Conventions

### Styling
- **All styling is inline JS objects** -- no CSS files, no CSS modules, no Tailwind.
- TV view: scale-to-fit (960x620 design size, `transform: scale()` via `useScaleToFit` hook).
- Player view: `100dvh` + flex layout for phone responsiveness.
- Card sizes use `clamp()` for responsive scaling.

### State Management
- Game state transitions use `structuredClone()` and pure functions -- never mutate state in place.
- After every action, server sends full `game:publicState` to room + `game:privateState` to each player.
- TV socket is not a player entity; it joins the Socket.IO room for broadcasts only.

### Game Plugin System

**Server** (`ServerGamePlugin` in `@parlor/shared`):
- Register in `packages/server/src/index.ts` via `registerGame()`.
- Implement: `initState`, `validateAction`, `applyAction`, `getStateViews`, `onTimeout`, etc.

**Client** (`ClientGamePlugin`):
- Register in `packages/client/src/games/registry.ts`.
- Provide `TVView` and `PlayerView` React components.

### Poker-Specific

- Phases: `dealing -> pre-flop -> flop -> turn -> river -> winner-decide* -> showdown`
- `winner-decide` phase: 5s timer, muck by default (only on fold-wins).
- `PokerPlayer.lastAction` tracks action type for bet badge display.
- `phe` library: lower score = better hand.
- Room manager has a `gameTimer` field for `winner-decide` timeout.

### Testing
- Test player objects in `engine.test.ts` must include `lastAction: null` and `mucked: false` in state.
- Playwright tests create isolated browser contexts for TV and player views.

## Key Files

| Purpose                  | Path                                              |
|--------------------------|---------------------------------------------------|
| Server entry             | `packages/server/src/index.ts`                    |
| Room management          | `packages/server/src/platform/room-manager.ts`    |
| Socket routing           | `packages/server/src/platform/socket-handler.ts`  |
| Game registry (server)   | `packages/server/src/platform/game-registry.ts`   |
| Poker engine (pure fns)  | `packages/server/src/games/poker/engine.ts`       |
| Poker actions            | `packages/server/src/games/poker/actions.ts`      |
| Poker state types        | `packages/server/src/games/poker/state.ts`        |
| Engine unit tests        | `packages/server/src/games/poker/__tests__/engine.test.ts` |
| Client app routes        | `packages/client/src/App.tsx`                     |
| Game registry (client)   | `packages/client/src/games/registry.ts`           |
| TV view                  | `packages/client/src/games/poker/TVView.tsx`      |
| Player view              | `packages/client/src/games/poker/PlayerView.tsx`  |
| Shared types             | `packages/shared/src/types/`                      |
| Protocol types           | `packages/shared/src/types/protocol.ts`           |
| Plugin interface         | `packages/shared/src/types/game-plugin.ts`        |

## Documentation

Detailed docs live in `docs/`:
- `architecture.md` -- system design and plugin system
- `development.md` -- dev setup, build, test, Docker
- `decisions.md` -- architectural decision records
- `game-plugin-contract.md` -- plugin interface details
- `socket-protocol.md` -- Socket.IO event reference
- `room-lifecycle.md` -- room state machine
- `games/holdem.md` -- poker implementation details
