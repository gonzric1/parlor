import { useState, useEffect } from 'react';

interface BettingControlsProps {
  isMyTurn: boolean;
  myChips: number;
  myCurrentBet: number;
  currentBet: number;
  minRaise: number;
  sendAction: (type: string, payload?: unknown) => void;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'min(10px, 2vh)',
    width: '100%',
  },
  buttonRow: {
    display: 'flex',
    gap: 'min(8px, 2vw)',
  },
  button: {
    flex: 1,
    padding: 'clamp(10px, 2.5vh, 16px) clamp(4px, 1vw, 8px)',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 700,
    fontSize: 'clamp(0.75rem, 2.5vw, 1rem)',
    cursor: 'pointer',
    color: '#eee',
  },
  fold: {
    background: '#555',
  },
  check: {
    background: '#0f3460',
  },
  raise: {
    background: '#e94560',
  },
  allIn: {
    background: '#b71c1c',
  },
  disabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  raiseRow: {
    display: 'flex',
    gap: 'min(8px, 2vw)',
    alignItems: 'center',
  },
  slider: {
    flex: 1,
    accentColor: '#e94560',
    height: '32px',
  },
  raiseInput: {
    width: 'clamp(60px, 16vw, 80px)',
    padding: 'clamp(6px, 1.5vh, 10px)',
    borderRadius: '6px',
    border: '1px solid #0f3460',
    background: '#16213e',
    color: '#eee',
    textAlign: 'center' as const,
    fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
  },
  notYourTurn: {
    textAlign: 'center' as const,
    color: '#888',
    padding: '16px',
    fontSize: '0.9rem',
  },
};

export function BettingControls({
  isMyTurn,
  myChips,
  myCurrentBet,
  currentBet,
  minRaise,
  sendAction,
}: BettingControlsProps) {
  const callAmount = currentBet - myCurrentBet;
  const canCheck = callAmount === 0;
  const isBet = currentBet === 0; // No one has bet yet this round
  const minBetOrRaise = isBet ? minRaise : currentBet + minRaise;
  const effectiveMin = Math.min(minBetOrRaise, myChips + myCurrentBet);
  const maxRaise = myChips + myCurrentBet;

  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);

  // Reset raise amount when min changes (new round, new turn)
  useEffect(() => {
    setRaiseAmount(effectiveMin);
  }, [effectiveMin]);

  return (
    <div style={styles.container}>
      <div style={styles.raiseRow}>
        <input
          type="range"
          style={styles.slider}
          min={effectiveMin}
          max={maxRaise}
          value={Math.min(raiseAmount, maxRaise)}
          onChange={(e) => setRaiseAmount(Number(e.target.value))}
        />
        <input
          type="number"
          style={styles.raiseInput}
          value={raiseAmount}
          min={effectiveMin}
          max={maxRaise}
          onChange={(e) => setRaiseAmount(Number(e.target.value))}
        />
      </div>
      <div style={styles.buttonRow}>
        <button
          style={{ ...styles.button, ...styles.fold }}
          onClick={() => sendAction('fold')}
        >
          Fold
        </button>
        <button
          style={{ ...styles.button, ...styles.check }}
          onClick={() => {
            if (canCheck) {
              sendAction('check');
            } else {
              sendAction('call');
            }
          }}
        >
          {canCheck ? 'Check' : `Call ${callAmount}`}
        </button>
        <button
          style={{ ...styles.button, ...styles.raise }}
          onClick={() => sendAction('raise', { amount: raiseAmount })}
        >
          {isBet ? `Bet ${raiseAmount}` : `Raise ${raiseAmount}`}
        </button>
        <button
          style={{ ...styles.button, ...styles.allIn }}
          onClick={() => sendAction('all-in')}
        >
          All In
        </button>
      </div>
    </div>
  );
}
