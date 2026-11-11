import { BrickWall, ChevronDown, Cloud, Mountain, Trees, Wheat, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { RESOURCES, type PlayerColor, type Resource, type ResourceHand } from "@hexhaven/shared";

export const PLAYER_COLORS: Record<PlayerColor, string> = {
  crimson: "#ed7167",
  azure: "#448fdf",
  amber: "#e8a83c",
  ivory: "#c9c6e8",
};

export const RESOURCE_META: Record<Resource, { label: string; short: string; icon: LucideIcon }> = {
  brick: { label: "Brick", short: "Brick", icon: BrickWall },
  lumber: { label: "Lumber", short: "Wood", icon: Trees },
  wool: { label: "Wool", short: "Wool", icon: Cloud },
  grain: { label: "Grain", short: "Grain", icon: Wheat },
  ore: { label: "Ore", short: "Ore", icon: Mountain },
};

export function ResourceIcon({ resource, size = 18, className = "" }: { resource: Resource; size?: number; className?: string }) {
  const Icon = RESOURCE_META[resource].icon;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" className={className}/>;
}

export function PlayerAvatar({ name, color, size = "md" }: { name: string; color: PlayerColor; size?: "sm" | "md" | "lg" }) {
  return <span aria-hidden="true" className={"player-avatar player-avatar-" + size} style={{ background: PLAYER_COLORS[color] }}>
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
      <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={16} strokeWidth={2} aria-hidden="true"/>
    </span>
    {description && <small className="field-description">{description}</small>}
  </label>;
}

export const RESOURCE_OPTIONS = RESOURCES.map(resource => ({ value: resource, label: RESOURCE_META[resource].label }));

export function ResourceToken({ resource, amount, owned, compact = false }: {
  resource: Resource; amount?: number; owned?: number; compact?: boolean;
}) {
  return <span className={"resource-token resource-" + resource + (compact ? " resource-token-compact" : "") + (owned !== undefined && amount !== undefined && owned < amount ? " insufficient" : "")}
    title={RESOURCE_META[resource].label + (amount !== undefined ? ": " + amount : "")}>
    <ResourceIcon resource={resource} size={compact ? 13 : 16}/>
    {amount !== undefined && <b>{amount}</b>}
    {!compact && <span>{RESOURCE_META[resource].short}</span>}
  </span>;
}

export function Cost({ hand, cost }: { hand?: ResourceHand; cost: ResourceHand }) {
  return <span className="cost-pills">
    {RESOURCES.filter(r => cost[r] > 0).map(r => <ResourceToken key={r} resource={r} amount={cost[r]} owned={hand?.[r]} compact />)}
  </span>;
}

export function Hint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="hint">
    <span className="hint-icon">{icon}</span>
    <div><strong>{title}</strong><p>{children}</p></div>
  </div>;
}

export function Stepper({ name, value, max, onChange }: { name: string; value: number; max: number; onChange: (value: number) => void }) {
  return <div className="stepper">
    <button type="button" aria-label={"Remove " + name} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
    <output aria-label={name + " quantity"}>{value}</output>
    <button type="button" aria-label={"Add " + name} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
  </div>;
}
