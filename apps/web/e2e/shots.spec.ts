import { test, expect, type Page } from "@playwright/test";

// Snapshot script for before/after evidence. Screenshots land in shots/.
// Run with the dev servers already up: npx playwright test shots.spec.ts

async function playSetupTurn(page: Page) {
  const vertex = page.locator(".vertex-hit").first();
  await expect(vertex).toBeVisible();
  await vertex.click();
  const edges = page.locator(".edge-hit");
  await expect(edges.first()).toBeAttached();
  const edgeIndex = await edges.evaluateAll((lines) =>
    lines.findIndex((line) =>
      Math.abs(Number(line.getAttribute("x1")) - Number(line.getAttribute("x2"))) > 1,
    ),
  );
  await edges.nth(edgeIndex >= 0 ? edgeIndex : 0).click({ force: true });
  await page.waitForTimeout(350);
}

test("after-shots", async ({ browser }) => {
  test.setTimeout(240_000);
  const hostC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aliceC = await browser.newContext();
  const bobC = await browser.newContext();
  const [host, alice, bob] = await Promise.all([hostC.newPage(), aliceC.newPage(), bobC.newPage()]);
  try {
    await host.goto("/");
    await host.waitForTimeout(800);
    await host.screenshot({ path: "shots/after-home.png" });

    await host.goto("/rules");
    await host.waitForTimeout(400);
    await host.screenshot({ path: "shots/after-rules.png" });

    await host.goto("/create");
    await host.getByPlaceholder("Nickname").fill("Ada");
    await host.getByRole("button", { name: "Create room" }).click();
    await expect(host).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
    const code = host.url().split("/").at(-1)!;
    await host.screenshot({ path: "shots/after-lobby.png" });

    for (const [page, name] of [[alice, "Ben"], [bob, "Cleo"]] as [Page, string][]) {
      await page.goto("/join/" + code);
      await page.getByPlaceholder("Nickname").fill(name);
      await page.getByRole("button", { name: "Join room" }).click();
      await expect(page).toHaveURL(new RegExp("/lobby/" + code));
      await page.getByRole("button", { name: "Ready up" }).click();
    }
    await host.getByRole("button", { name: "Start game" }).click();
    await expect(host).toHaveURL(new RegExp("/game/" + code));
    for (const p of [host, alice, bob, bob, alice, host]) await playSetupTurn(p);
    await expect(host.getByRole("button", { name: "Roll dice" })).toBeVisible();
    await host.screenshot({ path: "shots/after-game-desktop.png" });

    // Play one real turn so the table shows production and prompts.
    await host.getByRole("button", { name: "Roll dice" }).click();
    await expect(host.locator(".dice-tray")).toBeVisible({ timeout: 8_000 });
    await host.waitForTimeout(1_600);
    if (await host.locator(".hex-target").count()) {
      await host.locator(".hex-target").first().click({ force: true });
      await host.waitForTimeout(900);
    }
    if (await host.locator(".victim").count()) {
      await host.locator(".victim").first().click();
      await host.waitForTimeout(900);
    }
    await expect(host.getByRole("button", { name: "End turn" }).or(host.getByRole("button", { name: "Roll dice" })).first()).toBeVisible({ timeout: 15_000 });
    await host.screenshot({ path: "shots/after-game-live.png" });

    await host.getByRole("button", { name: "Build", exact: true }).click();
    await host.waitForTimeout(500);
    await host.screenshot({ path: "shots/after-build.png" });
    await host.getByRole("button", { name: "Build", exact: true }).click();
    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await host.waitForTimeout(500);
    await host.screenshot({ path: "shots/after-trade.png" });
    await host.getByRole("tab", { name: "Bank & harbors" }).click();
    await host.waitForTimeout(400);
    await host.screenshot({ path: "shots/after-trade-bank.png" });
    await host.getByRole("button", { name: "Cards", exact: true }).click();
    await host.waitForTimeout(400);
    await host.screenshot({ path: "shots/after-cards.png" });
    await host.getByRole("button", { name: "Cards", exact: true }).click();
    await host.getByRole("button", { name: "Log", exact: true }).click();
    await host.waitForTimeout(400);
    await host.screenshot({ path: "shots/after-log.png" });

    await host.setViewportSize({ width: 390, height: 844 });
    await host.waitForTimeout(600);
    await host.getByRole("button", { name: "Log", exact: true }).click();
    await host.screenshot({ path: "shots/after-game-mobile.png" });
    await host.getByRole("button", { name: "Trade", exact: true }).click();
    await host.waitForTimeout(500);
    await host.screenshot({ path: "shots/after-trade-mobile.png" });
  } finally {
    await Promise.all([hostC.close(), aliceC.close(), bobC.close()]);
  }
});
