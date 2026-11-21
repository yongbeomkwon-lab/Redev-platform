#!/usr/bin/env python3
"""망원1구역 로컬 검증 — 검색 → 결과 선택 → 드로어 텍스트/스크린샷.

  python3 scripts/verify-mangwon1-20261121.py [BASE] [OUT]
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/projects/redev-platform/tmp/mangwon/verify.png"
SEARCH = os.environ.get("SEARCH", "망원1구역")
EXPECT = [x for x in os.environ.get("EXPECT", "망원1,정비구역지정(공람),68,878.7,1,548,103.23").split(",") if x]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
    time.sleep(5)
    try:
        page.click("button:has-text('접기')", timeout=3000)
    except Exception:
        pass

    box = page.query_selector("[data-testid=zone-search-input]")
    box.click()
    box.fill("")
    box.type(SEARCH, delay=60)
    time.sleep(1.5)
    results = page.query_selector_all("[data-testid=zone-result]")
    print("results:", len(results))
    for r in results[:5]:
        print(" -", r.inner_text()[:90].replace("\n", " | "))
    hit = None
    for r in results:
        if SEARCH.replace("구역", "")[:3] in r.inner_text():
            hit = r
            break
    if hit is None:
        print("NO RESULT for", SEARCH)
    else:
        hit.click()
        time.sleep(3.5)
    aside = page.query_selector("aside")
    text = aside.inner_text() if aside else ""
    print("---- drawer ----")
    print(text[:1600])
    print("---- checks ----")
    for key in EXPECT:
        print(f"{key}: {'OK' if key in text else 'MISSING'}")
    print("url:", page.url)
    print("errors:", errs[:5] if errs else "none")
    page.screenshot(path=OUT)
    print("saved", OUT)
    ctx.close()
    b.close()
