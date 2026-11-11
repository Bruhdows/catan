import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowRight, Check, ChevronRight, CircleHelp, Copy, Crown, Globe2, Hexagon, LogOut, Menu, Play, Radio, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import type { PlayerColor } from "@hexhaven/shared";
import { useSession } from "./session";
export { GamePage } from "./game-screen";

export const COLORS: Record<PlayerColor, string> = { crimson:"#d97666", azure:"#6eaed3", amber:"#e4b857", ivory:"#eee2ca" };
export function Shell({ children }: { children: ReactNode }) {
  const { error, clearError, connected, auth } = useSession();
  const [menu, setMenu] = useState(false);
  return <div className="app-shell">
    <header className="site-nav">
      <Link to="/" className="brand"><span className="brand-icon"><Hexagon size={23} strokeWidth={2.7}/></span><span>HEXHAVEN<small>THE ISLAND AWAITS</small></span></Link>
      <nav className={menu ? "nav-links visible" : "nav-links"}>
        <Link onClick={() => setMenu(false)} to="/">Home</Link>
        <Link onClick={() => setMenu(false)} to="/rules">How to play</Link>
        {auth && <Link onClick={() => setMenu(false)} to={auth.lobby.state === "lobby" ? `/lobby/${auth.code}` : `/game/${auth.code}`}>Your table</Link>}
      </nav>
      <div className="nav-right"><span className={"connection " + (connected ? "online" : "offline")}><span className="status-dot"/>{connected ? "Connected" : "Reconnecting"}</span><button className="icon-button menu-toggle" onClick={() => setMenu(!menu)} aria-label="Toggle menu">{menu ? <X/> : <Menu/>}</button></div>
    </header>
    {error && <div className="toast" role="alert"><span>{error}</span><button onClick={clearError} aria-label="Dismiss"><X size={16}/></button></div>}
    {children}
    <footer className="site-footer"><span>© Hexhaven · A world worth building</span><span>Unofficial island strategy game · Not affiliated with CATAN GmbH</span></footer>
  </div>;
}
function IslandPreview() {
  const terrain = ["forest","fields","hills","pasture","mountains","forest","pasture","fields","mountains","hills","fields","forest","pasture","mountains","fields","hills","pasture","forest","fields"];
  const fill: Record<string,string> = { forest:"#3e765e",fields:"#d7bd71",hills:"#b87151",pasture:"#9da96c",mountains:"#82939a" };
  const centers: {x:number;y:number}[] = [];
  for(let r=-2;r<=2;r++) for(let q=Math.max(-2,-r-2);q<=Math.min(2,2-r);q++) centers.push({x:220+61*(q+r/2),y:218+52.8*r});
  const poly = (x:number,y:number) => Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${(x+34*Math.cos(a)).toFixed(1)},${(y+34*Math.sin(a)).toFixed(1)}`}).join(" ");
  return <svg className="preview-island" viewBox="0 0 440 450" role="img" aria-label="Illustrated hexagonal island terrain"><defs><filter id="preview-shadow"><feDropShadow dx="0" dy="12" stdDeviation="13" floodColor="#030b13" floodOpacity=".45"/></filter></defs><circle cx="220" cy="220" r="196" fill="#1e5868" opacity=".4"/><g filter="url(#preview-shadow)">{centers.map((p,i)=><g key={i}><polygon points={poly(p.x,p.y)} fill={fill[terrain[i]!]}/><polygon points={poly(p.x,p.y)} fill="none" stroke="#dbd1ad" strokeOpacity=".4" strokeWidth="2"/><circle cx={p.x} cy={p.y} r="10" fill="#f2e5cd" stroke="#937a59" strokeWidth="2"/><text x={p.x} y={p.y+4} fontSize="11" textAnchor="middle" fill="#3b372e" fontWeight="bold">{[5,9,4,6,10,3,11,8,2,12,5,6,9,8,10,4,3,11,9][i]}</text></g>)}</g><path d="M63 337Q200 404 375 340" fill="none" stroke="#e5bf7e" strokeOpacity=".5" strokeDasharray="3 11" strokeWidth="2"/></svg>;
}
export function HomePage() {
  return <main className="home-page">
    <section className="hero"><div className="hero-copy"><div className="eyebrow"><Sparkles size={15}/> A NEW WORLD, EVERY GAME</div><h1>The island is <em>yours</em> to settle.</h1><p>Build your roads. Trade your resources. Outsmart your friends. A timeless strategy game, beautifully reimagined for your browser.</p><div className="hero-actions"><Link className="button primary large" to="/create"><Play size={18} fill="currentColor"/> Create a game <ArrowRight size={18}/></Link><Link className="button ghost large" to="/join">Join a table</Link></div><div className="hero-note"><Users size={16}/> 3–4 players <span className="sep"/> <Globe2 size={16}/> Real-time multiplayer <span className="sep"/> No account needed</div></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><IslandPreview/><div className="floating-label label-one"><span className="floating-symbol">✦</span> A new island every time</div><div className="floating-label label-two"><span className="floating-symbol">⌂</span> Build your legacy</div></div></section>
    <section className="feature-strip"><div><Hexagon/><h3>Claim the land</h3><p>Find the perfect spots for settlements and connect your expanding territory.</p></div><div><Users/><h3>Make your deals</h3><p>Trade with your rivals, negotiate favors and secure the resources you need.</p></div><div><Crown/><h3>Win your way</h3><p>Lead with cities, claim the longest road, or become the island's greatest army.</p></div></section>
    <section className="home-bottom"><div><div className="eyebrow">YOUR ADVENTURE STARTS HERE</div><h2>Never settled before?</h2><p>Our illustrated rulebook makes it easy to learn the island and make your first move.</p></div><Link className="button secondary" to="/rules">Explore the rulebook <ChevronRight size={18}/></Link></section>
  </main>;
}
export function JoinPage({ create = false }: { create?: boolean }) {
  const { code: pathCode } = useParams();
  const navigate = useNavigate(); const { create: createLobby, join, busy } = useSession();
  const [name,setName] = useState(() => localStorage.getItem("hexhaven.name") || "");
  const [code,setCode] = useState(pathCode || "");
  const [spectator,setSpectator] = useState(false);
  const [submitted,setSubmitted] = useState(false);
  useEffect(() => { if(pathCode) setCode(pathCode.toUpperCase()); },[pathCode]);
  async function submit(e:FormEvent) {
    e.preventDefault();const display=name.trim(); if (!display) return;
    localStorage.setItem("hexhaven.name",display);
    const ok=create ? await createLobby(display) : await join(code.trim().toUpperCase(),display,spectator);
    if (ok) setSubmitted(true); // successful auth triggers navigation via the effect below
  }
  const session=useSession();
  useEffect(()=>{if(submitted && session.auth && session.lobby){navigate(session.lobby.state === "lobby" ? `/lobby/${session.auth.code}` : `/game/${session.auth.code}`,{replace:true});}},[submitted,session.auth?.code,session.lobby?.state,navigate]);
  return <main className="entry-page"><section className="entry-panel"><div className="eyebrow"><Hexagon size={15}/>{create ? "START AN ADVENTURE" : "A SEAT AT THE TABLE"}</div><h1>{create ? "Gather your crew." : "Join the island."}</h1><p>{create ? "Create a private table and invite up to three friends. No registration, no waiting." : "Enter your invitation code and get ready to claim your place."}</p><form onSubmit={submit} className="entry-form"><label>Your nickname<input maxLength={20} required autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="What should we call you?"/></label>{!create && <label>Lobby code<input maxLength={6} required value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ABC123" className="code-field"/></label>}{!create && <label className="checkbox-row"><input type="checkbox" checked={spectator} onChange={e=>setSpectator(e.target.checked)}/> Join as spectator</label>}<button type="submit" className="button primary large full" disabled={busy || !name.trim() || (!create && code.trim().length!==6)}>{busy ? "Connecting…" : create ? "Create private lobby" : "Join the table"} <ArrowRight size={17}/></button></form><div className="entry-switch">{create ? "Have an invite?" : "Want to host?"} <Link to={create ? "/join" : "/create"}>{create ? "Join a game" : "Create a game"}</Link></div></section><div className="entry-art"><IslandPreview/></div></main>;
}
export function LobbyPage() {
  const { code }=useParams();const navigate=useNavigate();
  const { lobby,auth,connected,busy,leave,ready,color,settings,kick,start,join }=useSession();
  const [copied,setCopied]=useState(false);
  useEffect(()=>{if(!auth && code){const name=localStorage.getItem("hexhaven.name")||"";if(name)void join(code,name);}},[auth?.code,code]);
  useEffect(()=>{if(lobby && auth && lobby.state!=="lobby")navigate(`/game/${auth.code}`,{replace:true});},[lobby?.state,auth?.code,navigate]);
  if (!auth || !lobby || auth.code!==code) return <main className="center-state"><h2>Finding your table…</h2><p>Reconnecting to the island.</p><Link to="/join">Join a different table</Link></main>;
  const me=lobby.players.find(p=>p.id===auth.playerId);const host=auth.playerId===lobby.hostId;
  const canStart=lobby.players.length>=3&&lobby.players.every(p=>p.ready);
  const link=`${window.location.origin}/join/${lobby.code}`;
  const leaveAndGo=()=>{leave();navigate("/")};
  return <main className="lobby-page"><div className="page-heading"><div><div className="eyebrow"><Radio size={16}/> PRIVATE GAME ROOM</div><h1>Your table is ready.</h1><p>Gather your players, choose your colors, then set sail.</p></div><button className="button ghost" onClick={leaveAndGo}><LogOut size={17}/> Leave lobby</button></div><div className="lobby-layout"><section className="lobby-main surface"><div className="section-heading"><div><span className="eyebrow">INVITE YOUR FRIENDS</span><h2>Room <span className="accent-text">{lobby.code}</span></h2></div><button className="button secondary" onClick={async()=>{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500)}}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?"Copied!":"Copy invite"}</button></div><div className="lobby-players">{Array.from({length:4},(_,i)=>{const p=lobby.players[i];return <div key={p?.id||i} className={"lobby-player "+(!p?"empty":"")}><span className="seat-index">0{i+1}</span><span className="player-avatar" style={{background:p?COLORS[p.color]:undefined}}>{p ? p.name.charAt(0).toUpperCase() : "+"}</span><div className="player-detail"><b>{p?.name||"Waiting for player"}</b><small>{p ? (p.id===lobby.hostId?"Host · ":"")+(p.connected?"Connected":"Offline") : "Share the invite link to fill this seat"}</small></div>{p && <span className={"player-ready "+(p.ready?"yes":"")}>{p.ready?<><Check size={14}/> Ready</>:"Not ready"}</span>}{p && host && p.id!==auth.playerId && <button className="icon-button kick" title="Remove from lobby" onClick={()=>kick(p.id)}><X size={16}/></button>}</div>})}</div><div className="lobby-bottom">{!auth.spectator && me && <div><span className="field-caption">YOUR COLOR</span><div className="color-options">{(["crimson","azure","amber","ivory"] as PlayerColor[]).map(c=><button key={c} className={"color-choice "+(me.color===c?"selected":"")} style={{background:COLORS[c]}} title={c} disabled={lobby.players.some(p=>p.id!==me.id&&p.color===c)} onClick={()=>color(c)} />)}</div></div>}{!auth.spectator && me && <button className={"button "+(me.ready?"secondary":"primary")} onClick={()=>ready(!me.ready)}>{me.ready?<><Check size={17}/> You are ready</>:"Mark as ready"}</button>}</div></section><aside className="lobby-aside surface"><div className="eyebrow">GAME SETTINGS</div><h2>The next voyage</h2><label>Island layout<select value={lobby.settings.boardMode} disabled={!host} onChange={e=>settings({...lobby.settings,boardMode:e.target.value as "fixed"|"random"|"balanced"})}><option value="random">Random island</option><option value="balanced">Balanced random</option><option value="fixed">Classic starting island</option></select></label><label className="checkbox-row"><input disabled={!host} type="checkbox" checked={lobby.settings.allowSpectators} onChange={e=>settings({...lobby.settings,allowSpectators:e.target.checked})}/> Allow spectators</label><div className="lobby-rule"><ShieldCheck size={19}/><span>Classic base game · 3–4 players · First to 10 victory points wins.</span></div><div className="lobby-start"><span>{!connected?"Reconnecting…":lobby.players.length<3?"At least 3 players required":!canStart?"Waiting for everyone to ready up":host?"Everyone is ready!":"Waiting for host to start"}</span><button className="button primary large full" disabled={!host||!canStart||busy||!connected} onClick={()=>void start()}><Play size={17} fill="currentColor"/> Start game <ArrowRight size={17}/></button></div></aside></div></main>;
}
