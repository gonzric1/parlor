import type { ComponentType } from 'react';
import type { GameMeta } from '@parlor/shared';
import { pokerPlugin } from './poker/index';

export interface GameViewProps {
  publicState: unknown;
  privateState: unknown;
  sendAction: (type: string, payload?: unknown) => void;
  roomCode: string;
  returnToLobby: () => void;
}

export interface ClientGamePlugin {
  meta: GameMeta;
  TVView: ComponentType<GameViewProps>;
  PlayerView: ComponentType<GameViewProps>;
}

export const gameRegistry: Record<string, ClientGamePlugin> = {
  poker: pokerPlugin,
};
