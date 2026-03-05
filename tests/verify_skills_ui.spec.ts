import { test, expect } from '@playwright/test';

/**
 * SKILLS UI VERIFICATION TEST
 * This script will trigger a level up and verify the visual enhancements
 * and keyboard shortcut selection.
 */
test('verify level up UI and keyboard shortcuts', async ({ page }) => {
  await page.goto('http://localhost:5180');

  // 1. Start Run
  const newRunButton = page.locator('button', { hasText: 'Nueva Run' });
  await expect(newRunButton).toBeVisible();
  await newRunButton.click();

  // 2. Trigger Level Up (by adding XP via window state)
  await page.evaluate(() => {
    window.useGameStore.getState().addXp(100); // Should trigger level 2
  });

  // 3. Verify Level Up Overlay Visibility
  const overlayHeader = page.locator('h2', { hasText: 'NIVEL 2 ALCANZADO' });
  await expect(overlayHeader).toBeVisible();

  // 4. Capture Screenshot of Enhanced UI
  await page.screenshot({ path: 'verification/levelup_ui_enhanced.png' });

  // 5. Test Keyboard Shortcut (Press '1')
  await page.keyboard.press('1');

  // 6. Verify Overlay Dismissed (Back to Playing)
  await expect(overlayHeader).not.toBeVisible();
  const hudVitality = page.locator('text=Vitality');
  await expect(hudVitality).toBeVisible();

  console.log('Level Up UI and keyboard logic verified.');
});
