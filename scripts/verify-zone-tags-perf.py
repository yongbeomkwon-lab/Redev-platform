#!/usr/bin/env python3
"""기본 구역 이름표 — 호버 깜빡임·이동 성능 확인.

   · 이름표에 마우스를 올렸을 때 그 이름표가 사라졌다 나타나지 않는지(깜빡임 0)
   · 확대·이동 중 draw 1회 비용(ms)과 프레임 수
   실행: scripts/with-dev.sh python3 scripts/verify-zone-tags-perf.py [URL]
"""
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100/"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.goto(URL + "?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".zone-tag", timeout=40000)
    time.sleep(4)

    # draw 1회 비용 — 같은 화면에서 30번 그려 평균
    ms = page.evaluate(
        """() => { const d = window.__redevDiag; const t0 = performance.now();
             for (let i = 0; i < 30; i++) d.draw();
             return (performance.now() - t0) / 30; }"""
    )
    print(f"draw 1회 평균 {ms:.2f} ms")

    # 이름표 호버 — 올린 뒤 1.5초 동안 사라지지 않는지
    el = page.query_selector(".zone-tag")
    box = el.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    time.sleep(0.4)
    vis = []
    for _ in range(6):
        vis.append(page.evaluate("() => { const e = document.querySelector('.zone-tag:hover'); return e ? getComputedStyle(e).visibility : 'none'; }"))
        time.sleep(0.2)
    print("호버 중 이름표 visibility:", vis)

    # 이동 중 프레임 — 1초 동안 requestAnimationFrame 횟수
    fps = page.evaluate(
        """() => new Promise((res) => { let n = 0; const t0 = performance.now();
             const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n); };
             requestAnimationFrame(tick); })"""
    )
    print("정지 상태 rAF:", fps)

    # 드래그로 이동하며 프레임 수 측정
    box = page.query_selector(".kakao-map-wrap").bounding_box()
    page.evaluate("() => { window.__n = 0; const t = () => { window.__n++; requestAnimationFrame(t); }; requestAnimationFrame(t); }")
    page.mouse.move(box["x"] + 600, box["y"] + 400)
    page.mouse.down()
    for i in range(1, 40):
        page.mouse.move(box["x"] + 600 - i * 6, box["y"] + 400 - i * 3)
        time.sleep(0.016)
    page.mouse.up()
    time.sleep(0.5)
    n = page.evaluate("() => window.__n")
    print("드래그 0.8초 rAF:", n)
    tags = page.evaluate("() => [...document.querySelectorAll('.zone-tag')].filter(e => e.style.visibility !== 'hidden').length")
    dom = page.evaluate("() => document.querySelectorAll('.zone-tag').length")
    print("이동 후 보이는 이름표:", tags, "DOM 노드:", dom)

    # 모바일 뷰
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    m = ctx2.new_page()
    m.goto(URL, wait_until="domcontentloaded")
    m.wait_for_selector(".zone-tag", timeout=40000)
    time.sleep(4)
    cnt = m.evaluate("() => [...document.querySelectorAll('.zone-tag')].filter(e => e.style.visibility !== 'hidden').length")
    print("모바일 보이는 이름표:", cnt)
    m.screenshot(path="/workspace/downloads/tmp_tags_mobile.png")
    b.close()
