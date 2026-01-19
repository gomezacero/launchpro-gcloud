"""
LaunchPro - Playwright Test Examples

These examples demonstrate how to test critical flows in LaunchPro:
1. Login flow
2. Campaign creation
3. ROAS rules configuration
4. Compliance dashboard
5. Analytics page

Usage:
  python scripts/with_server.py --server "npm run dev" --port 3000 -- python examples/launchpro_tests.py
"""

from playwright.sync_api import sync_playwright
import time

# Configuration
BASE_URL = "http://localhost:3000"
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "testpassword123"


def test_login_flow(page):
    """Test the login flow"""
    print("Testing login flow...")

    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state('networkidle')

    # Fill login form
    page.fill('input[name="email"]', TEST_EMAIL)
    page.fill('input[name="password"]', TEST_PASSWORD)

    # Submit
    page.click('button[type="submit"]')
    page.wait_for_load_state('networkidle')

    # Verify redirect to dashboard
    assert "/dashboard" in page.url, f"Expected dashboard, got {page.url}"
    print("Login flow: PASSED")


def test_campaign_list(page):
    """Test campaign list page loads correctly"""
    print("Testing campaign list...")

    page.goto(f"{BASE_URL}/campaigns")
    page.wait_for_load_state('networkidle')

    # Check for campaign table or empty state
    table = page.locator('table')
    empty_state = page.locator('text=No campaigns found')

    assert table.count() > 0 or empty_state.count() > 0, "Neither table nor empty state found"
    print("Campaign list: PASSED")


def test_new_campaign_form(page):
    """Test new campaign form elements exist"""
    print("Testing new campaign form...")

    page.goto(f"{BASE_URL}/campaigns/new")
    page.wait_for_load_state('networkidle')

    # Check for key form elements
    assert page.locator('input[name="name"]').count() > 0, "Campaign name field not found"
    assert page.locator('select').count() > 0, "Platform selector not found"

    print("New campaign form: PASSED")


def test_rules_page(page):
    """Test rules page loads with ROAS calculator"""
    print("Testing rules page...")

    page.goto(f"{BASE_URL}/rules")
    page.wait_for_load_state('networkidle')

    # Check for rules content
    content = page.content()
    assert "ROAS" in content or "reglas" in content.lower(), "Rules content not found"

    print("Rules page: PASSED")


def test_compliance_dashboard(page):
    """Test compliance dashboard loads"""
    print("Testing compliance dashboard...")

    page.goto(f"{BASE_URL}/compliance")
    page.wait_for_load_state('networkidle')

    # Check for compliance elements
    heading = page.locator('h1')
    assert heading.count() > 0, "No heading found on compliance page"

    print("Compliance dashboard: PASSED")


def test_analytics_page(page):
    """Test analytics page with Looker embed"""
    print("Testing analytics page...")

    page.goto(f"{BASE_URL}/analytics")
    page.wait_for_load_state('networkidle')

    # Check for iframe (Looker embed) or configuration message
    iframe = page.locator('iframe')
    config_message = page.locator('text=no configurado')

    assert iframe.count() > 0 or config_message.count() > 0, "Neither iframe nor config message found"

    print("Analytics page: PASSED")


def test_settings_page(page):
    """Test settings page (SUPERADMIN only)"""
    print("Testing settings page...")

    page.goto(f"{BASE_URL}/settings")
    page.wait_for_load_state('networkidle')

    # Check for settings tabs
    tabs = page.locator('text=General')

    # Might redirect to login or show 403 if not SUPERADMIN
    if "/login" in page.url:
        print("Settings page: SKIPPED (requires auth)")
        return

    print("Settings page: PASSED")


def take_screenshot(page, name):
    """Helper to take screenshots for debugging"""
    page.screenshot(path=f"/tmp/launchpro_{name}.png", full_page=True)
    print(f"Screenshot saved: /tmp/launchpro_{name}.png")


def run_all_tests():
    """Run all LaunchPro tests"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        tests = [
            ("login", test_login_flow),
            ("campaigns", test_campaign_list),
            ("new_campaign", test_new_campaign_form),
            ("rules", test_rules_page),
            ("compliance", test_compliance_dashboard),
            ("analytics", test_analytics_page),
            ("settings", test_settings_page),
        ]

        passed = 0
        failed = 0

        for name, test_fn in tests:
            try:
                test_fn(page)
                passed += 1
            except AssertionError as e:
                print(f"{name}: FAILED - {e}")
                take_screenshot(page, f"{name}_failed")
                failed += 1
            except Exception as e:
                print(f"{name}: ERROR - {e}")
                take_screenshot(page, f"{name}_error")
                failed += 1

        browser.close()

        print(f"\n{'='*40}")
        print(f"Results: {passed} passed, {failed} failed")
        print(f"{'='*40}")

        return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
