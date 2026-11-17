# Catan

An independent browser-based island trading and settlement strategy game for 3–8 friends. The project is **unofficial and not affiliated with CATAN GmbH**.

## Features

- Guest lobbies with six-character codes, invite URLs, host controls, ready states and player colors.
- Live authoritative gameplay using Fastify, Socket.IO and a shared TypeScript game engine.
- Canonical hex-board geometry, seeded island layouts, the robber, trading, development cards, Longest Road, Largest Army, and victory.
- Responsive React interface with interactive SVG island, resource hand, game log, trading and building panels.
- Searchable original 17-chapter rulebook, with per-chapter pre-rendered HTML for direct visits and indexing.
- Session-token reconnection, private per-player projections and disk snapshots.

## Stack

React 19, Vite, Tailwind CSS 4, TypeScript, Fastify 5, Socket.IO, Zod, Vitest and Docker Compose.

## Development

Node.js 22 recommended.

```bash
npm ci
npm run dev
```

Web: http://localhost:5173 · Dev API: http://localhost:3005 · health: /api/health

The Vite dev server proxies `/socket.io` and `/api` to the backend.

## Validation

```bash
npm run check
npm test
npm run build
```

The integration test uses actual socket clients and a real Fastify server. The Playwright browser E2E suite covers multiplayer setup, responsive layouts and full eight-player games; verify deployment separately before production claims.

**Dependency lockfile:** The workspace lockfile is committed. Use `npm ci` for reproducible installs.

## Production

```bash
docker compose up -d --build
```

The service listens on host port 3000 by default and stores match snapshots on the `catan-data` named volume. Set `PORT` to change the host mapping.

To use an existing remotely managed Cloudflare Tunnel:

```bash
TUNNEL_TOKEN=your-token docker compose --profile tunnel up -d --build
```

The tunnel should route to `http://app:3000`. Do not expose the token in version control.

## Architecture

- `packages/shared`: resource types, game commands, geometry, board generation, rules and validation.
- `apps/server`: authoritative engine, lobby lifecycle, socket commands, game projections and snapshots.
- `apps/web`: React routes, lobby UI, SVG board and rulebook.

Game rules are executed exclusively on the server; the browser highlights likely legal targets for UX but sends commands to the authoritative engine.

## Board sizes

| Board | Players | Land hexes | Number tokens | Ports | Resource cards/type | Development deck |
| --- | --- | --- | --- | --- | --- | --- |
| Classic | 3–4 | 19 | 18 | 9 | 19 | 25 |
| Expanded | 3–6 | 30 | 28 | 11 | 24 | 34 |
| Grand (custom) | 3–8 | 37 | 35 | 14 | 29 | 43 |

The host can select a board size or use automatic sizing (3–4 classic, 5–6 expanded, 7–8 grand). Larger games use **sequential-turn house rules**, not the official 2025 5–6 player expansion's **paired-player turn**. The expanded board follows its official terrain and number-token counts; grand is a custom eight-player scenario. Older saved games retain their original layouts on restoration. See the [official expansion rulebook](https://www.catan.com/sites/default/files/2025-03/CN3082%20CATAN%20%E2%80%93%205-6%20Rulebook%202025%20reduced.pdf).

## Rules

See `/rules` in the application. The copy is original educational material. For authoritative edition-specific rules, refer to https://www.catan.com/understand-catan/game-rules.

## Current review

This branch is under active verification; check GitHub Actions and open review issues before deploying for public use.
