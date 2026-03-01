import { test, expect } from '@playwright/test';

test('verify lesson screen and race hud', async ({ page }) => {
  // Use the port from the dev server log if known, usually 5173 or 5174
  await page.goto('http://localhost:5174');

  // Click on the first lesson button (the one with the star)
  // It is the first button in the lesson path
  await page.locator('button.relative.w-22.h-22').first().click();

  // Wait for transition and intro modal
  await page.waitForTimeout(5000);

  // Click "ESTOY LISTO"
  await page.getByRole('button', { name: '¡ESTOY LISTO!' }).click();

  // Wait for lesson screen to load
  await expect(page.getByText('¿Qué es esto?')).toBeVisible();

  // Take a screenshot of the lesson screen
  await page.screenshot({ path: 'verification/v4_lesson_screen.png' });

  // Check if Race HUD elements are present
  // Gear indicator is a div with "G" followed by a number
  const gearIndicator = page.locator('div:text-matches("G[1-6]")');
  await expect(gearIndicator).toBeVisible();
});
