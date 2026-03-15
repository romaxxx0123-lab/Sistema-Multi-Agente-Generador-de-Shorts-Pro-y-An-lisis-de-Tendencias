import { test, expect } from '@playwright/test';

test('Verify Cognitive Engine includes Perfected Enemies', async ({ page }) => {
  await page.goto('http://localhost:5175');

  // Complexity should be Cognitive by default now in the state, but let's be sure
  await page.selectOption('#complexity', 'Cognitive');

  // Check if enemies are visible in Hierarchy
  await expect(page.getByText('SlasherEnemy.prefab')).toBeVisible();
  await expect(page.getByText('DroneEnemy.prefab')).toBeVisible();
  await expect(page.getByText('EnemyAI.cs')).toBeVisible();

  // Click generate and check terminal for AI step
  await page.click('button:has-text("Desplegar Proyecto Hyper-Detallado")');

  // Wait for the AI training step to appear in terminal
  await expect(page.getByText('[AI] Training perfected Enemy AI models...')).toBeVisible({ timeout: 15000 });

  // Wait for success
  await expect(page.getByText('[SUCCESS] Project deployed successfully.')).toBeVisible({ timeout: 15000 });
});
