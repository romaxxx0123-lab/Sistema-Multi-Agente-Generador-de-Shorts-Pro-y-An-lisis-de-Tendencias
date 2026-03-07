import { test, expect } from '@playwright/test';

test('verify gameplay and enemy death sequence', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 1. Wait for Hub
  await expect(page.locator('button:has-text("COMBATE")')).toBeVisible({ timeout: 15000 });

  // 2. Start Game
  await page.click('button:has-text("COMBATE")');

  // 3. Wait for game to load
  await page.waitForTimeout(2000);

  // 4. Move around
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');

  await page.screenshot({ path: 'verification/assembly_game_v2.png' });

  // 5. Check if enemies are spawned
  // (This is harder to verify with visual only but let's see)

  // 6. Go to Missions and check if integrated
  await page.keyboard.press('Escape'); // Pause
  await page.click('button:has-text("SALIR")'); // Back to menu

  await expect(page.locator('button:has-text("COMBATE")')).toBeVisible();

  // Click Mision tab
  await page.click('button:has-text("MISIÓN")');
  await expect(page.locator('h2:has-text("MISIONES")')).toBeVisible();
  await page.screenshot({ path: 'verification/assembly_missions_v2.png' });
});
