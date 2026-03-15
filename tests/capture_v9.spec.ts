import { test } from '@playwright/test';

test('capture v9 aetheris dashboard', async ({ page }) => {
  await page.goto('http://localhost:5175');
  await page.setViewportSize({ width: 1280, height: 1600 });

  // Wait for animations
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'aetheris_v9.png', fullPage: true });
});
