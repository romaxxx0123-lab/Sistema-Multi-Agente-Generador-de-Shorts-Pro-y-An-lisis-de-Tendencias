import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

test('generate v7.0 omni-architect unity project', async ({ page }) => {
  // Use port 5175 since we've verified it works
  await page.goto('http://localhost:5175/');

  await expect(page.getByText('Unity World Architect v7.0')).toBeVisible();

  // Set complexity to OmniArchitect (V7.0)
  await page.selectOption('select#complexity', 'OmniArchitect');

  // Toggle CICD to true
  const cicdButton = page.getByRole('button', { name: 'CI/CD' });
  await cicdButton.click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Desplegar Proyecto Hyper-Detallado")')
  ]);

  const downloadPath = path.join('/home/jules/verification', 'v7_omni_test.zip');
  await download.saveAs(downloadPath);

  const zipData = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipData);

  const expectedFiles = [
    '.github/workflows/unity-build.yml',
    'Assets/Scripts/Systems/Inventory/InventorySystem.cs',
    'Assets/Scripts/Systems/Stats/StatSystem.cs',
    'Assets/Scripts/UI/UIManager.cs',
    'Assets/Scripts/UI/UIPresenter.cs',
    'Assets/Scripts/Core/EventBus.cs',
    'Assets/Scripts/AI/BehaviorTree.cs',
    'ProjectSettings/Physics2DSettings.asset',
    'ProjectSettings/EditorBuildSettings.asset',
    'ProjectSettings/GraphicsSettings.asset',
    'Packages/manifest.json'
  ];

  console.log('Checking ZIP content for v7.0 Omni-Architect...');
  for (const file of expectedFiles) {
    expect(zip.files[file], `Missing file: ${file}`).toBeDefined();
  }

  // Check for Input System in manifest
  const manifestContent = await zip.files['Packages/manifest.json'].async('string');
  expect(manifestContent).toContain('com.unity.inputsystem');

  // Check GraphicsSettings for URP GUID link
  const graphicsSettingsContent = await zip.files['ProjectSettings/GraphicsSettings.asset'].async('string');
  // In Unity 2022.3, the property is m_CustomRenderPipeline
  expect(graphicsSettingsContent).toContain('m_CustomRenderPipeline: {fileID: 11400000, guid:');

  console.log('All v7.0 Omni-Architect files found and verified.');
});
