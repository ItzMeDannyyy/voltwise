import os
from playwright.sync_api import sync_playwright

OUTPUT_DIR = "docs/manual/images/app-installation"
os.makedirs(OUTPUT_DIR, exist_ok=True)

TARGET_URL = "https://voltwise-orcin.vercel.app/"
VIEWPORT = {"width": 1280, "height": 860}

def run_smoke():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport=VIEWPORT)
        page = context.new_page()

        print(f"Navigating to {TARGET_URL}...")
        page.goto(TARGET_URL, wait_until="networkidle")

        # Scroll to install section
        install_section = page.locator("#install")
        if install_section.count() > 0:
            install_section.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)

            # Highlight the QR code card
            qr_card = page.locator(".qr-card")
            if qr_card.count() > 0:
                qr_card.evaluate("el => { el.style.outline = '3px solid #14B8A6'; el.style.outlineOffset = '4px'; }")

            screenshot_path = os.path.join(OUTPUT_DIR, "01-install-qr.png")
            page.screenshot(path=screenshot_path)
            print(f"Captured smoke screenshot: {screenshot_path}")
        else:
            screenshot_path = os.path.join(OUTPUT_DIR, "01-install-qr.png")
            page.screenshot(path=screenshot_path, full_page=False)
            print(f"Captured fallback screenshot: {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run_smoke()
