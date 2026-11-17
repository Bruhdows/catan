import React from "react";
/**
 * Hexhaven's original game-asset family.
 *
 * Resource, piece, award and development-card artwork is drawn here as SVG so
 * every widget in the game shares one illustrated language. Lucide is only
 * used for generic interface controls (close, copy, zoom, sound).
 */
import type { DevCardType, Resource } from "@hexhaven/shared";

const RES: Record<Resource, { fill: string; deep: string }> = {
  brick: { fill: "#cd6f4e", deep: "#96452c" },
  lumber: { fill: "#569361", deep: "#2f6b40" },
  wool: { fill: "#8fae56", deep: "#647d35" },
  grain: { fill: "#dfab41", deep: "#a3752a" },
  ore: { fill: "#7489a6", deep: "#4d617e" },
};

/** Resource emblems — recognizable as filled shapes down to ~12px. */
export function ResourceIcon({ resource, size = 18, className = "" }: {
  resource: Resource; size?: number; className?: string;
}) {
  const { fill, deep } = RES[resource];
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", className,
    "aria-hidden": true as const,
  };
  switch (resource) {
    case "brick":
      return <svg {...common}>
        <g fill={fill} stroke={deep} strokeWidth="1.6" strokeLinejoin="round">
          <rect x="2.5" y="5" width="9" height="5.4" rx="1" />
          <rect x="12.5" y="5" width="9" height="5.4" rx="1" />
          <rect x="7" y="11.3" width="10" height="5.4" rx="1" />
          <rect x="2.5" y="17.6" width="9" height="4.4" rx="1" />
          <rect x="12.5" y="17.6" width="9" height="4.4" rx="1" />
        </g>
      </svg>;
    case "lumber":
      return <svg {...common}>
        <rect x="2" y="8.5" width="17" height="8" rx="4" fill={fill} stroke={deep} strokeWidth="1.6" />
        <ellipse cx="18.5" cy="12.5" rx="4.2" ry="4.6" fill="#e8d3a8" stroke={deep} strokeWidth="1.6" />
        <ellipse cx="18.5" cy="12.5" rx="2" ry="2.3" fill="none" stroke={deep} strokeWidth="1.2" />
        <path d="M6 10.5c2 .9 4.5.9 7 0M6 14.6c2 .9 4.5.9 7 0" fill="none" stroke={deep} strokeWidth="1.3" strokeLinecap="round" />
      </svg>;
    case "wool":
      return <svg {...common}>
        <circle cx="10.5" cy="12" r="7.5" fill="#f2ecdb" stroke="#9a916f" strokeWidth="1.6" />
        <path d="M5 14.5c1.8-1.4 3.4-1.2 5-2.6 1.6-1.4 1.4-3.4 3.2-4.4M5.6 9.8c2.4.2 3.6 1.6 5.6 1.4 2-.2 2.6-2 4.8-2M9.4 18.6c.4-2.2 2-3 3.4-4.8"
          fill="none" stroke="#b7ad88" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="17" cy="15" r="3.6" fill={fill} stroke={deep} strokeWidth="1.6" />
        <circle cx="16" cy="14.2" r=".7" fill="#33291e" />
      </svg>;
    case "grain":
      return <svg {...common}>
        <path d="M12 21V8" stroke={deep} strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 8c0-2.6.8-4.4 2.6-5.6C15.8 4 15.6 6.4 13.6 7.6" fill={fill} stroke={deep} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M12 8c0-2.6-.8-4.4-2.6-5.6C8.2 4 8.4 6.4 10.4 7.6" fill={fill} stroke={deep} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M12 13c-2.6 0-4.4-1-5.6-2.8 2-.9 4.4-.4 5.6 1.2M12 13c2.6 0 4.4-1 5.6-2.8-2-.9-4.4-.4-5.6 1.2M12 17.4c-2.4-.2-4-1.2-5-2.8 1.9-.7 4 0 5 1.6M12 17.4c2.4-.2 4-1.2 5-2.8-1.9-.7-4 0-5 1.6"
          fill={fill} stroke={deep} strokeWidth="1.3" strokeLinejoin="round" />
      </svg>;
    case "ore":
      return <svg {...common}>
        <g fill={fill} stroke={deep} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M8 20 5.4 12.6 9 8.4l3 4.2L10 20Z" />
          <path d="m10 20 2-7.4L16.4 9l3.4 5-2.4 6Z" opacity=".85" />
          <path d="M9 8.4 12.6 5l3.8 4-3.4 2.6" opacity=".95" />
        </g>
        <path d="M6.6 12.4 9 8.6M13 11.8l3-2.4" stroke="#ffffff" strokeOpacity=".5" strokeWidth="1.1" strokeLinecap="round" />
      </svg>;
  }
}

/* --- Pieces (interface-size versions of the board sprites) ------------------ */

export function PieceSprite({ kind, color, size = 44 }: {
  kind: "road" | "settlement" | "city"; color: string; size?: number;
}) {
  return <svg width={size} height={size} viewBox="-24 -26 48 48" aria-hidden="true">
    <ellipse cx="0" cy="16" rx="14" ry="4" fill="#33291e" opacity=".22" />
    {kind === "road" && <g>
      <line x1="-18" y1="10" x2="18" y2="-8" stroke="#4a3826" strokeWidth="13" strokeLinecap="round" />
      <line x1="-18" y1="10" x2="18" y2="-8" stroke={color} strokeWidth="9" strokeLinecap="round" />
      <line x1="-16" y1="9.2" x2="4" y2="-1.4" stroke="#ffffff" strokeOpacity=".35" strokeWidth="2.4" strokeLinecap="round" />
    </g>}
    {kind === "settlement" && <g>
      <path d="M-11 12V-2L0-14 11-2V12Z" fill={color} stroke="#3a2c1c" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M-11-2 0-14 11-2" fill="none" stroke="#3a2c1c" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="-3.4" y="1" width="6.8" height="11" rx="1.2" fill="#3a2c1c" opacity=".55" />
      <rect x="4" y="4" width="4" height="4" rx="1" fill="#fff" opacity=".5" />
    </g>}
    {kind === "city" && <g>
      <path d="M-16 12V-3l6-4v-4l6 4 6 4 2-3v18Z" fill={color} stroke="#3a2c1c" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M-16-3l6-4v-4l6 4" fill="none" stroke="#3a2c1c" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="-10" y="2" width="6.4" height="10" rx="1.2" fill="#3a2c1c" opacity=".55" />
      <rect x="2" y="2" width="5" height="5" rx="1" fill="#fff" opacity=".5" />
      <rect x="9" y="6" width="5" height="6" rx="1" fill="#fff" opacity=".4" />
    </g>}
  </svg>;
}

/* --- Awards ----------------------------------------------------------------- */

export function AwardIcon({ award, size = 16 }: { award: "longestRoad" | "largestArmy"; size?: number }) {
  if (award === "longestRoad") {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 19c4-1 4-6 8-7s6-4 7-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M3 19c4-1 4-6 8-7s6-4 7-9" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1" strokeLinecap="round" />
      <circle cx="3" cy="19" r="2.4" fill="currentColor" />
      <circle cx="18" cy="3" r="2.4" fill="currentColor" />
    </svg>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z" fill="currentColor" opacity=".3" />
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="m9 13 6-6M9 13l-2 .8.8-2.4M15 7l2.4-.8-.8 2.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/* --- Development cards ------------------------------------------------------- */

export function DevCardArt({ type, size = 46 }: { type: DevCardType; size?: number }) {
  const ink = "#5d4326";
  function art() {
    switch (type) {
      case "knight":
        return <g>
          <path d="M-12 14V2C-12-8-7-14 0-14s12 6 12 16v12Z" fill="#9aa7b4" stroke={ink} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M-12 4c8-3.4 16-3.4 24 0" fill="none" stroke={ink} strokeWidth="2" />
          <path d="M-4 14v-6h8v6" fill="#5d6b7a" stroke={ink} strokeWidth="2" />
          <path d="M0-14c-2-4 2-8 6-8-1 3 0 5 2 6-3 2-6 2-8 2Z" fill="#c8452f" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        </g>;
      case "roadBuilding":
        return <g>
          <path d="M-16 12 0-14l16 26" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M-13.4 12 0-8.6 13.4 12" fill="none" stroke="#d8a648" strokeWidth="4.6" strokeLinecap="round" strokeDasharray="6.5 7" />
        </g>;
      case "yearOfPlenty":
        return <g>
          <path d="M-14 10C-16-2-8-14 8-14c8 0 10 4 10 8-8 0-10 4-10 8 0 4-4 8-10 8-4 0-9-1-12 0Z" fill="#c8963f" stroke={ink} strokeWidth="2.3" strokeLinejoin="round" />
          <circle cx="2" cy="4" r="4" fill="#a9482f" stroke={ink} strokeWidth="1.8" />
          <circle cx="-3" cy="-2" r="3.4" fill="#7d9c4c" stroke={ink} strokeWidth="1.8" />
        </g>;
      case "monopoly":
        return <g>
          <ellipse cx="0" cy="10" rx="13" ry="5" fill="#c8963f" stroke={ink} strokeWidth="2.2" />
          <ellipse cx="0" cy="1" rx="13" ry="5" fill="#e0b25c" stroke={ink} strokeWidth="2.2" />
          <ellipse cx="0" cy="-8" rx="13" ry="5" fill="#f0d18a" stroke={ink} strokeWidth="2.2" />
          <path d="M-4-11v6M4-11v6" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
        </g>;
      case "victoryPoint":
        return <g>
          <path d="M0-15 4.4-5.6 14-4l-7 6.6L8.8 12 0 7.4-8.8 12l1.8-9.4L-14-4l9.6-1.6Z" fill="#e3b23f" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
        </g>;
    }
    return null;
  }
  return <svg width={size} height={size} viewBox="-17 -18 34 36" aria-hidden="true">{art()}</svg>;
}

export const DEV_CARD_INK: Record<DevCardType, string> = {
  knight: "#7d6ea8",
  roadBuilding: "#5d8a4a",
  yearOfPlenty: "#a3762c",
  monopoly: "#b3812f",
  victoryPoint: "#8a6a2a",
};

/* --- Dice -------------------------------------------------------------------- */

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** A single die face drawn with pips. */
export function DiceFace({ value, size = 40, rolling = false }: {
  value: number; size?: number; rolling?: boolean;
}) {
  const r = size * 0.26;
  return <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true" className={rolling ? "die rolling" : "die"}>
    <rect x="-18" y="-18" width="36" height="36" rx="9" fill="#fbf5e4" stroke="#d8c69b" strokeWidth="2" />
    <rect x="-18" y="-18" width="36" height="36" rx="9" fill="none" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1.4" strokeDasharray="3 5" />
    {PIP_POSITIONS[value]?.map(([px, py], i) =>
      <circle key={i} cx={px * r} cy={py * r} r={size * 0.075} fill={value === 1 ? "#c8452f" : "#4a3b28"} />)}
  </svg>;
}
