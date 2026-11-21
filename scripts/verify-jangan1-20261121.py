#!/usr/bin/env python3
"""장안1구역 운영/로컬 검증 — ?zone= 드로어 + 안쪽 가로주택 검색·숨김 사유.

  python3 scripts/verify-jangan1-20261121.py [BASE] [OUT]
  BASE 기본 http://localhost:3100, OUT 기본 /workspace/downloads/리디브_장안1구역_2026-11-21.png
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/리디브_장안1구역_2026-11-21.png"
OUT2 = OUT.replace(".png", "_가로주택검색.png")
ZONE = "11000UQ120PS202411014521"

EXPECT = [
    "장안1구역",
    "추진위구성",
    "67,951.8",
    "1,754",
    "108.66",
    "553",
    "제2026-334호",
    "장안동 134-15",
    "36층",
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
    page.goto(BASE + f"/?zone={ZONE}", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
    time.sleep(6)

    text = drawer_text(page)
    print("---- drawer ----")
    print(text[:2000])
    print("---- checks ----")
    ok = 0
    for key in EXPECT:
        hit = key in text
        ok += hit
        print(f"{key}: {'OK' if hit else 'MISSING'}")
    print(f"drawer {ok}/{len(EXPECT)}")
    print("url:", page.url)
    page.screenshot(path=OUT)
    print("saved", OUT)

    # 안쪽 가로주택 — 검색되면 상세가 열리고, 기본 지도에서 숨긴 사유가 보여야 한다
    box = page.query_selector("[data-testid=zone-search-input]")
    box.click()
    box.fill("")
    box.type("장안동 126-1", delay=60)
    time.sleep(1.5)
    results = page.query_selector_all("[data-testid=zone-result]")
    print("search results:", len(results))
    for r in results[:5]:
        print(" -", r.inner_text()[:90].replace("\n", " | "))
    if results:
        results[0].click()
        time.sleep(2.5)
        t2 = drawer_text(page)
        print("---- 장안동 126-1 ----")
        print(t2[:900])
        print("hidden-note:", "OK" if "정비구역 안에 들어갑니다" in t2 else "MISSING")
        page.screenshot(path=OUT2)
        print("saved", OUT2)

    print("errors:", errs[:6] if errs else "none")
    ctx.close()
    b.close()
