#!/usr/bin/env python3
"""필지(지적) 경계 강조 + '보는중' 말풍선 검증 (로컬/배포 공용)

  사용:
    TARGET_URL=http://localhost:3100/ python3 scripts/verify-parcel-highlight.py
    TARGET_URL=https://redev-platform-iota.vercel.app/ python3 scripts/verify-parcel-highlight.py

  확인 항목
    1) 주소를 고르면 `/api/parcel` 이 그 지점의 필지를 돌려준다(실패하면 사유를 출력)
    2) 카드에 `지적 필지 ○○ 경계 표시 중` 한 줄 + 지도에 `보는중` 말풍선
    3) 지도 캔버스에 **파란 채움**이 실제로 칠해졌다(스크린샷 픽셀 검사 — 파랑 우세 픽셀 수)
    4) 핀 지우기 → 필지 강조·말풍선이 함께 사라진다
    5) 모바일 390px 에서도 말풍선이 화면 안에 있고 가로 스크롤이 없다
    6) 콘솔 오류 0건

  ※ 로컬에서 돌리면 `/api/parcel` 은 서버 환경변수 VWORLD_API_KEY 가 있어야 응답한다
    (이 실습 환경은 api.vworld.kr 로 나가는 연결이 막혀 있어 배포본에서 확인한다).
"""
import os
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/")
SHOT_DIR = "/workspace/downloads"
SHOT = f"{SHOT_DIR}/redev_address_parcel_highlight.png"
SHOT_MOBILE = f"{SHOT_DIR}/redev_address_parcel_highlight_mobile.png"

QUERY = os.environ.get("PARCEL_QUERY", "성수동2가 315-1")   # 필지가 크게 보이는 주소
QUERY_SMALL = os.environ.get("PARCEL_QUERY_SMALL", "신림동 362-32")

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def blue_pixels(path: str, box: dict) -> int:
    """스크린샷 한가운데(핀 주변)에서 '파랑이 우세한' 픽셀 수 — 필지 채움의 흔적을 센다."""
    im = Image.open(path).convert("RGB")
    x0 = int(max(0, box["x"] + box["width"] / 2 - 120))
    y0 = int(max(0, box["y"] + box["height"] / 2 - 120))
    x1 = int(min(im.width, x0 + 240))
    y1 = int(min(im.height, y0 + 240))
    n = 0
    for x in range(x0, x1, 2):
        for y in range(y0, y1, 2):
            r, g, b = im.getpixel((x, y))
            if b > r + 30 and b > g + 10 and b > 120:
                n += 1
    return n


def pick_address(page, query: str) -> None:
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill(query)
    page.wait_for_selector("[data-testid=address-candidate]", timeout=20000)
    page.get_by_test_id("address-candidate").first.click()
    page.wait_for_selector("[data-testid=address-card]", timeout=20000)


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

        # ── 1·2) 주소 선택 → 필지 강조 ─────────────────────────────────────
        pick_address(page, QUERY)
        page.wait_for_timeout(4500)   # 필지 조회 + 확대 애니메이션
        parcel_line = page.get_by_test_id("address-parcel")
        count = parcel_line.count()
        card_text = page.get_by_test_id("address-card").inner_text().replace("\n", " | ")
        check(
            "① 필지 조회 성공(카드 한 줄)",
            count > 0,
            parcel_line.first.inner_text() if count else card_text[:200],
        )
        viewing = page.get_by_test_id("parcel-viewing")
        check("② '보는중' 말풍선 표시", viewing.count() > 0 and viewing.first.is_visible(),
              str(viewing.first.bounding_box() if viewing.count() else ""))

        # ── 3) 캔버스에 파란 채움 ──────────────────────────────────────────
        page.screenshot(path=SHOT)
        map_box = page.query_selector(".kakao-map-wrap").bounding_box()
        blue = blue_pixels(SHOT, map_box)
        check("③ 지도에 파란 필지 채움", blue > 60, f"파랑 우세 픽셀 {blue}개")
        print("   스크린샷:", SHOT)

        # ── 4) 핀 지우기 → 함께 사라짐 ────────────────────────────────────
        page.get_by_test_id("address-pin-clear").click()
        page.wait_for_timeout(900)
        check("④ 핀 지우기 — 필지 강조 제거", page.get_by_test_id("address-parcel").count() == 0)
        check("④ 핀 지우기 — 말풍선 제거", page.get_by_test_id("parcel-viewing").count() == 0)
        page.screenshot(path=f"{SHOT_DIR}/redev_parcel_cleared.png")
        blue_after = blue_pixels(f"{SHOT_DIR}/redev_parcel_cleared.png", map_box)
        check(
            "④ 핀 지우기 — 파란 채움 사라짐",
            blue_after < blue * 0.75,
            f"파랑 픽셀 {blue_after}개 (필지 표시 중 {blue}개)",
        )

        # ── 작은 필지도 말풍선이 뜨는지 ───────────────────────────────────
        pick_address(page, QUERY_SMALL)
        page.wait_for_timeout(4500)
        small = page.get_by_test_id("parcel-viewing")
        check("② 작은 필지도 '보는중' 표시", small.count() > 0 and small.first.is_visible(),
              f"{QUERY_SMALL}: {small.first.bounding_box() if small.count() else None}")

        # ── 5) 모바일 ─────────────────────────────────────────────────────
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
        pick_address(mpage, QUERY)
        mpage.wait_for_timeout(4500)
        mv = mpage.get_by_test_id("parcel-viewing")
        mbox = mv.first.bounding_box() if mv.count() else None
        check(
            "⑤ 모바일 — 말풍선이 화면 안",
            bool(mbox and mbox["x"] >= 0 and mbox["x"] + mbox["width"] <= 390),
            str(mbox),
        )
        check(
            "⑤ 모바일 — 카드 한 줄",
            mpage.get_by_test_id("address-parcel").count() > 0,
            mpage.get_by_test_id("address-parcel").first.inner_text() if mpage.get_by_test_id("address-parcel").count() else "",
        )
        no_hscroll = mpage.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
        check("⑤ 모바일 — 가로 스크롤 없음", no_hscroll)
        mpage.screenshot(path=SHOT_MOBILE)
        print("   스크린샷:", SHOT_MOBILE)
        check("⑤ 모바일 콘솔 오류 0건", len(merrors) == 0, "; ".join(merrors[:3]))

        # ── 6) 콘솔 오류 ──────────────────────────────────────────────────
        check("⑥ 콘솔 오류 0건 (데스크톱)", len(console_errors) == 0, "; ".join(console_errors[:5]))

        mctx.close()
        ctx.close()
        browser.close()

    print("\n== 결과:", "실패 %d건" % len(failures) if failures else "모두 통과")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
