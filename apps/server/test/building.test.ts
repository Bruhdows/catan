import { describe, expect, it } from "vitest";
import {
  edgeId,
  edgeVertexIds,
  handTotal,
  legalRoadEdges,
  legalSettlementVertices,
  occupiedVertices,
  playerById,
} from "@hexhaven/shared";
import { drainHands, grant, mainEngine } from "./harness.js";

/** A land vertex the player's road network does NOT reach. */
function unreachableLandVertex(engine: ReturnType<typeof mainEngine>, playerId: string): string {
  const s = engine.state;
  const legal = legalSettlementVertices(s, playerId, { requireConnection: true });
  for (const v of s.board.topology.vertices.keys()) {
    const vertex = s.board.topology.vertices.get(v)!;
    if (!vertex.hexes.some((h) => s.board.hexes.get(h)?.terrain !== "water")) continue;
    if (legal.has(v) || occupiedVertices(s).has(v)) continue;
    return v;
  }
  throw new Error("no unreachable land vertex");
}

describe("building roads, settlements and cities", () => {
  it("a road costs one brick and one lumber and returns them to the bank", () => {
    const engine = mainEngine("build-road");
    drainHands(engine);
    const s = engine.state;
    const edge = [...legalRoadEdges(s, "p0")][0]!;
    grant(s, "p0", { brick: 1, lumber: 1 });
    const bankBrick = s.bank.brick;
    const bankLumber = s.bank.lumber;

    const outcome = engine.applyCommand("p0", { type: "placeRoad", edge });
    expect(outcome.ok).toBe(true);
    expect(playerById(s, "p0")!.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
    expect(s.bank.brick).toBe(bankBrick + 1);
    expect(s.bank.lumber).toBe(bankLumber + 1);
    expect(playerById(s, "p0")!.roads).toContain(edge);
  });

  it("a settlement needs connection, empty ground and the full cost", () => {
    const engine = mainEngine("build-settlement");
    drainHands(engine);
    const s = engine.state;
    // Rival settlements crowd the deterministic board; clear them so the
    // road endpoints become buildable ground.
    for (const p of s.players) p.settlements = [];
    const spot = [...legalSettlementVertices(s, "p0", { requireConnection: true })][0]!;
    grant(s, "p0", { brick: 1, lumber: 1, wool: 1, grain: 1 });

    const outcome = engine.applyCommand("p0", { type: "placeSettlement", vertex: spot });
    expect(outcome.ok).toBe(true);
    expect(playerById(s, "p0")!.settlements).toContain(spot);
    expect(handTotal(playerById(s, "p0")!.resources)).toBe(0);
  });

  it("settlements must connect to the builder's road network", () => {
    const engine = mainEngine("build-unconnected");
    drainHands(engine);
    const s = engine.state;
    for (const p of s.players) p.settlements = [];
    grant(s, "p0", { brick: 1, lumber: 1, wool: 1, grain: 1 });
    const far = unreachableLandVertex(engine, "p0");
    const outcome = engine.applyCommand("p0", { type: "placeSettlement", vertex: far });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("illegal-settlement");
    expect(playerById(s, "p0")!.settlements).toHaveLength(0); // unchanged
  });

  it("the distance rule also applies during normal play", () => {
    const engine = mainEngine("build-distance");
    drainHands(engine);
    const s = engine.state;
    const neighborOfRival = s.board.topology.vertices.get(s.players[1]!.settlements[0]!)!.neighbors[0]!;
    grant(s, "p0", { brick: 1, lumber: 1, wool: 1, grain: 1 });
    const outcome = engine.applyCommand("p0", { type: "placeSettlement", vertex: neighborOfRival });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("illegal-settlement");
  });

  it("building without resources is rejected and changes nothing", () => {
    const engine = mainEngine("build-broke");
    drainHands(engine);
    const s = engine.state;
    const edge = [...legalRoadEdges(s, "p0")][0]!;
    const before = handTotal(playerById(s, "p0")!.resources);
    const roads = playerById(s, "p0")!.roads.length;
    const outcome = engine.applyCommand("p0", { type: "placeRoad", edge });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("cannot-afford");
    expect(handTotal(playerById(s, "p0")!.resources)).toBe(before);
    expect(playerById(s, "p0")!.roads).toHaveLength(roads);
  });

  it("a city upgrades an owned settlement for two grain and three ore", () => {
    const engine = mainEngine("build-city");
    drainHands(engine);
    const s = engine.state;
    const spot = playerById(s, "p0")!.settlements[0]!;
    grant(s, "p0", { grain: 2, ore: 3 });
    const bankGrain = s.bank.grain;
    const bankOre = s.bank.ore;

    const outcome = engine.applyCommand("p0", { type: "upgradeCity", vertex: spot });
    expect(outcome.ok).toBe(true);
    const p0 = playerById(s, "p0")!;
    expect(p0.settlements).not.toContain(spot);
    expect(p0.cities).toContain(spot);
    expect(p0.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
    expect(s.bank.grain).toBe(bankGrain + 2);
    expect(s.bank.ore).toBe(bankOre + 3);
  });

  it("cities can only be built on your own settlements", () => {
    const engine = mainEngine("build-city-rival");
    drainHands(engine);
    const s = engine.state;
    const rivalSpot = s.players[1]!.settlements[0]!;
    grant(s, "p0", { grain: 2, ore: 3 });
    const outcome = engine.applyCommand("p0", { type: "upgradeCity", vertex: rivalSpot });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("illegal-city");
  });

  it("enforces the settlement, city and road piece limits", () => {
    const engine = mainEngine("build-limits");
    drainHands(engine);
    const s = engine.state;

    // Five buildings leaves no legal settlement ground.
    const p0 = playerById(s, "p0")!;
    while (p0.settlements.length < 5) {
      const spot = [...legalSettlementVertices(s, "p0", { requireConnection: false })][0]!;
      p0.settlements.push(spot);
    }
    grant(s, "p0", { brick: 1, lumber: 1, wool: 1, grain: 1 });
    expect(legalSettlementVertices(s, "p0", { requireConnection: true }).size).toBe(0);
    const blocked = engine.applyCommand("p0", {
      type: "placeSettlement",
      vertex: [...s.board.topology.vertices.keys()][0]!,
    });
    expect(blocked.ok).toBe(false);

    // Four cities leave no upgrades.
    const landVertices = [...s.board.topology.vertices.keys()].filter((v) =>
      s.board.topology.vertices.get(v)!.hexes.some((h) => s.board.hexes.get(h)?.terrain !== "water"),
    );
    p0.cities = landVertices.slice(0, 4);
    grant(s, "p0", { grain: 2, ore: 3 });
    const noCity = engine.applyCommand("p0", { type: "upgradeCity", vertex: p0.settlements[0]! });
    expect(noCity.ok).toBe(false);

    // Fifteen roads leave no room for a sixteenth.
    p0.roads = [...s.board.topology.edges.keys()].slice(0, 15);
    p0.settlements = [];
    p0.cities = [];
    grant(s, "p0", { brick: 1, lumber: 1 });
    expect(legalRoadEdges(s, "p0").size).toBe(0);
    const noRoad = engine.applyCommand("p0", {
      type: "placeRoad",
      edge: [...s.board.topology.edges.keys()][16]!,
    });
    expect(noRoad.ok).toBe(false);
    expect(p0.roads).toHaveLength(15);
  });

  it("roads cannot pass through rival buildings", () => {
    const engine = mainEngine("build-blocked");
    drainHands(engine);
    const s = engine.state;
    // Take p0's first setup road; park a rival settlement on its far endpoint.
    const road = playerById(s, "p0")!.roads[0]!;
    const [a, b] = edgeVertexIds(road);
    const settlementA = playerById(s, "p0")!.settlements[0]!;
    const farEnd = a === settlementA ? b : a;
    s.players[1]!.settlements.push(farEnd);

    // Any other edge touching that vertex must be illegal for p0.
    const past = s.board.topology.vertices.get(farEnd)!.neighbors
      .map((nb) => edgeId(farEnd, nb))
      .find((eid) => eid !== road && s.board.topology.edges.has(eid))!;
    expect(legalRoadEdges(s, "p0").has(past)).toBe(false);
    grant(s, "p0", { brick: 1, lumber: 1 });
    const outcome = engine.applyCommand("p0", { type: "placeRoad", edge: past });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("illegal-road");
  });

  it("building outside the main phase or out of turn is rejected", () => {
    const engine = mainEngine("build-phase");
    drainHands(engine);
    const s = engine.state;
    const edge = [...legalRoadEdges(s, "p0")][0]!;
    grant(s, "p0", { brick: 2, lumber: 2, wool: 2, grain: 2 });

    const notTurn = engine.applyCommand("p1", { type: "placeRoad", edge });
    expect(notTurn.ok).toBe(false);
    expect(notTurn.error).toBe("not-your-turn");

    // p0 still active in main phase: end the turn, then try during p1's roll.
    expect(engine.applyCommand("p0", { type: "endTurn" }).ok).toBe(true);
    expect(s.phase).toBe("roll");
    const wrongPhase = engine.applyCommand("p1", { type: "placeRoad", edge });
    expect(wrongPhase.ok).toBe(false);
    expect(wrongPhase.error).toBe("wrong-phase");
  });
});
