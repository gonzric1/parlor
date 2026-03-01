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
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalBox: {
    background: '#16213e',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '320px',
    width: '90%',
    textAlign: 'center' as const,
    color: '#eee',
  },
  modalText: {
    fontSize: '1rem',
    marginBottom: '20px',
    lineHeight: 1.5,
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  modalCancel: {
    padding: '10px 20px',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '2px solid #0f3460',
    background: 'transparent',
    color: '#eee',
    cursor: 'pointer',
  },
  modalConfirm: {
    padding: '10px 20px',
    fontSize: '1rem',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    background: '#e94560',
    color: '#eee',
    cursor: 'pointer',
  },
};

// Per-tab identity: sessionStorage overrides localStorage so multiple tabs
// can join as different players (useful for local testing).
function getPersistentId(): string {
  const sessionId = sessionStorage.getItem('parlor:persistentId');
  if (sessionId) return sessionId;

  let id = localStorage.getItem('parlor:persistentId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('parlor:persistentId', id);
  }
  return id;
}

function getOrCreateTabId(name: string): string {
  const savedName = sessionStorage.getItem('parlor:playerName');
  // If this tab already has its own identity, keep it
  const existing = sessionStorage.getItem('parlor:persistentId');
  if (existing && savedName === name) return existing;

  // If the name matches localStorage, share that identity
  const globalName = localStorage.getItem('parlor:playerName');
  if (name === globalName || !globalName) return getPersistentId();

  // Different name in this tab — mint a fresh per-tab identity
  const tabId = crypto.randomUUID();
  sessionStorage.setItem('parlor:persistentId', tabId);
  return tabId;
}

export function JoinPage() {
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get('room') ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const navigate = useNavigate();
  const { joinRoom } = useRoom();

  useEffect(() => {
    const room = searchParams.get('room');
    if (room) setRoomCode(room.toUpperCase());
  }, [searchParams]);

  useEffect(() => {
    getPersistentId();
    // Prefer per-tab name, fall back to global
    const savedName = sessionStorage.getItem('parlor:playerName')
      ?? localStorage.getItem('parlor:playerName');
    if (savedName) setName(savedName);
  }, []);

  const doJoin = async () => {
    if (!roomCode || !name) return;
    setJoining(true);
    setError(null);

    localStorage.setItem('parlor:playerName', name);
    sessionStorage.setItem('parlor:playerName', name);
    const persistentId = getOrCreateTabId(name);
    const tokenKey = `reconnectToken:${roomCode}`;
    const token = sessionStorage.getItem(tokenKey) ?? undefined;
    const result = await joinRoom(roomCode, name, token, persistentId);
    if (result.success && result.reconnectToken) {
      sessionStorage.setItem(tokenKey, result.reconnectToken);
      navigate(`/play/${roomCode}`, { state: { gameId: result.gameId } });
    } else {
      setError(result.error ?? 'Failed to join room');
    }
    setJoining(false);
  };

  const handleJoin = async () => {
    if (!roomCode || !name) return;
    const savedName = sessionStorage.getItem('parlor:playerName')
      ?? localStorage.getItem('parlor:playerName');
    if (savedName && savedName !== name) {
      setShowNameModal(true);
      return;
    }
    doJoin();
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
          <span style={{ color: '#888' }}> | </span>
          <Link to="/scores" style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}>
            Leaderboard
          </Link>
        </div>
      </div>

      {showNameModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalText}>
              Changing your name will update your identity on the leaderboard. Continue?
            </div>
            <div style={styles.modalButtons}>
              <button style={styles.modalCancel} onClick={() => setShowNameModal(false)}>
                Cancel
              </button>
              <button
                style={styles.modalConfirm}
                onClick={() => {
                  setShowNameModal(false);
                  doJoin();
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
