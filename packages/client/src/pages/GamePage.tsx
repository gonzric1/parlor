import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const { publicState, privateState, sendAction } = useGameState();
  const { lobby, observeRoom, returnToLobby } = useRoom();
  const [gameId, setGameId] = useState<string | null>(
    (location.state as { gameId?: string } | null)?.gameId ?? null
  );
  const observeAttempted = useRef(false);

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

  // TV reconnection: auto-observe when mounting on /tv/:roomCode
  useEffect(() => {
    if (role !== 'tv' || !connected || !roomCode || observeAttempted.current) return;
    // If we already have a gameId from location.state, no need to observe
    if ((location.state as { gameId?: string } | null)?.gameId) return;

    observeAttempted.current = true;
    observeRoom(roomCode).then((result) => {
      if (result.success && result.gameId) {
        setGameId(result.gameId);
      } else if (result.success && !result.gameId) {
        // Room is in lobby, redirect to TV lobby
        navigate('/tv', { replace: true });
      } else {
        // Room not found or empty
        navigate('/tv', { replace: true });
      }
    });
  }, [role, connected, roomCode, location.state, observeRoom, navigate]);

  // Reset observe flag on socket reconnect so we re-observe
  useEffect(() => {
    if (!connected) {
      observeAttempted.current = false;
    }
  }, [connected]);

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
