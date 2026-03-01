import { ObjectFlyAnimation, useFlyingObjects } from '../../../components/ObjectFlyAnimation';
import type { FlyingObject } from '../../../components/ObjectFlyAnimation';

export type FlyingChip = FlyingObject;

interface ChipFlyAnimationProps {
  chips: FlyingChip[];
  onComplete: (id: string) => void;
}

export function ChipFlyAnimation({ chips, onComplete }: ChipFlyAnimationProps) {
  return <ObjectFlyAnimation objects={chips} onComplete={onComplete} />;
}

export function useFlyingChips() {
  const { objects, addObject, removeObject } = useFlyingObjects();
  return { chips: objects, addChip: addObject, removeChip: removeObject };
}
