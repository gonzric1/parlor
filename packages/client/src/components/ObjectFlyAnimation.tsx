import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

export interface FlyingObject {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface ObjectFlyAnimationProps {
  objects: FlyingObject[];
  onComplete: (id: string) => void;
  duration?: number;
  children?: (object: FlyingObject) => ReactNode;
}

function DefaultFlyingElement({ object, onComplete, duration }: { object: FlyingObject; onComplete: () => void; duration: number }) {
  return (
    <motion.div
      data-testid="flying-object"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #ffd700, #ff8f00)',
        border: '2px solid #e6a100',
        zIndex: 100,
        pointerEvents: 'none',
      }}
      initial={{
        x: object.fromX,
        y: object.fromY,
        scale: 1,
        opacity: 1,
      }}
      animate={{
        x: object.toX,
        y: object.toY,
        scale: [1, 1.5, 1],
        opacity: [1, 1, 0],
      }}
      transition={{
        duration,
        ease: 'easeInOut',
      }}
      onAnimationComplete={onComplete}
    />
  );
}

export function ObjectFlyAnimation({ objects, onComplete, duration = 0.6 }: ObjectFlyAnimationProps) {
  return (
    <AnimatePresence>
      {objects.map((object) => (
        <DefaultFlyingElement
          key={object.id}
          object={object}
          duration={duration}
          onComplete={() => onComplete(object.id)}
        />
      ))}
    </AnimatePresence>
  );
}

export function useFlyingObjects() {
  const [objects, setObjects] = useState<FlyingObject[]>([]);

  const addObject = (object: FlyingObject) => {
    setObjects(prev => [...prev, object]);
  };

  const removeObject = (id: string) => {
    setObjects(prev => prev.filter(o => o.id !== id));
  };

  return { objects, addObject, removeObject };
}
