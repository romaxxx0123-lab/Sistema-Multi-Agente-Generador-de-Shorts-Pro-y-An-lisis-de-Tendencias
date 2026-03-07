import { test, expect } from '@playwright/test';

/**
 * RONIN SURVIVOR - FULL GAME ASSEMBLY VERIFICATION
 * Tests Hub navigation, Game start, and large map movement.
 */
test.describe('Ronin Survivor - Full Assembly', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5176/');
    // Initial wait for Hub
    await expect(page.locator('text=DOJO SINCRONIZADO')).toBeVisible();
  });

  test('should navigate to Missions and back', async ({ page }) => {
    // Click MISIÓN tab
    await page.click('text=MISIÓN');
    await expect(page.locator('text=MISIONES')).toBeVisible();
    await page.screenshot({ path: 'verification/assembly_missions.png' });

    // Back to Dojo
    await page.click('text=DOJO');
    await expect(page.locator('text=DOJO SINCRONIZADO')).toBeVisible();
  });

  test('should start run and move on large map', async ({ page }) => {
    // Click JUGAR AHORA
    await page.click('text=JUGAR AHORA');

    // Wait for Game Canvas
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1000);

    // Initial position on 200m map
    await page.screenshot({ path: 'verification/assembly_game_start.png' });

    // Move for 2 seconds (should cover ~14m at 7m/s)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2000);
    await page.keyboard.up('KeyW');

    await page.screenshot({ path: 'verification/assembly_game_moved.png' });
  });

});
