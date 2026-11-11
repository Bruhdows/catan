import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { BrickWall, Cloud, Compass, Mountain, RotateCcw, Trees, Wheat, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { cornerIndexForVertex, cornerPixel, hexToPixel, parseHexKey, tokenPips, type GameView, type Resource } from "@hexhaven/shared";
import { PLAYER_COLORS, ResourceIcon } from "./design";

export type BoardAction = "road" | "settlement" | "city" | "robber" | null;
type Props = {
  game: GameView;
  mode: BoardAction;
  selectable: Set<string>;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
  onHex: (id: string) => void;
};

type TileTheme = { base: string; light: string; border: string; ink: string; name: string; icon: LucideIcon };
const THEMES: Record<string, TileTheme> = {
  forest: { base: "#55aa72", light: "#80ca8b", border: "#36865e", ink: "#275f45", name: "Forest · Lumber", icon: Trees },
  hills: { base: "#eb9b72", light: "#f9bc94", border: "#c97655", ink: "#995d41", name: "Hills · Brick", icon: BrickWall },
  pasture: { base: "#b6da7b", light: "#d1e79a", border: "#84b25b", ink: "#648544", name: "Pasture · Wool", icon: Cloud },
  fields: { base: "#f1c768", light: "#ffe19a", border: "#d4a147", ink: "#a57a32", name: "Fields · Grain", icon: Wheat },
  mountains: { base: "#9fb4c0", light: "#d6e2dd", border: "#748c9a", ink: "#627987", name: "Mountains · Ore", icon: Mountain },
  desert: { base: "#e9c99b", light: "#f8e0b4", border: "#cfac78", ink: "#ad885b", name: "Desert", icon: Compass },
};
const SIZE=62;

function hexPoints(x:number,y:number,r=SIZE) {
  return Array.from({length:6},(_,i)=>{const a=(i*60+30)*Math.PI/180;return (x+r*Math.cos(a)).toFixed(2)+","+(y+r*Math.sin(a)).toFixed(2)}).join(" ");
}
function positions(game: GameView) {
  const map=new Map<string,{x:number;y:number}>();
  const land=new Map(game.board.landHexes.map(h=>[h.id,h]));
  for(const v of game.board.vertices) {
    const h=v.hexes.map(id=>land.get(id)).find(Boolean);
    if(!h)continue;
    const i=cornerIndexForVertex(h.axial,v.id);
    if(i>=0)map.set(v.id,cornerPixel(h.axial,i,SIZE));
  }
  return map;
}

export function legalBoardTargets(game:GameView, mode:BoardAction, myId:string|undefined):Set<string> {
  const result=new Set<string>();
  if(!myId||!mode)return result;
  const me=game.players.find(p=>p.id===myId);
  if(!me)return result;
  const ownBuildings=new Set([...me.settlements,...me.cities]);
  const occupiedBuildings=new Set(game.players.flatMap(p=>[...p.settlements,...p.cities]));
  const occupiedRoads=new Set(game.players.flatMap(p=>p.roads));
  const opponentBuildings=new Set(game.players.filter(p=>p.id!==myId).flatMap(p=>[...p.settlements,...p.cities]));
  const ownRoads=new Set(me.roads);
  const edges=game.board.edges;
  const pending=game.pending;
  if(mode==="robber"){
    for(const hex of game.board.landHexes)if(hex.id!==game.robberHex)result.add(hex.id);
  } else if(mode==="city"){
    for(const vertex of me.settlements)result.add(vertex);
  } else if(mode==="settlement"){
    for(const vertex of game.board.vertices){
      if(occupiedBuildings.has(vertex.id)||vertex.neighbors.some(n=>occupiedBuildings.has(n)))continue;
      if(pending.type==="setup"||edges.some(e=>ownRoads.has(e.id)&&(e.a===vertex.id||e.b===vertex.id)))result.add(vertex.id);
    }
  } else if(mode==="road"){
    if(pending.type==="setup"){
      if(!pending.needsRoad||!pending.vertex)return result;
      for(const e of edges)if(!occupiedRoads.has(e.id)&&(e.a===pending.vertex||e.b===pending.vertex))result.add(e.id);
    } else for(const e of edges) {
      if(occupiedRoads.has(e.id))continue;
      const connected=(v:string)=>!opponentBuildings.has(v)&&(ownBuildings.has(v)||edges.some(existing=>ownRoads.has(existing.id)&&(existing.a===v||existing.b===v)));
      if(connected(e.a)||connected(e.b))result.add(e.id);
    }
  }
  return result;
}

function Settlement({x,y,city,color}:{x:number;y:number;city:boolean;color:string}){
  return <g transform={"translate("+x+" "+y+")"} className="board-piece" filter="url(#piece-shadow)">
    {city?<>
      <path d="M-14 10V-8L-6-15L1-9L8-15L15-8V10Z" fill={color} stroke="#334c4d" strokeWidth="2.8" strokeLinejoin="round"/>
      <rect x="-4" y="0" width="8" height="10" rx="1.5" fill="#334c4d" opacity=".65"/>
      <path d="M-10-3L-6-7L-1-3" stroke="#fff1cd" strokeWidth="2" fill="none"/>
    </>:<>
      <path d="M-11 10V-3L0-14L11-3V10Z" fill={color} stroke="#30494b" strokeLinejoin="round" strokeWidth="2.8"/>
      <path d="M-11-3L0-14L11-3" fill="none" stroke="#ffefd1" strokeWidth="2.5" strokeLinecap="round"/>
      <rect x="-3" y="1" width="6" height="9" rx="1" fill="#30494b" opacity=".65"/>
    </>}
  </g>;
}

function Robber({x,y}:{x:number;y:number}) {
  return <g transform={"translate("+(x+27)+" "+(y-27)+")"} filter="url(#piece-shadow)">
    <ellipse rx="12" ry="5" cy="12" fill="#303e3d" opacity=".25"/>
    <path d="M-8 12L-5 0A9 9 0 0 1-7-9A9 9 0 0 1 7-9A9 9 0 0 1 5 0L8 12Z" fill="#3e4f52" stroke="#fff7df" strokeWidth="1.7"/>
    <circle cy="-9" r="5" fill="#39484a" stroke="#fff7df" strokeWidth="1.7"/>
  </g>;
}
function keyboard(e:KeyboardEvent<SVGGElement>,handler:()=>void) { if(e.key==="Enter"||e.key===" "){e.preventDefault();handler();} }

export function BoardView({game,mode,selectable,onVertex,onEdge,onHex}:Props) {
  const [zoom,setZoom]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 660px)").matches?1.2:1);
  const [offset,setOffset]=useState({x:0,y:0});
  const [drag,setDrag]=useState<{x:number;y:number;startX:number;startY:number}|null>(null);
  // The same island should occupy more of the available width on portrait screens.
  // Reset only when crossing the mobile breakpoint, never on a game revision.
  useEffect(()=>{
    const media=window.matchMedia("(max-width: 660px)");
    const update=()=>{setZoom(media.matches?1.2:1);setOffset({x:0,y:0});};
    media.addEventListener("change",update);
    return ()=>media.removeEventListener("change",update);
  },[]);
  const vertexPositions=useMemo(()=>positions(game),[game.board]);
  const roads=new Map<string,string>();
  const buildings=new Map<string,{color:string;city:boolean}>();
  for(const player of game.players){
    for(const id of player.roads)roads.set(id,PLAYER_COLORS[player.color]);
    for(const id of player.settlements)buildings.set(id,{color:PLAYER_COLORS[player.color],city:false});
    for(const id of player.cities)buildings.set(id,{color:PLAYER_COLORS[player.color],city:true});
  }
  const range=405/zoom;
  const viewBox=(-range+offset.x)+" "+(-range*0.80+offset.y)+" "+(range*2)+" "+(range*1.60);
  const onWheel=(e:WheelEvent<SVGSVGElement>)=>{if(e.ctrlKey||e.metaKey)e.preventDefault();setZoom(z=>Math.max(.72,Math.min(2.3,z+(e.deltaY<0?.10:-.10))));};
  const onDown=(e:PointerEvent<SVGSVGElement>)=>{
    if((e.target as Element).closest(".hex-selectable,.edge-target,.vertex-target"))return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({x:e.clientX,y:e.clientY,startX:offset.x,startY:offset.y});
  };
  const onMove=(e:PointerEvent<SVGSVGElement>)=>{
    if(!drag)return;
    const rect=e.currentTarget.getBoundingClientRect();
    setOffset({x:drag.startX-(e.clientX-drag.x)*range*2/rect.width,y:drag.startY-(e.clientY-drag.y)*range*1.6/rect.height});
  };
  return <div className="island-stage">
    <svg className="game-board" viewBox={viewBox} role="group" aria-label="Interactive island board" onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)}>
      <defs>
        <radialGradient id="ocean-light"><stop stopColor="#81d6e4"/><stop offset=".7" stopColor="#54b8d6"/><stop offset="1" stopColor="#318dae"/></radialGradient>
        <pattern id="ocean-foam" width="40" height="35" patternUnits="userSpaceOnUse"><path d="M-3 17Q7 11 17 17T40 17" fill="none" stroke="#dcfcfa" strokeWidth="1.5" strokeOpacity=".22"/></pattern>
        <filter id="tile-depth" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="3" floodColor="#286c82" floodOpacity=".24"/></filter>
        <filter id="piece-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#233d4e" floodOpacity=".43"/></filter>
        <filter id="placement-glow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#fff6a4" floodOpacity=".9"/></filter>
      </defs>
      <rect x="-1300" y="-1300" width="2600" height="2600" fill="url(#ocean-light)"/>
      <rect x="-1300" y="-1300" width="2600" height="2600" fill="url(#ocean-foam)"/>
      {game.board.seaHexes.map(id=>{const p=hexToPixel(parseHexKey(id),SIZE);return <polygon key={id} points={hexPoints(p.x,p.y,60)} fill="#ffffff" fillOpacity=".07" stroke="#f2ffff" strokeOpacity=".18" strokeWidth="2"/>;})}
      {game.board.landHexes.map(hex=>{
        const p=hexToPixel(hex.axial,SIZE),theme=THEMES[hex.terrain]!,Icon=theme.icon;
        const active=mode==="robber"&&selectable.has(hex.id);
        const click=()=>onHex(hex.id);
        const pips=hex.number?tokenPips(hex.number):0;
        return <g key={hex.id} className={active?"hex-selectable":""} role={active?"button":undefined} aria-label={active?"Move robber to "+theme.name:undefined} tabIndex={active?0:undefined} onKeyDown={active?e=>keyboard(e,click):undefined} onClick={active?click:undefined}>
          <title>{theme.name}{hex.number?" · "+hex.number:""}{game.robberHex===hex.id?" · Robber here":""}</title>
          <polygon points={hexPoints(p.x,p.y,61)} fill="#fff7dc" stroke="#fff3d1" strokeWidth="4" filter="url(#tile-depth)"/>
          <polygon points={hexPoints(p.x,p.y,56.5)} fill={theme.base} stroke={active?"#fff6ab":theme.border} strokeWidth={active?5:2} className="terrain-fill"/>
          <polygon points={hexPoints(p.x,p.y-2,49)} fill={theme.light} fillOpacity=".45" pointerEvents="none"/>
          <g opacity=".42" pointerEvents="none">
            {[-1,0,1].map((i)=><g key={i} transform={"translate("+(p.x+i*19-15)+" "+(p.y-28+(i%2)*8)+")"}>{hex.terrain==="pasture"?<g color={theme.ink}><ResourceIcon resource="wool" size={27}/></g>:<Icon width={27} height={27} stroke={theme.ink} strokeWidth={1.8} fill="none"/>}</g>)}
          </g>
          {hex.number!==null&&<>
            <circle cx={p.x} cy={p.y+12} r="20" fill="#b9986c" opacity=".27" pointerEvents="none"/>
            <circle cx={p.x} cy={p.y+10} r="19" fill="#fff8e6" stroke="#dcbf93" strokeWidth="1.7" pointerEvents="none"/>
            <text x={p.x} y={p.y+14} textAnchor="middle" fontSize="17" fontWeight="900" fill={hex.number===6||hex.number===8?"#be4d46":"#37484b"} pointerEvents="none">{hex.number}</text>
            {Array.from({length:pips},(_,i)=><circle key={i} cx={p.x-(pips-1)*3.6+i*7.2} cy={p.y+22.5} r="1.6" fill={hex.number===6||hex.number===8?"#ca6156":"#876c51"} pointerEvents="none"/>)}
          </>}
          {active&&<polygon points={hexPoints(p.x,p.y,51)} fill="#ffe98e" fillOpacity=".16" stroke="#fff2a5" strokeWidth="3" className="terrain-target" pointerEvents="none"/>}
          {game.robberHex===hex.id&&<Robber x={p.x} y={p.y}/>}
        </g>;
      })}
      {game.board.ports.map(port=>{
        const a=vertexPositions.get(port.vertices[0]),b=vertexPositions.get(port.vertices[1]);
        if(!a||!b)return null;
        const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
        const h=game.board.landHexes.find(h=>h.id===port.landHex);
        if(!h)return null;
        const center=hexToPixel(h.axial,SIZE);
        const dx=midX-center.x,dy=midY-center.y,d=Math.hypot(dx,dy)||1;
        const x=midX+dx/d*34,y=midY+dy/d*34;
        return <g key={port.id} className="harbor-token">
          <title>{port.resource?port.resource+" harbor: 2 for 1":"General harbor: 3 for 1"}</title>
          <path d={"M"+a.x+" "+a.y+"L"+x+" "+y+"L"+b.x+" "+b.y} fill="none" stroke="#ffe4ab" strokeWidth="3" strokeDasharray="4 4" opacity=".8"/>
          <circle cx={x} cy={y} r="20" fill="#fff5d3" stroke="#d8ab71" strokeWidth="3" filter="url(#piece-shadow)"/>
          <text textAnchor="middle" x={x} y={y-1} fontSize="12" fontWeight="900" fill="#765637">{port.ratio}:1</text>
          {port.resource?<g transform={"translate("+(x-6)+" "+(y+3)+")"}><ResourceIcon resource={port.resource as Resource} size={12}/></g>:<text x={x} y={y+9} textAnchor="middle" fontSize="8" fontWeight="800" fill="#8c6840">ANY</text>}
        </g>;
      })}
      {game.board.edges.map(edge=>{
        const a=vertexPositions.get(edge.a),b=vertexPositions.get(edge.b);
        if(!a||!b)return null;
        const owned=roads.get(edge.id),active=mode==="road"&&selectable.has(edge.id);
        const click=()=>onEdge(edge.id);
        return <g key={edge.id} role={active?"button":undefined} tabIndex={active?0:undefined} onKeyDown={active?e=>keyboard(e,click):undefined} aria-label={active?"Place road":undefined}>
          {owned&&<>
            <line x1={a.x} y1={a.y+2} x2={b.x} y2={b.y+2} stroke="#294a56" strokeOpacity=".4" strokeWidth="15" strokeLinecap="round"/>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff4d7" strokeWidth="13" strokeLinecap="round"/>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={owned} strokeWidth="9" strokeLinecap="round"/>
          </>}
          {active&&<>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff9b7" strokeWidth="10" strokeDasharray="5 5" strokeLinecap="round" className="road-hint" pointerEvents="none"/>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff5a8" strokeOpacity=".05" strokeWidth="26" pointerEvents="stroke" className="edge-target" onClick={click}/>
          </>}
        </g>;
      })}
      {game.board.vertices.map(v=>{
        const p=vertexPositions.get(v.id);
        if(!p)return null;
        const built=buildings.get(v.id),active=(mode==="settlement"||mode==="city")&&selectable.has(v.id);
        if(!built&&!active)return null;
        const click=()=>onVertex(v.id);
        return <g key={v.id} transform={"translate("+p.x+" "+p.y+")"} className={active?"vertex-target":""} tabIndex={active?0:undefined} role={active?"button":undefined} aria-label={active?(mode==="city"?"Upgrade city":"Build settlement"):undefined} onKeyDown={active?e=>keyboard(e,click):undefined} onClick={active?click:undefined}>
          {active&&<><circle r="18" fill="#fff3a8" fillOpacity=".62" stroke="#fff8cc" strokeWidth="2.5" className="vertex-hint" filter="url(#placement-glow)"/><circle r="20" fill="transparent"/></>}
          {built&&<Settlement x={0} y={0} city={built.city} color={built.color}/>}
        </g>;
      })}
    </svg>
    <div className="board-zoom" role="group" aria-label="Board view controls">
      <button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(2.3,z+.18))}><ZoomIn size={17}/></button>
      <button aria-label="Reset map" onClick={()=>{setZoom(1);setOffset({x:0,y:0})}}><RotateCcw size={16}/></button>
      <button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.72,z-.18))}><ZoomOut size={17}/></button>
    </div>
  </div>;
}
