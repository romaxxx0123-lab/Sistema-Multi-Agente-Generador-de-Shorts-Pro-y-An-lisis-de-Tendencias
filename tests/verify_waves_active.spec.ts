import { test, expect } from '@playwright/test';

test('verify wave spawning and enemy presence', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Start the game
  await page.click('button:has-text("Nueva Run")');

  // Wait for game to load (HUD appears)
  await page.waitForSelector('text=VITALITY');
  await page.waitForSelector('canvas');

  // Wait for some time to allow spawning (Wave 1: 1 enemy every 2s)
  // After 10 seconds, there should be at least 4-5 enemies
  await page.waitForTimeout(10000);

  // Check the number of enemies in the store
  const enemyCount = await page.evaluate(() => {
    return window.useGameStore.getState().enemies.length;
  });

  console.log(`Enemies detected in store: ${enemyCount}`);
  expect(enemyCount).toBeGreaterThan(0);

  // Take a screenshot after 10 seconds
  await page.screenshot({ path: 'verification/wave1_active_store.png' });
});
