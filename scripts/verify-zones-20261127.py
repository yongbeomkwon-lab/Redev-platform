#!/usr/bin/env python3
"""리디브 — 광진·성동 6개 구역 + 금호21 유형 라이브 검증 (2026-11-27)

  python3 scripts/verify-zones-20261127.py [BASE] [OUTDIR]

  · ?zone=<id> 로 들어가 드로어 문구·유형 뱃지·면적, 카카오 캔버스에 경계가 실제로 그려졌는지 확인
  · 일반지도·지적편집도 캡처 저장, 콘솔 error·pageerror 0건
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"

CASES = [
    {"zone": "gui3-224-54", "tag": "구의3동224-54",
     "expect": ["구의3동 224-54", "모아타운", "22,240", "2026-1510"]},
    {"zone": "jayang1-655", "tag": "자양1동655",
     "expect": ["자양1동 655", "모아타운", "73,019", "2026-2452"]},
    {"zone": "sy-geumho23", "tag": "금호23",
     "expect": ["금호23", "금호동4가 1109", "30,706"]},
    {"zone": "rest17gu-jayang4b", "tag": "자양4동B",
     "expect": ["자양4동B", "자양동 858", "58,680.1", "동일로"]},
    {"zone": "rest17gu-gj-가-자양동-614", "tag": "자양동614",
     "expect": ["자양동 614", "47,317"]},
    {"zone": "gwangjin-jayang17-1", "tag": "자양동17-1",
     "expect": ["자양동 17-1", "5,132.6", "성장거점"]},
    {"zone": "11000UQ120PS202411014498", "tag": "금호21",
     "expect": ["금호21", "신통기획"]},
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
    ok, errs = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome", args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        for case in CASES:
            print(f"\n===== {case['zone']} =====", flush=True)
            page.goto(f"{BASE}/?zone={case['zone']}", wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
            time.sleep(7)
            text = drawer_text(page)
            print(text[:900])
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
