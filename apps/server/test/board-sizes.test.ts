import { describe, expect, it } from "vitest";
import { generateBoard } from "@hexhaven/shared";
import { GameEngine } from "../src/game/engine.js";
import { gameFromStored, toStoredGame } from "../src/game/persistence.js";

const colors = ["crimson", "azure", "amber", "ivory", "emerald", "violet"] as const;
const players = (count: number) => colors.slice(0, count).map((color, index) => ({ id: "p" + index, name: "Player " + index, color }));
const snapshotBoard = (board: ReturnType<typeof generateBoard>) => ({
  size: board.size,
  hexes: [...board.hexes.values()].map(h => [h.id, h.terrain, h.number]),
  ports: board.ports.map(p => [p.edge, p.ratio, p.resource]),
});

describe("board snapshot compatibility", () => {
  it("restores new expanded and custom grand boards exactly", () => {
    for (const size of ["expanded", "grand"] as const) {
      const engine = new GameEngine({ players: players(5), boardMode: "balanced", boardSize: size, seed: "restore-new" });
      const stored = toStoredGame(engine.state);
      const restored = gameFromStored(stored);
      expect(restored.boardSize).toBe(size);
      expect(snapshotBoard(restored.board)).toEqual(snapshotBoard(engine.state.board));
    }
  });

  it("keeps the old 19-hex port layout without a boardSize field", () => {
    const engine = new GameEngine({ players: players(3), boardMode: "random", seed: "restore-classic" });
    const stored = toStoredGame(engine.state);
    delete stored.boardSize;
    const before = generateBoard("random", stored.seed, "classic", true);
    const after = gameFromStored(stored);
    expect(after.boardSize).toBe("classic");
    expect(snapshotBoard(after.board)).toEqual(snapshotBoard(before));
  });

  it("preserves the original 37-hex 5–6 player board of old snapshots", () => {
    const engine = new GameEngine({ players: players(6), boardMode: "balanced", seed: "restore-six" });
    const stored = toStoredGame(engine.state);
    delete stored.boardSize;
    const before = generateBoard("balanced", stored.seed, "legacy", true);
    const after = gameFromStored(stored);
    expect(after.boardSize).toBe("legacy");
    expect(after.board.hexes.size).toBe(37);
    expect(snapshotBoard(after.board)).toEqual(snapshotBoard(before));
  });
});
