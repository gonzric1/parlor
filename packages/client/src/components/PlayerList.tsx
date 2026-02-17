import type { Player } from '@parlor/shared';

interface PlayerListProps {
  players: Player[];
}

const styles = {
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#1a1a2e',
    borderRadius: '6px',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  name: {
    fontSize: '1rem',
    color: '#eee',
  },
  host: {
    fontSize: '0.75rem',
    color: '#888',
    marginLeft: 'auto',
  },
};

export function PlayerList({ players }: PlayerListProps) {
  if (players.length === 0) {
    return <div style={{ color: '#888', padding: '8px 0' }}>Waiting for players...</div>;
  }

  return (
    <ul style={styles.list}>
      {players.map((player) => (
        <li key={player.id} style={styles.item}>
          <div
            style={{
              ...styles.indicator,
              background: player.connected ? '#4caf50' : '#888',
            }}
          />
          <span style={styles.name}>{player.name}</span>
          {player.isHost && <span style={styles.host}>HOST</span>}
        </li>
      ))}
    </ul>
  );
}
