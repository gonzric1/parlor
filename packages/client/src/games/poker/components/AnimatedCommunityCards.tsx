import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';
import type { CardData } from '../types';

interface AnimatedCommunityCardsProps {
  cards: CardData[];
}

export function AnimatedCommunityCards({ cards }: AnimatedCommunityCardsProps) {
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    // Update prevCount after render so we know which cards are "new"
    // Use a microtask to avoid updating during render
    const id = requestAnimationFrame(() => {
      setPrevCount(cards.length);
    });
    return () => cancelAnimationFrame(id);
  }, [cards.length]);

  // When cards go from >0 to 0 (new hand), reset immediately
  const effectivePrevCount = cards.length < prevCount ? 0 : prevCount;

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '10px',
        perspective: '600px',
      }}
    >
      {cards.map((card, i) => {
        const isNew = i >= effectivePrevCount;

        // Stagger delay: flop staggers 3, turn/river are single
        const staggerDelay = isNew ? (i - effectivePrevCount) * 0.15 : 0;

        return (
          <motion.div
            key={`card-${i}-${card.rank}-${card.suit}`}
            initial={isNew ? { opacity: 0, y: -120, rotateY: 90 } : false}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 24,
              delay: staggerDelay,
            }}
          >
            <Card rank={card.rank} suit={card.suit} size="medium" />
          </motion.div>
        );
      })}
    </div>
  );
}
