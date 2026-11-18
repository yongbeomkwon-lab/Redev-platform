#!/usr/bin/env python3
"""방배16구역 다각형 검증 — 검색·지도 다각형·상세 패널 + 스크린샷.

  사용: MODE=prod scripts/with-dev.sh python3 scripts/verify-bangbae16.py
        BASE=https://redev-platform-iota.vercel.app python3 scripts/verify-bangbae16.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = os.environ.get("OUT", "/workspace/downloads/redev-bangbae16.png")
JIJEOK = os.environ.get("JIJEOK", "1") == "1"
LAT = float(os.environ.get("LAT", "37.49315"))
LNG = float(os.environ.get("LNG", "126.98489"))
LEVEL = int(os.environ.get("LEVEL", "3"))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:140]) if m.type == "error" else None)
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
    box.fill("방배16")
    time.sleep(1.6)
    hit = page.locator("text=방배16구역").first
    print("검색 결과 노출:", hit.count() > 0 if hasattr(hit, "count") else True)
    try:
        hit.click(timeout=6000)
    except Exception as e:
        print("검색 결과 클릭 실패:", e)
        # 목록에서 (가칭)방배16구역 항목 클릭 시도
        try:
            page.get_by_text("(가칭)방배16구역", exact=False).first.click(timeout=5000)
        except Exception as e2:
            print("목록 클릭도 실패:", e2)
    time.sleep(3)

    if JIJEOK:
        try:
            page.click("button:has-text('지적편집도')", timeout=4000)
            time.sleep(3)
            print("지적편집도 ON")
        except Exception as e:
            print("지적편집도 실패:", e)

    page.evaluate("() => window.__redevDiag.draw && window.__redevDiag.draw()")
    time.sleep(2)
    # 선택한 구역에 맞춰 확대 (draw() 뒤에 해야 재-fitBounds 에 덮이지 않는다)
    page.evaluate(
        """([lat, lng, level]) => {
          const d = window.__redevDiag, k = window.kakao;
          const m = d.map();
          m.setCenter(new k.maps.LatLng(lat, lng));
          m.setLevel(level);
        }""",
        [LAT, LNG, LEVEL],
    )
    last = None
    for _ in range(16):
        time.sleep(0.7)
        cur = page.evaluate("() => window.__redevDiag.map().getLevel()")
        if cur == last:
            break
        last = cur
    time.sleep(2.5)

    # 지도 중심/레벨 확인
    info = page.evaluate(
        "() => { const m = window.__redevDiag.map(); const c = m.getCenter();"
        " return {lat: c.getLat(), lng: c.getLng(), level: m.getLevel()}; }"
    )
    print("지도:", info)

    # 상세 패널 텍스트
    body = page.inner_text("body")
    for key in ["(가칭)방배16구역", "100,997", "공고 도면", "405필지", "61.97", "71.3", "100,307"]:
        print(f"  포함[{key}]:", key in body)

    page.screenshot(path=OUT)
    print("saved", OUT)
    print("콘솔 에러:", [e for e in errs if not e.startswith("console:Failed to load resource")][:8])
    b.close()
