import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let db: Database.Database;

export function initDatabase(): void {
  const dataDir = path.resolve('data');
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(path.join(dataDir, 'parlor.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      persistent_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won INTEGER NOT NULL DEFAULT 0,
      total_chips_won INTEGER NOT NULL DEFAULT 0,
      total_chips_lost INTEGER NOT NULL DEFAULT 0,
      biggest_pot_won INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persistent_id TEXT NOT NULL REFERENCES players(persistent_id),
      game_id TEXT NOT NULL,
      room_code TEXT NOT NULL,
      placement INTEGER NOT NULL,
      chips_start INTEGER NOT NULL,
      chips_end INTEGER NOT NULL,
      net_chips INTEGER NOT NULL,
      hands_played INTEGER NOT NULL,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function upsertPlayer(persistentId: string, displayName: string): void {
  const stmt = db.prepare(`
    INSERT INTO players (persistent_id, display_name)
    VALUES (?, ?)
    ON CONFLICT(persistent_id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = datetime('now')
  `);
  stmt.run(persistentId, displayName);
}

export interface GameResultInput {
  persistentId: string;
  gameId: string;
  roomCode: string;
  placement: number;
  chipsStart: number;
  chipsEnd: number;
  handsPlayed: number;
}

export const recordGameResult = (input: GameResultInput): void => {
  const net = input.chipsEnd - input.chipsStart;
  const won = net > 0 ? net : 0;
  const lost = net < 0 ? -net : 0;

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO game_results (persistent_id, game_id, room_code, placement, chips_start, chips_end, net_chips, hands_played)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.persistentId, input.gameId, input.roomCode, input.placement, input.chipsStart, input.chipsEnd, net, input.handsPlayed);

    db.prepare(`
      UPDATE players SET
        games_played = games_played + 1,
        games_won = games_won + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
        total_chips_won = total_chips_won + ?,
        total_chips_lost = total_chips_lost + ?,
        updated_at = datetime('now')
      WHERE persistent_id = ?
    `).run(input.placement, won, lost, input.persistentId);
  });

  txn();
};

const ALLOWED_SORT_COLUMNS = new Set([
  'games_won', 'games_played', 'total_chips_won', 'biggest_pot_won',
]);

export interface LeaderboardEntry {
  persistentId: string;
  displayName: string;
  gamesPlayed: number;
  gamesWon: number;
  totalChipsWon: number;
  totalChipsLost: number;
  biggestPotWon: number;
}

export function getLeaderboard(
  sort: string = 'games_won',
  limit: number = 50,
): LeaderboardEntry[] {
  const column = ALLOWED_SORT_COLUMNS.has(sort) ? sort : 'games_won';
  const clampedLimit = Math.min(Math.max(1, limit), 100);

  const rows = db.prepare(`
    SELECT persistent_id, display_name, games_played, games_won,
           total_chips_won, total_chips_lost, biggest_pot_won
    FROM players
    WHERE games_played > 0
    ORDER BY ${column} DESC
    LIMIT ?
  `).all(clampedLimit) as any[];

  return rows.map((r) => ({
    persistentId: r.persistent_id,
    displayName: r.display_name,
    gamesPlayed: r.games_played,
    gamesWon: r.games_won,
    totalChipsWon: r.total_chips_won,
    totalChipsLost: r.total_chips_lost,
    biggestPotWon: r.biggest_pot_won,
  }));
}

export function getPlayerStats(persistentId: string): LeaderboardEntry | null {
  const row = db.prepare(`
    SELECT persistent_id, display_name, games_played, games_won,
           total_chips_won, total_chips_lost, biggest_pot_won
    FROM players
    WHERE persistent_id = ?
  `).get(persistentId) as any | undefined;

  if (!row) return null;

  return {
    persistentId: row.persistent_id,
    displayName: row.display_name,
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    totalChipsWon: row.total_chips_won,
    totalChipsLost: row.total_chips_lost,
    biggestPotWon: row.biggest_pot_won,
  };
}
