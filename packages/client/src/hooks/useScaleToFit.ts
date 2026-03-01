import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useScaleToFit(
  containerRef: RefObject<HTMLElement | null>,
  designWidth: number,
  designHeight: number,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function update() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / designWidth, h / designHeight);
      setScale(s);
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, designWidth, designHeight]);

  return scale;
}
