import type { GameMeta } from '@parlor/shared';
import type { ClientGamePlugin } from '../registry';
import { TVView } from './TVView';
import { PlayerView } from './PlayerView';

export const pokerPlugin: ClientGamePlugin = {
  meta: {
    id: 'poker',
    name: "Texas Hold'em",
    description: 'Classic poker',
    minPlayers: 2,
    maxPlayers: 8,
  } as GameMeta,
  TVView,
  PlayerView,
};
