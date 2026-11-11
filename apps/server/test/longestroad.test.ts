import { describe, expect, it } from "vitest";
import { edgeId, edgeVertexIds, longestRoadLength } from "@hexhaven/shared";
import { chainEdges, drainHands, mainEngine } from "./harness.js";
import type { GameEngine } from "../src/game/engine.js";

/** Player with exactly the given road trail, everyone else cleared. */
function roadFixture(engine: GameEngine, roadsByPlayer: Record<string, string[]>): void {
  drainHands(engine);
  const s = engine.state;
  for (const p of s.players) {
    p.roads = roadsByPlayer[p.id] ?? [];
    p.settlements = [];
    p.cities = [];
  }
}

function chain(engine: GameEngine, start: string, n: number) {
  return chainEdges(engine.state.board.topology, start, n);
}

describe("Longest Road", () => {
  it("a five-road trail claims the award", () => {
    const engine = mainEngine("lr-five");
    const start = engine.state.board.topology.landHexes[0]!;
    const { edges } = chain(engine, `0,0|0,1|1,0`, 5);
    roadFixture(engine, { p0: edges });
    expect(longestRoadLength(engine.state, "p0")).toBe(5);
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad).toEqual({ playerId: "p0", length: 5 });
  });

  it("shorter trails never qualify", () => {
    const engine = mainEngine("lr-short");
    const { edges } = chain(engine, "0,0|0,1|1,0", 4);
    roadFixture(engine, { p0: edges });
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBeNull();
  });

  it("rival settlements break a road apart", () => {
    const engine = mainEngine("lr-broken");
    const { edges } = chain(engine, "0,0|0,1|1,0", 6);
    roadFixture(engine, { p0: edges });
    // Park p1 on the middle vertex of the trail.
    const middle = edgeVertexIds(edges[2]!)[1]!;
    engine.state.players[1]!.settlements.push(middle);
    const length = longestRoadLength(engine.state, "p0");
    expect(length).toBeLessThan(5);
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBeNull();
  });

  it("a closed loop of six counts in full", () => {
    const engine = mainEngine("lr-loop");
    const s = engine.state;
    // All six boundary edges of the central hex form a cycle.
    const center = "0,0";
    const loop = [...s.board.topology.edges.values()]
      .filter((e) => e.hexes.includes(center))
      .map((e) => e.id);
    expect(loop).toHaveLength(6);
    roadFixture(engine, { p0: loop });
    expect(longestRoadLength(engine.state, "p0")).toBe(6);
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad).toEqual({ playerId: "p0", length: 6 });
  });

  it("a branch off the end extends the trail", () => {
    const engine = mainEngine("lr-branch");
    const { edges, end } = chain(engine, "0,0|0,1|1,0", 5);
    // One extra edge from the far end.
    const extra = engine.state.board.topology.vertices.get(end)!.neighbors
      .map((nb) => edgeId(end, nb))
      .find((eid) => !edges.includes(eid) && engine.state.board.topology.edges.has(eid))!;
    roadFixture(engine, { p0: [...edges, extra] });
    expect(longestRoadLength(engine.state, "p0")).toBe(6);
  });

  it("an interior branch does not extend the trail", () => {
    const engine = mainEngine("lr-interior-branch");
    const { edges } = chain(engine, "0,0|0,1|1,0", 5);
    const junction = edgeVertexIds(edges[2]!)[1]!; // between edges 2 and 3
    const branch = engine.state.board.topology.vertices.get(junction)!.neighbors
      .map((nb) => edgeId(junction, nb))
      .find(
        (eid) =>
          !edges.includes(eid) &&
          engine.state.board.topology.edges.has(eid) &&
          // Keep the branch off the main trail's vertices so the two legs
          // cannot merge into a longer trail.
          ![...edges.flatMap((e) => edgeVertexIds(e))].includes(edgeVertexIds(eid).find((v) => v !== junction)!),
      )!;
    roadFixture(engine, { p0: [...edges, branch] });
    // The trail is still 5: a path can use the branch OR one leg, never all.
    expect(longestRoadLength(engine.state, "p0")).toBe(5);
  });

  it("a tie for longest leaves the award unclaimed", () => {
    const engine = mainEngine("lr-tie");
    const a = chain(engine, "0,0|0,1|1,0", 5).edges;
    const b = chain(engine, "1,-1|1,0|2,-1", 5).edges;
    roadFixture(engine, { p0: a, p1: b });
    expect(longestRoadLength(engine.state, "p0")).toBe(5);
    expect(longestRoadLength(engine.state, "p1")).toBe(5);
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBeNull();
  });

  it("a strictly longer road takes the award from the holder", () => {
    const engine = mainEngine("lr-transfer");
    const a = chain(engine, "0,0|0,1|1,0", 5);
    roadFixture(engine, { p0: a.edges });
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBe("p0");

    // p1 grows a six-road trail.
    const b = chain(engine, "1,-1|1,0|2,-1", 6);
    const p1 = engine.state.players[1]!;
    p1.roads = b.edges;
    const events = engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBe("p1");
    expect(engine.state.awards.longestRoad.length).toBe(6);
    expect(events.some((e) => e.kind === "award" && e.award === "longestRoad" && e.playerId === "p1")).toBe(true);
  });

  it("a tied challenger does not steal the award from the holder", () => {
    const engine = mainEngine("lr-hold-tie");
    const a = chain(engine, "0,0|0,1|1,0", 6);
    roadFixture(engine, { p0: a.edges });
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBe("p0");

    engine.state.players[1]!.roads = chain(engine, "1,-1|1,0|2,-1", 6).edges;
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBe("p0"); // holder keeps
  });

  it("the holder loses the award when their road drops below five", () => {
    const engine = mainEngine("lr-lose");
    const a = chain(engine, "0,0|0,1|1,0", 5);
    roadFixture(engine, { p0: a.edges });
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBe("p0");

    // p0 loses two roads; nobody else qualifies.
    engine.state.players[0]!.roads = a.edges.slice(2);
    engine.refreshAwards();
    expect(engine.state.awards.longestRoad.playerId).toBeNull();
  });
});
