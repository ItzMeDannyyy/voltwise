import os
import time
from playwright.sync_api import sync_playwright

LOCAL_BASE = "http://localhost:8081"
WEB_BASE = "https://voltwise-orcin.vercel.app"

MOBILE_VIEWPORT = {"width": 390, "height": 844}
DESKTOP_VIEWPORT = {"width": 1280, "height": 860}

def capture_all():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Desktop context for web landing & QR installation
        d_ctx = browser.new_context(viewport=DESKTOP_VIEWPORT)
        d_page = d_ctx.new_page()

        print("Capturing Web / QR Installation...")
        d_page.goto(WEB_BASE, wait_until="networkidle")

        os.makedirs("docs/manual/images/app-installation", exist_ok=True)
        # Highlight QR Card
        install_sec = d_page.locator("#install")
        if install_sec.count() > 0:
            install_sec.scroll_into_view_if_needed()
            d_page.wait_for_timeout(1000)
            qr_card = d_page.locator(".qr-card")
            if qr_card.count() > 0:
                qr_card.evaluate("el => { el.style.outline = '3px solid #14B8A6'; el.style.outlineOffset = '4px'; }")
            d_page.screenshot(path="docs/manual/images/app-installation/01-install-qr.png")

        # Telemetry & Relay captures from web
        os.makedirs("docs/manual/images/dashboard-monitoring", exist_ok=True)
        monitor_sec = d_page.locator("#monitor")
        if monitor_sec.count() > 0:
            monitor_sec.scroll_into_view_if_needed()
            d_page.wait_for_timeout(800)
            d_page.screenshot(path="docs/manual/images/dashboard-monitoring/02-telemetry-live.png")

        os.makedirs("docs/manual/images/power-breaker-control", exist_ok=True)
        features_sec = d_page.locator("#features")
        if features_sec.count() > 0:
            features_sec.scroll_into_view_if_needed()
            d_page.wait_for_timeout(800)
            d_page.screenshot(path="docs/manual/images/power-breaker-control/02-relay-architecture.png")

        os.makedirs("docs/manual/images/safety-alerts", exist_ok=True)
        stmt_sec = d_page.locator("#statement")
        if stmt_sec.count() > 0:
            stmt_sec.scroll_into_view_if_needed()
            d_page.wait_for_timeout(800)
            d_page.screenshot(path="docs/manual/images/safety-alerts/02-safety-cut.png")

        d_ctx.close()

        # 2. Mobile Context for App Screens
        m_ctx = browser.new_context(
            viewport=MOBILE_VIEWPORT,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            is_mobile=True,
            has_touch=True
        )
        m_page = m_ctx.new_page()

        print("Capturing App Screens from Expo Web...")
        # Auth Screens
        os.makedirs("docs/manual/images/account-auth", exist_ok=True)
        m_page.goto(f"{LOCAL_BASE}/(auth)/login", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(4000)
        m_page.screenshot(path="docs/manual/images/account-auth/01-login-screen.png")

        m_page.goto(f"{LOCAL_BASE}/(auth)/register", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path="docs/manual/images/account-auth/02-register-screen.png")

        m_page.goto(f"{LOCAL_BASE}/(auth)/forgot-password", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path="docs/manual/images/account-auth/03-forgot-password.png")

        # Dashboard Screen
        m_page.goto(f"{LOCAL_BASE}/(tabs)/dashboard", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(4000)
        m_page.screenshot(path="docs/manual/images/dashboard-monitoring/01-dashboard.png")

        # Devices Screen
        os.makedirs("docs/manual/images/appliance-management", exist_ok=True)
        m_page.goto(f"{LOCAL_BASE}/(tabs)/devices", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(4000)
        m_page.screenshot(path="docs/manual/images/appliance-management/01-devices-list.png")

        # IoT Provisioning
        os.makedirs("docs/manual/images/iot-provisioning", exist_ok=True)
        m_page.goto(f"{LOCAL_BASE}/iot-provision", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path="docs/manual/images/iot-provisioning/01-iot-provision.png")

        m_page.goto(f"{LOCAL_BASE}/iot-settings", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path="docs/manual/images/iot-provisioning/02-iot-settings.png")

        # Analytics Screen
        os.makedirs("docs/manual/images/analytics-billing", exist_ok=True)
        m_page.goto(f"{LOCAL_BASE}/(tabs)/analytics", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(4000)
        m_page.screenshot(path="docs/manual/images/analytics-billing/01-analytics.png")

        # Alerts Screen
        m_page.goto(f"{LOCAL_BASE}/(tabs)/alerts", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(4000)
        m_page.screenshot(path="docs/manual/images/safety-alerts/01-alerts-list.png")

        # Settings
        os.makedirs("docs/manual/images/settings-preferences", exist_ok=True)
        m_page.goto(f"{LOCAL_BASE}/settings", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path="docs/manual/images/settings-preferences/01-settings.png")

        m_page.goto(f"{LOCAL_BASE}/notification-settings", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path="docs/manual/images/settings-preferences/02-notifications.png")

        # Power control modal (triggered on dashboard)
        m_page.goto(f"{LOCAL_BASE}/(tabs)/dashboard", wait_until="domcontentloaded", timeout=60000)
        m_page.wait_for_timeout(3000)
        power_tab = m_page.locator("a[href*='power'], div[aria-label*='power'], [data-testid='power-tab']").first
        if power_tab.count() > 0:
            power_tab.click()
            m_page.wait_for_timeout(1500)
            m_page.screenshot(path="docs/manual/images/power-breaker-control/01-power-modal.png")

        m_ctx.close()
        browser.close()
        print("All captures completed successfully!")

if __name__ == "__main__":
    capture_all()
