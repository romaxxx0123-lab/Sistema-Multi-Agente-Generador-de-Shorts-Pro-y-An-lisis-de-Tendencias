import { test, expect } from '@playwright/test';

test('Ronin Survivor - Final Loop Verification', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 1. Check HUB
  await expect(page.getByText('JUGAR AHORA')).toBeVisible();

  // 2. Start Game
  await page.click('text=JUGAR AHORA');

  // 3. Verify Game UI (HUD elements)
  await expect(page.getByText('Vitality', { exact: false })).toBeVisible({ timeout: 10000 });

  // 4. Cheat Level Up (Exactly one level)
  await page.evaluate(() => {
    (window as any).useGameStore.getState().addXp(160);
  });

  // 5. Check Level Up Overlay
  await expect(page.getByText('ALCANZADO')).toBeVisible();

  // 6. Select an upgrade (press '1')
  await page.keyboard.press('1');

  // 7. Verify back in game (HUD visible again)
  await expect(page.getByText('ALCANZADO')).not.toBeVisible();

  // 8. Cheat Chest
  await page.evaluate(() => {
    const store = (window as any).useGameStore.getState();
    store.spawnPickup({
        id: 'test-chest',
        type: 'chest',
        position: [0, 0, 0],
        value: 1
    });
    store.collectPickup('test-chest');
  });

  // 9. Check Chest Overlay
  await expect(page.getByText('RECOMPENSAS ANCESTRALES', { exact: false })).toBeVisible();
  await page.click('text=RECLAMAR TODO');

  // 10. Verify back in game
  await expect(page.getByText('RECOMPENSAS ANCESTRALES')).not.toBeVisible();

  await page.screenshot({ path: 'verification/final_loop_v3.png' });
});
