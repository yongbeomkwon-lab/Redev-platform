#!/usr/bin/env python3
"""주소 자동완성 줄의 **구역명 배지** 검증 (로컬/배포 공용)

  사용:
    TARGET_URL=http://localhost:3100/ python3 scripts/verify-address-zone-badge.py
    TARGET_URL=https://redev-platform-iota.vercel.app/ python3 scripts/verify-address-zone-badge.py

  확인 항목
    1) 구역 안 주소 → 주소 줄에 그 구역명 배지 (신림동 362-32 → 신림1구역)
    2) 재개발닷컴 레퍼런스와 같은 케이스 — 양재동 388-2 → 양재동 382
    3) 준공 구역 → `준공` 접두 배지 (일원동 743)
    4) 경계 미고시 후보지 → 지번(대표 필지) 기준임을 title 로 밝힌 회색 배지 (행촌동 210-2 일대)
    5) 구역 밖 주소 → 배지 없음 (서초동 1303-22)
    6) 모바일 390px — 배지가 줄 폭을 넘지 않고 주소 줄이 깨지지 않음
    7) 배지를 단 주소를 눌러도 기존 판정 카드가 그대로 동작
    8) 콘솔 오류 0건
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/")
SHOT_DIR = "/workspace/downloads"
SHOT_DESKTOP = f"{SHOT_DIR}/redev_search_zone_badge.png"
SHOT_MOBILE = f"{SHOT_DIR}/redev_search_zone_badge_mobile.png"

INSIDE_Q = "신림동 362-32"        # 관악구 신림동 362-32 — 신림1구역 내부
REFERENCE_Q = "양재동 388-2"      # 서초구 양재동 388-2 — 재개발닷컴 캡처와 같은 주소(양재동 382)
COMPLETED_Q = "일원동 743"        # 강남구 일원동 743 — 준공 구역(기본 지도에서 숨김)
JIBUN_Q = "행촌동 210-2"          # 종로구 행촌동 210-2 — 경계 미고시 후보지(지번이 구역 이름)
OUTSIDE_Q = "서초동 1303-22"      # 서초구 서초동 1303-22 — 정비구역 밖

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def rows(page):
    return page.get_by_test_id("address-candidate")


def search(page, q: str) -> None:
    """주소를 치고 **그 주소의 후보**가 뜰 때까지 기다린다.

    이전 검색의 후보가 DOM 에 남아 있어 `wait_for_selector` 만으로는 새 결과를 기다리지 못한다
    (2026-11-23: 양재동을 쳤는데 신림동 줄을 읽어 실패) — 번지(마지막 토큰)가 보이는지로 확인한다.
    """
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill(q)
    token = q.split()[-1]
    deadline = time.time() + 20
    while time.time() < deadline:
        rows = page.get_by_test_id("address-candidate")
        if rows.count() and token in rows.first.inner_text():
            break
        page.wait_for_timeout(250)
    time.sleep(1.0)


def badge_of(page, index: int = 0):
    row = rows(page).nth(index)
    b = row.get_by_test_id("address-zone-badge")
    if b.count() == 0:
        return None
    return b.first


def run() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page = ctx.new_page()
        console_errors: list[str] = []
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)[:200]))
        page.on(
            "console",
            lambda m: console_errors.append("console: " + m.text[:200]) if m.type == "error" else None,
        )

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=60000)
        time.sleep(3)
        check("services 라이브러리 로드", page.evaluate("() => !!window.kakao?.maps?.services"))

        # ── 1) 구역 안 주소 ────────────────────────────────────────────────
        search(page, INSIDE_Q)
        b = badge_of(page)
        text = b.inner_text() if b else ""
        check("① 구역 안 주소 — 배지 표시", b is not None)
        check("① 배지에 구역명", "신림1구역" in text, text)
        row_text = rows(page).first.inner_text().replace("\n", " | ")
        check("① 배지가 주소 줄에 있음", "신림동 362-32" in row_text and "신림1구역" in row_text, row_text)
        time.sleep(0.8)
        page.screenshot(path=SHOT_DESKTOP)
        print("   스크린샷:", SHOT_DESKTOP)

        # ── 2) 재개발닷컴 레퍼런스 케이스 ─────────────────────────────────
        search(page, REFERENCE_Q)
        b = badge_of(page)
        text = b.inner_text() if b else ""
        check("② 양재동 388-2 → 양재동 382", "양재동 382" in text, text)

        # ── 3) 준공 구역 ──────────────────────────────────────────────────
        search(page, COMPLETED_Q)
        b = badge_of(page)
        text = b.inner_text() if b else ""
        check("③ 준공 배지", "준공" in text and "일원동 743" in text, text)

        # ── 4) 경계 미고시(지번 기준) ─────────────────────────────────────
        search(page, JIBUN_Q)
        b = badge_of(page)
        text = b.inner_text() if b else ""
        title = b.get_attribute("title") if b else ""
        check("④ 경계 미고시 — 지번 기준 배지", "행촌동 210-2" in text, text)
        check("④ 경계 미고시 근거 표기", "지번" in (title or ""), (title or "").replace("\n", " / "))

        # ── 5) 구역 밖 주소 ───────────────────────────────────────────────
        search(page, OUTSIDE_Q)
        check("⑤ 구역 밖 — 배지 없음", badge_of(page) is None, rows(page).first.inner_text().replace("\n", " | "))

        # ── 7) 배지 단 주소 클릭 → 판정 카드 ──────────────────────────────
        search(page, INSIDE_Q)
        rows(page).first.click()
        page.wait_for_selector("[data-testid=address-card]", timeout=15000)
        headline = page.get_by_test_id("address-status-headline").inner_text()
        check("⑦ 클릭 후 판정 카드", "포함" in headline, headline)

        # ── 6) 모바일 390px 레이아웃 ─────────────────────────────────────
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="ko-KR", device_scale_factor=2)
        mpage = mctx.new_page()
        merrors: list[str] = []
        mpage.on("pageerror", lambda e: merrors.append(str(e)[:200]))
        mpage.on(
            "console",
            lambda m: merrors.append("console: " + m.text[:200]) if m.type == "error" else None,
        )
        mpage.goto(URL, wait_until="domcontentloaded")
        mpage.wait_for_selector(".kakao-zone-canvas", timeout=60000)
        time.sleep(3)
        search(mpage, REFERENCE_Q)
        mrow = rows(mpage).first
        mb = mrow.get_by_test_id("address-zone-badge").first
        rbox, bbox = mrow.bounding_box(), mb.bounding_box()
        check(
            "⑥ 모바일 — 배지가 줄 안에 들어옴",
            bool(rbox and bbox and bbox["x"] >= rbox["x"] and bbox["x"] + bbox["width"] <= rbox["x"] + rbox["width"]),
            f"row={rbox} badge={bbox}",
        )
        check("⑥ 모바일 — 배지 한 줄 높이", bool(bbox and bbox["height"] <= 24), f"h={bbox['height'] if bbox else None}")
        no_hscroll = mpage.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
        check("⑥ 모바일 — 가로 스크롤 없음", no_hscroll)
        time.sleep(0.6)
        mpage.screenshot(path=SHOT_MOBILE)
        print("   스크린샷:", SHOT_MOBILE)
        check("⑥ 모바일 콘솔 오류 0건", len(merrors) == 0, "; ".join(merrors[:3]))

        # ── 8) 콘솔 오류 ──────────────────────────────────────────────────
        check("⑧ 콘솔 오류 0건 (데스크톱)", len(console_errors) == 0, "; ".join(console_errors[:5]))

        mctx.close()
        ctx.close()
        browser.close()

    print("\n== 결과:", "실패 %d건" % len(failures) if failures else "모두 통과")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
