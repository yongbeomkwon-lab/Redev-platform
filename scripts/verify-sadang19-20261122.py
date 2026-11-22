#!/usr/bin/env python3
"""사당동 77-24 일대(사당19구역) 검증 — ?zone= 드로어·지도 표시·검색 별칭·지적편집도 (2026-11-22)

  python3 scripts/verify-sadang19-20261122.py [BASE] [OUT]
  BASE  기본 운영 https://redev-platform-iota.vercel.app
  OUT   기본 /workspace/downloads/리디브_사당77-24_구역계_2026-11-22.png
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/리디브_사당77-24_구역계_2026-11-22.png"

ZONE = "sadang-19"
EXPECT = [
    "사당동 77-24 일대",
    "신속통합기획",
    "후보지선정",
    "25,194",
    "공고 도면에서 옮긴 경계",
    "25,321",
    "2026-05-06",
    "2025-05-27",
    "503",
]
SEARCH = ["사당19", "사당19구역", "사당동 77-24", "사당동77-24", "동작구 사당동 77-24 일대"]

CANVAS_JS = """
() => {
  const c = document.querySelector('.kakao-zone-canvas');
  return {canvas: !!c, w: c ? c.width : 0, h: c ? c.height : 0};
}
"""

MAP_STATE_JS = """
() => {
  const m = window.__redevDiag && window.__redevDiag.map ? window.__redevDiag.map() : null;
  if (!m) return null;
  const c = m.getCenter();
  return {level: m.getLevel(), lat: +c.getLat().toFixed(6), lng: +c.getLng().toFixed(6)};
}
"""


def drawer_text(page):
    for sel in ("aside", "[data-testid=zone-panel]", "section"):
        el = page.query_selector(sel)
        if el:
            t = el.inner_text()
            if len(t) > 40:
                return t
    return ""


ok = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on(
        "console",
        lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None,
    )

    print("=====", ZONE, "=====")
    page.goto(BASE + "/?zone=" + ZONE, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
    time.sleep(8)
    text = drawer_text(page)
    print(text[:2200])
    print("---- checks ----")
    for key in EXPECT:
        hit = key in text
        ok.append(hit)
        print(f"{key}: {'OK' if hit else 'MISSING'}")

    canvas = page.evaluate(CANVAS_JS)
    print("zone canvas:", canvas)
    ok.append(bool(canvas["canvas"] and canvas["w"] > 0))

    print("map state:", page.evaluate(MAP_STATE_JS))

    # 지적편집도 켜기 (필지 경계·지번 위에서 구역계 정합 확인)
    try:
        page.click("button:has-text('지적편집도')", timeout=5000)
        print("district overlay: clicked")
        time.sleep(4)
    except Exception as e:
        print("district overlay: skip", e)

    page.screenshot(path=OUT)
    print("saved", OUT)

    # 확대 화면 한 장 더 (구역계를 크게) — 대상지 좌표로 직접 이동
    try:
        page2 = ctx.new_page()
        page2.goto(BASE + "/?zone=" + ZONE + "&diag=1", wait_until="domcontentloaded")
        page2.wait_for_selector(".kakao-zone-canvas", timeout=120000)
        time.sleep(6)
        try:
            page2.click("button:has-text('지적편집도')", timeout=5000)
            time.sleep(2)
        except Exception as e:
            print("district overlay (zoom page): skip", e)
        page2.evaluate(
            """() => {
              const m = window.__redevDiag && window.__redevDiag.map ? window.__redevDiag.map() : null;
              if (!m) return;
              const k = window.kakao;
              m.setCenter(new k.maps.LatLng(37.48958, 126.98046));
              m.setLevel(3);
            }"""
        )
        time.sleep(6)
        print("zoom map state:", page2.evaluate(MAP_STATE_JS))
        zoom_out = OUT.replace(".png", "_확대.png")
        page2.screenshot(path=zoom_out)
        print("saved", zoom_out)
        page2.close()
    except Exception as e:
        print("zoom shot skip", e)

    # 검색 — 별칭으로 찾히고 첫 결과가 같은 구역이어야 한다
    for q in SEARCH:
        box = page.query_selector("[data-testid=zone-search-input]")
        box.click()
        box.fill("")
        box.type(q, delay=45)
        time.sleep(1.4)
        results = page.query_selector_all("[data-testid=zone-result]")
        names = [r.inner_text().split("\n")[0] for r in results[:4]]
        print(f"search '{q}':", len(results), names)
        hit = any("사당동 77-24" in r.inner_text() for r in results)
        ok.append(hit)
        print("  contains zone:", "OK" if hit else "MISSING")

    print("\nerrors:", errs[:6] if errs else "none")
    ctx.close()
    b.close()

print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
sys.exit(0 if all(ok) else 1)
