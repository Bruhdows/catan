import React from "react";
/**
 * Illustrated terrain for the island board.
 *
 * Every land hex renders a small composed scene (trees, sheep, crop rows,
 * peaks, dunes) seeded by the hex id, so tiles vary naturally while staying
 * deterministic. Content is drawn in the terrain's own shade family — no
 * generic icon floating in a colored hexagon.
 */
import { hashSeed, mulberry32, type Terrain } from "@hexhaven/shared";

export const TERRAIN_LABEL: Record<Terrain, string> = {
  water: "Ocean",
  forest: "Forest — produces lumber",
  hills: "Hills — produce brick",
  pasture: "Pasture — produces wool",
  fields: "Fields — produce grain",
  mountains: "Mountains — produce ore",
  desert: "Desert — produces nothing",
};

type Rng = ReturnType<typeof mulberry32>;

function Tree({ x, y, s, rng }: { x: number; y: number; s: number; rng: Rng }) {
  const sway = (rng.next() - 0.5) * 2.4;
  const tone = rng.next() < 0.5 ? "#2c7046" : "#357c4e";
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cx="0" cy={s * 0.32} rx={s * 0.42} ry={s * 0.12} fill="#2a5f3e" opacity=".28" />
    <rect x={-s * 0.07} y={s * 0.05} width={s * 0.14} height={s * 0.34} rx={s * 0.05} fill="#6b4a2a" />
    <path d={`M${-s * 0.42 + sway} ${s * 0.18} L${sway * 0.4} ${-s * 0.62} L${s * 0.42 + sway} ${s * 0.18} Z`} fill={tone} />
    <path d={`M${-s * 0.34 + sway} ${-s * 0.18} L${sway * 0.5} ${-s * 0.95} L${s * 0.34 + sway} ${-s * 0.18} Z`} fill={tone} />
    <path d={`M${-s * 0.1 + sway} ${-s * 0.4} L${sway} ${-s * 0.95} L${s * 0.1 + sway} ${-s * 0.4} Z`} fill="#4c9a68" opacity=".85" />
  </g>;
}

function Sheep({ x, y, s }: { x: number; y: number; s: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="4.6" rx="6" ry="1.6" fill="#5f7c3c" opacity=".3" />
    <circle cx="-2.6" cy="0" r="3.1" fill="#f4efdf" stroke="#8a7c56" strokeWidth="0.9" />
    <circle cx="0.6" cy="-1.2" r="3.5" fill="#f4efdf" stroke="#8a7c56" strokeWidth="0.9" />
    <circle cx="3.4" cy="0.4" r="2.7" fill="#f4efdf" stroke="#8a7c56" strokeWidth="0.9" />
    <circle cx="5.4" cy="-1.8" r="1.7" fill="#4d4234" />
    <path d="M-3.4 4.6l-.4 1.8M2.4 4.6l.4 1.8" stroke="#4d4234" strokeWidth="1" strokeLinecap="round" />
  </g>;
}

function Wheat({ x, y, s, rng }: { x: number; y: number; s: number; rng: Rng }) {
  const lean = (rng.next() - 0.5) * 3;
  return <g transform={`translate(${x} ${y})`} stroke="#a3752a" strokeWidth={s * 0.16} strokeLinecap="round">
    <path d={`M0 ${s * 0.55} Q${lean} ${s * 0.1} ${lean * 1.4} ${-s * 0.5}`} fill="none" />
    {[-1, 0, 1].map((i) =>
      <ellipse key={i} cx={lean * 1.4 + i * s * 0.13} cy={-s * 0.62 - Math.abs(i) * -s * 0.08}
        rx={s * 0.09} ry={s * 0.24} transform={`rotate(${lean + i * 24} ${lean * 1.4 + i * s * 0.13} ${-s * 0.62})`}
        fill="#e9c76a" stroke="#a3752a" strokeWidth={s * 0.07} />)}
    <path d={`M${lean * 0.7} ${-s * 0.05} l${-s * 0.3} ${-s * 0.28}M${lean} 0 l${s * 0.3} ${-s * 0.3}`}
      fill="none" opacity=".75" />
  </g>;
}

/** Content drawn inside a land hex, in local coordinates centered at (0,0). */
export function TerrainArt({ terrain, seed, r }: { terrain: Terrain; seed: string; r: number }) {
  const rng = mulberry32(hashSeed(seed) ^ 0x9e3779b9);
  const inner = r * 0.92;
  const spread = () => (rng.next() * 2 - 1) * inner * 0.5;
  switch (terrain) {
    case "forest": {
      const trees = 3 + (rng.next() < 0.5 ? 1 : 0);
      return <g>
        <ellipse cx={spread() * 0.6} cy={r * 0.38} rx={r * 0.62} ry={r * 0.2} fill="#4c9a68" opacity=".33" />
        {Array.from({ length: trees }, (_, i) =>
          <Tree key={i} x={-inner * 0.52 + (i * inner * 1.05) / trees + spread() * 0.3}
            y={r * 0.34 - Math.abs(spread()) * 0.5} s={r * (0.5 + rng.next() * 0.14)} rng={rng} />)}
      </g>;
    }
    case "pasture":
      return <g>
        <ellipse cx={-r * 0.3} cy={r * 0.3} rx={r * 0.55} ry={r * 0.26} fill="#b2d681" opacity=".6" />
        <ellipse cx={r * 0.4} cy={-r * 0.18} rx={r * 0.42} ry={r * 0.2} fill="#b2d681" opacity=".45" />
        <Sheep x={-r * 0.34} y={r * 0.18} s={r / 46} />
        <Sheep x={r * 0.3} y={-r * 0.02} s={r / 52} />
        {rng.next() < 0.6 && <Sheep x={r * 0.05} y={r * 0.5} s={r / 58} />}
        {[-1, 1].map((i) =>
          <path key={i} d={`M${i * r * 0.55} ${r * 0.42} q2 -4 0 -6M${i * r * 0.55 + 3} ${r * 0.42} q2 -4 0 -6`}
            stroke="#5f7c3c" strokeWidth="1.3" fill="none" strokeLinecap="round" />)}
      </g>;
    case "fields": {
      const rows = 3;
      return <g>
        {[0, 1, 2].map((i) =>
          <path key={i} d={`M${-inner * 0.6} ${-r * 0.25 + i * r * 0.42} q ${inner * 0.6} ${r * 0.16} ${inner * 1.2} 0`}
            stroke="#c2913a" strokeWidth="2" fill="none" opacity=".38" />)}
        {Array.from({ length: rows * 2 }, (_, i) =>
          <Wheat key={i} x={-inner * 0.62 + (i % rows) * inner * 0.58 + (i > 2 ? inner * 0.24 : 0)}
            y={i > 2 ? r * 0.36 : -r * 0.12} s={r * (0.3 + rng.next() * 0.08)} rng={rng} />)}
      </g>;
    }
    case "hills":
      return <g>
        <path d={`M${-r * 0.8} ${r * 0.36} q ${r * 0.42} ${-r * 0.5} ${r * 0.84} 0 Z`} fill="#a55333" opacity=".8" />
        <path d={`M${-r * 0.1} ${r * 0.42} q ${r * 0.45} ${-r * 0.62} ${r * 0.9} 0 Z`} fill="#b45f3b" />
        <path d={`M${-r * 0.52} ${r * 0.22} q ${r * 0.22} ${-r * 0.3} ${r * 0.46} 0`} fill="none" stroke="#8c4529" strokeWidth="1.6" />
        <path d={`M${r * 0.18} ${r * 0.28} q ${r * 0.24} ${-r * 0.36} ${r * 0.5} 0`} fill="none" stroke="#8c4529" strokeWidth="1.6" />
        <ellipse cx={r * 0.42} cy={-r * 0.3} rx={r * 0.3} ry={r * 0.16} fill="#8c4529" opacity=".55" />
        <ellipse cx={r * 0.42} cy={-r * 0.32} rx={r * 0.2} ry={r * 0.1} fill="#d98a5e" opacity=".7" />
        <rect x={-r * 0.52} y={-r * 0.36} width={r * 0.34} height={r * 0.16} rx={r * 0.04} fill="#a55333" stroke="#8c4529" strokeWidth="1.2" />
        <rect x={-r * 0.42} y={-r * 0.5} width={r * 0.34} height={r * 0.16} rx={r * 0.04} fill="#b45f3b" stroke="#8c4529" strokeWidth="1.2" />
      </g>;
    case "mountains":
      return <g>
        <path d={`M${-r * 0.86} ${r * 0.5} L${-r * 0.3} ${-r * 0.34} L${r * 0.24} ${r * 0.5} Z`} fill="#62768a" />
        <path d={`M${-r * 0.86} ${r * 0.5} L${-r * 0.3} ${-r * 0.34} L${-r * 0.08} ${r * 0.5} Z`} fill="#71839a" />
        <path d={`M${-r * 0.44} ${-r * 0.14} L${-r * 0.3} ${-r * 0.34} L${-r * 0.16} ${-r * 0.13} Z`} fill="#e8ecf2" />
        <path d={`M${-r * 0.1} ${r * 0.5} L${r * 0.5} ${-r * 0.52} L${r * 0.9} ${r * 0.5} Z`} fill="#5d7186" />
        <path d={`M${-r * 0.1} ${r * 0.5} L${r * 0.5} ${-r * 0.52} L${r * 0.42} ${r * 0.5} Z`} fill="#6d8095" />
        <path d={`M${r * 0.32} ${-r * 0.26} L${r * 0.5} ${-r * 0.52} L${r * 0.68} ${-r * 0.24} Z`} fill="#eef2f7" />
        <path d={`M${r * 0.5} ${-r * 0.52} l${r * 0.1} ${r * 0.28} l${-r * 0.16} ${r * 0.1}`} fill="none" stroke="#46586c" strokeWidth="1.4" />
      </g>;
    case "desert":
      return <g>
        <path d={`M${-r * 0.8} ${r * 0.18} q ${r * 0.4} ${-r * 0.3} ${r * 0.9} 0`} fill="none" stroke="#c9a761" strokeWidth="2.4" opacity=".8" />
        <path d={`M${-r * 0.6} ${r * 0.48} q ${r * 0.45} ${-r * 0.26} ${r * 1.0} 0`} fill="none" stroke="#c9a761" strokeWidth="2.2" opacity=".6" />
        <ellipse cx={r * 0.3} cy={r * 0.02} rx={r * 0.34} ry={r * 0.17} fill="#e5cd96" opacity=".8" />
        {[[0.44, -0.3], [-0.42, -0.24], [-0.2, 0.4]].map(([x, y], i) =>
          <path key={i} d={`M${x! * r - 3} ${y! * r + 2} l3 -2.6 3 2.6 -1 2 h-4 Z`} fill="#b08d52" stroke="#96773f" strokeWidth="0.8" />)}
      </g>;
    default:
      return null;
  }
}

/** Ambient sea details: a drifting boat and two gulls, deterministic. */
export function SeaDecor() {
  return <g pointerEvents="none">
    <g opacity=".85" transform="translate(-172 158)">
      <path d="M-14 6 Q0 14 14 6 L10 2 H-10 Z" fill="#f4ead2" stroke="#8a6a42" strokeWidth="2" strokeLinejoin="round" />
      <line x1="0" y1="2" x2="0" y2="-14" stroke="#6b4a2a" strokeWidth="2.2" />
      <path d="M0 -14 Q10 -9 1.4 -1.4 Z" fill="#f6efdc" stroke="#8a6a42" strokeWidth="1.6" />
    </g>
    <g stroke="#eaf6f8" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".9">
      <path d="M168 -168 q5 -6 10 0 q5 -6 10 0" />
      <path d="M150 -140 q4 -5 8 0 q4 -5 8 0" opacity=".7" />
    </g>
  </g>;
}

/** The robber piece, drawn as a hooded figure. */
export function RobberPiece({ scale = 1 }: { scale?: number }) {
  return <g transform={`scale(${scale})`} filter="url(#piece-shadow)">
    <ellipse cy="11" rx="10.5" ry="3.6" fill="#20323a" opacity=".35" />
    <path d="M-8 11 -5.4-0.6 A8.6 8.6 0 0 1 -7.4-8.6 A8.6 8.6 0 0 1 7.4-8.6 A8.6 8.6 0 0 1 5.4-0.6 L8 11 Z"
      fill="#3d4d55" stroke="#f4ecd6" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cy="-9.6" r="5.2" fill="#46565e" stroke="#f4ecd6" strokeWidth="1.6" />
    <path d="M-3 -10.4 q3 -2.4 6 0" fill="none" stroke="#f4ecd6" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M-2.4 -7.4 h4.8" stroke="#f4ecd6" strokeWidth="1.2" strokeLinecap="round" opacity=".9" />
  </g>;
}
