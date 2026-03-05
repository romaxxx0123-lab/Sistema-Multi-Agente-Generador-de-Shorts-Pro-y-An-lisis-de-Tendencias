import { test, expect } from '@playwright/test';

test('survivor loop: waves, xp and leveling', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 1. Start game
  await page.click('text=JUGAR');
  await page.click('text=INICIAR');

  // Wait for game to load
  await expect(page.getByText('Vitality')).toBeVisible();

  // 2. Simulate killing enemies and gaining XP via store
  await page.evaluate(() => {
    const store = (window as any).useGameStore.getState();
    // Simulate drop
    store.spawnPickup({
        id: 'test-xp',
        type: 'xp',
        position: [0, 0, 0],
        value: 100
    });
  });

  // 3. Wait for level up
  await page.waitForTimeout(2000);
  await expect(page.getByText('NIVEL 2 ALCANZADO')).toBeVisible();

  // 4. Select upgrade
  await page.keyboard.press('1');
  await expect(page.getByText('NIVEL 2 ALCANZADO')).not.toBeVisible();

  // 5. Verify HUD stats
  await expect(page.getByText('LV.2')).toBeVisible();
});
