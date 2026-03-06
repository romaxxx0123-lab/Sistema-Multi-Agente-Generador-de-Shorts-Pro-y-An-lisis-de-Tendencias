import { test, expect } from '@playwright/test';

test('premium hub navigation and game start', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173');

  // 1. Verify Premium Hub Home Identity
  await expect(page.getByText('RONIN').first()).toBeVisible();
  await expect(page.getByText('JUGAR AHORA')).toBeVisible();

  // 2. Resource Chips
  await expect(page.getByText('SOUL XP')).toBeVisible();
  await expect(page.getByText('RUNS')).toBeVisible();

  // 3. Screenshot
  await page.screenshot({ path: 'verification/premium_hub_desktop.png' });

  // 4. Verify "Próximamente" Modal for HONOR
  await page.click('text=HONOR');
  await expect(page.getByText('PRÓXIMAMENTE')).toBeVisible();
  await page.click('text=ENTENDIDO');
  await expect(page.getByText('PRÓXIMAMENTE')).not.toBeVisible();

  // 5. Mobile Layout Screenshot
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12 Pro
  await page.screenshot({ path: 'verification/premium_hub_mobile.png' });
});
