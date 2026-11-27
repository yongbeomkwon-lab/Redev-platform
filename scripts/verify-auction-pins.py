#!/usr/bin/env python3
"""⚖️ 경매 단일 패널 검증 — 로컬/배포 공용 (2026-11-27 개편)

  사용:
    TARGET_URL=http://localhost:3100 python3 scripts/verify-auction-pins.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-auction-pins.py

  확인 항목
    1) 첫 화면의 「⚖️ 경매 핀」 토글이 있고, 켜면 서울 전체 경매 핀이 보인다(첫 화면 기본 OFF)
    2) 구역을 열면 그 구역의 경매 핀이 빠짐없이 지도에 올라간다
    3) 핀을 누르면 **왼쪽 경매 전용 패널**에 물건 상세가 뜬다(사건번호·감정·최저·기일·법원)
    4) **오른쪽 구역 패널에는 경매 목록이 다시 그려지지 않는다** — 헤더의 「⚖️ 경매 N건 · 보기」 한 줄뿐
    5) 같은 좌표의 다수 호실(쌍문동 507-1)은 핀 1개 + 패널 안 물건 전환
    6) 기존 레이어 토글이 그대로 있고 콘솔 오류 0건
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
SHOTS = os.environ.get("SHOT_DIR", "/workspace/downloads")
TAG = os.environ.get("SHOT_TAG", "2026-11-27")

SIHEUNG = "11545UQ120PS202603100002"   # 시흥4동 1-1번지 일대 — 경매 4건, 좌표 4곳
SSANGMUN = "11000UQ120PS202407010398"  # 쌍문동 507-1일원 — 한 좌표에 132사건

failures: list[str] = []
errors: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


def visible_pins(page) -> int:
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid="auction-pin"]'))
             .filter((el) => {
               const wrap = el.parentElement;
               if (!wrap) return false;
               if (getComputedStyle(wrap).visibility === 'hidden') return false;
               const box = el.getBoundingClientRect();
               return box.width > 2 && box.height > 2;
             }).length"""
    )


def total_pins(page) -> int:
    return page.locator('[data-testid="auction-pin"]').count()


def pin_texts(page) -> list[str]:
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid="auction-pin"]'))
             .map((el) => el.innerText.replace(/\\s+/g, ' ').trim())"""
    )


def open_zone(page, zone_id: str) -> None:
    page.goto(f"{BASE}/?zone={zone_id}", wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="auction-pins-toggle"]', timeout=60000)
    page.wait_for_timeout(3500)


def click_pin(page) -> None:
    """지도 핀은 지도 유휴 전 visibility:hidden 인 순간이 있어, 안 보이면 DOM 클릭으로 누른다."""
    pin = page.locator('[data-testid="auction-pin"]').first
    try:
        pin.click(timeout=4000)
    except Exception:
        page.evaluate("() => document.querySelector('[data-testid=\"auction-pin\"]').click()")
    page.wait_for_timeout(900)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    failed_urls: list[str] = []
    page.on("requestfailed", lambda r: failed_urls.append(r.url))

    print(f"[1] 첫 화면 — 경매 핀 토글(기본 OFF)  ({BASE})")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="auction-pins-toggle"]', timeout=60000)
    page.wait_for_timeout(3500)
    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    check(toggle.count() == 1, "지도 위 「⚖️ 경매 핀」 토글이 있다")
    check(toggle.get_attribute("aria-pressed") == "false", "첫 화면에서는 경매 핀이 꺼져 있다(2026-11-27)")
    toggle.click()
    page.wait_for_timeout(1200)
    wide_on, wide_total = visible_pins(page), total_pins(page)
    print(f"       · 보이는 경매 핀 {wide_on}개 / 요소 {wide_total}개")
    check(wide_total >= 5, f"토글을 켜면 서울 전체 경매 핀이 올라간다 (요소 {wide_total}개)")
    page.screenshot(path=f"{SHOTS}/리디브_경매_첫화면_{TAG}.png")

    print("[2] 시흥4동 1-1번지 일대 — 구역 안 경매 4건")
    open_zone(page, SIHEUNG)
    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    if toggle.get_attribute("aria-pressed") != "true":
        toggle.click()
        page.wait_for_timeout(1200)
    check(toggle.get_attribute("aria-pressed") == "true", "토글을 켜면 구역 경매 핀이 ON")
    total, seen, texts = total_pins(page), visible_pins(page), pin_texts(page)
    print(f"       · 핀 요소 {total}개 · 보이는 핀 {seen}개 · {texts[:4]}")
    check(total == 4, f"구역 안 경매 4건이 모두 지도 레이어에 있다 (요소 {total})")
    check(any("억" in t or "만" in t for t in texts), "핀에 최저가가 들어 있다")
    page.screenshot(path=f"{SHOTS}/리디브_경매_시흥4동_핀_{TAG}.png")

    print("[3] 핀 클릭 → 왼쪽 경매 전용 패널 상세")
    click_pin(page)
    panel = page.locator('[data-testid="auction-panel"]')
    check(panel.count() == 1, "핀을 누르면 경매 패널이 열린다")
    text = re.sub(r"\s+", " ", panel.first.inner_text()) if panel.count() else ""
    print(f"       · 패널: {text[:260]}")
    for label, name in [("감정", "감정가"), ("최저", "최저가"), ("매각기일", "매각기일"),
                        ("법원", "법원"), ("복사", "사건번호 복사")]:
        check(label in text, f"패널에 {name}가 있다")
    check("타경" in text, "패널에 사건번호(타경)가 있다")
    box = panel.first.bounding_box()
    check(bool(box) and box["x"] < 430, f"패널이 왼쪽에 있다 (x={int(box['x']) if box else '?'}px)")
    page.screenshot(path=f"{SHOTS}/리디브_경매_상세패널_{TAG}.png")

    print("[4] 오른쪽 패널 — 경매 목록 중복 없음, 요약 버튼 한 줄")
    aside = page.locator("aside")
    aside_text = re.sub(r"\s+", " ", aside.first.inner_text()) if aside.count() else ""
    check("구역 내 진행 경매" not in aside_text, "오른쪽 패널에 「구역 내 진행 경매」 목록이 없다")
    check(page.locator('[data-testid="zone-auctions"]').count() == 0, "예전 경매 목록 섹션이 그려지지 않는다")
    check(page.locator('[data-testid="panel-auction-badge"]').count() == 1,
          "오른쪽 패널 헤더에 「⚖️ 경매 N건 · 보기」가 있다")

    print("[5] 패널 닫기")
    page.locator('[data-testid="auction-panel"] button[aria-label="경매 패널 닫기"]').click()
    page.wait_for_timeout(400)
    check(page.locator('[data-testid="auction-panel"]').count() == 0, "✕ 로 닫힌다")

    print("[6] 쌍문동 507-1일원 — 같은 좌표 132사건, 핀 1개 + 패널 안 전환")
    open_zone(page, SSANGMUN)
    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    if toggle.get_attribute("aria-pressed") != "true":
        toggle.click()
        page.wait_for_timeout(1000)
    texts = pin_texts(page)
    n, total = visible_pins(page), total_pins(page)
    print(f"       · 핀 요소 {total}개 · 보이는 핀 {n}개 · {texts[:2]}")
    check(total == 1, f"한 좌표의 여러 사건이 핀 1개로 묶인다 (요소 {total})")
    check(any("물건" in t or "건" in t for t in texts), "핀 둘째 줄에 물건 수가 나온다")
    click_pin(page)
    panel = page.locator('[data-testid="auction-panel"]')
    check(panel.count() == 1, "패널이 열린다")
    panel.get_by_text("경매 목록").first.click()
    page.wait_for_timeout(400)
    more = panel.get_by_text("모두 보기").first
    if more.count():
        more.click()
        page.wait_for_timeout(700)
    rows = page.locator('[data-testid="auction-row"]')
    print(f"       · 목록 줄 {rows.count()}개")
    check(rows.count() >= 100, "패널 목록에 이 구역 사건 132건이 들어 있다")
    page.screenshot(path=f"{SHOTS}/리디브_경매_쌍문동_목록_{TAG}.png")

    print("[7] 기존 레이어 토글이 그대로 있다")
    for tid, name in [("my-listings-toggle", "내 매물"), ("aging-toggle", "노후도"),
                      ("jibun-pick-toggle", "지번 찍기"), ("tx-pin-layer", "실거래 핀 레이어")]:
        check(page.locator(f'[data-testid="{tid}"]').count() >= 1, f"{name}가 남아 있다")

    print("[8] 콘솔 — 치명적 페이지 오류")
    real = [e for e in errors if "favicon" not in e.lower()]
    for e in real[:5]:
        print("       ·", e[:160])
    page_errors = [e for e in real if not e.startswith("Failed to load resource") and "style property" not in e]
    check(len(page_errors) == 0, f"치명적 콘솔 오류 {len(page_errors)}건 (환경 503·개발 경고 제외)")
    if failed_urls:
        print("       · 실패 요청:", *failed_urls[:3], sep="\n         ")

    browser.close()

# 모바일 — 시트 하나로만 열린다
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
    print("[9] 모바일 390×844 — 경매 시트 하나")
    open_zone(page, SIHEUNG)
    badge = page.locator('[data-testid="panel-auction-badge"]')
    if badge.count():
        badge.first.click()
    else:
        page.evaluate("() => document.querySelector('[data-testid=\"auction-pin\"]')?.click()")
    page.wait_for_timeout(900)
    panel = page.locator('[data-testid="auction-panel"]')
    check(panel.count() == 1, "모바일에서 경매 패널이 열린다")
    if panel.count():
        box = panel.first.bounding_box()
        print(f"       · 시트 {box}")
        check(bool(box) and box["x"] < 20 and box["width"] > 340, "화면 폭을 채운 바닥 시트다")
        check(page.locator("aside").count() == 0, "오른쪽 패널은 함께 열리지 않는다")
        page.screenshot(path=f"{SHOTS}/리디브_경매_모바일시트_{TAG}.png")
    browser.close()

print()
if failures:
    print(f"실패 {len(failures)}건:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("모두 통과")
