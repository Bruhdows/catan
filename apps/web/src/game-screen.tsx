import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BookOpen, Check, ChevronRight, CircleHelp, Coins, Copy, Crown, Dices, Hexagon, History, House, LogOut, MapPin, RotateCcw, Route, ScrollText, Shield, Swords, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { RESOURCES, emptyHand, type GameCommand, type GameView, type ResourceHand } from "@hexhaven/shared";
import { BoardView, legalBoardTargets, type BoardAction } from "./board-view";
import { BuildPanel, CardsPanel, DiscardPicker, HistoryPanel, TradePanel } from "./game-panels";
import { PLAYER_COLORS, PlayerAvatar, ResourceIcon, RESOURCE_META } from "./design";
import { playCue } from "./sound";
import { useSession } from "./session";

type Panel = "build" | "trade" | "cards" | "history" | null;

function phasePrompt(game: GameView, meId?: string) {
  const pending = game.pending;
  const active = pending.type === "setup" ? game.players.find(p => p.id === pending.player) : game.players[game.turnIndex];
  const myTurn = Boolean(meId && active?.id === meId);
  if (game.phase === "finished") return { title: "Game over", description: "", kind: "finish" };
  if (pending.type === "setup") {
    if (myTurn) return { title: pending.needsRoad ? "Place a road" : "Place a settlement", description: pending.needsRoad ? "Choose an edge next to your settlement." : "Choose a highlighted corner.", kind: "setup" };
    return { title: active?.name + " is placing", description: "", kind: "wait" };
  }
  if (pending.type === "discard") return { title: pending.players.some(p => p.playerId === meId) ? "Discard cards" : "Waiting for discards", description: "", kind: "robber" };
  if (pending.type === "robberMove") return { title: myTurn ? "Move the robber" : "Waiting for robber", description: myTurn ? "Select a highlighted tile." : "", kind: "robber" };
  if (pending.type === "robberSteal") return { title: myTurn ? "Choose a player to rob" : "Waiting for steal", description: "", kind: "robber" };
  if (pending.type === "roadBuilding") return { title: myTurn ? "Place " + pending.remaining + " free road" + (pending.remaining === 1 ? "" : "s") : "Waiting for roads", description: "", kind: "setup" };
  if (game.phase === "roll") return { title: myTurn ? "Roll the dice" : active?.name + "'s turn", description: "", kind: myTurn ? "roll" : "wait" };
  return { title: myTurn ? "Your turn" : active?.name + "'s turn", description: "", kind: myTurn ? "action" : "wait" };
}

function MatchBar({game,meId}:{game:GameView;meId?:string}) {
  const activeId=game.pending.type==="setup"?game.pending.player:game.players[game.turnIndex]?.id;
  return <div className="match-roster" aria-label="Players and victory points">{game.players.map(player=><div key={player.id} className={"match-player"+(activeId===player.id?" current":"")+(player.id===meId?" mine":"")}>
    <PlayerAvatar name={player.name} color={player.color} size="sm"/>
    <span className="match-player-name"><b>{player.name}</b>{(player.id===meId||!player.connected)&&<small>{!player.connected?"Offline":"You"}</small>}</span>
    <span className="match-player-score" title="Visible victory points"><Crown size={13} fill="currentColor"/> {player.publicPoints}<span>/10</span></span>
    {(player.hasLongestRoad||player.hasLargestArmy)&&<span className="player-trophy" title={player.hasLongestRoad?"Longest Road":"Largest Army"}>{player.hasLongestRoad?<Route size={14}/>:<Shield size={14}/>}</span>}
  </div>)}</div>;
}

function HandBar({hand,privatePoints}:{hand:ResourceHand;privatePoints:number|null}) {
  return <div className="inventory-hand" aria-label="Your resource cards">
    {RESOURCES.map(resource=><div className={"inventory-card resource-"+resource} key={resource} title={RESOURCE_META[resource].label+": "+hand[resource]}>
      <span className="inventory-card-illustration"><ResourceIcon resource={resource} size={25}/></span>
      <span className="inventory-card-name">{RESOURCE_META[resource].short}</span>
      <strong className="inventory-count" key={hand[resource]}>{hand[resource]}</strong>
    </div>)}
    <div className="inventory-points"><Crown size={16} fill="currentColor"/><b>{privatePoints??"–"}</b><small>VP</small></div>
  </div>;
}

export function GamePage(){
  const {code}=useParams();const navigate=useNavigate();
  const {auth,lobby,game,command,join,leave,reset,connected,busy}=useSession();
  const [mode,setMode]=useState<BoardAction>(null);
  const [panel,setPanel]=useState<Panel>(null);
  const [audio,setAudio]=useState(()=>localStorage.getItem("hexhaven.audio")==="yes");
  const [menu,setMenu]=useState(false);
  const previous=useRef<{seed:string;rev:number}|null>(null);
  useEffect(()=>{if(!auth && code){const name=localStorage.getItem("hexhaven.name");if(name)void join(code,name);}},[auth?.code,code]);
  useEffect(()=>{if(auth && lobby?.state==="lobby")navigate("/lobby/"+auth.code,{replace:true});},[auth?.code,lobby?.state,navigate]);
  const setupNeedsRoad=game?.pending.type==="setup"?game.pending.needsRoad:undefined;
  useEffect(()=>{
    if(!game)return;
    if(game.pending.type==="setup")setMode(game.pending.needsRoad?"road":"settlement");
    else if(game.pending.type==="roadBuilding")setMode("road");
    else if(game.pending.type==="robberMove")setMode("robber");
    else setMode(null);
  },[game?.pending.type,setupNeedsRoad,game?.phase,game?.turnIndex]);
  useEffect(()=>{
    if(!game)return;
    const last=previous.current;
    previous.current={seed:game.seed,rev:game.rev};
    if(!audio||!last||last.seed!==game.seed||last.rev===game.rev)return;
    const tone=game.log.at(-1)?.tone;
    if(game.phase==="finished")playCue("victory");
    else if(tone==="roll")playCue("roll");
    else if(tone==="trade")playCue("trade");
    else if(tone==="action")playCue("build");
  },[game?.rev,game?.seed,audio]);
  const activeId=game?.pending.type==="setup"?game.pending.player:game?.players[game.turnIndex]?.id;
  const mine=Boolean(auth&&!auth.spectator&&activeId===auth.playerId);
  const setupMine=game?.pending.type==="setup" && game.pending.player===auth?.playerId;
  const canBuild=Boolean(mine&&game?.phase==="main"&&game.pending.type==="none");
  const canRoll=Boolean(mine&&game?.phase==="roll"&&game.pending.type==="none");
  const canPlayCard=Boolean(mine&&["roll","main"].includes(game?.phase??"")&&game?.pending.type==="none");
  const hand=game?.you?.resources??emptyHand();
  const allowed=useMemo(()=>game && (game.phase==="setup" ? setupMine : mine) ? legalBoardTargets(game,mode,auth?.playerId):new Set<string>(),[game,mode,setupMine,mine,auth?.playerId]);
  const send=async(cmd:GameCommand)=>{
    const ok=await command(cmd);
    if(ok && ["placeRoad","placeSettlement","upgradeCity"].includes(cmd.type)&&game?.pending.type==="none")setMode(null);
    if(ok&&cmd.type==="buyDevelopment")setPanel("cards");
    return ok;
  };
  const changeMode=(next:BoardAction)=>{setMode(next);if(next)setPanel(null);};
  const onVertex=(id:string)=>{if(!allowed.has(id))return;if(mode==="settlement")void send({type:"placeSettlement",vertex:id});if(mode==="city")void send({type:"upgradeCity",vertex:id});};
  const onEdge=(id:string)=>{if(allowed.has(id)&&mode==="road")void send({type:"placeRoad",edge:id});};
  const onHex=(id:string)=>{if(allowed.has(id)&&mode==="robber")void send({type:"moveRobber",hex:id});};
  const togglePanel=(next:Exclude<Panel,null>)=>{setPanel(panel===next?null:next);if(game?.pending.type==="none")setMode(null);};
  const toggleAudio=()=>{setAudio(!audio);localStorage.setItem("hexhaven.audio",audio?"no":"yes");if(!audio)playCue("turn");};
  if(!auth||!lobby||auth.code!==code) return <main className="center-state"><h2>Rejoining your game…</h2><p>Restoring your seat on the island.</p><Link to="/join">Join a different room</Link></main>;
  if(!game) return <main className="center-state"><div className="spinner"/><h2>Preparing your island…</h2><p>Waiting for the other players.</p></main>;
  const prompt=mode&&game.pending.type==="none"?{title:mode==="road"?"Place a road":mode==="city"?"Upgrade a city":"Place a settlement",description:mode==="road"?"Choose a highlighted edge.":"Choose a highlighted corner.",kind:"action"}:phasePrompt(game,auth.playerId);
  const needsDiscard=game.pending.type==="discard"&&game.pending.players.some(p=>p.playerId===auth.playerId);
  const waitingOffers=game.offers.filter(o=>o.to===auth.playerId&&o.status==="pending"&&!o.counter).length;
  const cards=game.you?.devCards.length??0;
  const gameOver=game.phase==="finished";
  const lastRoll=game.dice;
  return <main className="game-scene">
    <header className="game-hud">
      <div className="hud-room"><Link to="/" className="hud-logo" aria-label="Hexhaven home"><Hexagon size={20} strokeWidth={3}/></Link><span className="hud-room-code" title="Room code">{lobby.code}</span><button className="hud-copy" title="Copy invite link" aria-label="Copy invite link" onClick={()=>void navigator.clipboard.writeText(window.location.origin+"/join/"+code)}><Copy size={15}/></button></div>
      <MatchBar game={game} meId={auth.playerId}/>
      <div className="hud-buttons">
        <Link to="/rules" target="_blank" rel="noopener noreferrer" className="hud-icon" aria-label="Open rulebook" title="Rulebook"><BookOpen size={19}/></Link>
        <button className="hud-icon" aria-label={audio?"Mute sounds":"Enable sounds"} title={audio?"Mute sounds":"Enable sounds"} onClick={toggleAudio}>{audio?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
        <div className="hud-menu-wrap"><button className="hud-icon" aria-label="Game menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Hexagon size={18}/></button>{menu&&<div className="game-menu"><Link to="/rules" target="_blank" rel="noopener noreferrer"><CircleHelp size={16}/> Game rules</Link><button onClick={()=>{leave();navigate("/")}}><LogOut size={16}/> Leave game</button></div>}</div>
      </div>
    </header>

    <section className="board-area">
      <BoardView game={game} mode={mode} selectable={allowed} onVertex={onVertex} onEdge={onEdge} onHex={onHex}/>
      <div className={"turn-prompt " + (prompt.kind==="roll"?"is-my-turn":prompt.kind==="robber"?"is-robber":"")}>
        <strong>{prompt.title}</strong>
        {prompt.description&&<p>{prompt.description}</p>}
      </div>
      {lastRoll&&<div className="dice-pair" aria-label={"Last dice roll: "+lastRoll[0]+" and "+lastRoll[1]}><span>{lastRoll[0]}</span><span>{lastRoll[1]}</span><b>{lastRoll[0]+lastRoll[1]}</b></div>}
      {mode&&game.pending.type==="none"&&<button className="placement-cancel" onClick={()=>setMode(null)}><X size={15}/> Cancel placement</button>}
      {panel&&<aside className="action-drawer" aria-label={panel+" controls"}>
        <header className="drawer-header"><h2>{panel==="build"?"Build":panel==="trade"?"Trade":panel==="cards"?"Cards":"History"}</h2><button className="drawer-close" aria-label="Close panel" onClick={()=>setPanel(null)}><X size={20}/></button></header>
        <div className="drawer-body">
          {panel==="build"&&<BuildPanel game={game} meId={auth.playerId} hand={hand} canBuild={canBuild} mode={mode} onMode={changeMode} send={send}/>}
          {panel==="trade"&&<TradePanel game={game} meId={auth.playerId} canTrade={canBuild} hand={hand} send={send}/>}
          {panel==="cards"&&<CardsPanel game={game} meId={auth.playerId} canPlay={canPlayCard} send={send}/>}
          {panel==="history"&&<HistoryPanel game={game}/>}
        </div>
      </aside>}
    </section>

    <footer className="game-dock">
      <HandBar hand={hand} privatePoints={game.you?.totalPoints??null}/>
      <div className="dock-divider"/>
      <nav className="dock-actions" aria-label="Game actions">
        <button className={"dock-action"+(panel==="build"?" active":"")} aria-pressed={panel==="build"} onClick={()=>togglePanel("build")}><House size={22}/><span>Build</span></button>
        <button className={"dock-action"+(panel==="trade"?" active":"")} aria-pressed={panel==="trade"} onClick={()=>togglePanel("trade")}><Coins size={22}/><span>Trade</span>{waitingOffers>0&&<i>{waitingOffers}</i>}</button>
        <button className={"dock-action"+(panel==="cards"?" active":"")} aria-pressed={panel==="cards"} onClick={()=>togglePanel("cards")}><ScrollText size={22}/><span>Cards</span>{cards>0&&<i>{cards}</i>}</button>
        <button className={"dock-action"+(panel==="history"?" active":"")} aria-pressed={panel==="history"} onClick={()=>togglePanel("history")}><History size={22}/><span>Log</span></button>
      </nav>
      <div className="dock-turn-action">{canRoll?<button className="button roll-button" disabled={busy||!connected} onClick={()=>void send({type:"rollDice"})}><Dices size={22}/> Roll dice <ChevronRight size={18}/></button>:canBuild?<button className="button end-turn-button" disabled={busy||!connected} onClick={()=>void send({type:"endTurn"})}>End turn <ChevronRight size={18}/></button>:<span className="dock-waiting">{mine?"Make your move":gameOver?"Game over":"Waiting…"}</span>}</div>
    </footer>

    {needsDiscard&&game.pending.type==="discard"&&<div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Discard resources"><div className="game-dialog"><h2>Discard cards</h2><DiscardPicker hand={hand} count={game.pending.players.find(p=>p.playerId===auth.playerId)?.count??0} send={send}/></div></div>}
    {game.pending.type==="robberSteal"&&mine&&<div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Choose a player to rob"><div className="game-dialog">
      <span className="dialog-illustration"><Swords size={34}/></span><h2>Who will you rob?</h2><p>Choose one neighboring player. You'll take one random resource.</p><div className="victim-options">{game.pending.candidates.map(id=>{const target=game.players.find(p=>p.id===id);return <button key={id} onClick={()=>void send({type:"selectVictim",player:id})}>{target&&<PlayerAvatar color={target.color} name={target.name}/>}<strong>{target?.name??"Player"}</strong><ChevronRight size={20}/></button>})}</div>
    </div></div>}
    {gameOver&&<div className="dialog-backdrop victory-backdrop" role="dialog" aria-modal="true" aria-label="Match results"><div className="game-dialog winner-dialog">
      <span className="winner-illustration"><Trophy size={49}/></span><h2>{game.players.find(p=>p.id===game.winnerId)?.name??"A player"} wins!</h2>
      <div className="final-scores">{[...game.players].sort((a,b)=>b.publicPoints-a.publicPoints).map((p,i)=><div key={p.id}><span>{i+1}</span><PlayerAvatar name={p.name} color={p.color} size="sm"/><strong>{p.name}</strong><b>{p.publicPoints} VP</b></div>)}</div>
      {lobby.hostId===auth.playerId?<button className="button primary full" onClick={async()=>{if(await reset())navigate("/lobby/"+code)}}><RotateCcw size={19}/> Play again</button>:<span className="muted">Waiting for the host to start a rematch.</span>}
    </div></div>}
    {!connected&&<div className="offline-banner"><RotateCcw size={17}/> Reconnecting to your match…</div>}
  </main>;
}
