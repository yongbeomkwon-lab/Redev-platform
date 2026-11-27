#!/usr/bin/env python3
"""리디브 — 자양4동B·지주택 자양동 548·자양4동A 라이브 검증 (2026-11-27)

  python3 scripts/verify-jayang4b-548-20261127.py [BASE] [OUTDIR]

  · ?zone=rest17gu-jayang4b / ?zone=jayang-548 / ?zone=11000UQ120PS202601310048
  · 드로어 문구·수치·유형 뱃지, 카카오 캔버스에 폴리곤이 실제로 그려졌는지 픽셀로 확인
  · 일반지도·지적편집도 캡처, 콘솔 error·pageerror 0건
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"

CASES = [
    {
        "zone": "rest17gu-jayang4b",
        "tag": "자양4동B",
        "expect": ["자양4동B", "신속통합기획", "자양동 858", "58,680.1", "2026-08-11"],
    },
    {
        "zone": "jayang-548",
        "tag": "지주택_자양동548",
        "expect": ["자양동 548", "지주택", "34,373.9", "553-401", "2026-1399", "지역주택조합(지주택) 절차", "지구단위계획구역 지정 열람"],
    },
    {
        "zone": "11000UQ120PS202601310048",
        "tag": "자양4동A",
        "expect": ["자양4동A", "신속통합기획"],
    },
]

CANVAS_JS = """
() => {
  const cs = [...document.querySelectorAll('canvas')];
  let best = {canvas: false};
  for (const c of cs) {
    if (!c.width || !c.height) continue;
    let g; try { g = c.getContext('2d'); } catch (e) { continue; }
    if (!g) continue;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) opaque++;
    if (opaque > 20) return {canvas: true, w: c.width, h: c.height, sampledOpaque: opaque, cls: c.className};
    best = {canvas: true, w: c.width, h: c.height, sampledOpaque: opaque, cls: c.className};
  }
  return best;
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


def main():
    ok = []
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        for case in CASES:
            print(f"\n===== {case['zone']} =====")
            page.goto(f"{BASE}/?zone={case['zone']}", wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
            time.sleep(7)
            text = drawer_text(page)
            print(text[:1200])
            print("---- checks ----")
            for key in case["expect"]:
                hit = key in text
                ok.append(hit)
                print(f"  {key}: {'OK' if hit else 'MISSING'}")
            cv = page.evaluate(CANVAS_JS)
            print("  canvas:", cv)
            ok.append(bool(cv.get("canvas")) and cv.get("sampledOpaque", 0) > 20)

            for _ in range(3):
                btn = page.query_selector("button[aria-label='확대'], button:has-text('+')")
                if btn:
                    btn.click()
                    time.sleep(0.8)
            time.sleep(3)
            normal = f"{OUTDIR}/리디브_{case['tag']}_일반지도_2026-11-27.png"
            page.screenshot(path=normal)
            print("  saved", normal)

            jip = page.query_selector("button:has-text('지적편집도')")
            if jip:
                jip.click()
                time.sleep(5)
            shot = f"{OUTDIR}/리디브_{case['tag']}_지적편집도_2026-11-27.png"
            page.screenshot(path=shot)
            print("  saved", shot)

        print("\nerrors:", errs[:8] if errs else "none")
        ok.append(len(errs) == 0)
        ctx.close()
        b.close()

    print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
