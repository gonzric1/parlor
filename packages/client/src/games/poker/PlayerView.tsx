import type { GameViewProps } from '../registry';
import type { PokerPublicState, PokerPrivateState } from './types';
import { Card } from './components/Card';
import { ChipStack } from './components/ChipStack';
import { BettingControls } from './components/BettingControls';

const styles = {
  container: {
    minHeight: '100vh',
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '16px',
  },
  section: {
    width: '100%',
    maxWidth: '400px',
    marginBottom: '16px',
  },
  holeCards: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  communityCards: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  info: {
    display: 'flex',
    justifyContent: 'space-around',
    background: '#16213e',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
  },
  infoItem: {
    textAlign: 'center' as const,
  },
  infoLabel: {
    fontSize: '0.75rem',
    color: '#888',
  },
  infoValue: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#eee',
  },
  phase: {
    fontSize: '0.85rem',
    color: '#888',
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
    marginBottom: '12px',
  },
  waiting: {
    textAlign: 'center' as const,
    color: '#888',
    padding: '20px',
    fontSize: '1rem',
  },
};

export function PlayerView({ publicState, privateState, sendAction }: GameViewProps) {
  const pub = publicState as PokerPublicState | null;
  const priv = privateState as PokerPrivateState | null;

  if (!pub) {
    return (
      <div style={styles.container}>
        <div style={styles.waiting}>Waiting for game state...</div>
      </div>
    );
  }

  const myPlayer = priv
    ? pub.players.find((p) => p.id === priv.playerId)
    : null;
  const isMyTurn = priv ? pub.activePlayerId === priv.playerId : false;

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <div style={styles.phase}>{pub.phase}</div>
        <div style={styles.holeCards}>
          {priv?.holeCards?.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} size="large" />
          )) ?? (
            <>
              <Card faceDown size="large" />
              <Card faceDown size="large" />
            </>
          )}
        </div>
        <div style={styles.communityCards}>
          {pub.communityCards.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} size="small" />
          ))}
        </div>
        <div style={styles.info}>
          <div style={styles.infoItem}>
            <div style={styles.infoLabel}>Pot</div>
            <div style={styles.infoValue}>
              <ChipStack amount={pub.pot + (pub.roundBets ?? 0)} />
            </div>
          </div>
          <div style={styles.infoItem}>
            <div style={styles.infoLabel}>Current Bet</div>
            <div style={styles.infoValue}>{pub.currentBet}</div>
          </div>
          {myPlayer && (
            <div style={styles.infoItem}>
              <div style={styles.infoLabel}>My Chips</div>
              <div style={styles.infoValue}>
                <ChipStack amount={myPlayer.chips} />
              </div>
            </div>
          )}
        </div>
        <BettingControls
          isMyTurn={isMyTurn}
          myChips={myPlayer?.chips ?? 0}
          myCurrentBet={myPlayer?.currentBet ?? 0}
          currentBet={pub.currentBet}
          minRaise={pub.minRaise ?? pub.currentBet * 2}
          sendAction={sendAction}
        />
      </div>
    </div>
  );
}
