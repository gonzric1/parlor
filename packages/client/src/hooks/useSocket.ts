import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@parlor/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

// Module-level cache for game state. Listeners are attached to the socket at
// creation time so events received during SPA navigation (between game:start
// triggering a route change and GamePage mounting) are never lost.
const gameStateCache = { publicState: null as unknown, privateState: null as unknown };

export function getGameStateCache() {
  return gameStateCache;
}

function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({ autoConnect: false }) as TypedSocket;
    // Eagerly cache game state so it's available even if useGameState
    // hasn't mounted yet (e.g. during SPA navigation after game:start)
    socket.on('game:publicState', (state: unknown) => { gameStateCache.publicState = state; });
    socket.on('game:privateState', (state: unknown) => { gameStateCache.privateState = state; });
    // Clear stale cache on disconnect so reconnections start fresh
    socket.on('disconnect', () => { gameStateCache.publicState = null; gameStateCache.privateState = null; });
  }
  return socket;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const s = getSocket();

  useEffect(() => {
    if (!s.connected) {
      s.connect();
    }

    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    if (s.connected) {
      setConnected(true);
    }

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [s]);

  return { socket: s, connected };
}
