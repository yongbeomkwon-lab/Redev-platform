#!/usr/bin/env python3
"""마우스 휠 확대·축소 회귀 검사 — 지도 위에서 **실제 wheel 이벤트**를 보내고 배율 변화를 본다.

배경 (2026-11-24 사용자 제보 2차)
  “지도가 작아진 상태에서 마우스 휠로 확대 축소했으나 그대로임”
  · 이름표 레이어(z-index 90, 화면 전체)의 pointer-events 가 실수로 auto 로 풀리면서
    휠·드래그·클릭이 지도에 닿지 못했다. 레이어는 늘 none 이어야 한다.

검사 항목
  1) 이름표 레이어 pointer-events = none  (휠을 삼키지 않는다)
  2) 관리자 모드(초안 없음) — 휠 올리면 확대·내리면 축소
  3) 그리기(초안 있음) — 휠 올리면 확대·내리면 축소  (더블클릭 확대만 막힌다)
  4) 일반 모드 — 휠 올리면 확대·내리면 축소
  5) +/- 버튼 — 확대·축소
저장·삭제는 하지 않는다(초안은 취소).

사용법
    scripts/with-dev.sh python3 scripts/verify-wheel-zoom.py
    TARGET_URL='https://redev-platform-iota.vercel.app/?admin=1&diag=1' \
        LD_LIBRARY_PATH=/workspace/tmp/pwlibs python3 scripts/verify-wheel-zoom.py
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?admin=1&diag=1")
SHOT = os.environ.get("SHOT_PATH", "")

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg), flush=True)
    if not ok:
        errors.append(str(msg))


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)[:160]))
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=45000)
        time.sleep(4)

        engine = page.evaluate("() => (document.querySelector('.kakao-zone-canvas') ? 'kakao' : 'leaflet')")
        print("engine:", engine)
        if engine != "kakao":
            print("카카오 엔진이 아닙니다(키 없음·폴백) — 이 검사는 카카오 지도에서만 의미가 있습니다.")
            ctx.close()
            b.close()
            return 2

        lvl = lambda: page.evaluate("() => window.__redevDiag.map().getLevel()")
        setlvl = lambda n: page.evaluate("(n) => window.__redevDiag.map().setLevel(n)", n)

        box = page.query_selector(".kakao-map-wrap").bounding_box()
        cx = box["x"] + box["width"] * 0.62
        cy = box["y"] + box["height"] * 0.55

        def wheel_up_down(label):
            setlvl(8)
            time.sleep(1.2)
            a = lvl()
            page.mouse.move(cx, cy)
            time.sleep(0.3)
            page.mouse.wheel(0, -240)
            time.sleep(1.6)
            b2 = lvl()
            page.mouse.wheel(0, 480)
            time.sleep(1.6)
            c = lvl()
            print(f"[{label}] level: {a} →(wheel↑) {b2} →(wheel↓) {c}")
            log(b2 < a, f"[{label}] 휠 올리면 확대: {a} → {b2}")
            log(c > b2, f"[{label}] 휠 내리면 축소: {b2} → {c}")

        # 1) 이름표 레이어가 휠을 통과시키는지
        pe = page.evaluate(
            """() => {
          const l = document.querySelector('[data-testid="zone-tag-layer"]');
          return l ? getComputedStyle(l).pointerEvents : "missing";
        }"""
        )
        log(pe == "none", f"이름표 레이어 pointer-events = {pe} (none 이어야 휠·드래그가 지도에 닿는다)")

        # 2) 관리자 모드 · 초안 없음
        wheel_up_down("관리자·초안없음")

        # 3) 그리기 중(초안 있음)
        draw_btn = page.query_selector('button:has-text("새 구역 그리기")')
        if draw_btn:
            draw_btn.click()
            time.sleep(0.8)
            page.mouse.click(cx, cy)
            time.sleep(0.4)
            page.mouse.click(cx + 60, cy + 40)
            time.sleep(0.8)
            draft_pts = page.evaluate("() => document.querySelectorAll('[data-vx]').length")
            log(draft_pts >= 2, f"그리기 초안 꼭짓점 {draft_pts}개")
            wheel_up_down("그리기중")
            page.keyboard.press("Escape")
            time.sleep(0.8)
            cancelled = page.query_selector('[data-vx]') is None
            log(cancelled, "초안 취소(Escape) — 저장하지 않음")
        else:
            log(False, "‘새 구역 그리기’ 버튼을 찾지 못했습니다")

        # 4) 일반 모드
        exit_btn = page.query_selector('button:has-text("관리자 모드 종료")')
        if exit_btn:
            exit_btn.click()
            time.sleep(1.0)
        wheel_up_down("일반")

        # 5) +/- 버튼
        plus = page.query_selector('button[aria-label="확대"]')
        minus = page.query_selector('button[aria-label="축소"]')
        if plus and minus:
            setlvl(8)
            time.sleep(1.0)
            a = lvl()
            plus.click()
            time.sleep(1.3)
            b2 = lvl()
            minus.click()
            time.sleep(1.3)
            c = lvl()
            print(f"[버튼] level: {a} →(+) {b2} →(−) {c}")
            log(b2 < a, f"+ 버튼 확대: {a} → {b2}")
            log(c > b2, f"− 버튼 축소: {b2} → {c}")
        else:
            log(False, "확대/축소 버튼을 찾지 못했습니다")

        if SHOT:
            page.screenshot(path=SHOT)
            print("shot:", SHOT)
        ctx.close()
        b.close()

    real = [e for e in errors if "favicon" not in e]
    print("RESULT:", "PASS" if not real else f"FAIL({len(real)}) {real[:3]}")
    return 0 if not real else 1


sys.exit(main())
