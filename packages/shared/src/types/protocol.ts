import type { PlayerId, RoomCode, GameId, LobbyState, ReconnectToken } from './platform.js';
import type { GameAction, GameResult } from './game-plugin.js';

// Client -> Server events
export interface ClientToServerEvents {
  'room:create': (
    callback: (response: { roomCode: RoomCode }) => void
  ) => void;

  'room:join': (
    data: { roomCode: RoomCode; playerName: string; reconnectToken?: ReconnectToken; persistentId?: string },
    callback: (response:
      | { success: true; playerId: PlayerId; reconnectToken: ReconnectToken }
      | { success: false; error: string }
    ) => void
  ) => void;

  'room:leave': () => void;

  'room:observe': (
    data: { roomCode: RoomCode },
    callback: (response:
      | { success: true; gameId: GameId | null }
      | { success: false; error: string }
    ) => void
  ) => void;

  'lobby:selectGame': (data: { gameId: GameId }) => void;
  'lobby:updateSettings': (data: { settings: Record<string, unknown> }) => void;
  'lobby:startGame': () => void;
  'lobby:returnToLobby': () => void;

  'game:action': (action: Omit<GameAction, 'playerId'>) => void;
}

// Server -> Client events
export interface ServerToClientEvents {
  'room:lobbyUpdate': (lobby: LobbyState) => void;
  'game:start': (data: { gameId: GameId }) => void;
  'game:publicState': (state: unknown) => void;
  'game:privateState': (state: unknown) => void;
  'game:over': (result: { winners: string[]; playerResults: Record<string, unknown>; summary: string }) => void;
  'game:roundStart': (data: { roundNumber: number }) => void;
  'room:playerConnectionChange': (data: { playerId: PlayerId; connected: boolean }) => void;
  'room:error': (data: { message: string }) => void;
}
