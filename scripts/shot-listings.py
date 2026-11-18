#!/usr/bin/env python3
"""등록 화면·매물 목록 화면 스크린샷 (보고용)

    MODE=prod scripts/with-dev.sh python3 scripts/shot-listings.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
OUT = "/workspace/downloads"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 1250}, locale="ko-KR")
        page = ctx.new_page()

        # /listings — 정식 검증 매물 + 샘플
        page.goto(f"{BASE}/listings", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=listing-card]", timeout=60000)
        page.wait_for_timeout(800)
        page.screenshot(path=f"{OUT}/redev-listings-page.png", full_page=True)

        # /register — 구역 검색 + 입력 + 초기투자금(전체 페이지)
        page.goto(f"{BASE}/register", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=register-zone-search]", timeout=30000)
        page.get_by_test_id("register-zone-search").click()
        page.get_by_test_id("register-zone-search").fill("상도23")
        page.wait_for_selector("[data-testid=register-zone-result]", timeout=60000)
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/redev-register-search.png")
        page.get_by_test_id("register-zone-result").first.click()
        page.get_by_test_id("register-property-type").select_option("다세대/도시형")
        page.get_by_test_id("register-unit-type").fill("404호")
        page.get_by_test_id("register-sale-price").fill("78000")
        page.get_by_test_id("register-deposit").fill("27700")
        page.get_by_test_id("register-exclusive-area").fill("29.175")
        page.get_by_test_id("register-lease-operator").check()
        page.get_by_test_id("register-note").fill(
            "임대사업자 승계 필수 물건 · 초기투자금 약 5.03억 · 2018.08 사용승인"
        )
        page.wait_for_timeout(500)
        page.screenshot(path=f"{OUT}/redev-register-live.png", full_page=True)
        ctx.close()
        browser.close()
    print("saved", [f for f in os.listdir(OUT) if f.startswith("redev-listing") or f.startswith("redev-register")])


if __name__ == "__main__":
    main()
