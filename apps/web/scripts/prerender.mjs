import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const chapters = JSON.parse(readFileSync("src/rules.json", "utf8"));
const base = readFileSync("dist/index.html", "utf8");
const site = (process.env.SITE_URL || "https://hexhaven.bruhdows.com").replace(/\/$/, "");
const esc = (v) => String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function page(slug, title, description, body) {
  const url = site + "/rules" + (slug ? "/" + slug : "");
  const html = base.replace(/<title>[^<]*<\/title>/, "<title>" + esc(title) + " | Hexhaven</title>")
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, '<meta name="description" content="' + esc(description) + '"/>')
    .replace("</head>", '<link rel="canonical" href="' + esc(url) + '"/><meta property="og:title" content="' + esc(title) + '"/></head>')
    .replace('<div id="root"></div>', '<div id="root"><main><h1>' + esc(title) + '</h1><p>' + esc(description) + '</p>' + body + '</main></div>');
  const folder = join("dist", "rules", slug || "");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "index.html"), html);
}
page("", "The complete game rulebook", "Learn the complete classic island strategy game with an original illustrated guide.",
 chapters.map(c=>'<section><h2><a href="/rules/'+esc(c.slug)+'">'+esc(c.title)+'</a></h2><p>'+esc(c.summary)+'</p></section>').join(""));
for (const c of chapters) page(c.slug,c.title,c.summary,c.sections.map(([h,b])=>'<section><h2>'+esc(h)+'</h2><p>'+esc(b)+'</p></section>').join(""));
writeFileSync("dist/sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+["","/rules",...chapters.map(c=>"/rules/"+c.slug)].map(p=>"<url><loc>"+esc(site+p)+"</loc></url>").join("")+"</urlset>");
writeFileSync("dist/robots.txt", "User-agent: *\nAllow: /\nSitemap: "+site+"/sitemap.xml\n");
