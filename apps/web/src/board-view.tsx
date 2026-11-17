/**
 * The island board.
 *
 * Rendering only: all placement validation lives in the shared package and in
 * `legalBoardTargets` below (mirrored from the authoritative rules). Terrain is
 * illustrated by `assets/terrain.tsx`; pieces, ports and tokens are drawn here.
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import {
  cornerIndexForVertex, cornerPixel, hashSeed, hexToPixel, parseHexKey, tokenPips,
  type GameView, type Resource,
} from "@hexhaven/shared";
import { PLAYER_COLORS } from "./design";
import { ResourceIcon } from "./assets/art";
import { RobberPiece, SeaDecor, TERRAIN_LABEL, TerrainArt } from "./assets/terrain";

export type BoardAction = "road" | "settlement" | "city" | "robber" | null;
type Props = {
  game: GameView;
  mode: BoardAction;
  selectable: Set<string>;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
  onHex: (id: string) => void;
};

const SIZE = 62;

export function legalBoardTargets(game: GameView, mode: BoardAction, myId: string | undefined): Set<string> {
  const result = new Set<string>();
  if (!myId || !mode) return result;
  const me = game.players.find((p) => p.id === myId);
  if (!me) return result;
  const ownBuildings = new Set([...me.settlements, ...me.cities]);
  const occupiedBuildings = new Set(game.players.flatMap((p) => [...p.settlements, ...p.cities]));
  const occupiedRoads = new Set(game.players.flatMap((p) => p.roads));
  const opponentBuildings = new Set(game.players.filter((p) => p.id !== myId).flatMap((p) => [...p.settlements, ...p.cities]));
  const ownRoads = new Set(me.roads);
  const edges = game.board.edges;
  const pending = game.pending;
  if (mode === "robber") {
    for (const hex of game.board.landHexes) if (hex.id !== game.robberHex) result.add(hex.id);
  } else if (mode === "city") {
    for (const vertex of me.settlements) result.add(vertex);
  } else if (mode === "settlement") {
    for (const vertex of game.board.vertices) {
      if (occupiedBuildings.has(vertex.id) || vertex.neighbors.some((n) => occupiedBuildings.has(n))) continue;
      if (pending.type === "setup" || edges.some((e) => ownRoads.has(e.id) && (e.a === vertex.id || e.b === vertex.id))) result.add(vertex.id);
    }
  } else if (mode === "road") {
    if (pending.type === "setup") {
      if (!pending.needsRoad || !pending.vertex) return result;
      for (const e of edges) if (!occupiedRoads.has(e.id) && (e.a === pending.vertex || e.b === pending.vertex)) result.add(e.id);
    } else for (const e of edges) {
      if (occupiedRoads.has(e.id)) continue;
      const connected = (v: string) =>
        !opponentBuildings.has(v) && (ownBuildings.has(v) || edges.some((existing) => ownRoads.has(existing.id) && (existing.a === v || existing.b === v)));
      if (connected(e.a) || connected(e.b)) result.add(e.id);
    }
  }
  return result;
}

function hexPoints(x: number, y: number, r = SIZE) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 + 30) * Math.PI / 180;
    return (x + r * Math.cos(a)).toFixed(2) + "," + (y + r * Math.sin(a)).toFixed(2);
  }).join(" ");
}

function positions(game: GameView) {
  const map = new Map<string, { x: number; y: number }>();
  const land = new Map(game.board.landHexes.map((h) => [h.id, h]));
  for (const v of game.board.vertices) {
    const h = v.hexes.map((id) => land.get(id)).find(Boolean);
    if (!h) continue;
    const i = cornerIndexForVertex(h.axial, v.id);
    if (i >= 0) map.set(v.id, cornerPixel(h.axial, i, SIZE));
  }
  return map;
}

/* --- Pieces ----------------------------------------------------------------- */

const PIECE_INK = "#33281a";

function Settlement({ color, city }: { color: string; city?: boolean }) {
  return <g filter="url(#piece-shadow)" className="board-piece">
    {city
      ? <g>
        <path d="M-15.5 11V-4l6.5-4.4v-4.6l6.5 4.6 6.5 4.4 2-2.6V11Z" fill={color} stroke={PIECE_INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M-15.5-4l6.5-4.4v-4.6l6.5 4.6" fill="none" stroke={PIECE_INK} strokeWidth="2.3" strokeLinecap="round" />
        <rect x="-10.5" y="2" width="6.6" height="9" rx="1.2" fill={PIECE_INK} opacity=".5" />
        <rect x="1" y="2" width="5" height="5" rx="1" fill="#fff" opacity=".55" />
        <rect x="8" y="5" width="5" height="6" rx="1" fill="#fff" opacity=".4" />
      </g>
      : <g>
        <path d="M-11 11V-2.6L0-14.4 11-2.6V11Z" fill={color} stroke={PIECE_INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M-11-2.6 0-14.4 11-2.6" fill="none" stroke={PIECE_INK} strokeWidth="2.4" strokeLinecap="round" />
        <rect x="-3.4" y="1" width="6.8" height="10" rx="1.2" fill={PIECE_INK} opacity=".5" />
        <rect x="4.2" y="3.6" width="4.2" height="4.2" rx="1" fill="#fff" opacity=".55" />
      </g>}
  </g>;
}

/* --- Number token ------------------------------------------------------------ */

function NumberToken({ x, y, n }: { x: number; y: number; n: number }) {
  const red = n === 6 || n === 8;
  const pips = tokenPips(n);
  const angle = ((hashSeed("token:" + n) % 15) - 7) * 0.9;
  return <g transform={`translate(${x} ${y}) rotate(${angle.toFixed(1)})`} pointerEvents="none">
    <circle r="19.5" fill="#2f2416" opacity=".18" cy="1.8" />
    <circle r="19" fill={red ? "#f6e3c8" : "#f8f0dc"} stroke={red ? "#b8473c" : "#c8b689"} strokeWidth="2.4" />
    <circle r="15.6" fill="none" stroke={red ? "#c85a4e" : "#d8c9a2"} strokeWidth="1" opacity=".8" />
    <text y="3.6" textAnchor="middle" fontSize="17.5" fontWeight="700" fontFamily="Fraunces, Georgia, serif"
      fill={red ? "#a83a30" : "#4a3b26"}>{n}</text>
    {Array.from({ length: pips }, (_, i) =>
      <circle key={i} cx={(i - (pips - 1) / 2) * 5} cy="10.4" r="1.5" fill={red ? "#b8473c" : "#9a8663"} />)}
  </g>;
}

/* --- Ports -------------------------------------------------------------------- */

function PortMedallion({ x, y, ratio, resource }: { x: number; y: number; ratio: 2 | 3; resource: Resource | null }) {
  return <g transform={`translate(${x} ${y})`} className="harbor-token" filter="url(#piece-shadow)">
    <circle r="16.5" fill="#f6eeda" stroke="#8a5a33" strokeWidth="3" />
    <circle r="12.8" fill="none" stroke="#c9a76b" strokeWidth="1.2" strokeDasharray="2.6 3" />
    {resource
      ? <g transform="translate(-7 -9) scale(1.25)"><ResourceIcon resource={resource} size={11} /></g>
      : <text y="-1" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#7a6440">ANY</text>}
    <text y="9.6" textAnchor="middle" fontSize="10.5" fontWeight="700" fontFamily="Fraunces, Georgia, serif" fill="#6b4a2a">
      {ratio}:1
    </text>
  </g>;
}

function keyboard(e: KeyboardEvent<SVGGElement>, handler: () => void) {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
}

export function BoardView({ game, mode, selectable, onVertex, onEdge, onHex }: Props) {
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches ? 1.25 : 1));
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => { setZoom(media.matches ? 1.25 : 1); setOffset({ x: 0, y: 0 }); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const vertexPositions = useMemo(() => positions(game), [game.board]);
  const roads = new Map<string, string>();
  const buildings = new Map<string, { color: string; city: boolean }>();
  for (const player of game.players) {
    const color = PLAYER_COLORS[player.color];
    for (const id of player.roads) roads.set(id, color);
    for (const id of player.settlements) buildings.set(id, { color, city: false });
    for (const id of player.cities) buildings.set(id, { color, city: true });
  }

  const range = (game.board.landHexes.length > 19 ? 570 : 408) / zoom;
  const viewBox = `${-range + offset.x} ${-range * 0.8 + offset.y} ${range * 2} ${range * 1.6}`;

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    setZoom((z) => Math.max(0.75, Math.min(2.4, z + (e.deltaY < 0 ? 0.1 : -0.1))));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest(".board-hit")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, y: e.clientY, sx: offset.x, sy: offset.y });
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setOffset({ x: drag.sx - (e.clientX - drag.x) * (range * 2) / rect.width, y: drag.sy - (e.clientY - drag.y) * (range * 1.6) / rect.height });
  };
  const resetView = () => {
    setZoom(window.matchMedia("(max-width: 700px)").matches ? 1.25 : 1);
    setOffset({ x: 0, y: 0 });
  };

  return <div className="island-stage">
    <svg className="game-board" viewBox={viewBox} role="group" aria-label="Interactive island board"
      onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      <defs>
        <radialGradient id="sea" cx="50%" cy="38%" r="75%">
          <stop stopColor="#3d9db8" />
          <stop offset=".62" stopColor="#2187a4" />
          <stop offset="1" stopColor="#14607e" />
        </radialGradient>
        <pattern id="waves" width="86" height="54" patternUnits="userSpaceOnUse">
          <path d="M-8 16 Q2 10 12 16 T32 16 T52 16 T72 16 T92 16" fill="none" stroke="#dff4f6" strokeWidth="1.6" strokeOpacity=".14" />
          <path d="M-8 42 Q2 36 12 42 T32 42 T52 42 T72 42 T92 42" fill="none" stroke="#dff4f6" strokeWidth="1.6" strokeOpacity=".09" />
        </pattern>
        <filter id="tile-depth" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0c3d52" floodOpacity=".35" />
        </filter>
        <filter id="piece-shadow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#22333c" floodOpacity=".45" />
        </filter>
      </defs>

      {/* Ocean */}
      <rect x="-1400" y="-1400" width="2800" height="2800" fill="url(#sea)" />
      <rect x="-1400" y="-1400" width="2800" height="2800" fill="url(#waves)" />

      {/* Open-sea hexes */}
      {game.board.seaHexes.map((id) => {
        const p = hexToPixel(parseHexKey(id), SIZE);
        return <polygon key={id} points={hexPoints(p.x, p.y, SIZE + 1)} fill="#3aa0bb" fillOpacity=".16" pointerEvents="none" />;
      })}

      {/* Sand shelf + foam ring under the island */}
      {game.board.landHexes.map((hex) => {
        const p = hexToPixel(hex.axial, SIZE);
        return <polygon key={"shelf" + hex.id} points={hexPoints(p.x, p.y, SIZE * 1.22)}
          fill="#e6d3a4" opacity=".85" />;
      })}
      {game.board.landHexes.map((hex) => {
        const p = hexToPixel(hex.axial, SIZE);
        return <polygon key={"foam" + hex.id} points={hexPoints(p.x, p.y, SIZE * 1.1)}
          fill="none" stroke="#f3f7ee" strokeOpacity=".55" strokeWidth="2.4" strokeDasharray="7 6" />;
      })}

      <SeaDecor />

      {/* Land tiles */}
      {game.board.landHexes.map((hex) => {
        const p = hexToPixel(hex.axial, SIZE);
        const active = mode === "robber" && selectable.has(hex.id);
        const click = () => onHex(hex.id);
        const robberHere = game.robberHex === hex.id;
        return <g key={hex.id}
          className={active ? "board-hit hex-target" : undefined}
          role={active ? "button" : undefined}
          aria-label={active ? "Move the robber to " + TERRAIN_LABEL[hex.terrain] : undefined}
          tabIndex={active ? 0 : undefined}
          onKeyDown={active ? (e) => keyboard(e, click) : undefined}
          onClick={active ? click : undefined}>
          <title>{TERRAIN_LABEL[hex.terrain]}{hex.number ? " · " + hex.number : ""}{robberHere ? " · robber here" : ""}</title>
          <polygon points={hexPoints(p.x, p.y, SIZE)} fill="#f4e9cf" filter="url(#tile-depth)" />
          <polygon points={hexPoints(p.x, p.y, SIZE - 2.5)} className="terrain-fill"
            fill={`var(--t-${hex.terrain})`} stroke={active ? "#fff3b0" : "#efe2c2"} strokeWidth={active ? 3.4 : 1.6} />
          <g transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
            <TerrainArt terrain={hex.terrain} seed={hex.id} r={SIZE - 4} />
          </g>
          {active && <polygon points={hexPoints(p.x, p.y, SIZE - 5)} fill="#ffe98e" fillOpacity=".18"
            stroke="#ffef9e" strokeWidth="2.6" className="terrain-outline" pointerEvents="none" />}
          {robberHere && <g transform={`translate(${p.x} ${p.y - 12})`} pointerEvents="none"><RobberPiece scale={1.5} /></g>}
        </g>;
      })}

      {/* Number tokens */}
      {game.board.landHexes.filter((h) => h.number !== null).map((hex) => {
        const p = hexToPixel(hex.axial, SIZE);
        return <NumberToken key={hex.id} x={p.x} y={p.y} n={hex.number!} />;
      })}

      {/* Ports */}
      {game.board.ports.map((port) => {
        const a = vertexPositions.get(port.vertices[0]);
        const b = vertexPositions.get(port.vertices[1]);
        if (!a || !b) return null;
        const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
        const h = game.board.landHexes.find((k) => k.id === port.landHex);
        if (!h) return null;
        const center = hexToPixel(h.axial, SIZE);
        const dx = midX - center.x, dy = midY - center.y, d = Math.hypot(dx, dy) || 1;
        const x = midX + (dx / d) * 40, y = midY + (dy / d) * 40;
        return <g key={port.id}>
          <title>{port.resource ? `${port.resource} harbor — trade 2 for 1` : "General harbor — trade 3 for 1"}</title>
          <path d={`M${a.x} ${a.y} L${x} ${y} L${b.x} ${b.y}`} fill="none" stroke="#f2e3b8" strokeWidth="2.4"
            strokeDasharray="4 4" opacity=".85" />
          <PortMedallion x={x} y={y} ratio={port.ratio} resource={port.resource as Resource | null} />
        </g>;
      })}

      {/* Roads */}
      {game.board.edges.map((edge) => {
        const a = vertexPositions.get(edge.a), b = vertexPositions.get(edge.b);
        if (!a || !b) return null;
        const owned = roads.get(edge.id);
        const active = mode === "road" && selectable.has(edge.id);
        const click = () => onEdge(edge.id);
        return <g key={edge.id} role={active ? "button" : undefined} tabIndex={active ? 0 : undefined}
          onKeyDown={active ? (e) => keyboard(e, click) : undefined}
          aria-label={active ? "Place a road here" : undefined}>
          {owned && <g className="board-piece" filter="url(#piece-shadow)">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4a3826" strokeWidth="10.5" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={owned} strokeWidth="7" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeOpacity=".3" strokeWidth="1.8" strokeLinecap="round" />
          </g>}
          {active && <>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff3ae" strokeWidth="8" strokeDasharray="6 5"
              strokeLinecap="round" className="road-hint" pointerEvents="none" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff5a8" strokeOpacity=".06" strokeWidth="24"
              pointerEvents="stroke" className="board-hit edge-hit" onClick={click} />
          </>}
        </g>;
      })}

      {/* Buildings + placement hints */}
      {game.board.vertices.map((v) => {
        const p = vertexPositions.get(v.id);
        if (!p) return null;
        const built = buildings.get(v.id);
        const active = (mode === "settlement" || mode === "city") && selectable.has(v.id);
        if (!built && !active) return null;
        const click = () => onVertex(v.id);
        return <g key={v.id} transform={`translate(${p.x} ${p.y})`}
          className={active ? "board-hit vertex-hit" : undefined}
          tabIndex={active ? 0 : undefined} role={active ? "button" : undefined}
          aria-label={active ? (mode === "city" ? "Upgrade to a city" : "Build a settlement here") : undefined}
          onKeyDown={active ? (e) => keyboard(e, click) : undefined}
          onClick={active ? click : undefined}>
          {active && <>
            <circle r="17.5" fill="#fff3ae" fillOpacity=".5" stroke="#fff8d0" strokeWidth="2" className="vertex-hint" pointerEvents="none" />
            <circle r="21" fill="transparent" />
          </>}
          {built && <Settlement color={built.color} city={built.city} />}
        </g>;
      })}
    </svg>

    <div className="board-zoom" role="group" aria-label="Board view controls">
      <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.4, z + 0.18))}><Plus size={16} /></button>
      <button aria-label="Reset view" onClick={resetView}><Maximize size={15} /></button>
      <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.75, z - 0.18))}><Minus size={16} /></button>
    </div>
  </div>;
}
