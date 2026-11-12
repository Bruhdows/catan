import { test, expect, type Page } from "@playwright/test";

async function joinAs(page: Page, code: string, name: string) {
  await page.goto("/join/" + code);
  await page.getByPlaceholder("Nickname").fill(name);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page).toHaveURL(new RegExp("/lobby/" + code));
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
    await expect(host.getByRole("heading", { name: "Create game" })).toBeVisible();
    await host.getByPlaceholder("Nickname").fill("Host");
    await host.getByRole("button", { name: "Create room" }).click();
    await host.screenshot({ path: "test-results/lobby-clean.png" });
    await expect(host).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
    const code = host.url().split("/").at(-1)!;

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
    for (const page of [host, alice, bob, bob, alice, host]) {
      const vertex = page.locator(".vertex-target").first();
      await expect(vertex).toBeVisible();
      await vertex.click();
      // Vertical SVG lines have a zero-width bounding box and Playwright
      // marks them hidden even though the browser can hit-test their stroke.
      // Choose an actual diagonal road to exercise pointer interaction.
      const edgeIndex = await page.locator(".edge-target").evaluateAll((lines) =>
        lines.findIndex((line) =>
          Math.abs(Number(line.getAttribute("x1")) - Number(line.getAttribute("x2"))) > 1
        ),
      );
      expect(edgeIndex).toBeGreaterThanOrEqual(0);
      const edge = page.locator(".edge-target").nth(edgeIndex);
      await expect(edge).toBeVisible();
      await edge.click();
    }
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await host.screenshot({ path: "test-results/island-game.png" });
    await host.reload();
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await host.getByRole("button", { name: "Roll dice" }).click();
    await expect(host.locator(".dice-pair")).toBeVisible();

    // The board stays visible while each game action opens its own panel.
    await host.getByRole("button", { name: "Build", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Build" })).toBeVisible();
    await host.screenshot({ path: "test-results/island-build-panel.png" });

    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Trade" })).toBeVisible();
    await host.getByRole("combobox", { name: "Trade with" }).selectOption({ label: "Alice" });
    await expect(host.getByRole("combobox", { name: "Trade with" })).toHaveValue(
      (await alice.evaluate(() => JSON.parse(localStorage.getItem("hexhaven.session") || "{}"))).playerId,
    );
    await host.getByRole("tab", { name: "Bank & ports" }).click();
    await expect(host.getByRole("combobox", { name: "Give to the bank" })).toBeVisible();
    await expect(host.getByRole("combobox", { name: "Get from the bank" })).toBeVisible();

    await host.getByRole("button", { name: "Cards", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Cards" })).toBeVisible();
    await host.getByRole("button", { name: "Log", exact: true }).click();
    await expect(host.getByRole("heading", { name: "History" })).toBeVisible();
    await host.getByRole("button", { name: "Log", exact: true }).click();

    // The same scene must remain usable on a phone-sized viewport.
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator(".game-board")).toBeVisible();
    await host.screenshot({ path: "test-results/island-mobile-board.png" });
    await expect(host.getByRole("button", { name: "Trade", exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await expect(host.getByRole("combobox", { name: "Trade with" })).toBeVisible();
    await expect(host.getByText("Give", { exact: true })).toBeInViewport();
    await expect(host.getByText("Get", { exact: true })).toBeInViewport();
    await host.screenshot({ path: "test-results/island-mobile.png" });
    const width = await host.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(width.actual).toBeLessThanOrEqual(width.viewport + 2);

    await host.goto("/rules/robber");
    await expect(host.getByRole("heading", { name: "The robber & seven" })).toBeVisible();
    await expect(host.getByText("When seven is rolled")).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(),aliceContext.close(),bobContext.close()]);
  }
});

test("homepage and rulebook work at narrow mobile widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Play with friends." })).toBeVisible();
  await expect(page.getByText("THE BOARD IS YOURS")).toHaveCount(0);
  await expect(page.getByText("ONLINE BOARD GAME")).toHaveCount(0);
  await page.screenshot({ path: "test-results/home-clean-mobile.png" });
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules" })).toBeVisible();
  await page.getByPlaceholder(/Search rules/).fill("Longest Road");
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Getting started" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Longest Road/ }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/rules-clean-mobile.png" });
  await page.getByRole("link", { name: /Longest Road/ }).first().click();
  await expect(page.getByRole("heading", { name: "Longest Road" })).toBeVisible();
});


test("menus contain only one functional heading and no decorative labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Play with friends." })).toHaveCount(1);
  await expect(page.getByText(/THE BOARD IS YOURS|ONLINE BOARD GAME|EVERY ISLAND IS DIFFERENT/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create game" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join game" })).toBeVisible();
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Create game" })).toHaveCount(1);
  await expect(page.getByText("NEW GAME", { exact: true })).toHaveCount(0);
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules" })).toHaveCount(1);
  await expect(page.getByText("QUICK GUIDE", { exact: true })).toHaveCount(0);
});
