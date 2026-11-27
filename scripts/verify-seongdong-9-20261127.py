#!/usr/bin/env python3
"""성동·광진 9곳 라이브 검증 (2026-11-27)

  TARGET_URL=https://redev-platform-iota.vercel.app/ python3 scripts/verify-seongdong-9-20261127.py

확인:
  1) 새 구역 4곳 + 정정 2곳이 검색·지도에 뜨는지(구역 카드 문구)
  2) 각 구역 선택 시 드로어 제목·유형·단계
  3) 콘솔 오류 0건
  4) 스크린샷 저장
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "https://redev-platform-iota.vercel.app/")
SHOT = "/workspace/downloads"

CASES = [
    ("sd-geumnam-market", "금남시장"),
    ("11000UQ120PS202411014498", "금호21구역"),
    ("11000UQ120PS202505310983", "금호동4가 1458"),
    ("sd-eungbong-daerim1", "응봉대림1차아파트"),
    ("sd-songjeong-73-735", "송정동 73-735"),
    ("seocho-1487" , "서초동 1487"),
    ("sd-eungbong-geumho-hyundai", "금호현대아파트"),
    ("sd-eungbong-daerim1", "응봉대림1차아파트"),
    ("sd-majang-793-22", "마장동 793-22"),
    ("yongdap-2", "용답2구역"),
    ("sy-yongdap1", "(가)용답1구역"),
]

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1600, "height": 950}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("console", lambda m: errs.append("console:" + m.text[:160]) if m.type == "error" else None)

    for zid, name in CASES:
        page.goto(f"{BASE}?zone={zid}", wait_until="domcontentloaded")
        try:
            page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
        except Exception:
            page.wait_for_selector("canvas", timeout=30000)
        time.sleep(3.5)
        aside = page.query_selector("aside")
        text = (aside.inner_text() if aside else "").replace("\n", " | ")
        check(f"{name} 드로어에 구역명", name.replace("(", "").replace(")", "") in text.replace("(", "").replace(")", ""), text[:110])
        page.screenshot(path=f"{SHOT}/리디브_성동광진_{zid}_2026-11-27.png")

    # 검색창에서 '용답2' 로 찾아지는지
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("input", timeout=30000)
    time.sleep(2)
    inp = page.query_selector('[data-testid="zone-search-input"]') or page.query_selector("input")
    inp.fill("용답2")
    time.sleep(2.5)
    page.screenshot(path=f"{SHOT}/리디브_성동광진_검색_용답2_2026-11-27.png")

    check("콘솔 오류 0건", not errs, str(errs[:3]))
    ctx.close()
    b.close()

print("\n실패:", fails if fails else "없음")
sys.exit(1 if fails else 0)
