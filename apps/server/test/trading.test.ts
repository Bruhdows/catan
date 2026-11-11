import { describe, expect, it } from "vitest";
import { bankTradeRatio, handTotal, playerById, type Resource } from "@hexhaven/shared";
import { drainHands, grant, mainEngine } from "./harness.js";

const hand = (entries: Partial<Record<Resource, number>>) => ({
  brick: 0,
  lumber: 0,
  wool: 0,
  grain: 0,
  ore: 0,
  ...entries,
});

describe("bank trading", () => {
  it("defaults to a 4:1 ratio without a port", () => {
    const engine = mainEngine("trade-bank-4");
    drainHands(engine);
    const s = engine.state;
    s.players[0]!.settlements = []; // no port access
    grant(s, "p0", { brick: 4 });
    const bankBrick = s.bank.brick;
    const bankOre = s.bank.ore;

    expect(bankTradeRatio(s, "p0", "brick")).toBe(4);
    const outcome = engine.applyCommand("p0", { type: "bankTrade", give: "brick", get: "ore" });
    expect(outcome.ok).toBe(true);
    const p0 = playerById(s, "p0")!;
    expect(p0.resources).toEqual(hand({ ore: 1 }));
    expect(s.bank.brick).toBe(bankBrick + 4);
    expect(s.bank.ore).toBe(bankOre - 1);
  });

  it("rejects a trade without enough cards for the ratio", () => {
    const engine = mainEngine("trade-bank-short");
    drainHands(engine);
    const s = engine.state;
    s.players[0]!.settlements = [];
    grant(s, "p0", { brick: 3 });
    const outcome = engine.applyCommand("p0", { type: "bankTrade", give: "brick", get: "ore" });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-enough");
  });

  it("rejects identical resources and empty banks", () => {
    const engine = mainEngine("trade-bank-bad");
    drainHands(engine);
    const s = engine.state;
    s.players[0]!.settlements = [];
    grant(s, "p0", { brick: 4 });

    const same = engine.applyCommand("p0", { type: "bankTrade", give: "brick", get: "brick" });
    expect(same.ok).toBe(false);
    expect(same.error).toBe("same-resource");

    s.bank.ore = 0;
    const empty = engine.applyCommand("p0", { type: "bankTrade", give: "brick", get: "ore" });
    expect(empty.ok).toBe(false);
    expect(empty.error).toBe("bank-empty");
  });

  it("a generic harbor gives 3:1", () => {
    const engine = mainEngine("trade-bank-3");
    drainHands(engine);
    const s = engine.state;
    const port = s.board.ports.find((p) => p.resource === null);
    expect(port).toBeDefined();
    const p0 = playerById(s, "p0")!;
    p0.settlements = [port!.vertices[0]!];
    grant(s, "p0", { brick: 3 });

    expect(bankTradeRatio(s, "p0", "brick")).toBe(3);
    const outcome = engine.applyCommand("p0", { type: "bankTrade", give: "brick", get: "ore" });
    expect(outcome.ok).toBe(true);
    expect(p0.resources).toEqual(hand({ ore: 1 }));
  });

  it("a matching harbor gives 2:1 on its resource", () => {
    const engine = mainEngine("trade-bank-2");
    drainHands(engine);
    const s = engine.state;
    const port = s.board.ports.find((p) => p.resource !== null)!;
    const resource = port.resource as Resource;
    const p0 = playerById(s, "p0")!;
    p0.settlements = [port.vertices[0]!];
    grant(s, "p0", { [resource]: 2 } as Partial<Record<Resource, number>>);
    const bankResource = s.bank[resource];

    expect(bankTradeRatio(s, "p0", resource)).toBe(2);
    const outcome = engine.applyCommand("p0", { type: "bankTrade", give: resource, get: "ore" });
    expect(outcome.ok).toBe(true);
    expect(p0.resources[resource]).toBe(0);
    expect(p0.resources.ore).toBe(1);
    expect(s.bank[resource]).toBe(bankResource + 2);
  });

  it("bank trading is only for the active player in the main phase", () => {
    const engine = mainEngine("trade-bank-turn");
    drainHands(engine);
    const s = engine.state;
    s.players[0]!.settlements = [];
    grant(s, "p1", { brick: 4 });
    const outcome = engine.applyCommand("p1", { type: "bankTrade", give: "brick", get: "ore" });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-your-turn");
  });
});

describe("domestic trading", () => {
  function offerFromP0(engine: ReturnType<typeof mainEngine>) {
    drainHands(engine);
    const s = engine.state;
    grant(s, "p0", { brick: 2 });
    grant(s, "p1", { wool: 2 });
    const offered = engine.applyCommand("p0", {
      type: "offerTrade",
      to: "p1",
      give: hand({ brick: 1 }),
      get: hand({ wool: 1 }),
    });
    expect(offered.ok).toBe(true);
    return s;
  }

  it("offer, accept and confirm exchange the cards", () => {
    const engine = mainEngine("trade-domestic");
    const s = offerFromP0(engine);
    expect(s.offers).toHaveLength(1);
    const offerId = s.offers[0]!.id;

    const accept = engine.applyCommand("p1", { type: "respondTrade", offerId, response: "accept" });
    expect(accept.ok).toBe(true);
    expect(s.offers[0]!.status).toBe("accepted");

    const confirm = engine.applyCommand("p0", { type: "confirmTrade", offerId });
    expect(confirm.ok).toBe(true);
    expect(playerById(s, "p0")!.resources).toEqual(hand({ brick: 1, wool: 1 }));
    expect(playerById(s, "p1")!.resources).toEqual(hand({ wool: 1, brick: 1 }));
    expect(s.offers).toHaveLength(0);
  });

  it("cannot offer cards you do not hold", () => {
    const engine = mainEngine("trade-no-cards");
    drainHands(engine);
    grant(engine.state, "p0", { brick: 1 });
    const outcome = engine.applyCommand("p0", {
      type: "offerTrade",
      to: "p1",
      give: hand({ brick: 2 }),
      get: hand({ wool: 1 }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-enough");
  });

  it("only the addressed player may respond, and only while it is the proposer's turn", () => {
    const engine = mainEngine("trade-respond-auth");
    const s = offerFromP0(engine);
    const offerId = s.offers[0]!.id;

    const wrongPlayer = engine.applyCommand("p2", { type: "respondTrade", offerId, response: "accept" });
    expect(wrongPlayer.ok).toBe(false);
    expect(wrongPlayer.error).toBe("not-for-you");

    // Responding is allowed while the PROPOSER is active, even by a
    // non-active player — p1 is not active here but is the recipient.
    expect(engine.applyCommand("p1", { type: "respondTrade", offerId, response: "decline" }).ok).toBe(true);
    expect(s.offers).toHaveLength(0);
  });

  it("declining removes the offer", () => {
    const engine = mainEngine("trade-decline");
    const s = offerFromP0(engine);
    const offerId = s.offers[0]!.id;
    expect(engine.applyCommand("p1", { type: "respondTrade", offerId, response: "decline" }).ok).toBe(true);
    expect(s.offers).toHaveLength(0);
    const late = engine.applyCommand("p0", { type: "confirmTrade", offerId });
    expect(late.ok).toBe(false);
    expect(late.error).toBe("unknown-offer");
  });

  it("confirming before acceptance is rejected", () => {
    const engine = mainEngine("trade-unaccepted");
    const s = offerFromP0(engine);
    const offerId = s.offers[0]!.id;
    const outcome = engine.applyCommand("p0", { type: "confirmTrade", offerId });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-accepted");
    expect(s.offers).toHaveLength(1);
  });

  it("a counteroffer is executed by the proposer with the counter terms", () => {
    const engine = mainEngine("trade-counter");
    const s = offerFromP0(engine);
    const offerId = s.offers[0]!.id;

    const counter = engine.applyCommand("p1", {
      type: "respondTrade",
      offerId,
      response: "counter",
      counter: hand({ wool: 1 }),
      counterGet: hand({ brick: 2 }),
    });
    expect(counter.ok).toBe(true);
    expect(s.offers[0]!.counter).toEqual({ give: hand({ wool: 1 }), get: hand({ brick: 2 }) });

    const confirm = engine.applyCommand("p0", { type: "confirmTrade", offerId });
    expect(confirm.ok).toBe(true);
    // p0 gives 2 brick, gets 1 wool (the counter terms).
    expect(playerById(s, "p0")!.resources).toEqual(hand({ wool: 1 }));
    expect(playerById(s, "p1")!.resources).toEqual(hand({ brick: 2, wool: 1 }));
    expect(s.offers).toHaveLength(0);
  });

  it("confirm revalidates that both sides still hold the cards", () => {
    const engine = mainEngine("trade-revalidate");
    const s = offerFromP0(engine);
    const offerId = s.offers[0]!.id;
    expect(engine.applyCommand("p1", { type: "respondTrade", offerId, response: "accept" }).ok).toBe(true);

    // p1's wool vanishes before confirmation.
    playerById(s, "p1")!.resources.wool = 0;
    const outcome = engine.applyCommand("p0", { type: "confirmTrade", offerId });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-enough");
    expect(handTotal(playerById(s, "p0")!.resources)).toBe(2); // untouched
  });

  it("the proposer may withdraw an offer", () => {
    const engine = mainEngine("trade-cancel");
    const s = offerFromP0(engine);
    const offerId = s.offers[0]!.id;
    const other = engine.applyCommand("p1", { type: "cancelTrade", offerId });
    expect(other.ok).toBe(false);
    expect(other.error).toBe("not-your-turn"); // only the active proposer acts
    expect(engine.applyCommand("p0", { type: "cancelTrade", offerId }).ok).toBe(true);
    expect(s.offers).toHaveLength(0);
  });

  it("open offers are cleared when the turn ends", () => {
    const engine = mainEngine("trade-clear");
    const s = offerFromP0(engine);
    expect(s.offers).toHaveLength(1);
    grant(s, "p0", { brick: 2 });
    expect(engine.applyCommand("p0", { type: "endTurn" }).ok).toBe(true);
    expect(s.offers).toHaveLength(0);
    expect(s.turnIndex).toBe(1);
    expect(s.phase).toBe("roll");
  });

  it("trades are impossible outside the main phase", () => {
    const engine = mainEngine("trade-phase");
    drainHands(engine);
    const s = engine.state;
    grant(s, "p0", { brick: 2 });
    expect(engine.applyCommand("p0", { type: "endTurn" }).ok).toBe(true);
    expect(s.phase).toBe("roll");
    const outcome = engine.applyCommand("p0", {
      type: "offerTrade",
      to: "p1",
      give: hand({ brick: 1 }),
      get: hand({ wool: 1 }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("not-your-turn");
  });
});
