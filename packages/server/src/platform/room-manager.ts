import type { Server, Socket } from 'socket.io';
import type {
  PlayerId, RoomCode, ReconnectToken, GameId, Room, Player,
  ServerGamePlugin, GameAction, ClientToServerEvents, ServerToClientEvents,
} from '@parlor/shared';
import { generateRoomCode } from '@parlor/shared';
import { config } from '../config.js';
import { getGame, getAllGames } from './game-registry.js';
import * as lobby from './lobby.js';
import { getLobbyState } from './lobby.js';
import { upsertPlayer, recordGameResult } from './database.js';
import crypto from 'node:crypto';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface RoomState {
  room: Room;
  gameState: unknown;
  gamePlugin: ServerGamePlugin | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  hostTransferTimer: ReturnType<typeof setTimeout> | null;
  gameTimer: ReturnType<typeof setTimeout> | null;
  tvSocketId: string | null;
  persistentIdMap: Map<PlayerId, string>;
  chipsAtJoin: Map<PlayerId, number>;
  handsAtStart: number;
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
    gameTimer: null,
    tvSocketId: tvSocketId ?? null,
    persistentIdMap: new Map(),
    chipsAtJoin: new Map(),
    handsAtStart: 0,
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
  persistentId?: string,
): { success: true; playerId: PlayerId; reconnectToken: ReconnectToken; gameId?: GameId } | { success: false; error: string } {
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
  const playerId = generateId();
  const token = crypto.randomUUID() as ReconnectToken;

  // Track persistent identity
  if (persistentId) {
    state.persistentIdMap.set(playerId, persistentId);
    upsertPlayer(persistentId, playerName);
  }

  // Allow joining during playing phase if plugin supports it
  if (state.room.phase === 'playing') {
    if (!state.gamePlugin || !('onPlayerJoin' in state.gamePlugin) || !state.gamePlugin.onPlayerJoin) {
      return { success: false, error: 'Game already in progress' };
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      connected: true,
      isHost: false,
    };

    state.room.players.push(player);
    socketToPlayer.set(socket.id, { roomCode, playerId });
    reconnectTokens.set(token, { roomCode, playerId });
    socket.join(roomCode);

    // Add player to game state
    state.gameState = state.gamePlugin.onPlayerJoin(
      state.gameState, playerId, playerName, state.room.gameSettings as any,
    );

    io.to(roomCode).emit('game:start', { gameId: state.gamePlugin.meta.id });
    distributeGameState(state);
    broadcastLobby(state);

    // If stuck in showdown waiting for players, try starting next round
    if (state.gamePlugin.getPhase(state.gameState) === 'showdown') {
      handleRoundEnd(roomCode, state);
    }

    return { success: true, playerId, reconnectToken: token, gameId: state.gamePlugin.meta.id };
  }

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

function recordPlayerResult(state: RoomState, playerId: PlayerId, placement: number): void {
  const persistentId = state.persistentIdMap.get(playerId);
  if (!persistentId) return;
  if (!state.gamePlugin || !state.gameState) return;

  const gs = state.gameState as any;
  const player = gs.players?.find((p: any) => p.id === playerId);
  if (!player) return;

  const chipsStart = state.chipsAtJoin.get(playerId) ?? player.chips;
  const chipsEnd = player.chips;
  const handsPlayed = (gs.handNumber ?? 0) - state.handsAtStart;

  // Skip recording if nothing happened
  if (handsPlayed === 0 && chipsEnd === chipsStart) return;

  recordGameResult({
    persistentId,
    gameId: state.gamePlugin.meta.id,
    roomCode: state.room.code,
    placement,
    chipsStart,
    chipsEnd,
    handsPlayed,
  });
}

export function leaveRoom(socketId: string): void {
  const mapping = socketToPlayer.get(socketId);
  if (!mapping) return;

  const state = rooms.get(mapping.roomCode);
  if (!state) return;

  // During playing phase, check if player can leave
  if (state.room.phase === 'playing' && state.gamePlugin && state.gameState) {
    const canLeave = state.gamePlugin.canPlayerLeave?.(state.gameState, mapping.playerId) ?? true;
    if (!canLeave) {
      // Emit error to the leaving player
      for (const [sid, m] of socketToPlayer) {
        if (m.playerId === mapping.playerId && m.roomCode === mapping.roomCode) {
          io.sockets.sockets.get(sid)?.emit('room:error', { message: 'Cannot leave while in a hand' });
          break;
        }
      }
      return;
    }

    // Remove player from game state
    if (state.gamePlugin.onPlayerLeave) {
      state.gameState = state.gamePlugin.onPlayerLeave(state.gameState, mapping.playerId);
      distributeGameState(state);
    }
  }

  // Record stats before removing player
  if (state.room.phase === 'playing') {
    recordPlayerResult(state, mapping.playerId, state.room.players.length);
  }

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
    // Check if game is over (all players left)
    if (state.room.phase === 'playing' && state.gamePlugin && state.gameState) {
      const gameResult = state.gamePlugin.checkGameOver(state.gameState);
      if (gameResult) {
        io.to(mapping.roomCode).emit('game:over', {
          winners: gameResult.winners,
          playerResults: {},
          summary: gameResult.summary,
        });
        state.room.phase = 'waiting' as any;
        state.gameState = null;
        state.gamePlugin = null;
      }
    }
    startCleanupTimer(mapping.roomCode);
  }

  broadcastLobby(state);
}

export function handleDisconnect(socketId: string): void {
  // Handle TV socket disconnect
  const tvRoom = socketToRoom.get(socketId);
  if (tvRoom) {
    socketToRoom.delete(socketId);
    const tvState = rooms.get(tvRoom);
    if (tvState && tvState.tvSocketId === socketId) {
      tvState.tvSocketId = null;
      // If no players connected either, start cleanup
      const anyPlayerConnected = tvState.room.players.some(p => p.connected);
      if (!anyPlayerConnected) {
        startCleanupTimer(tvRoom);
      }
    }
  }

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
  state.handsAtStart = 0;

  // Capture starting chips for all players
  const gs = state.gameState as any;
  if (gs?.players) {
    for (const p of gs.players) {
      state.chipsAtJoin.set(p.id, p.chips);
    }
  }

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

  scheduleGameTimer(roomCode, state);
}

function scheduleGameTimer(roomCode: RoomCode, state: RoomState): void {
  if (!state.gamePlugin || !state.gameState) return;

  const timerConfig = state.gamePlugin.getPostActionTimer?.(state.gameState);
  if (timerConfig) {
    if (state.gameTimer) clearTimeout(state.gameTimer);
    state.gameTimer = setTimeout(() => {
      const currentState = rooms.get(roomCode);
      if (!currentState || !currentState.gamePlugin || !currentState.gameState) return;
      if (currentState.gamePlugin.getPhase(currentState.gameState) !== timerConfig.phase) return;

      currentState.gameState = currentState.gamePlugin.onTimeout(currentState.gameState);
      distributeGameState(currentState);
      // Check if another timer is needed (e.g. all-in runout chaining)
      scheduleGameTimer(roomCode, currentState);
    }, timerConfig.durationMs);
  } else {
    if (state.gameTimer) {
      clearTimeout(state.gameTimer);
      state.gameTimer = null;
    }
    handleRoundEnd(roomCode, state);
  }
}

function handleRoundEnd(roomCode: RoomCode, state: RoomState): void {
  if (!state.gamePlugin || !state.gameState) return;

  // Check if the entire game is over
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
    return;
  }

  // If plugin supports round continuation, start next round after delay
  if (!state.gamePlugin.startNextRound) return;

  const delay = state.gamePlugin.nextRoundDelay ?? 0;
  const currentPhase = state.gamePlugin.getPhase(state.gameState);

  setTimeout(() => {
    const currentState = rooms.get(roomCode);
    if (!currentState || !currentState.gamePlugin || !currentState.gameState) return;
    if (currentState.gamePlugin.getPhase(currentState.gameState) !== currentPhase) return;

    const nextState = currentState.gamePlugin.startNextRound?.(currentState.gameState);
    if (nextState) {
      currentState.gameState = nextState;
      io.to(roomCode).emit('game:roundStart', { roundNumber: (nextState as any).handNumber ?? 0 });
      distributeGameState(currentState);
    }
  }, delay);
}

export function returnToLobby(roomCode: RoomCode, playerId: PlayerId): void {
  const state = rooms.get(roomCode);
  if (!state) return;
  if (state.room.hostId !== playerId) return;

  // Record results for all players, ranked by chips (descending)
  if (state.gamePlugin && state.gameState) {
    const gs = state.gameState as any;
    if (gs.players) {
      const sorted = [...gs.players].sort((a: any, b: any) => b.chips - a.chips);
      sorted.forEach((p: any, i: number) => {
        recordPlayerResult(state, p.id, i + 1);
      });
    }
    state.chipsAtJoin.clear();
  }

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

  // Record results for any players still tracked
  if (state.gamePlugin && state.gameState) {
    const gs = state.gameState as any;
    if (gs.players) {
      const sorted = [...gs.players].sort((a: any, b: any) => b.chips - a.chips);
      sorted.forEach((p: any, i: number) => {
        recordPlayerResult(state, p.id, i + 1);
      });
    }
  }

  if (state.cleanupTimer) clearTimeout(state.cleanupTimer);
  if (state.hostTransferTimer) clearTimeout(state.hostTransferTimer);

  // Clean up reconnect tokens for this room
  for (const [token, mapping] of reconnectTokens) {
    if (mapping.roomCode === roomCode) {
      reconnectTokens.delete(token);
    }
  }

  // Clean up TV socket mappings for this room
  for (const [sid, code] of socketToRoom) {
    if (code === roomCode) {
      socketToRoom.delete(sid);
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

  // Only the host TV socket gets host-proxy privileges
  const roomCode = socketToRoom.get(socketId);
  if (roomCode) {
    const state = rooms.get(roomCode);
    if (state && state.tvSocketId === socketId && state.room.hostId) {
      return { roomCode, playerId: state.room.hostId };
    }
  }
  return undefined;
}

export function observeRoom(
  roomCode: RoomCode,
  socket: TypedSocket,
): { success: true; gameId: string | null } | { success: false; error: string } {
  const state = rooms.get(roomCode);
  if (!state) return { success: false, error: 'room_not_found' };

  // If no players connected and no TV connected, room is dead
  const anyPlayerConnected = state.room.players.some(p => p.connected);
  if (!anyPlayerConnected && !state.tvSocketId) {
    destroyRoom(roomCode);
    return { success: false, error: 'room_empty' };
  }

  // Cancel cleanup timer — a TV reconnecting should prevent room destruction
  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  // Join the socket room so the TV receives broadcasts
  socket.join(roomCode);
  socketToRoom.set(socket.id, roomCode);

  // If no TV is currently connected, this socket becomes the host TV
  if (!state.tvSocketId) {
    state.tvSocketId = socket.id;
  }

  // Send current lobby state
  broadcastLobby(state);

  // If a game is in progress, send the current game state
  if (state.gamePlugin && state.gameState) {
    const views = state.gamePlugin.getStateViews(state.gameState);
    socket.emit('game:publicState', views.publicState);
    return { success: true, gameId: state.gamePlugin.meta.id };
  }

  // No game running — return null so client knows we're in lobby
  return { success: true, gameId: null };
}

export function sendLobbyUpdate(roomCode: RoomCode): void {
  const state = rooms.get(roomCode);
  if (state) broadcastLobby(state);
}
