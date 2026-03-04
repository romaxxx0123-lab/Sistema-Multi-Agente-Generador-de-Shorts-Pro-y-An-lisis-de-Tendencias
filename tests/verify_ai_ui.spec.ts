import { test, expect } from '@playwright/test';

test('verify AI mode toggle and model selection', async ({ page }) => {
  await page.goto('http://localhost:5175');

  // Verify UI elements for AI mode
  const aiToggleHeading = page.getByText('Modo IA Real (Ollama)');
  await expect(aiToggleHeading).toBeVisible();

  const modelSelect = page.locator('select').filter({ hasText: 'qwen2.5-coder' });
  await expect(modelSelect).toBeDisabled(); // Initially disabled if AI mode is off

  // Toggle AI mode ON
  const toggleButton = page.locator('button.relative.w-14.h-8');
  await toggleButton.click();

  // Model select should now be enabled
  await expect(modelSelect).toBeEnabled();

  // Select a different model
  await modelSelect.selectOption('llama3.2');
  await expect(modelSelect).toHaveValue('llama3.2');
});
