import time
from playwright.sync_api import sync_playwright, expect

def verify_combat_and_pause(page):
    # Go to the local dev server
    page.goto("http://localhost:5180")

    # Wait for the Main Menu
    expect(page.get_by_text("RONIN SURVIVOR")).to_be_visible()

    # Click Start Run
    page.get_by_role("button", name="START RUN").click()

    # Wait for the game to load (HUD should be visible)
    expect(page.get_by_text("VITALITY")).to_be_visible()

    # Wait a bit for enemies to spawn
    print("Waiting for enemies to spawn...")
    time.sleep(5)

    # Take a screenshot of the normal gameplay
    page.screenshot(path="/home/jules/verification/gameplay_normal.png")

    # Press Space to attack
    page.keyboard.press("Space")
    time.sleep(0.1)
    # Take a screenshot during/after attack
    page.screenshot(path="/home/jules/verification/gameplay_attack.png")

    # Press Escape to pause
    page.keyboard.press("Escape")
    time.sleep(0.5)

    # Verify Pause Menu is visible
    expect(page.get_by_text("PAUSED")).to_be_visible()
    page.screenshot(path="/home/jules/verification/gameplay_paused.png")

    # Resume
    page.get_by_role("button", name="RESUME").click()
    expect(page.get_by_text("PAUSED")).not_to_be_visible()

    print("Verification successful!")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set viewport to 1280x720
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()
        try:
            verify_combat_and_pause(page)
        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
