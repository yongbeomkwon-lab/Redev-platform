#!/usr/bin/env python3
"""장위11(돌곶이·상월곡역세권) 운영/로컬 검증 — ?zone= 드로어 + 안쪽 가로주택 검색.

  python3 scripts/verify-jangwi11-20261121.py [BASE] [OUT]
  BASE 기본 http://localhost:3100, OUT 기본 /workspace/downloads/리디브_장위11_정리_2026-11-21.png
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/리디브_장위11_정리_2026-11-21.png"
OUT2 = OUT.replace(".png", "_가로주택검색.png")

EXPECT = [
    "돌곶이·상월곡역세권",
    "사업시행자지정",
    "2,617",
    "대신자산신탁",
    "94,411.1",
    "제2026-160호",
]


def drawer_text(page):
    for sel in ("aside", "[data-testid=zone-panel]", "section"):
        el = page.query_selector(sel)
        if el:
            t = el.inner_text()
            if len(t) > 40:
                return t
    return ""


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(BASE + "/?zone=jangwi-11-yeoksegwon", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
    time.sleep(6)
    try:
        page.wait_for_selector("text=사업시행자지정", timeout=15000)
    except Exception:
        print("WARN: 사업시행자지정 not shown yet")

    text = drawer_text(page)
    print("---- drawer ----")
    print(text[:1800])
    print("---- checks ----")
    for key in EXPECT:
        print(f"{key}: {'OK' if key in text else 'MISSING'}")
    print("url:", page.url)
    page.screenshot(path=OUT)
    print("saved", OUT)

    # 안쪽 가로주택 — 검색되면 상세가 열리고, 기본 지도에서는 숨김이라는 설명이 보여야 한다
    box = page.query_selector("[data-testid=zone-search-input]")
    box.click()
    box.fill("")
    box.type("상월곡1구역", delay=60)
    time.sleep(1.5)
    results = page.query_selector_all("[data-testid=zone-result]")
    print("search results:", len(results))
    for r in results[:5]:
        print(" -", r.inner_text()[:80].replace("\n", " | "))
    if results:
        results[0].click()
        time.sleep(2.5)
        t2 = drawer_text(page)
        print("---- 상월곡1구역 ----")
        print(t2[:900])
        print("hidden-note:", "OK" if "정비구역 안에 들어갑니다" in t2 else "MISSING")
        page.screenshot(path=OUT2)
        print("saved", OUT2)

    print("errors:", errs[:6] if errs else "none")
    ctx.close()
    b.close()
