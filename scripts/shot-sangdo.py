#!/usr/bin/env python3
"""상도23·25·14·16구역 경계 대조 캡처.

  python3 scripts/shot-sangdo.py                     # 로컬 dev
  BASE=https://redev-platform-iota.vercel.app OUT=/workspace/x.png python3 scripts/shot-sangdo.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = os.environ.get("OUT", "/workspace/downloads/redev-sangdo-current.png")
LAT = float(os.environ.get("LAT", "37.4985"))
LNG = float(os.environ.get("LNG", "126.9405"))
LEVEL = int(os.environ.get("LEVEL", "3"))
W = int(os.environ.get("W", "1440"))
H = int(os.environ.get("H", "900"))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=60000)
    time.sleep(4)
    try:
        page.click("button:has-text('접기')", timeout=3000)
    except Exception as e:
        print("drawer close skip:", e)
    time.sleep(0.8)
    page.evaluate(
        """([lat, lng, level]) => {
          const d = window.__redevDiag, k = window.kakao;
          const m = d && d.map && d.map();
          if (!m) return 'no-map';
          m.setCenter(new k.maps.LatLng(lat, lng));
          m.setLevel(level);
          return 'ok';
        }""",
        [LAT, LNG, LEVEL],
    )
    last = None
    for _ in range(15):
        time.sleep(0.8)
        cur = page.evaluate(
            "() => { const m = window.__redevDiag.map(); const b = m.getBounds();"
            " return [m.getLevel(), +m.getCenter().getLat().toFixed(6), +m.getCenter().getLng().toFixed(6),"
            " +b.getSouthWest().getLat().toFixed(5), +b.getNorthEast().getLng().toFixed(5)]; }"
        )
        if cur == last:
            break
        last = cur
    print("view:", last)
    page.evaluate("() => window.__redevDiag.draw()")
    time.sleep(2)
    page.screenshot(path=OUT)
    print("saved", OUT, "errors:", errs[:5])
