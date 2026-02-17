import { io, Socket } from 'socket.io-client';

const URL = 'http://localhost:3000';

function createSocket(): Socket {
  return io(URL, { autoConnect: false });
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 1. TV creates room
  const tv = createSocket();
  tv.connect();
  await sleep(500);
  console.log('TV connected:', tv.connected);

  const roomCode = await new Promise<string>((resolve) => {
    tv.emit('room:create', (response: any) => {
      console.log('Room created:', response);
      resolve(response.roomCode);
    });
  });

  // Listen for lobby updates on TV
  tv.on('room:lobbyUpdate', (lobby: any) => {
    console.log('\n[TV lobby update]', JSON.stringify({
      phase: lobby.phase,
      players: lobby.players.map((p: any) => p.name),
      selectedGameId: lobby.selectedGameId,
      availableGames: lobby.availableGames.map((g: any) => g.id),
      hostId: lobby.hostId,
    }, null, 2));
  });

  await sleep(500);

  // 2. Player 1 joins
  const p1 = createSocket();
  p1.connect();
  await sleep(300);
  const p1Result = await new Promise<any>((resolve) => {
    p1.emit('room:join', { roomCode, playerName: 'Alice' }, (r: any) => resolve(r));
  });
  console.log('\nPlayer 1 join result:', JSON.stringify(p1Result));
  await sleep(500);

  // 3. Player 2 joins
  const p2 = createSocket();
  p2.connect();
  await sleep(300);
  const p2Result = await new Promise<any>((resolve) => {
    p2.emit('room:join', { roomCode, playerName: 'Bob' }, (r: any) => resolve(r));
  });
  console.log('\nPlayer 2 join result:', JSON.stringify(p2Result));
  await sleep(500);

  // 4. TV selects game
  console.log('\n--- TV selecting poker ---');
  tv.emit('lobby:selectGame', { gameId: 'poker' });
  await sleep(500);

  // 5. TV starts game
  console.log('\n--- TV starting game ---');
  tv.emit('lobby:startGame');
  await sleep(500);

  // Listen for game events
  tv.on('game:start', (data: any) => console.log('[TV game:start]', data));
  tv.on('game:publicState', (state: any) => console.log('[TV game:publicState] phase:', state.phase, 'players:', state.players?.length));
  p1.on('game:privateState', (state: any) => console.log('[P1 private]', state));
  p2.on('game:privateState', (state: any) => console.log('[P2 private]', state));

  await sleep(2000);

  console.log('\n--- Done ---');
  tv.disconnect();
  p1.disconnect();
  p2.disconnect();
  process.exit(0);
}

main().catch(console.error);
