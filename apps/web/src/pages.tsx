/** Menu, lobby, and shared shell for the Catan table. */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowRight, BookOpen, Check, Copy, Crown, LogOut, Play, Users, X } from "lucide-react";
import { BOARD_PLAYER_LIMITS, PLAYER_COLORS as COLOR_OPTIONS, resolveBoardSize } from "@hexhaven/shared";
import { FieldSelect, PlayerAvatar, PLAYER_COLORS } from "./design";
import { EmoteBubble, EmotePicker, EmoteSprite } from "./assets/emotes";
import { useSession } from "./session";
import { openRules } from "./rulebook-modal";
export { GamePage } from "./game-screen";

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
  const [searchParams] = useSearchParams();
  const { create, join, busy, auth } = useSession();
  const [name, setName] = useState(() => localStorage.getItem("hexhaven.name") || "");
  const [code, setCode] = useState(() => (searchParams.get("code") ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6));
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

/* --- Lobby -------------------------------------------------------------------- */

export function LobbyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { lobby, auth, connected, busy, leave, ready, color, settings, kick, start, join, emotes, emote: sendEmote } = useSession();
  const [copied, setCopied] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  useEffect(() => {
    if (!auth && code) { const name = localStorage.getItem("hexhaven.name") || ""; if (name) void join(code, name); }
  }, [auth?.code, code]);
  useEffect(() => {
    if (lobby && auth && lobby.state !== "lobby") navigate("/game/" + auth.code, { replace: true });
  }, [lobby?.state, auth?.code, navigate]);
  if (!auth || !lobby || auth.code !== code) {
    return <main className="center-state"><h2>Finding your room…</h2><p>Reconnecting to your game.</p><Link to="/">Join a different game</Link></main>;
  }
  const me = lobby.players.find((p) => p.id === auth.playerId);
  const host = auth.playerId === lobby.hostId;
  const boardSize = resolveBoardSize(lobby.settings.boardSize ?? "auto", lobby.players.length);
  const boardLimit = BOARD_PLAYER_LIMITS[boardSize];
  const canStart = lobby.players.length >= 3 && lobby.players.length <= boardLimit && lobby.players.every((p) => p.ready && p.connected);
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
          const ping = p && emotes.filter((e) => e.playerId === p.id).at(-1);
          return <div key={p?.id || i} className={"lobby-seat" + (!p ? " seat-empty" : "")} style={p ? { ["--pl" as string]: PLAYER_COLORS[p.color] } : undefined}>
            <span className="seat-number">{i + 1}</span>
            {ping && <span className="seat-emote" key={ping.id}><EmoteBubble name={p!.name} emote={ping.emote} /></span>}
            {p ? <PlayerAvatar name={p.name} color={p.color} size="lg" /> : <span className="empty-avatar"><Users size={20} /></span>}
            <div className="seat-details">
              <strong>{p?.name ?? "Open seat"}{p?.id === lobby.hostId && <Crown size={13} className="host-crown" aria-label="Host" />}</strong>
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
          <div className="lobby-emote-wrap">
            <button type="button" className="button ghost" title="React" aria-label="Send a reaction"
              aria-expanded={emoteOpen} aria-haspopup="menu" onClick={() => setEmoteOpen(!emoteOpen)}>
              <EmoteSprite emote="faceHappy" size={18} /> React
            </button>
            {emoteOpen && <EmotePicker onPick={(picked) => { sendEmote(picked); setEmoteOpen(false); }} onClose={() => setEmoteOpen(false)} />}
          </div>
          <button className={"button " + (me.ready ? "ghost" : "primary")} onClick={() => ready(!me.ready)}>{me.ready ? "Cancel ready" : "Ready up"}</button>
        </div>}
      </section>
      <aside className="lobby-side surface">
        <div className="side-heading">
          <h2>Table settings</h2>
          <p>Classic, expanded, or custom eight-player islands</p>
        </div>
        <FieldSelect label="Board size" value={lobby.settings.boardSize ?? "auto"} disabled={!host}
          options={[{ value: "auto", label: "Automatic (by players)" }, { value: "classic", label: "Classic · 19 hexes · up to 4" }, { value: "expanded", label: "Expanded · 30 hexes · up to 6" }, { value: "grand", label: "Grand · 37 hexes · up to 8" }]}
          onChange={next => settings({ ...lobby.settings, boardSize: next as "auto" | "classic" | "expanded" | "grand" })}
          description={`Current table: ${boardSize === "classic" ? "19" : boardSize === "expanded" ? "30" : "37"} terrain hexes. ${boardSize === "grand" ? "Custom house rules." : boardSize === "expanded" ? "Expanded layout with sequential-turn house rules." : "Classic rules."}`} />
        <FieldSelect label="Island layout" value={lobby.settings.boardMode} disabled={!host}
          options={[{ value: "random", label: "Random island" }, { value: "balanced", label: "Balanced random" }, { value: "fixed", label: "Beginner layout" }]}
          onChange={(next) => settings({ ...lobby.settings, boardMode: next as "random" | "balanced" | "fixed" })} />
        <FieldSelect label="Turn timer" value={String(lobby.settings.turnTimeSeconds ?? 0)} disabled={!host}
          options={[{ value: "0", label: "No time limit" }, { value: "60", label: "1 minute" }, { value: "120", label: "2 minutes" }, { value: "180", label: "3 minutes" }, { value: "300", label: "5 minutes" }]}
          onChange={next => settings({ ...lobby.settings, turnTimeSeconds: Number(next) as 0 | 60 | 120 | 180 | 300 })} />
        <label className="checkbox-row"><input type="checkbox" checked={lobby.settings.allowSpectators} disabled={!host}
          onChange={(e) => settings({ ...lobby.settings, allowSpectators: e.target.checked })} /> Allow spectators</label>
        <button type="button" className="settings-rules-link" onClick={openRules}><BookOpen size={15} /> Rulebook <ArrowRight size={13} /></button>
        <div className="lobby-start">
          <p>{!connected ? "Reconnecting…" : lobby.players.length < 3 ? "Need at least 3 players" : lobby.players.length > boardLimit ? "Choose a larger board" : !canStart ? "Waiting for players to ready up" : host ? "Ready to start" : "Waiting for the host"}</p>
          {host && <button className="button wood large full" disabled={!canStart || busy || !connected} onClick={() => void start()}>
            <Play size={17} fill="currentColor" /> Start game</button>}
        </div>
      </aside>
    </div>
    <button className="leave-link" onClick={() => { leave(); navigate("/"); }}><LogOut size={15} /> Leave room</button>
  </main>;
}
