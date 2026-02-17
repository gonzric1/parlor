export type PlayerId = string;
export type RoomCode = string;
export type GameId = string;
export type ReconnectToken = string;

export type RoomPhase = 'waiting' | 'configuring' | 'playing' | 'results';

export interface Player {
  id: PlayerId;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface Room {
  code: RoomCode;
  phase: RoomPhase;
  players: Player[];
  hostId: PlayerId;
  selectedGameId: GameId | null;
  gameSettings: Record<string, unknown>;
}

export interface LobbyState {
  roomCode: RoomCode;
  phase: RoomPhase;
  players: Player[];
  hostId: PlayerId;
  selectedGameId: GameId | null;
  availableGames: GameMeta[];
  gameSettings: Record<string, unknown>;
}

export interface GameMeta {
  id: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}
