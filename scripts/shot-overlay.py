#!/usr/bin/env python3
"""지도 위에 임의 폴리곤(경위도)을 얹어 확인하는 캡처 도구.

  RINGS=/workspace/tmp/rings.json python3 scripts/shot-overlay.py
  rings.json: [{"name":"상도23","color":"FF0000","ring":[[lng,lat],...]}, ...]
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = os.environ.get("OUT", "/workspace/tmp/overlay.png")
RINGS_PATH = os.environ.get("RINGS", "/workspace/tmp/rings.json")
LAT = float(os.environ.get("LAT", "37.4995"))
LNG = float(os.environ.get("LNG", "126.9405"))
LEVEL = int(os.environ.get("LEVEL", "3"))
DISTRICT = os.environ.get("DISTRICT", "1") == "1"
HIDE_APP_ZONES = os.environ.get("HIDE_APP_ZONES", "1") == "1"

rings = json.load(open(RINGS_PATH))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=60000)
    time.sleep(3)
    try:
        page.click("button:has-text('접기')", timeout=3000)
    except Exception:
        pass
    if DISTRICT:
        try:
            page.click("button:has-text('지적편집도')", timeout=4000)
        except Exception as e:
            print("district skip", e)
    page.evaluate(
        """([lat, lng, level]) => { const m = window.__redevDiag.map(), k = window.kakao;
            m.setCenter(new k.maps.LatLng(lat, lng)); m.setLevel(level); }""",
        [LAT, LNG, LEVEL],
    )
    last = None
    for _ in range(15):
        time.sleep(0.7)
        cur = page.evaluate(
            "() => { const m=window.__redevDiag.map(); return [m.getLevel(), +m.getCenter().getLat().toFixed(6), +m.getCenter().getLng().toFixed(6)]; }"
        )
        if cur == last:
            break
        last = cur
    page.evaluate(
        """([rings, hideZones]) => {
          const k = window.kakao, m = window.__redevDiag.map();
          if (hideZones) for (const el of document.querySelectorAll('.kakao-zone-canvas')) el.style.display='none';
          window.__overlayPolys = [];
          for (const r of rings) {
            const path = r.ring.map(([lng, lat]) => new k.maps.LatLng(lat, lng));
            const poly = new k.maps.Polygon({
              map: m, path,
              strokeWeight: r.weight || 3, strokeColor: '#' + r.color, strokeOpacity: 1, strokeStyle: 'solid',
              fillColor: '#' + r.color, fillOpacity: r.fill === undefined ? 0.12 : r.fill,
            });
            window.__overlayPolys.push(poly);
            const c = path.reduce((a, p) => [a[0] + p.getLat(), a[1] + p.getLng()], [0, 0]);
            const ov = new k.maps.CustomOverlay({
              map: m, position: new k.maps.LatLng(c[0] / path.length, c[1] / path.length),
              content: `<div style="font:700 12px/1.2 system-ui;color:#fff;background:#${r.color};padding:3px 6px;border-radius:6px;white-space:nowrap">${r.name}</div>`,
              yAnchor: 0.5, xAnchor: 0.5, zIndex: 10,
            });
            window.__overlayPolys.push(ov);
          }
        }""",
        [rings, HIDE_APP_ZONES],
    )
    time.sleep(1.5)
    page.screenshot(path=OUT)
    print("saved", OUT)
    b.close()
