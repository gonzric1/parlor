import { useEffect, useState, useRef } from 'react';
import { animate } from 'framer-motion';

export function useAnimatedCounter(target: number, duration = 0.6): number {
  const [display, setDisplay] = useState(target);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (prevTarget.current === target) return;
    const from = prevTarget.current;
    prevTarget.current = target;

    const controls = animate(from, target, {
      duration,
      ease: 'easeOut',
      onUpdate(value) {
        setDisplay(Math.round(value));
      },
    });

    return () => controls.stop();
  }, [target, duration]);

  return display;
}
