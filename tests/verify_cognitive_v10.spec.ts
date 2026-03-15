import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

test('verify v10 cognitive engine project generation - FPS', async ({ page }) => {
  await page.goto('http://localhost:5175');

  await page.fill('#projectName', 'CognitiveFPS');
  await page.selectOption('#complexity', 'Cognitive');
  await page.selectOption('#genre', 'FPS');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("DESPLEGAR PROYECTO HYPER-DETALLADO")')
  ]);

  const downloadPath = path.resolve('CognitiveFPS_v10.zip');
  await download.saveAs(downloadPath);

  const zipData = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipData);
  const files = Object.keys(zip.files);

  expect(files).toContain('Assets/Scripts/Cognitive/FPSController.cs');

  const controllerContent = await zip.files['Assets/Scripts/Cognitive/FPSController.cs'].async('string');
  expect(controllerContent).toContain('class FPSController');
  expect(controllerContent).toContain('void Shoot()');
  expect(controllerContent).toContain('RaycastHit hit');

  const readmeContent = await zip.files['README.md'].async('string');
  expect(readmeContent).toContain('Cognitive Engine');
  expect(readmeContent).toContain('Genre-Specific Reasoning: FPS');

  fs.unlinkSync(downloadPath);
});

test('verify v10 cognitive engine project generation - RPG', async ({ page }) => {
  await page.goto('http://localhost:5175');

  await page.fill('#projectName', 'CognitiveRPG');
  await page.selectOption('#complexity', 'Cognitive');
  await page.selectOption('#genre', 'RPG');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("DESPLEGAR PROYECTO HYPER-DETALLADO")')
  ]);

  const downloadPath = path.resolve('CognitiveRPG_v10.zip');
  await download.saveAs(downloadPath);

  const zipData = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipData);
  const files = Object.keys(zip.files);

  expect(files).toContain('Assets/Scripts/Cognitive/RPGSystem.cs');

  const systemContent = await zip.files['Assets/Scripts/Cognitive/RPGSystem.cs'].async('string');
  expect(systemContent).toContain('class RPGCharacter');
  expect(systemContent).toContain('void LevelUp()');
  expect(systemContent).toContain('class DialogueNPC');

  fs.unlinkSync(downloadPath);
});
