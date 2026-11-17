import { randomInt } from "node:crypto";
import {
  BANK_SUPPLY,
  COSTS,
  DEV_DECK,
  PIECE_LIMITS,
  addHands,
  bankTradeRatio,
  canAfford,
  emptyHand,
  generateBoard,
  handTotal,
  hexResource,
  legalCityUpgrades,
  legalRoadEdges,
  legalSettlementVertices,
  longestRoadLength,
  mulberry32,
  playerById,
  subHands,
  totalPoints,
  type BoardMode,
  type DevCardType,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LogEntry,
  type PlayerColor,
  type PlayerGame,
  type Rng,
  type Resource,
  type ResourceHand,
  type TradeOffer,
} from "@hexhaven/shared";

export interface EnginePlayerSeed {
  id: string;
  name: string;
  color: PlayerColor;
}

/** Cryptographically secure live-game randomness; board seeds remain public.
 * Tests may inject deterministic sources, but real dice/decks/steals never
 * depend on a seed sent to clients. */
function secureRng(): Rng {
  return {
    next: () => randomInt(0x100000000) / 0x100000000,
    int: (max: number) => randomInt(max),
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

export interface EngineOptions {
  seed: string;
  boardMode: BoardMode;
  players: EnginePlayerSeed[];
  now?: () => number;
  /** Injectable random source for deterministic tests. */
  rng?: Rng;
  /** Independent deck RNG for deterministic tests; secure by default. */
  deckRng?: Rng;
}

export type CommandOutcome =
  | { ok: true; events: GameEvent[]; error?: undefined; message?: undefined }
  | { ok: false; error: string; message: string; events?: undefined };

const SCHEMA_VERSION = 1;
const MAX_LOG = 300;

const err = (error: string, message: string): CommandOutcome => ({ ok: false, error, message });

/**
 * Deterministic, authoritative game engine for the base game.
 * Mutates its own GameState; never touches sockets, timers or IO. Randomness
 * and the clock are injected so tests can replay exact games.
 */
export class GameEngine {
  state: GameState;
  private rng: Rng;
  private now: () => number;

  constructor(options: EngineOptions) {
    this.rng = options.rng ?? secureRng();
    this.now = options.now ?? Date.now;
    const board = generateBoard(options.players.length > 4 && options.boardMode === "fixed" ? "balanced" : options.boardMode, options.seed, options.players.length > 4 ? 3 : 2);
    const desertHex = [...board.hexes.values()].find((h) => h.terrain === "desert");
    const players: PlayerGame[] = options.players.map((p, index) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      index,
      resources: emptyHand(),
      devCards: [],
      knightsPlayed: 0,
      roads: [],
      settlements: [],
      cities: [],
      boughtThisTurn: 0,
      playedDevThisTurn: false,
    }));
    const setupSequence = [
      ...players.map((p) => p.id),
      ...[...players].reverse().map((p) => p.id),
    ];
    this.state = {
      schemaVersion: SCHEMA_VERSION,
      seed: options.seed,
      boardMode: options.boardMode,
      board,
      players,
      phase: "setup",
      turnIndex: 0,
      turnCount: 0,
      rev: 0,
      dice: null,
      bank: { brick: options.players.length > 4 ? 38 : BANK_SUPPLY, lumber: options.players.length > 4 ? 38 : BANK_SUPPLY, wool: options.players.length > 4 ? 38 : BANK_SUPPLY, grain: options.players.length > 4 ? 38 : BANK_SUPPLY, ore: options.players.length > 4 ? 38 : BANK_SUPPLY },
      devDeck: this.shuffleDevDeck(options.deckRng ?? secureRng()),
      robberHex: desertHex?.id ?? board.topology.landHexes[0]!,
      pending: { type: "setup", step: 0, player: setupSequence[0]!, needsRoad: false, vertex: null },
      offers: [],
      awards: {
        longestRoad: { playerId: null, length: 0 },
        largestArmy: { playerId: null, size: 0 },
      },
      log: [],
      startedAt: this.now(),
      finishedAt: null,
      winnerId: null,
      setupSequence,
    };
    this.log("Welcome to the island. Place your first settlements.", "system");
  }

  /** Public maintenance hook: recompute awards and victory from state.
   * Used after snapshot restore and by tests. */
  refreshAwards(): GameEvent[] {
    const events = this.recomputeAwards();
    this.checkVictory();
    return events;
  }

  /** Restores a saved state (e.g. after a server restart). The board is
   * regenerated deterministically; past dice rolls are not replayed, future
   * randomness uses a fresh secure source on resume. */
  static fromSaved(state: GameState, now?: () => number): GameEngine {
    const engine = Object.create(GameEngine.prototype) as GameEngine;
    engine.rng = secureRng();
    engine.now = now ?? Date.now;
    engine.state = state;
    return engine;
  }

  private shuffleDevDeck(deckRng: Rng) {
    const deck = [...DEV_DECK];
    // Fisher-Yates with a dedicated deck rng so gameplay rng stays scripted.
    for (let i = deck.length - 1; i > 0; i--) {
      const j = deckRng.int(i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    return deck.map((type, i) => ({
      id: `dev-${i}-${type}`,
      type: type as DevCardType,
      boughtTurn: 0,
    }));
  }

  private log(text: string, tone: LogEntry["tone"] = "action"): void {
    this.state.log.push({ turn: this.state.turnCount, rev: this.state.rev + 1, text, tone });
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
  }

  private get active(): PlayerGame {
    return this.state.players[this.state.turnIndex]!;
  }

  private isPlayer(playerId: string): boolean {
    return this.state.players.some((p) => p.id === playerId);
  }

  /** Applies a validated command. The caller owns session/turn auth. */
  applyCommand(playerId: string, command: GameCommand): CommandOutcome {
    const result = this.dispatch(playerId, command);
    if (!result.ok) return result;
    // Common tail after every accepted mutation.
    this.state.rev++;
    const awardEvents = this.recomputeAwards();
    this.checkVictory();
    return { ok: true, events: [...result.events, ...awardEvents] };
  }

  private dispatch(playerId: string, command: GameCommand): CommandOutcome {
    if (!this.isPlayer(playerId)) return err("unknown-player", "You are not seated at this table.");
    const s = this.state;
    if (s.phase === "finished") return err("game-over", "The game has finished.");
    const player = playerById(s, playerId)!;
    const isSetup = s.pending.type === "setup";
    const isActing = s.pending.type === "setup" ? s.pending.player === playerId : this.active.id === playerId;

    // Setup-phase commands.
    if (isSetup) {
      const pending = s.pending as { type: "setup"; step: number; player: string; needsRoad: boolean; vertex: string | null };
      if (pending.player !== playerId) return err("not-your-turn", "It is another player's turn to place.");
      if (command.type === "placeSettlement") {
        if (pending.needsRoad) return err("place-road-first", "Place the road for your settlement first.");
        return this.setupSettlement(player, command.vertex);
      }
      if (command.type === "placeRoad") {
        if (!pending.needsRoad || !pending.vertex) return err("place-settlement-first", "Place your settlement first.");
        return this.setupRoad(player, command.edge, pending.vertex);
      }
      return err("wrong-phase", "You must place your starting pieces.");
    }

    // Robber/discard/build pendings gate almost everything. placeRoad passes
    // through when the pending is a Road Building free-road phase (handled in
    // buildRoad); other pendings reject it there as well.
    if (
      s.pending.type !== "none" &&
      command.type !== "discard" &&
      command.type !== "moveRobber" &&
      command.type !== "selectVictim" &&
      !(command.type === "placeRoad" && s.pending.type === "roadBuilding")
    ) {
      const pend = s.pending;
      if (pend.type === "discard") return err("discard-required", "Wait until all players have discarded.");
      if (pend.type === "robberMove") return err("robber-required", "Move the robber first.");
      if (pend.type === "robberSteal") return err("steal-required", "Choose a player to steal from.");
      if (pend.type === "roadBuilding") return err("free-roads-required", "Place your free roads first.");
    }

    if (!isActing && command.type !== "discard" && command.type !== "respondTrade") {
      return err("not-your-turn", "It is not your turn.");
    }

    switch (command.type) {
      case "rollDice":
        return this.rollDice(player);
      case "discard":
        return this.discard(player, command.resources);
      case "moveRobber":
        return this.moveRobber(player, command.hex, command.victim);
      case "selectVictim":
        return this.selectVictim(player, command.player);
      case "placeSettlement":
        return this.buildSettlement(player, command.vertex);
      case "placeRoad":
        return this.buildRoad(player, command.edge);
      case "upgradeCity":
        return this.buildCity(player, command.vertex);
      case "buyDevelopment":
        return this.buyDevelopment(player);
      case "playKnight":
        return this.playKnight(player);
      case "playRoadBuilding":
        return this.playRoadBuilding(player);
      case "playYearOfPlenty":
        return this.playYearOfPlenty(player, command.resources);
      case "playMonopoly":
        return this.playMonopoly(player, command.resource);
      case "offerTrade":
        return this.offerTrade(player, command.to, command.give, command.get);
      case "respondTrade":
        return this.respondTrade(player, command.offerId, command.response, command.counter, command.counterGet);
      case "confirmTrade":
        return this.confirmTrade(player, command.offerId);
      case "cancelTrade":
        return this.cancelTrade(player, command.offerId);
      case "bankTrade":
        return this.bankTrade(player, command.give, command.get);
      case "endTurn":
        return this.endTurn(player);
      default: {
        const exhaustive: never = command;
        void exhaustive;
        return err("unknown-command", "Unknown command.");
      }
    }
  }

  // ------------------------------------------------------------------ setup

  private setupSettlement(player: PlayerGame, vertexId: string): CommandOutcome {
    const s = this.state;
    const legal = legalSettlementVertices(s, player.id, { requireConnection: false });
    if (!legal.has(vertexId)) {
      return err("illegal-settlement", "That spot is too close to an existing settlement or not buildable.");
    }
    player.settlements.push(vertexId);
    const pending = s.pending as { type: "setup"; step: number; needsRoad: boolean; vertex: string | null };
    const secondRound = pending.step >= s.players.length;
    const events: GameEvent[] = [];
    if (secondRound) {
      // Second settlement grants one resource per adjacent land hex.
      const gain = emptyHand();
      for (const hexKeyStr of s.board.topology.vertices.get(vertexId)!.hexes) {
        const hex = s.board.hexes.get(hexKeyStr);
        if (!hex) continue;
        const resource = hexResource(hex);
        if (!resource) continue;
        gain[resource]++;
      }
      if (handTotal(gain) > 0) {
        player.resources = addHands(player.resources, gain);
        this.takeFromBank(gain);
        events.push({ kind: "produced", gains: [{ playerId: player.id, hand: gain }] });
        this.log(`${player.name} founded their second settlement and collected starting resources.`, "action");
      }
    } else {
      this.log(`${player.name} placed their first settlement.`, "action");
    }
    s.pending = { type: "setup", step: pending.step, player: player.id, needsRoad: true, vertex: vertexId };
    return { ok: true, events };
  }

  private setupRoad(player: PlayerGame, edgeIdStr: string, vertexId: string): CommandOutcome {
    const s = this.state;
    const edge = s.board.topology.edges.get(edgeIdStr);
    if (!edge) return err("unknown-edge", "That road position does not exist.");
    if (edge.a !== vertexId && edge.b !== vertexId) {
      return err("not-connected", "Your starting road must touch your new settlement.");
    }
    if (s.players.some((p) => p.roads.includes(edgeIdStr))) {
      return err("occupied", "Someone already built there.");
    }
    if (player.roads.length >= PIECE_LIMITS.roads) return err("no-pieces", "You have no roads left.");
    player.roads.push(edgeIdStr);

    const pending = s.pending as { type: "setup"; step: number };
    const nextStep = pending.step + 1;
    if (nextStep >= s.setupSequence.length) {
      const lastId = s.setupSequence[s.setupSequence.length - 1]!;
      const starter = playerById(s, lastId)!;
      s.phase = "roll";
      s.turnIndex = starter.index;
      s.turnCount = 1;
      s.pending = { type: "none" };
      for (const p of s.players) {
        p.boughtThisTurn = 0;
        p.playedDevThisTurn = false;
      }
      this.log(`Setup complete — ${starter.name} rolls first.`, "system");
    } else {
      const nextId = s.setupSequence[nextStep]!;
      const next = playerById(s, nextId)!;
      s.pending = { type: "setup", step: nextStep, player: nextId, needsRoad: false, vertex: null };
      this.log(`${player.name} built a starting road.`, "action");
      void next;
    }
    return { ok: true, events: [] };
  }

  // ------------------------------------------------------------------- dice

  private rollDice(player: PlayerGame): CommandOutcome {
    const s = this.state;
    if (s.phase !== "roll") return err("wrong-phase", "You cannot roll now.");
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");

    const die = () => this.rng.int(6) + 1;
    const dice: [number, number] = [die(), die()];
    const total = dice[0]! + dice[1]!;
    s.dice = dice;
    const events: GameEvent[] = [{ kind: "dice", dice, total }];
    this.log(`${player.name} rolled ${dice[0]} + ${dice[1]} = ${total}.`, "roll");

    if (total === 7) {
      const owe = s.players
        .filter((p) => handTotal(p.resources) > 7)
        .map((p) => ({ playerId: p.id, count: Math.floor(handTotal(p.resources) / 2) }));
      if (owe.length > 0) {
        s.pending = { type: "discard", players: owe, afterRoll: true };
        return { ok: true, events };
      }
      s.pending = { type: "robberMove", afterRoll: true };
      return { ok: true, events };
    }

    // Production.
    const gains = new Map<string, ResourceHand>();
    for (const hex of s.board.hexes.values()) {
      if (hex.number !== total) continue;
      if (hex.id === s.robberHex) continue;
      const resource = hexResource(hex);
      if (!resource) continue;
      for (const vertexId of hex.vertices) {
        for (const p of s.players) {
          const isCity = p.cities.includes(vertexId);
          if (!p.settlements.includes(vertexId) && !isCity) continue;
          const g = gains.get(p.id) ?? emptyHand();
          g[resource] += isCity ? 2 : 1;
          gains.set(p.id, g);
        }
      }
    }

    if (gains.size === 0) {
      this.log("No one produced resources.", "roll");
      s.phase = "main";
      return { ok: true, events };
    }

    // Official supply-shortage rule: if the bank cannot cover a resource for
    // all production, nobody receives that resource.
    const demand = new Map<Resource, number>();
    for (const g of gains.values()) {
      for (const r of Object.keys(g) as Resource[]) demand.set(r, (demand.get(r) ?? 0) + g[r]);
    }
    const shortage = [...demand.entries()].filter(([r, amount]) => s.bank[r] < amount);
    const shorted = new Set<Resource>(shortage.map(([r]) => r));
    const finalGains: { playerId: string; hand: ResourceHand }[] = [];
    for (const [playerIdStr, g] of gains) {
      const paid = emptyHand();
      for (const r of Object.keys(g) as Resource[]) {
        if (!shorted.has(r)) {
          paid[r] = g[r];
          continue;
        }
        // Official exception: if exactly one player is due this resource,
        // award that player whatever remains in the bank.
        const recipients = [...gains.values()].filter((hand) => hand[r] > 0).length;
        if (recipients === 1) paid[r] = Math.min(g[r], s.bank[r]);
      }
      if (handTotal(paid) === 0) continue;
      finalGains.push({ playerId: playerIdStr, hand: paid });
    }

    if (finalGains.length === 0) {
      this.log("The bank could not supply production — no one received resources.", "system");
      s.phase = "main";
      return { ok: true, events };
    }

    for (const { playerIdStr, hand } of finalGains.map((x) => ({ playerIdStr: x.playerId, hand: x.hand }))) {
      const p = playerById(s, playerIdStr)!;
      p.resources = addHands(p.resources, hand);
    }
    this.takeFromBank(
      finalGains.reduce((acc, g) => addHands(acc, g.hand), emptyHand()),
    );
    for (const g of finalGains) {
      const p = playerById(s, g.playerId)!;
      const parts = (Object.keys(g.hand) as Resource[]).filter((r) => g.hand[r] > 0);
      this.log(`${p.name} received ${parts.map((r) => `${g.hand[r]} ${r}`).join(", ")}.`, "roll");
    }
    if (shortage.length > 0) {
      this.log(`The bank ran short of ${shortage.map(([r]) => r).join(", ")} — production was reduced according to the supply rules.`, "system");
    }
    events.push({ kind: "produced", gains: finalGains });
    s.phase = "main";
    return { ok: true, events };
  }

  private takeFromBank(hand: ResourceHand): void {
    for (const r of Object.keys(hand) as Resource[]) {
      this.state.bank[r] = Math.max(0, this.state.bank[r] - hand[r]);
    }
  }

  private returnToBank(hand: ResourceHand): void {
    for (const r of Object.keys(hand) as Resource[]) {
      this.state.bank[r] = Math.min(this.state.players.length > 4 ? 38 : BANK_SUPPLY, this.state.bank[r] + hand[r]);
    }
  }

  // ---------------------------------------------------------------- discard

  private discard(player: PlayerGame, resources: ResourceHand): CommandOutcome {
    const s = this.state;
    if (s.pending.type !== "discard") return err("no-discard", "No discard is required.");
    const entry = s.pending.players.find((x) => x.playerId === player.id);
    if (!entry) return err("no-discard", "You do not need to discard.");
    if (handTotal(resources) !== entry.count) {
      return err("wrong-count", `You must discard exactly ${entry.count} cards.`);
    }
    for (const r of Object.keys(resources) as Resource[]) {
      if (resources[r] > player.resources[r]) return err("not-enough", "You cannot discard cards you do not hold.");
    }
    player.resources = subHands(player.resources, resources);
    this.returnToBank(resources);
    s.pending.players = s.pending.players.filter((x) => x.playerId !== player.id);
    this.log(`${player.name} discarded ${entry.count} resource cards.`, "robber");
    const events: GameEvent[] = [
      { kind: "discardPublic", playerId: player.id, count: entry.count },
      { kind: "discardPrivate", to: player.id, hand: resources },
    ];
    if (s.pending.players.length === 0) {
      s.pending = { type: "robberMove", afterRoll: true };
    }
    return { ok: true, events };
  }

  // ------------------------------------------------------------------ robber

  private moveRobber(player: PlayerGame, hexId: string, victim?: string): CommandOutcome {
    const s = this.state;
    if (s.pending.type !== "robberMove") return err("no-robber", "The robber cannot be moved now.");
    if (this.active.id !== player.id) return err("not-your-turn", "Only the active player moves the robber.");
    const hex = s.board.hexes.get(hexId);
    if (!hex || hex.terrain === "water") return err("unknown-hex", "Choose a land tile.");
    if (hexId === s.robberHex) return err("same-hex", "Move the robber to a different tile.");

    const candidates = s.players.filter(
      (p) =>
        p.id !== player.id &&
        handTotal(p.resources) > 0 &&
        s.board.hexes.get(hexId)!.vertices.some(
          (v) => p.settlements.includes(v) || p.cities.includes(v),
        ),
    );
    // Validate every part of the command before mutating state. A rejected
    // target must not leave the robber on a new hex without a revision bump.
    if (victim && !candidates.some((c) => c.id === victim)) {
      return err("bad-victim", "That player cannot be robbed here.");
    }
    s.robberHex = hexId;
    this.log(`${player.name} moved the robber.`, "robber");
    if (victim) {
      const afterRoll = s.pending.afterRoll ?? false;
      const events = this.executeSteal(player.id, victim);
      s.pending = { type: "none" };
      if (afterRoll && s.phase === "roll") s.phase = "main";
      return { ok: true, events };
    }
    if (candidates.length > 0) {
      s.pending = { type: "robberSteal", candidates: candidates.map((c) => c.id), afterRoll: s.pending.afterRoll };
      return { ok: true, events: [] };
    }
    const afterRoll = s.pending.afterRoll ?? false;
    s.pending = { type: "none" };
    if (afterRoll && s.phase === "roll") s.phase = "main";
    return { ok: true, events: [] };
  }

  private selectVictim(player: PlayerGame, victimId: string): CommandOutcome {
    const s = this.state;
    if (s.pending.type !== "robberSteal") return err("no-steal", "There is no one to steal from right now.");
    if (this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");
    if (!s.pending.candidates.includes(victimId)) return err("bad-victim", "That player cannot be robbed.");
    const afterRoll = s.pending.afterRoll ?? false;
    const events = this.executeSteal(player.id, victimId);
    s.pending = { type: "none" };
    if (afterRoll && s.phase === "roll") s.phase = "main";
    return { ok: true, events };
  }

  private executeSteal(byId: string, victimId: string): GameEvent[] {
    const s = this.state;
    const victim = playerById(s, victimId)!;
    const pool: Resource[] = [];
    for (const r of Object.keys(victim.resources) as Resource[]) {
      for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
    }
    if (pool.length === 0) return [];
    const taken = pool[this.rng.int(pool.length)]!;
    victim.resources[taken]--;
    playerById(s, byId)!.resources[taken]++;
    this.log(`${playerById(s, byId)!.name} stole a resource from ${victim.name}.`, "robber");
    return [
      { kind: "stolen", from: victimId, by: byId },
      { kind: "stolenPrivate", to: victimId, resource: taken },
    ];
  }

  // ---------------------------------------------------------------- building

  private buildRoad(player: PlayerGame, edgeIdStr: string): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main" && !(s.phase === "roll" && s.pending.type === "roadBuilding")) {
      return err("wrong-phase", "You cannot build roads now.");
    }
    const free = s.pending.type === "roadBuilding" && this.active.id === player.id;
    if (!free && s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (!free && this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");

    const edge = s.board.topology.edges.get(edgeIdStr);
    if (!edge) return err("unknown-edge", "That road position does not exist.");
    const legal = legalRoadEdges(s, player.id);
    if (!legal.has(edgeIdStr)) {
      return err("illegal-road", "Roads must connect to your road network and cannot pass through rival buildings.");
    }
    if (player.roads.length >= PIECE_LIMITS.roads) return err("no-pieces", "You have no roads left.");

    if (!free) {
      if (!canAfford(player.resources, COSTS.road)) return err("cannot-afford", "A road costs 1 brick and 1 lumber.");
      player.resources = subHands(player.resources, COSTS.road);
      this.returnToBank(COSTS.road);
    }
    player.roads.push(edgeIdStr);
    this.log(`${player.name} built a road.`, "action");

    if (free) {
      const remaining = s.pending.type === "roadBuilding" ? s.pending.remaining - 1 : 0;
      if (remaining <= 0 || legalRoadEdges(s, player.id).size === 0) {
        s.pending = { type: "none" };
        if (remaining > 0) this.log(`${player.name} has no more road spots for Road Building.`, "card");
      } else {
        s.pending = { type: "roadBuilding", remaining };
      }
    }
    return { ok: true, events: [] };
  }

  private buildSettlement(player: PlayerGame, vertexId: string): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main") return err("wrong-phase", "You cannot build settlements now.");
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");

    const legal = legalSettlementVertices(s, player.id, { requireConnection: true });
    if (!legal.has(vertexId)) {
      return err("illegal-settlement", "Settlements need a connecting road, an empty spot and no neighbors.");
    }
    if (player.settlements.length + player.cities.length >= PIECE_LIMITS.settlements) {
      return err("no-pieces", "You have no settlements left. Upgrade one to a city first.");
    }
    if (!canAfford(player.resources, COSTS.settlement)) {
      return err("cannot-afford", "A settlement costs 1 brick, 1 lumber, 1 wool and 1 grain.");
    }
    player.resources = subHands(player.resources, COSTS.settlement);
    this.returnToBank(COSTS.settlement);
    player.settlements.push(vertexId);
    this.log(`${player.name} built a settlement.`, "action");
    return { ok: true, events: [] };
  }

  private buildCity(player: PlayerGame, vertexId: string): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main") return err("wrong-phase", "You cannot build cities now.");
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");

    if (!legalCityUpgrades(s, player.id).has(vertexId)) {
      return err("illegal-city", "You can only upgrade your own settlements.");
    }
    if (player.cities.length >= PIECE_LIMITS.cities) return err("no-pieces", "You have no cities left.");
    if (!canAfford(player.resources, COSTS.city)) {
      return err("cannot-afford", "A city costs 2 grain and 3 ore.");
    }
    player.resources = subHands(player.resources, COSTS.city);
    this.returnToBank(COSTS.city);
    player.settlements = player.settlements.filter((v) => v !== vertexId);
    player.cities.push(vertexId);
    this.log(`${player.name} upgraded a settlement to a city.`, "action");
    return { ok: true, events: [] };
  }

  // ------------------------------------------------------------ development

  private buyDevelopment(player: PlayerGame): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main") return err("wrong-phase", "You cannot buy development cards now.");
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");
    if (s.devDeck.length === 0) return err("deck-empty", "The development deck is empty.");
    if (!canAfford(player.resources, COSTS.development)) {
      return err("cannot-afford", "A development card costs 1 wool, 1 grain and 1 ore.");
    }
    player.resources = subHands(player.resources, COSTS.development);
    this.returnToBank(COSTS.development);
    const card = s.devDeck.pop()!;
    card.boughtTurn = s.turnCount;
    player.devCards.push(card);
    player.boughtThisTurn++;
    this.log(`${player.name} bought a development card.`, "card");
    return { ok: true, events: [] };
  }

  private canPlayActionCard(player: PlayerGame, type: DevCardType): { cardIndex: number } | string {
    const s = this.state;
    if (s.phase !== "roll" && s.phase !== "main") return "Development cards cannot be played now.";
    if (s.pending.type !== "none") return "Resolve the current decision first.";
    if (this.active.id !== player.id) return "It is not your turn.";
    if (player.playedDevThisTurn) return "You already played a development card this turn.";
    const idx = player.devCards.findIndex((c) => c.type === type && c.boughtTurn < s.turnCount);
    if (idx < 0) return "You have no playable card of that type this turn.";
    return { cardIndex: idx };
  }

  private playKnight(player: PlayerGame): CommandOutcome {
    const s = this.state;
    const card = this.canPlayActionCard(player, "knight");
    if (typeof card === "string") return err("cannot-play", card);
    player.devCards.splice(card.cardIndex, 1);
    player.playedDevThisTurn = true;
    player.knightsPlayed++;
    this.log(`${player.name} played a Knight.`, "card");
    s.pending = { type: "robberMove" };
    return { ok: true, events: [] };
  }

  private playRoadBuilding(player: PlayerGame): CommandOutcome {
    const s = this.state;
    const card = this.canPlayActionCard(player, "roadBuilding");
    if (typeof card === "string") return err("cannot-play", card);
    player.devCards.splice(card.cardIndex, 1);
    player.playedDevThisTurn = true;
    this.log(`${player.name} played Road Building — two free roads.`, "card");
    if (player.roads.length >= PIECE_LIMITS.roads || legalRoadEdges(s, player.id).size === 0) {
      this.log(`${player.name} has no legal road spots.`, "card");
      return { ok: true, events: [] };
    }
    s.pending = { type: "roadBuilding", remaining: 2 };
    return { ok: true, events: [] };
  }

  private playYearOfPlenty(player: PlayerGame, resources: ResourceHand): CommandOutcome {
    const s = this.state;
    const card = this.canPlayActionCard(player, "yearOfPlenty");
    if (typeof card === "string") return err("cannot-play", card);
    const total = handTotal(resources);
    if (total < 1 || total > 2) return err("wrong-count", "Choose one or two resources.");
    for (const r of Object.keys(resources) as Resource[]) {
      if (resources[r] > 2) return err("too-many", "You cannot take more than two of a resource.");
      if (resources[r] > s.bank[r]) return err("bank-empty", `The bank has no ${r} left.`);
    }
    player.devCards.splice(card.cardIndex, 1);
    player.playedDevThisTurn = true;
    player.resources = addHands(player.resources, resources);
    this.takeFromBank(resources);
    const names = (Object.keys(resources) as Resource[]).filter((r) => resources[r] > 0);
    this.log(`${player.name} played Year of Plenty and took ${names.join(", ")}.`, "card");
    return { ok: true, events: [{ kind: "produced", gains: [{ playerId: player.id, hand: resources }] }] };
  }

  private playMonopoly(player: PlayerGame, resource: Resource): CommandOutcome {
    const s = this.state;
    const card = this.canPlayActionCard(player, "monopoly");
    if (typeof card === "string") return err("cannot-play", card);
    player.devCards.splice(card.cardIndex, 1);
    player.playedDevThisTurn = true;
    let taken = 0;
    for (const p of s.players) {
      if (p.id === player.id) continue;
      taken += p.resources[resource];
      p.resources[resource] = 0;
    }
    player.resources[resource] += taken;
    this.log(
      taken === 0
        ? `${player.name} played Monopoly and took nothing — no one held any ${resource}.`
        : `${player.name} played Monopoly and took ${taken} ${resource}.`,
      "card",
    );
    if (taken > 0) {
      return {
        ok: true,
        events: [{ kind: "produced", gains: [{ playerId: player.id, hand: { ...emptyHand(), [resource]: taken } }] }],
      };
    }
    return { ok: true, events: [] };
  }

  // ----------------------------------------------------------------- trading

  private offerTrade(player: PlayerGame, toId: string, give: ResourceHand, get: ResourceHand): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main") return err("wrong-phase", "Trading is only allowed during your turn.");
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (this.active.id !== player.id) return err("not-your-turn", "Only the active player can propose trades.");
    if (toId === player.id) return err("self-trade", "You cannot trade with yourself.");
    const to = playerById(s, toId);
    if (!to) return err("unknown-player", "That player is not at this table.");
    if (handTotal(give) < 1 || handTotal(get) < 1) {
      return err("empty-offer", "Offer at least one card and ask for at least one card.");
    }
    for (const r of Object.keys(give) as Resource[]) {
      if (give[r] > player.resources[r]) return err("not-enough", "You cannot offer cards you do not hold.");
    }
    const offer: TradeOffer = {
      id: `offer-${s.rev + 1}-${s.offers.length}-${player.id.slice(0, 6)}`,
      from: player.id,
      to: toId,
      give: { ...give },
      get: { ...get },
      status: "pending",
      counter: null,
    };
    s.offers.push(offer);
    this.log(`${player.name} proposed a trade with ${to.name}.`, "trade");
    return { ok: true, events: [] };
  }

  private respondTrade(
    player: PlayerGame,
    offerId: string,
    response: "accept" | "decline" | "counter",
    counterGive?: ResourceHand,
    counterGet?: ResourceHand,
  ): CommandOutcome {
    const s = this.state;
    const offer = s.offers.find((o) => o.id === offerId);
    if (!offer) return err("unknown-offer", "That trade offer no longer exists.");
    if (offer.to !== player.id) return err("not-for-you", "This offer was not made to you.");
    if (offer.status !== "pending") return err("offer-closed", "This offer has already been resolved.");
    if (s.phase !== "main" || this.active.id !== offer.from) {
      return err("wrong-phase", "Trades can only be answered during the proposing player's turn.");
    }
    const from = playerById(s, offer.from)!;

    if (response === "accept") {
      offer.status = "accepted";
      this.log(`${player.name} accepted ${from.name}'s trade offer.`, "trade");
      return { ok: true, events: [] };
    }
    if (response === "decline") {
      s.offers = s.offers.filter((o) => o.id !== offerId);
      this.log(`${player.name} declined ${from.name}'s trade offer.`, "trade");
      return { ok: true, events: [] };
    }
    // Counter.
    if (!counterGive || !counterGet) return err("bad-counter", "A counteroffer needs both sides.");
    if (handTotal(counterGive) < 1 || handTotal(counterGet) < 1) {
      return err("empty-offer", "Counter with at least one card on each side.");
    }
    for (const r of Object.keys(counterGive) as Resource[]) {
      if (counterGive[r] > player.resources[r]) return err("not-enough", "You cannot offer cards you do not hold.");
    }
    offer.counter = { give: { ...counterGive }, get: { ...counterGet } };
    offer.status = "pending";
    this.log(`${player.name} countered ${from.name}'s trade offer.`, "trade");
    return { ok: true, events: [] };
  }

  private confirmTrade(player: PlayerGame, offerId: string): CommandOutcome {
    const s = this.state;
    const offer = s.offers.find((o) => o.id === offerId);
    if (!offer) return err("unknown-offer", "That trade offer no longer exists.");
    if (offer.from !== player.id) return err("not-your-offer", "Only the proposing player can finalize a trade.");
    if (s.phase !== "main" || this.active.id !== player.id) {
      return err("wrong-phase", "Trades can only be completed during your turn.");
    }
    const partner = playerById(s, offer.to)!;
    const events: GameEvent[] = [];

    if (offer.counter) {
      // Execute the counteroffer: partner gives counter.give, player gives counter.get.
      const partnerGive = offer.counter.give;
      const partnerGet = offer.counter.get;
      for (const r of Object.keys(partnerGive) as Resource[]) {
        if (partnerGive[r] > partner.resources[r]) return err("not-enough", `${partner.name} no longer has the cards.`);
      }
      for (const r of Object.keys(partnerGet) as Resource[]) {
        if (partnerGet[r] > player.resources[r]) return err("not-enough", "You no longer have the cards.");
      }
      partner.resources = subHands(partner.resources, partnerGive);
      player.resources = addHands(player.resources, partnerGive);
      player.resources = subHands(player.resources, partnerGet);
      partner.resources = addHands(partner.resources, partnerGet);
      this.log(`${player.name} and ${partner.name} completed a trade.`, "trade");
    } else {
      if (offer.status !== "accepted") {
        return err("not-accepted", "Wait for the other player to accept your offer.");
      }
      for (const r of Object.keys(offer.give) as Resource[]) {
        if (offer.give[r] > player.resources[r]) return err("not-enough", "You no longer have the offered cards.");
      }
      for (const r of Object.keys(offer.get) as Resource[]) {
        if (offer.get[r] > partner.resources[r]) return err("not-enough", `${partner.name} no longer has the requested cards.`);
      }
      player.resources = subHands(player.resources, offer.give);
      player.resources = addHands(player.resources, offer.get);
      partner.resources = subHands(partner.resources, offer.get);
      partner.resources = addHands(partner.resources, offer.give);
      this.log(`${player.name} and ${partner.name} completed a trade.`, "trade");
    }
    s.offers = s.offers.filter((o) => o.id !== offerId);
    return { ok: true, events };
  }

  private cancelTrade(player: PlayerGame, offerId: string): CommandOutcome {
    const s = this.state;
    const offer = s.offers.find((o) => o.id === offerId);
    if (!offer) return err("unknown-offer", "That trade offer no longer exists.");
    if (offer.from !== player.id) return err("not-your-offer", "You can only withdraw your own offers.");
    s.offers = s.offers.filter((o) => o.id !== offerId);
    this.log(`${player.name} withdrew a trade offer.`, "trade");
    return { ok: true, events: [] };
  }

  private bankTrade(player: PlayerGame, give: Resource, get: Resource): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main") return err("wrong-phase", "Trading is only allowed during your turn.");
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");
    if (this.active.id !== player.id) return err("not-your-turn", "Only the active player can trade with the bank.");
    if (give === get) return err("same-resource", "Trade one resource for a different one.");
    const ratio = bankTradeRatio(s, player.id, give);
    if (player.resources[give] < ratio) {
      return err("not-enough", `You need ${ratio} ${give} for this trade.`);
    }
    if (s.bank[get] < 1) return err("bank-empty", `The bank has no ${get} left.`);
    const giveHand = emptyHand();
    giveHand[give] = ratio;
    const getHand = emptyHand();
    getHand[get] = 1;
    player.resources = subHands(player.resources, giveHand);
    this.returnToBank(giveHand);
    player.resources = addHands(player.resources, getHand);
    this.takeFromBank(getHand);
    this.log(`${player.name} traded ${ratio} ${give} for 1 ${get} with the bank.`, "trade");
    return { ok: true, events: [] };
  }

  // ---------------------------------------------------------------- turn end

  private endTurn(player: PlayerGame): CommandOutcome {
    const s = this.state;
    if (s.phase !== "main") return err("wrong-phase", "You cannot end your turn now.");
    if (this.active.id !== player.id) return err("not-your-turn", "It is not your turn.");
    if (s.pending.type === "roadBuilding") {
      if (legalRoadEdges(s, player.id).size > 0 && player.roads.length < PIECE_LIMITS.roads) {
        return err("free-roads-required", "Place your free roads or keep going — you still have legal spots.");
      }
      s.pending = { type: "none" };
    }
    if (s.pending.type !== "none") return err("pending", "Resolve the current decision first.");

    s.offers = [];
    const nextIndex = (s.turnIndex + 1) % s.players.length;
    const next = s.players[nextIndex]!;
    s.turnIndex = nextIndex;
    s.turnCount++;
    for (const p of s.players) {
      p.boughtThisTurn = 0;
      p.playedDevThisTurn = false;
    }
    s.phase = "roll";
    this.log(`Turn ${s.turnCount} — ${next.name}.`, "system");
    return { ok: true, events: [] };
  }

  // ----------------------------------------------------------------- scoring

  /** Recomputes Longest Road and Largest Army; returns award-change events. */
  private recomputeAwards(): GameEvent[] {
    const s = this.state;
    const events: GameEvent[] = [];

    const lengths = new Map<string, number>();
    for (const p of s.players) lengths.set(p.id, longestRoadLength(s, p.id));
    const qualifying = [...s.players].filter((p) => (lengths.get(p.id) ?? 0) >= 5);
    const lr = s.awards.longestRoad;
    if (lr.playerId) {
      const holderLength = lengths.get(lr.playerId) ?? 0;
      if (holderLength < 5) {
        const best = Math.max(0, ...qualifying.map((p) => lengths.get(p.id)!));
        const winners = qualifying.filter((p) => lengths.get(p.id) === best);
        if (winners.length === 1) {
          const newHolder = winners[0]!;
          lr.playerId = newHolder.id;
          lr.length = best;
          this.log(`${newHolder.name} takes Longest Road (${best} roads).`, "award");
          events.push({ kind: "award", award: "longestRoad", playerId: newHolder.id });
        } else {
          if (lr.playerId) {
            this.log(`Longest Road is up for grabs after a tie.`, "award");
            events.push({ kind: "award", award: "longestRoad", playerId: null });
          }
          lr.playerId = null;
          lr.length = best;
        }
      } else {
        const exceeds = qualifying.filter((p) => p.id !== lr.playerId && (lengths.get(p.id) ?? 0) > holderLength);
        if (exceeds.length === 1) {
          const newHolder = exceeds[0]!;
          const newLen = lengths.get(newHolder.id)!;
          lr.playerId = newHolder.id;
          lr.length = newLen;
          this.log(`${newHolder.name} takes Longest Road (${newLen} roads).`, "award");
          events.push({ kind: "award", award: "longestRoad", playerId: newHolder.id });
        }
        // On ties the current holder keeps the award.
        else {
          lr.length = holderLength;
        }
      }
    } else if (qualifying.length > 0) {
      const best = Math.max(...qualifying.map((p) => lengths.get(p.id)!));
      const winners = qualifying.filter((p) => lengths.get(p.id) === best);
      if (winners.length === 1) {
        const holder = winners[0]!;
        lr.playerId = holder.id;
        lr.length = best;
        this.log(`${holder.name} claims Longest Road (${best} roads).`, "award");
        events.push({ kind: "award", award: "longestRoad", playerId: holder.id });
      }
    }

    const la = s.awards.largestArmy;
    const armies = new Map<string, number>();
    for (const p of s.players) armies.set(p.id, p.knightsPlayed);
    if (la.playerId) {
      const holderSize = armies.get(la.playerId) ?? 0;
      la.size = Math.max(la.size, holderSize);
      const exceeds = s.players.filter((p) => p.id !== la.playerId && (armies.get(p.id) ?? 0) > holderSize);
      if (exceeds.length === 1 && (armies.get(exceeds[0]!.id) ?? 0) >= 3) {
        const newHolder = exceeds[0]!;
        la.playerId = newHolder.id;
        la.size = armies.get(newHolder.id)!;
        this.log(`${newHolder.name} takes Largest Army (${la.size} knights).`, "award");
        events.push({ kind: "award", award: "largestArmy", playerId: newHolder.id });
      }
    } else {
      const eligible = s.players.filter((p) => (armies.get(p.id) ?? 0) >= 3);
      if (eligible.length === 1) {
        const holder = eligible[0]!;
        la.playerId = holder.id;
        la.size = armies.get(holder.id)!;
        this.log(`${holder.name} claims Largest Army (${la.size} knights).`, "award");
        events.push({ kind: "award", award: "largestArmy", playerId: holder.id });
      }
    }
    return events;
  }

  private checkVictory(): void {
    const s = this.state;
    if (s.phase === "finished" || s.turnCount === 0) return;
    // Base-game victory may only be claimed by the player whose turn it is.
    // Other players may pass ten points through award changes but must wait.
    const winner = this.active;
    const bestPoints = totalPoints(s, winner);
    if (bestPoints < 10) return;
    s.phase = "finished";
    s.finishedAt = this.now();
    s.winnerId = winner.id;
    s.pending = { type: "none" };
    s.offers = [];
    this.log(`${winner.name} wins the game with ${bestPoints} victory points!`, "award");
  }
}
