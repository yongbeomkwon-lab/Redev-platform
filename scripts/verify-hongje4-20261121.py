#!/usr/bin/env python3
"""홍제4구역·홍제동 9-81 일대 운영 검증 (2026-11-21)

  BASE=https://redev-platform-iota.vercel.app python3 scripts/verify-hongje4-20261121.py

하는 일
  · `/?zone=11000UQ120PS202502050006`(홍제동 9-81 일대)을 열어 옛 홍제4구역 구분 문장과 공람 내용이
    드로어에 보이는지 확인하고, 요청받은 스크린샷(downloads/리디브_홍제정리_2026-11-21.png)을 남긴다.
  · `/?zone=11410UQ120PS202605210002`(홍제4구역)을 열어 이름·면적·지번·경과가 채워졌는지 확인하고
    스크린샷을 남긴다.
  · 검색창에 '홍제4'·'홍제동 267-1'을 넣어 두 구역이 각각 잡히는지 확인한다.
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://redev-platform-iota.vercel.app").rstrip("/")
OUTDIR = os.environ.get("OUTDIR", "/workspace/downloads")
W = int(os.environ.get("W", "1440"))
H = int(os.environ.get("H", "900"))

CASES = [
    {
        "id": "11000UQ120PS202502050006",
        "out": os.path.join(OUTDIR, "리디브_홍제정리_2026-11-21.png"),
        "expect": [
            "홍제동 9-81 일대",
            "정비구역지정(공람)",
            "134,565.1",
            "2,521",
            "옛 홍제4구역은 재개발예정구역에서 해제된 뒤",
            "홍제4구역(홍제동 267-1번지 일대, 28,044.4㎡, 877세대)과는 다른 곳",
            "개미마을",
        ],
    },
    {
        "id": "11410UQ120PS202605210002",
        "out": os.path.join(OUTDIR, "리디브_홍제4구역_2026-11-21.png"),
        "expect": [
            "홍제4구역",
            "28,044.4",
            "홍제동 267-1",
            "세무서10길 27-1",
            "2025-12-26",
            "877세대(임대 185세대)",
            "옛 홍제4구역",
            "조합설립 동의서",
        ],
    },
]

fails = 0
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
    for case in CASES:
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:160]))
        page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
        url = f"{BASE}/?zone={case['id']}"
        print(f"\n==== {url}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas, .leaflet-container", timeout=90000)
        time.sleep(8)
        if page.query_selector("aside") is None:
            try:
                page.click("button:has-text('구역 정보')", timeout=2500)
                time.sleep(2)
            except Exception:
                pass
        body = page.inner_text("body")
        aside = page.query_selector("aside")
        head = (aside.inner_text() if aside else "")[:120].replace("\n", " | ")
        print("drawer head:", head or "none")
        missing = [s for s in case["expect"] if s not in body]
        print("checks:", "OK" if not missing else f"MISSING {missing}")
        fails += 0 if not missing else 1
        page.screenshot(path=case["out"])
        print("saved", case["out"], "| errors:", errs[:3] if errs else "none")
        page.close()

    # 검색 확인
    page = ctx.new_page()
    page.goto(f"{BASE}/?zone=11410UQ120PS202605210002", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas, .leaflet-container", timeout=90000)
    time.sleep(5)
    box = page.locator("input[placeholder*='구역명']").first
    for term, expect in (("홍제4", "홍제4구역"), ("홍제동 267-1", "홍제4구역"), ("홍제동 9-81", "홍제동 9-81 일대")):
        box.click()
        box.fill("")
        box.type(term, delay=40)
        time.sleep(2.2)
        hits = page.inner_text("body")
        ok = expect in hits
        print(f"search '{term}' → {expect}: {'OK' if ok else 'NOT FOUND'}")
        fails += 0 if ok else 1
    page.close()
    ctx.close()
    b.close()

print("\nfails:", fails)
sys.exit(1 if fails else 0)
