#!/usr/bin/env python3
"""2026-11-22 모니터링 3건(신길동 3922·삼선3마을·대림역세권) 운영 사이트 검증.

  python3 scripts/verify-news-20261122.py [BASE] [OUT_PREFIX]
  BASE 기본 https://redev-platform-iota.vercel.app
  OUT_PREFIX 기본 /workspace/downloads/리디브_1122_3곳_반영_2026-11-22

각 구역의 ?zone= 드로어 텍스트에서 단계·면적·별칭이 실제로 보이는지 확인하고,
지도까지 그려진 화면을 OUT_PREFIX_<구역>.png 로, 세 장을 합친 대표 이미지를 OUT_PREFIX.png 로 저장한다.
"""
import sys
import time
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
PREFIX = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads/리디브_1122_3곳_반영_2026-11-22"

CASES = [
    (
        "신길동3922",
        "11560UQ120PS202604280001",
        ["신길동 3922", "추진위구성", "34,850", "3.5만㎡", "990세대", "제2026-193호", "영등포구"],
    ),
    (
        "삼선3마을",
        "11000UQ120PS202505310098",
        ["삼선3마을", "기획완료", "신속통합기획", "56,377", "5.6만㎡", "870세대", "삼선동1가 277"],
    ),
    (
        "대림역세권",
        "gangnam4gu-daerim-yeoksegwon",
        ["대림역세권", "구역지정", "18,340", "1.8만㎡", "628세대", "96.82", "제2026-648호"],
    ),
]


def drawer_text(page):
    for sel in ("aside", "[data-testid=zone-panel]", "section"):
        el = page.query_selector(sel)
        if el:
            t = el.inner_text()
            if len(t) > 40:
                return t
    return ""


def main():
    shots = []
    total_bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5)
        for name, zone, expect in CASES:
            page = ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))
            page.goto(f"{BASE}/?zone={zone}", wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
            time.sleep(9)
            text = drawer_text(page)
            print(f"==== {name} ({zone}) ====")
            bad = 0
            for key in expect:
                hit = key in text
                bad += 0 if hit else 1
                print(f"  {key}: {'OK' if hit else 'MISSING'}")
            if errs:
                print("  page errors:", errs[:3])
            out = f"{PREFIX}_{name}.png"
            page.screenshot(path=out)
            shots.append(out)
            print(f"  → {out}")
            total_bad += bad
            page.close()
        b.close()

    # 세 장을 세로로 붙여 대표 이미지
    ims = [Image.open(s) for s in shots]
    w = max(i.width for i in ims)
    h = sum(i.height for i in ims) + 12 * (len(ims) - 1)
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    y = 0
    for i in ims:
        canvas.paste(i, (0, y))
        y += i.height + 12
    canvas.save(PREFIX + ".png")
    print(f"==== composite → {PREFIX}.png")
    print(f"==== missing total: {total_bad}")
    return 1 if total_bad else 0


if __name__ == "__main__":
    sys.exit(main())
