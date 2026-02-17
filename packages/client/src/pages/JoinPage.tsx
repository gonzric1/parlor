import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    background: '#1a1a2e',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    marginBottom: '2rem',
    color: '#eee',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
    width: '100%',
    maxWidth: '320px',
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
  },
  button: {
    padding: '14px',
    fontSize: '1.1rem',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    background: '#e94560',
    color: '#eee',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  error: {
    color: '#e94560',
    fontSize: '0.9rem',
    textAlign: 'center' as const,
  },
};

export function JoinPage() {
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get('room') ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { joinRoom } = useRoom();

  useEffect(() => {
    const room = searchParams.get('room');
    if (room) setRoomCode(room.toUpperCase());
  }, [searchParams]);

  const handleJoin = async () => {
    if (!roomCode || !name) return;
    setJoining(true);
    setError(null);
    const token = sessionStorage.getItem('reconnectToken') ?? undefined;
    const result = await joinRoom(roomCode, name, token);
    if (result.success && result.reconnectToken) {
      sessionStorage.setItem('reconnectToken', result.reconnectToken);
      navigate(`/play/${roomCode}`);
    } else {
      setError(result.error ?? 'Failed to join room');
    }
    setJoining(false);
  };

  const canJoin = roomCode.length === 4 && name.length > 0 && !joining;

  return (
    <div style={styles.container}>
      <div style={styles.title}>Parlor</div>
      <div style={styles.form}>
        <input
          style={styles.input}
          placeholder="Room Code"
          value={roomCode}
          maxLength={4}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        />
        <input
          style={styles.input}
          placeholder="Your Name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          style={{ ...styles.button, ...(canJoin ? {} : styles.buttonDisabled) }}
          disabled={!canJoin}
          onClick={handleJoin}
        >
          {joining ? 'Joining...' : 'Join Game'}
        </button>
        {error && <div style={styles.error}>{error}</div>}
        <div style={{ marginTop: '1.5rem', textAlign: 'center' as const }}>
          <span style={{ color: '#888' }}>or </span>
          <Link to="/tv" style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}>
            Host a Game
          </Link>
        </div>
      </div>
    </div>
  );
}
