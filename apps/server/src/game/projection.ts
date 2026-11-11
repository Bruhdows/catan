import {
  handTotal,
  publicPoints,
  totalPoints,
  type Edge,
  type GameEvent,
  type GameState,
  type GameView,
  type PublicPlayer,
  type Vertex,
} from "@hexhaven/shared";

const MAX_LOG_VIEW = 150;

/**
 * Builds the per-viewer projection of authoritative state. Opponent hands,
 * hidden development cards and the deck are never included; spectators
 * receive the purely public shape.
 */
export function projectGame(
  state: GameState,
  viewerId: string | null,
  connectedIds: Set<string>,
): GameView {
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    index: p.index,
    connected: connectedIds.has(p.id),
    resourceCount: handTotal(p.resources),
    devCount: p.devCards.length,
    knightsPlayed: p.knightsPlayed,
    roads: p.roads,
    settlements: p.settlements,
    cities: p.cities,
    publicPoints: publicPoints(state, p),
    hasLongestRoad: state.awards.longestRoad.playerId === p.id,
    hasLargestArmy: state.awards.largestArmy.playerId === p.id,
    pieces: {
      roads: 15 - p.roads.length,
      settlements: 5 - p.settlements.length - p.cities.length,
      cities: 4 - p.cities.length,
    },
  }));

  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const you = viewer
    ? {
        id: viewer.id,
        resources: { ...viewer.resources },
        devCards: viewer.devCards.map((c) => ({ ...c })),
        totalPoints: totalPoints(state, viewer),
      }
    : null;

  const vertices: Vertex[] = [...state.board.topology.vertices.values()];
  const edges: Edge[] = [...state.board.topology.edges.values()];

  return {
    schemaVersion: state.schemaVersion,
    rev: state.rev,
    phase: state.phase,
    turnIndex: state.turnIndex,
    turnCount: state.turnCount,
    seed: state.seed,
    boardMode: state.boardMode,
    board: {
      landHexes: [...state.board.hexes.values()].map((h) => ({ ...h })),
      seaHexes: [...state.board.topology.seaHexes],
      vertices,
      edges,
      ports: state.board.ports.map((p) => ({ ...p })),
    },
    robberHex: state.robberHex,
    players,
    you,
    dice: state.dice,
    bank: { ...state.bank },
    devDeckCount: state.devDeck.length,
    pending: structuredClone(state.pending),
    offers: state.offers.map((o) => ({
      ...o,
      give: { ...o.give },
      get: { ...o.get },
      counter: o.counter ? { give: { ...o.counter.give }, get: { ...o.counter.get } } : null,
    })),
    awards: structuredClone(state.awards),
    log: state.log.slice(-MAX_LOG_VIEW).map((l) => ({ ...l })),
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    winnerId: state.winnerId,
    setupSequence: [...state.setupSequence],
  };
}

/** Splits engine events into public broadcasts and player-targeted ones. */
export function splitEvents(events: GameEvent[]): { publicEvents: GameEvent[]; privateEvents: { to: string; event: GameEvent }[] } {
  const publicEvents: GameEvent[] = [];
  const privateEvents: { to: string; event: GameEvent }[] = [];
  for (const event of events) {
    switch (event.kind) {
      case "discardPrivate":
      case "stolenPrivate":
        privateEvents.push({ to: event.to, event });
        break;
      case "notice":
        if (event.to) privateEvents.push({ to: event.to, event });
        else publicEvents.push(event);
        break;
      default:
        publicEvents.push(event);
    }
  }
  return { publicEvents, privateEvents };
}
