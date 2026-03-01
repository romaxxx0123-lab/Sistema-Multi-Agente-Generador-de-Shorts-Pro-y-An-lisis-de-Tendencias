import { test, expect } from '@playwright/test';

test('verify lesson screen and race hud', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Click on the first lesson button (the one with the star)
  // It's the only one enabled initially
  await page.click('button:has-text("TRANSFERENCIA DE PESO")');

  // Wait for lesson screen to load
  await page.waitForSelector('.max-w-4xl');

  // Take a screenshot of the lesson screen
  await page.screenshot({ path: 'verification/v4_lesson_screen.png' });

  // Check if Race HUD elements are present
  // The Tachometer is a div with a border-t-transparent and rounded-t-full
  // Gear indicator is a div with "G" followed by a number
  const gearIndicator = page.locator('div:text-matches("G[1-6]")');
  await expect(gearIndicator).toBeVisible();
});
