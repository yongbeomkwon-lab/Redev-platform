#!/usr/bin/env python3
"""주소 검색 → 소속 정비구역 자동 판별 검증 (로컬/배포 공용)

  사용:
    MODE=prod scripts/with-dev.sh python3 scripts/verify-address-search.py        # 로컬 빌드본
    TARGET_URL=https://redev-platform-iota.vercel.app/?diag=1 python3 scripts/verify-address-search.py

  확인 항목
    1) 구역 안 주소 → 핀 + 소속 구역(CustomOverlay 말풍선) + 오른쪽 상세 패널 + 스크린샷
    2) 구역 밖 주소 → 판정 문구 없이 지점 핀(주소 한 줄)만 + 가까운 구역 1~3곳 + 클릭 이동 + 스크린샷
    3) 준공 구역 주소 → '준공 완료된 ○○구역 내 주소' 안내 + 준공 토글 자동 ON
    4) 경계 미고시 후보지 인근 주소 → '경계 미고시 후보지 인근' 안내
    5) 핀 지우기 버튼 → 핀·카드 제거
    6) 콘솔 오류 0건
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?diag=1")
SHOT_INSIDE = "/workspace/downloads/redev-address-inside.png"
SHOT_OUTSIDE = "/workspace/downloads/redev-address-outside.png"
SHOT_OUTSIDE_PIN = "/workspace/downloads/redev-addr-outside-pin.png"

INSIDE_Q = "신림동 362-32"       # 서울 관악구 신림동 362-32 — 신림1구역 내부
OUTSIDE_Q = "테헤란로 152"       # 서울 강남구 테헤란로 152 (강남파이낸스센터) — 구역 밖
COMPLETED_Q = "신림동 1748"      # 신림3구역(준공) 내부
NEAR_Q = "사당동 1026-24"        # 사당21구역(경계 미고시) 70m 인근

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def search(page, query: str) -> None:
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill(query)


def wait_card(page, timeout=15000):
    page.wait_for_selector("[data-testid=address-card]", timeout=timeout)
    return page.get_by_test_id("address-card").inner_text()


def run() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        console_errors: list[str] = []
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)[:200]))
        page.on(
            "console",
            lambda m: console_errors.append("console: " + m.text[:200]) if m.type == "error" else None,
        )

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=45000)
        time.sleep(3)
        check("카카오맵 엔진", page.query_selector(".kakao-zone-canvas") is not None)
        check("services 라이브러리 로드", page.evaluate("() => !!window.kakao?.maps?.services"))

        # ── 1) 구역 안 주소 ────────────────────────────────────────────────
        search(page, INSIDE_Q)
        page.wait_for_selector("[data-testid=address-candidate]", timeout=15000)
        page.get_by_test_id("zone-search-input").press("Enter")
        card = wait_card(page)
        headline = page.get_by_test_id("address-status-headline").inner_text()
        check("① 구역 안 주소 — 소속 구역 판별", "포함" in headline, headline)
        check("① 핀 말풍선", page.query_selector("[data-testid=address-pin]") is not None)
        pin_text = page.get_by_test_id("address-pin").inner_text()
        check("① 말풍선에 주소·구역명", ("신림1구역" in pin_text) and ("362-32" in pin_text), pin_text.replace("\n", " | "))
        aside = page.query_selector("aside")
        check("① 오른쪽 상세 패널 열림", aside is not None and "신림1구역" in aside.inner_text())
        time.sleep(2.0)
        page.screenshot(path=SHOT_INSIDE)
        print("   스크린샷:", SHOT_INSIDE)

        # ── 5-a) 핀 지우기 ────────────────────────────────────────────────
        page.get_by_test_id("address-pin-clear").click()
        time.sleep(0.8)
        check("⑤ 핀 지우기 — 카드 제거", page.query_selector("[data-testid=address-card]") is None)
        check("⑤ 핀 지우기 — 지도 핀 제거", page.query_selector("[data-testid=address-pin]") is None)

        # ── 2) 구역 밖 주소 ────────────────────────────────────────────────
        search(page, OUTSIDE_Q)
        page.wait_for_selector("[data-testid=address-candidate]", timeout=15000)
        page.get_by_test_id("zone-search-input").press("Enter")
        card = wait_card(page)
        check("② 구역 밖 — 판정 배너 없음", page.query_selector("[data-testid=address-status]") is None)
        check("② 구역 밖 — '정비구역 밖' 문구 없음", "정비구역 밖" not in card, card.replace("\n", " | ")[:160])
        pin_el = page.query_selector("[data-testid=address-pin]")
        check("② 구역 밖 — 지점 핀 표시", pin_el is not None)
        pin_text = pin_el.inner_text().replace("\n", " | ") if pin_el else ""
        check("② 핀에 주소만", ("테헤란로 152" in pin_text) and ("정비구역 밖" not in pin_text), pin_text)
        nearest = page.query_selector_all("[data-testid=nearest-zone]")
        check("② 최단거리 구역 1~3곳", 1 <= len(nearest) <= 3, f"{len(nearest)}곳")
        nearest_text = nearest[0].inner_text().replace("\n", " ") if nearest else ""
        check("② 최단거리 표기(m/km)", ("m" in nearest_text), nearest_text)
        time.sleep(1.8)
        page.screenshot(path=SHOT_OUTSIDE)
        page.screenshot(path=SHOT_OUTSIDE_PIN)
        print("   스크린샷:", SHOT_OUTSIDE, "/", SHOT_OUTSIDE_PIN)
        # 최단거리 구역 클릭 → 그 구역으로 이동/상세
        if nearest:
            first_name = nearest_text.split(" ")[0]
            nearest[0].click()
            time.sleep(2.2)
            aside = page.query_selector("aside")
            check(
                "② 최단거리 구역 클릭 → 상세 열림",
                aside is not None and first_name in aside.inner_text(),
                first_name,
            )

        # ── 3) 준공 구역 주소 ──────────────────────────────────────────────
        search(page, COMPLETED_Q)
        page.wait_for_selector("[data-testid=address-candidate]", timeout=15000)
        page.get_by_test_id("zone-search-input").press("Enter")
        wait_card(page)
        headline = page.get_by_test_id("address-status-headline").inner_text()
        check("③ 준공 구역 주소 안내", "준공 완료된" in headline, headline)
        pressed = page.evaluate(
            "() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-pressed')!==null) && b.getAttribute('title')?.includes('준공')); return b ? b.getAttribute('aria-pressed') : null }"
        )
        check("③ 준공 포함 토글 자동 ON", pressed == "true", f"aria-pressed={pressed}")

        # ── 4) 경계 미고시 후보지 인근 ────────────────────────────────────
        search(page, NEAR_Q)
        page.wait_for_selector("[data-testid=address-candidate]", timeout=15000)
        page.get_by_test_id("zone-search-input").press("Enter")
        wait_card(page)
        headline = page.get_by_test_id("address-status-headline").inner_text()
        check("④ 경계 미고시 후보지 인근 안내", "경계 미고시" in headline, headline)

        # ── 6) 콘솔 오류 ──────────────────────────────────────────────────
        check("⑥ 콘솔 오류 0건", len(console_errors) == 0, "; ".join(console_errors[:5]))

        ctx.close()
        browser.close()

    print("\n== 결과:", "실패 %d건" % len(failures) if failures else "모두 통과")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
