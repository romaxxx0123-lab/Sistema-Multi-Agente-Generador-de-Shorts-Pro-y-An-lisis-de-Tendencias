import time
from playwright.sync_api import sync_playwright, expect

def verify_combat_and_pause(page):
    # Go to the local dev server
    page.goto("http://localhost:5180")

    # Wait for the Main Menu or a long time
    time.sleep(10)

    # Take a screenshot to see where we are
    page.screenshot(path="/home/jules/verification/current_state.png")

    # Check if we can find the start button with a more generic selector if get_by_role fails
    try:
        page.get_by_text("START RUN").first.click(timeout=5000)
        print("Clicked START RUN via text")
    except:
        print("Failed to click START RUN via text, attempting to click the first button")
        page.locator("button").first.click(timeout=5000)

    # Wait for the game to load (HUD should be visible)
    time.sleep(5)
    page.screenshot(path="/home/jules/verification/gameplay_loaded.png")

    # Press Space to attack
    page.keyboard.press("Space")
    time.sleep(0.5)
    # Take a screenshot during/after attack
    page.screenshot(path="/home/jules/verification/gameplay_attack.png")

    # Press Escape to pause
    page.keyboard.press("Escape")
    time.sleep(1)

    # Verify Pause Menu is visible
    page.screenshot(path="/home/jules/verification/gameplay_paused.png")

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
