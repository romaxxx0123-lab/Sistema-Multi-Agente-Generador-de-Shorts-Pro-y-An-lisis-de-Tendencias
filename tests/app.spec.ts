import { test, expect } from '@playwright/test';

test('verify unity-architect UI and generation', async ({ page }) => {
  await page.goto('http://localhost:5175');

  await expect(page.getByText('Ultimate Unity Architect')).toBeVisible();

  // Verify main configuration inputs exist
  const projectNameInput = page.locator('#projectName');
  await expect(projectNameInput).toHaveValue('HyperMegaGame');

  const complexitySelect = page.locator('#complexity');
  await expect(complexitySelect).toHaveValue('Cognitive');

  // Verify professional systems toggles
  await expect(page.getByText('AsmDefs')).toBeVisible();
  await expect(page.getByText('High URP')).toBeVisible();
  await expect(page.getByText('Inputs V2')).toBeVisible();

  // Verify the main action button
  const deployButton = page.getByRole('button', { name: /Desplegar Proyecto Hyper-Detallado/i });
  await expect(deployButton).toBeEnabled();
});
