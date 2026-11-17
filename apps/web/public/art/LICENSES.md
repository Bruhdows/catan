# Artwork provenance

Terrain imagery, resource badges, player pieces, and colored roads are original artwork rendered from this project's illustration sources into high-resolution WebP images. The image assets are locally bundled and used in the browser instead of drawing terrain or house shapes as runtime SVGs.

Small UI icons are raster exports of [Lucide](https://lucide.dev/) artwork, licensed under the [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE). They use the same cohesive stroke family throughout the table.

The imagery does not contain graphics sourced from the commercial Catan or Colonist games.

- Dice faces: [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons), **CC0 1.0**, rendered directly from `/kenney/board-game-icons/PNG/Default (64px)/dice_*.png` by `DiceFace` in `src/assets/art.tsx`. (The earlier shaded ivory dice under `art/dice/` are no longer referenced.)

- Custom mouse cursors: [Kenney Cursor Pack 1.1](https://kenney.nl/assets/cursor-pack), **CC0 1.0**. Selected outlined sprites are cropped, resized, and recolored into parchment tones, with browser hotspots set in `ui/cursors.css`. Source sprites and Kenney license are retained under `apps/web/scripts/kenney-cursors/`.

- Table reaction bubbles: [Kenney Emotes Pack](https://kenney.nl/assets/emotes-pack) (Vector Style 3), **CC0 1.0**, served unmodified under `/kenney/emotes-pack/` and rendered by `src/assets/emotes.tsx`.

- Interface cues: [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds), **CC0 1.0**, played as raw OGG files from `/kenney/interface-sounds/Audio/` by `src/sound.ts`.

- Match results crown: [Kenney Board Game Icons](https://kenney.nl/assets/board-game-icons), **CC0 1.0** (`crown_a.png`, white sprite on the gold medal backdrop).

Only the **assets in active use** are shipped under `/kenney/`, with the source licenses retained. See `../kenney/README.md`.
