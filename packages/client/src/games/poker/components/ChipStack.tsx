interface ChipStackProps {
  amount: number;
}

export function ChipStack({ amount }: ChipStackProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #ffd700, #ff8f00)',
          border: '1px solid #e6a100',
          flexShrink: 0,
        }}
      />
      {amount.toLocaleString()}
    </span>
  );
}
