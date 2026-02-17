import { useEffect, useState } from 'react';
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
};

export function TVLobby() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { lobby, createRoom, selectGame, startGame } = useRoom();
  const [roomCode, setRoomCode] = useState<string | null>(null);

  useEffect(() => {
    createRoom().then((code) => {
      setRoomCode(code);
    });
  }, [createRoom]);

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

  if (!roomCode) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Creating room...</div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/?room=${roomCode}`;
  const players = lobby?.players ?? [];
  const selectedGameId = lobby?.selectedGameId ?? null;
  const availableGames = lobby?.availableGames ?? [];
  const minPlayers = availableGames.find((g) => g.id === selectedGameId)?.minPlayers ?? 2;
  const canStart = selectedGameId !== null && players.length >= minPlayers;

  return (
    <div style={styles.container}>
      <div style={styles.title}>Join at</div>
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
