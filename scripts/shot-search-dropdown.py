#!/usr/bin/env python3
"""검색 드롭다운(줄바꿈·역 검색) 로컬 확인용 캡처 — 개발 서버(3100) 기준.

  python3 scripts/shot-search-dropdown.py            # 로컬
  BASE=https://redev-platform-iota.vercel.app python3 scripts/shot-search-dropdown.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = os.environ.get("OUT", "/workspace/downloads/")


def shot(page, name, clip=None):
    page.screenshot(path=OUT + name, clip=clip)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    # ── 데스크톱 ────────────────────────────────────────────────────────────
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('input[placeholder^="구역명"]', timeout=45000)
    time.sleep(3.0)

    box = page.query_selector("div.pointer-events-none.absolute.left-2.top-2").bounding_box()
    panel = {"x": box["x"], "y": box["y"], "width": 400, "height": 520}

    page.fill('input[placeholder^="구역명"]', "여의대방2역세권")
    time.sleep(1.0)
    shot(page, "shot-dropdown-zone-desktop.png", clip=panel)

    page.fill('input[placeholder^="구역명"]', "건대입구")
    time.sleep(1.0)
    shot(page, "shot-dropdown-station-desktop.png", clip=panel)

    # 역 선택 → 지도 확대 + 역 카드
    page.click('[data-testid="station-result"]')
    time.sleep(3.2)
    shot(page, "shot-station-picked-desktop.png")

    # 자양동 10번지 일원
    page.fill('input[placeholder^="구역명"]', "자양동 10")
    time.sleep(1.0)
    shot(page, "shot-dropdown-jayang-desktop.png", clip=panel)
    page.click('[data-testid="zone-result"]')
    time.sleep(3.5)
    shot(page, "shot-jayang-desktop.png")

    # 지적편집도 켜기
    try:
        page.click('button[title^="지적편집도"]', timeout=5000)
        time.sleep(2.5)
        shot(page, "shot-jayang-jijeok-desktop.png")
    except Exception as e:  # pragma: no cover
        print("지적편집도 토글 실패:", e)
    ctx.close()

    # ── 모바일 390 / 360 ───────────────────────────────────────────────────
    for w in (390, 360):
        ctx = b.new_context(viewport={"width": w, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector('input[placeholder^="구역명"]', timeout=45000)
        time.sleep(3.0)
        page.fill('input[placeholder^="구역명"]', "여의대방2역세권")
        time.sleep(1.0)
        shot(page, f"shot-dropdown-zone-mobile{w}.png")
        page.fill('input[placeholder^="구역명"]', "사당역")
        time.sleep(1.0)
        shot(page, f"shot-dropdown-station-mobile{w}.png")
        ctx.close()

    b.close()
print("done")
