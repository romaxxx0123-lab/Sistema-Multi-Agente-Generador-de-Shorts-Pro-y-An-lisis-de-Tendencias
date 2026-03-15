import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

test('verify v8 nexus prime project generation', async ({ page }) => {
  await page.goto('http://localhost:5175');

  // Set project name
  await page.fill('#projectName', 'NexusTestProject');

  // Select Nexus Prime (V8.0)
  await page.selectOption('#complexity', 'NexusPrime');

  // Features are already active by default in App.tsx state,
  // but selecting NexusPrime ensures logic in generator.

  // Trigger download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("DESPLEGAR PROYECTO HYPER-DETALLADO")')
  ]);

  const downloadPath = path.resolve('NexusTestProject_v8.zip');
  await download.saveAs(downloadPath);

  // Verify ZIP content
  const zipData = fs.readFileSync(downloadPath);
  const zip = await JSZip.loadAsync(zipData);

  const files = Object.keys(zip.files);
  console.log('Files in ZIP:', files);

  // Check for core v8 files
  const expectedFiles = [
    'Assets/Scripts/Networking/NetworkManagerUI.cs',
    'Assets/Scripts/Networking/NetworkPlayer.cs',
    'Assets/Scripts/Systems/Addressables/AddressablesLoader.cs',
    'Assets/Settings/URP/Profiles/MainScenePostProcess.asset',
    'Packages/manifest.json'
  ];

  for (const file of expectedFiles) {
    expect(files).toContain(file);
  }

  // Verify manifest.json contains new packages
  const manifestContent = await zip.files['Packages/manifest.json'].async('string');
  const manifest = JSON.parse(manifestContent);
  expect(manifest.dependencies['com.unity.netcode.gameobjects']).toBeDefined();
  expect(manifest.dependencies['com.unity.addressables']).toBeDefined();

  // Verify NetworkManagerUI content
  const netManagerContent = await zip.files['Assets/Scripts/Networking/NetworkManagerUI.cs'].async('string');
  expect(netManagerContent).toContain('using Unity.Netcode;');
  expect(netManagerContent).toContain('public class NetworkManagerUI');

  console.log('V8 Functional verification passed!');

  // Cleanup
  fs.unlinkSync(downloadPath);
});
