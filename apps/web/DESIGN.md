# Hexhaven — Game UI Design System

Hexhaven is a **digital tabletop game**, not a dashboard or landing-page product. Keep the board visually dominant and the information hierarchy consistent. A good litmus test: a first-time player should understand whose turn it is, what action to take, how many resources they have, and which spaces they can use without opening a guide.

## Visual language

- **Mood:** colorful, friendly 2D island game. Crisp original vector illustrations, tactile table pieces, soft shadows. Avoid glassy cards, gradients with little meaning, tech dashboard layout and decoration unrelated to gameplay.
- **Ink:** deep blue-green #304b54. **Paper:** #fffaed. **Ocean:** #54b6d6. **Action:** warm yellow #f8c760. **Success:** fresh green #368c70.
- **Type:** Nunito, heavy headings and readable body. Prefer brief familiar labels over thematic prose for controls. No text below ~10px in the main match.
- **Icons:** Lucide for controls (route/house/crown/dice/scroll/trade). Keep textual names with resource icons and player colors. Wool has its own simplified sheep pictogram; no emoji substitute.
- **Resources:** brick coral, lumber green, wool yellow-green, grain gold, ore slate-blue. Same color/icon pair in board, inventory, costs, trading, rulebook and harbors. Never use color alone to communicate availability.
- **Buttons:** rounded physical/tactile controls with obvious pressed, hover, focus and disabled states. Affordability should be explained: disabled build options remain legible and missing cost chips are marked.

## Screens and information priority

1. **Match:** player turn and scores across top, playable SVG island centered, inventory and four action shortcuts below. Only one contextual drawer can occupy the scene. Dice and End Turn remain visible at all times when available.
2. **Setup:** automatically highlight legal settlement and adjacent road sites, with an explicit one-line prompt. Do not force players to select Build.
3. **Robber:** discard and victim choice are mandatory dialogs; robber destination is shown directly on island; no hidden or conflicting action.
4. **Build:** road, settlement, city and mystery card with exact costs, piece limits and reasons unavailable. After choosing a piece close the drawer to expose the board.
5. **Trade:** clear recipient, "You give" vs "You get", a quantity stepper for each resource, and a separate Bank/Ports tab with effective exchange ratio. Recipients may respond and counter on someone else's turn. Counteroffer direction labels depend on sender/receiver.
6. **Cards:** development cards show timing restrictions; Monopoly and Year of Plenty reveal only the relevant selection controls when played.
7. **History:** optional log in a drawer, never a permanent full-height sidebar.
8. **Rules:** quick start, full chapters, building-cost cheat sheet, contextual access from game.

## Accessibility & responsive behavior

- Native labelled selects in the styled \`FieldSelect\` wrapper retain keyboard, screen reader and mobile behavior; do not replace them with untested hand-built dropdowns.
- Use true labels for buttons. All legal SVG placement targets have focusable button semantics and support Enter/Space.
- Show player names and VP values, not only player colors.
- Respect reduced-motion settings. Never use sound as the only feedback.
- Desktop: board fills the screen with optional compact right drawer. Tablet: smaller player chips and two-row dock. Phone: horizontal player roster, compact inventory/action rows, scrollable bottom sheet; the board remains usable when the drawer is closed.
- Validate at widths 390, 768, 1280, and 1920. Check contrast, overflow, click/touch targets, and sheet scrolling.

## Integration contract

The authoritative game engine and Socket.IO protocol own legality, hidden hands, phase transitions, awards, dice, trading and victory. Visual target hints in \`board-view.tsx\` are advisory; the server validates every move. Do not introduce a client-side rules engine. Match state, session reconnection and rematches are preserved across refresh.

## Quality gates

Run \`npm ci && npm run check && npm test && npm run build && npm run test:e2e\`.
Inspect desktop and mobile Playwright screenshots for the starting board and open Build/Trade panels. Test setup turn order and exact settlement/road hitboxes, trade counteroffers, dropdowns, card choices, mandatory robber dialogs, reconnects and responsive dock controls.

Visual references (inspiration only, no copied assets): official CATAN Universe game screenshots and Colonist's clear 2D board language. Use original vector shapes/assets.
