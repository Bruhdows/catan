import { z } from "zod";
import { PLAYER_COLORS, type GameCommand, type GameEvent, type GameView, type PlayerColor } from "./game.js";
import type { BoardMode } from "./board.js";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LOBBY_CODE_LENGTH = 6;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;

export type LobbyState = "lobby" | "playing" | "finished";

export interface LobbySettings {
  boardMode: BoardMode;
  allowSpectators: boolean;
  turnTimeSeconds: 0 | 60 | 120 | 180 | 300;
}

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = { boardMode: "random", allowSpectators: true, turnTimeSeconds: 0 };

export interface LobbyPlayerView {
  id: string;
  name: string;
  color: PlayerColor;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

export interface LobbyView {
  code: string;
  state: LobbyState;
  hostId: string;
  players: LobbyPlayerView[];
  spectators: { id: string; name: string }[];
  settings: LobbySettings;
  minPlayers: number;
  maxPlayers: number;
  turnDeadline: number | null;
}

export interface SessionAuth {
  code: string;
  playerId: string;
  token: string;
  spectator: boolean;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string; message?: string };

// ---------------------------------------------------------------------------
// Zod schemas for every client-supplied payload
// ---------------------------------------------------------------------------

export const nameSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length >= 1 && v.length <= 20, "Pick a nickname of 1-20 characters.");

export const codeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => new RegExp(`^[${CODE_ALPHABET}]{${LOBBY_CODE_LENGTH}}$`).test(v));

const handSchema = z.object({
  brick: z.number().int().min(0).max(19),
  lumber: z.number().int().min(0).max(19),
  wool: z.number().int().min(0).max(19),
  grain: z.number().int().min(0).max(19),
  ore: z.number().int().min(0).max(19),
});

export const gameCommandSchema: z.ZodType<GameCommand> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rollDice") }),
  z.object({ type: z.literal("placeSettlement"), vertex: z.string().min(1).max(64) }),
  z.object({ type: z.literal("placeRoad"), edge: z.string().min(1).max(160) }),
  z.object({ type: z.literal("upgradeCity"), vertex: z.string().min(1).max(64) }),
  z.object({ type: z.literal("buyDevelopment") }),
  z.object({ type: z.literal("playKnight") }),
  z.object({ type: z.literal("playRoadBuilding") }),
  z.object({ type: z.literal("playYearOfPlenty"), resources: handSchema }),
  z.object({ type: z.literal("playMonopoly"), resource: z.enum(["brick", "lumber", "wool", "grain", "ore"]) }),
  z.object({ type: z.literal("moveRobber"), hex: z.string().min(1).max(16), victim: z.string().max(64).optional() }),
  z.object({ type: z.literal("selectVictim"), player: z.string().min(1).max(64) }),
  z.object({ type: z.literal("discard"), resources: handSchema }),
  z.object({ type: z.literal("offerTrade"), to: z.string().min(1).max(64), give: handSchema, get: handSchema }),
  z.object({
    type: z.literal("respondTrade"),
    offerId: z.string().min(1).max(64),
    response: z.enum(["accept", "decline", "counter"]),
    counter: handSchema.optional(),
    counterGet: handSchema.optional(),
  }),
  z.object({ type: z.literal("confirmTrade"), offerId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("cancelTrade"), offerId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("bankTrade"),
    give: z.enum(["brick", "lumber", "wool", "grain", "ore"]),
    get: z.enum(["brick", "lumber", "wool", "grain", "ore"]),
  }),
  z.object({ type: z.literal("endTurn") }),
]);

export const commandEnvelopeSchema = z.object({
  command: gameCommandSchema,
  /** Optional expected revision for optimistic concurrency control. */
  rev: z.number().int().nonnegative().optional(),
  /** Optional idempotency key; replays are acknowledged without re-execution. */
  commandId: z.string().max(64).optional(),
});

export const settingsSchema = z.object({
  boardMode: z.enum(["fixed", "random", "balanced"]),
  allowSpectators: z.boolean(),
  turnTimeSeconds: z.union([z.literal(0), z.literal(60), z.literal(120), z.literal(180), z.literal(300)]).default(0),
}) satisfies z.ZodType<LobbySettings>;

export const colorSchema = z.enum(PLAYER_COLORS) satisfies z.ZodType<PlayerColor>;

// ---------------------------------------------------------------------------
// Socket event maps
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  "lobby:create": (payload: { name: string; color?: PlayerColor }, ack: (res: AckResult<SessionAuth & { lobby: LobbyView }>) => void) => void;
  "lobby:join": (
    payload: { code: string; name?: string; token?: string; color?: PlayerColor; spectator?: boolean },
    ack: (res: AckResult<SessionAuth & { lobby: LobbyView; game?: GameView }>) => void,
  ) => void;
  "lobby:leave": () => void;
  "lobby:settings": (payload: { settings: LobbySettings }) => void;
  "lobby:color": (payload: { color: PlayerColor }) => void;
  "lobby:ready": (payload: { ready: boolean }) => void;
  "lobby:kick": (payload: { playerId: string }) => void;
  "lobby:start": (ack: (res: AckResult<null>) => void) => void;
  "lobby:reset": (ack: (res: AckResult<null>) => void) => void;
  "game:command": (
    payload: { command: GameCommand; rev?: number; commandId?: string },
    ack: (res: AckResult<null>) => void,
  ) => void;
  /** Ask the server for a fresh projection of the current state. */
  "game:sync": () => void;
}

export interface ServerToClientEvents {
  "lobby:state": (view: LobbyView) => void;
  /** Private, per-player projection. */
  "game:state": (view: GameView) => void;
  /** Public engine events (dice, production, steals, ...). */
  "game:event": (event: GameEvent) => void;
  /** Engine events addressed to one player only. */
  "game:private-event": (event: GameEvent) => void;
  "lobby:error": (error: { message: string }) => void;
}
