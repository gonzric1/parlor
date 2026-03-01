import { useState, useRef, useEffect } from 'react';
import type { PokerPublicState } from '../types';
import { computeDealOrder, DEAL_DELAY_PER_PLAYER } from '../utils/dealOrder';

export function useDealAnimation(state: PokerPublicState | null) {
  const [dealing, setDealing] = useState(false);
  const [dealtPlayerIds, setDealtPlayerIds] = useState<Set<string>>(new Set());
  const prevHandNumberRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!state) return;

    const handNumber = state.handNumber;
    const prev = prevHandNumberRef.current;

    // On first render, skip animation — cards are already dealt
    if (prev === null) {
      prevHandNumberRef.current = handNumber;
      setDealtPlayerIds(new Set(state.players.map(p => p.id)));
      return;
    }

    if (handNumber === prev) return;

    prevHandNumberRef.current = handNumber;

    // Clear any pending timers from a previous deal
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    const dealOrder = computeDealOrder(state.players, state.dealerIndex);

    setDealing(true);
    setDealtPlayerIds(new Set());

    const newTimers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < dealOrder.length; i++) {
      const playerId = dealOrder[i];
      const timer = setTimeout(() => {
        setDealtPlayerIds(prev => {
          const next = new Set(prev);
          next.add(playerId);
          return next;
        });

        // After last player is dealt, mark dealing as done
        if (i === dealOrder.length - 1) {
          setDealing(false);
        }
      }, i * DEAL_DELAY_PER_PLAYER);
      newTimers.push(timer);
    }

    timersRef.current = newTimers;

    return () => {
      for (const t of newTimers) clearTimeout(t);
    };
  }, [state?.handNumber, state?.players, state?.dealerIndex]);

  return { dealing, dealtPlayerIds };
}
