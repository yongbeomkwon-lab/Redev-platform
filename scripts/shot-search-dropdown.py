#!/usr/bin/env python3
"""검색 드롭다운(줄바꿈·역 검색) + 자양동 10번지 경계 캡처.

  python3 scripts/shot-search-dropdown.py                       # 로컬(3100)
  BASE=https://redev-platform-iota.vercel.app/ python3 scripts/shot-search-dropdown.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = os.environ.get("OUT", "/workspace/downloads/")
TAG = os.environ.get("TAG", "local")


def shot(page, name, clip=None):
    page.screenshot(path=OUT + name, clip=clip)


def wait_ready(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('input[placeholder^="구역명"]', timeout=60000)
    time.sleep(4.0)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    # ── 데스크톱: 드롭다운 3종 ───────────────────────────────────────────────
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    wait_ready(page)

    box = page.query_selector("div.pointer-events-none.absolute.left-2.top-2").bounding_box()
    panel = {"x": box["x"], "y": box["y"], "width": 400, "height": 560}

    page.fill('input[placeholder^="구역명"]', "신길동 4-33")
    time.sleep(1.2)
    shot(page, f"redev-search-dropdown-{TAG}.png", clip=panel)

    page.fill('input[placeholder^="구역명"]', "건대입구")
    time.sleep(1.2)
    shot(page, f"redev-search-station-{TAG}.png", clip=panel)

    page.click('[data-testid="station-result"]')
    time.sleep(3.5)
    shot(page, f"redev-station-picked-{TAG}.png")

    # ── 자양동 10번지 일원 ─────────────────────────────────────────────────
    page.fill('input[placeholder^="구역명"]', "자양동 10")
    time.sleep(1.2)
    page.click('[data-testid="zone-result"]')
    time.sleep(3.5)
    shot(page, f"redev-jayang10-{TAG}.png")

    if page.query_selector('button[title^="지적편집도"]'):
        page.click('button[title^="지적편집도"]')
        time.sleep(2.5)
        shot(page, f"redev-jayang10-jijeok-{TAG}.png")

    # 확대해서 경계와 필지선을 함께 본다 (지도 위 확대 버튼 2번)
    for _ in range(2):
        page.click('button[title="확대"]')
        time.sleep(1.6)
    time.sleep(1.5)
    mbox = page.query_selector(".kakao-map-wrap").bounding_box()
    shot(page, f"redev-jayang10-zoom-{TAG}.png", clip=mbox)
    print("engine:", page.evaluate("() => (document.querySelector('.kakao-zone-canvas') ? 'kakao' : 'leaflet')"))
    print("errors:", errs[:3] if errs else "none")
    ctx.close()

    # ── 모바일 390 ─────────────────────────────────────────────────────────
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    wait_ready(page)
    page.fill('input[placeholder^="구역명"]', "여의대방2역세권")
    time.sleep(1.2)
    shot(page, f"redev-search-mobile-{TAG}.png", clip={"x": 0, "y": 55, "width": 390, "height": 300})
    page.fill('input[placeholder^="구역명"]', "사당역")
    time.sleep(1.2)
    shot(page, f"redev-search-station-mobile-{TAG}.png", clip={"x": 0, "y": 55, "width": 390, "height": 300})
    ctx.close()
    b.close()
print("done")
