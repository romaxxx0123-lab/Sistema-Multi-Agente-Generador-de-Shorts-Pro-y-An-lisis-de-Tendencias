import { test, expect } from '@playwright/test';

test('verify v8.0 nexus prime ui', async ({ page }) => {
  await page.goto('http://localhost:5175/');
  await expect(page.getByText('Nexus Prime Engine')).toBeVisible();

  // Check for new toggles
  await expect(page.getByText('Netcode')).toBeVisible();
  await expect(page.getByText('Addressables V2')).toBeVisible();
  await expect(page.getByText('Post-Processing Pro')).toBeVisible();

  // Capture screenshot for visual confirmation
  await page.screenshot({ path: '/home/jules/verification/nexus_prime_v8.png', fullPage: true });
});
