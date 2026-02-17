import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
}

export function QRCode({ value, size = 180 }: QRCodeProps) {
  return (
    <div
      style={{
        background: '#fff',
        padding: 12,
        borderRadius: 8,
        display: 'inline-block',
      }}
    >
      <QRCodeSVG value={value} size={size} />
    </div>
  );
}
