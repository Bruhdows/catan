import { describe, expect, it } from "vitest";
import { buildTopology, cornerIndexForVertex, cornerPixel, parseHexKey } from "../src/geometry.js";

describe("canonical topology drawing coordinates", () => {
  it("agrees on the pixel location of vertices shared by different hexes", () => {
    const board = buildTopology(2);
    const land = new Set(board.landHexes);
    for (const vertex of board.vertices.values()) {
      const points = vertex.hexes.filter((h) => land.has(h)).map((h) => {
        const hex = parseHexKey(h);
        const corner = cornerIndexForVertex(hex, vertex.id);
        expect(corner).toBeGreaterThanOrEqual(0);
        return cornerPixel(hex, corner, 62);
      });
      for (const p of points) {
        expect(Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y)).toBeLessThan(0.001);
      }
    }
  });

  it("every canonical edge renders exactly one hex side long", () => {
    const board = buildTopology(2);
    const land = new Set(board.landHexes);
    const coordinate = (id: string) => {
      const v = board.vertices.get(id)!;
      const h = v.hexes.find((k) => land.has(k))!;
      const hex = parseHexKey(h);
      return cornerPixel(hex, cornerIndexForVertex(hex, id), 62);
    };
    for (const e of board.edges.values()) {
      const a = coordinate(e.a), b = coordinate(e.b);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(62, 5);
    }
  });
});
