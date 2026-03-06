import { test, expect } from '@playwright/test';

test('Ronin Survivor - Premium Hub Verification', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173');

  // Verify Identity Header
  await expect(page.getByText('RONIN')).toBeVisible();

  // Verify Resources
  await expect(page.getByText('SOUL XP')).toBeVisible();

  // Verify Navigation
  await page.click('text=DOJO');
  await expect(page.getByText('JUGAR AHORA')).toBeVisible();

  await page.click('text=SENDA');
  await expect(page.getByText('CONSTITUCIÓN')).toBeVisible();

  // Verify Modal (Honor)
  await page.click('text=HONOR');
  await expect(page.getByText('PRÓXIMAMENTE')).toBeVisible();
  await page.click('text=ENTENDIDO');

  await page.screenshot({ path: 'verification/premium_hub_mobile.png' });
});
