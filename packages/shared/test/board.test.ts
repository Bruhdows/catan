import { describe, expect, it } from "vitest";
import {
  generateBoard,
  mulberry32,
  NUMBER_TOKENS,
  RED_NUMBERS,
  TERRAIN_COUNTS,
  EXPANDED_TERRAIN_COUNTS,
  EXPANDED_NUMBER_TOKENS,
  GRAND_TERRAIN_COUNTS,
  GRAND_NUMBER_TOKENS,
  tokenPips,
  type BoardMode,
} from "../src/index.js";

describe("board generation", () => {
  it.each<BoardMode>(["fixed", "random", "balanced"])("mode %s uses the official distribution", (mode) => {
    const board = generateBoard(mode, "test-seed");
    expect(board.hexes.size).toBe(19);
    const counts: Record<string, number> = {};
    let numbered = 0;
    for (const hex of board.hexes.values()) {
      counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
      if (hex.number != null) numbered++;
    }
    expect(counts).toEqual(TERRAIN_COUNTS);
    expect(numbered).toBe(18);
  });

  it.each<BoardMode>(["random", "balanced"])("mode %s distributes the official number tokens", (mode) => {
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const board = generateBoard(mode, seed);
      const numbers = [...board.hexes.values()].flatMap((h) => (h.number == null ? [] : [h.number])).sort((a, b) => a - b);
      expect(numbers).toEqual([...NUMBER_TOKENS].sort((a, b) => a - b));
    }
  });

  it.each<BoardMode>(["random", "balanced"])("mode %s never puts adjacent 6 and 8", (mode) => {
    for (let i = 0; i < 20; i++) {
      const board = generateBoard(mode, `adjacent-${i}`);
      for (const hex of board.hexes.values()) {
        if (hex.number == null || !RED_NUMBERS.has(hex.number)) continue;
        for (const v of hex.vertices) {
          for (const otherHexKey of board.topology.vertices.get(v)!.hexes) {
            const other = board.hexes.get(otherHexKey);
            if (other && other.id !== hex.id && other.number != null) {
              expect(RED_NUMBERS.has(other.number) ? other.number : 0).not.toBe(hex.number);
            }
          }
        }
      }
    }
  });

  it("balanced keeps red numbers apart and on distinct terrains", () => {
    for (let i = 0; i < 20; i++) {
      const board = generateBoard("balanced", `bal-${i}`);
      const reds = [...board.hexes.values()].filter((h) => h.number != null && RED_NUMBERS.has(h.number));
      expect(reds).toHaveLength(4);
      for (let a = 0; a < reds.length; a++) {
        for (let b = a + 1; b < reds.length; b++) {
          const d = Math.max(
            Math.abs(reds[a]!.axial.q - reds[b]!.axial.q),
            Math.abs(reds[a]!.axial.r - reds[b]!.axial.r),
            Math.abs(reds[a]!.axial.q + reds[a]!.axial.r - reds[b]!.axial.q - reds[b]!.axial.r),
          );
          expect(d).toBeGreaterThanOrEqual(2);
        }
      }
      expect(new Set(reds.map((h) => h.terrain)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("is deterministic per seed", () => {
    const a = generateBoard("random", "det");
    const b = generateBoard("random", "det");
    expect([...a.hexes.values()].map((h) => [h.id, h.terrain, h.number])).toEqual(
      [...b.hexes.values()].map((h) => [h.id, h.terrain, h.number]),
    );
    expect(a.ports).toEqual(b.ports);
    expect(generateBoard("random", "det2").hexes.get("0,0")!.terrain).not.toBe(
      generateBoard("fixed", "det2").hexes.get("0,0")!.terrain,
    );
  });

  it("places exactly 9 ports: 4 generic 3:1 and 5 specific 2:1", () => {
    for (const mode of ["fixed", "random", "balanced"] as BoardMode[]) {
      const board = generateBoard(mode, "ports");
      expect(board.ports).toHaveLength(9);
      const generic = board.ports.filter((p) => p.resource === null);
      expect(generic).toHaveLength(4);
      for (const p of generic) expect(p.ratio).toBe(3);
      const specific = board.ports.filter((p) => p.resource !== null);
      expect(specific).toHaveLength(5);
      expect(new Set(specific.map((p) => p.resource))).toHaveLength(5);
      for (const p of specific) expect(p.ratio).toBe(2);
      // Ports never share a vertex.
      const used = new Set<string>();
      for (const p of board.ports) {
        for (const v of p.vertices) expect(used.has(v)).toBe(false);
        used.add(p.vertices[0]!);
        used.add(p.vertices[1]!);
      }
      // Port vertices are coastal and adjacent to the island.
      for (const p of board.ports) {
        for (const v of p.vertices) {
          const vertex = board.topology.vertices.get(v)!;
          expect(vertex.hexes).toContain(p.landHex);
          expect(vertex.hexes).toContain(p.seaHex);
        }
      }
    }
  });

  it.each([
    ["expanded", 30, 28, 11, EXPANDED_TERRAIN_COUNTS, EXPANDED_NUMBER_TOKENS],
    ["grand", 37, 35, 14, GRAND_TERRAIN_COUNTS, GRAND_NUMBER_TOKENS],
  ] as const)("%s board has correct terrain, tokens and ports", (size, hexes, numbers, ports, terrain, tokens) => {
    for (const mode of ["random", "balanced", "fixed"] as BoardMode[]) {
      for (const seed of ["exp-1", "exp-2", "exp-3", "exp-4", "exp-5"]) {
        const board = generateBoard(mode, seed, size);
        expect(board.size).toBe(size);
        expect(board.hexes.size).toBe(hexes);
        expect([...board.hexes.values()].filter(h => h.number !== null)).toHaveLength(numbers);
        const counts: Record<string, number> = {};
        for (const hex of board.hexes.values()) counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
        expect(counts).toEqual(terrain);
        expect([...board.hexes.values()].flatMap(h => h.number == null ? [] : [h.number]).sort((a,b)=>a-b)).toEqual([...tokens].sort((a,b)=>a-b));
        expect(board.ports).toHaveLength(ports);
        const seen = new Set<string>();
        for (const port of board.ports) for (const v of port.vertices) {
          expect(seen.has(v)).toBe(false);
          seen.add(v);
          expect(board.topology.vertices.has(v)).toBe(true);
        }
      }
    }
  });

  it("fixed beginner layout has no adjacent red numbers and a desert on the coast", () => {
    const board = generateBoard("fixed", "x");
    const reds = [...board.hexes.values()].filter((h) => h.number != null && RED_NUMBERS.has(h.number));
    for (const red of reds) {
      for (const v of red.vertices) {
        for (const h of board.topology.vertices.get(v)!.hexes) {
          const other = board.hexes.get(h);
          if (other && other.id !== red.id) expect(other.number == null || !RED_NUMBERS.has(other.number)).toBe(true);
        }
      }
    }
    const desert = [...board.hexes.values()].find((h) => h.terrain === "desert");
    expect(desert).toBeDefined();
    // The desert touches the coast: at least one of its edges is a harbor edge.
    expect(desert!.edges.some((e) => board.topology.edges.get(e)!.coastal)).toBe(true);
  });

  it("links hexes to vertices and edges consistently", () => {
    const board = generateBoard("random", "links");
    for (const hex of board.hexes.values()) {
      expect(hex.vertices).toHaveLength(6);
      expect(hex.edges).toHaveLength(6);
      for (const v of hex.vertices) {
        expect(board.topology.vertices.get(v)!.hexes).toContain(hex.id);
      }
      for (const e of hex.edges) {
        expect(board.topology.edges.get(e)!.hexes).toContain(hex.id);
      }
    }
  });
});

describe("rng", () => {
  it("is deterministic", () => {
    const a = mulberry32("seed");
    const b = mulberry32("seed");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("int() stays in range and shuffle keeps elements", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    const shuffled = rng.shuffle([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("token pips", () => {
  it("matches dice probabilities", () => {
    expect(tokenPips(2)).toBe(1);
    expect(tokenPips(3)).toBe(2);
    expect(tokenPips(4)).toBe(3);
    expect(tokenPips(5)).toBe(4);
    expect(tokenPips(6)).toBe(5);
    expect(tokenPips(7)).toBe(6);
    expect(tokenPips(8)).toBe(5);
    expect(tokenPips(12)).toBe(1);
  });
});
