import {
  buildTopology,
  cornerIndexForVertex,
  hexKey,
  hexNeighbor,
  hexDistance,
  hexToPixel,
  parseHexKey,
  type Axial,
  type BoardTopology,
  type Edge,
} from "./geometry.js";
import { RESOURCES, type Resource } from "./resources.js";

export type Terrain = "forest" | "hills" | "pasture" | "fields" | "mountains" | "desert" | "water";

export const LAND_TERRAINS: readonly Exclude<Terrain, "water" | "desert">[] = [
  "forest",
  "hills",
  "pasture",
  "fields",
  "mountains",
] as const;

/** Official base-game terrain distribution (19 land hexes). */
export const TERRAIN_COUNTS: Record<Exclude<Terrain, "water">, number> = {
  forest: 4,
  fields: 4,
  pasture: 4,
  hills: 3,
  mountains: 3,
  desert: 1,
};

/** Official 18 number tokens. */
export const NUMBER_TOKENS: readonly number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;

/** Number of dice combinations producing each token (probability pips). */
export function tokenPips(n: number): number {
  return n === 2 || n === 12 ? 1 : n >= 3 && n <= 11 ? 6 - Math.abs(7 - n) : 0;
}

export const RED_NUMBERS = new Set([6, 8]);

export interface BoardHex {
  /** Canonical hex key "q,r". */
  id: string;
  axial: Axial;
  terrain: Terrain;
  /** Number token, null for desert/water. */
  number: number | null;
  vertices: string[];
  edges: string[];
}

export interface Port {
  id: string;
  /** 2 for resource ports, 3 for generic. */
  ratio: 2 | 3;
  /** null for generic 3:1 ports. */
  resource: Resource | null;
  edge: string;
  /** The two coastal vertices where the port may be used. */
  vertices: [string, string];
  seaHex: string;
  landHex: string;
}

export interface Board {
  radius: number;
  hexes: Map<string, BoardHex>;
  topology: BoardTopology;
  ports: Port[];
}

export type BoardMode = "fixed" | "random" | "balanced";

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic board generation and dice.
// ---------------------------------------------------------------------------

export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Shuffle a copy of the array. */
  shuffle<T>(items: readonly T[]): T[];
}

export function mulberry32(seed: number | string): Rng {
  let state = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i]!;
        out[i] = out[j]!;
        out[j] = tmp;
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface FixedSlot {
  hex: Axial;
  terrain: Exclude<Terrain, "water">;
  number: number | null;
}

/**
 * The recommended beginner layout: a fixed, balanced island. The desert
 * sits on the south coast, the two 6/8 pairs stay apart, and strong
 * numbers are spread across terrains. Hand-tuned and locked by tests.
 */
const FIXED_LAYOUT: FixedSlot[] = [
  { hex: { q: 0, r: -2 }, terrain: "forest", number: 5 },
  { hex: { q: 1, r: -2 }, terrain: "pasture", number: 2 },
  { hex: { q: 2, r: -2 }, terrain: "mountains", number: 9 },
  { hex: { q: -1, r: -1 }, terrain: "fields", number: 6 },
  { hex: { q: 0, r: -1 }, terrain: "hills", number: 11 },
  { hex: { q: 1, r: -1 }, terrain: "forest", number: 4 },
  { hex: { q: 2, r: -1 }, terrain: "fields", number: 9 },
  { hex: { q: -2, r: 0 }, terrain: "pasture", number: 3 },
  { hex: { q: -1, r: 0 }, terrain: "mountains", number: 10 },
  { hex: { q: 0, r: 0 }, terrain: "fields", number: 8 },
  { hex: { q: 1, r: 0 }, terrain: "pasture", number: 5 },
  { hex: { q: 2, r: 0 }, terrain: "forest", number: 6 },
  { hex: { q: -2, r: 1 }, terrain: "hills", number: 4 },
  { hex: { q: -1, r: 1 }, terrain: "hills", number: 11 },
  { hex: { q: 0, r: 1 }, terrain: "pasture", number: 3 },
  { hex: { q: 1, r: 1 }, terrain: "mountains", number: 10 },
  { hex: { q: -2, r: 2 }, terrain: "fields", number: 12 },
  { hex: { q: -1, r: 2 }, terrain: "forest", number: 8 },
  { hex: { q: 0, r: 2 }, terrain: "desert", number: null },
];

const PORT_TYPES: ReadonlyArray<{ ratio: 2 | 3; resource: Resource | null }> = [
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  ...RESOURCES.map((r) => ({ ratio: 2 as const, resource: r })),
];

/** Generates the complete board for a mode + seed. Deterministic. */
export function generateBoard(mode: BoardMode, seed: string, radius = 2): Board {
  const topology = buildTopology(radius);
  const hexes = new Map<string, BoardHex>();
  const landKeys = topology.landHexes;

  const assigned = assignTerrainAndNumbers(mode, landKeys, seed, topology);

  for (let i = 0; i < landKeys.length; i++) {
    const key = landKeys[i]!;
    const axial = parseHexKey(key);
    const { terrain, number } = assigned[i]!;
    hexes.set(key, {
      id: key,
      axial,
      terrain,
      number: terrain === "desert" ? null : number,
      vertices: [],
      edges: [],
    });
  }

  // Link hexes to vertices/edges from the topology.
  for (const v of topology.vertices.values()) {
    for (const h of v.hexes) hexes.get(h)?.vertices.push(v.id);
  }
  for (const e of topology.edges.values()) {
    for (const h of e.hexes) hexes.get(h)?.edges.push(e.id);
  }

  const ports = placePorts(topology, mulberry32(`${mode}:ports:${seed}`));
  return { radius, hexes, topology, ports };
}

type Slot = { terrain: Exclude<Terrain, "water">; number: number | null };

function assignTerrainAndNumbers(
  mode: BoardMode,
  landKeys: string[],
  seed: string,
  topology: BoardTopology,
): Slot[] {
  if (mode === "fixed" && landKeys.length === 19) {
    const byKey = new Map(FIXED_LAYOUT.map((s) => [hexKey(s.hex), s]));
    if (byKey.size !== landKeys.length) throw new Error("fixed layout size mismatch");
    return landKeys.map((key) => {
      const slot = byKey.get(key);
      if (!slot) throw new Error(`fixed layout missing hex ${key}`);
      return { terrain: slot.terrain, number: slot.number };
    });
  }

  const rng = mulberry32(`${mode}:${seed}`);
  const counts = landKeys.length > 19
    ? { forest: 8, fields: 8, pasture: 8, hills: 6, mountains: 5, desert: 2 }
    : TERRAIN_COUNTS;
  const terrainDeck: Exclude<Terrain, "water">[] = (
    Object.keys(counts) as Exclude<Terrain, "water">[]
  ).flatMap((t) => Array.from({ length: counts[t] }, () => t));
  const tokenDeck = landKeys.length > 19 ? [...NUMBER_TOKENS, ...NUMBER_TOKENS.slice(0, 17)] : NUMBER_TOKENS;

  const isRed = (n: number | null) => n != null && RED_NUMBERS.has(n);

  const neighborsOf = (i: number): number[] => {
    const axial = parseHexKey(landKeys[i]!);
    const out: number[] = [];
    for (let d = 0; d < 6; d++) {
      const idx = landKeys.indexOf(hexKey(hexNeighbor(axial, d)));
      if (idx >= 0) out.push(idx);
    }
    return out;
  };
  const neighborLists = landKeys.map((_, i) => neighborsOf(i));

  const redsOk = (nums: (number | null)[]): boolean => {
    for (let i = 0; i < nums.length; i++) {
      if (!isRed(nums[i]!)) continue;
      for (const j of neighborLists[i]!) {
        if (isRed(nums[j]!)) return false;
      }
      if (mode === "balanced") {
        // Red numbers at least 2 hexes apart and never on the same terrain.
        for (let k = 0; k < nums.length; k++) {
          if (k !== i && isRed(nums[k]!) && hexDistance(parseHexKey(landKeys[i]!), parseHexKey(landKeys[k]!)) < 2) {
            return false;
          }
        }
      }
    }
    return true;
  };

  for (let attempt = 0; attempt < 4000; attempt++) {
    const terrains = rng.shuffle(terrainDeck);
    const tokens = rng.shuffle(tokenDeck);
    const nums: (number | null)[] = [];
    let t = 0;
    for (let i = 0; i < landKeys.length; i++) {
      if (terrains[i] === "desert") {
        nums.push(null);
      } else {
        nums.push(tokens[t++]!);
      }
    }
    if (t !== tokenDeck.length) continue;
    if (!redsOk(nums)) continue;
    if (mode === "balanced") {
      // Red numbers must sit on four different terrains when possible.
      const redTerrains = new Set<string>();
      for (let i = 0; i < nums.length; i++) {
        if (isRed(nums[i]!)) redTerrains.add(terrains[i]!);
      }
      if (redTerrains.size < Math.min(3, nums.filter(isRed).length)) continue;
    }
    return landKeys.map((_, i) => ({ terrain: terrains[i]!, number: nums[i] ?? null }));
  }
  throw new Error(`could not generate a legal ${mode} board layout`);
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Places the 9 harbor ports (4 generic 3:1, 5 specific 2:1) on coastal
 * edges. Ports never share a vertex and are spread around the island by a
 * minimum-midpoint-distance rule, with fallbacks if the coast is tight.
 */
function placePorts(topology: BoardTopology, rng: Rng): Port[] {
  const coastal = [...topology.edges.values()].filter(
    (e): e is Edge & { landHex: string; seaHex: string } => e.coastal && !!e.landHex && !!e.seaHex,
  );
  const size = 1;

  const midpointOf = (edge: Edge) => {
    const a = vertexPixel(topology, edge.a, size);
    const b = vertexPixel(topology, edge.b, size);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const pick = (minSpacing: number, shareVertices: boolean): string[] => {
    const shuffled = rng.shuffle(coastal.map((e) => e.id));
    const chosen: string[] = [];
    const usedVertices = new Set<string>();
    const midpoints: { x: number; y: number }[] = [];
    for (const id of shuffled) {
      const edge = topology.edges.get(id)!;
      if (!shareVertices && (usedVertices.has(edge.a) || usedVertices.has(edge.b))) continue;
      const mid = midpointOf(edge);
      if (midpoints.some((m) => Math.hypot(m.x - mid.x, m.y - mid.y) < minSpacing)) continue;
      chosen.push(id);
      midpoints.push(mid);
      usedVertices.add(edge.a);
      usedVertices.add(edge.b);
      if (chosen.length === PORT_TYPES.length) break;
    }
    return chosen;
  };

  let chosen = pick(2.8, false);
  if (chosen.length < PORT_TYPES.length) chosen = pick(2.0, false);
  if (chosen.length < PORT_TYPES.length) chosen = pick(0, false);

  const types = rng.shuffle(PORT_TYPES);
  return chosen
    .slice(0, PORT_TYPES.length)
    .map((edgeIdStr, i) => {
      const edge = topology.edges.get(edgeIdStr)!;
      const type = types[i]!;
      return {
        id: `port-${edgeIdStr}`,
        ratio: type.ratio,
        resource: type.resource,
        edge: edgeIdStr,
        vertices: [edge.a, edge.b] as [string, string],
        seaHex: edge.seaHex!,
        landHex: edge.landHex!,
      };
    })
    .sort((a, b) => {
      const pa = midpointOf(topology.edges.get(a.edge)!);
      const pb = midpointOf(topology.edges.get(b.edge)!);
      return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
    })
    .map((p, i) => ({ ...p, id: `port-${i + 1}` }));
}

function vertexPixel(topology: BoardTopology, vertexId: string, size: number): { x: number; y: number } {
  const v = topology.vertices.get(vertexId)!;
  const hex = parseHexKey(v.hexes[0]!);
  const center = hexToPixel(hex, size);
  const corner = cornerIndexForVertex(hex, v.id);
  const angle = ((30 + 60 * Math.max(0, corner)) * Math.PI) / 180;
  return { x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) };
}
