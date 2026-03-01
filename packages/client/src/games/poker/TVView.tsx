import { useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import type { GameViewProps } from '../registry';
import type { PokerPublicState } from './types';
import { QRCode } from '../../components/QRCode';
import { ChipStack } from './components/ChipStack';
import { AnimatedCommunityCards } from './components/AnimatedCommunityCards';
import { AnimatedPlayerSeat } from './components/AnimatedPlayerSeat';
import { ShowdownOverlay } from './components/ShowdownOverlay';
import { ChipFlyAnimation, useFlyingChips } from './components/ChipFlyAnimation';
import { usePokerAnimations } from './hooks/usePokerAnimations';
import { useAnimatedCounter } from '../../hooks/useAnimatedCounter';
import { useDealAnimation } from './hooks/useDealAnimation';
import { useScaleToFit } from '../../hooks/useScaleToFit';
import { usePrevious } from '../../hooks/usePrevious';

// Design dimensions for the game area (table + seat overflow)
const DESIGN_W = 960;
const DESIGN_H = 620;

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  header: {
    position: 'absolute' as const,
    top: '20px',
    left: '20px',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    zIndex: 10,
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
    zIndex: 10,
  },
  scaleWrapper: {
    width: DESIGN_W,
    height: DESIGN_H,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: 'center center',
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

export function TVView({ publicState, roomCode }: GameViewProps) {
  const state = publicState as PokerPublicState | null;
  const animations = usePokerAnimations(state);
  const { dealtPlayerIds } = useDealAnimation(state);
  const totalPot = state ? state.pot + state.roundBets : 0;
  const animatedPot = useAnimatedCounter(totalPot);
  const { chips: flyingChips, addChip, removeChip } = useFlyingChips();
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevState = usePrevious(state);
  const scale = useScaleToFit(containerRef, DESIGN_W, DESIGN_H);

  const setSeatRef = useCallback((playerId: string, el: HTMLDivElement | null) => {
    if (el) {
      seatRefs.current.set(playerId, el);
    } else {
      seatRefs.current.delete(playerId);
    }
  }, []);

  // Trigger chip fly animations on bet events (in useEffect to avoid render loop)
  useEffect(() => {
    if (animations.playerBets.length === 0) return;
    if (!tableRef.current || !potRef.current) return;

    const potRect = potRef.current.getBoundingClientRect();
    const tableRect = tableRef.current.getBoundingClientRect();

    for (const bet of animations.playerBets) {
      const seatEl = seatRefs.current.get(bet.playerId);
      if (seatEl) {
        const seatRect = seatEl.getBoundingClientRect();
        addChip({
          id: `${bet.playerId}-${Date.now()}-${Math.random()}`,
          fromX: seatRect.left - tableRect.left + seatRect.width / 2,
          fromY: seatRect.top - tableRect.top + seatRect.height / 2,
          toX: potRect.left - tableRect.left + potRect.width / 2,
          toY: potRect.top - tableRect.top + potRect.height / 2,
        });
      }
    }
  }, [animations.playerBets, addChip]);

  if (!state) {
    return <div style={styles.container}>Loading...</div>;
  }

  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const isShowdown = state.phase === 'showdown' || state.phase === 'winner-decide';
  const activePlayers = state.players.filter(p => !p.sittingOut && !p.waitingForBB);
  const waitingForPlayers = activePlayers.length < 2;

  return (
    <div ref={containerRef} style={styles.container}>
      {!waitingForPlayers && (
        <div style={styles.header}>
          <span style={styles.phase} data-testid="phase-indicator">{state.phase}</span>
        </div>
      )}

      {/* Turn indicator */}
      {activePlayer && !isShowdown && !waitingForPlayers && (
        <div style={styles.turnIndicator}>
          {activePlayer.name}'s turn
        </div>
      )}

      <div style={{ ...styles.scaleWrapper, transform: `scale(${scale})` }}>
        <LayoutGroup>
          <div ref={tableRef} style={{ ...styles.table, position: 'relative' as const }}>
            {/* Community cards */}
            <AnimatedCommunityCards cards={state.communityCards} />

            {/* Pot */}
            <div style={styles.potArea}>
              {waitingForPlayers ? (
                <div style={{
                  fontSize: '1.6rem',
                  color: '#aaa',
                  fontWeight: 600,
                  textAlign: 'center' as const,
                  letterSpacing: '0.05em',
                }}>
                  Waiting for players...
                </div>
              ) : (
                <div ref={potRef} style={styles.pot} data-testid="pot-area">
                  <ChipStack amount={animatedPot} />
                </div>
              )}
            </div>

            {/* Player seats */}
            {state.players.map((player, i) => {
              const pos = seatPositions[i % seatPositions.length];
              const isActive = player.id === state.activePlayerId;
              const isDealer = i === state.dealerIndex;

              return (
                <div key={player.id} ref={(el) => setSeatRef(player.id, el)}>
                  <AnimatedPlayerSeat
                    player={player}
                    position={pos}
                    isActive={isActive}
                    isDealer={isDealer}
                    dealerLayoutId="dealer-button"
                    showdown={state.showdown}
                    dealt={dealtPlayerIds.has(player.id)}
                  />
                </div>
              );
            })}

            {/* Flying chip animations */}
            <ChipFlyAnimation chips={flyingChips} onComplete={removeChip} />
          </div>
        </LayoutGroup>

        {/* Showdown winner announcement */}
        <AnimatePresence>
          {state.showdown && (
            <ShowdownOverlay showdown={state.showdown} />
          )}
        </AnimatePresence>
      </div>

      {/* Join QR code */}
      {roomCode && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 4,
          opacity: 0.8,
          zIndex: 10,
        }}>
          <QRCode value={`${window.location.origin}/?room=${roomCode}`} size={80} />
          <span style={{ color: '#888', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
            Join: {roomCode}
          </span>
        </div>
      )}
    </div>
  );
}
