import { test, expect } from '@playwright/test';

test('verify unity-architect generates a zip file', async ({ page }) => {
  await page.goto('http://localhost:5173');

  await expect(page.getByText('Ultimate Unity Architect')).toBeVisible();
  await expect(page.getByPlaceholder('My Awesome Game')).toBeVisible();
  await expect(page.getByRole('button', { name: /Desplegar Arquitectura/i })).toBeEnabled();
});
