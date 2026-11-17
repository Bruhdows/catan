import { randomInt } from "node:crypto";
import { Server, type Socket } from "socket.io";
import {
  codeSchema,
  colorSchema,
  commandEnvelopeSchema,
  emoteSchema,
  nameSchema,
  settingsSchema,
  type AckResult,
  type ClientToServerEvents,
  type GameEvent,
  type LobbyView,
  type PlayerColor,
  type ServerToClientEvents,
  type SessionAuth,
} from "@hexhaven/shared";
import { config } from "./config.js";
import { Lobby } from "./lobby.js";
import { splitEvents } from "./game/projection.js";
import { lobbyStore } from "./store.js";
import { rateLimit } from "./rateLimit.js";

type Io = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

interface SocketMeta {
  code: string;
  playerId: string;
  spectator: boolean;
}

export function registerSocketHandlers(io: Io): void {
  const socketMeta = new Map<string, SocketMeta>();

  const getEntry = (socketId: string): { lobby: Lobby; meta: SocketMeta } | null => {
    const meta = socketMeta.get(socketId);
    if (!meta) return null;
    const lobby = lobbyStore.get(meta.code);
    if (!lobby) return null;
    // Only the latest socket owning a reconnected session may act.
    if (!meta.spectator && lobby.seats.get(meta.playerId)?.socketId !== socketId) return null;
    if (meta.spectator && lobby.spectators.get(meta.playerId)?.socketId !== socketId) return null;
    return { lobby, meta };
  };

  const roomOf = (code: string) => `lobby:${code}`;

  function fail(ack: unknown, error: string, message?: string): void {
    if (typeof ack === "function") ack({ ok: false, error, message } as never);
  }

  function ok<T>(ack: unknown, data: T): void {
    if (typeof ack === "function") ack({ ok: true, data } as never);
  }

  function authOf(lobby: Lobby, playerId: string, token: string, spectator: boolean): SessionAuth & { lobby: LobbyView } {
    return { code: lobby.code, playerId, token, spectator, lobby: lobby.view() };
  }

  /** Sends the per-viewer game projection to a single socket. */
  function sendGameView(socket: ClientSocket, lobby: Lobby, meta: SocketMeta): void {
    const view = lobby.gameView(meta.spectator ? null : meta.playerId);
    if (view) socket.emit("game:state", view);
  }

  /** Broadcasts fresh projections to everyone in the lobby. */
  function broadcastGame(io: Io, lobby: Lobby): void {
    const room = io.sockets.adapter.rooms.get(roomOf(lobby.code));
    if (!room) return;
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      const meta = socket ? socketMeta.get(socketId) : undefined;
      if (!socket || !meta || !getEntry(socketId)) continue;
      sendGameView(socket, lobby, meta);
    }
  }

  function emitEvents(io: Io, lobby: Lobby, events: GameEvent[]): void {
    const { publicEvents, privateEvents } = splitEvents(events);
    for (const event of publicEvents) {
      io.to(roomOf(lobby.code)).emit("game:event", event);
    }
    for (const { to, event } of privateEvents) {
      const room = io.sockets.adapter.rooms.get(roomOf(lobby.code));
      if (!room) continue;
      for (const socketId of room) {
        const meta = socketMeta.get(socketId);
        if (meta && meta.playerId === to && getEntry(socketId)) {
          io.sockets.sockets.get(socketId)?.emit("game:private-event", event);
        }
      }
    }
  }

  function joinLobbyRoom(socket: ClientSocket, lobby: Lobby, meta: SocketMeta): void {
    // A socket may only belong to one lobby at a time.
    if (socketMeta.has(socket.id)) leaveLobby(socket);
    socketMeta.set(socket.id, meta);
    socket.join(roomOf(lobby.code));
  }

  function leaveLobby(socket: ClientSocket): void {
    const meta = socketMeta.get(socket.id);
    const entry = getEntry(socket.id);
    socketMeta.delete(socket.id);
    if (meta) socket.leave(roomOf(meta.code));
    if (!entry) return;
    const detached = entry.lobby.detachBySocket(socket.id);
    if (detached?.kind === "seat" && entry.lobby.state === "lobby") {
      entry.lobby.listener({ type: "state" });
    }
    io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
  }

  io.on("connection", (socket) => {
    socket.on("lobby:create", ({ name, color }, ack) => {
      if (!rateLimit(`create:${socket.id}`, 5, 10_000)) {
        return fail(ack, "rate-limited", "Too many requests, slow down.");
      }
      const parsedName = nameSchema.safeParse(name ?? "");
      if (!parsedName.success) return fail(ack, "invalid-name", "Pick a nickname (1-20 characters).");
      const parsedColor = colorSchema.safeParse(color ?? "");
      const chosenColor: PlayerColor | undefined = parsedColor.success ? parsedColor.data : undefined;

      let lobby: Lobby | null = null;
      for (let attempt = 0; attempt < 10 && !lobby; attempt++) {
        const code = randomCode();
        if (lobbyStore.get(code)) continue;
        lobby = new Lobby(code);
        lobby.addHost(parsedName.data, chosenColor);
      }
      if (!lobby) return fail(ack, "server-error", "Could not create a lobby, try again.");

      lobbyStore.create(lobby);
      const host = [...lobby.seats.values()][0]!;
      const meta: SocketMeta = { code: lobby.code, playerId: host.id, spectator: false };
      joinLobbyRoom(socket, lobby, meta);
      lobby.attach(host, socket.id);
      lobby.listener({ type: "state" });
      ok(ack, authOf(lobby, host.id, host.token, false));
    });

    socket.on("lobby:join", ({ code, name, token, color, spectator }, ack) => {
      if (!rateLimit(`join:${socket.id}`, 12, 10_000)) {
        return fail(ack, "rate-limited", "Too many requests, slow down.");
      }
      const parsedCode = codeSchema.safeParse(code ?? "");
      if (!parsedCode.success) return fail(ack, "invalid-code", "Enter a 6-character lobby code.");
      const lobby = lobbyStore.get(parsedCode.data);
      if (!lobby) return fail(ack, "lobby-not-found", "No lobby found with that code.");

      // Reconnecting with a known token restores the seat in any state.
      if (token) {
        const reconnected = lobby.reconnectByToken(token);
        if (reconnected?.kind === "seat") {
          const meta: SocketMeta = { code: lobby.code, playerId: reconnected.seat.id, spectator: false };
          joinLobbyRoom(socket, lobby, meta);
          const previousSocketId = reconnected.seat.socketId;
          lobby.attach(reconnected.seat, socket.id);
          if (previousSocketId && previousSocketId !== socket.id) {
            socketMeta.delete(previousSocketId);
            io.sockets.sockets.get(previousSocketId)?.disconnect(true);
          }
          lobby.listener({ type: "state" });
          sendGameView(socket, lobby, meta);
          io.to(roomOf(lobby.code)).emit("lobby:state", lobby.view());
          return ok(ack, authOf(lobby, reconnected.seat.id, reconnected.seat.token, false));
        }
        if (reconnected?.kind === "spectator") {
          const meta: SocketMeta = { code: lobby.code, playerId: reconnected.spectator.id, spectator: true };
          joinLobbyRoom(socket, lobby, meta);
          const previousSocketId = reconnected.spectator.socketId;
          lobby.attachSpectator(reconnected.spectator, socket.id);
          if (previousSocketId && previousSocketId !== socket.id) {
            socketMeta.delete(previousSocketId);
            io.sockets.sockets.get(previousSocketId)?.disconnect(true);
          }
          sendGameView(socket, lobby, meta);
          return ok(ack, authOf(lobby, reconnected.spectator.id, reconnected.spectator.token, true));
        }
      }

      const isSpectatorRequest = spectator === true || lobby.state !== "lobby" || lobby.seats.size >= lobby.view().maxPlayers;
      if (isSpectatorRequest) {
        if (!lobby.settings.allowSpectators) {
          return fail(ack, "spectators-off", "This lobby does not allow spectators.");
        }
        const parsedName = nameSchema.safeParse(name ?? "Spectator");
        const spec = lobby.addSpectator(parsedName.success ? parsedName.data : "Spectator");
        const meta: SocketMeta = { code: lobby.code, playerId: spec.id, spectator: true };
        joinLobbyRoom(socket, lobby, meta);
        lobby.attachSpectator(spec, socket.id);
        sendGameView(socket, lobby, meta);
        io.to(roomOf(lobby.code)).emit("lobby:state", lobby.view());
        return ok(ack, authOf(lobby, spec.id, spec.token, true));
      }

      const parsedName = nameSchema.safeParse(name ?? "");
      if (!parsedName.success) return fail(ack, "invalid-name", "Pick a nickname (1-20 characters).");
      const parsedColor = colorSchema.safeParse(color ?? "");
      const result = lobby.addSeat(parsedName.data, parsedColor.success ? parsedColor.data : undefined);
      if (!result.ok) return fail(ack, result.error, result.message);

      const meta: SocketMeta = { code: lobby.code, playerId: result.player.id, spectator: false };
      joinLobbyRoom(socket, lobby, meta);
      lobby.attach(result.player, socket.id);
      lobby.listener({ type: "state" });
      io.to(roomOf(lobby.code)).emit("lobby:state", lobby.view());
      ok(ack, authOf(lobby, result.player.id, result.player.token, false));
    });

    socket.on("lobby:leave", () => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      leaveLobby(socket);
      // Leaving during the waiting phase removes the seat entirely.
      if (!entry.meta.spectator && entry.lobby.state === "lobby") {
        entry.lobby.removeSeat(entry.meta.playerId);
        entry.lobby.maybeTransferHost();
        entry.lobby.listener({ type: "state" });
        io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      }
    });

    socket.on("lobby:settings", ({ settings }) => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      const parsed = settingsSchema.safeParse(settings);
      if (!parsed.success) return;
      if (entry.lobby.updateSettings(entry.meta.playerId, parsed.data)) {
        entry.lobby.listener({ type: "state" });
        io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      }
    });

    socket.on("lobby:color", ({ color }) => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      const parsed = colorSchema.safeParse(color);
      if (!parsed.success) return;
      if (entry.lobby.setColor(entry.meta.playerId, parsed.data)) {
        entry.lobby.listener({ type: "state" });
        io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      }
    });

    socket.on("lobby:ready", ({ ready }) => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      if (entry.lobby.setReady(entry.meta.playerId, Boolean(ready))) {
        entry.lobby.listener({ type: "state" });
        io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      }
    });

    socket.on("lobby:kick", ({ playerId }) => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      const targetSocketId = entry.lobby.seats.get(String(playerId))?.socketId;
      if (entry.lobby.kick(entry.meta.playerId, String(playerId))) {
        if (targetSocketId) {
          io.sockets.sockets.get(targetSocketId)?.emit("lobby:error", { message: "The host removed you from this lobby." });
          socketMeta.delete(targetSocketId);
          io.sockets.sockets.get(targetSocketId)?.disconnect(true);
        }
        entry.lobby.listener({ type: "state" });
        io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      }
    });

    socket.on("lobby:start", (ack) => {
      const entry = getEntry(socket.id);
      if (!entry) return fail(ack, "unknown-lobby", "You are not in a lobby.");
      if (entry.meta.spectator) return fail(ack, "spectator", "Spectators cannot start the game.");
      if (entry.meta.playerId !== entry.lobby.hostId) {
        return fail(ack, "not-host", "Only the host can start the game.");
      }
      const check = entry.lobby.canStart();
      if (!check.ok) return fail(ack, "cannot-start", check.reason ?? "The game cannot start yet.");
      if (!entry.lobby.start(entry.meta.playerId)) {
        return fail(ack, "cannot-start", "The game cannot be started right now.");
      }
      entry.lobby.listener({ type: "game" });
      broadcastGame(io, entry.lobby);
      io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      ok(ack, null);
    });

    socket.on("lobby:reset", (ack) => {
      const entry = getEntry(socket.id);
      if (!entry) return fail(ack, "unknown-lobby", "You are not in a lobby.");
      if (entry.meta.playerId !== entry.lobby.hostId) {
        return fail(ack, "not-host", "Only the host can reset the lobby.");
      }
      if (!entry.lobby.resetToLobby(entry.meta.playerId)) {
        return fail(ack, "cannot-reset", "The lobby cannot be reset right now.");
      }
      entry.lobby.listener({ type: "state" });
      io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      ok(ack, null);
    });

    socket.on("game:command", (payload, ack) => {
      const entry = getEntry(socket.id);
      if (!entry) return fail(ack, "unknown-lobby", "You are not in a game.");
      if (entry.meta.spectator) return fail(ack, "spectator", "Spectators cannot act.");
      if (!rateLimit(`cmd:${entry.lobby.code}:${entry.meta.playerId}`, 30, 3_000)) {
        return fail(ack, "rate-limited", "Too many commands, slow down.");
      }
      const parsed = commandEnvelopeSchema.safeParse(payload);
      if (!parsed.success) {
        return fail(ack, "invalid-command", parsed.error.issues[0]?.message ?? "Invalid command.");
      }
      const { command, rev, commandId } = parsed.data;
      const result = entry.lobby.applyCommand(entry.meta.playerId, command, rev, commandId);
      if (!result.ok) return fail(ack, result.error, result.message);
      entry.lobby.listener({ type: "game" }); // schedule durable snapshot for every accepted mutation
      emitEvents(io, entry.lobby, result.events);
      broadcastGame(io, entry.lobby);
      io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      // A finishing match also changes the lobby state; tell the room.
      if (entry.lobby.state === "finished") {
        io.to(roomOf(entry.lobby.code)).emit("lobby:state", entry.lobby.view());
      }
      ok(ack, null);
    });

    socket.on("game:sync", () => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      sendGameView(socket, entry.lobby, entry.meta);
      socket.emit("lobby:state", entry.lobby.view());
    });

    socket.on("lobby:emote", (payload) => {
      const entry = getEntry(socket.id);
      if (!entry) return;
      // Untrusted clients may send null or arbitrary objects; never destructure
      // before validating the payload and the fixed emote allow-list.
      const parsed = emoteSchema.safeParse(payload?.emote);
      if (!parsed.success) return;
      const emote = parsed.data;
      if (!rateLimit(`emote:${entry.lobby.code}:${entry.meta.playerId}`, 8, 5_000)) return;
      io.to(roomOf(entry.lobby.code)).emit("lobby:emote", { playerId: entry.meta.playerId, emote });
    });

    socket.on("disconnect", () => {
      leaveLobby(socket);
    });
  });

  const turnTicker = setInterval(() => {
    const now = Date.now();
    for (const lobby of lobbyStore.all()) {
      if (lobby.state !== "playing") continue;
      const result = lobby.expireTurn(now);
      if (!result || !result.ok) continue;
      lobby.listener({ type: "game" });
      emitEvents(io, lobby, result.events);
      broadcastGame(io, lobby);
      io.to(roomOf(lobby.code)).emit("lobby:state", lobby.view());
    }
  }, 1000);
  turnTicker.unref();

  // Graceful shutdown: disconnect all clients so they reconnect cleanly.
  const shutdown = () => {
    clearInterval(turnTicker);
    io.disconnectSockets(true);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
