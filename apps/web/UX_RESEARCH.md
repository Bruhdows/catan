# Interface research and copy audit

This is a **reference-based review of the current Hexhaven UI**, not a claim that we conducted user interviews or usability testing ourselves. Last visual pass overused decorative microcopy. This follow-up prioritizes what the player needs to read, recognize and do.

## Sources reviewed (2026-11-12)

- [Colonist: Improving the Trade System](https://blog.colonist.io/improving-the-colonist-trade-system/) — their team explicitly tested giving/receiving arrangements, found that a **vertical resource flow** was easier to interpret, separated bank trades from player trades, and kept exchange-rate information attached to the resources being surrendered. We keep separate player/bank controls, put live offers ahead of the trade form, present a vertical Give/Get sequence, and show the actual bank exchange (e.g., 4 brick → 1 ore).
- [Colonist press-kit gameplay examples](https://colonist.io/press-kit) — board fills the scene; scores, inventory and dice/actions remain visible around it. Do not copy their assets. Hexhaven already has the appropriate game scene, so the follow-up focuses on removing the extra text layers.
- [CATAN Universe official description](https://www.catan.com/catan-universe) and [media examples](https://catanuniverse.com/en/media/) — players and board are the focal point. Functional turn and resource information beats constant slogans or branded announcements.
- [Board Game Arena's Catan rules overview](https://en.boardgamearena.com/gamepanel?game=catan) — real-world concepts players recognize: roll, resources, road, settlement, city, trade, robber, 10 victory points. Keep those terms stable.
- [Nielsen Norman Group: Aesthetic and Minimalist Design / Match Between System and Real World](https://www.nngroup.com/articles/ten-usability-heuristics/) — remove information that competes with the primary task; match the terms and metaphors users already know.

## Actual issues found in the previous design

| Before | Why it was a problem | After |
| --- | --- | --- |
| Wordmark **hexhaven** with **THE BOARD IS YOURS** under it | Marketing slogan repeated next to navigation; no gameplay information | Wordmark only |
| **ONLINE BOARD GAME · 3–4 PLAYERS** above **The island is yours to settle** | Two headings for one purpose | **Play with friends** and one functional sentence |
| Floating island stickers, three footer feature claims | Decorative "tag" clutter, unrelated to choosing what to do | Removed |
| **NEW GAME** above **Gather your crew** | Two titles, neither says "Create game" clearly | **Create game** |
| **PRIVATE GAME ROOM** above **Ready to play?** | Both repeat the context; room identifier appears elsewhere | **Lobby**, player count and shareable room code |
| **MATCH SETTINGS** above **Classic island**, plus a separate "Classic rules" box | Three descriptions of the same settings | **Settings**, one line of game rules and an optional Rules link |
| Every player labelled **Settler** by default | Useless, because every player is a settler | No default label; **You** and **Offline** when informative |
| **TURN 5** badge above **Your turn!** plus a paragraph telling you to use the already visible Roll button | Repeat status, hide actual board | Compact actionable prompt: **Roll the dice**, **Place a settlement**, **Bob's turn**, etc. |
| **YOUR ACTIONS** above **Build something**, plus **Build on the island** help card | Three stacked labels before any actionable choice | Single drawer title **Build** and immediately visible costs |
| **Your development cards** plus **Development cards** help card | Duplicate headings | Single title **Cards**, with timing constraints on the cards themselves |
| Trade offers below a tall trade composer | Incoming decisions not visible before scrolling | Offers first, then player/bank controls; vertical give/get sections |
| **HOW TO PLAY** above **Learn the island** and **THE QUICK START** above **The rules of the island** | Decorative section badges repeatedly introduce the same content | **Rules**, **Getting started**, chapters and concise reference costs |
| **QUICK GUIDE** on every quick link / **CHAPTER #** on every chapter card | A tag hierarchy with no extra navigation value | Simple named links and existing chapter navigation |

## Working rules for the next pass

1. **One title per surface.** A single screen, panel or modal does not need a kicker, heading, subtitle and helper box saying the same thing.
2. **Instruction only when a player can act.** The game prompt should name the next move and only mention a placement location or required discard when needed.
3. **Keep familiar game terms.** "Roll dice", "Road", "Settlement", "City", "Trade", "Robber", "Victory points".
4. **Show the transaction, not a paragraph explaining the transaction.** For bank trades, show the selected resources and precise ratio visually; for player trades, label **Give** and **Get** clearly.
5. **No status filler.** No default "Settler", "Connected", "Online" labels beside every name; keep the active player highlighted and show **Offline** only when relevant.
6. **Use microcopy only to remove ambiguity.** Actual field names, remaining piece counts, legal placement hints, errors and rules references stay.
7. **Avoid calling the app user-tested without testing users.** Existing automated Playwright tests prove click paths, not whether a human understands the interface.

## Verification

Run the existing three-player Playwright setup/reconnect flow, navigation checks for Build/Trade/Cards, and desktop/mobile screenshot inspection. UI tests also assert that removed decorative taglines do not reappear.
