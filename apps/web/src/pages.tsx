/**
 * Menu-side pages: shell chrome, the illustrated title screen, join/create
 * and the lobby. The island artwork reuses the board's own terrain scenes so
 * the menu looks like the table you are about to sit down at.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowRight, BookOpen, Check, Copy, Crown, Hexagon, LogOut, Menu, Play, Users, X, WifiOff } from "lucide-react";
import { cornerPixel, hashSeed, hexSpiral, hexToPixel, tokenPips, MAX_PLAYERS, PLAYER_COLORS as COLOR_OPTIONS, type Axial, type Terrain } from "@hexhaven/shared";
import { FieldSelect, PlayerAvatar, PLAYER_COLORS } from "./design";
import { PieceSprite } from "./assets/art";
import { SeaDecor, TERRAIN_LABEL, TerrainArt } from "./assets/terrain";
import { useSession } from "./session";
import { openRules } from "./rulebook-modal";
export { GamePage } from "./game-screen";

/* --- Title-screen island ---------------------------------------------------- */

const MENU_TERRAINS: Terrain[] = [
  "fields", "forest", "pasture", "hills", "mountains",
  "forest", "fields", "pasture", "hills", "pasture",
  "fields", "mountains", "forest", "fields", "hills",
  "mountains", "forest", "pasture", "desert",
];
const MENU_NUMBERS: Array<number | null> = [8, 5, 9, 4, 10, 6, 3, 11, 5, 9, 4, 8, 10, 2, 11, 6, 3, 12, null];
const MENU_SIZE = 40;

function hexPoints(x: number, y: number, r = MENU_SIZE) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 + 30) * Math.PI / 180;
    return (x + r * Math.cos(a)).toFixed(2) + "," + (y + r * Math.sin(a)).toFixed(2);
  }).join(" ");
}

function MenuToken({ x, y, n }: { x: number; y: number; n: number }) {
  const red = n === 6 || n === 8;
  const pips = tokenPips(n);
  const angle = ((hashSeed("token:" + n) % 15) - 7) * 0.9;
  return <g transform={`translate(${x} ${y}) rotate(${angle.toFixed(1)})`} pointerEvents="none">
    <circle r="13" fill="#2f2416" opacity=".18" cy="1.2" />
    <circle r="12.6" fill={red ? "#f6e3c8" : "#f8f0dc"} stroke={red ? "#b8473c" : "#c8b689"} strokeWidth="1.8" />
    <text y="3.4" textAnchor="middle" fontSize="11.5" fontWeight="700" fontFamily="Fraunces, Georgia, serif"
      fill={red ? "#a83a30" : "#4a3b26"}>{n}</text>
    {Array.from({ length: pips }, (_, i) =>
      <circle key={i} cx={(i - (pips - 1) / 2) * 3.4} cy="7" r="1.05" fill={red ? "#b8473c" : "#9a8663"} />)}
  </g>;
}

function MenuRoad({ a, b, color }: { a: { x: number; y: number }; b: { x: number; y: number }; color: string }) {
  return <g pointerEvents="none">
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4a3826" strokeWidth="7" strokeLinecap="round" />
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="4.4" strokeLinecap="round" />
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeOpacity=".3" strokeWidth="1.2" strokeLinecap="round" />
  </g>;
}

/** A framed island mat for the title screen and join pages. */
export function MenuIsland({ className }: { className?: string }) {
  const tiles = hexSpiral({ q: 0, r: 0 }, 2);
  const center: Axial = { q: 0, r: 0 };
  const north = cornerPixel(center, 1, MENU_SIZE);
  const northeast = cornerPixel(center, 0, MENU_SIZE);
  const south = cornerPixel(center, 4, MENU_SIZE);
  const southeast = cornerPixel(center, 5, MENU_SIZE);
  return <svg className={className ?? "menu-island"} viewBox="-244 -234 488 468"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustrated Catan island">
    <defs>
      <radialGradient id="menu-sea" cx="46%" cy="36%" r="82%">
        <stop stopColor="#3d9db8" />
        <stop offset=".62" stopColor="#2187a4" />
        <stop offset="1" stopColor="#155e7c" />
      </radialGradient>
      <pattern id="menu-waves" width="86" height="54" patternUnits="userSpaceOnUse">
        <path d="M-8 16 Q2 10 12 16 T32 16 T52 16 T72 16 T92 16" fill="none" stroke="#dff4f6" strokeWidth="1.6" strokeOpacity=".16" />
        <path d="M-8 42 Q2 36 12 42 T32 42 T52 42 T72 42 T92 42" fill="none" stroke="#dff4f6" strokeWidth="1.6" strokeOpacity=".1" />
      </pattern>
      <filter id="menu-depth" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0c3d52" floodOpacity=".35" />
      </filter>
    </defs>

    {/* Board mat */}
    <rect x="-236" y="-226" width="472" height="452" rx="30" fill="url(#menu-sea)" />
    <rect x="-236" y="-226" width="472" height="452" rx="30" fill="url(#menu-waves)" />
    <rect x="-232" y="-222" width="464" height="444" rx="26" fill="none" stroke="#f3f7ee" strokeOpacity=".35" strokeWidth="2" strokeDasharray="8 7" />

    {/* Sand shelf + foam ring */}
    {tiles.map((axial, i) => {
      const p = hexToPixel(axial, MENU_SIZE);
      return <polygon key={"shelf" + i} points={hexPoints(p.x, p.y, MENU_SIZE * 1.22)} fill="#e6d3a4" opacity=".85" />;
    })}
    {tiles.map((axial, i) => {
      const p = hexToPixel(axial, MENU_SIZE);
      return <polygon key={"foam" + i} points={hexPoints(p.x, p.y, MENU_SIZE * 1.1)} fill="none"
        stroke="#f3f7ee" strokeOpacity=".55" strokeWidth="1.8" strokeDasharray="5 4" />;
    })}

    <SeaDecor />

    {/* Land tiles */}
    {tiles.map((axial, i) => {
      const terrain = MENU_TERRAINS[i]!;
      const p = hexToPixel(axial, MENU_SIZE);
      return <g key={i}>
        <title>{TERRAIN_LABEL[terrain]}</title>
        <polygon points={hexPoints(p.x, p.y, MENU_SIZE)} fill="#f4e9cf" filter="url(#menu-depth)" />
        <polygon points={hexPoints(p.x, p.y, MENU_SIZE - 2)} fill={`var(--t-${terrain})`} stroke="#efe2c2" strokeWidth="1.2" />
        <g transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
          <TerrainArt terrain={terrain} seed={hexKey(axial)} r={MENU_SIZE - 4} />
        </g>
      </g>;
    })}

    {/* Number tokens */}
    {tiles.map((axial, i) => {
      const n = MENU_NUMBERS[i];
      if (n === null || n === undefined) return null;
      const p = hexToPixel(axial, MENU_SIZE);
      return <MenuToken key={i} x={p.x} y={p.y} n={n} />;
    })}

    {/* Two rival camps, mid-game */}
    <MenuRoad a={north} b={northeast} color="#d24b40" />
    <MenuRoad a={south} b={southeast} color="#2f7fc9" />
    <g transform={`translate(${north.x - 21} ${north.y - 22})`} pointerEvents="none"><PieceSprite kind="settlement" color="#d24b40" size={42} /></g>
    <g transform={`translate(${south.x - 21} ${south.y - 22})`} pointerEvents="none"><PieceSprite kind="settlement" color="#2f7fc9" size={42} /></g>
  </svg>;
}

function hexKey(a: Axial) {
  return a.q + "," + a.r;
}

/* --- Shell ------------------------------------------------------------------- */

export function Shell({ children }: { children: ReactNode }) {
  const { error, clearError } = useSession();
  const { pathname } = useLocation();
  return <div className={"app-shell" + (pathname.startsWith("/game/") ? " game-shell" : "")}>
    {error && <div className="toast" role="alert"><span>{error}</span><button type="button" onClick={clearError} aria-label="Dismiss"><X size={17} /></button></div>}
    {children}
  </div>;
}

export function HomePage() {
  const navigate = useNavigate();
  const { create, join, busy, auth } = useSession();
  const [name, setName] = useState(() => localStorage.getItem("hexhaven.name") || "");
  const [code, setCode] = useState("");
  const [spectator, setSpectator] = useState(false);
  const [action, setAction] = useState<"create" | "join" | null>(null);

  async function enter(type: "create" | "join") {
    if (busy || !name.trim() || (type === "join" && code.length !== 6)) return;
    setAction(type);
    localStorage.setItem("hexhaven.name", name.trim());
    try {
      const ok = type === "create"
        ? await create(name.trim())
        : await join(code.trim().toUpperCase(), name.trim(), spectator);
      if (ok) {
        // The response updates session state before resolving.
        const next = JSON.parse(localStorage.getItem("hexhaven.session") || "null") as { code: string; lobby: { state: string } } | null;
        if (next) navigate((next.lobby.state === "lobby" ? "/lobby/" : "/game/") + next.code);
      }
    } finally { setAction(null); }
  }

  return <main className="home-page">
    <section className="menu-sign">
      <h1>Catan</h1>
      {auth && <Link className="home-resume" to={(auth.lobby.state === "lobby" ? "/lobby/" : "/game/") + auth.code}>Return to your game</Link>}
      <div className="menu-actions">
        <label className="field"><span className="field-label">Nickname</span>
          <input autoComplete="nickname" maxLength={20} placeholder="Your nickname" value={name} onChange={e => setName(e.target.value)} /></label>
        <button type="button" className="button primary large menu-btn" onClick={() => void enter("create")} disabled={busy || !name.trim()}><Play size={20} fill="currentColor" /> {busy && action === "create" ? "Creating…" : "Start a new game"}</button>
        <div className="home-divider"><span>or join a room</span></div>
        <label className="field"><span className="field-label">Room code</span>
          <input className="code-field" maxLength={6} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="ABC123" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} onKeyDown={e => { if (e.key === "Enter") void enter("join"); }} /></label>
        <label className="checkbox-row home-spectator"><input type="checkbox" checked={spectator} onChange={e => setSpectator(e.target.checked)} /> Join as spectator</label>
        <button type="button" className="button paper large menu-btn" onClick={() => void enter("join")} disabled={busy || !name.trim() || code.length !== 6}><Users size={20} /> {busy && action === "join" ? "Joining…" : "Join game"}</button>
        <button type="button" className="menu-guide" onClick={openRules}><BookOpen size={18} /> How to play <ArrowRight size={16} /></button>
      </div>
    </section>
  </main>;
}

/* --- Join / create ----------------------------------------------------------- */

export function JoinPage({ create = false }: { create?: boolean }) {
  const { code: pathCode } = useParams();
  const navigate = useNavigate();
  const { create: createLobby, join, busy, auth, lobby } = useSession();
  const [name, setName] = useState(() => localStorage.getItem("hexhaven.name") || "");
  const [code, setCode] = useState(pathCode || "");
  const [spectator, setSpectator] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (pathCode) setCode(pathCode.toUpperCase()); }, [pathCode]);
  useEffect(() => { if (submitted && auth && lobby) navigate(lobby.state === "lobby" ? "/lobby/" + auth.code : "/game/" + auth.code, { replace: true }); }, [submitted, auth?.code, lobby?.state, navigate]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    localStorage.setItem("hexhaven.name", name.trim());
    const ok = create ? await createLobby(name.trim()) : await join(code.trim().toUpperCase(), name.trim(), spectator);
    if (ok) setSubmitted(true);
  }
  return <main className="entry-page">
    <section className="entry-panel">
      <h1>{create ? "Start a new game" : "Join a game"}</h1>
      <p>{create ? "You will host the room — share the link with your friends." : "Enter the room code from your friend."}</p>
      <form onSubmit={submit} className="entry-form">
        <label className="field"><span className="field-label">Nickname</span>
          <input maxLength={20} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nickname" /></label>
        {!create && <label className="field"><span className="field-label">Room code</span>
          <input maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" className="code-field" inputMode="text" autoCapitalize="characters" /></label>}
        {!create && <label className="checkbox-row"><input type="checkbox" checked={spectator} onChange={(e) => setSpectator(e.target.checked)} /> Watch as spectator</label>}
        <button className="button primary large full" type="submit" disabled={busy || !name.trim() || (!create && code.trim().length !== 6)}>
          {busy ? "Connecting…" : create ? "Create room" : "Join room"}
        </button>
      </form>
      <p className="entry-switch"><Link to={create ? "/join" : "/create"}>{create ? "Join an existing room instead" : "Start a new room instead"}</Link></p>
    </section>
  </main>;
}

/* --- Lobby -------------------------------------------------------------------- */

export function LobbyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { lobby, auth, connected, busy, leave, ready, color, settings, kick, start, join } = useSession();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!auth && code) { const name = localStorage.getItem("hexhaven.name") || ""; if (name) void join(code, name); }
  }, [auth?.code, code]);
  useEffect(() => {
    if (lobby && auth && lobby.state !== "lobby") navigate("/game/" + auth.code, { replace: true });
  }, [lobby?.state, auth?.code, navigate]);
  if (!auth || !lobby || auth.code !== code) {
    return <main className="center-state"><h2>Finding your room…</h2><p>Reconnecting to your game.</p><Link to="/join">Join a different game</Link></main>;
  }
  const me = lobby.players.find((p) => p.id === auth.playerId);
  const host = auth.playerId === lobby.hostId;
  const canStart = lobby.players.length >= 3 && lobby.players.every((p) => p.ready && p.connected);
  const share = location.origin + "/join/" + lobby.code;
  return <main className="lobby-page">
    <div className="lobby-layout">
      <section className="lobby-main surface">
        <div className="lobby-code-row">
          <div>
            <h1 className="lobby-code">Room {lobby.code}</h1>
            <span className="lobby-seat-count">{lobby.players.length} of {lobby.maxPlayers} players seated</span>
          </div>
          <button className="button ghost" onClick={async () => {
            await navigator.clipboard.writeText(share);
            setCopied(true);
            setTimeout(() => setCopied(false), 1700);
          }}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy invite link"}</button>
        </div>
        <div className="lobby-seats">{Array.from({ length: lobby.maxPlayers }, (_, i) => {
          const p = lobby.players[i];
          return <div key={p?.id || i} className={"lobby-seat" + (!p ? " seat-empty" : "")} style={p ? { ["--pl" as string]: PLAYER_COLORS[p.color] } : undefined}>
            <span className="seat-number">{i + 1}</span>
            {p ? <PlayerAvatar name={p.name} color={p.color} size="lg" /> : <span className="empty-avatar"><Users size={20} /></span>}
            <div className="seat-details">
              <strong>{p?.name ?? "Waiting for a player"}{p?.id === lobby.hostId && <Crown size={13} className="host-crown" aria-label="Host" />}</strong>
              {p && !p.connected && <small>Offline</small>}
            </div>
            {p && <span className={"seat-ready" + (p.ready ? " is-ready" : "")}>{p.ready ? <><Check size={13} /> Ready</> : "Not ready"}</span>}
            {p && host && p.id !== auth.playerId && <button className="icon-button seat-kick" title={"Remove " + p.name} aria-label={"Remove " + p.name} onClick={() => kick(p.id)}><X size={15} /></button>}
          </div>;
        })}</div>
        {!auth.spectator && me && <div className="seat-controls">
          <div>
            <span className="field-label">Your color</span>
            <div className="color-swatches">{COLOR_OPTIONS.map((c) =>
              <button key={c} type="button" aria-label={c} aria-pressed={me.color === c}
                className={"color-swatch" + (me.color === c ? " selected" : "")}
                style={{ background: PLAYER_COLORS[c] }}
                disabled={lobby.players.some((p) => p.id !== me.id && p.color === c)}
                onClick={() => color(c)} />)}</div>
          </div>
          <button className={"button " + (me.ready ? "ghost" : "primary")} onClick={() => ready(!me.ready)}>{me.ready ? "Cancel ready" : "Ready up"}</button>
        </div>}
      </section>
      <aside className="lobby-side surface">
        <div className="side-heading">
          <h2>Table settings</h2>
          <p>3–4 classic · 5–6 expanded island house rules</p>
        </div>
        <FieldSelect label="Island layout" value={lobby.settings.boardMode} disabled={!host}
          options={[{ value: "random", label: "Random island" }, { value: "balanced", label: "Balanced random" }, { value: "fixed", label: "Beginner layout" }]}
          onChange={(next) => settings({ ...lobby.settings, boardMode: next as "random" | "balanced" | "fixed" })} />
        <label className="checkbox-row"><input type="checkbox" checked={lobby.settings.allowSpectators} disabled={!host}
          onChange={(e) => settings({ ...lobby.settings, allowSpectators: e.target.checked })} /> Allow spectators</label>
        <button type="button" className="settings-rules-link" onClick={openRules}><BookOpen size={15} /> Rulebook <ArrowRight size={13} /></button>
        <div className="lobby-start">
          <p>{!connected ? "Reconnecting…" : lobby.players.length < 3 ? "Need at least 3 players" : !canStart ? "Waiting for players to ready up" : host ? "Ready to start" : "Waiting for the host"}</p>
          {host && <button className="button wood large full" disabled={!canStart || busy || !connected} onClick={() => void start()}>
            <Play size={17} fill="currentColor" /> Start game</button>}
        </div>
      </aside>
    </div>
    <button className="leave-link" onClick={() => { leave(); navigate("/"); }}><LogOut size={15} /> Leave room</button>
  </main>;
}
