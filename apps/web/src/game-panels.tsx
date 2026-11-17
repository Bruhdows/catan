import { useState } from "react";
import { Check } from "lucide-react";
import { COSTS, PIECE_LIMITS, RESOURCES, canAfford, emptyHand, type DevCardType, type GameCommand, type GameView, type Resource, type ResourceHand, type TradeOffer } from "@hexhaven/shared";
import { Cost, RESOURCE_META, RESOURCE_OPTIONS, PlayerAvatar, PLAYER_COLORS, Stepper } from "./design";
import { DevCardArt, PieceSprite, ResourceIcon } from "./assets/art";
import type { BoardAction } from "./board-view";

type Send = (command: GameCommand) => Promise<boolean>;
const EMPTY = () => emptyHand();
const ANY: ResourceHand = { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 };
const total = (hand: ResourceHand) => RESOURCES.reduce((sum, r) => sum + hand[r], 0);

/* --- Resource tile (a game-card-like chooser) -------------------------------- */

function ResourceTile({ resource, amount, max, onChange, selected, onClick, badge }: {
  resource: Resource; amount?: number; max?: number; onChange?: (v: number) => void;
  selected?: boolean; onClick?: () => void; badge?: string;
}) {
  const body = <>
    <span className="tile-icon"><ResourceIcon resource={resource} size={24} /></span>
    <span className="tile-name">{RESOURCE_META[resource].label}</span>
    {badge && <span className="tile-badge">{badge}</span>}
    {onChange
      ? <Stepper name={RESOURCE_META[resource].label} value={amount ?? 0} max={max ?? 0} onChange={onChange} />
      : <span className={"tile-count" + (amount ? "" : " zero")}>{amount ?? 0}</span>}
  </>;
  if (onClick) {
    return <button type="button" className={"res-tile selectable r-" + resource + (selected ? " selected" : "")}
      aria-pressed={selected} onClick={onClick}>{body}</button>;
  }
  return <div className={"res-tile r-" + resource}>{body}</div>;
}

/* --- Build ------------------------------------------------------------------- */

export function BuildPanel({ game, meId, hand, canBuild, mode, onMode, send }: {
  game: GameView; meId?: string; hand: ResourceHand; canBuild: boolean;
  mode: BoardAction; onMode: (mode: BoardAction) => void; send: Send;
}) {
  const me = game.players.find((p) => p.id === meId);
  const myColor = PLAYER_COLORS[me?.color ?? "ivory"];
  const items = [
    { id: "road", title: "Road", cost: COSTS.road, left: me ? PIECE_LIMITS.roads - me.roads.length : 0 },
    { id: "settlement", title: "Settlement", cost: COSTS.settlement, left: me ? PIECE_LIMITS.settlements - me.settlements.length + me.cities.length : 0 },
    { id: "city", title: "City", cost: COSTS.city, left: me ? PIECE_LIMITS.cities - me.cities.length : 0 },
  ] as const;
  return <div className="panel-content">
    <div className="build-list">
      {items.map((item) => {
        const enabled = canBuild && canAfford(hand, item.cost) && item.left > 0;
        const hint = !canBuild ? "Available after rolling" : item.left === 0 ? "No pieces left" : !canAfford(hand, item.cost) ? "Not enough resources" : undefined;
        return <button type="button" key={item.id}
          className={"build-row" + (mode === item.id ? " picked" : "")}
          disabled={!enabled} aria-pressed={mode === item.id} title={hint ?? item.title}
          onClick={() => onMode(mode === item.id ? null : item.id)}>
          <span className="build-piece"><PieceSprite kind={item.id} color={myColor} size={40} /></span>
          <span className="build-copy">
            <strong>{item.title}</strong>
            <Cost cost={item.cost} hand={hand} size={13} />
          </span>
          <span className="build-left" title={`${item.left} left of ${PIECE_LIMITS[item.id === "road" ? "roads" : item.id === "city" ? "cities" : "settlements"]}`}>{item.left}<i> left</i></span>
          {mode === item.id && <Check size={17} className="build-check" />}
        </button>;
      })}
    </div>
    <button className="buy-dev" disabled={!canBuild || !canAfford(hand, COSTS.development) || game.devDeckCount <= 0}
      onClick={() => void send({ type: "buyDevelopment" })}>
      <span className="buy-dev-art"><DevCardArt type="knight" size={34} /></span>
      <span className="build-copy">
        <strong>Development card</strong>
        <Cost cost={COSTS.development} hand={hand} size={13} />
      </span>
      <span className="build-left">{game.devDeckCount}<i> in deck</i></span>
    </button>
    {mode && <p className="pick-note">Now pick a {mode === "road" ? "glowing edge" : "glowing corner"} on the board{mode === "city" ? "" : ""}.</p>}
    {!canBuild && <p className="pick-note muted">Building unlocks after you roll on your turn.</p>}
  </div>;
}

/* --- Trade --------------------------------------------------------------------- */

function OfferCard({ game, offer, meId, canTrade, send, onCounter }: {
  game: GameView; offer: TradeOffer; meId?: string; canTrade: boolean; send: Send; onCounter: (offer: TradeOffer) => void;
}) {
  const from = game.players.find((p) => p.id === offer.from);
  const to = game.players.find((p) => p.id === offer.to);
  const outgoing = offer.from === meId;
  const counter = offer.counter;
  const give = counter ? counter.give : offer.give;
  const get = counter ? counter.get : offer.get;
  const giveLabel = counter ? (outgoing ? "They give" : "You give") : (outgoing ? "You give" : "You receive");
  const getLabel = counter ? (outgoing ? "You give" : "You receive") : (outgoing ? "You get" : "You give");
  return <div className={"offer" + (counter ? " has-counter" : "")}>
    <div className="offer-head">
      <span className="offer-who">
        {outgoing
          ? <><i>You</i> → <PlayerAvatar color={to!.color} name={to!.name} size="sm" /> {to?.name}</>
          : <><PlayerAvatar color={from!.color} name={from!.name} size="sm" /> {from?.name} → <i>you</i></>}
      </span>
      <span className={"offer-state " + offer.status}>{counter ? "counter" : offer.status}</span>
    </div>
    <div className="offer-exchange">
      <div><small>{giveLabel}</small><HandChips hand={give} /></div>
      <span className="offer-arrow" aria-hidden>→</span>
      <div><small>{getLabel}</small><HandChips hand={get} /></div>
    </div>
    <div className="offer-actions">
      {!outgoing && offer.status === "pending" && !counter && <>
        <button className="button small primary" disabled={!canTrade} onClick={() => void send({ type: "respondTrade", offerId: offer.id, response: "accept" })}>Accept</button>
        <button className="button small ghost" onClick={() => onCounter(offer)}>Counter</button>
        <button className="button small ghost" onClick={() => void send({ type: "respondTrade", offerId: offer.id, response: "decline" })}>Decline</button>
      </>}
      {!outgoing && offer.status === "pending" && counter &&
        <span className="offer-note-text">Your counteroffer awaits their reply.</span>}
      {outgoing && (offer.status === "accepted" || counter) &&
        <button className="button small primary" disabled={!canTrade} onClick={() => void send({ type: "confirmTrade", offerId: offer.id })}>
          {counter ? "Accept counteroffer" : "Complete trade"}
        </button>}
      {outgoing && offer.status === "pending" && !counter && <span className="offer-note-text">Waiting for a reply…</span>}
      {!outgoing && offer.status === "accepted" && <span className="offer-note-text">Waiting for their confirmation.</span>}
      {outgoing && <button className="button small ghost" disabled={!canTrade} onClick={() => void send({ type: "cancelTrade", offerId: offer.id })}>Withdraw</button>}
    </div>
  </div>;
}

function HandChips({ hand }: { hand: ResourceHand }) {
  return <span className="hand-chips">
    {RESOURCES.filter((r) => hand[r] > 0).map((r) =>
      <span key={r} className="chip"><ResourceIcon resource={r} size={13} />{hand[r]}</span>)}
    {total(hand) === 0 && <span className="muted small">—</span>}
  </span>;
}

export function TradePanel({ game, meId, canTrade, hand, send }: {
  game: GameView; meId?: string; canTrade: boolean; hand: ResourceHand; send: Send;
}) {
  const [kind, setKind] = useState<"players" | "bank">("players");
  const [target, setTarget] = useState("");
  const [offer, setOffer] = useState<ResourceHand>(EMPTY);
  const [request, setRequest] = useState<ResourceHand>(EMPTY);
  const [counterId, setCounterId] = useState<string | null>(null);
  const [bankGive, setBankGive] = useState<Resource | null>(null);
  const [bankGet, setBankGet] = useState<Resource | null>(null);

  const others = game.players.filter((p) => p.id !== meId);
  const myOffers = game.offers.filter((o) => o.to === meId || o.from === meId);
  const me = game.players.find((p) => p.id === meId);
  const buildings = [...(me?.settlements ?? []), ...(me?.cities ?? [])];
  const ratioFor = (r: Resource): 2 | 3 | 4 => {
    if (game.board.ports.some((p) => p.resource === r && p.vertices.some((v) => buildings.includes(v)))) return 2;
    if (game.board.ports.some((p) => p.resource === null && p.vertices.some((v) => buildings.includes(v)))) return 3;
    return 4;
  };

  const reset = () => { setCounterId(null); setOffer(EMPTY()); setRequest(EMPTY()); };
  const sendOffer = async () => {
    const ok = counterId
      ? await send({ type: "respondTrade", offerId: counterId, response: "counter", counter: offer, counterGet: request })
      : await send({ type: "offerTrade", to: target, give: offer, get: request });
    if (ok) reset();
  };
  const counter = (o: TradeOffer) => {
    setKind("players"); setCounterId(o.id); setTarget(o.from);
    setOffer({ ...o.get }); setRequest({ ...o.give });
  };
  const canSendOffer = counterId
    ? game.phase === "main" && game.pending.type === "none" && myOffers.some((o) => o.id === counterId && o.to === meId)
    : canTrade;

  return <div className="panel-content">
    <div className="panel-tabs" role="tablist" aria-label="Trade type">
      <button type="button" role="tab" aria-selected={kind === "players"} className={kind === "players" ? "on" : ""} onClick={() => setKind("players")}>Players</button>
      <button type="button" role="tab" aria-selected={kind === "bank"} className={kind === "bank" ? "on" : ""} onClick={() => setKind("bank")}>Bank &amp; harbors</button>
    </div>

    {myOffers.length > 0 && <div className="offers-block">
      {myOffers.slice().sort((a, b) =>
        Number(b.to === meId && b.status === "pending" && !b.counter) - Number(a.to === meId && a.status === "pending" && !a.counter))
        .map((o) => <OfferCard key={o.id} game={game} offer={o} meId={meId} canTrade={canTrade} send={send} onCounter={counter} />)}
    </div>}

    {kind === "players" ? <>
      <div className="trader-row" role="radiogroup" aria-label="Trade with">
        {others.map((p) =>
          <button key={p.id} role="radio" aria-checked={target === p.id}
            className={"trader" + (target === p.id ? " picked" : "")}
            disabled={Boolean(counterId)}
            onClick={() => setTarget(counterId ? target : p.id)}>
            <PlayerAvatar color={p.color} name={p.name} size="md" />
            <span>{p.name}</span>
          </button>)}
      </div>
      <div className="trade-side give">
        <span className="trade-side-label">You give</span>
        <div className="tile-row">
          {RESOURCES.map((r) =>
            <ResourceTile key={r} resource={r} amount={offer[r]} max={hand[r]} onChange={(v) => setOffer({ ...offer, [r]: v })} />)}
        </div>
      </div>
      <div className="trade-arrow" aria-hidden>↓</div>
      <div className="trade-side get">
        <span className="trade-side-label">You receive</span>
        <div className="tile-row">
          {RESOURCES.map((r) =>
            <ResourceTile key={r} resource={r} amount={request[r]} max={ANY[r]} onChange={(v) => setRequest({ ...request, [r]: v })} />)}
        </div>
      </div>
      <button className="button primary full" disabled={!canSendOffer || !target || !total(offer) || !total(request)} onClick={() => void sendOffer()}>
        {counterId ? "Send counteroffer" : "Propose trade"}
      </button>
      {counterId && <button className="button ghost full" onClick={reset}>Cancel counteroffer</button>}
    </> : <>
      <p className="bank-hint">Pick what you sell, then what you take. Your best ratio is shown on each tile.</p>
      <div className="trade-side give">
        <span className="trade-side-label">You give</span>
        <div className="tile-row">
          {RESOURCES.map((r) => {
            const ratio = ratioFor(r);
            return <ResourceTile key={r} resource={r} amount={hand[r]}
              selected={bankGive === r} badge={ratio + ":1"}
              onClick={() => setBankGive(bankGive === r ? null : r)} />;
          })}
        </div>
      </div>
      <div className="trade-arrow" aria-hidden>→</div>
      <div className="trade-side get">
        <span className="trade-side-label">You receive</span>
        <div className="tile-row">
          {RESOURCES.map((r) =>
            <ResourceTile key={r} resource={r} amount={game.bank[r]}
              selected={bankGet === r} onClick={() => setBankGet(bankGet === r ? null : r)} />)}
        </div>
      </div>
      <button className="button primary full"
        disabled={!canTrade || !bankGive || !bankGet || bankGive === bankGet || hand[bankGive] < ratioFor(bankGive) || game.bank[bankGet] < 1}
        onClick={() => bankGive && bankGet && void send({ type: "bankTrade", give: bankGive, get: bankGet })}>
        {bankGive && bankGet ? `Trade ${ratioFor(bankGive)} ${RESOURCE_META[bankGive].label} for 1 ${RESOURCE_META[bankGet].label}` : "Trade with the bank"}
      </button>
    </>}
  </div>;
}

/* --- Development cards ---------------------------------------------------------- */

const CARD_INFO: Record<DevCardType, { title: string; note: string }> = {
  knight: { title: "Knight", note: "Move the robber and steal a resource" },
  roadBuilding: { title: "Road Building", note: "Place two roads for free" },
  yearOfPlenty: { title: "Year of Plenty", note: "Take any two resources from the bank" },
  monopoly: { title: "Monopoly", note: "Take one resource type from every player" },
  victoryPoint: { title: "Victory Point", note: "One hidden point toward victory" },
};

export function CardsPanel({ game, meId, canPlay, send }: {
  game: GameView; meId?: string; canPlay: boolean; send: Send;
}) {
  const [choosing, setChoosing] = useState<string | null>(null);
  const [first, setFirst] = useState<Resource>("brick");
  const [second, setSecond] = useState<Resource>("grain");
  const cards = game.you?.devCards ?? [];
  const play = async (type: DevCardType) => {
    if (type === "knight") await send({ type: "playKnight" });
    if (type === "roadBuilding") await send({ type: "playRoadBuilding" });
    if (type === "monopoly") await send({ type: "playMonopoly", resource: first });
    if (type === "yearOfPlenty") {
      const hand = EMPTY();
      hand[first]++;
      hand[second]++;
      await send({ type: "playYearOfPlenty", resources: hand });
    }
    setChoosing(null);
  };
  return <div className="panel-content">
    {cards.length === 0 && <div className="dev-empty">
      <span className="dev-empty-icon" aria-hidden="true"><DevCardArt type="knight" size={38} /></span>
      <strong>No development cards</strong>
      <p>Buy one from Build when you have wool, grain and ore.</p>
    </div>}
    <div className="dev-cards">
      {cards.map((card) => {
        const info = CARD_INFO[card.type];
        const locked = card.boughtTurn >= game.turnCount;
        const usable = canPlay && !locked && card.type !== "victoryPoint";
        return <div key={card.id} className={"dev-card" + (locked ? " locked" : "")}>
          <span className={"dev-card-face face-" + card.type}><DevCardArt type={card.type} size={40} /></span>
          <span className="dev-card-copy">
            <strong>{info.title}</strong>
            <small>{locked ? "Playable on your next turn" : info.note}</small>
          </span>
          {card.type !== "victoryPoint" &&
            <button className="button small" disabled={!usable}
              onClick={() => {
                if (card.type === "monopoly" || card.type === "yearOfPlenty") setChoosing(choosing === card.id ? null : card.id);
                else void play(card.type);
              }}>
              {choosing === card.id ? "Close" : "Play"}
            </button>}
          {card.type === "victoryPoint" && <span className="vp-tag">+1 VP</span>}
          {choosing === card.id && <div className="dev-choose">
            {card.type === "monopoly"
              ? <p className="pick-note">Take every <b>{RESOURCE_META[first].label}</b> from all players:</p>
              : <p className="pick-note">First: <b>{RESOURCE_META[first].label}</b> · Second: <b>{RESOURCE_META[second].label}</b></p>}
            <div className="chip-row">
              {RESOURCES.map((r) =>
                <button key={r} className={"chip r-" + r + (first === r ? " picked" : "")} onClick={() => setFirst(r)}>
                  <ResourceIcon resource={r} size={14} /> {RESOURCE_META[r].label}
                </button>)}
            </div>
            {card.type === "yearOfPlenty" && first === second &&
              <p className="pick-note muted">Both picks are {RESOURCE_META[second].label} — pick a different resource below, or keep two of the same if the bank allows.</p>}
            {card.type === "yearOfPlenty" && <div className="chip-row">
              {RESOURCES.map((r) =>
                <button key={r} className={"chip r-" + r + (second === r ? " picked" : "")} onClick={() => setSecond(r)}>
                  <ResourceIcon resource={r} size={14} /> {RESOURCE_META[r].label}
                </button>)}
            </div>}
            <button className="button primary full"
              disabled={card.type === "yearOfPlenty" && (game.bank[first] < 1 || game.bank[second] < (first === second ? 2 : 1))}
              onClick={() => void play(card.type)}>Confirm</button>
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

/* --- History ---------------------------------------------------------------------- */

export function HistoryPanel({ game }: { game: GameView }) {
  return <div className="panel-content">
    <ol className="log-list">
      {game.log.slice().reverse().map((entry, index) =>
        <li key={entry.rev + "-" + index} className={"log-entry tone-" + (entry.tone ?? "system")}>
          <span className="log-turn">T{entry.turn}</span>
          <p>{entry.text}</p>
        </li>)}
    </ol>
  </div>;
}

/* --- Discard ------------------------------------------------------------------------ */

export function DiscardPicker({ hand, count, send }: { hand: ResourceHand; count: number; send: Send }) {
  const [selection, setSelection] = useState<ResourceHand>(EMPTY);
  return <div className="discard-picker">
    <div className="tile-row">
      {RESOURCES.map((r) =>
        <ResourceTile key={r} resource={r} amount={selection[r]} max={hand[r]} onChange={(v) => setSelection({ ...selection, [r]: v })} />)}
    </div>
    <div className="discard-foot">
      <span className={total(selection) === count ? "ok" : ""}>{total(selection)} of {count} chosen</span>
      <button className="button primary" disabled={total(selection) !== count}
        onClick={async () => { if (await send({ type: "discard", resources: selection })) setSelection(EMPTY()); }}>
        Discard {count} cards
      </button>
    </div>
  </div>;
}
