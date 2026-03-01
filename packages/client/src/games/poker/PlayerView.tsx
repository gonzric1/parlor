import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameViewProps } from '../registry';
import type { PokerPublicState, PokerPrivateState, CardData } from './types';
import { Card } from './components/Card';
import { ChipStack } from './components/ChipStack';
import { BettingControls } from './components/BettingControls';
import { computeDealOrder, DEAL_DELAY_PER_PLAYER, CARD_FLY_DURATION } from './utils/dealOrder';

const styles = {
  container: {
    height: '100dvh',
    width: '100vw',
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    overflow: 'hidden' as const,
    boxSizing: 'border-box' as const,
    padding: 'max(12px, 2vh) max(12px, 3vw)',
  },
  section: {
    width: '100%',
    maxWidth: '600px',
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
  },
  holeCards: {
    display: 'flex',
    gap: 'min(20px, 4vw)',
    justifyContent: 'center',
    flex: '1 1 auto',
    alignItems: 'center',
    minHeight: 0,
  },
  communityCards: {
    display: 'flex',
    gap: 'min(8px, 1.5vw)',
    justifyContent: 'center',
    padding: 'min(8px, 1.5vh) 0',
    flexShrink: 0,
  },
  info: {
    display: 'flex',
    justifyContent: 'space-around',
    background: '#16213e',
    borderRadius: '8px',
    padding: 'min(12px, 2vh) min(12px, 2vw)',
    flexShrink: 0,
  },
  infoItem: {
    textAlign: 'center' as const,
  },
  infoLabel: {
    fontSize: 'clamp(0.65rem, 1.8vw, 0.8rem)',
    color: '#888',
  },
  infoValue: {
    fontSize: 'clamp(0.9rem, 2.5vw, 1.2rem)',
    fontWeight: 700,
    color: '#eee',
  },
  phase: {
    fontSize: 'clamp(0.7rem, 2vw, 0.9rem)',
    color: '#888',
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
    padding: 'min(6px, 1vh) 0',
    flexShrink: 0,
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

  // Track deal animation timing for delayed card reveal
  const [revealedHoleCards, setRevealedHoleCards] = useState<CardData[] | null>(null);
  const [showFaceDown, setShowFaceDown] = useState(false);
  const prevHandNumberRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!pub || !priv) return;

    const handNumber = pub.handNumber;
    const prev = prevHandNumberRef.current;

    // First render — show cards immediately (game already in progress)
    if (prev === null) {
      prevHandNumberRef.current = handNumber;
      setRevealedHoleCards(priv.holeCards);
      setShowFaceDown(false);
      return;
    }

    if (handNumber === prev) {
      // Same hand — if we haven't revealed yet but have cards, this is a reconnect or late state
      if (!revealedHoleCards && priv.holeCards) {
        setRevealedHoleCards(priv.holeCards);
        setShowFaceDown(false);
      }
      return;
    }

    // New hand detected — clear old timers and start deal animation
    prevHandNumberRef.current = handNumber;
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    setRevealedHoleCards(null);
    setShowFaceDown(false);

    const dealOrder = computeDealOrder(pub.players, pub.dealerIndex);
    const myIndex = dealOrder.indexOf(priv.playerId);
    const myDealDelay = myIndex >= 0 ? myIndex * DEAL_DELAY_PER_PLAYER : 0;

    const newTimers: ReturnType<typeof setTimeout>[] = [];

    // Show face-down cards when the deal reaches this player
    const faceDownTimer = setTimeout(() => {
      setShowFaceDown(true);
    }, myDealDelay);
    newTimers.push(faceDownTimer);

    // Reveal face-up cards after the card fly animation completes
    const revealTimer = setTimeout(() => {
      setRevealedHoleCards(priv.holeCards);
      setShowFaceDown(false);
    }, myDealDelay + CARD_FLY_DURATION);
    newTimers.push(revealTimer);

    timersRef.current = newTimers;

    return () => {
      for (const t of newTimers) clearTimeout(t);
    };
  }, [pub?.handNumber, pub?.players, pub?.dealerIndex, priv?.playerId, priv?.holeCards]);

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
  const isWinnerDecide = pub.phase === 'winner-decide' && isMyTurn;

  const handleReveal = useCallback(() => {
    sendAction({ type: 'reveal', payload: {} });
  }, [sendAction]);

  const handleSitOut = useCallback(() => {
    sendAction({ type: 'sit-out', payload: {} });
  }, [sendAction]);

  const handleSitIn = useCallback(() => {
    sendAction({ type: 'sit-in', payload: {} });
  }, [sendAction]);

  const handlePostBlinds = useCallback(() => {
    sendAction({ type: 'post-blinds', payload: {} });
  }, [sendAction]);

  const handleWaitForBB = useCallback(() => {
    sendAction({ type: 'wait-for-bb', payload: {} });
  }, [sendAction]);

  const handleTopUp = useCallback(() => {
    sendAction({ type: 'top-up', payload: {} });
  }, [sendAction]);

  const handleLeave = useCallback(() => {
    // Use the room:leave event
    // sendAction won't work for leaving — we need socket.emit('room:leave')
    // For now, send as a game action that the room manager can intercept
    sendAction({ type: 'leave-table', payload: {} });
  }, [sendAction]);

  const isSittingOut = myPlayer?.sittingOut ?? false;
  const missedBlinds = myPlayer?.missedBlinds ?? 0;
  const isWaitingForBB = myPlayer?.waitingForBB ?? false;
  const canLeave = myPlayer ? (myPlayer.folded || isSittingOut || isWaitingForBB || pub.phase === 'showdown') : false;
  const maxStack = useMemo(() => Math.max(...(pub.players.map(p => p.chips) ?? [0])), [pub.players]);
  const canTopUp = myPlayer ? myPlayer.chips < maxStack : false;

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <div style={styles.phase}>{pub.phase}</div>
        <div style={styles.holeCards}>
          {revealedHoleCards ? (
            revealedHoleCards.map((card, i) => (
              <motion.div
                key={`hole-${i}-${card.rank}-${card.suit}`}
                initial={{ opacity: 0, y: -80 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 24,
                  delay: i * 0.15,
                }}
              >
                <Card rank={card.rank} suit={card.suit} size="large" />
              </motion.div>
            ))
          ) : showFaceDown ? (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <Card faceDown size="large" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.1 }}
              >
                <Card faceDown size="large" />
              </motion.div>
            </>
          ) : null}
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
        <div style={{ flexShrink: 0, paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <AnimatePresence mode="wait">
            {isWinnerDecide ? (
              <motion.div
                key="winner-decide"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
                style={{ textAlign: 'center' as const, padding: 'min(16px, 2vh)' }}
              >
                <div style={{ color: '#ffd700', fontSize: 'clamp(1rem, 3vw, 1.2rem)', fontWeight: 700, marginBottom: 'min(12px, 1.5vh)' }}>
                  You win!
                </div>
                <div style={{ color: '#888', fontSize: 'clamp(0.75rem, 2.2vw, 0.9rem)', marginBottom: 'min(16px, 2vh)' }}>
                  Cards will be mucked in 5s...
                </div>
                <button
                  onClick={handleReveal}
                  data-testid="reveal-button"
                  style={{
                    background: '#e94560',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: 'clamp(10px, 2.5vh, 16px) clamp(24px, 8vw, 40px)',
                    fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reveal Cards
                </button>
              </motion.div>
            ) : isSittingOut && missedBlinds > 0 ? (
              <motion.div
                key="missed-blinds"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
                style={{ textAlign: 'center' as const, padding: 'min(16px, 2vh)' }}
              >
                <div style={{ color: '#ffd700', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', fontWeight: 600, marginBottom: 'min(12px, 1.5vh)' }}>
                  Sit back in?
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                    onClick={handlePostBlinds}
                    style={{
                      background: '#e94560',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: 'clamp(8px, 2vh, 14px) clamp(16px, 5vw, 28px)',
                      fontSize: 'clamp(0.8rem, 2.2vw, 0.95rem)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Post Blinds
                  </button>
                  <button
                    onClick={handleWaitForBB}
                    style={{
                      background: '#0f3460',
                      color: '#eee',
                      border: '1px solid #1a4a8a',
                      borderRadius: '8px',
                      padding: 'clamp(8px, 2vh, 14px) clamp(16px, 5vw, 28px)',
                      fontSize: 'clamp(0.8rem, 2.2vw, 0.95rem)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Wait for BB
                  </button>
                </div>
              </motion.div>
            ) : isMyTurn ? (
              <motion.div
                key="controls"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
              >
                <BettingControls
                  isMyTurn={isMyTurn}
                  myChips={myPlayer?.chips ?? 0}
                  myCurrentBet={myPlayer?.currentBet ?? 0}
                  currentBet={pub.currentBet}
                  minRaise={pub.minRaise ?? pub.currentBet * 2}
                  sendAction={sendAction}
                />
              </motion.div>
            ) : isWaitingForBB ? (
              <motion.div
                key="waiting-bb"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  textAlign: 'center' as const,
                  color: '#888',
                  padding: 'min(16px, 2vh)',
                  fontSize: 'clamp(0.8rem, 2.2vw, 1rem)',
                }}
              >
                Waiting for big blind to reach you...
              </motion.div>
            ) : isSittingOut ? (
              <motion.div
                key="sitting-out"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  textAlign: 'center' as const,
                  color: '#888',
                  padding: 'min(16px, 2vh)',
                  fontSize: 'clamp(0.8rem, 2.2vw, 1rem)',
                }}
              >
                You are sitting out
              </motion.div>
            ) : (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  textAlign: 'center' as const,
                  color: '#888',
                  padding: 'min(16px, 2vh)',
                  fontSize: 'clamp(0.8rem, 2.2vw, 1rem)',
                }}
              >
                Waiting for your turn...
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cash game action bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            padding: 'min(8px, 1vh) 0',
            flexWrap: 'wrap' as const,
          }}>
            {isSittingOut ? (
              <button
                onClick={missedBlinds > 0 ? undefined : handleSitIn}
                style={{
                  background: '#2e7d32',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
                  fontWeight: 600,
                  cursor: missedBlinds > 0 ? 'default' : 'pointer',
                  opacity: missedBlinds > 0 ? 0.5 : 1,
                }}
                disabled={missedBlinds > 0}
              >
                Sit In
              </button>
            ) : !isWaitingForBB ? (
              <button
                onClick={handleSitOut}
                style={{
                  background: '#333',
                  color: '#aaa',
                  border: '1px solid #555',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sit Out
              </button>
            ) : null}
            {canTopUp && (
              <button
                onClick={handleTopUp}
                style={{
                  background: '#1565c0',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Top Up
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
