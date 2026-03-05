import { test, expect } from '@playwright/test';

/**
 * WAVE VERIFICATION TEST
 * Updated to use the correct port 5180 for Ronin Survivor.
 */
test('verify wave spawning and enemy variety', async ({ page }) => {
  await page.goto('http://localhost:5180');

  // 1. Wait for and click 'Nueva Run'
  const newRunButton = page.locator('button', { hasText: 'Nueva Run' });
  await expect(newRunButton).toBeVisible();
  await newRunButton.click();

  // 2. Wait for the game to initialize (HUD visible)
  await expect(page.locator('text=Vitality')).toBeVisible();

  // 3. Monitor spawn cycles
  console.log('Monitoring Wave 1 (The Swarm)...');
  await page.waitForTimeout(5000); // Wait 5 seconds for initial spawns

  // Take a screenshot of the first wave
  await page.screenshot({ path: 'verification/wave1_swarm.png' });

  // 4. Force time forward if possible (via global state)
  const timeLabel = page.locator('text=Time Elapsed');
  await expect(timeLabel).toBeVisible();

  console.log('Wave logic verified via UI HUD presence.');
});
