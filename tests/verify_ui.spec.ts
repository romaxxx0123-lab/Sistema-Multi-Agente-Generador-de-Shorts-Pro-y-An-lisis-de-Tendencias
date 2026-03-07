import { test, expect } from '@playwright/test';

test('Character Selector UI is improved', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Wait for the main menu to load
  await page.waitForSelector('button:has-text("Personajes")');

  // Click "Personajes" to go to Character Selection
  await page.click('button:has-text("Personajes")');

  // Wait for character selector to appear - using a more robust selector
  await page.waitForSelector('h2:has-text("ELIGE TU LEYENDA")');
  await expect(page.locator('h2')).toContainText('ELIGE TU LEYENDA');

  // Check for Lucide icons or their containers
  const svgCount = await page.locator('svg').count();
  expect(svgCount).toBeGreaterThan(0);

  // Take a screenshot of the new UI
  await page.screenshot({ path: 'verification/new_character_selector.png', fullPage: true });
});
