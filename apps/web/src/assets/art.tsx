/** Board and resource art share a single locally bundled, original raster style. */
import type { DevCardType, Resource } from "@hexhaven/shared";

/**
 * CC0 Kenney raster art. Gameplay widgets use the same locally bundled
 * sprites as the board (see /public/art/LICENSES.md).
 */
export const RESOURCE_ART: Record<Resource, string> = {
  brick: "/art/resources/brick.webp",
  lumber: "/art/resources/lumber.webp",
  wool: "/art/resources/wool.webp",
  grain: "/art/resources/grain.webp",
  ore: "/art/resources/ore.webp",
};

export function ResourceIcon({ resource, size = 18, className = "" }: {
  resource: Resource; size?: number; className?: string;
}) {
  return <img src={RESOURCE_ART[resource]} width={size} height={size}
    style={{ width: size, height: size, objectFit: "contain" }} alt="" aria-hidden="true" className={className} />;
}

const PIECE_SWATCHES: Record<string, string> = {
  "#d24b40": "crimson", "#2f7fc9": "azure", "#dd922b": "amber",
  "#efe6d0": "ivory", "#39946e": "emerald", "#9162c8": "violet",
  "#13a7b2": "teal", "#db6294": "rose",
};
export function pieceSpriteSrc(kind: "road" | "settlement" | "city", color: string): string {
  return `/art/pieces/${kind}-${PIECE_SWATCHES[color.toLowerCase()] ?? "neutral"}.webp`;
}

export function PieceSprite({ kind, color, size = 44 }: {
  kind: "road" | "settlement" | "city"; color: string; size?: number;
}) {
  return <img src={pieceSpriteSrc(kind, color)} width={size} height={size}
    style={{ width: size, height: size, objectFit: "contain" }} alt="" aria-hidden="true" />;
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

/** CC0 Kenney dice silhouettes, shaded into a raised ivory tabletop set. */
export function DiceFace({ value, size = 40, rolling = false }: {
  value: number; size?: number; rolling?: boolean;
}) {
  return <img src={`/art/dice/die-${Math.max(1, Math.min(6, Math.floor(value)))}.png`}
    width={size} height={size} alt="" aria-hidden="true"
    className={rolling ? "die rolling" : "die"}
    style={{ objectFit: "contain" }} />;
}
