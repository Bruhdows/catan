import type { Board, BoardHex, BoardMode, BoardShape, Port } from "./board.js";
import type { Edge, Vertex } from "./geometry.js";
import type { Resource, ResourceHand } from "./resources.js";

/** Player piece colors. Names are shown alongside colors for accessibility. */
export const PLAYER_COLORS = ["crimson", "azure", "amber", "ivory", "emerald", "violet", "teal", "rose"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type DevCardType = "knight" | "roadBuilding" | "yearOfPlenty" | "monopoly" | "victoryPoint";

export const DEV_CARD_LABELS: Record<DevCardType, string> = {
  knight: "Knight",
  roadBuilding: "Road Building",
  yearOfPlenty: "Year of Plenty",
  monopoly: "Monopoly",
  victoryPoint: "Victory Point",
};

/** Development deck composition (25 cards). */
export const DEV_DECK: DevCardType[] = [
  ...Array.from({ length: 14 }, () => "knight"),
  ...Array.from({ length: 2 }, () => "roadBuilding"),
  ...Array.from({ length: 2 }, () => "yearOfPlenty"),
  ...Array.from({ length: 2 }, () => "monopoly"),
  ...Array.from({ length: 5 }, () => "victoryPoint"),
] as DevCardType[];

export interface DevCard {
  id: string;
  type: DevCardType;
  /** Turn number (1-based) on which the card was bought. */
  boughtTurn: number;
}

export interface PlayerGame {
  id: string;
  name: string;
  color: PlayerColor;
  /** Seat/turn order index. */
  index: number;
  resources: ResourceHand;
  devCards: DevCard[];
  knightsPlayed: number;
  /** Occupied road edge ids. */
  roads: string[];
  /** Vertex ids with a settlement. */
  settlements: string[];
  /** Vertex ids upgraded to a city. */
  cities: string[];
  /** Development cards bought this turn (UI hints + deck tracking). */
  boughtThisTurn: number;
  /** Whether an action development card was played this turn. */
  playedDevThisTurn: boolean;
}

export type Phase = "setup" | "roll" | "main" | "finished";

export type Pending =
  | { type: "none" }
  /** Initial placement; `step` indexes the flattened settlement order. */
  | { type: "setup"; step: number; player: string; needsRoad: boolean; vertex: string | null }
  /** Players who still owe discards, and how many. */
  | { type: "discard"; players: { playerId: string; count: number }[]; afterRoll?: boolean }
  | { type: "robberMove"; afterRoll?: boolean }
  | { type: "robberSteal"; candidates: string[]; afterRoll?: boolean }
  /** Free roads remaining from a Road Building card. */
  | { type: "roadBuilding"; remaining: number };

export type TradeOfferStatus = "pending" | "accepted" | "declined";

export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  give: ResourceHand;
  get: ResourceHand;
  status: TradeOfferStatus;
  /** Counteroffer proposed by the recipient (still awaiting the creator). */
  counter: { give: ResourceHand; get: ResourceHand } | null;
}

export interface Awards {
  longestRoad: { playerId: string | null; length: number };
  largestArmy: { playerId: string | null; size: number };
}

export interface LogEntry {
  /** Turn number when the entry was written. */
  turn: number;
  /** Revision at which the entry was written (for incremental sync). */
  rev: number;
  text: string;
  /** Optional tone for styling. */
  tone?: "action" | "roll" | "trade" | "card" | "award" | "robber" | "system";
}

export interface GameState {
  schemaVersion: number;
  seed: string;
  boardMode: BoardMode;
  boardSize: BoardShape;
  board: Board;
  players: PlayerGame[];
  phase: Phase;
  /** Active player index (only meaningful outside setup). */
  turnIndex: number;
  /** 1-based turn counter across the whole game. */
  turnCount: number;
  /** Monotonic revision, incremented on every accepted mutation. */
  rev: number;
  dice: [number, number] | null;
  bank: ResourceHand;
  /** Face-down deck order; draw from the end. Server-only knowledge. */
  devDeck: DevCard[];
  robberHex: string;
  pending: Pending;
  offers: TradeOffer[];
  awards: Awards;
  log: LogEntry[];
  startedAt: number;
  finishedAt: number | null;
  winnerId: string | null;
  /** Flattened initial-placement order: player ids, length 2N. */
  setupSequence: string[];
}

// ---------------------------------------------------------------------------
// Commands (client -> server, one validated message per action)
// ---------------------------------------------------------------------------

export type GameCommand =
  | { type: "rollDice" }
  | { type: "placeSettlement"; vertex: string }
  | { type: "placeRoad"; edge: string }
  | { type: "upgradeCity"; vertex: string }
  | { type: "buyDevelopment" }
  | { type: "playKnight" }
  | { type: "playRoadBuilding" }
  | { type: "playYearOfPlenty"; resources: ResourceHand }
  | { type: "playMonopoly"; resource: Resource }
  | { type: "moveRobber"; hex: string; victim?: string }
  | { type: "selectVictim"; player: string }
  | { type: "discard"; resources: ResourceHand }
  | { type: "offerTrade"; to: string; give: ResourceHand; get: ResourceHand }
  | { type: "respondTrade"; offerId: string; response: "accept" | "decline" | "counter"; counter?: ResourceHand; counterGet?: ResourceHand }
  | { type: "confirmTrade"; offerId: string }
  | { type: "cancelTrade"; offerId: string }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "endTurn" };

// ---------------------------------------------------------------------------
// Events (engine -> server -> sockets). Public ones broadcast; private ones
// are addressed to a single player.
// ---------------------------------------------------------------------------

export type GameEvent =
  | { kind: "dice"; dice: [number, number]; total: number }
  | { kind: "produced"; gains: { playerId: string; hand: ResourceHand }[] }
  | { kind: "discardPublic"; playerId: string; count: number }
  | { kind: "discardPrivate"; to: string; hand: ResourceHand }
  | { kind: "stolen"; from: string; by: string }
  | { kind: "stolenPrivate"; to: string; resource: Resource }
  | { kind: "notice"; to: string | null; message: string }
  | { kind: "award"; award: "longestRoad" | "largestArmy"; playerId: string | null };

// ---------------------------------------------------------------------------
// Views (per-player projections of authoritative state)
// ---------------------------------------------------------------------------

export interface PublicPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  index: number;
  connected: boolean;
  resourceCount: number;
  devCount: number;
  knightsPlayed: number;
  roads: string[];
  settlements: string[];
  cities: string[];
  /** Points visible to everyone: buildings + public awards. */
  publicPoints: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  pieces: { roads: number; settlements: number; cities: number };
}

export interface PrivatePlayer {
  id: string;
  resources: ResourceHand;
  devCards: DevCard[];
  /** Points including hidden victory point cards. */
  totalPoints: number;
}

export interface BoardView {
  landHexes: BoardHex[];
  seaHexes: string[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
}

export interface GameView {
  schemaVersion: number;
  rev: number;
  phase: Phase;
  turnIndex: number;
  turnCount: number;
  seed: string;
  boardMode: BoardMode;
  boardSize: BoardShape;
  board: BoardView;
  robberHex: string;
  players: PublicPlayer[];
  /** Present for players, null for spectators. */
  you: PrivatePlayer | null;
  dice: [number, number] | null;
  bank: ResourceHand;
  devDeckCount: number;
  pending: Pending;
  offers: TradeOffer[];
  awards: Awards;
  log: LogEntry[];
  startedAt: number;
  finishedAt: number | null;
  winnerId: string | null;
  /** Flattened initial-placement order: player ids, length 2N. */
  setupSequence: string[];
}
