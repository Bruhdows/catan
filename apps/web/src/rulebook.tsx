import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, BookOpen, Castle, ChevronRight, CircleHelp, Compass, Dices, House, Landmark, Route, Search, ScrollText, Shield } from "lucide-react";
import { COSTS, type ResourceHand } from "@hexhaven/shared";
import { Cost, ResourceToken } from "./design";
import chapters from "./rules.json";

const QUICK_LINKS = [
  { slug:"setup", title:"First game?", sub:"Learn where your first pieces go.", icon:House },
  { slug:"turns", title:"Your turn", sub:"Dice, trading and building.", icon:Dices },
  { slug:"trading", title:"Trading", sub:"Give resources, get resources.", icon:Landmark },
  { slug:"robber", title:"The robber", sub:"What happens when a 7 is rolled.", icon:Shield },
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
  useEffect(()=>{document.title=(active?active.title+" · ":"")+"Rules | Hexhaven";window.scrollTo(0,0);},[active?.slug]);
  return <main className="rules-page">
    <section className="rules-head"><span className="eyebrow"><BookOpen size={17}/> HOW TO PLAY</span><h1>Learn the island.</h1><p>Everything you need to go from your very first settlement to your first victory.</p>
      <label className="rules-search"><Search size={19}/><input aria-label="Search rules" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search rules, trading, robber, victory…"/></label>
    </section>
    <div className="rules-layout">
      <nav className="rules-nav" aria-label="Rulebook chapters"><h3>CHAPTERS</h3>
        <Link to="/rules" className={!active?"active":""}><span>✦</span> Overview</Link>
        {filtered.map(c=><Link key={c.slug} className={active?.slug===c.slug?"active":""} to={"/rules/"+c.slug}><span>{String(chapters.findIndex(v=>v.slug===c.slug)+1).padStart(2,"0")}</span>{c.title}</Link>)}
        {filtered.length===0&&<p className="no-results">No matching chapters.</p>}
      </nav>
      <article className="rules-article">{active?<><span className="article-kicker">CHAPTER {String(currentIndex+1).padStart(2,"0")} OF {chapters.length}</span><h2>{active.title}</h2><p className="article-lead">{active.summary}</p>
          {active.sections.map(([heading,body],i)=><section className="rule-section" key={i}><h3>{heading}</h3><p>{body}</p></section>)}
          {active.slug==="resources"&&<div className="rules-example"><strong>Building costs at a glance</strong><div className="rules-cost-grid">{COST_CARDS.map(item=>{const Icon=item.icon;return <div key={item.name}><strong><Icon size={17}/> {item.name}</strong><Cost cost={item.cost}/></div>})}</div></div>}
          {active.slug==="settlements"&&<div className="rules-example"><strong>Remember the distance rule</strong><p>Every settlement needs one empty corner between it and the nearest settlement or city, regardless of who owns them.</p></div>}
          {active.slug==="robber"&&<div className="rules-example"><strong>After a seven</strong><p>Discard if you have eight or more resource cards, then move the robber and pick an eligible player to steal from.</p></div>}
          <div className="article-navigation">{currentIndex>0?<Link to={"/rules/"+chapters[currentIndex-1]!.slug}><ArrowLeft size={17}/>{chapters[currentIndex-1]!.title}</Link>:<Link to="/rules"><ArrowLeft size={17}/>All chapters</Link>}{currentIndex<chapters.length-1?<Link to={"/rules/"+chapters[currentIndex+1]!.slug}>{chapters[currentIndex+1]!.title}<ArrowRight size={17}/></Link>:<Link to="/create">Play a game <ArrowRight size={17}/></Link>}</div>
        </>:<>
          <span className="article-kicker">THE QUICK START</span><h2>The rules of the island</h2><p className="article-lead">The goal is simple: be the first to reach 10 victory points. Build settlements and cities, collect five types of resources, and trade with your friends.</p>
          <div className="rule-cards">{QUICK_LINKS.map(({slug,title,sub,icon:Icon})=><Link key={slug} to={"/rules/"+slug} className="rule-card"><small>QUICK GUIDE</small><strong><Icon size={19}/> {title}</strong><p>{sub}</p><ArrowRight size={17}/></Link>)}</div>
          <div className="rules-example"><strong>What can I build?</strong><p>All construction costs use the five base resources. Here is a cheat sheet you can reference during your game.</p><div className="rules-cost-grid">{COST_CARDS.map(item=>{const Icon=item.icon;return <div key={item.name}><strong><Icon size={17}/> {item.name}</strong><Cost cost={item.cost}/></div>})}</div></div>
          <h3 className="panel-h3">Every chapter</h3><div className="rule-cards">{chapters.map(c=><Link to={"/rules/"+c.slug} className="rule-card" key={c.slug}><small>CHAPTER {chapters.indexOf(c)+1}</small><strong>{c.title}</strong><p>{c.summary}</p><ChevronRight size={17}/></Link>)}</div>
        </>}
        <div className="rules-source"><CircleHelp size={15}/> This independently written guide summarizes the classic 3–4 player game. See the <a href="https://www.catan.com/understand-catan/game-rules" rel="noopener noreferrer" target="_blank">official CATAN rules</a> for authoritative edition-specific details.</div>
      </article>
    </div>
  </main>;
}
