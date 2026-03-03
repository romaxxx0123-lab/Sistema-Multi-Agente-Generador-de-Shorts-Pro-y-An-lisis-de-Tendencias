import { test, expect } from '@playwright/test';

test('Verify Cognitive Engine includes Ultra-Detailed Enemies', async ({ page }) => {
  await page.goto('http://localhost:5175');

  await page.selectOption('#complexity', 'Cognitive');

  // Check if new enemy prefabs are visible in Hierarchy
  await expect(page.getByText('OmegaBoss.prefab')).toBeVisible();
  await expect(page.getByText('TitanTank.prefab')).toBeVisible();
  await expect(page.getByText('PeregrineScout.prefab')).toBeVisible();
  await expect(page.getByText('ShadowSniper.prefab')).toBeVisible();

  // Click generate and check terminal for the new model step
  await page.click('button:has-text("Desplegar Proyecto Hyper-Detallado")');

  await expect(page.getByText('[MODELS] Constructing Ultra-Detailed Enemy Prefabs...')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('[SUCCESS] Project deployed successfully.')).toBeVisible({ timeout: 20000 });
});
