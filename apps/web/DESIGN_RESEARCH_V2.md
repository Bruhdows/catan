# Hexhaven Design Research V2

Research performed 2026-11-12, before the v3 UI overhaul. Every reference below was
examined with actual released interfaces (screenshots, published design write-ups,
patch notes and reviews), not from memory. The goal was to identify *decisions*
worth borrowing and, just as importantly, which habits of those games do **not**
apply to Hexhaven.

---

## 1. Colonist.io — the strongest comparable

Sources examined:

- Trade-system redesign write-up: <https://blog.colonist.io/improving-the-colonist-trade-system/> (read in full)
- Patch notes history: <https://colonist.io/patch-notes> (versions 159–275, read for UI decisions)
- Published base-game rules with their illustration style: <https://colonist.io/catan-rules>
- Rush development post-mortem: <https://blog.colonist.io/colonist-rush-development>

What they actually did, and why it matters to Hexhaven:

1. **Vertical trade direction.** They tested 20+ trade layouts and found that
   moving the exchange **up and down** (giving flows up and away from your hand,
   receiving flows down toward it) mapped to players' mental model far better
   than left/right arrows. Icons and arrows sit on the left to match reading
   direction. Hexhaven's previous trade panel used left/right columns with
   steppers — this is the single most concrete finding we act on.
2. **Trade rates live on the cards themselves.** Their earlier mistake was
   showing the port ratio under the card you choose to *receive* — user tests
   showed that placement is confusing. Rates belong next to the resource you
   are giving. Hexhaven should render the ratio ("4 → 1", "2 → 1", "3 → 1")
   directly on the give side, never as a paragraph.
3. **Offer status must be visible at a glance** — accepted / declined / waiting
   states shown per player, like people talking at a real table.
4. **Counteroffers without holding the demanded resource** keep negotiation
   alive. Hexhaven's engine already supports counteroffers; the UI must not
   require the counterofferer to own the demanded cards.
5. From the Rush post-mortem: **"Don't stop the game unless absolutely
   necessary"** — only *forced* actions (discard, robber, mandatory response)
   should block the board. Their first mobile attempt hid trade offers;
   what actually worked was keeping offers visible but compact.
6. Patch notes show a running concern for **compact status bars** ("long player
   names no longer push the action out of view"), **no error popups for trade
   failures** (inline feedback instead), and **opponent panels that make it
   easy to identify who's winning at a glance**.

What does not transfer: Colonist's flat, dark, esports-adjacent chrome and its
real-time modes. Hexhaven is turn-based and illustrated; copying its
diamond-shaped player plates would clash with our tabletop direction.

## 2. CATAN Universe — the board is the product

Sources examined: official product page <https://www.catan.com/catan-universe>
(screenshots on the store listing), Steam guide "Catan Universe – Game Basics"
<https://steamcommunity.com/sharedfiles/filedetails?id=1359102814>, the
Android-focused review at <https://pruxistromind.com/articles/catan-universe.html>,
App Store reviews and Metacritic user reviews.

1. Their stated pitch is an **"authentic… real gaming table feeling"** —
   painted hexes, wooden-looking roads/settlements/cities, dice you can read.
   The pieces are rendered as physical objects with shadows, not flat icons.
   This is the look Hexhaven's board should aim for (with our own art).
2. The recurring **mobile complaint is squinting**: nineteen hexes plus numbers
   plus pieces "become a matter of pinching and squinting" under six inches,
   and mis-tapped roads are "a real and repeated problem." Lesson: on small
   screens Hexhaven must keep number tokens large, keep placement targets
   fat, and make pan/zoom reliable — never clip coastal edges.
3. Their dice presentation ends games with a **dice distribution chart**,
   which players love; not needed for v3, but it validates making the dice a
   first-class visual object, not two integers in a pill.
4. Their interface reviews ("interface can feel cluttered on smaller screens",
   odd menus) warn against chrome-dense HUDs. Keep the HUD thin.

What does not transfer: Catan Universe's full skeuomorphism (3D grass, real
texture maps) is out of scope for SVG, and its account/store systems are
irrelevant.

## 3. Board Game Arena — codified tabletop-UX rules

Sources examined: BGA Studio Guidelines (HTML + the official UX PDF at
<https://en.doc.boardgamearena.com/images/5/57/Guidelines_UX_new_compressed.pdf>),
and the Meeple Mountain appreciation piece
(<http://sztczm.com/index-831.html>) for how players experience the shell.

Their published guidelines are unusually explicit and we adopt them directly:

1. **Player panels**: "allow anyone around the table… to understand in a
   glimpse who is playing, players color, score." Usernames render in player
   color. Hexhaven's top roster should do exactly this.
2. **Don't hide game elements**; the interface is **fluid** (uses available
   width) rather than fixed-width.
3. **Few visible controls**: don't show buttons that are useless 95% of the
   time; disabled actions communicate *why* they're disabled.
4. **Avoid move confirmations** — misclicks are a layout problem, not a
   button problem. Hexhaven's previous double-confirm flows are gone.
5. **Tooltips teach rules, not dynamic game state.**
6. **Animations: quick, smooth, informative. No blocking popups mid-game.**
   Tap targets ≥ 32px, colorblind-safe icons, clean refresh restore.
7. Text clarity beats style; the interface chrome is neutral so the game's
   own colors carry the theme.

What does not transfer: BGA's generic white blocks are exactly the anonymous
"web app" neutrality Hexhaven must escape — BGA is right about *structure*
and wrong about *material*.

## 4. Wingspan Digital — cohesive art direction

Sources examined: PC Gamer review <https://www.pcgamer.com/wingspan-review>,
TouchArcade <https://toucharcade.com/2021/08/16/wingspan-review-iphone-ipad-ios-board-game-adaptation-monster-couch>,
Geeky Hobbies <https://www.geekyhobbies.com/wingspan-indie-video-game-review>,
Origami Goblin comparison <https://origamigoblin.com/soaring-high-a-comparison-review-of-the-wingspan-digital-app>,
Den of the Red Wolf <https://redwolf.blog/2024/07/12/review-wingspan-digital>.

1. PC Gamer's thesis is the bar for this whole project: *"A bad digital
   adaptation of a board game simply reproduces the graphical and visual
   aspects of the base game"* — Wingspan instead serves the *playing*
   experience. Layout decisions come from the game, not from a website grid.
2. Cohesion: pastel art, environmental audio and interface are one material
   system; every screen shares the same texture language. This is what makes
   it read as "a game", not "an app with art on it".
3. Known failure we must avoid: **hover previews that occlude other
   components** — in Wingspan the enlarged card-on-hover blocks neighboring
   cards and causes misclicks. Hexhaven's board hover states must never
   cover pieces or tokens.
4. Progressive disclosure done well: only one habitat visible at a time so
   nothing crams. Hexhaven: one panel at a time in the drawer, board always
   visible behind it.

## 5. Dorfromantik — terrain that reads at a glance

Sources examined: Polygon <https://www.polygon.com/reviews/23049119/dorfromantik-review-1-0-update>,
Rock Paper Shotgun <https://www.rockpapershotgun.com/dorfromantik-review-early-access>,
New Game Network <https://www.newgamenetwork.com/article/2545/dorfromantik-review>,
Game Raven <https://www.gameravenreview.com/dorfromantik>.

1. Their UI scored 10/10 in one review for being *stripped down but effective*:
   placement highlights show exactly where a tile fits, hovering makes
   matching edges shimmer, and tooltips warn about consequences. This is the
   model for Hexhaven placement affordances — quiet highlights, responsive
   hover, no giant pulsing rings.
2. Terrain is recognizable by *composition*, not by a central icon: trees
   cluster, fields have crop rows, houses cluster into villages. The island
   looks like a place. Hexhaven's tiles should carry illustrated content
   (tree groups, sheep, dune ridges) rather than one floating symbol.
3. Small living details (smoke, boats) bring the scene alive without noise.
   One or two ambient touches in our sea/frame are enough.

## 6. Root Digital — pieces as identity

Sources examined: Wargamer <https://www.wargamer.com/root-digital-edition/review>,
Board Game Quest <https://www.boardgamequest.com/root-digital-board-game-review>,
IGN <https://www.ign.com/articles/root-board-game-review>.

1. Kyle Ferrin's art gives every faction an unmistakable silhouette; pieces
   are recognizable by shape alone at small sizes. Hexhaven's
   settlement/city/road sprites should be that recognizable — city obviously
   a settlement's upgrade, both outlined so they read on every terrain.
2. Cautionary lesson: Root's unskippable battle cut-away "will begin to test
   the player's patience" once repeated. All of Hexhaven's animations must
   be short (<600ms), interruptible, and disabled under
   `prefers-reduced-motion`.

---

## 7. Synthesis — what Hexhaven v3 does with this

| Finding | Source | Hexhaven decision |
| --- | --- | --- |
| Vertical give/get exchange | Colonist trade write-up | Trade panel is built as "You give ↓ / You get ↑" stacks with the exchange rendered as resource cards |
| Rates on the give side | Colonist trade write-up | Bank trade renders "4 Brick → 1 Ore" as cards; ratio badge lives on the give picker |
| Player panels in player color | BGA guidelines | Top roster: color chip + name + VP + awards, active player highlighted by treatment, not by text |
| Don't hide the board / no blocking popups | BGA + Colonist | Drawer overlays the board edge, mandatory flows (discard/robber/steal) are compact modals, offers visible even off-turn |
| Quiet placement affordances | Dorfromantik | Legal targets are soft glows; hover brightens a single target; no pulsing yellow rings |
| Illustrated terrain composition | Dorfromantik + CATAN Universe | Layered SVG terrain art per hex (trees, sheep, crop rows, peaks, dunes) — no lone icon in a colored hex |
| Physical-looking pieces | CATAN Universe + Root | Sprites with outline + shadow; city = grown settlement |
| Dice as an object | CATAN Universe | Real pip-face dice with a short cosmetic tumble, settling on the server's result |
| Short, respectful animation | Root + BGA | ≤ 600ms cues; everything respects `prefers-reduced-motion` |
| Hover must not occlude | Wingspan | Board hover effects sit under pieces; drawer never covers the active placement area |
| Interface chrome neutral, game colors from components | BGA design section | Chrome is parchment/wood neutral; color lives in terrain, cards, player chips |

### Art direction decided for v3

- **Materials**: the island sits in a deep teal sea; interface chrome is warm
  parchment with thin carved wood-toned borders; shadows are short and soft.
  No gradient-purple web panels, no floating rounded rectangles.
- **Type**: *Fraunces* (soft serif with personality) for display/numbers on
  tokens and headings; *Inter* for interface text. Tabular figures for counts.
- **Palette**: deep teal sea `#1f6f8f→#166a8a` range, parchment `#f6efdc`,
  ink `#3d3229`; terrain hues saturated but balanced; player colors
  crimson `#d84b40`, azure `#2e7ecf`, amber `#e08b26`, ivory `#f1ead9`, all
  with dark outline + light trim so they read on any terrain.
- **Icons**: original SVG family for resources (brick, lumber log, wool
  bundle, grain sheaf, ore crystals), pieces, awards, dev cards; Lucide only
  for generic controls (close, copy, zoom, sound).
- **Structure**: board owns the screen; roster on top; hand + actions in a
  bottom dock; everything else in a single right drawer or compact modal.
