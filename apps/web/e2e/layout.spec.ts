import { test, expect, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, window: innerWidth }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.window + 1);
}

test('entry and lobby are usable at compact, tablet and desktop widths', async ({ page }) => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Catan' })).toBeVisible();
    await expect(page.getByPlaceholder('Your nickname')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (width === 360) await page.screenshot({ path: '/tmp/catan-qa-home-360.png', fullPage: true });
    if (width === 1440) {
      await page.getByPlaceholder('Your nickname').fill('Boardkeeper');
      await expect(page.getByRole('button', { name: 'Start a new game' })).toBeEnabled();
      await page.screenshot({ path: '/tmp/catan-qa-home-enabled.png' });
    }
  }
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await expect(page).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: '/tmp/catan-qa-lobby-desktop.png' });
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.getByLabel('Board size')).toBeVisible();
  await expect(page.getByLabel('Island layout')).toBeVisible();
  await expect(page.getByLabel('Turn timer')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: '/tmp/catan-qa-lobby-360.png', fullPage: true });
});
