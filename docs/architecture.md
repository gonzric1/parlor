# Parlor Architecture

Parlor is a Jackbox-style multiplayer game platform. A shared TV screen displays the game board while players use their phones as controllers. Games are added as plugins.

## Monorepo Structure

Parlor uses **pnpm workspaces** with three packages:

```
parlor/
  packages/
    shared/    -> @parlor/shared   (types, utilities, protocol definitions)
    server/    -> @parlor/server   (Express + Socket.IO game server)
    client/    -> @parlor/client   (React SPA for TV and player views)
```

Workspace configuration in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

Both `server` and `client` depend on `shared` via the workspace protocol (`"@parlor/shared": "workspace:*"`).

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Runtime  | Node.js 22                          |
| Language | TypeScript (strict, ESM throughout) |
| Server   | Express 5, Socket.IO 4              |
| Client   | React 19, React Router 7, Vite 6    |
| Testing  | Vitest (server), Playwright (e2e)   |
| Package  | pnpm workspaces                     |

## How the Pieces Connect

### Production

The server builds to `packages/server/dist/` and the client builds to `packages/client/dist/`. The server's static middleware (`packages/server/src/middleware/static.ts`) detects the client dist directory at startup and serves it. The SPA fallback serves `index.html` for any route that doesn't match a static file, enabling client-side routing. Socket.IO requests (`/socket.io/*`) are excluded from the SPA fallback.

```
Browser  -->  Express (port 3000)  -->  Static files (client/dist/)
                                   -->  Socket.IO (WebSocket transport)
                                   -->  SPA fallback (index.html)
```

### Development

- **Server**: `tsx watch src/index.ts` provides auto-reload on file changes.
- **Client**: `vite` runs the Vite dev server (port 5174) with HMR.
- In dev mode, the client's Vite dev server proxies Socket.IO requests to the Express server. The server's static middleware returns `null` when `client/dist/` doesn't exist, so it doesn't interfere.

## The Plugin System

Games are added by implementing two interfaces and registering them on each side:

### Server Side

1. Implement `ServerGamePlugin` from `@parlor/shared` (see [game-plugin-contract.md](./game-plugin-contract.md)).
2. Register the plugin in `packages/server/src/index.ts`:

```typescript
import { registerGame } from './platform/game-registry.js';
import { myGamePlugin } from './games/my-game/index.js';

registerGame(myGamePlugin);
```

The game registry (`packages/server/src/platform/game-registry.ts`) is a `Map<GameId, ServerGamePlugin>` that stores all registered plugins. The platform queries it to list available games in the lobby, initialize game state, and route actions to the correct plugin.

### Client Side

1. Create a `ClientGamePlugin` with `TVView` and `PlayerView` React components.
2. Add the plugin to the registry in `packages/client/src/games/registry.ts`:

```typescript
export const gameRegistry: Record<string, ClientGamePlugin> = {
  'my-game': myGamePlugin,
};
```

The `GamePage` component looks up the plugin by `gameId` from the registry and renders either the `TVView` or `PlayerView` component based on the route (TV or player).

### Client Routing

The single React SPA uses role-based routing:

| Route              | Purpose                        |
|--------------------|--------------------------------|
| `/`                | Join page (player entry point) |
| `/tv`              | TV lobby (creates room)        |
| `/tv/:roomCode`    | TV game view                   |
| `/play/:roomCode`  | Player controller view         |

The `GamePage` component receives a `role` prop (`"tv"` or `"player"`) and renders the appropriate game view component.
