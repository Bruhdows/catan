import { describe, expect, it } from "vitest";
import { legalRoadEdges, legalSettlementVertices, handTotal, playerById, type Pending, type Resource } from "@hexhaven/shared";
import { completeSetup, makeEngine, scriptedRng } from "./harness.js";

/**
 * scriptedRng values are rng.int(6) outputs; a die shows value + 1.
 * diceScript(total) returns two int outputs that sum to (total - 2).
 */
function diceScript(total: number): [number, number] {
  // Choose faces a + b = total with a, b in [1..6] → ints a-1, b-1.
  const a = total <= 7 ? Math.max(1, total - 1) : 6;
  const b = total - a;
  return [a - 1, b - 1];
}

function preparedEngine(seed: string, script: [number, number]) {
  const rng = scriptedRng([script]);
  const engine = makeEngine(3, seed, rng.rng);
  completeSetup(engine, 3);
  return engine;
}

/** Clears all buildings so production tests control every producer. */
function clearBuildings(engine: ReturnType<typeof makeEngine>): void {
  for (const p of engine.state.players) {
    p.settlements = [];
    p.cities = [];
  }
}

/** Gives a player a settlement (or city) on a free vertex of the hex with
 * the given number, mirroring what the UI would do through real commands
 * but bypassing the road graph for test brevity. */
function settleOn(engine: ReturnType<typeof makeEngine>, playerId: string, hexNumber: number, asCity = false): void {
  const s = engine.state;
  const hex = [...s.board.hexes.values()].find((h) => h.number === hexNumber)!;
  const spot = hex.vertices.find(
    (v) => !s.players.some((p) => p.settlements.includes(v) || p.cities.includes(v)),
  )!;
  const p = playerById(s, playerId)!;
  if (asCity) {
    p.cities.push(spot);
  } else {
    p.settlements.push(spot);
  }
}

describe("dice and production", () => {
  it("produces one resource per settlement adjacent to the rolled number", () => {
    const engine = preparedEngine("prod", diceScript(5));
    const p0 = playerById(engine.state, "p0")!;
    clearBuildings(engine);
    settleOn(engine, "p0", 5);
    const before = handTotal(p0.resources);
    const outcome = engine.applyCommand("p0", { type: "rollDice" });
    expect(outcome.ok).toBe(true);
    expect(engine.state.dice).toEqual([4, 1]);
    expect(handTotal(p0.resources) - before).toBe(1);
    expect(outcome.events!.some((e) => e.kind === "produced")).toBe(true);
  });

  it("cities produce two resources", () => {
    const engine = preparedEngine("prod-city", diceScript(5));
    const p0 = playerById(engine.state, "p0")!;
    clearBuildings(engine);
    settleOn(engine, "p0", 5, true);
    const before = handTotal(p0.resources);
    const outcome = engine.applyCommand("p0", { type: "rollDice" });
    expect(outcome.ok).toBe(true);
    expect(handTotal(p0.resources) - before).toBe(2);
  });

  it("several players collect from the same roll", () => {
    const engine = preparedEngine("prod-multi", diceScript(4));
    clearBuildings(engine);
    settleOn(engine, "p0", 4);
    settleOn(engine, "p1", 4);
    const out = engine.applyCommand(engine.state.players[engine.state.turnIndex]!.id, { type: "rollDice" });
    expect(out.ok).toBe(true);
    const produced = out.events!.filter((e) => e.kind === "produced")[0] as { kind: string; gains: { playerId: string }[] } | undefined;
    expect(produced?.gains.map((g) => g.playerId).sort()).toEqual(["p0", "p1"]);
  });

  it("the robber blocks production on its hex", () => {
    const engine = preparedEngine("prod-robber", diceScript(5));
    const p0 = playerById(engine.state, "p0")!;
    clearBuildings(engine);
    settleOn(engine, "p0", 5);
    const hex5 = [...engine.state.board.hexes.values()].find((h) => h.number === 5)!;
    engine.state.robberHex = hex5.id;
    const before = handTotal(p0.resources);
    engine.applyCommand("p0", { type: "rollDice" });
    expect(handTotal(p0.resources)).toBe(before);
  });

  it("bank shortages deny the shorted resource to everyone", () => {
    const engine = preparedEngine("prod-shortage", diceScript(5));
    const p0 = playerById(engine.state, "p0")!;
    clearBuildings(engine);
    settleOn(engine, "p0", 5);
    const hex5 = [...engine.state.board.hexes.values()].find((h) => h.number === 5)!;
    // Find which resource the hex produces and drain the bank of it.
    const terrain = engine.state.board.hexes.get(hex5.id)!.terrain;
    const resource = terrain === "forest" ? "lumber" : terrain === "hills" ? "brick" : terrain === "pasture" ? "wool" : terrain === "fields" ? "grain" : "ore";
    engine.state.bank[resource as Resource] = 0;
    const before = handTotal(p0.resources);
    engine.applyCommand("p0", { type: "rollDice" });
    expect(handTotal(p0.resources)).toBe(before);
  });

  it("keeps global resource conservation across a full turn cycle", () => {
    const engine = preparedEngine("prod-conservation", diceScript(8));
    const s = engine.state;
    settleOn(engine, "p0", 8);
    settleOn(engine, "p1", 8);
    const total = () =>
      Object.values(s.bank).reduce((a, b) => a + b, 0) +
      s.players.reduce((acc, p) => acc + handTotal(p.resources), 0);
    expect(total()).toBe(19 * 5);

    // Roll, resolve any pending, end turn for 3 turns.
    for (let turn = 0; turn < 3; turn++) {
      const active = s.players[s.turnIndex]!.id;
      const roll = engine.applyCommand(active, { type: "rollDice" });
      expect(roll.ok).toBe(true);
      let guard = 0;
      while (s.pending.type !== "none" && guard++ < 10) {
        if (s.pending.type === "discard") {
          const owe = s.pending.players[0]!;
          const p = playerById(s, owe.playerId)!;
          const hand: Record<string, number> = {};
          let left = owe.count;
          for (const r of ["brick", "lumber", "wool", "grain", "ore"]) {
            const take = Math.min(p.resources[r as never], left);
            if (take > 0) {
              hand[r] = take;
              left -= take;
            }
          }
          const outcome = engine.applyCommand(owe.playerId, { type: "discard", resources: hand as never });
          expect(outcome.ok).toBe(true);
        } else if (s.pending.type === "robberMove") {
          const target = [...s.board.hexes.values()].find((h) => h.id !== s.robberHex)!;
          const outcome = engine.applyCommand(active, { type: "moveRobber", hex: target.id });
          expect(outcome.ok).toBe(true);
        } else if (s.pending.type === "robberSteal") {
          engine.applyCommand(active, { type: "selectVictim", player: s.pending.candidates[0]! });
        }
      }
      expect(engine.applyCommand(active, { type: "endTurn" }).ok).toBe(true);
      expect(total()).toBe(19 * 5);
    }
  });

  it("rolling a seven triggers discards for players over seven cards", () => {
    const engine = preparedEngine("seven", diceScript(7));
    const s = engine.state;
    playerById(s, "p1")!.resources = { brick: 3, lumber: 2, wool: 2, grain: 2, ore: 0 };
    const outcome = engine.applyCommand("p0", { type: "rollDice" });
    expect(outcome.ok).toBe(true);
    expect(s.pending.type).toBe("discard");
    const owing = s.pending as Extract<Pending, { type: "discard" }>;
    expect(owing.players).toEqual([{ playerId: "p1", count: 4 }]);
    // A player with 7 or fewer discards nothing.
    expect(owing.players.some((x) => x.playerId === "p0")).toBe(false);

    const outcome2 = engine.applyCommand("p1", { type: "discard", resources: { brick: 2, lumber: 1, wool: 1, grain: 0, ore: 0 } });
    expect(outcome2.ok).toBe(true);
    expect(playerById(s, "p1")!.resources).toEqual({ brick: 1, lumber: 1, wool: 1, grain: 2, ore: 0 });
    expect(s.pending.type).toBe("robberMove");
    expect(s.phase).toBe("roll");
  });

  it("wrong discard counts are rejected", () => {
    const engine = preparedEngine("seven-bad", diceScript(7));
    const s = engine.state;
    playerById(s, "p1")!.resources = { brick: 9, lumber: 0, wool: 0, grain: 0, ore: 0 };
    engine.applyCommand("p0", { type: "rollDice" });
    expect(s.pending.type).toBe("discard");
    const bad = engine.applyCommand("p1", { type: "discard", resources: { brick: 2, lumber: 0, wool: 0, grain: 0, ore: 0 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("wrong-count");
    // Total matches the required count but exceeds the held cards.
    const tooMany = engine.applyCommand("p1", { type: "discard", resources: { brick: 3, wool: 1, lumber: 0, grain: 0, ore: 0 } });
    expect(tooMany.ok).toBe(false);
    expect(tooMany.error).toBe("not-enough");
  });

  it("the robber flow: move, eligible victims, steal, then main phase", () => {
    const engine = preparedEngine("seven-steal", diceScript(7));
    const s = engine.state;
    playerById(s, "p1")!.resources = { brick: 9, lumber: 0, wool: 0, grain: 0, ore: 0 };
    engine.applyCommand("p0", { type: "rollDice" });
    expect(s.pending.type).toBe("discard");
    engine.applyCommand("p1", { type: "discard", resources: { brick: 4, lumber: 0, wool: 0, grain: 0, ore: 0 } });
    expect(s.pending.type).toBe("robberMove");

    const active = "p0";
    const wrong = engine.applyCommand("p1", { type: "moveRobber", hex: [...s.board.hexes.keys()][0]! });
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toBe("not-your-turn");

    const same = engine.applyCommand(active, { type: "moveRobber", hex: s.robberHex });
    expect(same.ok).toBe(false);
    expect(same.error).toBe("same-hex");

    // Move next to p1's settlement so a steal is required.
    const p1Settle = s.players[1]!.settlements[0]!;
    const adjacent = s.board.topology.vertices.get(p1Settle)!.hexes.filter(
      (h) => s.board.hexes.has(h) && h !== s.robberHex,
    );
    const moved = engine.applyCommand(active, { type: "moveRobber", hex: adjacent[0]! });
    expect(moved.ok).toBe(true);
    expect(s.robberHex).toBe(adjacent[0]!);
    expect(s.pending.type).toBe("robberSteal");
    const stealing = s.pending as Extract<Pending, { type: "robberSteal" }>;
    expect(stealing.candidates).toContain("p1");

    const p1 = playerById(s, "p1")!;
    const activePlayer = playerById(s, active)!;
    const before = handTotal(p1.resources);
    const beforeActive = handTotal(activePlayer.resources);
    const steal = engine.applyCommand(active, { type: "selectVictim", player: "p1" });
    expect(steal.ok).toBe(true);
    expect(s.pending.type).toBe("none");
    expect(s.phase).toBe("main");
    expect(handTotal(p1.resources)).toBe(before - 1);
    expect(handTotal(activePlayer.resources)).toBe(beforeActive + 1);
    const privateEvents = steal.events!.filter((e) => e.kind === "stolenPrivate");
    expect(privateEvents).toHaveLength(1);
  });

  it("an eligible victim with no cards cannot be robbed", () => {
    const engine = preparedEngine("seven-empty", diceScript(7));
    const s = engine.state;
    // Everyone is broke.
    for (const p of s.players) p.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
    engine.applyCommand("p0", { type: "rollDice" });
    expect(s.pending.type).toBe("robberMove");
    const target = [...s.board.hexes.values()].find((h) => h.id !== s.robberHex)!;
    const outcome = engine.applyCommand("p0", { type: "moveRobber", hex: target.id });
    expect(outcome.ok).toBe(true);
    expect(s.pending.type).toBe("none");
    expect(s.phase).toBe("main");
  });

  it("players cannot submit dice values", () => {
    const engine = preparedEngine("dice-server", diceScript(6));
    const outcome = engine.applyCommand("p0", { type: "rollDice" });
    expect(outcome.ok).toBe(true);
    // The dice come from the server's rng, not from any client payload.
    expect(engine.state.dice).toEqual([5, 1]);
  });
});
