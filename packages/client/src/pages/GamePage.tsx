import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useGameState } from '../hooks/useGameState';
import { useRoom } from '../hooks/useRoom';
import { gameRegistry } from '../games/registry';

interface GamePageProps {
  role: 'tv' | 'player';
}

export function GamePage({ role }: GamePageProps) {
  const { roomCode } = useParams<{ roomCode: string }>();
  const location = useLocation();
  const { socket } = useSocket();
  const { publicState, privateState, sendAction } = useGameState();
  const { lobby, returnToLobby } = useRoom();
  const [gameId, setGameId] = useState<string | null>(
    (location.state as { gameId?: string } | null)?.gameId ?? null
  );

  useEffect(() => {
    const handler = (data: { gameId: string }) => {
      setGameId(data.gameId);
    };
    socket.on('game:start', handler);
    return () => {
      socket.off('game:start', handler);
    };
  }, [socket]);

  useEffect(() => {
    if (lobby?.selectedGameId && !gameId) {
      setGameId(lobby.selectedGameId);
    }
  }, [lobby, gameId]);

  if (!gameId || !publicState) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#1a1a2e',
          color: '#eee',
          fontSize: '1.5rem',
        }}
      >
        Waiting for game to start...
      </div>
    );
  }

  const plugin = gameRegistry[gameId];
  if (!plugin) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#1a1a2e',
          color: '#e94560',
          fontSize: '1.5rem',
        }}
      >
        Unknown game: {gameId}
      </div>
    );
  }

  const View = role === 'tv' ? plugin.TVView : plugin.PlayerView;

  return (
    <View
      publicState={publicState}
      privateState={privateState}
      sendAction={sendAction}
      roomCode={roomCode ?? ''}
      returnToLobby={returnToLobby}
    />
  );
}
