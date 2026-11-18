#!/usr/bin/env python3
"""지도 배지 전수 보기 + OSM 폴백 배지 확인

    MODE=prod scripts/with-dev.sh python3 scripts/shot-map-badges.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
OUT = "/workspace/downloads"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page = ctx.new_page()
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=zone-search-input]", timeout=60000)
        page.wait_for_timeout(3500)
        n = page.locator("[data-testid=zone-listing-badge]").count()
        vis = [i for i in range(n) if page.locator("[data-testid=zone-listing-badge]").nth(i).is_visible()]
        print(f"배지 {n}개 중 보임 {len(vis)}개")
        page.screenshot(path=f"{OUT}/redev-map-badges-city.png")

        # OSM 폴백 — 카카오 SDK 스크립트를 막고 배지가 뜨는지
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page2 = ctx2.new_page()
        page2.route("**/dapi.kakao.com/**", lambda route: route.abort())
        page2.route("**/*kakao*/**", lambda route: route.abort())
        page2.goto(f"{BASE}/", wait_until="domcontentloaded")
        page2.wait_for_timeout(9000)
        fallback = page2.locator(".leaflet-container").count()
        badges = page2.locator(".redev-listing-badge").count()
        print("OSM 폴백:", bool(fallback), "· 폴백 배지:", badges)
        page2.screenshot(path=f"{OUT}/redev-map-badges-osm.png")
        ctx.close()
        ctx2.close()
        browser.close()


if __name__ == "__main__":
    main()
