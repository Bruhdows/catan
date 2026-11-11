import { useMemo, useState } from "react";
import { cornerIndexForVertex, cornerPixel, hexToPixel, parseHexKey, type GameView } from "@hexhaven/shared";
import { COLORS } from "./pages";

export type BoardAction = "road" | "settlement" | "city" | "robber" | null;
type Props = { game: GameView; mode: BoardAction; selectable: Set<string>; onVertex: (id:string)=>void; onEdge:(id:string)=>void; onHex:(id:string)=>void };
const TERRAIN:Record<string,{fill:string;stroke:string;label:string;symbol:string}> = {
 forest:{fill:"#497b64",stroke:"#719b73",label:"Forest",symbol:"♠"},
 hills:{fill:"#b77759",stroke:"#d89972",label:"Hills",symbol:"◆"},
 pasture:{fill:"#a9b979",stroke:"#bfd098",label:"Pasture",symbol:"✿"},
 fields:{fill:"#d7bb6b",stroke:"#e3d08e",label:"Fields",symbol:"✦"},
 mountains:{fill:"#8496a0",stroke:"#aab9bd",label:"Mountains",symbol:"▲"},
 desert:{fill:"#d3b58c",stroke:"#e4cfa8",label:"Desert",symbol:"◌"},
 water:{fill:"#2c6274",stroke:"#39778a",label:"Water",symbol:""}
};
const S=62;
const corners=(x:number,y:number)=>Array.from({length:6},(_,i)=>{const a=(i*60+30)*Math.PI/180;return `${(x+S*Math.cos(a)).toFixed(2)},${(y+S*Math.sin(a)).toFixed(2)}`}).join(" ");
function vertexPositions(game:GameView){
 const positions=new Map<string,{x:number;y:number}>();
 for(const v of game.board.vertices){
   const first=game.board.landHexes.find(h=>h.vertices.includes(v.id));
   if(!first)continue;
   const i=cornerIndexForVertex(first.axial,v.id);
   if(i>=0) positions.set(v.id,cornerPixel(first.axial,i,S));
 }
 return positions;
}
function isLand(game:GameView,v:{hexes:string[]}){return v.hexes.some(h=>game.board.landHexes.some(land=>land.id===h));}
export function legalBoardTargets(game:GameView,mode:BoardAction,myId:string | undefined):Set<string>{
 const result=new Set<string>();if(!myId || !mode)return result;
 const me=game.players.find(p=>p.id===myId);if(!me)return result;
 const ownBuilding=new Set([...me.settlements,...me.cities]);
 const ownRoads=new Set(me.roads);
 const allBuildings=new Set(game.players.flatMap(p=>[...p.settlements,...p.cities]));
 const allRoads=new Set(game.players.flatMap(p=>p.roads));
 const blocked=new Set(game.players.filter(p=>p.id!==myId).flatMap(p=>[...p.settlements,...p.cities]));
 const verts=new Map(game.board.vertices.map(v=>[v.id,v]));
 const pending=game.pending;
 if(mode==="robber"){
   for(const h of game.board.landHexes)if(h.id!==game.robberHex)result.add(h.id);
 } else if(mode==="city"){
   for(const v of me.settlements)result.add(v);
 } else if(mode==="settlement"){
   for(const v of game.board.vertices){
     if(!isLand(game,v)||allBuildings.has(v.id)||v.neighbors.some(n=>allBuildings.has(n)))continue;
     if(pending.type==="setup" || me.roads.some(id=>{const e=game.board.edges.find(e=>e.id===id);return e?.a===v.id||e?.b===v.id;}))result.add(v.id);
   }
 } else if(mode==="road"){
   if(pending.type==="setup"){
     if(!pending.needsRoad||!pending.vertex)return result;
     for(const e of game.board.edges)if((e.a===pending.vertex||e.b===pending.vertex)&&!allRoads.has(e.id))result.add(e.id);
   } else for(const e of game.board.edges){
     if(allRoads.has(e.id))continue;
     const connects=(id:string)=>!blocked.has(id) && (ownBuilding.has(id)||game.board.edges.some(r=>ownRoads.has(r.id)&&(r.a===id||r.b===id)));
     if(connects(e.a)||connects(e.b))result.add(e.id);
   }
 }
 void verts;
 return result;
}
export function BoardView({game,mode,selectable,onVertex,onEdge,onHex}:Props){
 const [zoom,setZoom]=useState(1);
 const [offset,setOffset]=useState({x:0,y:0});
 const pos=useMemo(()=>vertexPositions(game),[game.board]);
 const occup=new Map<string,{color:string;city:boolean}>();
 for(const p of game.players) {for(const v of p.settlements)occup.set(v,{color:COLORS[p.color],city:false});for(const v of p.cities)occup.set(v,{color:COLORS[p.color],city:true});}
 const roads=new Map<string,string>();
 for(const p of game.players)for(const e of p.roads)roads.set(e,COLORS[p.color]);
 const range=540/zoom;
 const viewBox=`${-range+offset.x} ${-range*.79+offset.y} ${range*2} ${range*1.58}`;
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{ if(!e.ctrlKey)return;e.preventDefault();setZoom(z=>Math.max(.8,Math.min(2.1,z+(e.deltaY<0?.1:-.1)))); };
 const [drag,setDrag]=useState<{x:number;y:number;originX:number;originY:number}|null>(null);
 return <div className="board-wrap"><div className="board-tools"><span>THE ISLAND</span><div><button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.8,z-.16))}>−</button><button aria-label="Reset map" onClick={()=>{setZoom(1);setOffset({x:0,y:0})}}>⌖</button><button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(2.1,z+.16))}>+</button></div></div>
 <svg className="game-board" viewBox={viewBox} onWheel={wheel} onPointerDown={e=>{if(!(e.target as Element).closest(".board-selectable,.edge-target,.vertex-target")){e.currentTarget.setPointerCapture(e.pointerId);setDrag({x:e.clientX,y:e.clientY,originX:offset.x,originY:offset.y});}}} onPointerMove={e=>{if(drag){const rect=e.currentTarget.getBoundingClientRect();setOffset({x:drag.originX-(e.clientX-drag.x)*range*2/rect.width,y:drag.originY-(e.clientY-drag.y)*range*1.58/rect.height})}}} onPointerUp={()=>setDrag(null)} aria-label="Interactive island board" role="img">
 <defs><pattern id="ocean" patternUnits="userSpaceOnUse" width="42" height="42"><path d="M0 22 Q12 13 24 22 T48 22" fill="none" stroke="#78acb1" strokeOpacity=".12" strokeWidth="1.4"/></pattern><filter id="tile-shadow"><feDropShadow dx="1" dy="2" stdDeviation="3" floodOpacity=".24"/></filter><filter id="piece-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".42"/></filter></defs>
 <rect x="-1200" y="-1200" width="2400" height="2400" fill="#214c5c"/><rect x="-1200" y="-1200" width="2400" height="2400" fill="url(#ocean)"/>
 {game.board.seaHexes.map(id=>{const p=hexToPixel(parseHexKey(id),S);return <polygon key={id} points={corners(p.x,p.y)} fill="#316579" stroke="#39758b" strokeWidth="2" opacity=".78"/>})}
 {game.board.landHexes.map(h=>{const p=hexToPixel(h.axial,S),t=TERRAIN[h.terrain]!,active=mode==="robber"&&selectable.has(h.id);return <g key={h.id} className={active?"board-selectable":""} onClick={()=>active&&onHex(h.id)} role={active?"button":undefined} aria-label={active?"Move robber to "+t.label:undefined}><polygon points={corners(p.x,p.y)} fill={t.fill} stroke={active?"#fff6c8":t.stroke} strokeWidth={active?5:3} filter="url(#tile-shadow)" className={active?"hex-clickable":""}/><polygon points={corners(p.x,p.y)} fill="none" stroke="#152c2c" strokeOpacity=".13" strokeWidth="12"/><text x={p.x-26} y={p.y-20} fontSize="35" fill={t.stroke} opacity=".32">{t.symbol}</text><text x={p.x+13} y={p.y+30} fontSize="31" fill={t.stroke} opacity=".24">{t.symbol}</text>{h.number!=null&&<g><circle cx={p.x} cy={p.y} r="18" fill="#f7ead0" stroke="#88745c" strokeWidth="2"/><text x={p.x} y={p.y+4} fill={[6,8].includes(h.number)?"#af4334":"#4a4135"} fontWeight="800" fontSize="16" textAnchor="middle">{h.number}</text><text x={p.x} y={p.y+13} fill="#867159" fontSize="5" textAnchor="middle">{"•".repeat(h.number===2||h.number===12?1:6-Math.abs(7-h.number))}</text></g>}{game.robberHex===h.id&&<g transform={`translate(${p.x+28} ${p.y-25})`} filter="url(#piece-shadow)"><circle r="13" fill="#26313b" stroke="#f0cf8a" strokeWidth="2"/><path d="M-5 7V-4a5 5 0 0 1 10 0V7Z" fill="#d2bd91"/></g>}</g>})}
 {game.board.ports.map(port=>{const a=pos.get(port.vertices[0]),b=pos.get(port.vertices[1]);if(!a||!b)return null;const x=(a.x+b.x)/2,y=(a.y+b.y)/2;const k=port.landHex.split(",").map(Number);const land=hexToPixel({q:k[0]!,r:k[1]!},S);const dx=x-land.x,dy=y-land.y;const d=Math.hypot(dx,dy)||1;return <g key={port.id} transform={`translate(${x+dx/d*25} ${y+dy/d*25})`}><circle r="15" fill="#eed9af" stroke="#786447" strokeWidth="2"/><text textAnchor="middle" y="-1" fontWeight="bold" fontSize="10" fill="#3e3a34">{port.ratio}:1</text><text textAnchor="middle" y="9" fontSize="7" fill="#3e3a34">{port.resource?.slice(0,3)??"ANY"}</text></g>})}
 {game.board.edges.map(e=>{const a=pos.get(e.a),b=pos.get(e.b);if(!a||!b)return null;const owned=roads.get(e.id),allowed=mode==="road"&&selectable.has(e.id);return <g key={e.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={allowed?24:8} className={allowed?"edge-target":""} onClick={()=>allowed&&onEdge(e.id)}/>{owned&&<><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#162a34" strokeWidth="13" strokeLinecap="round"/><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={owned} strokeWidth="8" strokeLinecap="round"/></>}{allowed&&<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff1b0" strokeDasharray="4 6" strokeWidth="8" strokeLinecap="round" className="placement-hint" pointerEvents="none"/>}</g>})}
 {game.board.vertices.map(v=>{const p=pos.get(v.id);if(!p)return null;const owned=occup.get(v.id),allowed=(mode==="settlement"||mode==="city")&&selectable.has(v.id);if(!owned&&!allowed)return null;return <g key={v.id} transform={`translate(${p.x} ${p.y})`} onClick={()=>allowed&&onVertex(v.id)} className={allowed?"vertex-target":""} role={allowed?"button":undefined} aria-label={allowed?(mode==="city"?"Upgrade city":"Build settlement"):undefined} filter="url(#piece-shadow)">{allowed&&<circle r="14" fill="#fff3b4" fillOpacity=".5" stroke="#fff3b4" strokeWidth="2" className="placement-hint"/>}{owned&&<g><path d={owned.city?"M-12 10V-7L-3-14 6-6 12-10 12 10Z":"M-10 10V-3L0-12 10-3V10Z"} fill={owned.color} stroke="#25313b" strokeWidth="2.5"/><rect x="-3" y="1" width="6" height="9" fill="#243543" fillOpacity=".55"/>{owned.city&&<rect x="5" y="-3" width="4" height="5" fill="#f9e7b9"/>}</g>}{allowed&&<circle r="18" fill="transparent"/>}</g>})}
 </svg><div className="board-legend">Drag on the sea to pan · Ctrl + scroll to zoom · <span>Click glowing spots to place</span></div></div>;
}
