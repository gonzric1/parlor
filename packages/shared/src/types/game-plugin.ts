import type { PlayerId, GameMeta } from './platform.js';

export type TurnModel =
  | { type: 'sequential'; timeoutMs?: number }
  | { type: 'simultaneous'; timeoutMs?: number }
  | { type: 'mixed'; timeoutMs?: number };

export interface GameSettingDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  default: unknown;
  options?: { label: string; value: unknown }[];
  min?: number;
  max?: number;
}

export interface GameAction<TAction = unknown> {
  playerId: PlayerId;
  type: string;
  payload: TAction;
}

export type ActionResult =
  | { valid: true }
  | { valid: false; reason: string };

export interface GameResult<TPlayerResult = unknown> {
  winners: PlayerId[];
  playerResults: Map<PlayerId, TPlayerResult>;
  summary: string;
}

export interface ServerGamePlugin<
  TState = unknown,
  TPublic = unknown,
  TPlayerPrivate = unknown,
  TPhase extends string = string,
  TAction = unknown,
  TSettings = Record<string, unknown>,
  TPlayerResult = unknown
> {
  readonly meta: GameMeta;
  readonly turnModel: TurnModel;
  readonly settingDefs: GameSettingDef[];

  initialize(playerIds: PlayerId[], settings: TSettings): TState;
  getStateViews(state: TState): {
    publicState: TPublic;
    playerStates: Map<PlayerId, TPlayerPrivate>;
  };
  getPhase(state: TState): TPhase;
  getActivePlayerIds(state: TState): PlayerId[];
  validateAction(state: TState, action: GameAction<TAction>): ActionResult;
  applyAction(state: TState, action: GameAction<TAction>): TState;
  getTimerDuration(state: TState): number | null;
  onTimeout(state: TState): TState;
  checkGameOver(state: TState): GameResult<TPlayerResult> | null;
  onPlayerDisconnect(state: TState, playerId: PlayerId): TState;
  onPlayerReconnect(state: TState, playerId: PlayerId): TState;

  /** Called after each action. Return timer config if the platform should set a timer, or null. */
  getPostActionTimer?(state: TState): { durationMs: number; phase: TPhase } | null;

  /** Called when a round/hand ends but the game isn't over. Return the next round's initial state, or null if no auto-advance. */
  startNextRound?(state: TState): TState | null;

  /** Delay in ms before startNextRound is called (e.g., 5s to show results). Default 0. */
  nextRoundDelay?: number;

  /** Called when a player joins mid-game. Return updated state with the new player added. */
  onPlayerJoin?(state: TState, playerId: PlayerId, playerName: string, settings: TSettings): TState;

  /** Called when a player leaves mid-game. Return updated state with the player removed. */
  onPlayerLeave?(state: TState, playerId: PlayerId): TState;

  /** Return false if the player cannot leave right now (e.g., has live cards). */
  canPlayerLeave?(state: TState, playerId: PlayerId): boolean;
}
