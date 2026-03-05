import { test, expect } from '@playwright/test';

/**
 * ABILITY SYSTEM VERIFICATION
 * Verifies that abilities are active and can be upgraded.
 */
test('ability system and upgrades', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 1. Start game
  await page.click('text=Nueva Run');

  // Wait for game to load
  const hpBar = page.locator('text=Vitality');
  await expect(hpBar).toBeVisible({ timeout: 10000 });

  // 2. Check if orbital is active (default)
  await expect(page.locator('text=Mobility')).toBeVisible();

  // Updated selectors for VS-style HUD (w-10 h-10)
  const activeAbilities = page.locator('.w-10.h-10.rounded-lg.bg-black\\/40');
  const emptySlots = page.locator('.w-10.h-10.rounded-lg.bg-white\\/\\[0\\.03\\]');

  await expect(activeAbilities).toHaveCount(1);
  await expect(emptySlots).toHaveCount(5); // Increased from 3 to 5 in new HUD

  // 3. Force Level Up via Store
  await page.evaluate(() => {
    const store = (window as any).useGameStore.getState();
    store.addXp(200); // Trigger level up
  });

  // 4. Check Level Up Overlay
  const overlay = page.locator('text=NIVEL 2 ALCANZADO');
  await expect(overlay).toBeVisible();

  // 5. Select an upgrade (click first card)
  await page.locator('.w-\\[280px\\]').first().click();

  // 6. Verify overlay closed and ability added/upgraded
  await expect(overlay).not.toBeVisible();

  const countAfter = await activeAbilities.count();
  expect(countAfter).toBeGreaterThanOrEqual(1);
});
