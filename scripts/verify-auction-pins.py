#!/usr/bin/env python3
"""⚖️ 지도 구역 내 경매 물건 핀 · 왼쪽 대시보드 상세 검증 — 로컬/배포 공용

  사용:
    TARGET_URL=http://localhost:3100 python3 scripts/verify-auction-pins.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-auction-pins.py

  확인 항목 (2026-11-22 사용자 요구 반영)
    1) 첫 화면(구역 미선택)에서도 경매 핀이 기본 ON 이고, 구역 안 매칭 핀이 지도에 보인다
    2) 구역을 열면 그 구역 안 경매 핀이 **하나도 빠지지 않고** 지도 레이어에 올라간다(겹침으로 숨기지 않음)
    3) 핀을 누르면 **왼쪽 대시보드 창**에 사건번호·법원·감정가·최저가·유찰·매각기일·비고 상세가 뜬다
    4) 대법원 외부 링크는 어디에도 없다
    5) 같은 좌표의 호실이 많은 구역(쌍문동 507-1일원)은 핀 하나로 묶이고, 왼쪽 창에서 물건을 전환할 수 있다
    6) 기존 레이어 토글(개발압력·노후도·지번 찍기·실거래)이 그대로 있고 콘솔 오류 0건
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
SHOT = os.environ.get("SHOT_PATH", "/workspace/downloads/리디브_경매핀_구역전체_2026-11-22.png")
SHOT_CARD = os.environ.get("SHOT_CARD", "/workspace/downloads/리디브_경매핀_왼쪽창상세_2026-11-22.png")
SHOT_WIDE = os.environ.get("SHOT_WIDE", "/workspace/downloads/리디브_경매핀_첫화면_2026-11-22.png")

SIHEUNG = "11545UQ120PS202603100002"   # 시흥4동 1-1번지 일대 — 경매 4건, 좌표 4곳
SSANGMUN = "11000UQ120PS202407010398"  # 쌍문동 507-1일원 — 한 사건 132호실, 좌표 1곳

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
    return page.evaluate("() => document.querySelectorAll('[data-testid=\"auction-pin\"]').length")


def pin_texts(page) -> list[str]:
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid="auction-pin"]'))
             .map((el) => el.innerText.replace(/\\s+/g, ' ').trim())"""
    )


def open_zone(page, zone_id: str) -> None:
    page.goto(f"{BASE}/?zone={zone_id}", wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="tx-pins-toggle"], [data-testid="auction-pins-toggle"]', timeout=60000)
    page.wait_for_timeout(3500)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    print(f"[1] 첫 화면(구역 미선택) — 경매 핀 기본 ON  ({BASE})")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="auction-pins-toggle"]', timeout=60000)
    page.wait_for_timeout(4000)
    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    check(toggle.count() == 1, "지도 위 「⚖️ 경매 핀」 토글이 있다")
    check(toggle.get_attribute("aria-pressed") == "true", "첫 화면부터 경매 핀이 기본 ON")
    wide_on = visible_pins(page)
    print(f"       · 보이는 경매 핀 {wide_on}개 / 요소 {total_pins(page)}개")
    check(wide_on >= 5, f"서울 전체 첫 화면에서도 구역 내 경매 핀이 보인다 (보이는 핀 {wide_on}개)")
    page.screenshot(path=SHOT_WIDE)
    print(f"       · 스크린샷 {SHOT_WIDE}")

    print("[2] 시흥4동 1-1번지 일대 — 구역 안 경매 4건 모두 표시")
    open_zone(page, SIHEUNG)
    fallback = page.evaluate("() => !!document.querySelector('.leaflet-container')")
    print(f"       · 지도 엔진: {'Leaflet 폴백' if fallback else '카카오맵'}")
    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    check(toggle.count() == 1, "지도 위 「⚖️ 경매 핀」 토글이 있다")
    t_text = re.sub(r"\s+", " ", toggle.inner_text()) if toggle.count() else ""
    check(toggle.get_attribute("aria-pressed") == "true", "구역을 열면 경매 핀이 ON")
    page.wait_for_timeout(1200)
    pins = visible_pins(page)
    total = total_pins(page)
    texts = pin_texts(page)
    print(f"       · 경매 핀 요소 {total}개 · 보이는 핀 {pins}개 · {texts}")
    check(total == 4, f"구역 안 경매 4건이 지도 레이어에 모두 올라간다 (요소 {total}개)")
    check(pins == 4, f"겹침으로 숨는 핀 없이 4개가 다 보인다 (보이는 핀 {pins}개)")
    check(any("억" in t or "만" in t for t in texts), "핀에 최저가가 들어 있다")
    page.screenshot(path=SHOT)
    print(f"       · 스크린샷 {SHOT}")

    print("[3] 경매 핀 클릭 → 왼쪽 대시보드 창에 상세")
    page.locator('[data-testid="auction-pin"]').first.click()
    page.wait_for_timeout(1200)
    card = page.locator('[data-testid="auction-detail-card"]')
    check(card.count() >= 1, "핀을 누르면 왼쪽 창에 경매 상세 카드가 뜬다")
    card_text = re.sub(r"\s+", " ", card.first.inner_text()) if card.count() else ""
    print(f"       · 카드 내용: {card_text[:300]}")
    for label, name in [
        ("감정", "감정평가액"),
        ("최저", "최저매각가격"),
        ("매각기일", "매각기일"),
        ("유찰", "유찰횟수/신건"),
        ("법원", "법원(경매계)"),
    ]:
        check(label in card_text, f"카드에 {name}가 있다")
    check("타경" in card_text, "카드에 사건번호(타경)가 있다")
    # 왼쪽 창(좌상단 플로팅 영역) 안에 있는지 — 위치로 확인
    box = card.first.bounding_box()
    left_side = bool(box) and box["x"] < 420
    check(left_side, f"카드가 왼쪽 창에 있다 (x={int(box['x']) if box else '?'}px)")
    # 외부 대법원 링크 제거
    links = page.evaluate(
        """() => Array.from(document.querySelectorAll('a[href*="courtauction.go.kr"]')).length"""
    )
    check(links == 0, f"대법원 외부 링크가 없다 (발견 {links}개)")
    page.screenshot(path=SHOT_CARD)
    print(f"       · 스크린샷 {SHOT_CARD}")

    print("[4] 왼쪽 창 닫기")
    page.locator('[data-testid="auction-detail-card"] button[aria-label="경매 물건 상세 닫기"]').click()
    page.wait_for_timeout(500)
    check(page.locator('[data-testid="auction-detail-card"]').count() == 0, "✕ 로 닫힌다")

    print("[5] 쌍문동 507-1일원 — 같은 좌표 다수 호실은 핀 하나 + 창 안 전환")
    open_zone(page, SSANGMUN)
    texts = pin_texts(page)
    n = visible_pins(page)
    print(f"       · 보이는 경매 핀 {n}개 · {texts[:3]}")
    check(n == 1, f"한 좌표의 여러 호실이 핀 1개로 묶인다 (보이는 핀 {n}개)")
    check(any("물건" in t for t in texts), "핀 둘째 줄에 물건 수가 나온다")
    page.locator('[data-testid="auction-pin"]').first.click()
    page.wait_for_timeout(1000)
    chips = page.locator('[data-testid="auction-detail-chip"]')
    print(f"       · 왼쪽 창 물건 칩 {chips.count()}개")
    check(chips.count() > 1, "왼쪽 창에서 묶인 물건을 전환할 수 있다(칩 2개 이상)")
    before = page.locator('[data-testid="auction-detail-card"]').first.get_attribute("data-auction-active")
    if chips.count() > 1:
        chips.nth(1).click()
        page.wait_for_timeout(400)
    after = page.locator('[data-testid="auction-detail-card"]').first.get_attribute("data-auction-active")
    check(before != after, f"칩을 누르면 다른 물건으로 바뀐다 ({before} → {after})")

    print("[6] 오른쪽 패널에는 구역 정보가 그대로")
    aside = page.locator("aside")
    aside_text = re.sub(r"\s+", " ", aside.first.inner_text()) if aside.count() else ""
    check("구역 내 진행 경매" in aside_text, "오른쪽 패널에 「구역 내 진행 경매」 목록이 있다")
    check(page.locator('[data-testid="zone-auctions"]').count() >= 1, "경매 목록 섹션이 그려졌다")

    print("[7] 기존 레이어 토글이 그대로 있다")
    for tid, name in [
        ("dev-pressure-toggle", "개발압력"),
        ("aging-toggle", "노후도"),
        ("jibun-pick-toggle", "지번 찍기"),
        ("tx-pin-layer", "실거래 핀 레이어"),
    ]:
        check(page.locator(f'[data-testid="{tid}"]').count() >= 1, f"{name}가 남아 있다")

    print("[8] 콘솔 오류")
    real_errors = [e for e in errors if "favicon" not in e.lower()]
    for e in real_errors[:5]:
        print("       ·", e[:200])
    check(len(real_errors) == 0, f"콘솔 오류 {len(real_errors)}건")

    browser.close()

print()
if failures:
    print(f"실패 {len(failures)}건:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("모두 통과")
