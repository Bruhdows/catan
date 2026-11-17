import { test, expect } from '@playwright/test';

// Verify cursor URL/hotspot choices instead of screenshotting the OS pointer,
// which browser screenshots deliberately omit.
test('custom cursors load, map to correct affordances, and respect text inputs', async ({ page }) => {
  await page.goto('/');
  const bodyCursor = await page.locator('body').evaluate(el => getComputedStyle(el).cursor);
  expect(bodyCursor).toContain('/art/cursors/default.png');

  const name = page.getByPlaceholder('Your nickname');
  await expect(name).toBeVisible();
  expect(await name.evaluate(el => getComputedStyle(el).cursor)).toBe('text');
  await name.fill('Cursor Test');

  const create = page.getByRole('button', { name: 'Start a new game' });
  const buttonCursor = await create.evaluate(el => getComputedStyle(el).cursor);
  expect(buttonCursor).toContain('/art/cursors/select.png');
  await create.click();
  await expect(page).toHaveURL(/\/lobby\//);

  const assets = ['default', 'select', 'grab', 'grabbing', 'build', 'place', 'disabled'];
  for (const filename of assets) {
    const response = await page.request.get('/art/cursors/' + filename + '.png');
    expect(response.ok(), filename).toBe(true);
    expect(response.headers()['content-type'], filename).toContain('image/png');
    expect((await response.body()).length, filename).toBeGreaterThan(400);
  }
});
