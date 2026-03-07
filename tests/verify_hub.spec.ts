import { test, expect } from '@playwright/test';

/**
 * HUB NAVIGATION & WORKFLOW VERIFICATION
 * Tests the new MenuRoot, HomeScreen, and core Hub flow.
 */
test('hub navigation and game start', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 1. Verify Hub Home
  await expect(page.getByText('RONIN SURVIVOR').first()).toBeVisible();
  await expect(page.getByText('JUGAR')).toBeVisible();

  // 2. Navigate to Chapters
  await page.click('text=CAPÍTULOS');
  await expect(page.getByText('VALLE DE LAS SOMBRAS')).toBeVisible();

  // 3. Navigate back to Home using ESC (Global Key Listener)
  await page.keyboard.press('Escape');
  await expect(page.getByText('JUGAR')).toBeVisible();

  // 4. Navigate to Talents
  await page.click('text=TALENTOS');
  await expect(page.getByText('CONSTITUCIÓN')).toBeVisible();

  // 5. Navigate back to Home
  await page.keyboard.press('Escape');

  // 6. Navigate to Loadout
  await page.click('text=LOADOUT');
  await expect(page.getByText('FILO MÍSTICO')).toBeVisible();

  // 7. Start Run from Loadout
  await page.click('text=COMENZAR BATALLA');

  // 8. Verify Game HUD
  await expect(page.getByText('Vitality')).toBeVisible();

  // 9. Verify Pause Overlay
  await page.keyboard.press('Escape');
  await expect(page.getByText('EN PAUSA')).toBeVisible();

  // 10. Resume
  await page.click('text=CONTINUAR');
  await expect(page.getByText('EN PAUSA')).not.toBeVisible();
});
