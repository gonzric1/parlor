import { ResourceBadge } from '../../../components/ResourceBadge';

interface ChipStackProps {
  amount: number;
}

export function ChipStack({ amount }: ChipStackProps) {
  return <ResourceBadge amount={amount} />;
}
