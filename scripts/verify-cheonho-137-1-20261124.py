#!/usr/bin/env python3
"""천호동 137-1 배포 검수 — 구역명 검색 → 구역 선택 → 지도 확대 (일반 / 지적편집도).

  python3 scripts/verify-cheonho-137-1-20261124.py
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://redev-platform-iota.vercel.app")
Q = "천호동 137-1"
OUT1 = "/workspace/downloads/redev_cheonho_137_1.png"
OUT2 = "/workspace/downloads/redev_cheonho_137_1_jijeok.png"
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, device_scale_factor=2)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:160]))
        page.on("console", lambda m: errs.append("console:" + m.text[:140]) if m.type == "error" else None)
        page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(5)
        # 접힌 패널 펼치기
        try:
            page.click("button:has-text('펼치기')", timeout=2000)
        except Exception:
            pass

        inp = page.get_by_test_id("zone-search-input")
        inp.click()
        inp.fill(Q)
        page.wait_for_selector("[data-testid=zone-result]", timeout=20000)
        results = page.locator("[data-testid=zone-result]")
        texts = results.all_inner_texts()
        print("검색 결과:", texts[:5])
        check("구역명 검색 결과에 천호동 137-1", any("천호동 137-1" in t for t in texts))
        # 첫 결과 선택
        results.first.click()
        time.sleep(6)
        body = page.inner_text("body")
        aside = page.inner_text("aside")
        check("상세 패널에 구역명", "천호동 137-1" in aside)
        check("경계 표기 — 패널에 '구역계 미고시' 배지 없음", "구역계 미고시" not in aside)
        # 지도 확대 — 구역 중심으로
        page.evaluate(
            """([lat, lng, level]) => {
              const d = window.__redevDiag;
              const m = d.map();
              const k = window.kakao;
              m.setCenter(new k.maps.LatLng(lat, lng));
              m.setLevel(level);
            }""",
            [37.54156, 127.13505, 2],
        )
        time.sleep(5)
        page.screenshot(path=OUT1)
        print("saved", OUT1)

        # 지적편집도
        try:
            page.click("button:has-text('지적편집도')", timeout=5000)
            time.sleep(4)
            print("지적편집도 on")
        except Exception as e:
            print("지적편집도 실패:", e)
        page.screenshot(path=OUT2)
        print("saved", OUT2)

        check("콘솔 오류 0건", len([e for e in errs if "favicon" not in e]) == 0, str(errs[:3]))
        print("level", page.evaluate("() => window.__redevDiag.map().getLevel()"))
        b.close()
    print("실패", len(fails), fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
