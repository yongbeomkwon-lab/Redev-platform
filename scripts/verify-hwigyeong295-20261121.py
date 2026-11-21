#!/usr/bin/env python3
"""(가)휘경동 295 검증 — ?zone= 드로어·지도 표시·검색 별칭 (2026-11-21)

  python3 scripts/verify-hwigyeong295-20261121.py [BASE] [OUT]
  BASE  기본 운영 https://redev-platform-iota.vercel.app
  OUT   기본 /workspace/downloads/리디브_휘경동295_2026-11-21.png
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/리디브_휘경동295_2026-11-21.png"

ZONE = "rest17gu-ddm-가-휘경동-295"
EXPECT = [
    "(가)휘경동 295",
    "신속통합기획",
    "연번부여(2024-08-22)",
    "후보지 추천 제외(2025-06-30)",
    "115,122",
    "구청·서울시 공고 도면에서 옮긴 경계",
    "2025-06-30",
    "2025-07-01",
    "107,860",
    "1,268",
    "회기역",
]
SEARCH = ["휘경동 295", "휘경295", "(가)휘경동 295", "휘경동 293-86"]

CANVAS_JS = """
() => {
  const c = document.querySelector('.kakao-zone-canvas');
  return {canvas: !!c, w: c ? c.width : 0, h: c ? c.height : 0};
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
    time.sleep(7)
    text = drawer_text(page)
    print(text[:1800])
    print("---- checks ----")
    for key in EXPECT:
        hit = key in text
        ok.append(hit)
        print(f"{key}: {'OK' if hit else 'MISSING'}")

    canvas = page.evaluate(CANVAS_JS)
    print("zone canvas:", canvas)
    ok.append(bool(canvas["canvas"] and canvas["w"] > 0))

    page.screenshot(path=OUT)
    print("saved", OUT)

    # 검색 — 별칭으로 찾히고 첫 결과가 같은 구역이어야 한다
    for q in SEARCH:
        box = page.query_selector("[data-testid=zone-search-input]")
        box.click()
        box.fill("")
        box.type(q, delay=45)
        time.sleep(1.3)
        results = page.query_selector_all("[data-testid=zone-result]")
        names = [r.inner_text().split("\n")[0] for r in results[:4]]
        print(f"search '{q}':", len(results), names)
        hit = any("휘경동 295" in r.inner_text() for r in results)
        ok.append(hit)
        print("  contains zone:", "OK" if hit else "MISSING")

    print("\nerrors:", errs[:6] if errs else "none")
    ctx.close()
    b.close()

print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
sys.exit(0 if all(ok) else 1)
