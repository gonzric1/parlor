import type { PokerPlayer } from '../types';

export function computeDealOrder(players: PokerPlayer[], dealerIndex: number): string[] {
  const n = players.length;
  const order: string[] = [];
  for (let i = 1; i <= n; i++) {
    const idx = (dealerIndex + i) % n;
    if (!players[idx].folded) {
      order.push(players[idx].id);
    }
  }
  return order;
}

export const DEAL_DELAY_PER_PLAYER = 400;
export const CARD_FLY_DURATION = 350;
