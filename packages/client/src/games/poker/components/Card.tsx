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
  small: { width: 44, height: 62, fontSize: '0.75rem' },
  medium: { width: 56, height: 78, fontSize: '0.9rem' },
  large: { width: 72, height: 100, fontSize: '1.1rem' },
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
            width: dim.width - 12,
            height: dim.height - 12,
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
      <div style={{ fontSize: `calc(${dim.fontSize} * 1.2)` }}>{suitChar}</div>
    </div>
  );
}
