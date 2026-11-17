import { readFileSync, readdirSync } from "node:fs";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LobbySettings, LobbyView, PlayerColor } from "@hexhaven/shared";
import { config } from "./config.js";
import { GameEngine } from "./game/engine.js";
import { gameFromStored, toStoredGame, type StoredGame } from "./game/persistence.js";
import { Lobby } from "./lobby.js";

interface StoredLobby {
  schemaVersion: number;
  code: string;
  hostId: string;
  state: string;
  settings: LobbySettings;
  seats: {
    id: string;
    token: string;
    name: string;
    color: PlayerColor;
    ready: boolean;
  }[];
  engine: StoredGame | null;
}

const LOBBY_SCHEMA_VERSION = 1;

/**
 * In-memory registry of lobbies with disk-backed snapshots so active
 * matches survive server restarts. Snapshot writes are debounced and
 * atomic; deletion happens when a lobby closes.
 */
class LobbyStore {
  private lobbies = new Map<string, Lobby>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private pendingSaves = new Map<string, NodeJS.Timeout>();
  private snapshotDir: string | null;

  constructor() {
    this.snapshotDir = config.dataDir ? join(process.cwd(), config.dataDir) : null;
    if (this.snapshotDir) {
      try {
        mkdirSync(this.snapshotDir, { recursive: true });
      } catch {
        this.snapshotDir = null;
      }
    }
  }

  create(lobby: Lobby): Lobby {
    this.lobbies.set(lobby.code, lobby);
    lobby.listener = (event) => {
      if (event.type === "deleted") this.remove(lobby);
      else this.scheduleSave(lobby);
    };
    this.ensureSweep();
    this.scheduleSave(lobby);
    return lobby;
  }

  get(code: string): Lobby | undefined {
    return this.lobbies.get(code);
  }

  remove(lobby: Lobby): void {
    this.lobbies.delete(lobby.code);
    const pending = this.pendingSaves.get(lobby.code);
    if (pending) clearTimeout(pending);
    this.pendingSaves.delete(lobby.code);
    if (this.snapshotDir) {
      try {
        rmSync(join(this.snapshotDir, `${lobby.code}.json`), { force: true });
      } catch {
        // best effort
      }
    }
  }

  all(): Lobby[] {
    return [...this.lobbies.values()];
  }

  size(): number {
    return this.lobbies.size;
  }

  /** Flush debounced snapshots before shutdown, including active matches. */
  flush(): void {
    for (const timer of this.pendingSaves.values()) clearTimeout(timer);
    this.pendingSaves.clear();
    for (const lobby of this.lobbies.values()) this.writeSnapshot(lobby);
  }

  private scheduleSave(lobby: Lobby): void {
    if (!this.snapshotDir) return;
    const existing = this.pendingSaves.get(lobby.code);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingSaves.delete(lobby.code);
      this.writeSnapshot(lobby);
    }, config.snapshotDebounceMs);
    timer.unref();
    this.pendingSaves.set(lobby.code, timer);
  }

  private writeSnapshot(lobby: Lobby): void {
    if (!this.snapshotDir) return;
    try {
      const stored: StoredLobby = {
        schemaVersion: LOBBY_SCHEMA_VERSION,
        code: lobby.code,
        hostId: lobby.hostId,
        state: lobby.state,
        settings: lobby.settings,
        seats: [...lobby.seats.values()].map((s) => ({
          id: s.id,
          token: s.token,
          name: s.name,
          color: s.color,
          ready: s.ready,
        })),
        engine: lobby.engine ? toStoredGame(lobby.engine.state) : null,
      };
      const finalPath = join(this.snapshotDir, `${lobby.code}.json`);
      const tmpPath = finalPath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(stored));
      renameSync(tmpPath, finalPath);
    } catch (error) {
      console.error(`snapshot write failed for ${lobby.code}`, error);
    }
  }

  /** Restores lobbies from disk at boot. */
  restore(): number {
    if (!this.snapshotDir || !config.restore) return 0;
    let restored = 0;
    let files: string[] = [];
    try {
      files = readdirSync(this.snapshotDir).filter((f) => f.endsWith(".json"));
    } catch {
      return 0;
    }
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(this.snapshotDir, file), "utf8")) as StoredLobby;
        if (raw.schemaVersion !== LOBBY_SCHEMA_VERSION) continue;
        const lobby = new Lobby(raw.code);
        lobby.hostId = raw.hostId;
        lobby.settings = { ...raw.settings, turnTimeSeconds: raw.settings.turnTimeSeconds ?? 0 };
        lobby.state = raw.state === "playing" && !raw.engine ? "lobby" : (raw.state as Lobby["state"]);
        for (const seat of raw.seats) {
          lobby.seats.set(seat.id, {
            ...seat,
            socketId: null,
            connected: false,
            disconnectedAt: Date.now(),
          });
        }
        if (raw.engine) {
          const state = gameFromStored(raw.engine);
          lobby.engine = GameEngine.fromSaved(state);
        }
        if (!lobby.seats.has(lobby.hostId) && lobby.seats.size > 0) {
          lobby.hostId = [...lobby.seats.values()][0]!.id;
        }
        lobby.listener = (event) => {
          if (event.type === "deleted") this.remove(lobby);
          else this.scheduleSave(lobby);
        };
        this.lobbies.set(lobby.code, lobby);
        restored++;
      } catch (error) {
        console.error(`snapshot restore failed for ${file}`, error);
      }
    }
    return restored;
  }

  /** Backstop cleanup for empty/idle lobbies and abandoned matches. */
  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const lobby of this.all()) {
        const idleFor = now - lobby.lastActivity;
        if (idleFor > config.idleLobbyTtlMs) {
          lobby.close();
          continue;
        }
        if (lobby.state === "lobby" || lobby.state === "finished") {
          const dropped = lobby.dropStaleSeats(now, config.playerDisconnectGraceMs);
          if (dropped.length > 0) lobby.listener({ type: "state" });
          lobby.maybeTransferHost();
        }
        if (!lobby.hasConnectedPlayers()) {
          const grace =
            lobby.state === "playing" ? config.emptyGameGraceMs : config.emptyLobbyGraceMs;
          if (now - lobby.lastActivity > grace) lobby.close();
        }
      }
    }, 15_000);
    this.sweepTimer.unref();
  }
}

// The Lobby class owns close(); the sweep only calls it.

export const lobbyStore = new LobbyStore();

/** Re-exported for tests. */
export type { Lobby, LobbyView };
