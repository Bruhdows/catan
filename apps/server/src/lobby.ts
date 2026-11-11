import { randomUUID } from "node:crypto";
import {
  DEFAULT_LOBBY_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  type GameCommand,
  type GameEvent,
  type GameView,
  type LobbySettings,
  type LobbyState,
  type LobbyView,
  type Phase,
  type PlayerColor,
} from "@hexhaven/shared";
import { GameEngine, type EnginePlayerSeed } from "./game/engine.js";
import { projectGame } from "./game/projection.js";

export interface SeatPlayer {
  id: string;
  token: string;
  name: string;
  color: PlayerColor;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  disconnectedAt: number | null;
}

export interface Spectator {
  id: string;
  token: string;
  name: string;
  socketId: string | null;
}

export type LobbyEvent =
  | { type: "state" }
  | { type: "game" }
  | { type: "events"; publicEvents: GameEvent[]; privateEvents: { to: string; event: GameEvent }[] }
  | { type: "deleted" };

export type JoinResult =
  | { ok: true; player: SeatPlayer; spectator: boolean }
  | { ok: false; error: string; message: string };

export type CommandResult =
  | { ok: true; events: GameEvent[] }
  | { ok: false; error: string; message: string };

/** Reads the engine phase without flow-narrowing across mutations. */
function currentPhase(engine: GameEngine): Phase {
  return engine.state.phase;
}

const nextColor = (taken: PlayerColor[]): PlayerColor =>
  PLAYER_COLORS.find((c) => !taken.includes(c)) ?? PLAYER_COLORS[0]!;

/**
 * Owns the lobby lifecycle around an authoritative GameEngine: seats,
 * tokens, readiness, start/rematch and event fan-out. Pure logic — no
 * socket types, unit-testable with injected clocks via engine options.
 */
export class Lobby {
  readonly id = randomUUID();
  readonly code: string;
  readonly createdAt: number;
  seats = new Map<string, SeatPlayer>();
  spectators = new Map<string, Spectator>();
  hostId = "";
  settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS };
  state: LobbyState = "lobby";
  engine: GameEngine | null = null;
  lastActivity: number;
  listener: (event: LobbyEvent) => void = () => {};

  private commandIds = new Map<string, number>();
  private offerSeq = 0;

  constructor(code: string, now = Date.now) {
    this.code = code;
    this.createdAt = now();
    this.lastActivity = this.createdAt;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  hasConnectedPlayers(): boolean {
    for (const seat of this.seats.values()) if (seat.connected) return true;
    return false;
  }

  connectedIds(): Set<string> {
    const out = new Set<string>();
    for (const seat of this.seats.values()) if (seat.connected) out.add(seat.id);
    for (const spec of this.spectators.values()) if (spec.socketId) out.add(spec.id);
    return out;
  }

  // ------------------------------------------------------------------ seats

  addHost(name: string, color?: PlayerColor): SeatPlayer {
    const taken = [...this.seats.values()].map((s) => s.color);
    const seat: SeatPlayer = {
      id: randomUUID(),
      token: randomUUID(),
      name,
      color: color && !taken.includes(color) ? color : nextColor(taken),
      socketId: null,
      connected: false,
      ready: true,
      disconnectedAt: null,
    };
    this.seats.set(seat.id, seat);
    this.hostId = seat.id;
    this.touch();
    return seat;
  }

  addSeat(name: string, color?: PlayerColor): JoinResult {
    if (this.state !== "lobby") {
      return { ok: false, error: "game-in-progress", message: "This game has already started." };
    }
    if (this.seats.size >= MAX_PLAYERS) {
      return { ok: false, error: "lobby-full", message: "This lobby is full." };
    }
    const taken = [...this.seats.values()].map((s) => s.color);
    const seat: SeatPlayer = {
      id: randomUUID(),
      token: randomUUID(),
      name,
      color: color && !taken.includes(color) ? color : nextColor(taken),
      socketId: null,
      connected: false,
      ready: false,
      disconnectedAt: null,
    };
    this.seats.set(seat.id, seat);
    this.touch();
    return { ok: true, player: seat, spectator: false };
  }

  reconnectByToken(token: string): { kind: "seat"; seat: SeatPlayer } | { kind: "spectator"; spectator: Spectator } | null {
    for (const seat of this.seats.values()) {
      if (seat.token === token) return { kind: "seat", seat };
    }
    for (const spec of this.spectators.values()) {
      if (spec.token === token) return { kind: "spectator", spectator: spec };
    }
    return null;
  }

  addSpectator(name: string): Spectator {
    const spec: Spectator = { id: randomUUID(), token: randomUUID(), name, socketId: null };
    this.spectators.set(spec.id, spec);
    this.touch();
    return spec;
  }

  attach(seat: SeatPlayer, socketId: string): void {
    seat.socketId = socketId;
    seat.connected = true;
    seat.disconnectedAt = null;
    this.touch();
  }

  attachSpectator(spec: Spectator, socketId: string): void {
    spec.socketId = socketId;
    this.touch();
  }

  detachBySocket(socketId: string): { kind: "seat"; seat: SeatPlayer } | { kind: "spectator"; spectator: Spectator } | null {
    for (const seat of this.seats.values()) {
      if (seat.socketId === socketId) {
        seat.socketId = null;
        seat.connected = false;
        seat.disconnectedAt = Date.now();
        this.touch();
        return { kind: "seat", seat };
      }
    }
    for (const spec of this.spectators.values()) {
      if (spec.socketId === socketId) {
        spec.socketId = null;
        this.touch();
        return { kind: "spectator", spectator: spec };
      }
    }
    return null;
  }

  removeSeat(playerId: string): SeatPlayer | null {
    const seat = this.seats.get(playerId);
    if (!seat) return null;
    this.seats.delete(playerId);
    if (this.hostId === playerId) {
      const next =
        [...this.seats.values()].find((s) => s.connected) ?? [...this.seats.values()][0];
      this.hostId = next?.id ?? "";
    }
    this.touch();
    return seat;
  }

  /** Seats dropped while waiting; keeps active-game seats alive. */
  dropStaleSeats(now: number, graceMs: number): SeatPlayer[] {
    const dropped: SeatPlayer[] = [];
    if (this.state !== "lobby") return dropped;
    for (const seat of [...this.seats.values()]) {
      if (seat.connected || seat.disconnectedAt === null) continue;
      if (now - seat.disconnectedAt > graceMs) {
        const removed = this.removeSeat(seat.id);
        if (removed) dropped.push(removed);
      }
    }
    return dropped;
  }

  maybeTransferHost(): boolean {
    if (this.state !== "lobby" && this.state !== "finished") return false;
    const host = this.seats.get(this.hostId);
    if (host && host.connected) return false;
    const next = [...this.seats.values()].find((s) => s.connected);
    if (!next || next.id === this.hostId) return false;
    this.hostId = next.id;
    this.touch();
    return true;
  }

  // ---------------------------------------------------------------- controls

  setColor(playerId: string, color: PlayerColor): boolean {
    if (this.state !== "lobby") return false;
    const seat = this.seats.get(playerId);
    if (!seat) return false;
    if ([...this.seats.values()].some((s) => s.id !== playerId && s.color === color)) return false;
    seat.color = color;
    this.touch();
    return true;
  }

  setReady(playerId: string, ready: boolean): boolean {
    if (this.state !== "lobby") return false;
    const seat = this.seats.get(playerId);
    if (!seat) return false;
    seat.ready = ready;
    this.touch();
    return true;
  }

  updateSettings(playerId: string, settings: LobbySettings): boolean {
    if (playerId !== this.hostId || this.state !== "lobby") return false;
    this.settings = settings;
    this.touch();
    return true;
  }

  kick(hostId: string, targetId: string): boolean {
    if (hostId !== this.hostId || this.state !== "lobby") return false;
    if (!this.seats.has(targetId)) return false;
    this.removeSeat(targetId);
    this.touch();
    return true;
  }

  canStart(): { ok: boolean; reason?: string } {
    if (this.state !== "lobby") return { ok: false, reason: "The game is already running." };
    if (this.seats.size < MIN_PLAYERS) {
      return { ok: false, reason: `You need at least ${MIN_PLAYERS} players.` };
    }
    const unready = [...this.seats.values()].filter((s) => !s.ready);
    if (unready.length > 0) {
      return { ok: false, reason: `${unready.length} player(s) are not ready yet.` };
    }
    return { ok: true };
  }

  start(hostId: string, seed?: string): boolean {
    if (hostId !== this.hostId || this.state !== "lobby") return false;
    if (!this.canStart().ok) return false;
    const players: EnginePlayerSeed[] = [...this.seats.values()]
      .sort((a, b) => PLAYER_COLORS.indexOf(a.color) - PLAYER_COLORS.indexOf(b.color))
      .map((s) => ({ id: s.id, name: s.name, color: s.color }));
    this.engine = new GameEngine({
      seed: seed ?? `${this.code}-${Date.now()}`,
      boardMode: this.settings.boardMode,
      players,
    });
    this.state = "playing";
    this.touch();
    return true;
  }

  /** Applies a game command through the authoritative engine. */
  applyCommand(playerId: string, command: GameCommand, rev?: number, commandId?: string): CommandResult {
    if (!this.engine) return { ok: false, error: "no-game", message: "No game is running." };
    if (this.engine.state.phase === "finished") {
      return { ok: false, error: "game-over", message: "The game has finished." };
    }
    const idempotencyKey = commandId ? `${playerId}:${commandId}` : null;
    if (idempotencyKey && this.commandIds.has(idempotencyKey)) {
      return { ok: true, events: [] };
    }
    if (rev !== undefined && rev !== this.engine.state.rev) {
      return { ok: false, error: "stale-rev", message: "Your view is out of date — refreshing." };
    }
    const outcome = this.engine.applyCommand(playerId, command);
    if (!outcome.ok) return outcome;
    // Only successful commands are idempotent. Invalid commands must be
    // retryable after the player corrects their state or input.
    if (idempotencyKey) {
      this.commandIds.set(idempotencyKey, this.engine.state.rev);
      if (this.commandIds.size > 500) {
        const oldest = this.commandIds.keys().next().value;
        if (oldest) this.commandIds.delete(oldest);
      }
    }
    if (currentPhase(this.engine) === "finished") this.state = "finished";
    this.touch();
    return { ok: true, events: outcome.events };
  }

  /** Returns the current game view for a viewer (player or spectator). */
  gameView(viewerId: string | null): GameView | null {
    if (!this.engine) return null;
    return projectGame(this.engine.state, viewerId, this.connectedIds());
  }

  /** Resets a finished game back to the lobby for a rematch. */
  resetToLobby(hostId: string): boolean {
    if (hostId !== this.hostId || this.state !== "finished") return false;
    this.engine = null;
    this.state = "lobby";
    for (const seat of this.seats.values()) seat.ready = false;
    this.touch();
    return true;
  }

  startRematch(hostId: string, seed?: string): boolean {
    if (hostId !== this.hostId || (this.state !== "finished" && this.state !== "playing")) return false;
    this.engine = null;
    this.state = "lobby";
    return this.start(hostId, seed);
  }

  // ------------------------------------------------------------------- views

  /** Closes the lobby: cleanup hook for the store and sweeps. */
  close(): void {
    this.listener({ type: "deleted" });
  }

  view(): LobbyView {
    return {
      code: this.code,
      state: this.state,
      hostId: this.hostId,
      players: [...this.seats.values()].map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isHost: s.id === this.hostId,
        connected: s.connected,
        ready: s.ready,
      })),
      spectators: [...this.spectators.values()].map((s) => ({ id: s.id, name: s.name })),
      settings: { ...this.settings },
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }
}
