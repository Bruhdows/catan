import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BookOpen, Copy, Crown, History, LogOut, Scroll, Clock3, Volume2, VolumeX, X, Layers3 } from "lucide-react";
import { RESOURCES, emptyHand, type GameCommand, type GameView, type ResourceHand } from "@hexhaven/shared";
import { legalBoardTargets, BoardView, type BoardAction } from "./board-view";
import { BuildPanel, CardsPanel, DiscardPicker, HistoryPanel, TradePanel } from "./game-panels";
import { PLAYER_COLORS, PlayerAvatar } from "./design";
import { AwardIcon, DiceFace, PieceSprite, ResourceIcon } from "./assets/art";
import { playCue } from "./sound";
import { useSession } from "./session";
import { openRules } from "./rulebook-modal";

type Panel = "build" | "trade" | "cards" | "log" | null;

function phasePrompt(game: GameView, meId?: string): { title: string; note?: string; tone: "mine" | "wait" | "robber" } {
  const pending = game.pending;
  const active = pending.type === "setup" ? game.players.find((p) => p.id === pending.player) : game.players[game.turnIndex];
  const myTurn = Boolean(meId && active?.id === meId);
  if (game.phase === "finished") return { title: "Match over", tone: "wait" };
  if (pending.type === "setup") {
    if (myTurn) return pending.needsRoad
      ? { title: "Place a road", note: "Pick a glowing edge by your settlement", tone: "mine" }
      : { title: "Place a settlement", note: "Pick a glowing corner", tone: "mine" };
    return { title: `${active?.name} is placing`, tone: "wait" };
  }
  if (pending.type === "discard") {
    const mine = pending.players.some((p) => p.playerId === meId);
    return mine ? { title: `Discard ${pending.players.find((p) => p.playerId === meId)?.count} cards`, tone: "robber" }
      : { title: "Waiting for discards", tone: "robber" };
  }
  if (pending.type === "robberMove") return myTurn ? { title: "Move the robber", note: "Choose a tile", tone: "robber" } : { title: "Robber is moving", tone: "wait" };
  if (pending.type === "robberSteal") return myTurn ? { title: "Choose who to rob", tone: "robber" } : { title: "Waiting for the steal", tone: "wait" };
  if (pending.type === "roadBuilding") return myTurn
    ? { title: `Place ${pending.remaining} free road${pending.remaining === 1 ? "" : "s"}`, tone: "mine" }
    : { title: "Roads being placed", tone: "wait" };
  if (game.phase === "roll") return myTurn ? { title: "Roll the dice", tone: "mine" } : { title: `${active?.name}'s turn`, tone: "wait" };
  return myTurn ? { title: "Your turn", tone: "mine" } : { title: `${active?.name}'s turn`, tone: "wait" };
}

/* --- Player roster ----------------------------------------------------------- */

function Roster({ game, meId }: { game: GameView; meId?: string }) {
  const activeId = game.pending.type === "setup" ? game.pending.player : game.players[game.turnIndex]?.id;
  return <ol className="roster" aria-label="Players and victory points">
    {game.players.map((player) => {
      const active = activeId === player.id;
      return <li key={player.id}
        className={"roster-plate" + (active ? " active" : "") + (player.id === meId ? " mine" : "") + (player.connected ? "" : " offline")}
        style={{ ["--pl" as string]: PLAYER_COLORS[player.color] }}>
        <span className="roster-marker" aria-hidden="true"><PieceSprite kind="settlement" color={PLAYER_COLORS[player.color]} size={26} /></span>
        <span className="roster-name">{player.name}</span>
        <span className="roster-awards">
          {player.hasLongestRoad && <span className="award-chip" title="Longest Road"><AwardIcon award="longestRoad" size={14} /></span>}
          {player.hasLargestArmy && <span className="award-chip" title="Largest Army"><AwardIcon award="largestArmy" size={14} /></span>}
        </span>
        <span className="roster-card-count" title={`${player.resourceCount} resource cards`}><Layers3 size={12} aria-hidden /> {player.resourceCount}</span>
        <span className="roster-dev-count" title={`${player.devCount} development cards`}><Scroll size={12} aria-hidden /> {player.devCount}</span>
        <span className="roster-pts" title="Visible victory points"><Crown size={13} aria-hidden /> <b>{player.publicPoints}</b><i>/10</i></span>
      </li>;
    })}
  </ol>;
}

/* --- Dice --------------------------------------------------------------------- */

function DiceTray({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!rolling) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 90);
    return () => window.clearInterval(id);
  }, [rolling]);
  const shown = rolling && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? faces : dice;
  if (!shown) return null;
  return <div className={"dice-tray" + (rolling ? " is-rolling" : "")} aria-label={`Last roll: ${shown[0]} and ${shown[1]}`}>
    <DiceFace value={shown[0]} size={38} rolling={rolling} />
    <DiceFace value={shown[1]} size={38} rolling={rolling} />
    <b>{shown[0] + shown[1]}</b>
  </div>;
}

function TurnClock({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  if (deadline === null) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={"turn-clock" + (seconds <= 15 ? " urgent" : "")} aria-label={`${seconds} seconds left in turn`} title="Turn time remaining"><Clock3 size={15} /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2,"0")}</span>;
}

/* --- Resource hand ------------------------------------------------------------ */

function Hand({ hand, points, devCount }: { hand: ResourceHand; points: number | null; devCount: number }) {
  return <div className="hand" aria-label="Your resource cards">
    {RESOURCES.map(resource => {
      const total = hand[resource];
      // Render individual overlapping cards. Cap just the visual layers: the
      // counter always reflects the full authoritative hand, even at 30+.
      const layers = Math.max(1, Math.min(total, 9));
      return <div key={resource} className={"hand-stack r-" + resource + (total === 0 ? " empty" : "")}
          title={`${resource}: ${total}`} role="group" aria-label={`${total} ${resource} cards`}
          style={{ ["--visible" as string]: layers }}>
        {Array.from({ length: layers }, (_, index) =>
          <div key={index} className={"hand-stack-card" + (index === layers - 1 ? " top" : "")}
            style={{ ["--layer" as string]: index }} aria-hidden="true">
            {index === layers - 1 && <ResourceIcon resource={resource} size={27} />}
          </div>)}
        <b className="hand-stack-total" key={total}>{total}</b>
      </div>;
    })}
    <div className="hand-side">
      <span className="hand-tokens" title="Development cards"><Scroll size={15} aria-hidden /> {devCount}</span>
      <span className="hand-vp" title="Your victory points, including hidden cards">
        <Crown size={15} aria-hidden /> <b>{points ?? "–"}</b><i>VP</i>
      </span>
    </div>
  </div>;
}

/* --- Page ---------------------------------------------------------------------- */

export function GamePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { auth, lobby, game, command, join, leave, reset, connected, busy } = useSession();
  const [mode, setMode] = useState<BoardAction>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [audio, setAudio] = useState(() => localStorage.getItem("hexhaven.audio") === "yes");
  const [menu, setMenu] = useState(false);
  const [rolling, setRolling] = useState(false);
  const rollStart = useRef(0);
  const previous = useRef<{ seed: string; rev: number } | null>(null);

  useEffect(() => { if (!auth && code) { const name = localStorage.getItem("hexhaven.name"); if (name) void join(code, name); } }, [auth?.code, code]);
  useEffect(() => { if (auth && lobby?.state === "lobby") navigate("/lobby/" + auth.code, { replace: true }); }, [auth?.code, lobby?.state, navigate]);

  const setupNeedsRoad = game?.pending.type === "setup" ? game.pending.needsRoad : undefined;
  useEffect(() => {
    if (!game) return;
    if (game.pending.type === "setup") setMode(game.pending.needsRoad ? "road" : "settlement");
    else if (game.pending.type === "roadBuilding") setMode("road");
    else if (game.pending.type === "robberMove") setMode("robber");
    else setMode(null);
  }, [game?.pending.type, setupNeedsRoad, game?.phase, game?.turnIndex]);

  useEffect(() => {
    if (!game) return;
    const last = previous.current;
    previous.current = { seed: game.seed, rev: game.rev };
    if (!audio || !last || last.seed !== game.seed || last.rev === game.rev) return;
    const tone = game.log.at(-1)?.tone;
    if (game.phase === "finished") playCue("victory");
    else if (tone === "roll") playCue("roll");
    else if (tone === "trade") playCue("trade");
    else if (tone === "action") playCue("build");
  }, [game?.rev, game?.seed, audio]);

  // The tumble lasts a beat; the server's dice settle it.
  useEffect(() => {
    if (!rolling || !game?.dice) return;
    const wait = Math.max(0, 800 - (Date.now() - rollStart.current));
    const t = setTimeout(() => setRolling(false), wait);
    return () => clearTimeout(t);
  }, [game?.dice, rolling]);

  const activeId = game?.pending.type === "setup" ? game.pending.player : game?.players[game.turnIndex]?.id;
  const mine = Boolean(auth && !auth.spectator && activeId === auth.playerId);
  const setupMine = game?.pending.type === "setup" && game.pending.player === auth?.playerId;
  const canBuild = Boolean(mine && game?.phase === "main" && game.pending.type === "none");
  const canRoll = Boolean(mine && game?.phase === "roll" && game.pending.type === "none");
  const canPlayCard = Boolean(mine && ["roll", "main"].includes(game?.phase ?? "") && game?.pending.type === "none");
  const hand = game?.you?.resources ?? emptyHand();

  const allowed = useMemo(
    () => game && (game.phase === "setup" ? setupMine : mine) ? legalBoardTargets(game, mode, auth?.playerId) : new Set<string>(),
    [game, mode, setupMine, mine, auth?.playerId],
  );

  const send = async (cmd: GameCommand) => {
    const ok = await command(cmd);
    if (ok && ["placeRoad", "placeSettlement", "upgradeCity"].includes(cmd.type) && game?.pending.type === "none") setMode(null);
    if (ok && cmd.type === "buyDevelopment") setPanel("cards");
    return ok;
  };
  const changeMode = (next: BoardAction) => { setMode(next); if (next) setPanel(null); };
  const onVertex = (id: string) => {
    if (!allowed.has(id)) return;
    if (mode === "settlement") void send({ type: "placeSettlement", vertex: id });
    if (mode === "city") void send({ type: "upgradeCity", vertex: id });
  };
  const onEdge = (id: string) => { if (allowed.has(id) && mode === "road") void send({ type: "placeRoad", edge: id }); };
  const onHex = (id: string) => { if (allowed.has(id) && mode === "robber") void send({ type: "moveRobber", hex: id }); };
  const togglePanel = (next: Exclude<Panel, null>) => { setPanel(panel === next ? null : next); if (game?.pending.type === "none") setMode(null); };
  const toggleAudio = () => { setAudio(!audio); localStorage.setItem("hexhaven.audio", audio ? "no" : "yes"); if (!audio) playCue("turn"); };
  const doRoll = () => {
    if (!canRoll || rolling) return;
    setRolling(true);
    rollStart.current = Date.now();
    void send({ type: "rollDice" });
  };

  if (!auth || !lobby || auth.code !== code) {
    return <main className="center-state"><h2>Rejoining your game…</h2><p>Restoring your seat at the table.</p><Link to="/">Join a different room</Link></main>;
  }
  if (!game) return <main className="center-state"><div className="spinner" /><h2>Preparing the island…</h2><p>Waiting for the other players.</p></main>;

  const prompt = mode && game.pending.type === "none"
    ? { title: mode === "road" ? "Place a road" : mode === "city" ? "Upgrade a settlement" : "Place a settlement",
        note: mode === "road" ? "Pick a glowing edge" : "Pick a glowing corner", tone: "mine" as const }
    : phasePrompt(game, auth.playerId);
  const needsDiscard = game.pending.type === "discard" && game.pending.players.some((p) => p.playerId === auth.playerId);
  const incomingOffers = game.offers.filter((o) => o.to === auth.playerId && o.status === "pending" && !o.counter);
  const devCount = game.you?.devCards.length ?? 0;
  const gameOver = game.phase === "finished";
  const waitingAction = canRoll ? "roll" : canBuild ? "end" : null;
  const renderTurnAction = () => canRoll
    ? <button className="button wood primary-action" disabled={busy || !connected || rolling} onClick={doRoll}>
        <DiceFace value={1} size={22} /> {rolling ? "Rolling…" : "Roll dice"}
      </button>
    : waitingAction === "end"
      ? <button className="button wood primary-action" disabled={busy || !connected} onClick={() => void send({ type: "endTurn" })}>End turn</button>
      : <span className="dock-wait">{mine ? "Your move" : gameOver ? "Match over" : "Waiting…"}</span>;
  const tableTools = <div className="hud-tools">
    <TurnClock deadline={lobby.turnDeadline ?? null} />
    <button type="button" onClick={openRules} className="hud-tool" title="Rulebook" aria-label="Open rulebook"><BookOpen size={17} /></button>
    <button className="hud-tool" aria-label={audio ? "Mute sounds" : "Enable sounds"} title={audio ? "Mute sounds" : "Enable sounds"} onClick={toggleAudio}>
      {audio ? <Volume2 size={17} /> : <VolumeX size={17} />}
    </button>
    <div className="hud-menu-wrap">
      <button className="hud-tool" aria-label="Game menu" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}><span className="hud-dots" aria-hidden>•••</span></button>
      {menu && <div className="game-menu" role="menu">
        <button role="menuitem" onClick={() => { openRules(); setMenu(false); }}><BookOpen size={15} /> Rulebook</button>
        <button role="menuitem" onClick={() => { toggleAudio(); setMenu(false); }}>{audio ? <VolumeX size={15} /> : <Volume2 size={15} />} {audio ? "Mute sounds" : "Enable sounds"}</button>
        <button role="menuitem" onClick={() => { void navigator.clipboard.writeText(window.location.origin + "/join/" + code); setMenu(false); }}><Copy size={15} /> Copy invite link</button>
        <button role="menuitem" onClick={() => { leave(); navigate("/"); }}><LogOut size={15} /> Leave game</button>
      </div>}
    </div>
  </div>;

  return <main className="game">
    <header className="hud" aria-label="Compact game status">
      <Roster game={game} meId={auth.playerId} />
      {tableTools}
    </header>

    <section className="table">
      <div className="board-area">
        <BoardView game={game} mode={mode} selectable={allowed} onVertex={onVertex} onEdge={onEdge} onHex={onHex} />
        <div className={"turn-plate tone-" + prompt.tone} role="status">
          <strong>{prompt.title}</strong>
          {prompt.note && <span>{prompt.note}</span>}
        </div>
        {game.dice && <DiceTray dice={game.dice} rolling={rolling} />}
        {incomingOffers.length > 0 && !gameOver &&
          <button className="offer-note" onClick={() => togglePanel("trade")}>
            <span aria-hidden>⇄</span>
            {incomingOffers.length === 1
              ? <>{game.players.find((p) => p.id === incomingOffers[0]!.from)?.name} proposes a trade</>
              : <>{incomingOffers.length} trade offers waiting</>}
            <b>Review</b>
          </button>}
        {mode && game.pending.type === "none" &&
          <button className="placement-cancel" onClick={() => setMode(null)}><X size={13} /> Cancel</button>}
        {panel && <aside className="drawer" aria-label={panel === "log" ? "Game log" : panel + " controls"}>
          <header className="drawer-head">
            <h2>{panel === "build" ? "Build" : panel === "trade" ? "Trade" : panel === "cards" ? "Development cards" : "Game log"}</h2>
            <button className="drawer-close" aria-label="Close panel" onClick={() => setPanel(null)}><X size={18} /></button>
          </header>
          <div className="drawer-body">
            {panel === "build" && <BuildPanel game={game} meId={auth.playerId} hand={hand} canBuild={canBuild} mode={mode} onMode={changeMode} send={send} />}
            {panel === "trade" && <TradePanel game={game} meId={auth.playerId} canTrade={canBuild} hand={hand} send={send} />}
            {panel === "cards" && <CardsPanel game={game} meId={auth.playerId} canPlay={canPlayCard} send={send} />}
            {panel === "log" && <HistoryPanel game={game} />}
          </div>
        </aside>}
      </div>
      <aside className="table-sidebar" aria-label="Players, activity and bank">
        <div className="table-sidebar-toolbar">
          <strong>CATAN</strong>
          {tableTools}
        </div>
        <section className="table-sidebar-players" aria-label="Player standings">
          <div className="table-sidebar-head"><span>PLAYERS</span><span className="sidebar-count">{game.players.length} seated</span></div>
          <Roster game={game} meId={auth.playerId} />
        </section>
        <nav className="sidebar-actions" aria-label="Game actions">
          <button className={"sidebar-action" + (panel === "build" ? " selected" : "")} title="Build" aria-label="Build" aria-pressed={panel === "build"} onClick={() => togglePanel("build")}><PieceSprite kind="settlement" color="#ae8051" size={23} /></button>
          <button className={"sidebar-action" + (panel === "trade" ? " selected" : "")} title="Trade" aria-label="Trade" aria-pressed={panel === "trade"} onClick={() => togglePanel("trade")}><span aria-hidden="true" className="sidebar-trade-icon">⇄</span>{incomingOffers.length > 0 && <i className="dock-badge">{incomingOffers.length}</i>}</button>
          <button className={"sidebar-action" + (panel === "cards" ? " selected" : "")} title="Development cards" aria-label="Development cards" aria-pressed={panel === "cards"} onClick={() => togglePanel("cards")}><Scroll size={21} />{devCount > 0 && <i className="dock-badge">{devCount}</i>}</button>
        </nav>
        <div className="table-sidebar-head activity-heading"><span>GAME ACTIVITY</span><span className="round-indicator">Turn {game.turnCount || "—"}</span></div>
        <div className="table-activity" aria-live="off">
          {[...game.log].slice(-9).reverse().map((entry, index) =>
            <div className={"table-activity-line activity-" + entry.tone} key={`${entry.rev}-${index}`}>
              <span className="table-activity-turn">{entry.turn ? `T${entry.turn}` : "•"}</span>
              <span>{entry.text}</span>
            </div>)}
        </div>
        <div className="table-sidebar-bank">
          <div className="table-sidebar-head"><span>BANK</span></div>
          <div className="table-bank-resources">{RESOURCES.map(resource =>
            <div className="table-bank-item" key={resource} title={`${resource}: ${game.bank[resource]} remaining`}>
              <ResourceIcon resource={resource} size={24} /><strong>{game.bank[resource]}</strong>
            </div>)}</div>
        </div>
        <div className="sidebar-turn-control">{renderTurnAction()}</div>
      </aside>

    </section>

    <footer className="dock">
      <Hand hand={hand} points={game.you?.totalPoints ?? null} devCount={devCount} />
      <nav className="dock-actions" aria-label="Mobile game actions">
        <button className={"dock-tile" + (panel === "build" ? " open" : "")} title="Build" aria-label="Build" aria-pressed={panel === "build"} onClick={() => togglePanel("build")}> <PieceSprite kind="settlement" color="#b3855b" size={24} /></button>
        <button className={"dock-tile" + (panel === "trade" ? " open" : "")} title="Trade" aria-label="Trade" aria-pressed={panel === "trade"} onClick={() => togglePanel("trade")}><span className="dock-tile-icon" aria-hidden>⇄</span>{incomingOffers.length > 0 && <i className="dock-badge">{incomingOffers.length}</i>}</button>
        <button className={"dock-tile" + (panel === "cards" ? " open" : "")} title="Development cards" aria-label="Development cards" aria-pressed={panel === "cards"} onClick={() => togglePanel("cards")}><Scroll size={23} />{devCount > 0 && <i className="dock-badge">{devCount}</i>}</button>
        <button className={"dock-tile" + (panel === "log" ? " open" : "")} title="Game log" aria-label="Game log" aria-pressed={panel === "log"} onClick={() => togglePanel("log")}><History size={23} /></button>
      </nav>
      <div className="dock-primary">{renderTurnAction()}</div>
    </footer>

    {needsDiscard && game.pending.type === "discard" &&
      <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Discard resources">
        <div className="game-dialog">
          <h2>Discard cards</h2>
          <p>The robber takes half of a large hand. Choose {game.pending.players.find((p) => p.playerId === auth.playerId)?.count} cards to lose.</p>
          <DiscardPicker hand={hand} count={game.pending.players.find((p) => p.playerId === auth.playerId)?.count ?? 0} send={send} />
        </div>
      </div>}

    {game.pending.type === "robberSteal" && mine &&
      <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Choose a player to rob">
        <div className="game-dialog">
          <h2>Who will you rob?</h2>
          <p>One neighboring player on the robbed tile loses a random resource to you.</p>
          <div className="victim-list">
            {game.pending.candidates.map((id) => {
              const target = game.players.find((p) => p.id === id);
              return <button key={id} className="victim" onClick={() => void send({ type: "selectVictim", player: id })}>
                {target && <PlayerAvatar color={target.color} name={target.name} size="sm" />}
                <strong>{target?.name ?? "Player"}</strong>
              </button>;
            })}
          </div>
        </div>
      </div>}

    {gameOver &&
      <div className="dialog-backdrop victory-backdrop" role="dialog" aria-modal="true" aria-label="Match results">
        <div className="game-dialog winner-dialog">
          <div className="winner-crown" aria-hidden><Crown size={34} /></div>
          <h2>{game.players.find((p) => p.id === game.winnerId)?.name ?? "A player"} wins</h2>
          <ol className="standings">
            {[...game.players].sort((a, b) => b.publicPoints - a.publicPoints).map((p, i) =>
              <li key={p.id} className={p.id === game.winnerId ? "winner" : ""}>
                <span className="standings-place">{i + 1}</span>
                <PlayerAvatar name={p.name} color={p.color} size="sm" />
                <strong>{p.name}</strong>
                <b>{p.publicPoints} VP</b>
              </li>)}
          </ol>
          {lobby.hostId === auth.playerId
            ? <button className="button wood full" onClick={async () => { if (await reset()) navigate("/lobby/" + code); }}>Play again</button>
            : <span className="small muted">Waiting for the host to start a rematch.</span>}
        </div>
      </div>}

    {!connected && <div className="offline-note">Reconnecting to your match…</div>}
  </main>;
}
