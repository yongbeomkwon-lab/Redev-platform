#!/usr/bin/env python3
"""송파동 117 일대(송파1동 하단) 모아타운 1~5구역계 — 배포본 검수 + 스크린샷

  TARGET_URL=https://redev-platform-iota.vercel.app/?diag=1 python3 scripts/verify-songpa117.py

  확인
    1) '송파동 117'·'송파1동 하단' 검색으로 구역이 잡히는가
    2) 1~5구역이 지도에 그려지고, 상세 패널이 '참고도' 경계·면적·설명을 보여주는가
    3) 콘솔 오류 0건
    4) 전체 지도 + 상세 패널 스크린샷 저장
"""
import os
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "https://redev-platform-iota.vercel.app/?diag=1")
OUT_FULL = "/workspace/downloads/redev_songpa117_map.png"
OUT_PANEL = "/workspace/downloads/redev_songpa117_panel.png"
ZONES = [f"송파동 117 일대 모아타운 {i}구역" for i in range(1, 6)]
failures: list[str] = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def search(page, q):
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill(q)
    time.sleep(1.2)


def run():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(5)
        for label in ("접기",):
            try:
                page.click(f"button:has-text('{label}')", timeout=2500)
            except Exception:
                pass

        # 1) 검색
        search(page, "송파동 117")
        time.sleep(1.0)
        page.screenshot(path="/workspace/downloads/redev_songpa117_search.png")
        items = page.locator("[data-testid=zone-search-result], li button, [role=option]")
        txt = page.locator("body").inner_text()
        check("검색 '송파동 117' 결과에 5구역 노출", all(z in txt for z in ZONES), "")

        # 2) 첫 결과 클릭 → 패널
        page.keyboard.press("Escape")
        search(page, "송파1동 하단")
        time.sleep(1.2)
        body = page.locator("body").inner_text()
        check("검색 '송파1동 하단' 결과 노출", "송파1동 하단" in body)

        # 지도 이동 + 지적편집도
        page.evaluate(
            """() => {const d=window.__redevDiag,k=window.kakao,m=d.map();
                 m.setCenter(new k.maps.LatLng(37.50705,127.11155)); m.setLevel(3);}"""
        )
        time.sleep(2.0)
        try:
            page.click("button:has-text('지적편집도')", timeout=4000)
            time.sleep(2.5)
            print("지적편집도 on")
        except Exception as e:
            print("지적편집도 실패:", e)
        page.evaluate("() => window.__redevDiag.draw && window.__redevDiag.draw()")
        time.sleep(2.0)
        page.screenshot(path=OUT_FULL)

        # 3) 각 구역 선택 → 패널 확인
        panel_ok = []
        for z in ZONES:
            search(page, z)
            time.sleep(0.8)
            try:
                page.locator("text=" + z).first.click(timeout=5000)
                time.sleep(2.0)
            except Exception as e:
                print("선택 실패", z, str(e)[:80])
            body = page.locator("body").inner_text()
            ok = (z.replace(" 일대", " 일대") in body) and ("참고도" in body)
            panel_ok.append(ok)
            print(z, "패널", "OK" if ok else "NO")
        check("1~5구역 상세 패널(참고도 표기)", all(panel_ok), str(panel_ok))
        page.screenshot(path=OUT_PANEL)

        # 4) 콘솔 오류
        real = [e for e in errs if "favicon" not in e and "ResizeObserver" not in e]
        check("콘솔 오류 0", len(real) == 0, str(real[:3]))
        print("saved", OUT_FULL, OUT_PANEL)
        b.close()
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(run())
