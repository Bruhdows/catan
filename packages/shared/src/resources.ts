/** The five resource types of the base game. */
export type Resource = "brick" | "lumber" | "wool" | "grain" | "ore";

export const RESOURCES: readonly Resource[] = ["brick", "lumber", "wool", "grain", "ore"] as const;

export type ResourceHand = Record<Resource, number>;

export function emptyHand(): ResourceHand {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
}

export function handFrom(entries: Partial<ResourceHand>): ResourceHand {
  return { ...emptyHand(), ...entries };
}

export function handTotal(hand: ResourceHand): number {
  let total = 0;
  for (const r of RESOURCES) total += hand[r];
  return total;
}

export function addHands(a: ResourceHand, b: ResourceHand): ResourceHand {
  const out = emptyHand();
  for (const r of RESOURCES) out[r] = a[r] + b[r];
  return out;
}

export function subHands(a: ResourceHand, b: ResourceHand): ResourceHand {
  const out = emptyHand();
  for (const r of RESOURCES) out[r] = a[r] - b[r];
  return out;
}

export function canAfford(hand: ResourceHand, cost: ResourceHand): boolean {
  for (const r of RESOURCES) if (hand[r] < cost[r]) return false;
  return true;
}

export function handEquals(a: ResourceHand, b: ResourceHand): boolean {
  for (const r of RESOURCES) if (a[r] !== b[r]) return false;
  return true;
}

export function isEmptyHand(hand: ResourceHand): boolean {
  return handTotal(hand) === 0;
}

/** Purchase costs (base game). */
export const COSTS = {
  road: handFrom({ brick: 1, lumber: 1 }),
  settlement: handFrom({ brick: 1, lumber: 1, wool: 1, grain: 1 }),
  city: handFrom({ grain: 2, ore: 3 }),
  development: handFrom({ wool: 1, grain: 1, ore: 1 }),
} as const;

/** Official base-game piece limits per player. */
export const PIECE_LIMITS = { roads: 15, settlements: 5, cities: 4 } as const;

/** Official bank supply per resource. */
export const BANK_SUPPLY = 19;

export const RESOURCE_LABELS: Record<Resource, string> = {
  brick: "Brick",
  lumber: "Lumber",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore",
};

/** Terrain that produces each resource. */
export const RESOURCE_TERRAIN: Record<Resource, string> = {
  brick: "hills",
  lumber: "forest",
  wool: "pasture",
  grain: "fields",
  ore: "mountains",
};
