import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@parlor/shared';
import * as roomManager from './room-manager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function setupSocketHandler(io: TypedServer): void {
  roomManager.init(io);

  io.on('connection', (socket) => {
    socket.on('room:create', (callback) => {
      const roomCode = roomManager.createRoom(socket.id);
      // TV socket joins the room so it receives lobby updates and game state
      socket.join(roomCode);
      roomManager.sendLobbyUpdate(roomCode);
      callback({ roomCode });
    });

    socket.on('room:join', (data, callback) => {
      console.log(`[room:join] code=${data.roomCode} name=${data.playerName} socketId=${socket.id}`);
      const result = roomManager.joinRoom(data.roomCode, data.playerName, socket, data.reconnectToken);
      console.log(`[room:join] result=`, JSON.stringify(result));
      callback(result);
    });

    socket.on('room:leave', () => {
      roomManager.leaveRoom(socket.id);
    });

    socket.on('lobby:selectGame', (data) => {
      const mapping = roomManager.getPlayerMapping(socket.id);
      if (!mapping) return;
      roomManager.selectGame(mapping.roomCode, mapping.playerId, data.gameId);
    });

    socket.on('lobby:updateSettings', (data) => {
      const mapping = roomManager.getPlayerMapping(socket.id);
      if (!mapping) return;
      roomManager.updateSettings(mapping.roomCode, mapping.playerId, data.settings);
    });

    socket.on('lobby:startGame', () => {
      const mapping = roomManager.getPlayerMapping(socket.id);
      if (!mapping) return;
      roomManager.startGame(mapping.roomCode, mapping.playerId);
    });

    socket.on('lobby:returnToLobby', () => {
      const mapping = roomManager.getPlayerMapping(socket.id);
      if (!mapping) return;
      roomManager.returnToLobby(mapping.roomCode, mapping.playerId);
    });

    socket.on('game:action', (action) => {
      const mapping = roomManager.getPlayerMapping(socket.id);
      if (!mapping) return;
      roomManager.handleGameAction(mapping.roomCode, mapping.playerId, action);
    });

    socket.on('disconnect', () => {
      roomManager.handleDisconnect(socket.id);
    });
  });
}
