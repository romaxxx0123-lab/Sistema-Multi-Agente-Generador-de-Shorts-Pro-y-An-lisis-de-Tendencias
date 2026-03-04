import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await p.new_context(viewport={'width': 1280, 'height': 720}).new_page()

        # Go to the app
        await page.goto('http://localhost:5173')
        await page.wait_for_timeout(2000)

        # Click "Nueva Run" to start
        # Use a more flexible selector for the button
        start_button = page.get_by_role("button", name="Nueva Run")
        await start_button.click()

        print("Game started, waiting for enemies to spawn...")
        # Wait 20 seconds for multiple waves to spawn
        await page.wait_for_timeout(20000)

        # Move a bit to see if we can find them (WASD)
        await page.keyboard.down('w')
        await page.wait_for_timeout(2000)
        await page.keyboard.up('w')

        # Take screenshot
        await page.screenshot(path='/home/jules/verification/enemies_polished_v3.png')
        print("Screenshot saved to /home/jules/verification/enemies_polished_v3.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
