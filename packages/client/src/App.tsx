import { Routes, Route } from 'react-router-dom';
import { JoinPage } from './pages/JoinPage';
import { TVLobby } from './pages/TVLobby';
import { GamePage } from './pages/GamePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />
      <Route path="/tv" element={<TVLobby />} />
      <Route path="/tv/:roomCode" element={<GamePage role="tv" />} />
      <Route path="/play/:roomCode" element={<GamePage role="player" />} />
    </Routes>
  );
}
