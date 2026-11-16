#!/usr/bin/env python3
"""배포본 최종 점검 — 콘솔 오류·경계 동기화 스팟체크·드로어 표시."""
import time

from playwright.sync_api import sync_playwright

URL = "https://redev-platform-iota.vercel.app/?diag=1"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
    time.sleep(4)
    print("engine:", page.evaluate("() => (document.querySelector('.kakao-zone-canvas') ? 'kakao' : 'leaflet')"))
    print("diag:", page.evaluate("() => window.__redevDiag ? window.__redevDiag.anchor() : null"))
    print("draws:", page.evaluate("() => window.__redevDiag.draws()"))
    # 구역 클릭 → 드로어 확인
    box = page.query_selector(".kakao-map-wrap > div").bounding_box()
    page.mouse.click(box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.5)
    time.sleep(1.5)
    aside = page.query_selector("aside")
    print("drawer text head:", (aside.inner_text()[:80].replace("\n", " | ") if aside else "none"))
    print("errors:", errs[:5] if errs else "none")
    ctx.close()
    b.close()
