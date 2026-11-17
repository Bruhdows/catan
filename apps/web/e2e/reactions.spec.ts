import { test, expect } from '@playwright/test';

test('room reactions reach all players and expire, with a curated asset set', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const host = await contextA.newPage();
  const guest = await contextB.newPage();
  try {
    await host.goto('/');
    await host.getByPlaceholder('Your nickname').fill('Host');
    await host.getByRole('button', { name: 'Start a new game' }).click();
    await expect(host).toHaveURL(/\/lobby\/[A-Z2-9]{6}$/);
    const code = host.url().split('/').at(-1)!;
    await guest.goto('/');
    await guest.getByPlaceholder('Your nickname').fill('Guest');
    await guest.getByPlaceholder('ABC123').fill(code);
    await guest.getByRole('button', { name: 'Join game' }).click();
    await expect(guest).toHaveURL(new RegExp(`/lobby/${code}$`));

    await host.getByRole('button', { name: 'Send a reaction' }).click();
    await host.getByRole('menuitem', { name: 'Happy' }).click();
    await expect(host.locator('.seat-emote')).toHaveCount(1);
    await expect(guest.locator('.seat-emote')).toHaveCount(1);
    await expect(guest.locator('.seat-emote')).toContainText('Host');
    await expect(guest.locator('.seat-emote')).toHaveCount(0, { timeout: 9000 });

    for (const asset of [
      '/kenney/emotes-pack/PNG/Vector/Style%203/emote_faceHappy.png',
      '/kenney/board-game-icons/PNG/Default%20(64px)/dice_1.png',
      '/kenney/interface-sounds/Audio/pluck_002.ogg',
      '/art/cursors/grab.png',
    ]) {
      const response = await guest.request.get(asset);
      expect(response.ok(), asset).toBe(true);
      expect((await response.body()).length, asset).toBeGreaterThan(50);
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
