import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@parlor/shared';
import { config } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import { staticMiddleware } from './middleware/static.js';
import { registerGame } from './platform/game-registry.js';
import { setupSocketHandler } from './platform/socket-handler.js';
import { pokerPlugin } from './games/poker/index.js';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: config.corsOrigin,
    credentials: true,
  },
});

app.use(corsMiddleware);

const staticHandlers = staticMiddleware();
if (staticHandlers) {
  for (const handler of staticHandlers) {
    app.use(handler);
  }
}

registerGame(pokerPlugin);
setupSocketHandler(io);

httpServer.listen(config.port, () => {
  console.log(`Parlor server listening on port ${config.port}`);
});
