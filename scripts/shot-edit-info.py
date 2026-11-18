#!/usr/bin/env python3
"""‘경계·정보 수정’ 직후 화면 — 정보 입력 폼이 바로 열린 모습(스크린샷용).

    scripts/with-dev.sh python3 scripts/shot-edit-info.py
"""
import os
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?admin=1")
OUT = os.environ.get("SHOT_PATH", "/workspace/downloads/redev-edit-info-open.png")
OUT_PANEL = os.environ.get("SHOT_PANEL_PATH", "/workspace/downloads/redev-edit-info-panel.png")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1500, "height": 1000})
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(2)
        page.evaluate("() => localStorage.removeItem('redev.customZones.v1')")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(3)

        page.fill('[data-testid="zone-search-input"]', "자양동 10")
        page.wait_for_selector('[data-testid="zone-result"]', timeout=15000)
        page.click('[data-testid="zone-result"]')
        page.wait_for_timeout(2500)
        page.click('[data-testid="admin-edit-selected"]')
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=5000)
        page.wait_for_timeout(900)
        page.screenshot(path=OUT)
        page.locator("[data-testid=admin-panel]").screenshot(path=OUT_PANEL)
        print("screenshot:", OUT)
        print("panel:", OUT_PANEL)
        ctx.close()
        b.close()


if __name__ == "__main__":
    main()
