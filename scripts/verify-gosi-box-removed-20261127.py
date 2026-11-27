#!/usr/bin/env python3
"""리디브 — 모든 구역 상세의 '서울시 고시 데이터' 박스 삭제 라이브 검증 (2026-11-27)

  python3 scripts/verify-gosi-box-removed-20261127.py [BASE] [OUTDIR]
  BASE   기본 https://redev-platform-iota.vercel.app
  OUTDIR 기본 /workspace/downloads

  · 신림5구역(?zone=11620UQ120PS202605200001, ZoneOfficialPanel 경로)과
    자양동 10번지(?zone=gwangjin-jayang10, ZoneExplorer 대표 구역 경로)를 데스크톱·모바일로 연다.
  · '서울시 고시 데이터' 박스가 완전히 사라졌는지, 사업 진행단계·구역현황(추정)·국토부 실거래가가
    그대로인지 본다.
  · 콘솔 error·pageerror 를 모아 0건인지 확인하고 스크린샷을 남긴다.
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"

GONE = ["서울시 고시 데이터", "고시 레코드", "경계 도형", "서울시 위치도 보기", "면적 기준:"]
KEEP_PANEL = ["사업 진행단계", "구역현황", "국토부 실거래", "이 구역 이야기"]
KEEP_ZONE = ["사업 진행단계", "구역현황", "국토부 실거래"]

CASES = [
    ("신림5구역", "11620UQ120PS202605200001", ["신림5구역"] + KEEP_PANEL, "리디브_고시박스삭제_신림5구역"),
    ("자양동10", "gwangjin-jayang10", ["자양"] + KEEP_ZONE, "리디브_고시박스삭제_자양동10"),
]


def aside_text(page):
    el = page.query_selector("aside")
    return el.inner_text() if el else ""


def run(p, label, zone, keeps, shot, viewport, mobile):
    ok, errs = [], []
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport=viewport, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
    page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

    page.goto(f"{BASE}/?zone={zone}", wait_until="domcontentloaded")
    for sel in ("aside", ".kakao-zone-canvas"):
        try:
            page.wait_for_selector(sel, timeout=120000)
        except Exception:
            pass
    time.sleep(7)

    body = page.inner_text("body")
    text = aside_text(page) or body
    print(f"[{label}] aside chars={len(text)}")
    for key in GONE:
        hit = key in body
        ok.append(not hit)
        print(f"   gone? {key}: {'STILL PRESENT' if hit else 'OK'}")
    for key in keeps:
        hit = key in text or key in body
        ok.append(hit)
        print(f"   keep? {key}: {'OK' if hit else 'MISSING'}")

    # 패널이 실제로 화면 안에 그려졌는지(레이아웃 깨짐 없이) — 가로 스크롤 유발 여부도 본다
    metrics = page.evaluate(
        """() => ({
            docW: document.documentElement.scrollWidth,
            winW: window.innerWidth,
            asideH: (document.querySelector('aside')||{}).clientHeight || 0,
        })"""
    )
    print("   layout:", metrics)
    ok.append(metrics["docW"] <= metrics["winW"] + 2)
    ok.append(metrics["asideH"] > 200)

    if "신림5구역" in label:
        a = page.query_selector("aside")
        if a:
            a.screenshot(path=f"{OUTDIR}/{shot}_패널.png")
            print("   saved", f"{OUTDIR}/{shot}_패널.png")
    page.screenshot(path=f"{OUTDIR}/{shot}_전체.png")
    print("   saved", f"{OUTDIR}/{shot}_전체.png")

    print("   errors:", errs[:5] if errs else "none")
    ok.append(len(errs) == 0)
    ctx.close()
    b.close()
    return ok


def main():
    results = []
    with sync_playwright() as p:
        for label, zone, keeps, shot in CASES:
            print(f"\n===== 데스크톱 · {label} =====")
            results += run(p, "desktop " + label, zone, keeps, shot + "_데스크톱",
                           {"width": 1440, "height": 900}, False)
        for label, zone, keeps, shot in CASES:
            print(f"\n===== 모바일 · {label} =====")
            results += run(p, "mobile " + label, zone, keeps, shot + "_모바일",
                           {"width": 390, "height": 844}, True)
    print(f"\n=== {sum(1 for x in results if x)}/{len(results)} checks passed ===")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
