import { test, expect, type Page } from "@playwright/test";

async function joinAs(page: Page, code: string, name: string) {
  await page.goto("/join/" + code);
  await page.getByPlaceholder("Nickname").fill(name);
  await page.getByRole("button", { name: "Join room" }).click();
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
    await host.goto("/create");
    await expect(host.getByRole("heading", { name: "Start a new game" })).toBeVisible();
    await host.getByPlaceholder("Nickname").fill("Host");
    await host.getByRole("button", { name: "Create room" }).click();
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
    await host.screenshot({ path: "test-results/island-game.png" });
    await host.reload();
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await host.getByRole("button", { name: "Roll dice" }).click();
    await expect(host.locator(".dice-tray")).toBeVisible();

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

    await host.getByRole("button", { name: "Cards", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Development cards" })).toBeVisible();
    await host.getByRole("button", { name: "Log", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Game log" })).toBeVisible();
    await host.getByRole("button", { name: "Log", exact: true }).click();

    // The same scene must remain usable on a phone-sized viewport.
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator(".game-board")).toBeVisible();
    await host.screenshot({ path: "test-results/island-mobile-board.png" });
    await expect(host.getByRole("button", { name: "Trade", exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(host.getByText("You give", { exact: true })).toBeInViewport();
    await expect(host.getByText("You receive", { exact: true })).toBeInViewport();
    await host.screenshot({ path: "test-results/island-mobile.png" });
    const width = await host.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.actual).toBeLessThanOrEqual(width.viewport + 2);

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
  await expect(page.getByRole("heading", { name: "Hexhaven", level: 1 })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Hexhaven", level: 1 })).toHaveCount(1);
  await expect(page.getByText(/THE BOARD IS YOURS|ONLINE BOARD GAME|EVERY ISLAND IS DIFFERENT/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start a new game" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join with a code" })).toBeVisible();
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Start a new game" })).toHaveCount(1);
  await expect(page.getByText("NEW GAME", { exact: true })).toHaveCount(0);
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules" })).toHaveCount(1);
  await expect(page.getByText("QUICK GUIDE", { exact: true })).toHaveCount(0);
});
