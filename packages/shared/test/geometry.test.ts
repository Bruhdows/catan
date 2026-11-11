import { describe, expect, it } from "vitest";
import {
  buildTopology,
  cornerIndexForVertex,
  edgeId,
  edgeVertexIds,
  hexDistance,
  hexKey,
  hexNeighbor,
  hexSpiral,
  hexToPixel,
  parseHexKey,
} from "../src/index.js";

describe("hex math", () => {
  it("spiral produces the 19 land hexes of the base island", () => {
    const hexes = hexSpiral({ q: 0, r: 0 }, 2);
    expect(hexes).toHaveLength(19);
    expect(new Set(hexes.map(hexKey)).size).toBe(19);
    expect(hexDistance({ q: 2, r: 0 }, { q: 0, r: 0 })).toBe(2);
    expect(hexDistance({ q: 2, r: -2 }, { q: 0, r: 0 })).toBe(2);
  });

  it("neighbors are symmetric", () => {
    const a = { q: 1, r: -1 };
    for (let d = 0; d < 6; d++) {
      const n = hexNeighbor(a, d);
      expect(hexDistance(a, n)).toBe(1);
      expect(n).not.toEqual(a);
    }
  });

  it("hex to pixel round trips sanity", () => {
    const p = hexToPixel({ q: 0, r: 0 }, 10);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    const east = hexToPixel({ q: 1, r: 0 }, 10);
    expect(east.x).toBeCloseTo(10 * Math.sqrt(3));
    expect(east.y).toBeCloseTo(0);
  });

  it("cornerIndexForVertex matches the canonical vertex id", () => {
    const hex = { q: 0, r: 0 };
    for (let i = 0; i < 6; i++) {
      const n1 = hexNeighbor(hex, i);
      const n2 = hexNeighbor(hex, (i + 1) % 6);
      const id = [hexKey(hex), hexKey(n1), hexKey(n2)].sort().join("|");
      expect(cornerIndexForVertex(hex, id)).toBe(i);
    }
    expect(cornerIndexForVertex(hex, "9|9|9")).toBe(-1);
  });
});

describe("board topology", () => {
  const topo = buildTopology(2);

  it("has 54 buildable vertices and 72 buildable edges", () => {
    expect(topo.vertices.size).toBe(54);
    expect(topo.edges.size).toBe(72);
  });

  it("vertices have at most 3 hexes and canonical ids are sorted", () => {
    for (const v of topo.vertices.values()) {
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect(v.hexes).toEqual([...v.hexes].sort());
      expect(v.id).toBe(v.hexes.join("|"));
    }
  });

  it("every edge connects two adjacent vertices and is canonical", () => {
    for (const e of topo.edges.values()) {
      expect(e.id).toBe(edgeId(e.a, e.b));
      const [a, b] = edgeVertexIds(e.id);
      const va = topo.vertices.get(a)!;
      expect(va.neighbors).toContain(b);
      expect(va.hexes.filter((h) => topo.vertices.get(b)!.hexes.includes(h)).length).toBeGreaterThan(0);
    }
  });

  it("vertex neighbors are symmetric", () => {
    for (const v of topo.vertices.values()) {
      for (const n of v.neighbors) {
        expect(topo.vertices.get(n)!.neighbors).toContain(v.id);
      }
    }
  });

  it("coastal classification: coastal edges have one land and one sea hex", () => {
    let coastal = 0;
    for (const e of topo.edges.values()) {
      if (e.coastal) {
        coastal++;
        expect(e.landHex).not.toBeNull();
        expect(e.seaHex).not.toBeNull();
      } else {
        expect(e.landHex).toBeNull();
      }
    }
    expect(coastal).toBeGreaterThan(0);
  });

  it("each hex edge is shared by exactly two hexes (or one at the frame)", () => {
    for (const e of topo.edges.values()) {
      expect(e.hexes.length).toBe(2);
    }
  });

  it("parses hex keys", () => {
    expect(parseHexKey("2,-1")).toEqual({ q: 2, r: -1 });
  });
});
