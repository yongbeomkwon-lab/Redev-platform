#!/usr/bin/env python3
"""용두동 39(가칭 용두7구역) 공고도면 다각형 검증 — 검색·지도 다각형·상세 패널 + 스크린샷.

  사용: MODE=prod scripts/with-dev.sh python3 scripts/verify-yongdu7.py
        BASE=https://redev-platform-iota.vercel.app python3 scripts/verify-yongdu7.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = os.environ.get("OUT", "/workspace/downloads/redev-yongdu7-polygon.png")
OUT_ZOOM = os.environ.get("OUT_ZOOM", "/workspace/downloads/redev-yongdu7-east.png")
JIJEOK = os.environ.get("JIJEOK", "1") == "1"
LAT = float(os.environ.get("LAT", "37.57502"))
LNG = float(os.environ.get("LNG", "127.04157"))
LEVEL = int(os.environ.get("LEVEL", "3"))
ZOOMS = int(os.environ.get("ZOOMS", "1"))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:160]))
    page.on(
        "console",
        lambda m: errs.append("console:" + m.text[:140]) if m.type == "error" else None,
    )
    page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
    time.sleep(4)
    try:
        page.click("button:has-text('접기')", timeout=3000)
    except Exception:
        pass

    # 검색 → 구역 선택
    box = page.locator("input[placeholder*='구역명']").first
    box.click()
    box.fill("용두7")
    time.sleep(1.6)
    hit = page.locator("text=가칭 용두7구역").first
    print("검색 결과 노출:", hit.count() > 0 if hasattr(hit, "count") else True)
    try:
        hit.click(timeout=6000)
    except Exception as e:
        print("검색 결과 클릭 실패:", e)
        try:
            page.get_by_text("용두동 39", exact=True).first.click(timeout=5000)
        except Exception as e2:
            print("목록 클릭도 실패:", e2)
    time.sleep(3)

    if JIJEOK:
        try:
            page.click("button[title*='지적편집도']", timeout=4000)
            time.sleep(3)
            print("지적편집도 ON")
        except Exception as e:
            print("지적편집도 실패:", e)

    page.evaluate("() => window.__redevDiag.draw && window.__redevDiag.draw()")
    time.sleep(2)
    page.evaluate(
        """() => { const m = window.__redevDiag.map();
                   m.setLevel(%d); m.setCenter(new kakao.maps.LatLng(%f, %f)); }"""
        % (LEVEL, LAT, LNG)
    )
    time.sleep(2)
    for _ in range(ZOOMS):
        try:
            page.locator("button:has-text('+')").last.click(timeout=3000)
        except Exception as e:
            print("확대 버튼 실패:", e)
            break
        time.sleep(1.8)
    time.sleep(2.5)

    info = page.evaluate(
        "() => { const m = window.__redevDiag.map(); const c = m.getCenter();"
        " return {lat: c.getLat(), lng: c.getLng(), level: m.getLevel()}; }"
    )
    print("지도:", info)

    body = page.inner_text("body")
    for key in ["용두동 39", "75,408", "공고도면", "왕산로", "22,800", "용두7"]:
        print(f"  포함[{key}]:", key in body)
    for bad in ["구역계 미고시"]:
        print(f"  없어야[{bad}]:", bad not in body)

    page.screenshot(path=OUT)
    print("saved", OUT)

    # 동쪽 대로변(왕산로) 경계 확대 — 폴리곤 동쪽 선이 대로변 필지에 붙는지 눈으로 확인
    page.evaluate(
        "() => { const m = window.__redevDiag.map();"
        " m.setLevel(2); m.setCenter(new kakao.maps.LatLng(37.5756, 127.0429)); }"
    )
    time.sleep(3)
    page.screenshot(path=OUT_ZOOM)
    print("saved", OUT_ZOOM)

    print("콘솔 에러:", [e for e in errs if not e.startswith("console:Failed to load resource")][:8])
    b.close()
