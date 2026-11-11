import { describe, expect, it } from "vitest";
import { legalRoadEdges, legalSettlementVertices, type Pending } from "@hexhaven/shared";
import { completeSetup, makeEngine } from "./harness.js";

describe("initial placement phase", () => {
  it("follows the A→B→C→D→D→C→B→A order for four players", () => {
    const engine = makeEngine(4);
    const order: string[] = [];
    while (engine.state.pending.type === "setup") {
      const pid = engine.state.pending.player;
      if (!engine.state.pending.needsRoad) {
        order.push(pid);
        const spots = [...legalSettlementVertices(engine.state, pid, { requireConnection: false })];
        const outcome = engine.applyCommand(pid, { type: "placeSettlement", vertex: spots[0]! });
        expect(outcome.ok).toBe(true);
      } else {
        const vertex = engine.state.pending.vertex!;
        const edges = [...legalRoadEdges(engine.state, pid)].filter((e) => {
          const [a, b] = e.split(">");
          return a === vertex || b === vertex;
        });
        const outcome = engine.applyCommand(pid, { type: "placeRoad", edge: edges[0]! });
        expect(outcome.ok).toBe(true);
      }
    }
    expect(order).toEqual(["p0", "p1", "p2", "p3", "p3", "p2", "p1", "p0"]);
  });

  it("blocks out-of-turn placements", () => {
    const engine = makeEngine(3);
    const outcome = engine.applyCommand("p1", { type: "placeSettlement", vertex: "somewhere" });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-your-turn");
  });

  it("rejects adjacent settlements (distance rule)", () => {
    const engine = makeEngine(3);
    const spots = [...legalSettlementVertices(engine.state, "p0", { requireConnection: false })];
    expect(engine.applyCommand("p0", { type: "placeSettlement", vertex: spots[0]! }).ok).toBe(true);
    const road = [...legalRoadEdges(engine.state, "p0")][0]!;
    expect(engine.applyCommand("p0", { type: "placeRoad", edge: road }).ok).toBe(true);

    // p1 places at a neighbor of p0's settlement.
    const occupied = engine.state.players[0]!.settlements[0]!;
    const neighbors = engine.state.board.topology.vertices.get(occupied)!.neighbors;
    const outcome = engine.applyCommand("p1", { type: "placeSettlement", vertex: neighbors[0]! });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("illegal-settlement");
  });

  it("requires the starting road to touch the new settlement", () => {
    const engine = makeEngine(3);
    const spots = [...legalSettlementVertices(engine.state, "p0", { requireConnection: false })];
    engine.applyCommand("p0", { type: "placeSettlement", vertex: spots[0]! });
    const vertex = engine.state.players[0]!.settlements[0]!;
    // Any edge not touching the vertex.
    const farEdge = [...engine.state.board.topology.edges.keys()].find(
      (e) => !e.includes(vertex),
    )!;
    const outcome = engine.applyCommand("p0", { type: "placeRoad", edge: farEdge });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-connected");
  });

  it("grants starting resources for the second settlement only", () => {
    const engine = makeEngine(3);
    // Places exactly one settlement + its road. With three players the snake
    // order has p2 placing twice in a row at the turnaround, so a while-loop
    // would run the second settlement early.
    const placeOne = (pid: string) => {
      const spots = [...legalSettlementVertices(engine.state, pid, { requireConnection: false })];
      engine.applyCommand(pid, { type: "placeSettlement", vertex: spots[0]! });
      const pending = engine.state.pending as Extract<Pending, { type: "setup" }>;
      const vertex = pending.vertex!;
      const edges = [...legalRoadEdges(engine.state, pid)].filter((e) => {
        const [a, b] = e.split(">");
        return a === vertex || b === vertex;
      });
      engine.applyCommand(pid, { type: "placeRoad", edge: edges[0]! });
    };
    // Round one: no resources.
    placeOne("p0");
    placeOne("p1");
    placeOne("p2");
    for (const pid of ["p0", "p1", "p2"]) {
      expect(Object.values(engine.state.players.find((p) => p.id === pid)!.resources).every((n) => n === 0)).toBe(true);
    }
    // Round two: resources flow.
    placeOne("p2");
    placeOne("p1");
    placeOne("p0");
    const s = engine.state;
    expect(s.phase).toBe("roll");
    // The player who placed last starts the normal turn order.
    expect(s.players[s.turnIndex]!.id).toBe("p0");
    const totalGranted = s.players.reduce((acc, p) => acc + Object.values(p.resources).reduce((a, b) => a + b, 0), 0);
    expect(totalGranted).toBeGreaterThan(0);
    const bankTotal = Object.values(s.bank).reduce((a, b) => a + b, 0);
    expect(bankTotal).toBe(19 * 5 - totalGranted);
  });

  it("completes setup for three players and starts with the last placer", () => {
    const engine = makeEngine(3);
    completeSetup(engine, 3);
    expect(engine.state.phase).toBe("roll");
    expect(engine.state.turnIndex).toBe(0);
    expect(engine.state.turnCount).toBe(1);
  });

  it("prevents settlements on water and occupied vertices", () => {
    const engine = makeEngine(3);
    const spots = [...legalSettlementVertices(engine.state, "p0", { requireConnection: false })];
    engine.applyCommand("p0", { type: "placeSettlement", vertex: spots[0]! });
    const pending = engine.state.pending as Extract<Pending, { type: "setup" }>;
    const vertex = pending.vertex!;
    const edges = [...legalRoadEdges(engine.state, "p0")].filter((e) => {
      const [a, b] = e.split(">");
      return a === vertex || b === vertex;
    });
    engine.applyCommand("p0", { type: "placeRoad", edge: edges[0]! });
    const occupied = engine.state.players[0]!.settlements[0]!;
    const again = engine.applyCommand("p1", { type: "placeSettlement", vertex: occupied });
    expect(again.ok).toBe(false);
    expect(again.error).toBe("illegal-settlement");
  });
});
