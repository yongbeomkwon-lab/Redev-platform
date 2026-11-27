#!/usr/bin/env python3
"""리디브 — 사당17구역(동작구 사당동 63-1) 라이브 검증 (2026-11-27)

  python3 scripts/verify-sadang17-20261127.py [BASE] [OUTDIR]
  BASE   기본 https://redev-platform-iota.vercel.app
  OUTDIR 기본 /workspace/downloads

  · ?zone=11590UQ120PS202605210002 로 상세 드로어를 열고
    사업유형 '신통기획', 진행단계 '조합설립인가(2026-08-21)' 표시를 확인한다.
  · 단계 사다리에 후보지 선정(2024.10.21)·정비구역 지정 고시(2026.01.22)·조합설립인가(2026.08.21)가
    날짜와 함께 서는지, 동의율·사업 개요 수치가 맞는지 본다.
  · 카카오 구역 캔버스에 실제로 폴리곤이 그려졌는지 픽셀로 보고 두 화면을 캡처한다.
  · 콘솔 error·pageerror 를 모아 0건인지 확인한다.
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"
ZONE = "11590UQ120PS202605210002"

EXPECT = [
    "사당17구역",
    "신통기획",
    "조합설립인가",
    "2026-08-21",     # 드로어 배지·추진단계 표기
    "2026.08.21",     # 사다리 칸 날짜
    "2026-01-22",
    "2026.01.22",
    "2024.10.21",     # 후보지 선정
    "80.8",           # 동의율
    "402",            # 토지등소유자
    "856",            # 계획 세대수
    "394",            # 기존 세대수
    "44,072.7",       # 정비구역 면적
    "2034",           # 준공 목표
]

CANVAS_JS = """
() => {
  const cs = [...document.querySelectorAll('canvas')];
  let best = {canvas: false};
  for (const c of cs) {
    if (!c.width || !c.height) continue;
    let g;
    try { g = c.getContext('2d'); } catch (e) { continue; }
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
        page.on(
            "console",
            lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None,
        )

        print(f"===== 사당17구역 ({ZONE}) =====")
        page.goto(f"{BASE}/?zone={ZONE}", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
        time.sleep(6)
        text = drawer_text(page)
        print(text[:2000])
        print("---- checks ----")
        for key in EXPECT:
            hit = key in text
            ok.append(hit)
            print(f"  {key}: {'OK' if hit else 'MISSING'}")
        cv = page.evaluate(CANVAS_JS)
        print("  canvas:", cv)
        ok.append(bool(cv.get("canvas")) and cv.get("sampledOpaque", 0) > 20)

        # 드로어 상단(유형·단계 배지 + 동의율 + 사다리)만 잘라서 한 장 더
        aside = page.query_selector("aside")
        if aside:
            aside.screenshot(path=f"{OUTDIR}/리디브_사당17구역_드로어_2026-11-27.png")
            print("  saved", f"{OUTDIR}/리디브_사당17구역_드로어_2026-11-27.png")

        # 구역으로 줌인해 경계를 화면에 크게 띄운다
        for _ in range(4):
            btn = page.query_selector("button[aria-label='확대'], button:has-text('+')")
            if btn:
                btn.click()
                time.sleep(0.8)
        time.sleep(3)
        page.screenshot(path=f"{OUTDIR}/리디브_사당17구역_일반지도_2026-11-27.png")
        print("  saved", f"{OUTDIR}/리디브_사당17구역_일반지도_2026-11-27.png")

        jip = page.query_selector("button:has-text('지적편집도')")
        if jip:
            jip.click()
            time.sleep(4)
        page.screenshot(path=f"{OUTDIR}/리디브_사당17구역_지적편집도_2026-11-27.png")
        print("  saved", f"{OUTDIR}/리디브_사당17구역_지적편집도_2026-11-27.png")

        print("\nerrors:", errs[:8] if errs else "none")
        ok.append(len(errs) == 0)
        ctx.close()
        b.close()

    print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
