import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TerrainArt } from "../src/assets/terrain";
import { ResourceIcon, PieceSprite } from "./sources/board-art";

const root = "/tmp/catan-illustrations";
mkdirSync(root, { recursive: true });
const resources = ["brick", "lumber", "wool", "grain", "ore"] as const;
const biome = ["forest", "pasture", "fields", "hills", "mountains", "desert"] as const;
const colors: Record<string, string> = {
  crimson: "#d24b40", azure: "#2f7fc9", amber: "#dd922b", ivory: "#efe6d0",
  emerald: "#39946e", violet: "#9162c8", teal: "#13a7b2", rose: "#db6294", neutral: "#ae8051",
};
for(const resource of resources){
  const markup=renderToStaticMarkup(<ResourceIcon resource={resource} size={256}/>);
  writeFileSync(join(root,`${resource}.svg`),markup.replace("<svg ",'<svg xmlns="http://www.w3.org/2000/svg" '));
}
for(const terrain of biome){
  for(let i=0;i<3;i++){
    const scene=renderToStaticMarkup(<TerrainArt terrain={terrain} seed={`scene:${terrain}:${i}`} r={59}/>);
    writeFileSync(join(root,`${terrain}-${i}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="-64 -64 128 128">${scene}</svg>`);
  }
}
for(const [name,color] of Object.entries(colors)){
  for(const kind of ["settlement","city","road"] as const){
    const markup=renderToStaticMarkup(<PieceSprite kind={kind} color={color} size={256}/>);
    writeFileSync(join(root, `${kind}-${name}.svg`),markup.replace("<svg ",'<svg xmlns="http://www.w3.org/2000/svg" '));
  }
}
