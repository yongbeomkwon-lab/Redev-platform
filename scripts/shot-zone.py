#!/usr/bin/env python3
"""배포본 캡처 — 상도25 / 자양동 10 (지적편집도 켠 화면 + 일반 화면).

  BASE=https://... LAT=.. LNG=.. LEVEL=.. OUT=/workspace/downloads/x.png JIJEOK=1 python3 scripts/shot-zone.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://redev-platform-iota.vercel.app")
OUT = os.environ.get("OUT", "/workspace/downloads/redev-zone.png")
LAT = float(os.environ.get("LAT", "37.4983"))
LNG = float(os.environ.get("LNG", "126.9419"))
LEVEL = int(os.environ.get("LEVEL", "4"))
W = int(os.environ.get("W", "1440"))
H = int(os.environ.get("H", "1000"))
JIJEOK = os.environ.get("JIJEOK", "0") == "1"
SEARCH = os.environ.get("SEARCH", "")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
    time.sleep(5)
    try:
        page.click("button:has-text('접기')", timeout=3000)
    except Exception:
        pass
    if JIJEOK:
        try:
            page.click("button:has-text('지적편집도')", timeout=4000)
            time.sleep(2.5)
            print("지적편집도 on")
        except Exception as e:
            print("지적편집도 실패:", e)
    page.evaluate(
        """([lat, lng, level]) => {
          const d = window.__redevDiag, k = window.kakao;
          const m = d.map();
          m.setCenter(new k.maps.LatLng(lat, lng));
          m.setLevel(level);
        }""",
        [LAT, LNG, LEVEL],
    )
    last = None
    for _ in range(20):
        time.sleep(0.8)
        cur = page.evaluate("() => window.__redevDiag.map().getLevel()")
        if cur == last:
            break
        last = cur
    time.sleep(2.5)
    page.evaluate("() => window.__redevDiag.draw && window.__redevDiag.draw()")
    time.sleep(2)
    page.screenshot(path=OUT)
    print("saved", OUT, "view", page.evaluate(
        "() => {const m=window.__redevDiag.map();const b=m.getBounds();"
        "return [m.getLevel(), b.getSouthWest().getLat().toFixed(5), b.getNorthEast().getLat().toFixed(5)];}"), "errors:", errs[:4])
