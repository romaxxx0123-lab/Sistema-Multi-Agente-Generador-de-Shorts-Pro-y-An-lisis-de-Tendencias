from playwright.sync_api import sync_playwright
import time

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:5173")

        # Click Nueva Run
        page.wait_for_selector('button:has-text("Nueva Run")')
        page.click('button:has-text("Nueva Run")')

        # Wait for HUD
        page.wait_for_selector('text=VITALITY')

        print("Game started, waiting for spawns...")
        time.sleep(10)

        # Check store
        enemy_count = page.evaluate("window.useGameStore.getState().enemies.length")
        status = page.evaluate("window.useGameStore.getState().status")
        print(f"Status: {status}, Enemies: {enemy_count}")

        page.screenshot(path="verification/debug_attack_1.png")

        # Try attacking
        print("Simulating attack (Space)...")
        page.keyboard.down("Space")
        time.sleep(0.5)
        page.keyboard.up("Space")

        page.screenshot(path="verification/debug_attack_2.png")

        browser.close()

if __name__ == "__main__":
    verify()
