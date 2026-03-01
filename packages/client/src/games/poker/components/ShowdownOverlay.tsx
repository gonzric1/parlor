import { motion } from 'framer-motion';
import { Card } from './Card';
import type { ShowdownResult } from '../types';

interface ShowdownOverlayProps {
  showdown: ShowdownResult;
}

const styles = {
  overlay: {
    position: 'absolute' as const,
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: '12px',
    padding: '16px 24px',
    width: 'max(280px, 60%)',
    maxWidth: '500px',
    textAlign: 'center' as const,
  },
  winnerText: {
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#ffd700',
    marginBottom: '12px',
  },
  hand: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  name: {
    fontSize: '0.9rem',
    fontWeight: 600,
    minWidth: '80px',
    textAlign: 'right' as const,
  },
  desc: {
    fontSize: '0.8rem',
    color: '#888',
    minWidth: '120px',
    textAlign: 'left' as const,
  },
};

export function ShowdownOverlay({ showdown }: ShowdownOverlayProps) {
  return (
    <motion.div
      data-testid="showdown-overlay"
      style={styles.overlay}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <div style={styles.winnerText}>
        {showdown.winnerDescription}
      </div>
      {showdown.playerHands.map((hand) => {
        const isWinner = showdown.winners.includes(hand.id);
        return (
          <div key={hand.id} style={styles.hand}>
            <span style={{ ...styles.name, color: isWinner ? '#ffd700' : '#eee' }}>
              {hand.name}
            </span>
            <Card rank={hand.holeCards[0].rank} suit={hand.holeCards[0].suit} size="small" />
            <Card rank={hand.holeCards[1].rank} suit={hand.holeCards[1].suit} size="small" />
            <span style={styles.desc}>{hand.handDescription}</span>
          </div>
        );
      })}
    </motion.div>
  );
}
