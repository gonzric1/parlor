import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useGameState() {
  const { socket } = useSocket();
  const [publicState, setPublicState] = useState<unknown>(null);
  const [privateState, setPrivateState] = useState<unknown>(null);

  useEffect(() => {
    socket.on('game:publicState', setPublicState);
    socket.on('game:privateState', setPrivateState);
    return () => {
      socket.off('game:publicState', setPublicState);
      socket.off('game:privateState', setPrivateState);
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
