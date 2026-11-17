import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { AckResult, EmoteName, GameCommand, GameEvent, GameView, LobbyView, PlayerColor, SessionAuth } from "@hexhaven/shared";

type Auth = SessionAuth & { lobby: LobbyView };
/** A received reaction, kept briefly so pages can float it on screen. */
export interface EmotePing {
  id: number;
  playerId: string;
  emote: EmoteName;
  at: number;
}
type SessionContextValue = {
  socket: Socket;
  auth: Auth | null;
  lobby: LobbyView | null;
  game: GameView | null;
  events: GameEvent[];
  emotes: EmotePing[];
  connected: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  create: (name: string, color?: PlayerColor) => Promise<boolean>;
  join: (code: string, name?: string, spectator?: boolean) => Promise<boolean>;
  leave: () => void;
  ready: (ready: boolean) => void;
  color: (color: PlayerColor) => void;
  settings: (settings: LobbyView["settings"]) => void;
  kick: (playerId: string) => void;
  start: () => Promise<boolean>;
  reset: () => Promise<boolean>;
  command: (command: GameCommand) => Promise<boolean>;
  emote: (emote: EmoteName) => void;
};
const Context = createContext<SessionContextValue | null>(null);
const socket = io({ autoConnect: false, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000 });

function savedSession(): Auth | null {
  try { return JSON.parse(localStorage.getItem("hexhaven.session") || "null") as Auth | null; }
  catch { return null; }
}
function saveSession(auth: Auth | null) {
  if (auth) localStorage.setItem("hexhaven.session", JSON.stringify(auth));
  else localStorage.removeItem("hexhaven.session");
}
async function request<T>(event: string, payload?: unknown): Promise<AckResult<T>> {
  try {
    if (!socket.connected) return { ok: false, error: "offline", message: "Reconnecting to the server…" };
    const result = payload === undefined
      ? await socket.timeout(8000).emitWithAck(event)
      : await socket.timeout(8000).emitWithAck(event, payload);
    return result as AckResult<T>;
  } catch {
    return { ok: false, error: "timeout", message: "The server did not respond. Try again." };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(() => savedSession());
  const [lobby, setLobby] = useState<LobbyView | null>(() => savedSession()?.lobby ?? null);
  const [game, setGame] = useState<GameView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [emotes, setEmotes] = useState<EmotePing[]>([]);
  const [connected, setConnected] = useState(socket.connected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authRef = useRef(auth);
  authRef.current = auth;

  const authenticate = useCallback((next: Auth | null) => {
    authRef.current = next;
    setAuth(next);
    saveSession(next);
    if (!next) { setLobby(null); setGame(null); setEvents([]); setEmotes([]); }
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const previous = authRef.current;
      if (!previous) return;
      request<Auth>("lobby:join", { code: previous.code, token: previous.token }).then((res) => {
        if (!res.ok) {
          if (res.error === "lobby-not-found") authenticate(null);
          else setError(res.message || "Could not restore your session.");
          return;
        }
        authenticate(res.data);
        setLobby(res.data.lobby);
        socket.emit("game:sync");
      });
    };
    const onDisconnect = () => setConnected(false);
    const onLobby = (view: LobbyView) => {
      setLobby(view);
      const previous = authRef.current;
      if (previous?.code === view.code) saveSession({ ...previous, lobby: view });
      if (view.state === "lobby") { setGame(null); setEvents([]); }
    };
    const onGame = (view: GameView) => setGame((prev) => !prev || view.seed !== prev.seed || view.rev >= prev.rev ? view : prev);
    const onEvent = (event: GameEvent) => setEvents((prev) => [...prev.slice(-50), event]);
    const onEmote = (ping: { playerId: string; emote: EmoteName }) => setEmotes((prev) => [
      ...prev.slice(-11),
      { id: Date.now() + Math.random(), playerId: ping.playerId, emote: ping.emote, at: Date.now() },
    ]);
    const onError = (err: { message: string }) => setError(err.message);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("lobby:state", onLobby);
    socket.on("game:state", onGame);
    socket.on("game:event", onEvent);
    socket.on("game:private-event", onEvent);
    socket.on("lobby:emote", onEmote);
    socket.on("lobby:error", onError);
    socket.connect();
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("lobby:state", onLobby); socket.off("game:state", onGame);
      socket.off("game:event", onEvent); socket.off("game:private-event", onEvent);
      socket.off("lobby:emote", onEmote);
      socket.off("lobby:error", onError); socket.disconnect();
    };
  }, [authenticate]);

  // Reactions live for a few seconds, then float away.
  const hasEmotes = emotes.length > 0;
  useEffect(() => {
    if (!hasEmotes) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 4200;
      setEmotes((prev) => prev.filter((ping) => ping.at > cutoff));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasEmotes]);

  const perform = useCallback(async <T,>(event: string, payload?: unknown): Promise<AckResult<T>> => {
    setBusy(true);
    try {
      const res = await request<T>(event, payload);
      if (!res.ok) setError(res.message || res.error);
      return res;
    } finally { setBusy(false); }
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    socket, auth, lobby, game, events, emotes, connected, busy, error, clearError: () => setError(null),
    create: async (name, color) => {
      const res = await perform<Auth>("lobby:create", { name, color });
      if (!res.ok) return false;
      authenticate(res.data); setLobby(res.data.lobby); setGame(null); setEvents([]);
      return true;
    },
    join: async (code, name, spectator) => {
      const previous = authRef.current;
      const res = await perform<Auth>("lobby:join", {
        code, name, spectator, token: previous?.code === code.toUpperCase() ? previous.token : undefined,
      });
      if (!res.ok) return false;
      authenticate(res.data); setLobby(res.data.lobby); setGame(null); setEvents([]);
      socket.emit("game:sync");
      return true;
    },
    leave: () => { socket.emit("lobby:leave"); authenticate(null); },
    ready: ready => socket.emit("lobby:ready", { ready }),
    color: color => socket.emit("lobby:color", { color }),
    settings: settings => socket.emit("lobby:settings", { settings }),
    kick: playerId => socket.emit("lobby:kick", { playerId }),
    start: async () => (await perform<null>("lobby:start")).ok,
    reset: async () => { const result = await perform<null>("lobby:reset"); if (result.ok) setGame(null); return result.ok; },
    command: async command => {
      const result = await perform<null>("game:command", {
        command, rev: game?.rev, commandId: crypto.randomUUID(),
      });
      if (!result.ok && result.error === "stale-rev") socket.emit("game:sync");
      return result.ok;
    },
    emote: emoteName => socket.emit("lobby:emote", { emote: emoteName }),
  }), [auth, lobby, game, events, emotes, connected, busy, error, perform, authenticate]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider is required");
  return value;
}
