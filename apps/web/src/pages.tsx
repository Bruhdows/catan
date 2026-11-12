import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowRight, BookOpen, Check, ChevronRight, Copy, Crown, Hexagon, LogOut, Menu, Play, Sparkles, Users, X, WifiOff, Trees, Mountain, Wheat, Cloud, BrickWall } from "lucide-react";
import { hexSpiral, hexToPixel, type PlayerColor } from "@hexhaven/shared";
import { FieldSelect, PlayerAvatar, PLAYER_COLORS } from "./design";
import { useSession } from "./session";
export { GamePage } from "./game-screen";
export const COLORS = PLAYER_COLORS;

const PREVIEW_TERRAINS = ["fields", "forest", "pasture", "hills", "mountains", "forest", "fields", "pasture", "hills", "pasture", "fields", "mountains", "forest", "fields", "hills", "mountains", "forest", "pasture", "desert"];
const PREVIEW_NUMBERS = [8, 5, 9, 4, 10, 6, 3, 11, 5, 9, 4, 8, 10, 2, 11, 6, 3, 12, null];
const TILE_COLORS: Record<string, string> = { fields: "#f5c75d", forest: "#54a96d", pasture: "#b3d967", hills: "#e6976a", mountains: "#9cafb9", desert: "#e9cc96" };
const terrainIcons = { fields: Wheat, forest: Trees, pasture: Cloud, hills: BrickWall, mountains: Mountain, desert: Sparkles };

function IslandPreview() {
  const tiles = hexSpiral({ q: 0, r: 0 }, 2);
  return <svg className="island-preview" viewBox="-270 -240 540 480" role="img" aria-label="Colorful illustrated hexagonal island game board">
    <defs><filter id="preview-depth" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="9" stdDeviation="11" floodColor="#174f64" floodOpacity=".2"/></filter></defs>
    <circle r="226" fill="#5cb8d3"/><circle r="200" fill="none" stroke="#ffffff" strokeOpacity=".5" strokeDasharray="3 13" strokeWidth="2"/>
    <g filter="url(#preview-depth)">
      {tiles.map((axial, i) => {
        const p = hexToPixel(axial, 43);
        const points = Array.from({ length: 6 }, (_, k) => { const a = Math.PI * (k * 60 + 30) / 180; return (p.x + 42 * Math.cos(a)) + "," + (p.y + 42 * Math.sin(a)); }).join(" ");
        const number = PREVIEW_NUMBERS[i];
        const Icon = terrainIcons[PREVIEW_TERRAINS[i] as keyof typeof terrainIcons];
        return <g key={i}><polygon points={points} fill={TILE_COLORS[PREVIEW_TERRAINS[i]!]} stroke="#fff7dd" strokeWidth="4"/>
          <g opacity=".25" transform={"translate(" + (p.x - 15) + " " + (p.y - 22) + ")"}><Icon size={30} color="#234f3e" strokeWidth={2.5}/></g>
          {number && <><circle cx={p.x} cy={p.y + 7} r="16" fill="#fff5d8" stroke="#ffffff" strokeWidth="2.5"/><text textAnchor="middle" x={p.x} y={p.y + 12} fontSize="15" fontWeight="900" fill={number === 6 || number === 8 ? "#b44c42" : "#35463f"}>{number}</text></>}
        </g>;
      })}
    </g>
    <g transform="translate(-142 -104)"><path d="M0 18L14 4L28 18V37H0Z" fill="#ef715f" stroke="#fff0de" strokeWidth="4"/><rect x="11" y="24" width="7" height="13" fill="#8e3c32"/></g>
    <g transform="translate(139 74)"><path d="M0 18L14 4L28 18V37H0Z" fill="#3b86d9" stroke="#fff0de" strokeWidth="4"/><rect x="11" y="24" width="7" height="13" fill="#224e7d"/></g>
  </svg>;
}

export function Shell({ children }: { children: ReactNode }) {
  const { error, clearError, connected, auth } = useSession();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const gameScreen = pathname.startsWith("/game/");
  return <div className={"app-shell" + (gameScreen ? " game-shell" : "")}>
    {!gameScreen && <header className="site-nav">
      <Link to="/" className="brand"><span className="brand-mark"><Hexagon size={25} strokeWidth={3}/></span><span>hexhaven</span></Link>
      <nav className={menu ? "nav-links visible" : "nav-links"}>
        <Link to="/" onClick={() => setMenu(false)}>Play</Link>
        <Link to="/rules" onClick={() => setMenu(false)}>Rules</Link>
        {auth && <Link onClick={() => setMenu(false)} to={auth.lobby.state === "lobby" ? "/lobby/" + auth.code : "/game/" + auth.code}>Your game</Link>}
      </nav>
      <div className="nav-right">{!connected && <span className="connection offline"><WifiOff size={15}/> Reconnecting</span>}<button className="icon-button menu-toggle" onClick={() => setMenu(!menu)} aria-label="Toggle menu">{menu ? <X size={19}/> : <Menu size={19}/>}</button></div>
    </header>}
    {error && <div className="toast" role="alert"><span>{error}</span><button type="button" onClick={clearError} aria-label="Dismiss"><X size={18}/></button></div>}
    {children}
    {!gameScreen && <footer className="site-footer"><span>Hexhaven · An independent island board game</span><Link to="/rules">Learn the rules <ArrowRight size={14}/></Link></footer>}
  </div>;
}

export function HomePage() {
  return <main className="home-page">
    
    <section className="home-hero">
      <div className="home-copy"><h1>Play with friends.</h1>
        <p>A multiplayer island strategy game for 3–4 players. Build, trade, and race to 10 points. No account needed.</p>
        <div className="hero-actions"><Link to="/create" className="button primary large"><Play size={19} fill="currentColor"/> Create game</Link><Link to="/join" className="button secondary large"><Users size={19}/> Join game</Link></div>
        <Link className="learn-link" to="/rules"><BookOpen size={17}/> How to play <ChevronRight size={16}/></Link>
      </div>
      <div className="home-island"><IslandPreview/></div>
    </section>
    
  </main>;
}

export function JoinPage({ create = false }: { create?: boolean }) {
  const { code: pathCode } = useParams();
  const navigate = useNavigate();
  const { create: createLobby, join, busy, auth, lobby } = useSession();
  const [name,setName] = useState(() => localStorage.getItem("hexhaven.name") || "");
  const [code,setCode] = useState(pathCode || "");
  const [spectator,setSpectator] = useState(false);
  const [submitted,setSubmitted] = useState(false);
  useEffect(() => { if (pathCode) setCode(pathCode.toUpperCase()); }, [pathCode]);
  useEffect(() => { if (submitted && auth && lobby) navigate(lobby.state === "lobby" ? "/lobby/" + auth.code : "/game/" + auth.code, { replace: true }); }, [submitted,auth?.code,lobby?.state,navigate]);
  async function submit(e:FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    localStorage.setItem("hexhaven.name", name.trim());
    const ok = create ? await createLobby(name.trim()) : await join(code.trim().toUpperCase(), name.trim(), spectator);
    if (ok) setSubmitted(true);
  }
  return <main className="entry-page"><div className="entry-art"><IslandPreview/></div><section className="entry-panel">
    <h1>{create ? "Create game" : "Join game"}</h1>
    <p>{create ? "Share the room link with your friends." : "Enter the code from your friend."}</p>
    <form onSubmit={submit} className="entry-form">
      <label className="field"><span className="field-label">Nickname</span><input maxLength={20} required autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Nickname"/></label>
      {!create && <label className="field"><span className="field-label">Room code</span><input maxLength={6} required value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ABC123" className="code-field"/></label>}
      {!create && <label className="checkbox-row"><input type="checkbox" checked={spectator} onChange={e=>setSpectator(e.target.checked)}/> Watch as spectator</label>}
      <button className="button primary large full" type="submit" disabled={busy || !name.trim() || (!create && code.trim().length !== 6)}>{busy ? "Connecting…" : create ? "Create room" : "Join room"}</button>
    </form>
    <p className="entry-switch"><Link to={create ? "/join" : "/create"}>{create ? "Join an existing room" : "Create a new room"}</Link></p>
  </section></main>;
}

export function LobbyPage() {
  const { code } = useParams(); const navigate = useNavigate();
  const { lobby,auth,connected,busy,leave,ready,color,settings,kick,start,join } = useSession();
  const [copied,setCopied] = useState(false);
  useEffect(() => { if (!auth && code) { const name = localStorage.getItem("hexhaven.name") || ""; if(name) void join(code,name); } }, [auth?.code,code]);
  useEffect(() => { if(lobby && auth && lobby.state !== "lobby") navigate("/game/" + auth.code, { replace: true }); }, [lobby?.state,auth?.code,navigate]);
  if (!auth || !lobby || auth.code !== code) return <main className="center-state"><h2>Finding your room…</h2><p>Reconnecting to your game.</p><Link to="/join">Join a different game</Link></main>;
  const me = lobby.players.find(p => p.id === auth.playerId);
  const host = auth.playerId === lobby.hostId;
  const canStart = lobby.players.length >= 3 && lobby.players.every(p => p.ready && p.connected);
  const share = location.origin + "/join/" + lobby.code;
  const leaveAndGo=()=>{leave();navigate("/")};
  return <main className="lobby-page">
    <div className="lobby-layout">
      <section className="lobby-main surface">
        <div className="lobby-code-row"><div><h1 className="lobby-code">Room {lobby.code}</h1><span className="lobby-seat-count">{lobby.players.length} of 4 players</span></div><button className="button secondary" onClick={async()=>{await navigator.clipboard.writeText(share);setCopied(true);setTimeout(()=>setCopied(false),1700)}}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? "Copied" : "Copy link"}</button></div>
        <div className="lobby-seats">{Array.from({length:4},(_,i)=>{const p=lobby.players[i];return <div key={p?.id||i} className={"lobby-seat" + (!p ? " seat-empty" : "")}>
          <span className="seat-number">{i+1}</span>
          {p ? <PlayerAvatar name={p.name} color={p.color} size="lg"/> : <span className="empty-avatar"><Users size={22}/></span>}
          <div className="seat-details"><strong>{p?.name ?? "Empty seat"}{p?.id===lobby.hostId&&<Crown size={14} className="host-crown" aria-label="Host"/>}</strong>{p && !p.connected && <small>Offline</small>}</div>
          {p && <span className={"seat-ready" + (p.ready ? " is-ready" : "")}>{p.ready ? <><Check size={15}/> Ready</> : "Not ready"}</span>}
          {p && host && p.id !== auth.playerId && <button className="icon-button seat-kick" title={"Remove "+p.name} aria-label={"Remove "+p.name} onClick={()=>kick(p.id)}><X size={16}/></button>}
        </div>})}</div>
        {!auth.spectator && me && <div className="seat-controls"><div><span className="field-label">Color</span><div className="color-swatches">{(["crimson","azure","amber","ivory"] as PlayerColor[]).map(c=><button key={c} type="button" aria-label={c} aria-pressed={me.color===c} className={"color-swatch" + (me.color===c ? " selected":"")} style={{background:PLAYER_COLORS[c]}} disabled={lobby.players.some(p=>p.id!==me.id && p.color===c)} onClick={()=>color(c)}/>)}</div></div><button className={"button " + (me.ready ? "secondary" : "primary")} onClick={()=>ready(!me.ready)}>{me.ready ? "Cancel ready" : "Ready up"}</button></div>}
      </section>
      <aside className="lobby-side surface">
        <div className="side-heading"><h2>Settings</h2><p>Classic rules · 10 points to win</p></div>
        <FieldSelect label="Island layout" value={lobby.settings.boardMode} disabled={!host} options={[{value:"random",label:"Random island"},{value:"balanced",label:"Balanced random"},{value:"fixed",label:"Beginner layout"}]} onChange={next=>settings({...lobby.settings,boardMode:next as "random"|"balanced"|"fixed"})}/>
        <label className="checkbox-row"><input type="checkbox" checked={lobby.settings.allowSpectators} disabled={!host} onChange={e=>settings({...lobby.settings,allowSpectators:e.target.checked})}/> Allow spectators</label>
        <Link className="settings-rules-link" to="/rules"><BookOpen size={16}/> Rules <ArrowRight size={14}/></Link>
        <div className="lobby-start"><p>{!connected ? "Reconnecting…" : lobby.players.length<3 ? "Need at least 3 players" : !canStart ? "Waiting for players to ready up" : host ? "Ready to start" : "Waiting for host"}</p>{host && <button className="button primary large full" disabled={!canStart||busy||!connected} onClick={()=>void start()}><Play size={18} fill="currentColor"/> Start game</button>}</div>
      </aside>
    </div>
    <button className="leave-link" onClick={leaveAndGo}><LogOut size={16}/> Leave room</button>
  </main>;
}
