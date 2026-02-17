import { useEffect, useState, useCallback } from 'react';
import type { LobbyState, GameId } from '@parlor/shared';
import { useSocket } from './useSocket';

export function useRoom() {
  const { socket } = useSocket();
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.on('room:lobbyUpdate', setLobby);
    socket.on('room:error', (data) => setError(data.message));
    return () => {
      socket.off('room:lobbyUpdate', setLobby);
      socket.off('room:error');
    };
  }, [socket]);

  const createRoom = useCallback(
    () =>
      new Promise<string>((resolve) => {
        socket.emit('room:create', (response) => {
          resolve(response.roomCode);
        });
      }),
    [socket]
  );

  const joinRoom = useCallback(
    (roomCode: string, name: string, reconnectToken?: string) =>
      new Promise<{ success: boolean; playerId?: string; reconnectToken?: string; error?: string }>(
        (resolve) => {
          socket.emit(
            'room:join',
            { roomCode, playerName: name, reconnectToken },
            (response) => {
              if (response.success) {
                resolve({
                  success: true,
                  playerId: response.playerId,
                  reconnectToken: response.reconnectToken,
                });
              } else {
                resolve({ success: false, error: response.error });
              }
            }
          );
        }
      ),
    [socket]
  );

  const selectGame = useCallback(
    (gameId: GameId) => {
      socket.emit('lobby:selectGame', { gameId });
    },
    [socket]
  );

  const startGame = useCallback(() => {
    socket.emit('lobby:startGame');
  }, [socket]);

  const returnToLobby = useCallback(() => {
    socket.emit('lobby:returnToLobby');
  }, [socket]);

  return { lobby, error, createRoom, joinRoom, selectGame, startGame, returnToLobby };
}
