export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  /** Directory containing the built frontend (served in production). */
  webDistDir: process.env.WEB_DIST_DIR ?? "../web/dist",
  serveWeb: process.env.SERVE_WEB !== "false",
  /** Directory for match snapshots. Empty string disables persistence. */
  dataDir: process.env.DATA_DIR ?? "data",
  /** Restore snapshots on boot. */
  restore: process.env.RESTORE_MATCHES !== "false",
  /** A disconnected player seat is released after this long (lobby state). */
  playerDisconnectGraceMs: Number(process.env.PLAYER_DISCONNECT_GRACE_MS ?? 120_000),
  /** A lobby with nobody connected is deleted after this long. */
  emptyLobbyGraceMs: Number(process.env.EMPTY_LOBBY_GRACE_MS ?? 60_000),
  /** An active match where nobody is connected is deleted after this long. */
  emptyGameGraceMs: Number(process.env.EMPTY_GAME_GRACE_MS ?? 30 * 60_000),
  /** Lobbies with no activity are swept after this long. */
  idleLobbyTtlMs: Number(process.env.IDLE_LOBBY_TTL_MS ?? 4 * 60 * 60_000),
  /** Snapshot writes are debounced by this long. */
  snapshotDebounceMs: Number(process.env.SNAPSHOT_DEBOUNCE_MS ?? 300),
};

export const logConfig = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "warn" : "info"),
};
