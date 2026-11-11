import type { Board, BoardHex } from "./board.js";
import { edgeId, edgeVertexIds, type BoardTopology } from "./geometry.js";
import type { GameState, PlayerGame } from "./game.js";
import { canAfford, COSTS, type Resource } from "./resources.js";

export function playerById(state: GameState, id: string): PlayerGame | undefined {
  return state.players.find((p) => p.id === id);
}

/** Vertex ids occupied by any building (settlement or city). */
export function occupiedVertices(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const p of state.players) {
    for (const v of p.settlements) out.add(v);
    for (const v of p.cities) out.add(v);
  }
  return out;
}

/** All vertices forbidden by the settlement distance rule. */
export function restrictedVertices(topology: BoardTopology, occupied: Set<string>): Set<string> {
  const out = new Set<string>(occupied);
  for (const v of occupied) {
    const vertex = topology.vertices.get(v);
    if (!vertex) continue;
    for (const n of vertex.neighbors) out.add(n);
  }
  return out;
}

/** Vertices that touch no land hex (cannot host buildings). */
export function seaOnlyVertices(board: Board): Set<string> {
  const out = new Set<string>();
  for (const [id, v] of board.topology.vertices) {
    if (!v.hexes.some((h) => board.hexes.get(h) !== undefined)) out.add(id);
  }
  return out;
}

function edgeBetween(topology: BoardTopology, a: string, b: string): string {
  // Canonical edge id for two adjacent vertices.
  return edgeId(a, b);
}

/** Whether the player's network connects to this vertex (own building or road). */
function playerOwnsVertexOrRoad(player: PlayerGame, topology: BoardTopology, vertexId: string): boolean {
  if (player.settlements.includes(vertexId) || player.cities.includes(vertexId)) return true;
  const vertex = topology.vertices.get(vertexId);
  if (!vertex) return false;
  for (const n of vertex.neighbors) {
    if (player.roads.includes(edgeBetween(topology, vertexId, n))) return true;
  }
  return false;
}

/** Opponent buildings block road connectivity through a vertex. */
export function vertexBlockedFor(state: GameState, playerId: string, vertexId: string): boolean {
  for (const p of state.players) {
    if (p.id === playerId) continue;
    if (p.settlements.includes(vertexId) || p.cities.includes(vertexId)) return true;
  }
  return false;
}

/**
 * Edges where the player may legally build a road right now. Also used for
 * free roads from the Road Building card.
 */
export function legalRoadEdges(state: GameState, playerId: string): Set<string> {
  const out = new Set<string>();
  const player = playerById(state, playerId);
  if (!player) return out;
  if (player.roads.length >= 15) return out;
  for (const edgeIdStr of state.board.topology.edges.keys()) {
    if (player.roads.includes(edgeIdStr)) continue;
    if (state.players.some((p) => p.roads.includes(edgeIdStr))) continue;
    const [a, b] = edgeVertexIds(edgeIdStr);
    const okA = !vertexBlockedFor(state, playerId, a) && playerOwnsVertexOrRoad(player, state.board.topology, a);
    const okB = !vertexBlockedFor(state, playerId, b) && playerOwnsVertexOrRoad(player, state.board.topology, b);
    if (okA || okB) out.add(edgeIdStr);
  }
  return out;
}

/** Vertices where the player may legally place a new settlement. */
export function legalSettlementVertices(
  state: GameState,
  playerId: string,
  opts: { requireConnection: boolean },
): Set<string> {
  const out = new Set<string>();
  const player = playerById(state, playerId);
  if (!player) return out;
  if (player.settlements.length + player.cities.length >= 5) return out;
  const topology = state.board.topology;
  const forbidden = restrictedVertices(topology, occupiedVertices(state));
  for (const vertexId of topology.vertices.keys()) {
    if (forbidden.has(vertexId)) continue;
    if (!vertexHasLand(topology, state, vertexId)) continue;
    if (opts.requireConnection) {
      if (!playerOwnsVertexOrRoad(player, topology, vertexId)) continue;
      if (vertexBlockedFor(state, playerId, vertexId)) continue;
    }
    out.add(vertexId);
  }
  return out;
}

function vertexHasLand(topology: BoardTopology, state: GameState, vertexId: string): boolean {
  const v = topology.vertices.get(vertexId);
  if (!v) return false;
  return v.hexes.some((h) => state.board.hexes.get(h)?.terrain !== "water" && state.board.hexes.get(h) !== undefined);
}

/** Vertices where the player may upgrade a settlement to a city. */
export function legalCityUpgrades(state: GameState, playerId: string): Set<string> {
  const player = playerById(state, playerId);
  if (!player) return new Set();
  if (player.cities.length >= 4) return new Set();
  return new Set(player.settlements);
}

/**
 * Longest uninterrupted road trail for a player: a depth-first search over
 * the player's road graph that never reuses an edge. Opponent settlements
 * and cities interrupt travel through their vertex. With at most 15 roads
 * exhaustive trail search is fast.
 */
export function longestRoadLength(state: GameState, playerId: string): number {
  const player = playerById(state, playerId);
  if (!player || player.roads.length === 0) return 0;
  const adjacency = new Map<string, string[]>(); // vertex -> incident edge ids
  const endpoints = new Map<string, [string, string]>();
  for (const id of player.roads) {
    const [a, b] = edgeVertexIds(id);
    endpoints.set(id, [a, b]);
    for (const v of [a, b]) {
      const list = adjacency.get(v) ?? [];
      list.push(id);
      adjacency.set(v, list);
    }
  }

  const isBlocked = (vertexId: string) => vertexBlockedFor(state, playerId, vertexId);

  let best = 0;
  const used = new Set<string>();
  const visit = (vertexId: string, length: number): void => {
    if (length > best) best = length;
    for (const edgeIdStr of adjacency.get(vertexId) ?? []) {
      if (used.has(edgeIdStr)) continue;
      const [a, b] = endpoints.get(edgeIdStr)!;
      const next = a === vertexId ? b : a;
      // A rival building terminates a trail at this endpoint, but the
      // final incident road still counts toward its length.
      if (isBlocked(next)) {
        best = Math.max(best, length + 1);
        continue;
      }
      used.add(edgeIdStr);
      visit(next, length + 1);
      used.delete(edgeIdStr);
    }
  };

  for (const id of player.roads) {
    const [a, b] = endpoints.get(id)!;
    used.add(id);
    // A trail may not start (or pass) at a vertex blocked by a rival
    // settlement — the rival building interrupts the road there.
    if (!isBlocked(a)) visit(a, 1);
    if (!isBlocked(b)) visit(b, 1);
    used.delete(id);
  }
  return best;
}

/** Ports the player can use, keyed by resource (null = generic). */
export function playerPortRatios(state: GameState, playerId: string): Map<Resource | null, 2 | 3> {
  const out = new Map<Resource | null, 2 | 3>();
  const player = playerById(state, playerId);
  if (!player) return out;
  const owned = new Set<string>([...player.settlements, ...player.cities]);
  for (const port of state.board.ports) {
    if (!port.vertices.some((v) => owned.has(v))) continue;
    const current = out.get(port.resource);
    if (current === undefined || port.ratio < current) out.set(port.resource, port.ratio);
  }
  return out;
}

/** Best bank trade ratio the player can get for a resource right now. */
export function bankTradeRatio(state: GameState, playerId: string, give: Resource): 2 | 3 | 4 {
  const ratios = playerPortRatios(state, playerId);
  if (ratios.get(give) === 2) return 2;
  if (ratios.get(null) === 3) return 3;
  return 4;
}

/** Visible points (buildings + public awards). */
export function publicPoints(state: GameState, player: PlayerGame): number {
  let points = player.settlements.length + player.cities.length * 2;
  if (state.awards.longestRoad.playerId === player.id) points += 2;
  if (state.awards.largestArmy.playerId === player.id) points += 2;
  return points;
}

/** Full points including hidden victory point cards. */
export function totalPoints(state: GameState, player: PlayerGame): number {
  return publicPoints(state, player) + player.devCards.filter((c) => c.type === "victoryPoint").length;
}

export function affordability(hand: Parameters<typeof canAfford>[0]): {
  road: boolean;
  settlement: boolean;
  city: boolean;
  development: boolean;
} {
  return {
    road: canAfford(hand, COSTS.road),
    settlement: canAfford(hand, COSTS.settlement),
    city: canAfford(hand, COSTS.city),
    development: canAfford(hand, COSTS.development),
  };
}

/** Resource produced by a hex (null for desert/water). */
export function hexResource(hex: BoardHex): Resource | null {
  switch (hex.terrain) {
    case "forest":
      return "lumber";
    case "hills":
      return "brick";
    case "pasture":
      return "wool";
    case "fields":
      return "grain";
    case "mountains":
      return "ore";
    default:
      return null;
  }
}
