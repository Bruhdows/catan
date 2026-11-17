/** Shared game widgets: player colors, avatars, selects, resource costs. */
import { ChevronDown } from "lucide-react";
import { RESOURCES, type PlayerColor, type Resource, type ResourceHand } from "@hexhaven/shared";
import { ResourceIcon } from "./assets/art";

export const PLAYER_COLORS: Record<PlayerColor, string> = {
  crimson: "#d24b40",
  azure: "#2f7fc9",
  amber: "#dd922b",
  ivory: "#efe6d0",
  emerald: "#39946e",
  violet: "#9162c8",
};

export const RESOURCE_META: Record<Resource, { label: string }> = {
  brick: { label: "Brick" },
  lumber: { label: "Lumber" },
  wool: { label: "Wool" },
  grain: { label: "Grain" },
  ore: { label: "Ore" },
};

export const RESOURCE_OPTIONS = RESOURCES.map((resource) => ({
  value: resource,
  label: RESOURCE_META[resource].label,
}));

export function PlayerAvatar({ name, color, size = "md" }: {
  name: string; color: PlayerColor; size?: "sm" | "md" | "lg";
}) {
  return <span aria-hidden="true" className={"player-avatar player-avatar-" + size}
    style={{ background: PLAYER_COLORS[color] }}>
    {name.slice(0, 1).toUpperCase()}
  </span>;
}

export function FieldSelect({ label, value, options, onChange, disabled = false, id, description }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  description?: string;
}) {
  return <label className="field">
    <span className="field-label">{label}</span>
    <span className="select-wrap">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
    </span>
    {description && <small className="small muted">{description}</small>}
  </label>;
}

/** Cost display: the resources a building needs, dimmed when unaffordable. */
export function Cost({ hand, cost, size = 14 }: { hand?: ResourceHand; cost: ResourceHand; size?: number }) {
  return <span className="cost-chips">
    {RESOURCES.filter((r) => cost[r] > 0).map((r) =>
      <span key={r} className={"cost-chip" + (hand && hand[r] < cost[r] ? " lacking" : "")}>
        <ResourceIcon resource={r} size={size} />
        <b>{cost[r]}</b>
      </span>)}
  </span>;
}

export function Stepper({ name, value, max, onChange }: {
  name: string; value: number; max: number; onChange: (value: number) => void;
}) {
  return <div className="stepper">
    <button type="button" aria-label={"Remove " + name} disabled={value <= 0}
      onClick={() => onChange(Math.max(0, value - 1))}>−</button>
    <output aria-label={name + " quantity"}>{value}</output>
    <button type="button" aria-label={"Add " + name} disabled={value >= max}
      onClick={() => onChange(Math.min(max, value + 1))}>+</button>
  </div>;
}
