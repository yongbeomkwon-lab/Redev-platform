#!/usr/bin/env python3
"""장안동 118-16 운영/로컬 검증 — ?zone= 드로어(공고도면 경계)·별칭 검색·지도 폴리곤.

  python3 scripts/verify-jangan118-16-20261121.py [BASE] [OUT]
  BASE 기본 http://localhost:3100, OUT 기본 /workspace/downloads/리디브_장안동118-16_2026-11-21.png
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/리디브_장안동118-16_2026-11-21.png"
OUT_SEARCH = OUT.replace(".png", "_검색.png")
ZONE = "rest17gu-ddm-장안동-118-16"

EXPECT = [
    "장안동 118-16",
    "번호부여(2023-06-09)",
    "73,670",
    "7.4만㎡",
    "동대문구",
    "신속통합기획",
    "공고 도면",
    "제4호",
    "가로주택",
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
    time.sleep(7)

    text = drawer_text(page)
    print("---- drawer ----")
    print(text[:2500])
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

    # 별칭 검색 — '(가)장안동 118-16'
    box = page.query_selector("[data-testid=zone-search-input]")
    if box:
        box.click()
        box.fill("")
        box.type("(가)장안동 118-16", delay=60)
        time.sleep(1.5)
        results = page.query_selector_all("[data-testid=zone-result]")
        print("search results:", len(results))
        for r in results[:5]:
            print(" -", r.inner_text()[:90].replace("\n", " | "))
        page.screenshot(path=OUT_SEARCH)
        print("saved", OUT_SEARCH)

    print("errors:", errs[:6] if errs else "none")
    ctx.close()
    b.close()
