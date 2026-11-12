# Hexhaven — Game UI Design System

Hexhaven is a **digital tabletop game**, not a dashboard or landing-page product. Keep the board visually dominant and the information hierarchy consistent. A good litmus test: a first-time player should understand whose turn it is, what action to take, how many resources they have, and which spaces they can use without opening a guide.

## Visual language

- **Mood:** colorful, friendly 2D island game on a real table. Every hex, piece, token and card is an original composed SVG illustration (see `src/assets/terrain.tsx` and `src/assets/art.tsx`), seeded per tile so scenes vary naturally. Lucide is only for generic interface controls (close, copy, zoom, search, sound).
- **Design tokens** live in `src/ui/tokens.css`: sea teal gradient (`--sea-*`), parchment and wood chrome (`--parchment`, `--wood*`), terrain hues (`--t-*`), resource hues (`--r-*`), player colors crimson `#d24b40`, azure `#2f7fc9`, amber `#dd922b`, ivory `#efe6d0`. Never hardcode a one-off color; add a token instead.
- **Type:** Fraunces for display type, room codes, number tokens and card faces; Inter for UI text. No text below ~10px in the main match.
- **Resources:** brick coral, lumber green, wool green, grain gold, ore slate-blue. Same icon/color pair in board tiles, hand cards, costs, trading, rulebook and harbors. Never use color alone to communicate availability.
- **Buttons:** tactile controls with obvious pressed, hover, focus and disabled states (`.button` variants: honey primary, wood, paper, ghost). Affordability is explained: disabled build options remain legible and missing cost chips are tinted red.
- **Anti-patterns:** no kicker/heading/subtitle stacks, no nested cards, no decorative chips or marketing copy on game screens, no pulse-heavy affordances. One functional title per screen; status appears only when it changes an action.

## Screens and information priority

1. **Title screen:** one illustrated island mat (the same artwork as the board) beside a single wooden menu sign with the three real actions: start, join, how to play.
2. **Match:** room code plus player roster plates across the top (mini settlement sprite, name, visible VP /10, award chips), playable SVG island centered, turn plate top-left, dice tray top-right, resource hand and four dock tiles below, primary Roll dice / End turn button always visible when available. Only one contextual drawer can occupy the scene.
3. **Setup:** legal settlement and road sites glow on the island with an explicit one-line prompt; no need to open Build first.
4. **Robber:** discard and victim choice are mandatory dialogs; robber destination is shown directly on the island.
5. **Build:** road, settlement, city and development card rows with piece artwork, exact costs, piece limits and the reason anything is unavailable.
6. **Trade:** vertical flow — "You give" on top, an arrow, "You receive" below; exchange rates (4:1/3:1/2:1) are badges on the give side. Players tab offers a radio recipient picker; Bank & harbors tab marks the player's best ratio per resource. Recipients may accept, counter or decline; counter direction labels follow sender/receiver.
7. **Cards:** development cards as illustrated faces with timing restrictions; Monopoly and Year of Plenty reveal only the relevant selection controls when played.
8. **History:** optional log in a drawer, never a permanent full-height sidebar.
9. **Rules:** chapter navigation with search, cost cheat sheet with the real resource icons, small SVG diagrams (distance rule), link to the official rules.

## Accessibility & responsive behavior

- Native labelled selects in the styled `FieldSelect` wrapper retain keyboard, screen reader and mobile behavior; do not replace them with untested hand-built dropdowns.
- Use true labels for buttons. All legal SVG placement targets have focusable button semantics and support Enter/Space.
- Show player names and VP values, not only player colors.
- Respect reduced-motion settings (durations collapse to ~0 via tokens). Never use sound as the only feedback.
- Desktop: board fills the screen with an optional right drawer. Phone (≤700px): horizontal player roster, compact HUD, scrollable hand, drawer becomes a bottom sheet; the board zooms slightly and stays fully visible including ports.
- Validate at widths 360, 390, 768, 1280, and 1920. Check contrast, overflow, click/touch targets, and sheet scrolling.

## Integration contract

The authoritative game engine and Socket.IO protocol own legality, hidden hands, phase transitions, awards, dice, trading and victory. Placement hints in `board-view.tsx` (`legalBoardTargets`) mirror the shared rules but the server validates every move. Do not introduce a client-side rules engine. Match state, session reconnection and rematches are preserved across refresh.

## Quality gates

Run `npm ci && npm run check && npm test && npm run build && npm run test:e2e`.
Inspect the Playwright screenshots in `shots/` (before/after pairs) for the title screen, lobby, starting board, live turn and open Build/Trade panels. Test setup turn order and exact settlement/road hitboxes, trade counteroffers, bank ratios, card choices, mandatory robber dialogs, reconnects and responsive dock controls.

Visual references (inspiration only, no copied assets): Colonist's clear 2D board language, Wingspan/Dorfromantik's illustrated tabletop warmth. See `DESIGN_RESEARCH_V2.md` for the full research notes.
