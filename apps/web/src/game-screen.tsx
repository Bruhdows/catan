import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BookOpen, Check, Coins, Copy, Dices, Hammer, Landmark, LogOut, MapPin, MessageSquare, RotateCcw, ScrollText, Shield, Swords, Trophy, Users, X } from "lucide-react";
import { COSTS, RESOURCES, emptyHand, type GameCommand, type Resource, type ResourceHand, type DevCardType } from "@hexhaven/shared";
import { useSession } from "./session";
import { COLORS } from "./pages";
import { playCue } from "./sound";
import { BoardView, legalBoardTargets, type BoardAction } from "./board-view";

const ICONS: Record<Resource, string> = { brick:"▥",lumber:"♠",wool:"✿",grain:"✦",ore:"◆" };
const NAMES: Record<Resource,string> = {brick:"Brick",lumber:"Lumber",wool:"Wool",grain:"Grain",ore:"Ore"};
const CARD_NAMES: Record<DevCardType,string> = {knight:"Knight",roadBuilding:"Road Building",yearOfPlenty:"Year of Plenty",monopoly:"Monopoly",victoryPoint:"Victory Point"};
const fresh = () => emptyHand();
const sum = (h:ResourceHand) => RESOURCES.reduce((n,r)=>n+h[r],0);
function canPay(h:ResourceHand,c:ResourceHand){return RESOURCES.every(r=>h[r]>=c[r]);}
function Cost({value}:{value:ResourceHand}){return <span className="cost">{RESOURCES.filter(r=>value[r]).map(r=><span key={r} title={NAMES[r]}>{ICONS[r]} {value[r]}</span>)}</span>}
function Picker({value,max,onChange,label}:{value:ResourceHand;max:ResourceHand;onChange:(v:ResourceHand)=>void;label:string}){return <div className="hand-picker"><small className="section-label">{label}</small>{RESOURCES.map(r=><div className="picker-line" key={r}><span>{ICONS[r]} {NAMES[r]}</span><div><button disabled={!value[r]} onClick={()=>onChange({...value,[r]:value[r]-1})}>−</button><b>{value[r]}</b><button disabled={value[r]>=max[r]} onClick={()=>onChange({...value,[r]:value[r]+1})}>+</button></div></div>)}</div>}
function ResourceSelect({value,onChange}:{value:Resource;onChange:(r:Resource)=>void}){return <select value={value} onChange={e=>onChange(e.target.value as Resource)}>{RESOURCES.map(r=><option value={r} key={r}>{NAMES[r]}</option>)}</select>}
const maximum:ResourceHand={brick:19,lumber:19,wool:19,grain:19,ore:19};

export function GamePage(){
 const {code}=useParams();const navigate=useNavigate();
 const {auth,lobby,game,command,join,leave,reset,connected,busy}=useSession();
 const [mode,setMode]=useState<BoardAction>(null);
 const [tab,setTab]=useState<"build"|"trade"|"cards"|"log">("build");
 const [target,setTarget]=useState("");
 const [offer,setOffer]=useState<ResourceHand>(fresh);
 const [request,setRequest]=useState<ResourceHand>(fresh);
 const [counterId,setCounterId]=useState<string|null>(null);
 const [bankFrom,setBankFrom]=useState<Resource>("brick"),[bankTo,setBankTo]=useState<Resource>("lumber");
 const [choice,setChoice]=useState<Resource>("brick"),[choiceTwo,setChoiceTwo]=useState<Resource>("grain");
 const [discard,setDiscard]=useState<ResourceHand>(fresh);
 const [audio,setAudio]=useState(()=>localStorage.getItem("hexhaven.audio")==="yes");
 const prevSoundRevision=useRef<{seed:string;rev:number}|null>(null);
 const [sidebar,setSidebar]=useState(true);
 useEffect(()=>{
  if(!game) return;
  const previous=prevSoundRevision.current;
  prevSoundRevision.current={seed:game.seed,rev:game.rev};
  if(!audio||!previous||previous.seed!==game.seed||previous.rev===game.rev)return;
  if(game.phase==="finished")playCue("victory");
  else if(game.dice&&game.phase==="main"&&game.log.at(-1)?.tone==="roll")playCue("roll");
  else if(game.log.at(-1)?.tone==="trade")playCue("trade");
  else if(game.log.at(-1)?.tone==="action")playCue("build");
  else if(game.phase==="roll")playCue("turn");
 },[game?.rev,game?.seed,audio]);
 useEffect(()=>{if(!auth&&code){const name=localStorage.getItem("hexhaven.name");if(name)void join(code,name);}},[auth?.code,code]);
 useEffect(()=>{if(auth&&lobby?.state==="lobby")navigate("/lobby/"+auth.code,{replace:true});},[auth?.code,lobby?.state,navigate]);
 useEffect(()=>{if(!game)return;const p=game.pending;if(p.type==="setup")setMode(p.needsRoad?"road":"settlement");else if(p.type==="roadBuilding")setMode("road");else if(p.type==="robberMove")setMode("robber");else setMode(null);},[game?.pending.type,game?.pending.type==="setup"?game.pending.needsRoad:undefined,game?.phase]);
 const me=game?.players.find(p=>p.id===auth?.playerId);
 const active=game?.pending.type==="setup" ? game.players.find(x=>x.id===game.pending.player) : game?.players[game.turnIndex];
 const mine=Boolean(game&&me&&active?.id===me.id&&!auth?.spectator);
 const p=game?.pending;
 const setupMine=p?.type==="setup"&&p.player===me?.id;
 const canBuild=mine&&game?.phase==="main"&&p?.type==="none";
 const canRoll=mine&&game?.phase==="roll"&&p?.type==="none";
 const hand=game?.you?.resources??fresh();
 const allowed=useMemo(()=>game&&(game.phase==="setup"?setupMine:mine)?legalBoardTargets(game,mode,auth?.playerId):new Set<string>(),[game,mode,auth?.playerId,setupMine,mine]);
 const act=async(cmd:GameCommand)=>{const success=await command(cmd);if(success&&cmd.type!=="rollDice"&&cmd.type!=="discard"&&cmd.type!=="moveRobber"&&cmd.type!=="selectVictim"&&p?.type==="none")setMode(null);return success;};
 const onVertex=(v:string)=>{if(!allowed.has(v))return;if(mode==="settlement")void act({type:"placeSettlement",vertex:v});if(mode==="city")void act({type:"upgradeCity",vertex:v});};
 const onEdge=(e:string)=>{if(allowed.has(e)&&mode==="road")void act({type:"placeRoad",edge:e});};
 const onHex=(h:string)=>{if(allowed.has(h)&&mode==="robber")void act({type:"moveRobber",hex:h});};
 const select=(next:BoardAction)=>setMode(mode===next?null:next);
 const play=(type:DevCardType)=>{
  if(type==="knight")void act({type:"playKnight"});
  if(type==="roadBuilding")void act({type:"playRoadBuilding"});
  if(type==="monopoly")void act({type:"playMonopoly",resource:choice});
  if(type==="yearOfPlenty"){const h=fresh();h[choice]++;h[choiceTwo]++;void act({type:"playYearOfPlenty",resources:h});}
 };
 const resetOffer=()=>{setOffer(fresh());setRequest(fresh());setCounterId(null);};
 const sendTrade=async()=>{
  if(counterId){if(await act({type:"respondTrade",offerId:counterId,response:"counter",counter:offer,counterGet:request}))resetOffer();}
  else if(target){if(await act({type:"offerTrade",to:target,give:offer,get:request}))resetOffer();}
 };
 const ratio=(r:Resource)=>{
  const buildings=[...(me?.settlements??[]),...(me?.cities??[])];
  if(game?.board.ports.some(x=>x.resource===r&&x.vertices.some(v=>buildings.includes(v))))return 2;
  if(game?.board.ports.some(x=>x.resource===null&&x.vertices.some(v=>buildings.includes(v))))return 3;
  return 4;
 };
 if(!auth||!lobby||auth.code!==code)return <main className="center-state"><h2>Reconnecting to the table…</h2><Link to="/join">Join another game</Link></main>;
 if(!game)return <main className="center-state"><div className="spinner"/><h2>Preparing the island…</h2><p>Waiting for the authoritative game state.</p></main>;
 const phase=game.phase==="setup"?"Founding the island":game.phase==="finished"?"A champion has emerged":p?.type==="discard"?"The robber strikes":p?.type==="robberMove"?"Move the robber":p?.type==="robberSteal"?"Choose a victim":game.phase==="roll"?"Time to roll":"Build your legacy";
 const players=game.players.filter(x=>x.id!==me?.id);
 const myOffers=game.offers.filter(x=>x.from===me?.id||x.to===me?.id);
 const gameOver=game.phase==="finished";
 return <main className="game-page">
  <div className="game-topbar"><div><small className="section-label">ROOM {lobby.code} · TURN {game.turnCount||"SETUP"}</small><h2>{phase}</h2></div><div className="game-turn">{active&&<><span className="mini-avatar" style={{background:COLORS[active.color]}}>{active.name.slice(0,1).toUpperCase()}</span><span><small>ACTIVE PLAYER</small><b>{active.name}</b></span></>}</div><div className="game-top-actions"><button className="icon-button" title="Copy invite link" onClick={()=>void navigator.clipboard.writeText(window.location.origin+"/join/"+code)}><Copy size={18}/></button><Link className="icon-button" title="Rulebook" to="/rules"><BookOpen size={18}/></Link><button className="icon-button" title="Toggle sound" onClick={()=>{setAudio(!audio);localStorage.setItem("hexhaven.audio",audio?"no":"yes");if(!audio)playCue("turn");}}>{audio?"♪":"♫"}</button><button className="icon-button" title="Toggle panels" onClick={()=>setSidebar(!sidebar)}><Users size={18}/></button></div></div>
  <div className={"game-layout"+(!sidebar?" panels-collapsed":"")}>
   <aside className="game-sidebar player-panel"><div className="section-label">PLAYERS</div><div className="player-stack">{game.players.map(x=><div key={x.id} className={"opponent"+(active?.id===x.id?" on-turn":"")}><span className="mini-avatar" style={{background:COLORS[x.color]}}>{x.name.charAt(0).toUpperCase()}</span><div><b>{x.name}{x.id===me?.id?" (you)":""}</b><small>{x.publicPoints} visible VP · {x.resourceCount} cards · {x.devCount} dev</small></div><span className={"tiny-dot"+(x.connected?" connected":"")}/>{x.hasLongestRoad&&<MapPin size={15}/>} {x.hasLargestArmy&&<Shield size={15}/>}</div>)}</div>
   <section className="dice-panel">{game.dice&&<div className="dice-pair"><span>{game.dice[0]}</span><span>{game.dice[1]}</span><b>= {game.dice[0]+game.dice[1]}</b></div>}{canRoll?<button className="button primary full" onClick={()=>void act({type:"rollDice"})} disabled={busy||!connected}><Dices size={17}/> Roll dice</button>:<p>{setupMine?"Place your highlighted "+(p?.type==="setup"&&p.needsRoad?"road":"settlement")+" on the board.":mine?"Resolve the highlighted action.":"Waiting for "+active?.name}</p>}{canBuild&&<button className="button secondary full" onClick={()=>void act({type:"endTurn"})} disabled={busy}>End turn →</button>}</section><div className="small-log"><div className="section-label">RECENT EVENTS</div>{game.log.slice(-6).reverse().map((x,i)=><p key={i}>{x.text}</p>)}</div></aside>
   <div className="board-stage"><BoardView game={game} mode={mode} selectable={allowed} onVertex={onVertex} onEdge={onEdge} onHex={onHex}/>{mode&&p?.type==="none"&&<div className="board-selection"><span>Select a glowing position to {mode==="city"?"upgrade":"place a "+mode}.</span><button onClick={()=>setMode(null)}><X size={15}/> Cancel</button></div>}{p?.type==="roadBuilding"&&mine&&<div className="floating-instruction">Place {p.remaining} free road(s) on the highlighted edges.</div>}{p?.type==="robberMove"&&mine&&<div className="floating-instruction">Choose another terrain tile for the robber.</div>}
    {gameOver&&<div className="winner-overlay"><div className="winner-card"><Trophy size={44}/><div className="section-label">THE ISLAND HAS A CHAMPION</div><h1>{game.players.find(x=>x.id===game.winnerId)?.name} wins!</h1><p>Victory after {game.turnCount} turns.</p>{game.players.map(x=><div className="score-line" key={x.id}><b>{x.name}</b><span>{x.id===me?.id?game.you?.totalPoints:x.publicPoints} {x.id===me?.id?"VP":"visible VP"}</span></div>)}{lobby.hostId===me?.id?<button className="button primary full" onClick={async()=>{if(await reset())navigate("/lobby/"+code)}}><RotateCcw size={16}/> Return to lobby</button>:<p>Waiting for the host to arrange a rematch.</p>}</div></div>}</div>
   <aside className="game-sidebar action-panel"><div className="game-tabs"><button className={tab==="build"?"active":""} onClick={()=>setTab("build")}><Hammer size={16}/> Build</button><button className={tab==="trade"?"active":""} onClick={()=>setTab("trade")}><Coins size={16}/> Trade</button><button className={tab==="cards"?"active":""} onClick={()=>setTab("cards")}><ScrollText size={16}/> Cards</button><button className={tab==="log"?"active":""} onClick={()=>setTab("log")}><MessageSquare size={16}/> Log</button></div><div className="tab-body">
   {tab==="build"&&<><div className="section-label">EXPAND YOUR SETTLEMENT</div>{([{mode:"road",name:"Road",cost:COSTS.road,remaining:me?.pieces.roads??0},{mode:"settlement",name:"Settlement",cost:COSTS.settlement,remaining:me?.pieces.settlements??0},{mode:"city",name:"City",cost:COSTS.city,remaining:me?.pieces.cities??0}] as const).map(x=><button className={"build-choice"+(mode===x.mode?" selected":"")} key={x.mode} disabled={!canBuild||!canPay(hand,x.cost)||x.remaining<1} onClick={()=>select(x.mode)}><span className="build-pict">{x.mode==="road"?"╱":x.mode==="city"?"▣":"⌂"}</span><span><b>{x.name}</b><small>{x.remaining} pieces remaining</small><Cost value={x.cost}/></span></button>)}<button className="build-choice" disabled={!canBuild||!canPay(hand,COSTS.development)||game.devDeckCount===0} onClick={()=>void act({type:"buyDevelopment"})}><span className="build-pict">✦</span><span><b>Development card</b><small>{game.devDeckCount} cards remain</small><Cost value={COSTS.development}/></span></button></>}
   {tab==="trade"&&<><div className="section-label">TRADE WITH PLAYERS</div><label>Recipient<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose a player</option>{players.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><div className="trade-pickers"><Picker value={offer} onChange={setOffer} max={hand} label="YOU OFFER"/><Picker value={request} onChange={setRequest} max={maximum} label="YOU REQUEST"/></div><button className="button primary full" disabled={!canBuild||!target||!sum(offer)||!sum(request)} onClick={()=>void sendTrade()}>{counterId?"Send counteroffer":"Propose trade"}</button>{counterId&&<button className="button ghost full" onClick={resetOffer}>Cancel counter</button>}<div className="section-label spaced">BANK & HARBORS</div><div className="bank-picker"><ResourceSelect value={bankFrom} onChange={setBankFrom}/><strong>{ratio(bankFrom)} : 1</strong><ResourceSelect value={bankTo} onChange={setBankTo}/></div><button className="button secondary full" disabled={!canBuild||bankFrom===bankTo||hand[bankFrom]<ratio(bankFrom)||game.bank[bankTo]===0} onClick={()=>void act({type:"bankTrade",give:bankFrom,get:bankTo})}><Landmark size={16}/> Trade with bank</button>{myOffers.length>0&&<div className="section-label spaced">OPEN OFFERS</div>}{myOffers.map(o=><div className="trade-offer" key={o.id}><b>{game.players.find(x=>x.id===o.from)?.name} → {game.players.find(x=>x.id===o.to)?.name}</b><p>Give {RESOURCES.filter(r=>o.give[r]).map(r=>o.give[r]+" "+r).join(", ")} / get {RESOURCES.filter(r=>o.get[r]).map(r=>o.get[r]+" "+r).join(", ")}</p><small>{o.counter?"Counteroffer pending":o.status}</small><div className="offer-buttons">{o.to===me?.id&&o.status==="pending"&&!o.counter&&<><button className="button tiny primary" onClick={()=>void act({type:"respondTrade",offerId:o.id,response:"accept"})}>Accept</button><button className="button tiny secondary" onClick={()=>{setCounterId(o.id);setTarget(o.from);setOffer({...o.get});setRequest({...o.give})}}>Counter</button><button className="button tiny ghost" onClick={()=>void act({type:"respondTrade",offerId:o.id,response:"decline"})}>Decline</button></>}{o.from===me?.id&&(o.status==="accepted"||o.counter)&&<button className="button tiny primary" onClick={()=>void act({type:"confirmTrade",offerId:o.id})}>Finalize</button>}{o.from===me?.id&&<button className="button tiny ghost" onClick={()=>void act({type:"cancelTrade",offerId:o.id})}>Withdraw</button>}</div></div>)}</>}
   {tab==="cards"&&<><div className="section-label">DEVELOPMENT CARDS</div>{game.you?.devCards.length===0&&<p>No development cards. Buy them using wool, grain and ore.</p>}{game.you?.devCards.map(c=><div className="dev-card" key={c.id}><span>{c.type==="knight"?<Swords size={22}/>:<ScrollText size={22}/>}</span><div><b>{CARD_NAMES[c.type]}</b><small>{c.type==="victoryPoint"?"Hidden victory point":c.boughtTurn===game.turnCount?"Playable next turn":"Action card"}</small></div>{c.type!=="victoryPoint"&&<button className="button tiny secondary" disabled={!mine||p?.type!=="none"||!["roll","main"].includes(game.phase)||c.boughtTurn>=game.turnCount} onClick={()=>play(c.type)}>Play</button>}</div>)}<div className="section-label spaced">CARD OPTIONS</div><p>For Monopoly choose the resource to take. For Year of Plenty choose two resources.</p><label>First resource<ResourceSelect value={choice} onChange={setChoice}/></label><label>Second resource<ResourceSelect value={choiceTwo} onChange={setChoiceTwo}/></label></>}
   {tab==="log"&&<><div className="section-label">MATCH HISTORY</div>{game.log.slice().reverse().map((e,i)=><p className="history-line" key={i}><small>TURN {e.turn}</small><span>{e.text}</span></p>)}</>}
   </div></aside>
  </div>
  <div className="hand-footer"><div className="hand-identity"><span className="mini-avatar" style={{background:me?COLORS[me.color]:"#cfbd99"}}>{me?.name.slice(0,1).toUpperCase()||"?"}</span><span><b>{me?.name||"Spectator"}</b><small>{game.you?String(game.you.totalPoints)+" total VP":"Watching the game"}</small></span></div><div className="hand-cards">{RESOURCES.map(r=><div className={"hand-card hand-"+r} key={r}><span>{ICONS[r]}</span><span><small>{NAMES[r]}</small><b>{hand[r]}</b></span></div>)}</div><div className="hand-total"><b>{sum(hand)}</b><small>CARDS</small></div></div>
  {p?.type==="discard"&&p.players.some(x=>x.playerId===me?.id)&&<div className="dialog-backdrop"><section className="game-dialog"><h2>Discard resources</h2><p>The robber strikes. Discard exactly {p.players.find(x=>x.playerId===me?.id)?.count} cards.</p><Picker label="DISCARD" value={discard} max={hand} onChange={setDiscard}/><button className="button primary full" disabled={sum(discard)!==p.players.find(x=>x.playerId===me?.id)?.count} onClick={async()=>{if(await act({type:"discard",resources:discard}))setDiscard(fresh())}}>Confirm discard</button></section></div>}
  {p?.type==="robberSteal"&&mine&&<div className="dialog-backdrop"><section className="game-dialog"><h2>Choose someone to rob</h2><p>Steal one random resource card from a neighboring player.</p>{p.candidates.map(id=><button className="button secondary full" key={id} onClick={()=>void act({type:"selectVictim",player:id})}>{game.players.find(x=>x.id===id)?.name}</button>)}</section></div>}
  {!connected&&<div className="offline-banner"><RotateCcw size={16}/> Connection lost. Reconnecting to your seat…</div>}
 </main>;
}
