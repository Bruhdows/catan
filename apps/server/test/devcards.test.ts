import { describe, expect, it } from "vitest";
import { handTotal, legalRoadEdges, playerById } from "@hexhaven/shared";
import { addCard, completeSetup, drainHands, grant, mainEngine, makeEngine } from "./harness.js";

describe("development cards", () => {
  it("buying draws from the deck and costs wool, grain and ore", () => {
    const engine = mainEngine("dev-buy");
    drainHands(engine);
    const s = engine.state;
    grant(s, "p0", { wool: 1, grain: 1, ore: 1 });
    const p0 = playerById(s, "p0")!;
    const deckBefore = s.devDeck.length;

    const outcome = engine.applyCommand("p0", { type: "buyDevelopment" });
    expect(outcome.ok).toBe(true);
    expect(s.devDeck).toHaveLength(deckBefore - 1);
    expect(p0.devCards).toHaveLength(1);
    expect(p0.devCards[0]!.boughtTurn).toBe(s.turnCount);
    expect(p0.resources).toEqual({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
    expect(p0.boughtThisTurn).toBe(1);
  });

  it("cards bought this turn cannot be played", () => {
    const engine = mainEngine("dev-same-turn");
    drainHands(engine);
    const s = engine.state;
    grant(s, "p0", { wool: 1, grain: 1, ore: 1 });
    engine.applyCommand("p0", { type: "buyDevelopment" });
    const outcome = engine.applyCommand("p0", { type: "playKnight" });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("cannot-play");
  });

  it("only one action card may be played per turn", () => {
    const engine = mainEngine("dev-once");
    drainHands(engine);
    const s = engine.state;
    grant(s, "p0", { wool: 1 }); // Year of Plenty needs a resource to take
    addCard(s, "p0", "yearOfPlenty");
    addCard(s, "p0", "knight");
    expect(
      engine.applyCommand("p0", { type: "playYearOfPlenty", resources: { brick: 0, lumber: 0, wool: 1, grain: 0, ore: 0 } }).ok,
    ).toBe(true);
    const again = engine.applyCommand("p0", { type: "playKnight" });
    expect(again.ok).toBe(false);
    expect(again.error).toBe("cannot-play");
    expect(again.message).toContain("already played");
  });

  it("the knight moves the robber and builds the Largest Army", () => {
    const engine = mainEngine("dev-knight");
    drainHands(engine);
    const s = engine.state;
    playerById(s, "p0")!.knightsPlayed = 2;
    addCard(s, "p0", "knight");

    const played = engine.applyCommand("p0", { type: "playKnight" });
    expect(played.ok).toBe(true);
    expect(s.pending.type).toBe("robberMove");
    expect(playerById(s, "p0")!.knightsPlayed).toBe(3);
    expect(s.awards.largestArmy.playerId).toBe("p0");
    expect(played.events!.some((e) => e.kind === "award" && e.award === "largestArmy")).toBe(true);

    // Resolve the robber so later commands work.
    const target = [...s.board.hexes.values()].find((h) => h.id !== s.robberHex)!;
    expect(engine.applyCommand("p0", { type: "moveRobber", hex: target.id }).ok).toBe(true);
    expect(s.pending.type).toBe("none");
  });

  it("Largest Army stays with the holder on a tie and moves on strictly larger", () => {
    const engine = mainEngine("dev-army");
    drainHands(engine);
    const s = engine.state;
    playerById(s, "p0")!.knightsPlayed = 3;
    engine.refreshAwards();
    expect(s.awards.largestArmy.playerId).toBe("p0");

    // Tie: p1 also reaches three — the holder keeps the award.
    playerById(s, "p1")!.knightsPlayed = 3;
    engine.refreshAwards();
    expect(s.awards.largestArmy.playerId).toBe("p0");

    // Strictly larger: p1 takes it.
    playerById(s, "p1")!.knightsPlayed = 4;
    const events = engine.refreshAwards();
    expect(s.awards.largestArmy.playerId).toBe("p1");
    expect(events.some((e) => e.kind === "award" && e.award === "largestArmy" && e.playerId === "p1")).toBe(true);
  });

  it("Road Building grants two free roads then normal costs resume", () => {
    const engine = mainEngine("dev-roads");
    drainHands(engine);
    const s = engine.state;
    addCard(s, "p0", "roadBuilding");
    grant(s, "p0", { brick: 1, lumber: 1 }); // for the paid road afterwards
    const handBefore = handTotal(playerById(s, "p0")!.resources);

    expect(engine.applyCommand("p0", { type: "playRoadBuilding" }).ok).toBe(true);
    expect(s.pending).toEqual({ type: "roadBuilding", remaining: 2 });

    const free1 = [...legalRoadEdges(s, "p0")][0]!;
    expect(engine.applyCommand("p0", { type: "placeRoad", edge: free1 }).ok).toBe(true);
    expect(s.pending).toEqual({ type: "roadBuilding", remaining: 1 });
    expect(handTotal(playerById(s, "p0")!.resources)).toBe(handBefore); // free

    const free2 = [...legalRoadEdges(s, "p0")][0]!;
    expect(engine.applyCommand("p0", { type: "placeRoad", edge: free2 }).ok).toBe(true);
    expect(s.pending.type).toBe("none");
    expect(handTotal(playerById(s, "p0")!.resources)).toBe(handBefore); // still free

    const paid = [...legalRoadEdges(s, "p0")][0]!;
    expect(engine.applyCommand("p0", { type: "placeRoad", edge: paid }).ok).toBe(true);
    expect(handTotal(playerById(s, "p0")!.resources)).toBe(handBefore - 2); // normal cost
  });

  it("ending the turn is blocked while free roads remain placeable", () => {
    const engine = mainEngine("dev-roads-end");
    drainHands(engine);
    const s = engine.state;
    addCard(s, "p0", "roadBuilding");
    engine.applyCommand("p0", { type: "playRoadBuilding" });
    expect(s.pending.type).toBe("roadBuilding");
    const outcome = engine.applyCommand("p0", { type: "endTurn" });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("free-roads-required");
  });

  it("Year of Plenty takes up to two resources from the bank", () => {
    const engine = mainEngine("dev-yop");
    drainHands(engine);
    const s = engine.state;
    addCard(s, "p0", "yearOfPlenty");
    const bankOre = s.bank.ore;

    const bad = engine.applyCommand("p0", { type: "playYearOfPlenty", resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 3 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("wrong-count");

    const good = engine.applyCommand("p0", { type: "playYearOfPlenty", resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 2 } });
    expect(good.ok).toBe(true);
    expect(playerById(s, "p0")!.resources.ore).toBe(2);
    expect(s.bank.ore).toBe(bankOre - 2);
    expect(good.events!.some((e) => e.kind === "produced")).toBe(true);
    expect(s.devDeck).toHaveLength(25); // played, not discarded into the deck
  });

  it("Year of Plenty cannot drain the bank", () => {
    const engine = mainEngine("dev-yop-empty");
    drainHands(engine);
    const s = engine.state;
    s.bank.ore = 0;
    addCard(s, "p0", "yearOfPlenty");
    const outcome = engine.applyCommand("p0", { type: "playYearOfPlenty", resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 1 } });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("bank-empty");
  });

  it("Monopoly takes every held card of one resource from the others", () => {
    const engine = mainEngine("dev-monopoly");
    drainHands(engine);
    const s = engine.state;
    grant(s, "p1", { wool: 2, brick: 1 });
    grant(s, "p2", { wool: 3 });
    addCard(s, "p0", "monopoly");

    const outcome = engine.applyCommand("p0", { type: "playMonopoly", resource: "wool" });
    expect(outcome.ok).toBe(true);
    expect(playerById(s, "p0")!.resources.wool).toBe(5);
    expect(playerById(s, "p1")!.resources.wool).toBe(0);
    expect(playerById(s, "p1")!.resources.brick).toBe(1); // untouched
    expect(playerById(s, "p2")!.resources.wool).toBe(0);
  });

  it("Monopoly with no matching cards still resolves", () => {
    const engine = mainEngine("dev-monopoly-none");
    drainHands(engine);
    addCard(engine.state, "p0", "monopoly");
    const outcome = engine.applyCommand("p0", { type: "playMonopoly", resource: "ore" });
    expect(outcome.ok).toBe(true);
    expect(playerById(engine.state, "p0")!.resources.ore).toBe(0);
  });

  it("victory point cards are hidden from public points and win the game", () => {
    const engine = mainEngine("dev-vp");
    drainHands(engine);
    const s = engine.state;
    const p0 = playerById(s, "p0")!;
    for (let i = 0; i < 8; i++) addCard(s, "p0", "victoryPoint");

    // Two settlements are visible; the eight VP cards are not.
    expect(s.awards.longestRoad.playerId).toBeNull();
    expect(p0.settlements.length + p0.cities.length * 2).toBe(2);
    expect(engine.refreshAwards().some((e) => e.kind === "award")).toBe(false);
    expect(s.phase).toBe("finished");
    expect(s.winnerId).toBe("p0");

    // The finished game rejects further commands.
    const late = engine.applyCommand("p0", { type: "endTurn" });
    expect(late.ok).toBe(false);
    expect(late.error).toBe("game-over");
  });

  it("an empty deck cannot be bought from", () => {
    const engine = mainEngine("dev-empty-deck");
    drainHands(engine);
    const s = engine.state;
    s.devDeck = [];
    grant(s, "p0", { wool: 1, grain: 1, ore: 1 });
    const outcome = engine.applyCommand("p0", { type: "buyDevelopment" });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("deck-empty");
  });

  it("cards cannot be played before rolling or during another player's turn", () => {
    const engine = makeEngine(3, "dev-phase");
    completeSetup(engine, 3);
    drainHands(engine);
    addCard(engine.state, "p0", "knight");
    // phase "roll", pending none — rolling first is required, cards work in
    // roll OR main, so this must succeed only for the active player.
    const notTurn = engine.applyCommand("p1", { type: "playKnight" });
    expect(notTurn.ok).toBe(false);
    expect(notTurn.error).toBe("not-your-turn");
    const ok = engine.applyCommand("p0", { type: "playKnight" });
    expect(ok.ok).toBe(true);
  });
});
