import { test, expect } from '@playwright/test';

test('verify samurai model and elite aura with rendering', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Start the game
  await page.click('button:has-text("Nueva Run")');

  // Wait for game to load
  await page.waitForSelector('text=VITALITY');

  // Force spawn a Samurai and an Elite Samurai via store
  await page.evaluate(() => {
    const spawn = window.useGameStore.getState().spawnEnemy;
    spawn({
      id: 'test-samurai',
      type: 'samurai',
      position: [2, 0, -5],
      hp: 100,
      maxHp: 100,
      isElite: false
    });
    spawn({
      id: 'test-samurai-elite',
      type: 'samurai',
      position: [-2, 0, -5],
      hp: 300,
      maxHp: 300,
      isElite: true
    });
  });

  // Give more time for WebGL to warm up and for the camera to settle
  await page.waitForTimeout(5000);

  // Take a screenshot
  await page.screenshot({ path: 'verification/samurai_showcase_v2.png' });

  const enemyCount = await page.evaluate(() => {
    return window.useGameStore.getState().enemies.length;
  });
  expect(enemyCount).toBeGreaterThanOrEqual(2);
});
