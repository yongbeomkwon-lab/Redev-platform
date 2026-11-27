#!/usr/bin/env python3
"""리디브 — 구로·가리봉 3곳 + 마포 4곳 라이브 검증 (2026-11-27)

  python3 scripts/verify-mapo-guro-20261127.py [BASE] [OUTDIR]

  · ?zone=<id> 로 들어가 드로어의 구역명·유형·면적·단계 문구를 확인
  · 카카오 캔버스에 경계가 그려졌는지(불투명 픽셀) 확인, 일반지도·지적편집도 캡처
  · 콘솔 error·pageerror 0건
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"

CASES = [
    {"zone": "rest17gu-gr-가리봉동-2-92", "tag": "가리봉동2-92",
     "expect": ["가리봉동 2-92", "공공재개발", "25,776"]},
    {"zone": "guro-739-7", "tag": "구로동739-7",
     "expect": ["구로동 739-7", "92,521"]},
    {"zone": "guro-792-3", "tag": "구로동792-33",
     "expect": ["구로동 792-33", "58,472", "추진위"]},
    {"zone": "mapo-yeomni-5", "tag": "염리5구역",
     "expect": ["염리5구역", "72,177", "1,617"]},
    {"zone": "mapo-yeomni-27-46", "tag": "염리동27-46",
     "expect": ["염리동 27-46", "모아타운", "12,732"]},
    {"zone": "mapo-hyeondae", "tag": "마포현대",
     "expect": ["마포현대", "21,558", "670"]},
    {"zone": "11000UQ120PS202505310816", "tag": "공덕현대",
     "expect": ["공덕현대", "관리처분", "8,259"]},
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
    if (opaque > 20) return {canvas: true, w: c.width, h: c.height, sampledOpaque: opaque};
    best = {canvas: true, w: c.width, h: c.height, sampledOpaque: opaque};
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
        b = p.chromium.launch(
            executable_path="/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome",
            args=["--no-sandbox"])
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
            normal = f"{OUTDIR}/리디브_{case['tag']}_2026-11-27.png"
            page.screenshot(path=normal)
            print("  saved", normal)

            jip = page.query_selector("button:has-text('지적편집도')")
            if jip:
                jip.click()
                time.sleep(5)
                shot = f"{OUTDIR}/리디브_{case['tag']}_지적_2026-11-27.png"
                page.screenshot(path=shot)
                print("  saved", shot)
                jip.click()
                time.sleep(2)

        print("\nerrors:", errs[:8] if errs else "none")
        ok.append(len(errs) == 0)
        ctx.close()
        b.close()

    print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
