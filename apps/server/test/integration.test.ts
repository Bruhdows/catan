import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import Fastify, { type FastifyInstance } from "fastify";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  GameEvent,
  GameView,
  LobbyView,
  PlayerColor,
  ServerToClientEvents,
  SessionAuth,
} from "@hexhaven/shared";

// ---------------------------------------------------------------------------
// Server boot (real Fastify + Socket.IO + store, on an ephemeral port).
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let io: Server<never, ServerToClientEvents>;
let port = 0;

type ClientToServer = {
  "lobby:create": unknown;
  "lobby:join": unknown;
  "lobby:leave": unknown;
  "lobby:ready": unknown;
  "lobby:start": unknown;
  "lobby:reset": unknown;
  "game:command": unknown;
  "game:sync": unknown;
};

type Ack = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

beforeAll(async () => {
  process.env.DATA_DIR = "";
  process.env.RESTORE_MATCHES = "false";
  const [{ registerSocketHandlers }] = await Promise.all([import("../src/socket.js")]);
  app = Fastify({ logger: false });
  io = new Server(app.server, { cors: { origin: true } });
  registerSocketHandlers(io as never);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  port = typeof address === "object" && address ? address.port : 0;
  expect(port).toBeGreaterThan(0);
});

afterAll(async () => {
  io.close();
  await app.close();
});

// ---------------------------------------------------------------------------
// Client harness.
// ---------------------------------------------------------------------------

type AnySocket = ClientSocket<ServerToClientEvents, ClientToServer>;

class TestClient {
  readonly socket: AnySocket;
  auth!: SessionAuth & { lobby: LobbyView };
  views: GameView[] = [];
  lobbyStates: LobbyView[] = [];
  events: GameEvent[] = [];
  privateEvents: GameEvent[] = [];

  constructor(socket: AnySocket) {
    this.socket = socket;
    socket.on("game:state", (view) => this.views.push(view));
    socket.on("lobby:state", (view) => this.lobbyStates.push(view));
    socket.on("game:event", (event) => this.events.push(event));
    socket.on("game:private-event", (event) => this.privateEvents.push(event));
  }

  get view(): GameView {
    const view = this.views.at(-1);
    if (!view) throw new Error("no game view received yet");
    return view;
  }

  get lobby(): LobbyView {
    const view = this.lobbyStates.at(-1);
    if (!view) throw new Error("no lobby state received yet");
    return view;
  }
}

function connect(): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const timer = setTimeout(() => reject(new Error("connect timeout")), 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(new TestClient(socket as unknown as AnySocket));
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function ack<T = unknown>(client: TestClient, event: keyof ClientToServer, payload?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; message?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${String(event)}`)), 5000);
    const reply = (result: Ack) => {
      clearTimeout(timer);
      resolve(result as { ok: true; data: T } | { ok: false; error: string; message?: string });
    };
    const emit = client.socket.emit.bind(client.socket) as (...args: unknown[]) => void;
    if (payload === undefined) emit(event, reply);
    else emit(event, payload, reply);
  });
}

/** Fire-and-forget for events without an ack (lobby:ready, lobby:leave). */
function send(client: TestClient, event: keyof ClientToServer, payload?: unknown): void {
  const emit = client.socket.emit.bind(client.socket) as (...args: unknown[]) => void;
  if (payload === undefined) emit(event);
  else emit(event, payload);
}

async function until(fn: () => boolean, ms = 3000, what = "condition"): Promise<void> {
  const start = Date.now();
  for (;;) {
    let done = false;
    try {
      done = fn();
    } catch {
      done = false; // predicate touched state that has not arrived yet
    }
    if (done) return;
    if (Date.now() - start > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// View-side legality helpers, mirroring what the real web client will do.
function forbiddenVertices(view: GameView): Set<string> {
  const occupied = new Set<string>();
  for (const p of view.players) {
    for (const v of [...p.settlements, ...p.cities]) occupied.add(v);
  }
  const forbidden = new Set(occupied);
  for (const v of occupied) {
    const vertex = view.board.vertices.find((x) => x.id === v)!;
    for (const n of vertex.neighbors) forbidden.add(n);
  }
  return forbidden;
}

function legalSetupSpots(view: GameView): string[] {
  const forbidden = forbiddenVertices(view);
  const land = new Set(view.board.landHexes.map((h) => h.id));
  return view.board.vertices
    .filter((v) => !forbidden.has(v.id) && v.hexes.some((h) => land.has(h)))
    .map((v) => v.id);
}

function legalSetupRoads(view: GameView, vertex: string): string[] {
  const taken = new Set(view.players.flatMap((p) => p.roads));
  return view.board.edges
    .filter((e) => (e.a === vertex || e.b === vertex) && !taken.has(e.id))
    .map((e) => e.id);
}

/** Drives the whole setup phase through real socket commands. */
async function driveSetup(clients: TestClient[]): Promise<void> {
  for (let step = 0; step < clients.length * 4 + 4; step++) {
    const actor = clients.find((c) => c.view.pending.type === "setup" && c.view.pending.player === c.auth.playerId);
    if (!actor) return;
    const pending = actor.view.pending as { type: "setup"; player: string; needsRoad: boolean; vertex: string | null };
    const beforeRev = actor.view.rev;
    if (!pending.needsRoad) {
      const spot = legalSetupSpots(actor.view)[0]!;
      const res = await ack(actor, "game:command", { command: { type: "placeSettlement", vertex: spot }, commandId: `setup-s-${step}` });
      if (!res.ok) console.log("SETTLEMENT FAIL", step, res, "pending", JSON.stringify(pending), "spot", spot);
      expect(res.ok).toBe(true);
    } else {
      const edge = legalSetupRoads(actor.view, pending.vertex!)[0]!;
      const res = await ack(actor, "game:command", { command: { type: "placeRoad", edge }, commandId: `setup-r-${step}` });
      expect(res.ok).toBe(true);
    }
    await until(() => actor.view.rev > beforeRev, 3000, "view refresh");
    const newRev = actor.view.rev;
    await until(() => clients.every((c) => c.view.rev >= newRev), 3000, "all views caught up");
  }
  throw new Error("setup did not finish");
}

/** Rolls and resolves any robber flow until the phase is main. */
async function rollToMain(actor: TestClient, clients: TestClient[], step: number): Promise<void> {
  const res = await ack(actor, "game:command", { command: { type: "rollDice" }, commandId: `roll-${step}` });
  expect(res.ok).toBe(true);
  await until(() => actor.view.phase === "main" || actor.view.pending.type !== "none", 3000, "post-roll state");
  if (actor.view.pending.type === "robberMove") {
    const target = actor.view.board.landHexes.find((h) => h.id !== actor.view.robberHex)!;
    const move = await ack(actor, "game:command", { command: { type: "moveRobber", hex: target.id }, commandId: `robber-${step}` });
    expect(move.ok).toBe(true);
    await until(() => actor.view.phase === "main" || actor.view.pending.type === "robberSteal", 3000, "post-robber state");
    if ((actor.view.pending as { type: string }).type === "robberSteal") {
      const pending = actor.view.pending as { type: "robberSteal"; candidates: string[] };
      const steal = await ack(actor, "game:command", { command: { type: "selectVictim", player: pending.candidates[0]! }, commandId: `steal-${step}` });
      expect(steal.ok).toBe(true);
      await until(() => actor.view.phase === "main", 3000, "post-steal main");
    }
  }
  expect(actor.view.phase).toBe("main");
  void clients;
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("socket integration", () => {
  it("runs a lobby to a finished match and rematch over real sockets", { timeout: 40_000 }, async () => {
    const host = await connect();
    const created = await ack<SessionAuth & { lobby: LobbyView }>(host, "lobby:create", { name: "Host" });
    expect(created.ok).toBe(true);
    const code = (created as { ok: true; data: SessionAuth & { lobby: LobbyView } }).data.code;
    host.auth = (created as { ok: true; data: SessionAuth & { lobby: LobbyView } }).data;

    const alice = await connect();
    const bob = await connect();
    for (const [client, name] of [[alice, "Alice"], [bob, "Bob"]] as const) {
      const joined = await ack<SessionAuth & { lobby: LobbyView }>(client, "lobby:join", { code, name });
      expect(joined.ok).toBe(true);
      client.auth = (joined as { ok: true; data: SessionAuth & { lobby: LobbyView } }).data;
    }

    // Everyone readies up; the lobby broadcast reaches all members.
    for (const client of [host, alice, bob]) {
      send(client, "lobby:ready", { ready: true });
    }
    await until(() => host.lobby.players.every((p) => p.ready), 3000, "ready flags");
    expect(host.lobby.players).toHaveLength(3);

    // Only the host may start.
    const notHost = await ack(alice, "lobby:start");
    expect(notHost.ok).toBe(false);
    expect((notHost as { ok: false; error: string }).error).toBe("not-host");

    const start = await ack(host, "lobby:start");
    expect(start.ok).toBe(true);
    await until(() => host.view.phase === "setup" && alice.view.phase === "setup" && bob.view.phase === "setup", 5000, "setup phase");
    expect(host.lobby.state).toBe("playing");

    // Setup through the real command path.
    await driveSetup([host, alice, bob]);
    await until(() => host.view.phase === "roll", 3000, "roll phase");

    // Private-state isolation over the wire.
    for (const client of [host, alice, bob]) {
      expect(client.view.you!.id).toBe(client.auth.playerId);
      for (const p of client.view.players) {
        expect((p as unknown as { resources?: unknown }).resources).toBeUndefined();
        expect((p as unknown as { devCards?: unknown }).devCards).toBeUndefined();
      }
    }

    // The last placer rolls first; resolve the roll through the socket flow.
    const firstActive = host.view.players[host.view.turnIndex]!.id;
    const roller = [host, alice, bob].find((c) => c.auth.playerId === firstActive)!;
    await rollToMain(roller, [host, alice, bob], 1);
    const diceEvents = roller.events.filter((e) => e.kind === "dice");
    expect(diceEvents.length).toBeGreaterThanOrEqual(1);

    // Out-of-turn and invalid commands are rejected via acks.
    const other = [host, alice, bob].find((c) => c.auth.playerId !== firstActive)!;
    const outOfTurn = await ack(other, "game:command", { command: { type: "rollDice" } });
    expect(outOfTurn.ok).toBe(false);
    expect((outOfTurn as { ok: false; error: string }).error).toBe("not-your-turn");
    const invalid = await ack(roller, "game:command", { command: { type: "nope" } });
    expect(invalid.ok).toBe(false);
    expect((invalid as { ok: false; error: string }).error).toBe("invalid-command");

    // Spectators can watch but not act.
    const watcher = await connect();
    const spec = await ack<SessionAuth>(watcher, "lobby:join", { code, name: "Watcher", spectator: true });
    expect(spec.ok).toBe(true);
    await until(() => watcher.views.length > 0, 3000, "spectator view");
    const specCommand = await ack(watcher, "game:command", { command: { type: "endTurn" } });
    expect(specCommand.ok).toBe(false);
    expect((specCommand as { ok: false; error: string }).error).toBe("spectator");
    watcher.socket.disconnect();

    // Reconnection mid-game restores the same seat.
    const bobSeat = bob.auth;
    bob.socket.disconnect();
    await until(() => host.lobby.players.find((p) => p.id === bobSeat.playerId)!.connected === false, 3000, "disconnect visible");
    const rebob = await connect();
    const rejoined = await ack<SessionAuth & { lobby: LobbyView; game?: GameView }>(rebob, "lobby:join", { code, token: bobSeat.token });
    expect(rejoined.ok).toBe(true);
    expect((rejoined as { ok: true; data: SessionAuth }).data.playerId).toBe(bobSeat.playerId);
    await until(() => host.lobby.players.find((p) => p.id === bobSeat.playerId)!.connected === true, 3000, "reconnect visible");
    expect(rebob.view.phase).toBe("main"); // caught up on the live projection
    rebob.socket.disconnect();

    // Force a quick victory for the host with hidden VP cards, then finish
    // through a real socket command so the normal broadcast path runs.
    const { lobbyStore } = await import("../src/store.js");
    const lobby = lobbyStore.get(code)!;
    const hostSeat = lobby.seats.get(host.auth.playerId)!;
    const engine = lobby.engine!;
    const hostPlayer = engine.state.players.find((p) => p.id === hostSeat.id)!;
    expect(hostPlayer).toBeDefined();
    for (let i = 0; i < 8; i++) {
      hostPlayer.devCards.push({ id: `vp-${i}`, type: "victoryPoint", boughtTurn: 0 });
    }
    // Any accepted command recomputes awards + victory; end the host's turn
    // only if they are active, otherwise let the active player end it.
    const activeId = engine.state.players[engine.state.turnIndex]!.id;
    const finisher = [host, alice].find((c) => c.auth.playerId === activeId) ?? host;
    const finish = await ack(finisher, "game:command", { command: { type: "endTurn" }, commandId: "finish-1" });
    expect(finish.ok).toBe(true);
    await until(() => host.view.phase === "finished", 5000, "finished phase");
    expect(host.view.winnerId).toBe(hostSeat.id);
    await until(() => host.lobby.state === "finished", 3000, "lobby finished");
    await until(() => alice.view.phase === "finished", 3000, "alice sees finished");
    expect(alice.view.phase).toBe("finished");

    // Rematch: reset to lobby, ready up, start a fresh game.
    const reset = await ack(host, "lobby:reset");
    expect(reset.ok).toBe(true);
    await until(() => host.lobby.state === "lobby", 3000, "reset to lobby");
    for (const client of [host, alice]) {
      send(client, "lobby:ready", { ready: true });
    }
    const rematch = await ack(host, "lobby:start");
    expect(rematch.ok).toBe(true);
    await until(() => host.view.phase === "setup" && host.view.seed !== "", 5000, "rematch setup");
    expect(host.view.turnCount).toBe(0);

    host.socket.disconnect();
    alice.socket.disconnect();
  });

  it("keeps seats through lobby-state disconnects via token", async () => {
    const host = await connect();
    const created = await ack<SessionAuth & { lobby: LobbyView }>(host, "lobby:create", { name: "Host" });
    const code = (created as { ok: true; data: SessionAuth & { lobby: LobbyView } }).data.code;
    host.auth = (created as { ok: true; data: SessionAuth & { lobby: LobbyView } }).data;

    const guest = await connect();
    const joined = await ack<SessionAuth & { lobby: LobbyView }>(guest, "lobby:join", { code, name: "Guest" });
    guest.auth = (joined as { ok: true; data: SessionAuth & { lobby: LobbyView } }).data;

    guest.socket.disconnect();
    await until(
      () => host.lobbyStates.at(-1)?.players.find((p) => p.id === guest.auth.playerId)?.connected === false,
      3000,
      "guest marked disconnected",
    );

    const guest2 = await connect();
    const again = await ack<SessionAuth & { lobby: LobbyView }>(guest2, "lobby:join", { code, token: guest.auth.token });
    expect(again.ok).toBe(true);
    expect((again as { ok: true; data: SessionAuth }).data.playerId).toBe(guest.auth.playerId);
    await until(
      () => host.lobbyStates.at(-1)?.players.find((p) => p.id === guest.auth.playerId)?.connected === true,
      3000,
      "guest marked reconnected",
    );
    expect(host.lobbyStates.at(-1)!.players).toHaveLength(2); // no duplicate seat

    // Leaving in the lobby removes the seat entirely.
    guest2.socket.emit("lobby:leave");
    await until(() => host.lobbyStates.at(-1)!.players.every((p) => p.id === host.auth.playerId), 3000, "seat removed");
    host.socket.disconnect();
  });

  it("rejects commands and joins from sockets outside any lobby", async () => {
    const outsider = await connect();
    const join = await ack(outsider, "lobby:join", { code: "ZZZZZZ", name: "Nobody" });
    expect(join.ok).toBe(false);
    expect((join as { ok: false; error: string }).error).toBe("lobby-not-found");

    const command = await ack(outsider, "game:command", { command: { type: "endTurn" } });
    expect(command.ok).toBe(false);
    expect((command as { ok: false; error: string }).error).toBe("unknown-lobby");
    outsider.socket.disconnect();
  });
});
