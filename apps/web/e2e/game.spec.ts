import { test, expect, type Page } from "@playwright/test";

async function joinAs(page: Page, code: string, name: string) {
  await page.goto("/join/" + code);
  await page.getByPlaceholder("Your nickname").fill(name);
  await page.getByRole("button", { name: "Join game" }).click();
  await expect(page).toHaveURL(new RegExp("/lobby/" + code));
}

/** One setup turn: pick a glowing corner, then a glowing edge for the road. */
async function playSetupTurn(page: Page) {
  const vertex = page.locator(".vertex-hit").first();
  await expect(vertex).toBeVisible();
  await vertex.click();
  const edges = page.locator(".edge-hit");
  await expect(edges.first()).toBeAttached();
  // Vertical SVG lines have a zero-width bounding box and Playwright marks
  // them hidden even though the browser can hit-test their stroke. Prefer a
  // diagonal road and click with force as a fallback.
  const edgeIndex = await edges.evaluateAll((lines) =>
    lines.findIndex((line) =>
      Math.abs(Number(line.getAttribute("x1")) - Number(line.getAttribute("x2"))) > 1,
    ),
  );
  await edges.nth(edgeIndex >= 0 ? edgeIndex : 0).click({ force: true });
}

test("three players create a lobby, set up the island, reconnect and read rules", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const [host, alice, bob] = await Promise.all([
    hostContext.newPage(), aliceContext.newPage(), bobContext.newPage(),
  ]);
  try {
    await host.goto("/");
    await expect(host.getByRole("heading", { name: "Catan" })).toBeVisible();
    await host.getByPlaceholder("Your nickname").fill("Host");
    await host.getByRole("button", { name: "Start a new game" }).click();
    await expect(host).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
    const code = host.url().split("/").at(-1)!;
    await host.screenshot({ path: "test-results/lobby-clean.png" });

    await joinAs(alice, code, "Alice");
    await joinAs(bob, code, "Bob");
    await alice.getByRole("button", { name: "Ready up" }).click();
    await bob.getByRole("button", { name: "Ready up" }).click();
    const start = host.getByRole("button", { name: "Start game" });
    await expect(start).toBeEnabled();
    await expect(start).toBeInViewport({ ratio: 1 });
    await expect(host.getByRole("button", { name: "Cancel ready", exact: true })).toBeInViewport({ ratio: 1 });
    await start.click();
    await expect(host).toHaveURL(new RegExp("/game/" + code));
    await expect(alice).toHaveURL(new RegExp("/game/" + code));
    await expect(bob).toHaveURL(new RegExp("/game/" + code));

    // First settlements/roads go forward, second placements in reverse.
    for (const page of [host, alice, bob, bob, alice, host]) await playSetupTurn(page);
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await expect(host.locator(".table-sidebar")).toBeVisible();
    await expect(host.locator(".table-sidebar .roster-plate")).toHaveCount(3);
    await expect(host.locator(".hud")).toBeHidden();
    await expect(host.locator(".table-bank-item")).toHaveCount(5);
    await expect(host.locator(".hand-stack")).toHaveCount(5);
    const handLayers = await host.locator(".hand-stack").evaluateAll(stacks => stacks.map(stack => ({
      count: Number(stack.querySelector(".hand-stack-total")?.textContent),
      layers: stack.querySelectorAll(".hand-stack-card").length,
    })));
    for (const stack of handLayers) expect(stack.layers).toBe(Math.max(1, Math.min(stack.count, 9)));
    await expect(host.locator(".placed-road")).toHaveCount(6);
    await expect(host.locator(".placed-road[filter]")).toHaveCount(0);
    await expect(host.locator(".hud-code")).toHaveCount(0);
    await host.screenshot({ path: "test-results/island-game.png" });
    await host.reload();
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await host.getByRole("button", { name: "Roll dice" }).click();
    await expect(host.locator(".dice-tray")).toBeVisible();
    const diceBox = await host.locator(".dice-tray").boundingBox();
    const boardAreaBox = await host.locator(".board-area").boundingBox();
    expect(diceBox).not.toBeNull(); expect(boardAreaBox).not.toBeNull();
    expect(diceBox!.width).toBeGreaterThan(150);
    expect(boardAreaBox!.x + boardAreaBox!.width - diceBox!.x - diceBox!.width).toBeLessThan(30);
    expect(boardAreaBox!.y + boardAreaBox!.height - diceBox!.y - diceBox!.height).toBeLessThan(30);

    // The board stays visible while each game action opens its own drawer.
    await host.getByRole("button", { name: "Build", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Build" })).toBeVisible();
    await host.screenshot({ path: "test-results/island-build-panel.png" });

    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Trade" })).toBeVisible();
    await host.getByRole("radio", { name: "Alice" }).click();
    await expect(host.getByRole("radio", { name: "Alice" })).toHaveAttribute("aria-checked", "true");
    await host.getByRole("tab", { name: "Bank & harbors" }).click();
    await expect(host.getByText("You give", { exact: true })).toBeVisible();
    await expect(host.getByText("You receive", { exact: true })).toBeVisible();

    await host.getByRole("button", { name: "Development cards", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Development cards" })).toBeVisible();
    await expect(host.locator(".table-activity-line").first()).toBeVisible();
    await expect(host.getByRole("button", { name: "Game log" })).toBeHidden();
    await host.getByRole("button", { name: "Development cards", exact: true }).click();

    // The same scene must remain usable on a phone-sized viewport.
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator(".game-board")).toBeVisible();
    await expect(host.locator(".table-sidebar")).toBeHidden();
    await expect(host.locator(".hud")).toBeVisible();
    await host.screenshot({ path: "test-results/island-mobile-board.png" });
    await expect(host.getByRole("button", { name: "Game log" })).toBeVisible();
    await host.getByRole("button", { name: "Game log" }).click();
    await expect(host.getByRole("heading", { name: "Game log" })).toBeVisible();
    await host.getByRole("button", { name: "Game log" }).click();
    await expect(host.getByRole("button", { name: "Trade", exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Game menu" }).click();
    await expect(host.getByRole("menuitem", { name: "Rulebook" })).toBeVisible();
    await host.getByRole("menuitem", { name: "Rulebook" }).click();
    await expect(host.getByRole("dialog", { name: "Catan rules" })).toBeVisible();
    await host.getByRole("button", { name: "Close rules" }).click();
    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(host.getByText("You give", { exact: true })).toBeInViewport();
    await expect(host.getByText("You receive", { exact: true })).toBeInViewport();
    await host.screenshot({ path: "test-results/island-mobile.png" });
    const width = await host.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.actual).toBeLessThanOrEqual(width.viewport + 2);
    const stacks = await host.locator(".hand-stack").evaluateAll(items => items.map(item => {
      const b = item.getBoundingClientRect(); return { left: b.left, right: b.right };
    }));
    for (const box of stacks) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width.viewport + 1); }

    await host.goto("/rules/robber");
    await expect(host.getByRole("heading", { name: "The robber & seven" })).toBeVisible();
    await expect(host.getByText("When seven is rolled")).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), aliceContext.close(), bobContext.close()]);
  }
});

test("homepage and rulebook work at narrow mobile widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Catan", level: 1 })).toBeVisible();
  await expect(page.getByText(/THE BOARD IS YOURS|ONLINE BOARD GAME|EVERY ISLAND IS DIFFERENT/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/home-clean-mobile.png" });
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules" })).toBeVisible();
  await page.getByPlaceholder(/Search rules/).fill("Longest Road");
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Getting started" })).toHaveCount(0);
  await expect(page.locator(".rules-article .rule-card").first()).toContainText("Longest Road");
  await expect(page.getByRole("link", { name: /Longest Road/ }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/rules-clean-mobile.png" });
  await page.getByRole("link", { name: /Longest Road/ }).first().click();
  await expect(page.getByRole("heading", { name: "Longest Road" })).toBeVisible();
});

test("menus contain only one functional heading and no decorative labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Catan", level: 1 })).toHaveCount(1);
  await expect(page.getByText(/THE BOARD IS YOURS|ONLINE BOARD GAME|EVERY ISLAND IS DIFFERENT/)).toHaveCount(0);
  await expect(page.getByPlaceholder("Your nickname")).toBeVisible();
  await expect(page.getByPlaceholder("ABC123")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new game" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Join game" })).toBeDisabled();
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /How to play/ }).click();
  await expect(page.getByRole("dialog", { name: "Catan rules" })).toBeVisible();
  await page.getByRole("button", { name: "Close rules" }).click();
  await page.goto("/create");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".entry-panel")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Catan" })).toHaveCount(1);
  await page.goto("/join/ABC234");
  await expect(page).toHaveURL(/\/\?code=ABC234$/);
  await expect(page.getByPlaceholder("ABC123")).toHaveValue("ABC234");
  await expect(page.getByText("NEW GAME", { exact: true })).toHaveCount(0);
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules" })).toHaveCount(1);
  await expect(page.getByText("QUICK GUIDE", { exact: true })).toHaveCount(0);
});

test("six-player lobby, timed settings, and roster stay visible", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  try {
    const host = pages[0]!;
    await host.goto("/");
    await host.getByPlaceholder("Your nickname").fill("Host");
    await host.getByRole("button", { name: "Start a new game" }).click();
    await expect(host).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
    const code = host.url().split("/").at(-1)!;
    await host.getByLabel("Board size").selectOption("expanded");
    await expect(host.getByLabel("Board size")).toHaveValue("expanded");
    const timer = host.getByLabel("Turn timer");
    await timer.selectOption("60");
    await expect(timer).toHaveValue("60");
    for (let i = 1; i < 6; i++) {
      const page = pages[i]!;
      await page.goto("/");
      await page.getByPlaceholder("Your nickname").fill("Player " + i);
      await page.getByPlaceholder("ABC123").fill(code);
      await page.getByRole("button", { name: "Join game" }).click();
      await expect(page).toHaveURL(new RegExp("/lobby/" + code));
      await page.getByRole("button", { name: "Ready up" }).click();
    }
    await expect(host.getByText("6 of 6 players seated")).toBeVisible();
    await host.getByRole("button", { name: "Start game" }).click();
    await expect(host).toHaveURL(new RegExp("/game/" + code));
    await expect(host.locator(".roster-plate:visible")).toHaveCount(6);
    await host.setViewportSize({ width: 1440, height: 900 });
    const sidebar = host.locator(".table-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(host.locator(".table-sidebar .roster-plate")).toHaveCount(6);
    await expect(host.locator(".hud")).toBeHidden();
    const lastPlayer = await host.locator(".table-sidebar .roster-plate").last().boundingBox();
    const sidebarBounds = await sidebar.boundingBox();
    expect(lastPlayer).not.toBeNull();
    expect(sidebarBounds).not.toBeNull();
    expect(lastPlayer!.y + lastPlayer!.height).toBeLessThanOrEqual(sidebarBounds!.y + sidebarBounds!.height);
    for (const size of [{ width: 1050, height: 850 }, { width: 390, height: 844 }]) {
      await host.setViewportSize(size);
      const bounds = await host.locator(".roster-plate:visible").evaluateAll(plates => plates.map(p => {
        const r = p.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      const hud = await host.locator(".hud").boundingBox();
      expect(hud).not.toBeNull();
      for (const boundsRow of bounds) {
        expect(boundsRow.left).toBeGreaterThanOrEqual(0);
        expect(boundsRow.right).toBeLessThanOrEqual(size.width + 1);
        expect(boundsRow.top).toBeGreaterThanOrEqual(hud!.y);
        expect(boundsRow.bottom).toBeLessThanOrEqual(hud!.y + hud!.height + 1);
      }
    }

    // Full six-player setup: 2 placements per player, each with a visible road.
    await host.setViewportSize({ width: 1440, height: 900 });
    for (const i of [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0]) await playSetupTurn(pages[i]!);
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await expect(host.locator(".placed-road")).toHaveCount(12);
    await expect(host.locator(".placed-road[filter]")).toHaveCount(0);
    await host.screenshot({ path: "test-results/six-player-game.png" });
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});


test("eight players can complete grand-board setup without clipped seats or roads", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(Array.from({ length: 8 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  try {
    const host = pages[0]!;
    await host.goto("/");
    await host.getByPlaceholder("Your nickname").fill("Host");
    await host.getByRole("button", { name: "Start a new game" }).click();
    await expect(host).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
    const code = host.url().split("/").at(-1)!;
    await expect(host.getByLabel("Board size")).toHaveValue("auto");
    await host.getByLabel("Board size").selectOption("grand");
    await expect(host.getByLabel("Board size")).toHaveValue("grand");
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i]!;
      await joinAs(page, code, "Player " + i);
      await page.getByRole("button", { name: "Ready up" }).click();
    }
    await expect(host.getByText("8 of 8 players seated")).toBeVisible();
    await host.getByRole("button", { name: "Start game" }).click();
    await expect(host).toHaveURL(new RegExp("/game/" + code));
    await expect(host.locator(".game-board .terrain-fill")).toHaveCount(37);
    await expect(host.locator(".table-sidebar .roster-plate")).toHaveCount(8);
    await expect(host.locator(".table-sidebar .roster-plate").last()).toBeInViewport();
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator(".roster-plate:visible")).toHaveCount(8);
    const bounds = await host.locator(".roster-plate:visible").evaluateAll(items => items.map(item => {
      const b = item.getBoundingClientRect(); return { left: b.left, right: b.right };
    }));
    for (const bound of bounds) { expect(bound.left).toBeGreaterThanOrEqual(0); expect(bound.right).toBeLessThanOrEqual(391); }
    await host.setViewportSize({ width: 1440, height: 900 });
    for (const i of [0,1,2,3,4,5,6,7,7,6,5,4,3,2,1,0]) await playSetupTurn(pages[i]!);
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await expect(host.locator(".placed-road")).toHaveCount(16);
    await host.screenshot({ path: "test-results/eight-player-game.png" });
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
