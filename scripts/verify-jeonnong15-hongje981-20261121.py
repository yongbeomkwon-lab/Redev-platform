#!/usr/bin/env python3
"""전농15구역·홍제동 9-81 일대 — `?zone=<id>` 딥링크로 지도 라벨·드로어 확인 + 스크린샷 (2026-11-21)

  python3 scripts/verify-jeonnong15-hongje981-20261121.py [BASE] [OUTDIR]

BASE 기본값 http://localhost:3100, OUTDIR 기본값 tmp/jeonnong-hongje.
운영 확인: BASE=https://redev-platform-iota.vercel.app OUTDIR=/workspace/downloads
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BASE", "http://localhost:3100")).rstrip("/")
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("OUTDIR", "tmp/jeonnong-hongje")
os.makedirs(OUTDIR, exist_ok=True)

CASES = [
    {
        "id": "11000UQ120PS202407010950",
        "name": "전농15구역",
        "file": "리디브_전농15구역_2026-11-21.png",
        "expect": ["전농동 152-65", "정비구역지정(공람)", "72,594.2", "1,804", "299.90", "공람 2026-11-12~12-14"],
    },
    {
        "id": "11000UQ120PS202502050006",
        "name": "홍제동 9-81 일대",
        "file": "리디브_홍제9-81_2026-11-21.png",
        "expect": ["홍제동 9-81", "정비구역지정(공람)", "134,565.1", "2,521", "275.6", "공람 2026-10-14~11-13"],
    },
]

fails = 0
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    for case in CASES:
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.on("console", lambda m: errs.append("console:" + m.text[:150]) if m.type == "error" else None)
        url = f"{BASE}/?zone={case['id']}"
        print(f"\n==== {case['name']} — {url}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas, .leaflet-container", timeout=60000)
        time.sleep(7)
        # 드로어(우측 상세 패널)가 접혀 있으면 '구역 정보 ▲'로 다시 연다
        if page.query_selector("aside") is None:
            try:
                page.click("button:has-text('구역 정보')", timeout=2500)
                time.sleep(2)
            except Exception:
                pass

        aside = page.query_selector("aside")
        text = aside.inner_text() if aside else ""
        print("drawer head:", text[:110].replace("\n", " | ") if text else "none")
        for key in case["expect"]:
            ok = key in text
            print(f"  {'OK  ' if ok else 'MISS'} {key}")
            if not ok:
                fails += 1

        # 지도 위 이름표(라벨) 문구
        label = page.evaluate(
            """() => {
              const el = document.querySelector('.zone-label, .zone-name, [class*=zone-label]');
              return el ? el.innerText : (document.body.innerText.includes('구역지정') ? 'badge:구역지정' : null);
            }"""
        )
        print("map label:", (label or "").replace("\n", " ")[:140] or "none")

        out = os.path.join(OUTDIR, case["file"])
        page.screenshot(path=out)
        print("saved", out, "| errors:", errs[:3] if errs else "none")
        page.close()
    ctx.close()
    b.close()

print("\nfails:", fails)
sys.exit(1 if fails else 0)
