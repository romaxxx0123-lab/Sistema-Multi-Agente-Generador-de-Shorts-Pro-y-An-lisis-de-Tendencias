import asyncio
from playwright.async_api import async_playwright
import time

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})

        # Connect to the dev server
        await page.goto('http://localhost:5180')

        # Start game
        await page.click('button:has-text("Nueva Run")')

        # Wait for the HUD
        await page.wait_for_selector('text=VITALITY')

        # Move around to trigger walk animations
        await page.keyboard.down('w')
        await asyncio.sleep(1)
        await page.screenshot(path='/home/jules/verification/walk_animation.png')
        await page.keyboard.up('w')

        # Attack several times to trigger attack animations and slash trail
        for _ in range(3):
            await page.keyboard.press(' ')
            await asyncio.sleep(0.1)
            await page.screenshot(path=f'/home/jules/verification/attack_animation_{_}.png')
            await asyncio.sleep(0.4)

        # Wait for enemies and kill them to see dissolve
        await asyncio.sleep(5)
        # Spam attack
        for _ in range(10):
            await page.keyboard.press(' ')
            await asyncio.sleep(0.5)

        await page.screenshot(path='/home/jules/verification/combat_dissolve.png')

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
