#!/usr/bin/env python3
"""⚖️ 지도 구역 내 경매 물건 핀 검증 — 로컬/배포 공용

  사용:
    TARGET_URL=http://localhost:3100 python3 scripts/verify-auction-pins.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-auction-pins.py

  확인 항목
    1) 경매 물건이 있는 구역(시흥4동 1-1번지 일대)을 열면 지도 위에 ⚖️ 경매 핀이 찍힌다
       (지도 위 「⚖️ 경매 핀 4」 토글도 함께 보인다)
    2) 핀을 누르면 사건번호·감정가·최저가·유찰·매각기일·대법원 조회 링크 카드가 뜬다
    3) 같은 좌표의 호실이 많은 구역(쌍문동 507-1일원 109건)은 핀 하나로 묶여 `물건 109건`으로 뜬다
    4) 광역(구역 미선택)에서는 토글이 꺼져 있고, 켜면 매칭된 경매 핀이 지도에 나타난다
    5) 기존 레이어(실거래 핀·개발압력·노후도·지번 찍기) 토글이 그대로 있다
    6) 콘솔 오류 0건
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
SHOT = os.environ.get("SHOT_PATH", "/workspace/downloads/redev-auction-pins-local.png")
SHOT_CARD = os.environ.get("SHOT_CARD", "/workspace/downloads/redev-auction-pin-card-local.png")
SHOT_WIDE = os.environ.get("SHOT_WIDE", "/workspace/downloads/redev-auction-pins-wide-local.png")

SIHEUNG = "11545UQ120PS202603100002"   # 시흥4동 1-1번지 일대 — 경매 4건, 좌표 4곳
SSANGMUN = "11000UQ120PS202407010398"  # 쌍문동 507-1일원 — 한 사건 109호실, 좌표 1곳

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
    page.wait_for_selector('[data-testid="tx-pins-toggle"], [data-testid="auction-pins-toggle"]', timeout=40000)
    page.wait_for_timeout(2500)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    print(f"[1] 시흥4동 1-1번지 일대 — 경매 4건  ({BASE})")
    open_zone(page, SIHEUNG)
    fallback = page.evaluate("() => !!document.querySelector('.leaflet-container')")
    print(f"       · 지도 렌더: {'Leaflet 폴백' if fallback else '카카오맵'}")

    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    check(toggle.count() == 1, "지도 위 「⚖️ 경매 핀」 토글이 있다")
    t_text = re.sub(r"\s+", " ", toggle.inner_text()) if toggle.count() else ""
    check("경매" in t_text and "4" in t_text, f"토글 문구에 건수가 병기된다 ({t_text!r})")
    check(toggle.get_attribute("aria-pressed") == "true", "구역을 고르면 경매 핀이 기본 ON")

    page.wait_for_timeout(800)
    pins = visible_pins(page)
    total = total_pins(page)
    texts = pin_texts(page)
    print(f"       · 경매 핀 요소 {total}개 · 보이는 핀 {pins}개 · {texts}")
    check(total == 4, f"구역 안 경매 4건이 지도 레이어에 모두 올라간다 (요소 {total}개)")
    check(pins >= 2, f"겹치지 않는 경매 핀이 지도에 찍힌다 (보이는 핀 {pins}개 / 4)")
    check(any("억" in t for t in texts), "핀에 최저가가 들어 있다")
    page.screenshot(path=SHOT)
    print(f"       · 스크린샷 {SHOT}")

    print("[2] 경매 핀 → 요약 카드")
    page.locator('[data-testid="auction-pin"]').first.click()
    page.wait_for_timeout(700)
    card = page.locator('[data-testid="auction-pin-card"]')
    if card.count() == 0:
        # Leaflet 폴백은 Leaflet 팝업으로 뜬다
        card = page.locator(".leaflet-popup-content")
    check(card.count() >= 1, "핀을 누르면 요약 카드가 뜬다")
    card_text = re.sub(r"\s+", " ", card.first.inner_text()) if card.count() else ""
    print(f"       · 카드 내용: {card_text[:220]}")
    for label, name in [("감정", "감정가"), ("최저", "최저가"), ("매각", "매각기일")]:
        check(label in card_text, f"카드에 {name}가 있다")
    check("타경" in card_text, "카드에 사건번호가 있다")
    link = page.locator('[data-testid="auction-pin-card"] a[href*="courtauction.go.kr"], .leaflet-popup-content a[href*="courtauction.go.kr"]')
    check(link.count() >= 1, "카드에 대법원 사건조회 링크가 있다")
    if not fallback:
        z = page.evaluate("() => { const l = document.querySelector('[data-testid=\"auction-card-layer\"]'); return l ? getComputedStyle(l).zIndex : null; }")
        check(z == "103", f"카드 레이어가 구역 이름표(100) 위에 있다 (z-index {z})")
    page.screenshot(path=SHOT_CARD)
    print(f"       · 스크린샷 {SHOT_CARD}")

    print("[3] 쌍문동 507-1일원 — 같은 좌표 109호실은 한 핀")
    open_zone(page, SSANGMUN)
    texts = pin_texts(page)
    n = visible_pins(page)
    print(f"       · 보이는 경매 핀 {n}개 · {texts[:3]}")
    check(n == 1, f"109건이 핀 1개로 묶인다 (보이는 핀 {n}개)")
    check(any("물건 109건" in t for t in texts), "핀 둘째 줄이 `물건 109건`이다")

    print("[4] 광역(구역 미선택) — 토글 OFF 기본, 켜면 매칭된 경매 핀")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="auction-pins-toggle"]', timeout=40000)
    page.wait_for_timeout(2500)
    toggle = page.locator('[data-testid="auction-pins-toggle"]')
    check(toggle.get_attribute("aria-pressed") == "false", "광역에서는 처음에 꺼져 있다")
    wide_off = visible_pins(page)
    check(wide_off == 0, f"꺼져 있으면 경매 핀이 없다 (보이는 핀 {wide_off}개)")
    t_text = re.sub(r"\s+", " ", toggle.inner_text())
    print(f"       · 토글 문구 {t_text!r} (매칭된 전체 핀 수)")
    toggle.click()
    page.wait_for_timeout(1500)
    check(toggle.get_attribute("aria-pressed") == "true", "누르면 켜진다")
    wide_on = visible_pins(page)
    check(wide_on >= 5, f"광역에서도 경매 핀이 찍힌다 (보이는 핀 {wide_on}개)")
    page.screenshot(path=SHOT_WIDE)
    print(f"       · 스크린샷 {SHOT_WIDE}")

    print("[5] 기존 레이어 토글이 그대로 있다")
    for tid, name in [
        ("dev-pressure-toggle", "개발압력"),
        ("aging-toggle", "노후도"),
        ("jibun-pick-toggle", "지번 찍기"),
        ("tx-pin-layer", "실거래 핀 레이어"),
    ]:
        check(page.locator(f'[data-testid="{tid}"]').count() >= 1, f"{name}가 남아 있다")

    print("[6] 콘솔 오류")
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
