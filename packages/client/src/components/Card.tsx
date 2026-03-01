interface CardProps {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const suitSymbols: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
  s: '\u2660',
};

const redSuits = new Set(['hearts', 'diamonds', 'h', 'd']);

const sizes = {
  small: { width: 'clamp(36px, 5vw, 50px)', height: 'clamp(50px, 7vw, 70px)', fontSize: 'clamp(0.6rem, 1.2vw, 0.8rem)' },
  medium: { width: 'clamp(44px, 6vw, 64px)', height: 'clamp(62px, 8.5vw, 90px)', fontSize: 'clamp(0.7rem, 1.5vw, 1rem)' },
  large: { width: 'clamp(80px, 28vw, 140px)', height: 'clamp(112px, 40vw, 196px)', fontSize: 'clamp(1.2rem, 5vw, 2rem)' },
};

export function Card({ rank, suit, faceDown, size = 'medium' }: CardProps) {
  const dim = sizes[size];
  const isRed = suit ? redSuits.has(suit) : false;

  if (faceDown || !rank || !suit) {
    return (
      <div
        style={{
          width: dim.width,
          height: dim.height,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #0f3460, #16213e)',
          border: '2px solid #0f3460',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 'calc(100% - 12px)',
            height: 'calc(100% - 12px)',
            borderRadius: 4,
            border: '1px solid #0f3460',
            background: 'repeating-linear-gradient(45deg, #0f3460 0px, #0f3460 2px, #16213e 2px, #16213e 6px)',
          }}
        />
      </div>
    );
  }

  const suitChar = suitSymbols[suit] ?? suit;

  return (
    <div
      style={{
        width: dim.width,
        height: dim.height,
        borderRadius: 6,
        background: '#fff',
        border: '1px solid #ccc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: isRed ? '#d32f2f' : '#222',
        fontSize: dim.fontSize,
        fontWeight: 700,
        lineHeight: 1.2,
        userSelect: 'none',
      }}
    >
      <div>{rank}</div>
      <div style={{ fontSize: '120%' }}>{suitChar}</div>
    </div>
  );
}
