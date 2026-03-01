import { motion } from 'framer-motion';
import { Card } from './Card';
import { ChipStack } from './ChipStack';
import type { PokerPlayer, ShowdownResult } from '../types';
import { CARD_FLY_DURATION } from '../utils/dealOrder';

interface AnimatedPlayerSeatProps {
  player: PokerPlayer;
  position: Record<string, string>;
  isActive: boolean;
  isDealer: boolean;
  dealerLayoutId: string;
  showdown: ShowdownResult | null;
  dealt?: boolean;
}

const styles = {
  seat: {
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
  betBadge: {
    fontSize: '0.75rem',
    color: '#ffd700',
    fontWeight: 600,
    background: 'rgba(0,0,0,0.6)',
    borderRadius: '10px',
    padding: '2px 8px',
    textTransform: 'capitalize' as const,
  },
  playerStatus: {
    fontSize: '0.75rem',
    color: '#888',
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
};

const glowPulse = {
  animate: {
    boxShadow: [
      '0 0 8px rgba(233,69,96,0.3)',
      '0 0 20px rgba(233,69,96,0.6)',
      '0 0 8px rgba(233,69,96,0.3)',
    ],
  },
  transition: {
    duration: 1.5,
    repeat: Infinity,
    ease: 'easeInOut' as const,
  },
};

export function AnimatedPlayerSeat({
  player,
  position,
  isActive,
  isDealer,
  dealerLayoutId,
  showdown,
  dealt = true,
}: AnimatedPlayerSeatProps) {
  const isShowdown = showdown !== null;
  const isWinner = showdown?.winners.includes(player.id) ?? false;
  const showdownHand = showdown?.playerHands.find(h => h.id === player.id);

  const borderColor = isActive
    ? '#e94560'
    : isWinner
    ? '#ffd700'
    : 'transparent';

  // Show face-down cards when dealt but not at showdown (showdown has its own card display)
  const showFaceDownCards = dealt && !player.folded && !showdownHand && !isShowdown;

  const betLabel = player.currentBet > 0 && !isShowdown
    ? `${player.lastAction ?? 'bet'} ${player.currentBet}`
    : null;

  return (
    <div style={{ ...styles.seat, ...position }}>
      {isDealer && (
        <motion.div layoutId={dealerLayoutId} style={styles.dealerButton}>
          D
        </motion.div>
      )}
      {betLabel && (
        <div style={styles.betBadge}>{betLabel}</div>
      )}
      <motion.div
        data-testid={`player-seat-${player.id}`}
        style={{
          ...styles.playerCard,
          border: `2px solid ${borderColor}`,
        }}
        animate={
          isActive
            ? glowPulse.animate
            : (player.sittingOut || player.waitingForBB)
            ? { opacity: 0.35, boxShadow: 'none' }
            : player.folded
            ? { opacity: 0.45, boxShadow: 'none' }
            : isWinner
            ? {
                boxShadow: [
                  '0 0 8px rgba(255,215,0,0.3)',
                  '0 0 20px rgba(255,215,0,0.6)',
                  '0 0 8px rgba(255,215,0,0.3)',
                ],
              }
            : { opacity: 1, boxShadow: 'none' }
        }
        transition={
          isActive
            ? glowPulse.transition
            : isWinner
            ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const }
            : { duration: 0.4 }
        }
      >
        {/* Face-down cards fly in when dealt */}
        {showFaceDownCards && (
          <motion.div
            data-testid={`dealt-cards-${player.id}`}
            style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '4px' }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 24,
              duration: CARD_FLY_DURATION / 1000,
            }}
          >
            <Card faceDown size="small" />
            <Card faceDown size="small" />
          </motion.div>
        )}
        {/* Show cards at showdown */}
        {showdownHand && (
          <motion.div
            style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '4px' }}
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.2 }}
          >
            <Card rank={showdownHand.holeCards[0].rank} suit={showdownHand.holeCards[0].suit} size="small" />
            <Card rank={showdownHand.holeCards[1].rank} suit={showdownHand.holeCards[1].suit} size="small" />
          </motion.div>
        )}
        <div
          style={{
            ...styles.playerName,
            ...(isActive ? { color: '#e94560' } : {}),
            ...(isWinner ? { color: '#ffd700' } : {}),
          }}
        >
          {player.name}
        </div>
        <ChipStack amount={player.chips} />
        {player.folded && !player.sittingOut && !player.waitingForBB && <div style={styles.playerStatus}>Folded</div>}
        {player.sittingOut && <div style={styles.playerStatus}>Sitting Out</div>}
        {player.waitingForBB && <div style={styles.playerStatus}>Waiting for BB</div>}
        {player.allIn && (
          <div style={{ ...styles.playerStatus, color: '#e94560' }}>ALL IN</div>
        )}
        {showdownHand && (
          <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>
            {showdownHand.handDescription}
          </div>
        )}
      </motion.div>
    </div>
  );
}
