/**
 * Canonical hexagonal board geometry.
 *
 * The board is a graph of three kinds of canonical locations:
 *  - hexes   (terrain tiles, identified by axial coordinates)
 *  - vertices (corners where up to three hexes meet — buildings go here)
 *  - edges    (borders between two adjacent hexes — roads go here)
 *
 * A physical corner shared by three hexes is exactly ONE vertex object;
 * its canonical id is the sorted list of the hexes that meet there.
 * All placement validation and road connectivity operate on this graph,
 * never on pixel positions. Pixel positions are derived for rendering.
 */

export interface Axial {
  q: number;
  r: number;
}

export function hexKey(a: Axial): string {
  return `${a.q},${a.r}`;
}

export function parseHexKey(key: string): Axial {
  const [q, r] = key.split(",").map(Number);
  return { q: q!, r: r! };
}

/** The six neighbor directions of a pointy-top hex, clockwise from east. */
export const HEX_DIRS: readonly Axial[] = [
  { q: 1, r: 0 }, // E
  { q: 1, r: -1 }, // NE
  { q: 0, r: -1 }, // NW
  { q: -1, r: 0 }, // W
  { q: -1, r: 1 }, // SW
  { q: 0, r: 1 }, // SE
];

export function hexNeighbor(a: Axial, dir: number): Axial {
  const d = HEX_DIRS[dir % 6]!;
  return { q: a.q + d.q, r: a.r + d.r };
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function addAxial(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

/** All hexes with hexDistance(a, hex) <= radius. */
export function hexSpiral(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [center];
  let ring: Axial[] = [center];
  for (let k = 1; k <= radius; k++) {
    const next: Axial[] = [];
    for (const hex of ring) {
      for (let d = 0; d < 6; d++) {
        const n = hexNeighbor(hex, d);
        if (hexDistance(center, n) === k && !out.some((h) => h.q === n.q && h.r === n.r)) {
          out.push(n);
          next.push(n);
        }
      }
    }
    ring = next;
  }
  return out;
}

export interface Vertex {
  /** Canonical id: sorted, comma-joined hex keys meeting at this corner. */
  id: string;
  /** Hex keys meeting at this vertex (1..3). */
  hexes: string[];
  /** Adjacent vertex ids, ordered. */
  neighbors: string[];
  /** True when at least one adjacent hex is land. */
  coastal: boolean;
  /** Sea hexes this vertex touches (for ports / rendering). */
  seaHexes: string[];
}

export interface Edge {
  /** Canonical id: "vertexA>vertexB" with A < B. */
  id: string;
  a: string;
  b: string;
  /** Hex keys on either side (1 for the outer frame edges, usually 2). */
  hexes: string[];
  /** True when exactly one adjacent hex is land (harbor coastline). */
  coastal: boolean;
  landHex: string | null;
  seaHex: string | null;
}

export interface BoardTopology {
  /** Land hex keys, in spiral order from the center. */
  landHexes: string[];
  /** Sea hex keys adjacent to the island. */
  seaHexes: string[];
  vertices: Map<string, Vertex>;
  edges: Map<string, Edge>;
}

/**
 * Builds the canonical topology for a hex island of the given radius
 * surrounded by one sea ring. Deterministic and frame-independent.
 */
export function buildTopology(radius: number, seaRing = 1): BoardTopology {
  const land = hexSpiral({ q: 0, r: 0 }, radius);
  const landKeys = land.map(hexKey);
  const landSet = new Set(landKeys);

  const sea = new Set<string>();
  for (const hex of land) {
    for (let d = 0; d < 6; d++) {
      const n = hexNeighbor(hex, d);
      const key = hexKey(n);
      if (!landSet.has(key)) sea.add(key);
    }
  }
  const seaKeys = [...sea];

  const vertices = new Map<string, Vertex>();
  const edges = new Map<string, Edge>();

  const vertexId = (hexKeys: string[]) => [...hexKeys].sort().join("|");

  const cornerHexes = (hex: Axial, corner: number): string[] => {
    // Corner i of a pointy-top hex is shared with the neighbors across
    // the edges clockwise adjacent to it: dirs[i] and dirs[(i+1) % 6].
    const a = addAxial(hex, HEX_DIRS[corner % 6]!);
    const b = addAxial(hex, HEX_DIRS[(corner + 1) % 6]!);
    return [hexKey(hex), hexKey(a), hexKey(b)];
  };

  const edgeHexes = (hex: Axial, edge: number): string[] => [hexKey(hex), hexKey(hexNeighbor(hex, edge))];

  for (const hex of land) {
    for (let i = 0; i < 6; i++) {
      const corner = cornerHexes(hex, i);
      const id = vertexId(corner);
      if (!vertices.has(id)) {
        vertices.set(id, { id, hexes: [...corner].sort(), neighbors: [], coastal: false, seaHexes: [] });
      }
    }
    for (let i = 0; i < 6; i++) {
      const pair = edgeHexes(hex, i);
      // Edge i runs between corners (i-1) and i.
      const aId = vertexId(cornerHexes(hex, (i + 5) % 6));
      const bId = vertexId(cornerHexes(hex, i));
      const id = edgeId(aId, bId);
      if (!edges.has(id)) {
        edges.set(id, { id, a: aId, b: bId, hexes: pair, coastal: false, landHex: null, seaHex: null });
      }
    }
  }

  // Cross-link vertices and edges.
  for (const edge of edges.values()) {
    const a = vertices.get(edge.a)!;
    const b = vertices.get(edge.b)!;
    a.neighbors.push(edge.b);
    b.neighbors.push(edge.a);
    if (edge.hexes.length === 2) edge.coastal = false;
  }

  // Classify vertices/edges against land vs sea, including the outer frame
  // where a vertex or edge may only touch one land hex.
  const isLand = (key: string) => landSet.has(key);
  for (const v of vertices.values()) {
    const landCount = v.hexes.filter(isLand).length;
    v.coastal = landCount > 0 && landCount < 3;
    if (landCount === 0) continue;
    for (const h of v.hexes) {
      if (!isLand(h)) v.seaHexes.push(h);
    }
  }
  for (const e of edges.values()) {
    const landSides = e.hexes.filter(isLand);
    if (landSides.length === 1) {
      e.coastal = true;
      e.landHex = landSides[0]!;
      e.seaHex = e.hexes.find((h) => !isLand(h)) ?? null;
    }
  }

  // Drop vertices and edges that touch no land at all (open sea).
  for (const [id, v] of vertices) if (!v.hexes.some(isLand)) vertices.delete(id);
  for (const [id, e] of edges) if (!e.hexes.some(isLand)) edges.delete(id);
  // Prune dangling neighbor references.
  for (const v of vertices.values()) {
    v.neighbors = v.neighbors.filter((n) => vertices.has(n));
  }

  return { landHexes: landKeys, seaHexes: seaKeys, vertices, edges };
}

export function edgeId(a: string, b: string): string {
  return a < b ? `${a}>${b}` : `${b}>${a}`;
}

export function edgeVertexIds(id: string): [string, string] {
  return id.split(">") as [string, string];
}

/**
 * Pixel position helpers (pointy-top hexes). Pure math — used only for
 * rendering, never for game rules.
 */
export function hexToPixel(a: Axial, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (a.q + a.r / 2);
  const y = size * 1.5 * a.r;
  return { x, y };
}

export const CORNER_ANGLES: readonly number[] = [30, 90, 150, 210, 270, 330];

/** Pixel position of corner `i` of the hex at `a`. */
export function cornerPixel(a: Axial, i: number, size: number): { x: number; y: number } {
  const center = hexToPixel(a, size);
  const deg = (CORNER_ANGLES[i % 6]! * Math.PI) / 180;
  return {
    x: center.x + size * Math.cos(deg),
    y: center.y + size * Math.sin(deg),
  };
}

/**
 * Which corner of `hex` corresponds to the given canonical vertex id.
 * Returns -1 when the vertex does not belong to the hex.
 */
export function cornerIndexForVertex(hex: Axial, vertexIdStr: string): number {
  for (let i = 0; i < 6; i++) {
    const a = addAxial(hex, HEX_DIRS[i % 6]!);
    const b = addAxial(hex, HEX_DIRS[(i + 1) % 6]!);
    const id = [hexKey(hex), hexKey(a), hexKey(b)].sort().join("|");
    if (id === vertexIdStr) return i;
  }
  return -1;
}
