import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { useSocket } from '../hooks/useSocket';
import { QRCode } from '../components/QRCode';
import { PlayerList } from '../components/PlayerList';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minHeight: '100vh',
    padding: '40px',
    background: '#1a1a2e',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: '#eee',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: '2rem',
  },
  lobbyTitle: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '1rem',
    color: '#eee',
  },
  roomCode: {
    fontSize: '5rem',
    fontWeight: 900,
    letterSpacing: '0.3em',
    color: '#e94560',
    marginBottom: '1.5rem',
  },
  content: {
    display: 'flex',
    gap: '3rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  panel: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '24px',
    minWidth: '280px',
  },
  panelTitle: {
    fontSize: '1.2rem',
    fontWeight: 600,
    marginBottom: '1rem',
    color: '#888',
  },
  gameOption: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '2px solid #0f3460',
    background: '#1a1a2e',
    color: '#eee',
    cursor: 'pointer',
    marginBottom: '8px',
    width: '100%',
    textAlign: 'left' as const,
    fontSize: '1rem',
  },
  gameOptionSelected: {
    borderColor: '#e94560',
    background: '#0f3460',
  },
  startButton: {
    marginTop: '2rem',
    padding: '16px 48px',
    fontSize: '1.3rem',
    fontWeight: 700,
    borderRadius: '8px',
    border: 'none',
    background: '#e94560',
    color: '#eee',
    cursor: 'pointer',
  },
  startButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  landingOptions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
    width: '100%',
    maxWidth: '400px',
  },
  optionButton: {
    padding: '20px 24px',
    fontSize: '1.2rem',
    fontWeight: 700,
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    color: '#555',
    fontSize: '0.9rem',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#333',
  },
  input: {
    padding: '14px 16px',
    fontSize: '1.1rem',
    borderRadius: '8px',
    border: '2px solid #0f3460',
    background: '#16213e',
    color: '#eee',
    outline: 'none',
    textAlign: 'center' as const,
    letterSpacing: '0.2em',
    fontWeight: 700,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: '#e94560',
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    marginTop: '0.5rem',
  },
};

type TVMode = 'landing' | 'creating' | 'lobby';

export function TVLobby() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const { lobby, createRoom, observeRoom, selectGame, startGame } = useRoom();
  const [mode, setMode] = useState<TVMode>('landing');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [observeCode, setObserveCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Navigate to game view when game starts
  useEffect(() => {
    const handler = (data: { gameId: string }) => {
      if (roomCode) {
        navigate(`/tv/${roomCode}`, { state: { gameId: data.gameId } });
      }
    };
    socket.on('game:start', handler);
    return () => {
      socket.off('game:start', handler);
    };
  }, [socket, roomCode, navigate]);

  const handleCreateRoom = useCallback(async () => {
    setMode('creating');
    setError(null);
    const code = await createRoom();
    setRoomCode(code);
    setMode('lobby');
  }, [createRoom]);

  const handleObserve = useCallback(async () => {
    if (observeCode.length !== 4) return;
    setError(null);
    const result = await observeRoom(observeCode);
    if (result.success) {
      setRoomCode(observeCode);
      if (result.gameId) {
        // Game already in progress — go directly to game view
        navigate(`/tv/${observeCode}`, { state: { gameId: result.gameId } });
      } else {
        // Still in lobby — show lobby view
        setMode('lobby');
      }
    } else {
      setError(result.error ?? 'Room not found');
    }
  }, [observeCode, observeRoom, navigate]);

  // Landing screen
  if (mode === 'landing') {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Parlor</div>
        <div style={styles.subtitle}>TV Display</div>
        <div style={styles.landingOptions}>
          <button
            style={{
              ...styles.optionButton,
              background: '#e94560',
              color: '#fff',
              opacity: connected ? 1 : 0.4,
            }}
            disabled={!connected}
            onClick={handleCreateRoom}
          >
            Create New Game
          </button>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span>or</span>
            <div style={styles.dividerLine} />
          </div>

          <div>
            <input
              style={styles.input}
              placeholder="ROOM CODE"
              value={observeCode}
              maxLength={4}
              onChange={(e) => setObserveCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleObserve()}
            />
            <button
              style={{
                ...styles.optionButton,
                background: '#0f3460',
                color: '#eee',
                width: '100%',
                marginTop: '0.75rem',
                opacity: observeCode.length === 4 && connected ? 1 : 0.4,
              }}
              disabled={observeCode.length !== 4 || !connected}
              onClick={handleObserve}
            >
              Watch Existing Game
            </button>
            {error && <div style={styles.error}>{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Creating room
  if (mode === 'creating' || !roomCode) {
    return (
      <div style={styles.container}>
        <div style={styles.lobbyTitle}>Creating room...</div>
      </div>
    );
  }

  // Lobby view
  const joinUrl = `${window.location.origin}/?room=${roomCode}`;
  const players = lobby?.players ?? [];
  const selectedGameId = lobby?.selectedGameId ?? null;
  const availableGames = lobby?.availableGames ?? [];
  const minPlayers = availableGames.find((g) => g.id === selectedGameId)?.minPlayers ?? 2;
  const canStart = selectedGameId !== null && players.length >= minPlayers;

  return (
    <div style={styles.container}>
      <div style={styles.lobbyTitle}>Join at</div>
      <div style={styles.roomCode}>{roomCode}</div>
      <QRCode value={joinUrl} size={180} />
      <div style={{ marginTop: '2rem', ...styles.content }}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Players ({players.length})</div>
          <PlayerList players={players} />
        </div>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Game</div>
          {availableGames.map((game) => (
            <button
              key={game.id}
              style={{
                ...styles.gameOption,
                ...(selectedGameId === game.id ? styles.gameOptionSelected : {}),
              }}
              onClick={() => selectGame(game.id)}
            >
              {game.name}
            </button>
          ))}
          {availableGames.length === 0 && (
            <button
              style={{
                ...styles.gameOption,
                ...styles.gameOptionSelected,
              }}
              onClick={() => selectGame('poker')}
            >
              Texas Hold'em
            </button>
          )}
        </div>
      </div>
      <button
        style={{ ...styles.startButton, ...(canStart ? {} : styles.startButtonDisabled) }}
        disabled={!canStart}
        onClick={startGame}
      >
        Start Game
      </button>
    </div>
  );
}
