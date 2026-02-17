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
}
