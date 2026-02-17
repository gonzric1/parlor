declare module 'phe' {
  export function evaluateCards(cards: string[]): number;
  export function evaluateCardCodes(codes: number[]): number;
  export function evaluateBoard(board: string): number;
  export function rankCards(cards: string[]): number;
  export function rankCardCodes(codes: number[]): number;
  export function handRank(value: number): number;
  export function rankDescription(rank: number): string;
  export function cardCode(card: string): number;
  export function cardCodes(cards: string[]): number[];
  export function stringifyCardCode(code: number): string;
  export const ranks: {
    STRAIGHT_FLUSH: number;
    FOUR_OF_A_KIND: number;
    FULL_HOUSE: number;
    FLUSH: number;
    STRAIGHT: number;
    THREE_OF_A_KIND: number;
    TWO_PAIR: number;
    ONE_PAIR: number;
    HIGH_CARD: number;
  };
}
