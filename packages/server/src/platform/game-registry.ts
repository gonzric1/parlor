import type { GameId, ServerGamePlugin } from '@parlor/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = ServerGamePlugin<any, any, any, any, any, any, any>;

const registry = new Map<GameId, AnyPlugin>();

export function registerGame(plugin: AnyPlugin): void {
  registry.set(plugin.meta.id, plugin);
}

export function getGame(id: GameId): AnyPlugin | undefined {
  return registry.get(id);
}

export function getAllGames(): AnyPlugin[] {
  return Array.from(registry.values());
}
