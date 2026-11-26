#!/usr/bin/env python3
"""리디브 — 2026-11-25~26 고시 4개 구역 라이브 검증 (2026-11-27)

  python3 scripts/verify-gosi-4zones-20261127.py [BASE] [OUTDIR]
  BASE   기본 https://redev-platform-iota.vercel.app
  OUTDIR 기본 /workspace/downloads

  · ?zone=<id> 로 상세 드로어를 열고, 문구·수치를 확인한 뒤 지도 화면을 캡처한다.
  · 구역 경계가 실제로 그려졌는지(.kakao-zone-canvas 픽셀)와 근사경계 여부도 함께 본다.
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"

CASES = [
    {
        "zone": "11000UQ120PS202505310014",
        "label": "구로주공",
        "out": f"{OUTDIR}/리디브_구로주공_고시반영_2026-11-27.png",
        "expect": ["구로주공", "재건축", "정비구역 지정·고시", "2026-11-26", "3,289", "119,243"],
    },
    {
        "zone": "11000UQ120PS202505310011",
        "label": "중곡1동 A",
        "out": f"{OUTDIR}/리디브_중곡1동A_고시반영_2026-11-27.png",
        "expect": ["중곡1동 A구역", "정비구역 지정·고시", "2,200", "81,100"],
    },
    {
        "zone": "rest17gu-ep-녹번동-125-1-불광역세권-장기전세",
        "label": "불광역세권",
        "out": f"{OUTDIR}/리디브_불광역세권_경계_2026-11-27.png",
        "expect": ["녹번동 125-1", "129,600.8", "4,092", "정비구역 지정·고시"],
    },
    {
        "zone": "11320UQ120PS202608040001",
        "label": "방학1구역",
        "out": f"{OUTDIR}/리디브_방학1구역_공람_2026-11-27.png",
        "expect": ["방학1구역", "공람", "2,093", "2026-12-28"],
    },
]

CANVAS_JS = """
() => {
  const c = document.querySelector('.kakao-zone-canvas');
  if (!c) return {canvas: false};
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let nonzero = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) nonzero++;
  return {canvas: true, w: c.width, h: c.height, sampledOpaque: nonzero};
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
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)

        for case in CASES:
            print(f"\n===== {case['label']} ({case['zone']}) =====")
            page.goto(f"{BASE}/?zone={case['zone']}", wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
            time.sleep(6)
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
            page.screenshot(path=case["out"])
            print("  saved", case["out"])

        print("\nerrors:", errs[:6] if errs else "none")
        ctx.close()
        b.close()
    print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
