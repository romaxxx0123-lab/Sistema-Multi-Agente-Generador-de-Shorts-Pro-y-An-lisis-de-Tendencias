import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

test('verify v9 aetheris engine project generation', async ({ page }) => {
  await page.goto('http://localhost:5175');

  // Set project name
  await page.fill('#projectName', 'AetherisProject');

  // Select Aetheris Engine (V9.0)
  await page.selectOption('#complexity', 'Aetheris');

  // Trigger download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("DESPLEGAR PROYECTO HYPER-DETALLADO")')
  ]);

  const downloadPath = path.resolve('AetherisProject_v9.zip');
  await download.saveAs(downloadPath);

  // Verify ZIP content
  const zipData = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipData);

  const files = Object.keys(zip.files);

  // Check for core v9 files
  const expectedFiles = [
    '.gitignore',
    '.editorconfig',
    'Assets/Scripts/Architecture/Events/GameEvent.cs',
    'Assets/Scripts/Architecture/Variables/FloatVariable.cs',
    'Assets/Scripts/UI/UIModel.cs',
    'Assets/Scripts/UI/UIView.cs',
    'Assets/Scripts/UI/UIPresenter.cs',
    'Assets/Editor/ProjectInitializer.cs',
    'README.md'
  ];

  for (const file of expectedFiles) {
    expect(files).toContain(file);
  }

  // Verify UI Presenter content (MVP refactor)
  const presenterContent = await zip.files['Assets/Scripts/UI/UIPresenter.cs'].async('string');
  expect(presenterContent).toContain('protected abstract void Refresh();');
  expect(presenterContent).toContain('model.OnDataChanged += Refresh;');

  // Verify README content
  const readmeContent = await zip.files['README.md'].async('string');
  expect(readmeContent).toContain('Aetheris Engine');
  expect(readmeContent).toContain('Scriptable Architecture');

  console.log('V9 Aetheris verification passed!');

  // Cleanup
  fs.unlinkSync(downloadPath);
});
