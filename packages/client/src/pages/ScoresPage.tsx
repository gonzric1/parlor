import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface LeaderboardEntry {
  persistentId: string;
  displayName: string;
  gamesPlayed: number;
  gamesWon: number;
  totalChipsWon: number;
  totalChipsLost: number;
  biggestPotWon: number;
}

type SortColumn = 'games_won' | 'games_played' | 'total_chips_won' | 'biggest_pot_won';

const styles = {
  container: {
    minHeight: '100vh',
    background: '#1a1a2e',
    color: '#eee',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  header: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
  },
  table: {
    width: '100%',
    maxWidth: '800px',
    borderCollapse: 'collapse' as const,
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #0f3460',
    fontSize: '0.85rem',
    color: '#aaa',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  },
  thActive: {
    color: '#e94560',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #0f3460',
    fontSize: '0.95rem',
  },
  rank: {
    fontWeight: 700,
    color: '#e94560',
    width: '40px',
  },
  name: {
    fontWeight: 600,
  },
  link: {
    color: '#e94560',
    textDecoration: 'none',
    fontWeight: 600,
    marginTop: '2rem',
    fontSize: '1rem',
  },
  loading: {
    color: '#888',
    marginTop: '2rem',
  },
  empty: {
    color: '#888',
    marginTop: '2rem',
    fontSize: '1.1rem',
  },
};

export function ScoresPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [sort, setSort] = useState<SortColumn>('games_won');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/scores?sort=${sort}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sort]);

  const columns: { key: SortColumn; label: string }[] = [
    { key: 'games_played', label: 'Played' },
    { key: 'games_won', label: 'Won' },
    { key: 'total_chips_won', label: 'Chips Won' },
    { key: 'biggest_pot_won', label: 'Best Pot' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>Leaderboard</div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : entries.length === 0 ? (
        <div style={styles.empty}>No games played yet. Be the first!</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Player</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ ...styles.th, ...(sort === col.key ? styles.thActive : {}) }}
                  onClick={() => setSort(col.key)}
                >
                  {col.label} {sort === col.key ? '▼' : ''}
                </th>
              ))}
              <th style={styles.th}>Win %</th>
              <th style={styles.th}>Net</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const winRate = entry.gamesPlayed > 0
                ? ((entry.gamesWon / entry.gamesPlayed) * 100).toFixed(0)
                : '0';
              const net = entry.totalChipsWon - entry.totalChipsLost;
              return (
                <tr key={entry.persistentId}>
                  <td style={{ ...styles.td, ...styles.rank }}>{i + 1}</td>
                  <td style={{ ...styles.td, ...styles.name }}>{entry.displayName}</td>
                  <td style={styles.td}>{entry.gamesPlayed}</td>
                  <td style={styles.td}>{entry.gamesWon}</td>
                  <td style={styles.td}>{entry.totalChipsWon.toLocaleString()}</td>
                  <td style={styles.td}>{entry.biggestPotWon.toLocaleString()}</td>
                  <td style={styles.td}>{winRate}%</td>
                  <td style={{ ...styles.td, color: net >= 0 ? '#4ade80' : '#e94560' }}>
                    {net >= 0 ? '+' : ''}{net.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Link to="/" style={styles.link}>← Back to Home</Link>
    </div>
  );
}
