import { generateBoard, type BoardMode, type GameState } from "@hexhaven/shared";
import type { EnginePlayerSeed } from "./engine.js";

/**
 * Persistence for active matches. The board is fully determined by
 * (boardMode, seed) and is regenerated on load instead of being stored,
 * which keeps snapshots small and prevents corruption of topology data.
 * Everything else is plain JSON. Snapshots are written atomically
 * (tmp file + rename) with a schema version.
 */

export const GAME_SCHEMA_VERSION = 1;

export interface StoredGame {
  schemaVersion: number;
  seed: string;
  boardMode: BoardMode;
  players: {
    id: string;
    name: string;
    color: string;
    index: number;
    resources: Record<string, number>;
    devCards: { id: string; type: string; boughtTurn: number }[];
    knightsPlayed: number;
    roads: string[];
    settlements: string[];
    cities: string[];
    boughtThisTurn: number;
    playedDevThisTurn: boolean;
  }[];
  phase: string;
  turnIndex: number;
  turnCount: number;
  rev: number;
  dice: [number, number] | null;
  bank: Record<string, number>;
  devDeck: { id: string; type: string; boughtTurn: number }[];
  robberHex: string;
  pending: unknown;
  offers: unknown[];
  awards: unknown;
  log: unknown[];
  startedAt: number;
  finishedAt: number | null;
  winnerId: string | null;
  setupSequence: string[];
}

export function toStoredGame(state: GameState): StoredGame {
  const { board, ...rest } = state;
  void board;
  return {
    ...rest,
    schemaVersion: GAME_SCHEMA_VERSION,
  } as unknown as StoredGame;
}

export function gameFromStored(stored: StoredGame): GameState {
  if (stored.schemaVersion !== GAME_SCHEMA_VERSION) {
    throw new Error(`Unsupported game snapshot schema version ${stored.schemaVersion}`);
  }
  const board = generateBoard(stored.boardMode, stored.seed);
  return {
    ...(stored as unknown as Omit<GameState, "board" | "schemaVersion">),
    schemaVersion: GAME_SCHEMA_VERSION,
    board,
  } as GameState;
}

/** The original seat seeds, needed to rebuild an engine with matching order. */
export function engineSeedsFromState(state: GameState): EnginePlayerSeed[] {
  return state.players.map((p) => ({ id: p.id, name: p.name, color: p.color }));
}
