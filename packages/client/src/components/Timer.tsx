import { useState, useEffect } from 'react';

interface TimerProps {
  duration: number;
  onComplete?: () => void;
}

export function Timer({ duration, onComplete }: TimerProps) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    setRemaining(duration);
  }, [duration]);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onComplete]);

  const pct = duration > 0 ? (remaining / duration) * 100 : 0;
  const color = pct > 50 ? '#4caf50' : pct > 20 ? '#ff9800' : '#e94560';

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: '#16213e',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 1s linear',
          }}
        />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#888',
          marginTop: 4,
        }}
      >
        {remaining}s
      </div>
    </div>
  );
}
