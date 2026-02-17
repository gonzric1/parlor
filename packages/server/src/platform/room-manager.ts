import type { Server, Socket } from 'socket.io';
import type {
  PlayerId, RoomCode, ReconnectToken, Room, Player,
  ServerGamePlugin, GameAction, ClientToServerEvents, ServerToClientEvents,
} from '@parlor/shared';
import { generateRoomCode } from '@parlor/shared';
import { config } from '../config.js';
import { getGame, getAllGames } from './game-registry.js';
import * as lobby from './lobby.js';
import { getLobbyState } from './lobby.js';
import crypto from 'node:crypto';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface RoomState {
  room: Room;
  gameState: unknown;
  gamePlugin: ServerGamePlugin | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  hostTransferTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<RoomCode, RoomState>();
const socketToPlayer = new Map<string, { roomCode: RoomCode; playerId: PlayerId }>();
const reconnectTokens = new Map<ReconnectToken, { roomCode: RoomCode; playerId: PlayerId }>();
// TV sockets that created rooms but aren't players
const socketToRoom = new Map<string, RoomCode>();

let io: TypedServer;

export function init(server: TypedServer): void {
  io = server;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function createRoom(tvSocketId?: string): RoomCode {
  let code: RoomCode;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const roomState: RoomState = {
    room: {
      code,
      phase: 'waiting',
      players: [],
      hostId: '',
      selectedGameId: null,
      gameSettings: {},
    },
    gameState: null,
    gamePlugin: null,
    cleanupTimer: null,
    hostTransferTimer: null,
  };
  rooms.set(code, roomState);
  if (tvSocketId) {
    socketToRoom.set(tvSocketId, code);
  }

  // Auto-select if only one game is registered
  const allGames = getAllGames();
  if (allGames.length === 1) {
    roomState.room = lobby.selectGame(roomState.room, allGames[0].meta.id);
  }

  return code;
}

export function joinRoom(
  roomCode: RoomCode,
  playerName: string,
  socket: TypedSocket,
  reconnectToken?: ReconnectToken,
): { success: true; playerId: PlayerId; reconnectToken: ReconnectToken } | { success: false; error: string } {
  const state = rooms.get(roomCode);
  if (!state) return { success: false, error: 'Room not found' };

  // Reconnect
  if (reconnectToken) {
    const mapping = reconnectTokens.get(reconnectToken);
    if (mapping && mapping.roomCode === roomCode) {
      const player = state.room.players.find(p => p.id === mapping.playerId);
      if (player) {
        player.connected = true;
        socketToPlayer.set(socket.id, { roomCode, playerId: player.id });
        socket.join(roomCode);

        if (state.cleanupTimer) {
          clearTimeout(state.cleanupTimer);
          state.cleanupTimer = null;
        }

        // Reconnect into game if playing
        if (state.gamePlugin && state.gameState) {
          state.gameState = state.gamePlugin.onPlayerReconnect(state.gameState, player.id);
          distributeGameState(state);
        }

        broadcastLobby(state);
        io.to(roomCode).emit('room:playerConnectionChange', { playerId: player.id, connected: true });
        return { success: true, playerId: player.id, reconnectToken };
      }
    }
  }

  // New join
  if (state.room.phase === 'playing') {
    return { success: false, error: 'Game already in progress' };
  }

  const playerId = generateId();
  const token = crypto.randomUUID() as ReconnectToken;
  const isFirst = state.room.players.length === 0;

  const player: Player = {
    id: playerId,
    name: playerName,
    connected: true,
    isHost: isFirst,
  };

  state.room.players.push(player);
  if (isFirst) state.room.hostId = playerId;

  socketToPlayer.set(socket.id, { roomCode, playerId });
  reconnectTokens.set(token, { roomCode, playerId });
  socket.join(roomCode);

  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  broadcastLobby(state);
  return { success: true, playerId, reconnectToken: token };
}

export function leaveRoom(socketId: string): void {
  const mapping = socketToPlayer.get(socketId);
  if (!mapping) return;

  const state = rooms.get(mapping.roomCode);
  if (!state) return;

  socketToPlayer.delete(socketId);

  // Remove player from room
  state.room.players = state.room.players.filter(p => p.id !== mapping.playerId);

  // Remove reconnect token
  for (const [token, val] of reconnectTokens) {
    if (val.playerId === mapping.playerId) {
      reconnectTokens.delete(token);
      break;
    }
  }

  // Transfer host if needed
  if (state.room.hostId === mapping.playerId && state.room.players.length > 0) {
    const newHost = state.room.players.find(p => p.connected) || state.room.players[0];
    state.room.hostId = newHost.id;
    state.room.players.forEach(p => { p.isHost = p.id === newHost.id; });
  }

  if (state.room.players.length === 0) {
    startCleanupTimer(mapping.roomCode);
  }

  broadcastLobby(state);
}

export function handleDisconnect(socketId: string): void {
  const mapping = socketToPlayer.get(socketId);
  if (!mapping) return;

  const state = rooms.get(mapping.roomCode);
  if (!state) return;

  const player = state.room.players.find(p => p.id === mapping.playerId);
  if (!player) return;

  player.connected = false;
  socketToPlayer.delete(socketId);

  io.to(mapping.roomCode).emit('room:playerConnectionChange', { playerId: player.id, connected: false });

  if (state.gamePlugin && state.gameState) {
    state.gameState = state.gamePlugin.onPlayerDisconnect(state.gameState, player.id);
    distributeGameState(state);
  }

  // Host transfer after 30s
  if (player.isHost) {
    state.hostTransferTimer = setTimeout(() => {
      const connected = state.room.players.find(p => p.connected && p.id !== player.id);
      if (connected) {
        player.isHost = false;
        connected.isHost = true;
        state.room.hostId = connected.id;
        broadcastLobby(state);
      }
    }, 30_000);
  }

  // Room cleanup if all disconnected
  const anyConnected = state.room.players.some(p => p.connected);
  if (!anyConnected) {
    startCleanupTimer(mapping.roomCode);
  }

  broadcastLobby(state);
}

export function selectGame(roomCode: RoomCode, playerId: PlayerId, gameId: string): void {
  const state = rooms.get(roomCode);
  if (!state) return;
  if (state.room.hostId !== playerId) return;

  state.room = lobby.selectGame(state.room, gameId);
  broadcastLobby(state);
}

export function updateSettings(roomCode: RoomCode, playerId: PlayerId, settings: Record<string, unknown>): void {
  const state = rooms.get(roomCode);
  if (!state) return;
  if (state.room.hostId !== playerId) return;

  state.room = lobby.updateSettings(state.room, settings);
  broadcastLobby(state);
}

export function startGame(roomCode: RoomCode, playerId: PlayerId): void {
  const state = rooms.get(roomCode);
  if (!state) return;
  if (state.room.hostId !== playerId) return;
  if (!lobby.canStart(state.room)) return;

  const plugin = getGame(state.room.selectedGameId!);
  if (!plugin) return;

  state.room = lobby.startGame(state.room);
  state.gamePlugin = plugin;

  const connectedPlayers = state.room.players.filter(p => p.connected);
  const playerIds = connectedPlayers.map(p => p.id);
  const playerNames: Record<string, string> = {};
  connectedPlayers.forEach(p => { playerNames[p.id] = p.name; });
  state.gameState = plugin.initialize(playerIds, { ...state.room.gameSettings, playerNames });

  io.to(roomCode).emit('game:start', { gameId: plugin.meta.id });
  distributeGameState(state);
  broadcastLobby(state);
}

export function handleGameAction(roomCode: RoomCode, playerId: PlayerId, action: Omit<GameAction, 'playerId'>): void {
  const state = rooms.get(roomCode);
  if (!state || !state.gamePlugin || !state.gameState) return;

  const fullAction: GameAction = { ...action, playerId };
  const result = state.gamePlugin.validateAction(state.gameState, fullAction);
  if (!result.valid) {
    // Find the socket for this player
    for (const [sid, mapping] of socketToPlayer) {
      if (mapping.playerId === playerId && mapping.roomCode === roomCode) {
        io.sockets.sockets.get(sid)?.emit('room:error', { message: result.reason });
        break;
      }
    }
    return;
  }

  state.gameState = state.gamePlugin.applyAction(state.gameState, fullAction);
  distributeGameState(state);

  // Check if hand reached showdown
  const phase = state.gamePlugin.getPhase(state.gameState);
  if (phase === 'showdown') {
    // Check if the entire game is over (one player left with chips)
    const gameResult = state.gamePlugin.checkGameOver(state.gameState);
    if (gameResult) {
      const playerResults: Record<string, unknown> = {};
      gameResult.playerResults.forEach((val, key) => { playerResults[key] = val; });
      io.to(roomCode).emit('game:over', {
        winners: gameResult.winners,
        playerResults,
        summary: gameResult.summary,
      });
      state.room = lobby.returnToLobby(state.room);
      state.gameState = null;
      state.gamePlugin = null;
      broadcastLobby(state);
    } else {
      // Hand is over but game continues — start new hand after delay
      setTimeout(() => {
        const currentState = rooms.get(roomCode);
        if (!currentState || !currentState.gamePlugin || !currentState.gameState) return;
        if (currentState.gamePlugin.getPhase(currentState.gameState) !== 'showdown') return;

        // Import startNewHand dynamically to avoid circular deps
        import('../games/poker/engine.js').then(({ startNewHand }) => {
          currentState.gameState = startNewHand(currentState.gameState as any);
          distributeGameState(currentState);
        });
      }, 5000); // 5 second delay so players can see the showdown results
    }
  }
}

export function returnToLobby(roomCode: RoomCode, playerId: PlayerId): void {
  const state = rooms.get(roomCode);
  if (!state) return;
  if (state.room.hostId !== playerId) return;

  state.room = lobby.returnToLobby(state.room);
  state.gameState = null;
  state.gamePlugin = null;
  broadcastLobby(state);
}

function distributeGameState(state: RoomState): void {
  if (!state.gamePlugin || !state.gameState) return;

  const views = state.gamePlugin.getStateViews(state.gameState);
  io.to(state.room.code).emit('game:publicState', views.publicState);

  for (const [playerId, privateState] of views.playerStates) {
    for (const [sid, mapping] of socketToPlayer) {
      if (mapping.playerId === playerId && mapping.roomCode === state.room.code) {
        io.sockets.sockets.get(sid)?.emit('game:privateState', privateState);
        break;
      }
    }
  }
}

function broadcastLobby(state: RoomState): void {
  io.to(state.room.code).emit('room:lobbyUpdate', getLobbyState(state.room));
}

function startCleanupTimer(roomCode: RoomCode): void {
  const state = rooms.get(roomCode);
  if (!state) return;

  if (state.cleanupTimer) clearTimeout(state.cleanupTimer);

  state.cleanupTimer = setTimeout(() => {
    destroyRoom(roomCode);
  }, config.roomTimeout);
}

function destroyRoom(roomCode: RoomCode): void {
  const state = rooms.get(roomCode);
  if (!state) return;

  if (state.cleanupTimer) clearTimeout(state.cleanupTimer);
  if (state.hostTransferTimer) clearTimeout(state.hostTransferTimer);

  // Clean up reconnect tokens for this room
  for (const [token, mapping] of reconnectTokens) {
    if (mapping.roomCode === roomCode) {
      reconnectTokens.delete(token);
    }
  }

  rooms.delete(roomCode);
}

export function getRoom(roomCode: RoomCode): Room | undefined {
  return rooms.get(roomCode)?.room;
}

export function getPlayerMapping(socketId: string): { roomCode: RoomCode; playerId: PlayerId } | undefined {
  const playerMapping = socketToPlayer.get(socketId);
  if (playerMapping) return playerMapping;

  // Check if this is a TV socket — TV acts as host
  const roomCode = socketToRoom.get(socketId);
  if (roomCode) {
    const state = rooms.get(roomCode);
    if (state && state.room.hostId) {
      return { roomCode, playerId: state.room.hostId };
    }
  }
  return undefined;
}

export function sendLobbyUpdate(roomCode: RoomCode): void {
  const state = rooms.get(roomCode);
  if (state) broadcastLobby(state);
}
