#!/usr/bin/env python3
"""방배동 467-19·(가칭)방배동 474 추진준비 2곳 검증 — ?zone= 드로어·검색·점선원.

  python3 scripts/verify-bangbae-467-474-20261121.py [BASE] [OUTDIR]
  BASE   기본 http://localhost:3100 (운영은 https://redev-platform-iota.vercel.app)
  OUTDIR 기본 /workspace/downloads
결과 PNG: 리디브_방배467-19_2026-11-21.png / 리디브_방배474_2026-11-21.png
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"

CASES = [
    {
        "zone": "seocho-bangbae-467-19",
        "out": f"{OUTDIR}/리디브_방배467-19_2026-11-21.png",
        "expect": [
            "방배동 467-19",
            "신속통합기획",
            "추진준비",
            "근사 경계 — 실제 구역계 아님(경계 미고시)",
            "반경 약 80m",
            "신탁사",
            "주민설명회",
            "방주교회",
            "20,106",
        ],
        "search": ["방배동 467-19", "방배467-19"],
        "search_expect": "방배동 467-19",
    },
    {
        "zone": "seocho-bangbae-474",
        "out": f"{OUTDIR}/리디브_방배474_2026-11-21.png",
        "expect": [
            "방배동 474",
            "도심공공주택복합",
            "추진준비",
            "근사 경계 — 실제 구역계 아님(경계 미고시)",
            "반경 약 84m",
            "22,316",
            "86.1%",
            "475-28",
        ],
        "search": ["방배동 474~980", "방배474"],
        "search_expect": "방배동 474",
    },
]

# 지도는 카카오 캔버스 오버레이(.kakao-zone-canvas)에 그린다 — 점선 여부는 DOM 으로 읽을 수 없어
# 캔버스가 있고 구역 상세가 근사원 문구를 보여 주는지로 확인하고, 점선 모양은 캡처로 눈으로 본다.
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


def run(p, base, ok_all):
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on(
        "console",
        lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None,
    )

    for i, case in enumerate(CASES):
        print(f"\n===== {case['zone']} =====")
        if i == 0:
            page.goto(base + "/?zone=" + case["zone"], wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
        else:
            page.goto(base + "/?zone=" + case["zone"], wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
        time.sleep(6)
        text = drawer_text(page)
        print(text[:1500])
        print("---- checks ----")
        for key in case["expect"]:
            hit = key in text
            ok_all.append(hit)
            print(f"{key}: {'OK' if hit else 'MISSING'}")

        canvas = page.evaluate(CANVAS_JS)
        print("zone canvas:", canvas)
        ok_all.append(canvas["canvas"] and canvas["w"] > 0)

        page.screenshot(path=case["out"])
        print("saved", case["out"])

        # 검색 — 별칭으로 찾히고, 첫 결과를 누르면 같은 구역 상세가 열린다
        for q in case["search"]:
            box = page.query_selector("[data-testid=zone-search-input]")
            box.click()
            box.fill("")
            box.type(q, delay=50)
            time.sleep(1.2)
            results = page.query_selector_all("[data-testid=zone-result]")
            names = [r.inner_text().split("\n")[0] for r in results[:4]]
            print(f"search '{q}':", len(results), names)
            hit = any(case["search_expect"] in (r.inner_text()) for r in results)
            ok_all.append(hit)
            print("  contains zone:", "OK" if hit else "MISSING")

    # 주소 → 소속 구역 판별: 방배동 475-28 은 (가칭) 방배동 474 일대 안
    page.goto(base + "/", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
    time.sleep(4)
    page.click("text=주소")
    time.sleep(0.5)
    box = page.query_selector("[data-testid=zone-search-input]")
    box.click()
    box.fill("")
    box.type("방배동 475-28", delay=50)
    time.sleep(1.5)
    cand = page.query_selector_all("[data-testid=address-candidate]")
    print("\naddress candidates:", [c.inner_text()[:60].replace("\n", " | ") for c in cand[:3]])
    if cand:
        cand[0].click()
        time.sleep(4)
        atext = page.inner_text("[data-testid=address-status]") if page.query_selector(
            "[data-testid=address-status]"
        ) else page.inner_text("body")[:2000]
        print("---- address status ----")
        print(atext[:900])
        hit = "방배동 474" in atext
        ok_all.append(hit)
        print("주소 판정 → (가칭) 방배동 474:", "OK" if hit else "MISSING")

    print("\nerrors:", errs[:6] if errs else "none")
    ctx.close()
    b.close()


ok = []
with sync_playwright() as p:
    run(p, BASE, ok)
print(f"\n=== {sum(1 for x in ok if x)}/{len(ok)} checks passed ===")
sys.exit(0 if all(ok) else 1)
