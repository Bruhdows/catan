import { GameEngine } from "../src/game/engine.js";
import {
  edgeId,
  legalRoadEdges,
  legalSettlementVertices,
  type BoardTopology,
  type DevCardType,
  type GameState,
  type Rng,
} from "@hexhaven/shared";

export const COLORS = ["crimson", "azure", "amber", "ivory"] as const;

export interface TestPlayer {
  id: string;
  name: string;
}

/** Deterministic scripted rng: yields given d6 values in order for dice,
 * then falls back to cycling zeros (used for steals with one candidate). */
export function scriptedRng(scripts: number[][]): { rng: Rng; used: number[] } {
  let group = 0;
  let index = 0;
  const used: number[] = [];
  return {
    used,
    rng: {
      next: () => {
        used.push(-1);
        return 0.5;
      },
      int(n: number): number {
        const script = scripts[Math.min(group, scripts.length - 1)] ?? [];
        const value = script[index] ?? 0;
        index++;
        if (index >= (scripts[group]?.length ?? 0) && group < scripts.length - 1) {
          group++;
          index = 0;
        }
        used.push(value);
        return Math.min(value, n - 1);
      },
      shuffle: (items) => [...items],
    },
  };
}

export function makeEngine(playerCount: 3 | 4 = 4, seed = "engine-test", rng?: Rng): GameEngine {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    color: COLORS[i]!,
  }));
  return new GameEngine({ seed, boardMode: "fixed", players, now: () => 1000, ...(rng ? { rng } : {}) });
}

/** Drives the whole initial placement phase, choosing the first legal
 * settlement and the first legal road each time. */
export function completeSetup(engine: GameEngine, players: number): void {
  for (let step = 0; step < players * 4; step++) {
    const pending = engine.state.pending;
    if (pending.type !== "setup") return;
    const pid = pending.player;
    if (!pending.needsRoad) {
      const spots = [...legalSettlementVertices(engine.state, pid, { requireConnection: false })];
      const outcome = engine.applyCommand(pid, { type: "placeSettlement", vertex: spots[0]! });
      if (!outcome.ok) throw new Error(`setup settlement failed: ${outcome.message}`);
    } else {
      const vertex = pending.vertex!;
      const edges = [...legalRoadEdges(engine.state, pid)].filter((e) => {
        const [a, b] = e.split(">");
        return a === vertex || b === vertex;
      });
      const outcome = engine.applyCommand(pid, { type: "placeRoad", edge: edges[0]! });
      if (!outcome.ok) throw new Error(`setup road failed: ${outcome.message}`);
    }
  }
}

/** Gives resources to a player without touching the bank (test helper). */
export function grant(state: GameState, playerId: string, hand: Record<string, number>): void {
  const p = state.players.find((x) => x.id === playerId)!;
  const resources = p.resources as unknown as Record<string, number>;
  for (const [r, n] of Object.entries(hand)) resources[r] = (resources[r] ?? 0) + n;
}

/** scriptedRng values are rng.int(6) outputs; a die shows value + 1.
 * diceScript(total) returns two int outputs that sum to (total - 2). */
export function diceScript(total: number): [number, number] {
  const a = total <= 7 ? Math.max(1, total - 1) : 6;
  const b = total - a;
  return [a - 1, b - 1];
}

/** Completes setup and rolls a scripted non-seven so the game is in the
 * main phase with p0 active. */
export function mainEngine(seed: string, total = 8): GameEngine {
  const rng = scriptedRng([diceScript(total)]);
  const engine = makeEngine(3, seed, rng.rng);
  completeSetup(engine, 3);
  const outcome = engine.applyCommand("p0", { type: "rollDice" });
  if (!outcome.ok) throw new Error(`roll failed: ${outcome.message}`);
  return engine;
}

/** Adds a development card to a player's hand as if bought earlier. */
export function addCard(state: GameState, playerId: string, type: DevCardType, boughtTurn = 0): void {
  const p = state.players.find((x) => x.id === playerId)!;
  p.devCards.push({ id: `test-${type}-${p.devCards.length}`, type, boughtTurn });
}

/** Empties every hand and refills the bank so tests control all resources
 * (the bank starts low so returned cards never hit the 19 cap). */
export function drainHands(engine: GameEngine): void {
  const s = engine.state;
  for (const p of s.players) p.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  s.bank = { brick: 12, lumber: 12, wool: 12, grain: 12, ore: 12 };
}

/** Finds a trail of `n` topology edges starting at `start`, never revisiting
 * a vertex (a simple path), for longest-road fixtures. */
export function chainEdges(
  topology: BoardTopology,
  start: string,
  n: number,
): { edges: string[]; end: string } {
  const visited = new Set<string>([start]);
  const path: string[] = [];
  const dfs = (v: string): boolean => {
    if (path.length === n) return true;
    for (const nb of topology.vertices.get(v)!.neighbors) {
      const eid = edgeId(v, nb);
      if (visited.has(nb) || !topology.edges.has(eid)) continue;
      visited.add(nb);
      path.push(eid);
      if (dfs(nb)) return true;
      path.pop();
      visited.delete(nb);
    }
    return false;
  };
  if (!dfs(start)) throw new Error(`no ${n}-edge chain from ${start}`);
  let end = start;
  for (const eid of path) {
    const [a, b] = eid.split(">") as [string, string];
    end = end === a ? b : a;
  }
  return { edges: path, end };
}
