import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Castle, CircleHelp, Dices, House, Landmark, Route, Search, ScrollText, Shield } from "lucide-react";
import { COSTS, type ResourceHand } from "@hexhaven/shared";
import { Cost } from "./design";
import chapters from "./rules.json";

const QUICK_LINKS = [
  { slug:"setup", title:"Setup", sub:"Place your first settlements and roads.", icon:House },
  { slug:"turns", title:"Turn order", sub:"Roll, trade and build.", icon:Dices },
  { slug:"trading", title:"Trading", sub:"Trade with players or the bank.", icon:Landmark },
  { slug:"robber", title:"Robber", sub:"What happens after a 7.", icon:Shield },
];
const COST_CARDS: {name:string;cost:ResourceHand;icon:typeof House}[] = [
  {name:"Road",cost:COSTS.road,icon:Route},
  {name:"Settlement",cost:COSTS.settlement,icon:House},
  {name:"City",cost:COSTS.city,icon:Castle},
  {name:"Development card",cost:COSTS.development,icon:ScrollText},
];

export function RulebookPage() {
  const {chapter}=useParams();
  const [query,setQuery]=useState("");
  const active=chapters.find(c=>c.slug===chapter);
  const currentIndex=active?chapters.findIndex(c=>c.slug===active.slug):-1;
  const filtered=useMemo(()=>chapters.filter(c=>(c.title+" "+c.summary+" "+c.sections.flat().join(" ")).toLowerCase().includes(query.toLowerCase())),[query]);
  const searching=query.trim().length>0;
  useEffect(()=>{document.title=(active?active.title+" · ":"")+"Rules | Hexhaven";window.scrollTo(0,0);},[active?.slug]);
  return <main className="rules-page">
    <section className="rules-head"><h1>Rules</h1><p>Classic base game · 3–4 players · First to 10 points</p>
      <label className="rules-search"><Search size={19}/><input aria-label="Search rules" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search rules, trading, robber, victory…"/></label>
    </section>
    <div className={"rules-layout"+(searching?" is-searching":"")}>
      <nav className="rules-nav" aria-label="Rulebook chapters"><h3>Contents</h3>
        <Link to="/rules" className={!active?"active":""}><span>✦</span> Overview</Link>
        {filtered.map(c=><Link key={c.slug} className={active?.slug===c.slug?"active":""} to={"/rules/"+c.slug}><span>{String(chapters.findIndex(v=>v.slug===c.slug)+1).padStart(2,"0")}</span>{c.title}</Link>)}
        {filtered.length===0&&<p className="no-results">No matching chapters.</p>}
      </nav>
      <article className="rules-article">{searching?<><h2>Search results</h2><p className="article-lead">{filtered.length===1?"1 chapter":filtered.length+" chapters"} found</p><div className="rule-cards">{filtered.map(c=><Link key={c.slug} className="rule-card" to={"/rules/"+c.slug} onClick={()=>setQuery("")}><strong>{c.title}</strong><p>{c.summary}</p><ArrowRight size={17}/></Link>)}</div>{filtered.length===0&&<p className="no-results">Try a different term.</p>}</>:active?<><h2>{active.title}</h2><p className="article-lead">{active.summary}</p>
          {active.sections.map(([heading,body],i)=><section className="rule-section" key={i}><h3>{heading}</h3><p>{body}</p></section>)}
          {active.slug==="resources"&&<div className="rules-example"><strong>Building costs at a glance</strong><div className="rules-cost-grid">{COST_CARDS.map(item=>{const Icon=item.icon;return <div key={item.name}><strong><Icon size={17}/> {item.name}</strong><Cost cost={item.cost}/></div>})}</div></div>}
          {active.slug==="settlements"&&<div className="rules-example"><strong>Remember the distance rule</strong><p>Every settlement needs one empty corner between it and the nearest settlement or city, regardless of who owns them.</p></div>}
          {active.slug==="robber"&&<div className="rules-example"><strong>After a seven</strong><p>Discard if you have eight or more resource cards, then move the robber and pick an eligible player to steal from.</p></div>}
          <div className="article-navigation">{currentIndex>0?<Link to={"/rules/"+chapters[currentIndex-1]!.slug}><ArrowLeft size={17}/>{chapters[currentIndex-1]!.title}</Link>:<Link to="/rules"><ArrowLeft size={17}/>All chapters</Link>}{currentIndex<chapters.length-1?<Link to={"/rules/"+chapters[currentIndex+1]!.slug}>{chapters[currentIndex+1]!.title}<ArrowRight size={17}/></Link>:<Link to="/create">Play a game <ArrowRight size={17}/></Link>}</div>
        </>:<>
          <h2>Getting started</h2><p className="article-lead">Roll dice to collect resources. Trade and build roads, settlements and cities to reach 10 points.</p>
          <div className="rule-cards">{QUICK_LINKS.map(({slug,title,sub,icon:Icon})=><Link key={slug} to={"/rules/"+slug} className="rule-card"><strong><Icon size={19}/> {title}</strong><p>{sub}</p><ArrowRight size={17}/></Link>)}</div>
          <div className="rules-example"><strong>Building costs</strong><div className="rules-cost-grid">{COST_CARDS.map(item=>{const Icon=item.icon;return <div key={item.name}><strong><Icon size={17}/> {item.name}</strong><Cost cost={item.cost}/></div>})}</div></div>
        </>}
        <div className="rules-source"><CircleHelp size={15}/> This independently written guide summarizes the classic 3–4 player game. See the <a href="https://www.catan.com/understand-catan/game-rules" rel="noopener noreferrer" target="_blank">official CATAN rules</a> for authoritative edition-specific details.</div>
      </article>
    </div>
  </main>;
}
