import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import { getGameStateCache } from './useSocket';

export function useGameState() {
  const { socket } = useSocket();
  const cache = getGameStateCache();
  const [publicState, setPublicState] = useState<unknown>(cache.publicState);
  const [privateState, setPrivateState] = useState<unknown>(cache.privateState);

  useEffect(() => {
    const onPublic = (state: unknown) => setPublicState(state);
    const onPrivate = (state: unknown) => setPrivateState(state);

    socket.on('game:publicState', onPublic);
    socket.on('game:privateState', onPrivate);

    // Sync from cache in case state arrived before this component mounted
    const c = getGameStateCache();
    if (c.publicState !== null) setPublicState(c.publicState);
    if (c.privateState !== null) setPrivateState(c.privateState);

    return () => {
      socket.off('game:publicState', onPublic);
      socket.off('game:privateState', onPrivate);
    };
  }, [socket]);

  const sendAction = useCallback(
    (type: string, payload?: unknown) => {
      socket.emit('game:action', { type, payload });
    },
    [socket]
  );

  return { publicState, privateState, sendAction };
}
