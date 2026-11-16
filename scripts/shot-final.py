#!/usr/bin/env python3
"""배포본 화면 캡처 — 효창공원앞역 인근 상세 + 확대/이동 중 경계 붙은 모습."""
import time

from playwright.sync_api import sync_playwright

URL = "https://redev-platform-iota.vercel.app/"
OUT = "/workspace/downloads/"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
    time.sleep(3.5)
    page.fill('input[placeholder^="구역명"]', "효창공원앞")
    time.sleep(0.8)
    page.click("ul li button")
    time.sleep(3.0)
    page.screenshot(path=OUT + "redev-kakao-hyochang-map.png")

    # 확대 중(애니메이션 200ms 지점) 캡처 — 경계가 지도에 붙어 있는지 눈으로 확인
    page.evaluate("() => { const m = window.kakao && window.kakao.maps; }")
    box = page.query_selector(".kakao-map-wrap > div").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.35, box["y"] + box["height"] * 0.45)
    time.sleep(0.2)
    page.mouse.wheel(0, -110)
    time.sleep(0.16)
    page.screenshot(path=OUT + "redev-kakao-zoom-mid.png", clip=box)
    time.sleep(1.4)
    page.mouse.wheel(0, -110)
    time.sleep(1.6)
    page.screenshot(path=OUT + "redev-kakao-zoom-settled.png", clip=box)

    # 드래그로 이동한 뒤
    page.mouse.move(box["x"] + 400, box["y"] + 400)
    page.mouse.down()
    for i in range(1, 13):
        page.mouse.move(box["x"] + 400 - i * 22, box["y"] + 400 - i * 12)
        time.sleep(0.014)
    page.mouse.up()
    time.sleep(1.2)
    page.screenshot(path=OUT + "redev-kakao-after-drag.png", clip=box)
    print("saved 4 screenshots")
    ctx.close()
    b.close()
