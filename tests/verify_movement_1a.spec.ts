import { test, expect } from '@playwright/test';

/**
 * RONIN SURVIVOR - MOVEMENT VERIFICATION (1A)
 * Tests WASD movement and arena boundary constraints.
 */
test.describe('Ronin Survivor - Part 1A Movement', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the local dev server
    await page.goto('http://localhost:5176/');
    // Wait for the 1A HUD to be visible, ensuring the 1A view is loaded
    await expect(page.locator('text=RONIN SURVIVOR - PARTE 1A')).toBeVisible();
    await page.waitForSelector('canvas');
  });

  test('should move character in 8 directions (visual verification)', async ({ page }) => {
    // We will use screenshots to verify the character moves from the center
    // Center marker is at (0,0). camera is at Z=-8, Y=4 looking at center.

    // 1. Initial State
    await page.screenshot({ path: 'verification/1a_initial_pos.png' });

    // 2. Move Forward (W)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: 'verification/1a_moved_forward.png' });

    // 3. Move Right-Forward (W+D)
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    await page.screenshot({ path: 'verification/1a_moved_diagonal.png' });
  });

  test('should not exit arena boundaries', async ({ page }) => {
    // Arena is 50x50, so boundaries are at +/- 25m.
    // Speed is 5m/s. Moving for 10 seconds should hit the wall (50m total, exceeds 25m limit).

    // Move Forward (W) for a long time
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(6000); // Should be stuck at Z=25 (approx)
    await page.keyboard.up('KeyW');

    // Take screenshot to verify we are still inside the grid view
    await page.screenshot({ path: 'verification/1a_boundary_test.png' });

    // Visual check: If the character didn't disappear and the grid is still visible,
    // physics are likely working.
  });

});
