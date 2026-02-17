import type { GameViewProps } from '../registry';
import type { PokerPublicState } from './types';
import { Card } from './components/Card';
import { ChipStack } from './components/ChipStack';

const styles = {
  container: {
    minHeight: '100vh',
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    position: 'relative' as const,
  },
  header: {
    position: 'absolute' as const,
    top: '20px',
    left: '20px',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  phase: {
    fontSize: '1.2rem',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  },
  turnIndicator: {
    position: 'absolute' as const,
    top: '20px',
    right: '20px',
    fontSize: '1.1rem',
    color: '#e94560',
    fontWeight: 700,
  },
  table: {
    width: '700px',
    height: '400px',
    background: 'radial-gradient(ellipse, #1b5e20 0%, #0d3610 100%)',
    borderRadius: '200px',
    border: '8px solid #4e342e',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  communityCards: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px',
  },
  potArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  pot: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#ffd700',
  },
  playerSeat: {
    position: 'absolute' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  playerCard: {
    background: '#16213e',
    borderRadius: '8px',
    padding: '8px 12px',
    textAlign: 'center' as const,
    minWidth: '90px',
  },
  playerName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#eee',
  },
  playerNameActive: {
    color: '#e94560',
  },
  playerStatus: {
    fontSize: '0.75rem',
    color: '#888',
  },
  playerBet: {
    fontSize: '0.8rem',
    color: '#ffd700',
    fontWeight: 600,
    marginTop: '2px',
  },
  dealerButton: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#ffd700',
    color: '#000',
    fontSize: '0.6rem',
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showdownOverlay: {
    position: 'absolute' as const,
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: '12px',
    padding: '16px 24px',
    minWidth: '400px',
    textAlign: 'center' as const,
  },
  winnerText: {
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#ffd700',
    marginBottom: '12px',
  },
  showdownHand: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  showdownName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#eee',
    minWidth: '80px',
    textAlign: 'right' as const,
  },
  showdownDesc: {
    fontSize: '0.8rem',
    color: '#888',
    minWidth: '120px',
    textAlign: 'left' as const,
  },
};

const seatPositions = [
  { bottom: '-60px', left: '50%', transform: 'translateX(-50%)' },
  { bottom: '-20px', left: '5%' },
  { top: '30%', left: '-80px' },
  { top: '-60px', left: '15%' },
  { top: '-60px', left: '50%', transform: 'translateX(-50%)' },
  { top: '-60px', right: '15%' },
  { top: '30%', right: '-80px' },
  { bottom: '-20px', right: '5%' },
];

export function TVView({ publicState }: GameViewProps) {
  const state = publicState as PokerPublicState | null;
  if (!state) {
    return <div style={styles.container}>Loading...</div>;
  }

  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const totalPot = state.pot + state.roundBets;
  const isShowdown = state.phase === 'showdown';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.phase}>{state.phase}</span>
      </div>

      {/* Turn indicator */}
      {activePlayer && !isShowdown && (
        <div style={styles.turnIndicator}>
          {activePlayer.name}'s turn
        </div>
      )}

      <div style={styles.table}>
        {/* Community cards */}
        <div style={styles.communityCards}>
          {state.communityCards.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} size="medium" />
          ))}
          {Array.from({ length: 5 - state.communityCards.length }).map((_, i) => (
            <Card key={`empty-${i}`} faceDown size="medium" />
          ))}
        </div>

        {/* Pot */}
        <div style={styles.potArea}>
          <div style={styles.pot}>
            <ChipStack amount={totalPot} />
          </div>
        </div>

        {/* Player seats */}
        {state.players.map((player, i) => {
          const pos = seatPositions[i % seatPositions.length];
          const isActive = player.id === state.activePlayerId;
          const isDealer = i === state.dealerIndex;
          const isWinner = state.showdown?.winners.includes(player.id);

          // Find showdown hand for this player
          const showdownHand = state.showdown?.playerHands.find(h => h.id === player.id);

          return (
            <div key={player.id} style={{ ...styles.playerSeat, ...pos }}>
              {isDealer && <div style={styles.dealerButton}>D</div>}
              <div
                style={{
                  ...styles.playerCard,
                  border: isActive
                    ? '2px solid #e94560'
                    : isWinner
                    ? '2px solid #ffd700'
                    : '2px solid transparent',
                  boxShadow: isActive ? '0 0 12px rgba(233,69,96,0.5)' : 'none',
                }}
              >
                {/* Show cards at showdown */}
                {showdownHand && (
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '4px' }}>
                    <Card rank={showdownHand.holeCards[0].rank} suit={showdownHand.holeCards[0].suit} size="small" />
                    <Card rank={showdownHand.holeCards[1].rank} suit={showdownHand.holeCards[1].suit} size="small" />
                  </div>
                )}
                <div
                  style={{
                    ...styles.playerName,
                    ...(isActive ? styles.playerNameActive : {}),
                    ...(isWinner ? { color: '#ffd700' } : {}),
                  }}
                >
                  {player.name}
                </div>
                <ChipStack amount={player.chips} />
                {/* Show bet in front of player during active round */}
                {player.currentBet > 0 && !isShowdown && (
                  <div style={styles.playerBet}>{player.currentBet}</div>
                )}
                {player.folded && <div style={styles.playerStatus}>Folded</div>}
                {player.allIn && (
                  <div style={{ ...styles.playerStatus, color: '#e94560' }}>ALL IN</div>
                )}
                {showdownHand && (
                  <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>
                    {showdownHand.handDescription}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Showdown winner announcement */}
      {state.showdown && (
        <div style={styles.showdownOverlay}>
          <div style={styles.winnerText}>
            {state.showdown.winnerDescription}
          </div>
          {state.showdown.playerHands.map((hand) => {
            const isWinner = state.showdown!.winners.includes(hand.id);
            return (
              <div key={hand.id} style={styles.showdownHand}>
                <span style={{ ...styles.showdownName, color: isWinner ? '#ffd700' : '#eee' }}>
                  {hand.name}
                </span>
                <Card rank={hand.holeCards[0].rank} suit={hand.holeCards[0].suit} size="small" />
                <Card rank={hand.holeCards[1].rank} suit={hand.holeCards[1].suit} size="small" />
                <span style={styles.showdownDesc}>{hand.handDescription}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
