import { test, expect } from '@playwright/test';

test('Ronin Survivor - Premium UI & Responsive Verification', async ({ page }) => {
  // Set Mobile Viewport
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12

  await page.goto('http://localhost:5173');

  // 1. Check HUB Mobile Navigation
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.getByText('DOJO')).toBeVisible();
  await expect(page.getByText('MISIÓN')).toBeVisible();

  // 2. Navigation Flow
  await page.click('text=MISIÓN');
  await expect(page.getByText('VALLE DE LAS SOMBRAS')).toBeVisible();

  await page.click('text=SENDA');
  await expect(page.getByText('CONSTITUCIÓN')).toBeVisible();

  // 3. Back to Home and Start Run
  await page.click('text=DOJO');
  await page.click('text=JUGAR AHORA');

  // 4. In-game HUD
  await expect(page.getByText('Rank', { exact: false })).toBeVisible();

  // 5. Level Up Overlay Responsive
  await page.evaluate(() => {
    (window as any).useGameStore.getState().addXp(200);
  });
  await expect(page.getByText('ALCANZADO')).toBeVisible();

  // 6. Select Option
  await page.keyboard.press('1');
  await expect(page.getByText('ALCANZADO')).not.toBeVisible();

  await page.screenshot({ path: 'verification/premium_ui_mobile.png' });
});

test('Ronin Survivor - Desktop View', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173');
  await expect(page.getByText('RONIN')).toBeVisible();
  await page.screenshot({ path: 'verification/premium_ui_desktop.png' });
});
