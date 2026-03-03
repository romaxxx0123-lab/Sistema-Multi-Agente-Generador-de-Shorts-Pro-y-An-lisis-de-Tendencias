import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        try:
            print("Navigating to app...")
            await page.goto("http://localhost:5173", wait_until="networkidle")
            await asyncio.sleep(2)
            await page.screenshot(path="verification/step1_menu.png")

            print("Clicking NUEVA RUN...")
            await page.click("text=NUEVA RUN")
            await asyncio.sleep(2)
            await page.screenshot(path="verification/step2_game.png")

            # Try to toggle debug panel
            print("Toggling debug panel (F3)...")
            await page.keyboard.press("F3")
            await asyncio.sleep(1)
            await page.screenshot(path="verification/step3_debug.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

asyncio.run(run())
