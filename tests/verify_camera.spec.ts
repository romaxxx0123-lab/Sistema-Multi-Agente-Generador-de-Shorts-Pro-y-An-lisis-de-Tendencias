import { test, expect } from '@playwright/test';

test('verify stable camera follow', async ({ page }) => {
  await page.goto('http://localhost:5180');

  // Start game
  await page.click('text=Nueva Run');

  // Wait for game to load
  await page.waitForSelector('canvas');

  // Get initial camera position via state if possible or just visual check
  // Since we can't easily get 3D camera pos via playwright without exposing it,
  // we will take a screenshot, move, and check if player is still centered.

  await page.waitForTimeout(2000); // Wait for initial lerp
  await page.screenshot({ path: 'verification/camera_start.png' });

  // Move player (W key)
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');

  await page.screenshot({ path: 'verification/camera_moved_forward.png' });

  // Turn player (A key)
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyA');

  await page.screenshot({ path: 'verification/camera_after_turn.png' });

  // If the camera followed correctly without rotating with the player,
  // the horizon in camera_after_turn.png should be level.
});
