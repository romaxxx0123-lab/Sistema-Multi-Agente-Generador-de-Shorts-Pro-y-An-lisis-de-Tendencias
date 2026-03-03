import { test, expect } from '@playwright/test';

test('verify pro models expansion v10.3', async ({ page }) => {
  await page.goto('http://localhost:5175');

  // Check for Pro Architect branding
  await expect(page.locator('text=Unity World Architect v10.3 - Pro Architect')).toBeVisible();

  // Ensure "Cognitive Pro (V10.3)" is selectable
  const complexitySelect = page.locator('#complexity');
  await complexitySelect.selectOption('Cognitive');
  await expect(complexitySelect).toHaveValue('Cognitive');

  // Verify Pro Prefab folders in hierarchy
  await expect(page.locator('text=Vehicles').first()).toBeVisible();
  await expect(page.locator('text=ProVehicle_GT.prefab')).toBeVisible();

  // Use exact text to avoid matching "Player/Environment"
  await expect(page.getByText('Environment', { exact: true })).toBeVisible();
  await expect(page.locator('text=ProBuilding_Modular.prefab')).toBeVisible();
  await expect(page.locator('text=ProNature_Oak.prefab')).toBeVisible();

  await expect(page.locator('text=Props')).toBeVisible();
  await expect(page.locator('text=ProProp_Crate.prefab')).toBeVisible();

  // Test generation process
  const deployBtn = page.locator('text=Desplegar Proyecto Hyper-Detallado');
  await deployBtn.click();

  // Check for the new reasoning step in terminal (with longer timeout because of generation simulation)
  await expect(page.locator('text=[PRO] Synthesizing High-Fidelity Vehicles and Props...')).toBeVisible({ timeout: 15000 });

  // Wait for success
  await expect(page.locator('text=[SUCCESS] Project deployed successfully.')).toBeVisible({ timeout: 15000 });

  await page.screenshot({ path: 'verification/pro_models_v10_3.png', fullPage: true });
});
