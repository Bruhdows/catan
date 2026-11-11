import { useState } from "react";
import { Check, CircleHelp, Coins, Crown, Dices, House, Landmark, MapPinned, Mountain, Route, ScrollText, Shield, Swords, Wheat, Users } from "lucide-react";
import { COSTS, RESOURCES, canAfford, emptyHand, type DevCardType, type GameCommand, type GameView, type Resource, type ResourceHand, type TradeOffer } from "@hexhaven/shared";
import { Cost, FieldSelect, Hint, RESOURCE_META, RESOURCE_OPTIONS, ResourceIcon, ResourceToken, Stepper, PlayerAvatar } from "./design";
import type { BoardAction } from "./board-view";

type Send = (command: GameCommand) => Promise<boolean>;
const EMPTY = () => emptyHand();
const MAX: ResourceHand = { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 };
const total = (hand: ResourceHand) => RESOURCES.reduce((sum, r) => sum + hand[r], 0);

export function BuildPanel({ game, meId, hand, canBuild, mode, onMode, send }: {
  game: GameView; meId?: string; hand: ResourceHand; canBuild: boolean;
  mode: BoardAction; onMode: (mode: BoardAction) => void; send: Send;
}) {
  const me = game.players.find(p => p.id === meId);
  const items = [
    { id: "road", title: "Road", sub: "Extend your network", cost: COSTS.road, count: me?.pieces.roads ?? 0, icon: Route },
    { id: "settlement", title: "Settlement", sub: "+1 point · collect resources", cost: COSTS.settlement, count: me?.pieces.settlements ?? 0, icon: House },
    { id: "city", title: "City", sub: "+2 points · double production", cost: COSTS.city, count: me?.pieces.cities ?? 0, icon: Crown },
  ] as const;
  return <div className="panel-content">
    <Hint icon={<MapPinned size={20}/>} title="Build on the island">
      Choose a piece, then click a glowing spot on the board.
    </Hint>
    <div className="build-options">{items.map(item => {
      const Icon = item.icon;
      const enabled = canBuild && canAfford(hand, item.cost) && item.count > 0;
      return <button type="button" key={item.id} className={"build-option " + (mode === item.id ? "is-selected" : "")}
        disabled={!enabled} aria-pressed={mode===item.id} onClick={()=>onMode(mode===item.id ? null : item.id)}>
        <span className={"piece-illustration piece-"+item.id}><Icon size={27} strokeWidth={2.2}/></span>
        <span className="build-option-copy"><strong>{item.title}</strong><small>{item.sub} · {item.count} left</small><Cost cost={item.cost} hand={hand}/></span>
        {mode===item.id && <Check size={19} className="build-selected-icon"/>}
      </button>;
    })}</div>
    <div className="panel-divider"/>
    <div className="panel-row-title"><span>Development card</span><small>{game.devDeckCount} left</small></div>
    <button className="buy-dev-button" disabled={!canBuild || !canAfford(hand,COSTS.development) || game.devDeckCount<=0} onClick={()=>void send({type:"buyDevelopment"})}>
      <ScrollText size={23}/><span><strong>Buy a mystery card</strong><Cost hand={hand} cost={COSTS.development}/></span><span className="buy-dev-arrow">+</span>
    </button>
    {!canBuild && <p className="muted small">Building is available after rolling, on your turn.</p>}
  </div>;
}

function QuantityPicker({ label, hand, max, onChange }: {
  label: string; hand: ResourceHand; max: ResourceHand; onChange: (next: ResourceHand) => void;
}) {
  return <div className="quantity-picker"><p className="picker-title">{label}</p>{RESOURCES.map(r =>
    <div className={"quantity-row resource-"+r} key={r}><span className="quantity-icon"><ResourceIcon resource={r} size={18}/></span><span className="quantity-name">{RESOURCE_META[r].label}</span><Stepper name={RESOURCE_META[r].label} value={hand[r]} max={max[r]} onChange={value=>onChange({...hand,[r]:value})}/></div>
  )}</div>;
}

function HandSummary({hand}:{hand:ResourceHand}) {
  return <span className="trade-hand-summary">{RESOURCES.filter(r=>hand[r]>0).map(r=><ResourceToken key={r} resource={r} amount={hand[r]} compact/>)}{total(hand)===0&&<span>Nothing</span>}</span>;
}

function OfferCard({ game, offer, meId, canTrade, send, onCounter }: {
  game: GameView; offer: TradeOffer; meId?: string; canTrade: boolean; send: Send; onCounter: (offer:TradeOffer)=>void;
}) {
  const from=game.players.find(p=>p.id===offer.from);
  const to=game.players.find(p=>p.id===offer.to);
  const outgoing=offer.from===meId;
  const counter=offer.counter;
  return <div className="offer-card">
    <div className="offer-header"><span className="offer-direction">{outgoing?"You → "+to?.name:from?.name+" → You"}</span><span className={"offer-status "+(offer.status==="accepted"?"accepted":"")}>{counter?"Counteroffer":offer.status}</span></div>
    <div className="offer-exchange"><div><small>{counter?"They give":outgoing?"You give":"They give"}</small><HandSummary hand={counter?counter.give:offer.give}/></div><span className="exchange-arrows">⇄</span><div><small>{counter?"You give":outgoing?"You get":"You give"}</small><HandSummary hand={counter?counter.get:offer.get}/></div></div>
    <div className="offer-actions">
      {!outgoing&&offer.status==="pending"&&!counter&&<>
        <button className="button primary small" onClick={()=>void send({type:"respondTrade",offerId:offer.id,response:"accept"})}>Accept</button>
        <button className="button secondary small" onClick={()=>onCounter(offer)}>Counter</button>
        <button className="button ghost small" onClick={()=>void send({type:"respondTrade",offerId:offer.id,response:"decline"})}>Decline</button>
      </>}
      {outgoing&&(offer.status==="accepted"||counter)&&<button disabled={!canTrade} className="button primary small" onClick={()=>void send({type:"confirmTrade",offerId:offer.id})}>{counter?"Accept counter":"Complete trade"}</button>}
      {outgoing&&<button disabled={!canTrade} className="button ghost small" onClick={()=>void send({type:"cancelTrade",offerId:offer.id})}>Withdraw</button>}
      {outgoing&&offer.status==="pending"&&!counter&&<span className="muted small">Waiting for reply…</span>}
      {!outgoing&&offer.status==="accepted"&&<span className="muted small">Waiting for their confirmation.</span>}
    </div>
  </div>;
}

export function TradePanel({game,meId,canTrade,hand,send}:{
  game:GameView;meId?:string;canTrade:boolean;hand:ResourceHand;send:Send;
}) {
  const [kind,setKind]=useState<"players"|"bank">("players");
  const [target,setTarget]=useState("");
  const [offer,setOffer]=useState<ResourceHand>(EMPTY);
  const [request,setRequest]=useState<ResourceHand>(EMPTY);
  const [counterId,setCounterId]=useState<string|null>(null);
  const [giveBank,setGiveBank]=useState<Resource>("brick");
  const [getBank,setGetBank]=useState<Resource>("lumber");
  const others=game.players.filter(p=>p.id!==meId);
  const myOffers=game.offers.filter(o=>o.to===meId||o.from===meId);
  const me=game.players.find(p=>p.id===meId);
  const buildings=[...(me?.settlements??[]),...(me?.cities??[])];
  const ratio=game.board.ports.some(p=>p.resource===giveBank&&p.vertices.some(v=>buildings.includes(v)))?2:
    game.board.ports.some(p=>p.resource===null&&p.vertices.some(v=>buildings.includes(v)))?3:4;

  const reset=()=>{setCounterId(null);setOffer(EMPTY());setRequest(EMPTY());};
  const sendOffer=async()=>{
    const ok=counterId
      ? await send({type:"respondTrade",offerId:counterId,response:"counter",counter:offer,counterGet:request})
      : await send({type:"offerTrade",to:target,give:offer,get:request});
    if(ok)reset();
  };
  const counter=(o:TradeOffer)=>{setKind("players");setCounterId(o.id);setTarget(o.from);setOffer({...o.get});setRequest({...o.give});};
  const offersWaiting=myOffers.some(o=>o.to===meId&&o.status==="pending"&&!o.counter);
  return <div className="panel-content">
    <div className="switcher" role="tablist" aria-label="Trade type"><button type="button" role="tab" aria-selected={kind==="players"} className={kind==="players"?"selected":""} onClick={()=>setKind("players")}><Users size={16}/> Players</button><button type="button" role="tab" aria-selected={kind==="bank"} className={kind==="bank"?"selected":""} onClick={()=>setKind("bank")}><Landmark size={16}/> Bank & ports</button></div>
    {offersWaiting&&<span className="incoming-banner">You have a trade offer waiting below.</span>}
    {kind==="players"?<>
      <FieldSelect label="Trade with" value={target} onChange={setTarget} disabled={Boolean(counterId)} options={[{value:"",label:"Choose a player" },...others.map(p=>({value:p.id,label:p.name}))]}/>
      <div className="trade-columns"><QuantityPicker label="YOU GIVE" hand={offer} max={hand} onChange={setOffer}/><QuantityPicker label="YOU GET" hand={request} max={MAX} onChange={setRequest}/></div>
      <button className="button primary full" disabled={!canTrade||!target||!total(offer)||!total(request)} onClick={()=>void sendOffer()}><Coins size={17}/>{counterId?"Send counteroffer":"Propose trade"}</button>
      {counterId&&<button className="button ghost full" onClick={reset}>Cancel counter</button>}
      <p className="muted small">Both players must agree on the exact resources before the exchange is completed.</p>
    </>:<>
      <Hint title="Maritime trade" icon={<Landmark size={20}/>}>Trade four matching cards for one, or use a better harbor rate if you have a port.</Hint>
      <FieldSelect label="Give to the bank" value={giveBank} onChange={v=>setGiveBank(v as Resource)} options={RESOURCE_OPTIONS}/>
      <div className="bank-ratio"><ResourceToken resource={giveBank} amount={ratio}/><span className="bank-arrow">→</span><strong>1 resource</strong></div>
      <FieldSelect label="Get from the bank" value={getBank} onChange={v=>setGetBank(v as Resource)} options={RESOURCE_OPTIONS}/>
      <button className="button primary full" disabled={!canTrade||giveBank===getBank||hand[giveBank]<ratio||game.bank[getBank]<1} onClick={()=>void send({type:"bankTrade",give:giveBank,get:getBank})}><Landmark size={17}/> Trade {ratio} for 1</button>
      <p className="muted small">Your current exchange rate is {ratio}:1 for {RESOURCE_META[giveBank].label.toLowerCase()}.</p>
    </>}
    {myOffers.length>0&&<><div className="panel-divider"/><h3 className="panel-h3">Trade offers <span className="count-bubble">{myOffers.length}</span></h3><div className="offers-list">{myOffers.map(o=><OfferCard key={o.id} game={game} offer={o} meId={meId} canTrade={canTrade} send={send} onCounter={counter}/>)}</div></>}
  </div>;
}

const CARD_INFO:Record<DevCardType,{title:string;subtitle:string;icon:typeof Swords}>={
  knight:{title:"Knight",subtitle:"Move the robber and steal",icon:Swords},
  roadBuilding:{title:"Road Building",subtitle:"Place two free roads",icon:MapPinned},
  yearOfPlenty:{title:"Year of Plenty",subtitle:"Choose two resources",icon:Wheat},
  monopoly:{title:"Monopoly",subtitle:"Collect one resource from everyone",icon:Crown},
  victoryPoint:{title:"Victory Point",subtitle:"A hidden point towards victory",icon:Shield},
};

export function CardsPanel({game,meId,canPlay,send}:{game:GameView;meId?:string;canPlay:boolean;send:Send}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const [first,setFirst]=useState<Resource>("brick");
  const [second,setSecond]=useState<Resource>("grain");
  const cards=game.you?.devCards??[];
  const play=async(type:DevCardType)=>{
    if(type==="knight")await send({type:"playKnight"});
    if(type==="roadBuilding")await send({type:"playRoadBuilding"});
    if(type==="monopoly")await send({type:"playMonopoly",resource:first});
    if(type==="yearOfPlenty"){const hand=EMPTY();hand[first]++;hand[second]++;await send({type:"playYearOfPlenty",resources:hand});}
    setExpanded(null);
  };
  return <div className="panel-content"><Hint title="Development cards" icon={<ScrollText size={20}/>}>You can play one action card per turn, starting the turn after you bought it.</Hint>
    {cards.length===0&&<div className="empty-cards"><ScrollText size={38}/><h3>Nothing in your hand yet</h3><p>Buy cards in the Build menu using wool, grain and ore.</p></div>}
    <div className="dev-card-list">{cards.map(card=>{
      const info=CARD_INFO[card.type],Icon=info.icon;
      const locked=card.boughtTurn>=game.turnCount;
      const canUse=canPlay&&!locked&&card.type!=="victoryPoint";
      return <div className={"development-card "+(locked?"locked":"")} key={card.id}>
        <div className="development-art"><Icon size={27}/></div>
        <div className="development-info"><strong>{info.title}</strong><small>{locked?"Available on your next turn":info.subtitle}</small></div>
        {card.type!=="victoryPoint"&&<button className="button secondary small" disabled={!canUse} onClick={()=>{if(card.type==="monopoly"||card.type==="yearOfPlenty")setExpanded(expanded===card.id?null:card.id);else void play(card.type)}}>{expanded===card.id?"Close":"Play"}</button>}
        {expanded===card.id&&<div className="card-choices">
          <FieldSelect label={card.type==="monopoly"?"Take all of this resource":"First resource"} value={first} options={RESOURCE_OPTIONS} onChange={v=>setFirst(v as Resource)}/>
          {card.type==="yearOfPlenty"&&<FieldSelect label="Second resource" value={second} options={RESOURCE_OPTIONS} onChange={v=>setSecond(v as Resource)}/>}
          <button className="button primary full" disabled={card.type==="yearOfPlenty"&&(game.bank[first]<1||game.bank[second]<(first===second?2:1))} onClick={()=>void play(card.type)}>Confirm card <Check size={17}/></button>
        </div>}
      </div>;
    })}</div>
  </div>;
}

export function HistoryPanel({game}:{game:GameView}) {
  return <div className="panel-content"><p className="muted small">The latest moves on your island.</p><div className="history-list">{game.log.slice().reverse().map((entry,index)=><div className="history-entry" key={entry.rev+"-"+index}><span className="history-turn">TURN {entry.turn}</span><p>{entry.text}</p></div>)}</div></div>;
}

export function DiscardPicker({hand,count,send}:{hand:ResourceHand;count:number;send:Send}) {
  const [selection,setSelection]=useState<ResourceHand>(EMPTY);
  return <div className="forced-picker"><Hint title="A seven was rolled" icon={<Dices size={19}/>}>You must discard {count} resource cards before play continues.</Hint>
    <QuantityPicker label="CHOOSE CARDS TO DISCARD" hand={selection} max={hand} onChange={setSelection}/>
    <div className="discard-footer"><span>{total(selection)} / {count} selected</span><button className="button primary" disabled={total(selection)!==count} onClick={async()=>{if(await send({type:"discard",resources:selection}))setSelection(EMPTY());}}>Discard cards</button></div>
  </div>;
}
