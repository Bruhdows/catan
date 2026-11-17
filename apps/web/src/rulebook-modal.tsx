import { useEffect, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import chapters from "./rules.json";

const EVENT = "catan:open-rules";
export function openRules() { window.dispatchEvent(new Event(EVENT)); }

export function RulebookModal() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(chapters[0]!.slug);
  const [query, setQuery] = useState("");
  useEffect(() => { const show = () => setOpen(true); window.addEventListener(EVENT, show); return () => window.removeEventListener(EVENT, show); }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dismiss = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", dismiss);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", dismiss); };
  }, [open]);
  if (!open) return null;
  const matches = chapters.filter(c => (c.title + " " + c.summary + " " + c.sections.flat().join(" ")).toLowerCase().includes(query.toLowerCase()));
  const chapter = chapters.find(c => c.slug === active) ?? chapters[0]!;
  return <div className="rules-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
    <section className="rules-popup" role="dialog" aria-modal="true" aria-label="Catan rules">
      <div className="rules-popup-head"><div><h2><BookOpen size={24} /> Rules</h2><p>3–4 classic · 5–6 expanded · 7–8 custom house rules</p></div><button className="rules-popup-close" onClick={() => setOpen(false)} aria-label="Close rules"><X size={22}/></button></div>
      <label className="rules-popup-search"><Search size={17}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search rules…" aria-label="Search rules" /></label>
      <div className="rules-popup-body">
        <nav className="rules-popup-nav" aria-label="Rule chapters">{matches.map(c => <button key={c.slug} className={active === c.slug ? "selected" : ""} onClick={() => { setActive(c.slug); document.querySelector(".rules-popup-content")?.scrollTo(0,0); }}>{c.title}</button>)}{matches.length === 0 && <p>No matching chapters.</p>}</nav>
        <article className="rules-popup-content"><h3>{chapter.title}</h3><p className="rules-popup-summary">{chapter.summary}</p>{chapter.sections.map(([heading, body], i) => <section key={i}><h4>{heading}</h4><p>{body}</p></section>)}</article>
      </div>
      <div className="rules-popup-foot">5–8 players use larger boards and sequential-turn house rules. <a href="https://www.catan.com/understand-catan/game-rules" target="_blank" rel="noopener noreferrer">Official CATAN rules</a></div>
    </section>
  </div>;
}
