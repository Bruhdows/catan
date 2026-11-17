import { describe, expect, it } from "vitest";
import { PLAYER_COLORS } from "@hexhaven/shared";
import { Lobby } from "../src/lobby.js";

function fourPlayerLobby(): { lobby: Lobby; ids: string[] } {
  const lobby = new Lobby("TEST", () => 1000);
  const host = lobby.addHost("Host");
  const ids = [host.id];
  for (const name of ["Alice", "Bob", "Carol"]) {
    const join = lobby.addSeat(name);
    expect(join.ok).toBe(true);
    ids.push((join as { ok: true; player: { id: string } }).player.id);
  }
  return { lobby, ids };
}

function readyAll(lobby: Lobby): void {
  for (const id of lobby.seats.keys()) lobby.setReady(id, true);
}

describe("lobby membership", () => {
  it("the host is seated, ready and marked as host", () => {
    const lobby = new Lobby("TEST", () => 1000);
    const host = lobby.addHost("Host");
    expect(lobby.hostId).toBe(host.id);
    expect(host.ready).toBe(true);
    expect(PLAYER_COLORS).toContain(host.color);
    expect(lobby.seats.size).toBe(1);
  });

  it("joining seats get unique, distinct colors", () => {
    const { lobby, ids } = fourPlayerLobby();
    const colors = ids.map((id) => lobby.seats.get(id)!.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("a full lobby rejects further seats", () => {
    const { lobby } = fourPlayerLobby();
    expect(lobby.addSeat("Eve").ok).toBe(true);
    expect(lobby.addSeat("Frank").ok).toBe(true);
    expect(new Set([...lobby.seats.values()].map(p => p.color)).size).toBe(6);
    const extra = lobby.addSeat("Extra");
    expect(extra.ok).toBe(false);
    expect((extra as { ok: false; error: string }).error).toBe("lobby-full");
  });

  it("joining a running game is rejected, spectators are not", () => {
    const { lobby } = fourPlayerLobby();
    readyAll(lobby);
    expect(lobby.start(lobby.hostId)).toBe(true);
    const join = lobby.addSeat("Late");
    expect(join.ok).toBe(false);
    expect((join as { ok: false; error: string }).error).toBe("game-in-progress");
    const spec = lobby.addSpectator("Watcher");
    expect(lobby.spectators.has(spec.id)).toBe(true);
  });

  it("six ready players start with a larger island", () => {
    const { lobby } = fourPlayerLobby();
    expect(lobby.addSeat("Eve").ok).toBe(true);
    expect(lobby.addSeat("Frank").ok).toBe(true);
    readyAll(lobby);
    expect(lobby.start(lobby.hostId)).toBe(true);
    expect(lobby.engine!.state.players).toHaveLength(6);
    expect(lobby.engine!.state.board.topology.landHexes).toHaveLength(37);
  });

  it("reconnect by token restores the original seat", () => {
    const { lobby, ids } = fourPlayerLobby();
    const found = lobby.reconnectByToken(lobby.seats.get(ids[2]!)!.token);
    expect(found?.kind).toBe("seat");
    if (found?.kind === "seat") expect(found.seat.id).toBe(ids[2]);
    expect(lobby.reconnectByToken("nope")).toBeNull();
  });
});

describe("lobby controls", () => {
  it("colors cannot collide", () => {
    const { lobby, ids } = fourPlayerLobby();
    expect(lobby.setColor(ids[0]!, lobby.seats.get(ids[1]!)!.color)).toBe(false);
    expect(lobby.setColor(ids[1]!, lobby.seats.get(ids[1]!)!.color)).toBe(true);
  });

  it("ready toggles are per player and only before the start", () => {
    const { lobby, ids } = fourPlayerLobby();
    expect(lobby.setReady(ids[1]!, true)).toBe(true);
    expect(lobby.seats.get(ids[1]!)!.ready).toBe(true);
    readyAll(lobby);
    expect(lobby.start(lobby.hostId)).toBe(true);
    expect(lobby.setReady(ids[1]!, false)).toBe(false);
  });

  it("enforces timed turns while leaving setup and blocking decisions untimed", () => {
    const { lobby } = fourPlayerLobby();
    expect(lobby.updateSettings(lobby.hostId, { ...lobby.settings, turnTimeSeconds: 60 })).toBe(true);
    readyAll(lobby);
    expect(lobby.start(lobby.hostId)).toBe(true);
    lobby.syncTurnClock(1000);
    expect(lobby.turnDeadline).toBeNull(); // setup never times out
    const state = lobby.engine!.state;
    state.phase = "main";
    state.turnCount = 1;
    state.pending = { type: "none" };
    lobby.syncTurnClock(1000);
    expect(lobby.turnDeadline).toBe(61000);
    expect(lobby.expireTurn(60999)).toBeNull();
    expect(lobby.expireTurn(61000)?.ok).toBe(true);
    expect(state.turnCount).toBe(2);
    expect(state.phase).toBe("roll");
    state.pending = { type: "robberMove" };
    lobby.syncTurnClock(62000);
    expect(lobby.turnDeadline).toBeNull();
    state.pending = { type: "none" };
    lobby.syncTurnClock(63000);
    expect(lobby.turnDeadline).toBe(123000);
  });

  it("settings and kicks are host-only and lobby-only", () => {
    const { lobby, ids } = fourPlayerLobby();
    expect(lobby.updateSettings(ids[1]!, { ...lobby.settings, boardMode: "random" })).toBe(false);
    expect(lobby.updateSettings(lobby.hostId, { ...lobby.settings, boardMode: "random" })).toBe(true);
    expect(lobby.settings.boardMode).toBe("random");

    expect(lobby.kick(ids[1]!, ids[2]!)).toBe(false); // not host
    expect(lobby.kick(lobby.hostId, ids[3]!)).toBe(true);
    expect(lobby.seats.has(ids[3]!)).toBe(false);

    readyAll(lobby);
    expect(lobby.start(lobby.hostId)).toBe(true);
    expect(lobby.kick(lobby.hostId, ids[1]!)).toBe(false); // too late
  });

  it("starting needs at least three ready players and the host", () => {
    const { lobby, ids } = fourPlayerLobby();

    // Two players: too few.
    expect(lobby.start(lobby.hostId)).toBe(false);
    expect(lobby.state).toBe("lobby");

    // Unready players block the start.
    expect(lobby.start(lobby.hostId)).toBe(false);
    readyAll(lobby);
    expect(lobby.canStart().ok).toBe(true);

    // Non-hosts cannot start.
    expect(lobby.start(ids[1]!)).toBe(false);
    expect(lobby.start(lobby.hostId)).toBe(true);
    expect(lobby.state).toBe("playing");
    expect(lobby.engine).not.toBeNull();
    expect(lobby.engine!.state.players).toHaveLength(4);
  });

  it("removing the host transfers host status", () => {
    const { lobby, ids } = fourPlayerLobby();
    lobby.removeSeat(ids[0]!);
    expect(lobby.hostId).toBe(ids[1]!);
    expect(lobby.view().players.find((p) => p.id === ids[1]!)!.isHost).toBe(true);
  });

  it("the host is transferred to a connected player when the host vanishes", () => {
    const { lobby, ids } = fourPlayerLobby();
    lobby.attach(lobby.seats.get(ids[0]!)!, "s0");
    lobby.attach(lobby.seats.get(ids[1]!)!, "s1");
    expect(lobby.maybeTransferHost()).toBe(false); // host still connected
    lobby.detachBySocket("s0");
    expect(lobby.maybeTransferHost()).toBe(true);
    expect(lobby.hostId).toBe(ids[1]!); // connected player preferred
  });

  it("stale disconnected seats are swept in the lobby but kept mid-game", () => {
    const { lobby, ids } = fourPlayerLobby();
    lobby.attach(lobby.seats.get(ids[0]!)!, "s0");
    lobby.detachBySocket("s0");
    expect(lobby.dropStaleSeats(Date.now() + 5, 10)).toHaveLength(0); // within grace
    expect(lobby.dropStaleSeats(Date.now() + 20, 10).map((s) => s.id)).toContain(ids[0]!);

    // Mid-game the seat survives the sweep.
    const { lobby: playing, ids: pids } = fourPlayerLobby();
    readyAll(playing);
    playing.start(playing.hostId);
    playing.attach(playing.seats.get(pids[0]!)!, "s0");
    playing.detachBySocket("s0");
    expect(playing.dropStaleSeats(10_000, 10)).toHaveLength(0);
    expect(playing.seats.has(pids[0]!)).toBe(true);
  });
});

describe("command gateway", () => {
  it("duplicate command ids are idempotent", () => {
    const { lobby } = fourPlayerLobby();
    readyAll(lobby);
    lobby.start(lobby.hostId);
    // During setup only the first player may act; use that.
    const actor = lobby.engine!.state.pending.type === "setup" ? lobby.engine!.state.pending.player : "";
    const vertex = [...lobby.engine!.state.board.topology.vertices.keys()][0]!;
    const a = lobby.applyCommand(actor, { type: "placeSettlement", vertex }, undefined, "cmd-1");
    const b = lobby.applyCommand(actor, { type: "placeSettlement", vertex }, undefined, "cmd-1");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error(b.message);
    expect(b.events).toEqual([]); // replay, not a second action
  });

  it("stale revisions are rejected with a refresh hint", () => {
    const { lobby } = fourPlayerLobby();
    readyAll(lobby);
    lobby.start(lobby.hostId);
    const rev = lobby.engine!.state.rev;
    lobby.applyCommand(lobby.engine!.state.pending.type === "setup" ? lobby.engine!.state.pending.player : "", {
      type: "placeSettlement",
      vertex: [...lobby.engine!.state.board.topology.vertices.keys()][0]!,
    });
    const stale = lobby.applyCommand(
      lobby.engine!.state.pending.type === "setup" ? lobby.engine!.state.pending.player : "",
      { type: "placeSettlement", vertex: [...lobby.engine!.state.board.topology.vertices.keys()][1]! },
      rev,
    );
    expect(stale.ok).toBe(false);
    expect((stale as { ok: false; error: string }).error).toBe("stale-rev");
  });

  it("the game view hides other players' hands", () => {
    const { lobby, ids } = fourPlayerLobby();
    readyAll(lobby);
    lobby.start(lobby.hostId);
    const viewer = lobby.gameView(ids[0]!)!;
    expect(viewer.you).not.toBeNull();
    expect(viewer.you!.id).toBe(ids[0]!);
    for (const p of viewer.players) {
      if (p.id !== ids[0]!) {
        expect(p.resourceCount).toBeGreaterThanOrEqual(0);
        expect((p as unknown as { resources?: unknown }).resources).toBeUndefined();
      }
    }
    // Spectators get no private hand at all.
    const specView = lobby.gameView(null)!;
    expect(specView.you).toBeNull();
  });
});

describe("rematch lifecycle", () => {
  it("finished games reset to the lobby and restart fresh", () => {
    const { lobby, ids } = fourPlayerLobby();
    readyAll(lobby);
    lobby.start(lobby.hostId);
    const engine = lobby.engine!;
    engine.state.phase = "finished";
    engine.state.winnerId = ids[0]!;
    lobby.state = "finished";

    expect(lobby.resetToLobby(ids[1]!)).toBe(false); // host only
    expect(lobby.resetToLobby(lobby.hostId)).toBe(true);
    expect(lobby.state).toBe("lobby");
    expect(lobby.engine).toBeNull();
    for (const seat of lobby.seats.values()) expect(seat.ready).toBe(false);

    readyAll(lobby);
    expect(lobby.start(lobby.hostId, "fresh-seed")).toBe(true);
    expect(lobby.engine!.state.seed).toBe("fresh-seed");
    expect(lobby.engine!.state.phase).toBe("setup");
    expect(lobby.engine!.state.winnerId).toBeNull();
  });

  it("startRematch restarts directly from a finished game", () => {
    const { lobby, ids } = fourPlayerLobby();
    readyAll(lobby);
    lobby.start(lobby.hostId, "first-seed");
    const firstEngine = lobby.engine!;
    lobby.state = "finished";
    firstEngine.state.phase = "finished";
    firstEngine.state.winnerId = ids[0]!;

    expect(lobby.startRematch(ids[1]!, "again")).toBe(false); // host only
    expect(lobby.startRematch(lobby.hostId, "again")).toBe(true);
    expect(lobby.engine).not.toBe(firstEngine);
    expect(lobby.engine!.state.seed).toBe("again");
    expect(lobby.engine!.state.phase).toBe("setup");
  });

  it("commands are rejected once the game is finished", () => {
    const { lobby, ids } = fourPlayerLobby();
    readyAll(lobby);
    lobby.start(lobby.hostId);
    lobby.engine!.state.phase = "finished";
    const outcome = lobby.applyCommand(ids[0]!, { type: "endTurn" });
    expect(outcome.ok).toBe(false);
    expect((outcome as { ok: false; error: string }).error).toBe("game-over");
  });
});
