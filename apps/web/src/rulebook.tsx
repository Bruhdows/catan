import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, CircleHelp, Dices, House, Landmark, Search, Shield } from "lucide-react";
import { COSTS, type ResourceHand } from "@hexhaven/shared";
import { Cost } from "./design";
import { DevCardArt, PieceSprite } from "./assets/art";
import chapters from "./rules.json";

const QUICK_LINKS = [
  { slug:"setup", title:"Setup", sub:"Place your first settlements and roads.", icon:House },
  { slug:"turns", title:"Turn order", sub:"Roll, trade and build.", icon:Dices },
  { slug:"trading", title:"Trading", sub:"Trade with players or the bank.", icon:Landmark },
  { slug:"robber", title:"Robber", sub:"What happens after a 7.", icon:Shield },
];
const COST_CARDS: { name: string; cost: ResourceHand; art: ReactNode }[] = [
  { name: "Road", cost: COSTS.road, art: <PieceSprite kind="road" color="#b3855b" size={24} /> },
  { name: "Settlement", cost: COSTS.settlement, art: <PieceSprite kind="settlement" color="#b3855b" size={24} /> },
  { name: "City", cost: COSTS.city, art: <PieceSprite kind="city" color="#b3855b" size={26} /> },
  { name: "Development card", cost: COSTS.development, art: <DevCardArt type="knight" size={22} /> },
];

/** The distance rule: a settlement's two neighbors along the coast must stay empty. */
function DistanceDiagram() {
  const ink = "#4a3b26";
  return <svg className="rule-diagram" viewBox="-62 -49 124 102" role="img"
    aria-label="Diagram of the distance rule: the two corners beside a settlement must stay empty">
    <polygon points="0,-34 29.4,-17 29.4,17 0,34 -29.4,17 -29.4,-17" fill="#f4e9cf" stroke="#c9b689" strokeWidth="2" />
    <polygon points="0,-27 25.2,-13.5 25.2,13.5 0,27 -25.2,13.5 -25.2,-13.5" fill="var(--t-fields)" stroke="#efe2c2" strokeWidth="1.4" />
    {/* settled corner */}
    <g transform="translate(0 -34)">
      <path d="M-7 8V-1L0-9l7 8v9Z" fill="#4c8f5c" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <path d="M-7-1 0-9l7 8" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    </g>
    {/* forbidden adjacent corners */}
    {[-1, 1].map((s) =>
      <g key={s} transform={`translate(${s * 29.4} -17)`}>
        <circle r="9" fill="#f4dcd2" stroke="#b8473c" strokeWidth="2" strokeDasharray="3.4 2.6" />
        <path d="M-3.6-3.6 3.6 3.6M3.6-3.6-3.6 3.6" stroke="#b8473c" strokeWidth="2.2" strokeLinecap="round" />
      </g>)}
    {/* allowed corner, two gaps away */}
    <g transform="translate(0 34)" opacity=".9">
      <circle r="9" fill="#e2efdd" stroke="#4c8f5c" strokeWidth="2" strokeDasharray="3.4 2.6" />
      <path d="M-5 5V-1L0-6l5 5v6Z" fill="#4c8f5c" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
    </g>
    <text y="-41" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#4c8f5c">settlement</text>
    <text y="-31.5" x={-44} textAnchor="middle" fontSize="8" fontWeight="650" fill="#b8473c" transform="rotate(-60 -44 -31.5)">empty</text>
    <text y="-31.5" x={44} textAnchor="middle" fontSize="8" fontWeight="650" fill="#b8473c" transform="rotate(60 44 -31.5)">empty</text>
    <text y="46" textAnchor="middle" fontSize="8" fontWeight="650" fill="#4a6a52">next corner down is allowed again</text>
  </svg>;
}

export function RulebookPage() {
  const {chapter}=useParams();
  const [query,setQuery]=useState("");
  const active=chapters.find(c=>c.slug===chapter);
  const currentIndex=active?chapters.findIndex(c=>c.slug===active.slug):-1;
  const filtered=useMemo(()=>{
    const term=query.toLowerCase().trim();
    const rank=(c:typeof chapters[number])=>{
      const title=c.title.toLowerCase(),summary=c.summary.toLowerCase();
      if(title===term)return 0;
      if(title.startsWith(term))return 1;
      if(title.includes(term))return 2;
      if(summary.includes(term))return 3;
      return 4;
    };
    return chapters.filter(c=>(c.title+" "+c.summary+" "+c.sections.flat().join(" ")).toLowerCase().includes(term))
      .sort((a,b)=>rank(a)-rank(b));
  },[query]);
  const searching=query.trim().length>0;
  useEffect(()=>{document.title=(active?active.title+" · ":"")+"Rules | Catan";window.scrollTo(0,0);},[active?.slug]);
  return <main className="rules-page">
    <section className="rules-head"><h1>Rules</h1><p>3–4 players: classic · 5–6: expanded island house rules · First to 10 points</p>
      <label className="rules-search"><Search size={18}/><input aria-label="Search rules" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search rules, trading, robber, victory…"/></label>
    </section>
    <div className={"rules-layout"+(searching?" is-searching":"")}>
      <nav className="rules-nav" aria-label="Rulebook chapters"><h3>Contents</h3>
        <Link to="/rules" className={!active?"active":""}><span aria-hidden="true">◈</span> Overview</Link>
        {filtered.map(c=><Link key={c.slug} className={active?.slug===c.slug?"active":""} to={"/rules/"+c.slug}><span>{String(chapters.findIndex(v=>v.slug===c.slug)+1).padStart(2,"0")}</span>{c.title}</Link>)}
        {filtered.length===0&&<p className="no-results">No matching chapters.</p>}
      </nav>
      <article className="rules-article">{searching?<><h2>Search results</h2><p className="article-lead">{filtered.length===1?"1 chapter":filtered.length+" chapters"} found</p><div className="rule-cards">{filtered.map(c=><Link key={c.slug} className="rule-card" to={"/rules/"+c.slug} onClick={()=>setQuery("")}><strong>{c.title}</strong><p>{c.summary}</p><ArrowRight size={16}/></Link>)}</div>{filtered.length===0&&<p className="no-results">Try a different term.</p>}</>:active?<><h2>{active.title}</h2><p className="article-lead">{active.summary}</p>
          {active.sections.map(([heading,body],i)=><section className="rule-section" key={i}><h3>{heading}</h3><p>{body}</p></section>)}
          {active.slug==="resources"&&<div className="rules-example"><strong>Building costs at a glance</strong><div className="rules-cost-grid">{COST_CARDS.map(item=><div key={item.name}><strong>{item.art} {item.name}</strong><Cost cost={item.cost}/></div>)}</div></div>}
          {(active.slug==="setup"||active.slug==="settlements")&&<div className="rules-example"><strong>Remember the distance rule</strong><p>Every settlement needs one empty corner between it and the nearest settlement or city, regardless of who owns them.</p><DistanceDiagram/></div>}
          {active.slug==="robber"&&<div className="rules-example"><strong>After a seven</strong><p>Discard if you have eight or more resource cards, then move the robber and pick an eligible player to steal from.</p></div>}
          <div className="article-navigation">{currentIndex>0?<Link to={"/rules/"+chapters[currentIndex-1]!.slug}><ArrowLeft size={16}/>{chapters[currentIndex-1]!.title}</Link>:<Link to="/rules"><ArrowLeft size={16}/>All chapters</Link>}{currentIndex<chapters.length-1?<Link to={"/rules/"+chapters[currentIndex+1]!.slug}>{chapters[currentIndex+1]!.title}<ArrowRight size={16}/></Link>:<Link to="/">Play a game <ArrowRight size={16}/></Link>}</div>
        </>:<>
          <h2>Getting started</h2><p className="article-lead">Roll dice to collect resources. Trade and build roads, settlements and cities to reach 10 points.</p>
          <div className="rule-cards">{QUICK_LINKS.map(({slug,title,sub,icon:Icon})=><Link key={slug} to={"/rules/"+slug} className="rule-card"><strong><Icon size={17}/> {title}</strong><p>{sub}</p><ArrowRight size={16}/></Link>)}</div>
          <div className="rules-example"><strong>Building costs</strong><div className="rules-cost-grid">{COST_CARDS.map(item=><div key={item.name}><strong>{item.art} {item.name}</strong><Cost cost={item.cost}/></div>)}</div></div>
        </>}
        <div className="rules-source"><CircleHelp size={15}/> This independently written guide explains classic 3–4 player rules. Games with 5–6 players use a larger island and house rules; they do not replicate the official 5–6 player expansion. See the <a href="https://www.catan.com/understand-catan/game-rules" rel="noopener noreferrer" target="_blank">official CATAN rules</a> for authoritative edition-specific details.</div>
      </article>
    </div>
  </main>;
}
