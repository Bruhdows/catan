import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync,mkdirSync } from "node:fs";
import { BookOpen, Volume2, VolumeX, Ellipsis, ArrowLeftRight, ScrollText, Hammer, History, Plus, Minus, Maximize } from "lucide-react";
const out="/tmp/catan-ui-svg";
mkdirSync(out,{recursive:true});
const icons={"rulebook":BookOpen,"sound-on":Volume2,"sound-off":VolumeX,"menu":Ellipsis,"trade":ArrowLeftRight,"cards":ScrollText,"build":Hammer,"history":History,"zoom-in":Plus,"zoom-out":Minus,"reset":Maximize};
for(const [name,Icon] of Object.entries(icons)){
  const svg=renderToStaticMarkup(<Icon color="#504e43" strokeWidth={1.9} size={96} />);
  writeFileSync(`${out}/${name}.svg`,svg);
}
