import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

test('generate hyper-detailed unity project', async ({ page }) => {
  await page.goto('http://localhost:5174/');

  await expect(page.getByText('Ultimate Unity Architect')).toBeVisible();

  // Set complexity to Ultimate Pro if not already
  await page.selectOption('select:below(label:has-text("Nivel de Detalle"))', 'UltimatePro');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Desplegar Proyecto Hyper-Detallado")')
  ]);

  const downloadPath = path.join('/home/jules/verification', 'hyper_detailed_test.zip');
  await download.saveAs(downloadPath);

  const zipData = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipData);

  const expectedFiles = [
    'Assets/Scripts/Core/EventBus.cs',
    'Assets/Scripts/Core/LocalizationManager.cs',
    'Assets/Scripts/Patterns/RobustStateMachine.cs',
    'ProjectSettings/QualitySettings.asset',
    'ProjectSettings/GraphicsSettings.asset',
    'ProjectSettings/InputManager.asset',
    'Plugins.meta',
    'Docs.meta',
    'Assets/Audio.meta',
    'Assets/Textures.meta',
    'Assets/Scripts/AI/BehaviorTree.cs.meta',
    'Assets/Tests/CoreSystemsTests.cs'
  ];

  console.log('Checking ZIP content...');
  for (const file of expectedFiles) {
    expect(zip.files[file], `Missing file: ${file}`).toBeDefined();
  }

  console.log('All expected files found in hyper-detailed project.');
});
