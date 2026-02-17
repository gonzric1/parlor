import type { Room, RoomPhase, GameId, LobbyState, GameMeta } from '@parlor/shared';
import { getGame, getAllGames } from './game-registry.js';

export function selectGame(room: Room, gameId: GameId): Room {
  const plugin = getGame(gameId);
  if (!plugin) return room;
  return {
    ...room,
    selectedGameId: gameId,
    phase: 'configuring' as RoomPhase,
    gameSettings: Object.fromEntries(
      plugin.settingDefs.map(s => [s.key, s.default])
    ),
  };
}

export function updateSettings(room: Room, settings: Record<string, unknown>): Room {
  if (room.phase !== 'configuring') return room;
  return { ...room, gameSettings: { ...room.gameSettings, ...settings } };
}

export function canStart(room: Room): boolean {
  if (!room.selectedGameId) return false;
  const plugin = getGame(room.selectedGameId);
  if (!plugin) return false;
  const connected = room.players.filter(p => p.connected).length;
  return connected >= plugin.meta.minPlayers && connected <= plugin.meta.maxPlayers;
}

export function startGame(room: Room): Room {
  return { ...room, phase: 'playing' as RoomPhase };
}

export function returnToLobby(room: Room): Room {
  return {
    ...room,
    phase: room.selectedGameId ? 'configuring' : 'waiting',
  };
}

export function getLobbyState(room: Room): LobbyState {
  const availableGames: GameMeta[] = getAllGames().map(p => p.meta);
  return {
    roomCode: room.code,
    phase: room.phase,
    players: room.players,
    hostId: room.hostId,
    selectedGameId: room.selectedGameId,
    availableGames,
    gameSettings: room.gameSettings,
  };
}
