#!/usr/bin/env python3
"""「내 매물만 보기」 검증 — 로컬/배포 공용

  사용:
    TARGET_URL=http://localhost:3100 python3 scripts/verify-my-listings.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-my-listings.py

  확인 항목
    1) 지도 상단 토글 `🏠 내 매물만 보기 (63)` 이 보인다
    2) 켜면 내 매물 핀이 지도에 찍히고(겹쳐도 숨기지 않음), 정비구역은 내 매물이 있는 곳만 남는다
    3) 핀을 누르면 카드(주소·가격·면적·특징·부동산포스 매물번호·연락처)와 [구역 열기]가 뜬다
    4) 끄면 핀이 사라지고 서울 전체 지도로 돌아온다
    5) /listings 「내 매물만 보기」 칩 → 63건 카드
    6) 선택 구역 이름표에 사업유형·단계 뱃지(신속통합기획 · 연번동의)가 보인다 — ?zone=방배16
    7) 콘솔 오류 0건
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
SHOT = os.environ.get("SHOT_PATH", "/workspace/downloads/redev-my-listings-map.png")
SHOT_PIN = "/workspace/downloads/redev-my-listing-pin-card.png"
BANGBAE16 = "gangnam4gu-bangbae-16"
MY_TOTAL = 63

failures: list[str] = []
errors: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


def visible_pins(page) -> int:
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid="my-listing-pin"]'))
             .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0
               && (el.closest('[style*="visibility"]')?.style.visibility !== 'hidden'))
             .length"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    print(f"[1] 메인 지도 — {BASE}")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="my-listings-toggle"]', timeout=30000)
    page.wait_for_timeout(2500)

    toggle = page.locator('[data-testid="my-listings-toggle"]')
    check(toggle.count() == 1, "「내 매물만 보기」 토글이 지도 위에 있다")
    check(f"({MY_TOTAL})" in (toggle.inner_text() or ""), f"토글에 내 매물 {MY_TOTAL}건이 병기된다")
    check(toggle.get_attribute("aria-pressed") == "false", "처음에는 꺼져 있다(서울 전체 지도)")

    print("[2] 토글 ON — 내 매물 핀")
    toggle.click()
    page.wait_for_timeout(2200)
    check(toggle.get_attribute("aria-pressed") == "true", "토글이 켜졌다")
    pins = visible_pins(page)
    check(pins >= 50, f"지도에 내 매물 핀이 찍힌다 (보이는 핀 {pins}개 / {MY_TOTAL})")
    badges = page.evaluate("() => document.querySelectorAll('[data-testid=zone-listing-badge]').length")
    lv = page.evaluate("() => { const l = document.querySelector('[data-testid=my-pin-layer]'); return { level: l?.dataset.level, compact: l?.dataset.compact, dots: document.querySelectorAll('.my-pin-btn[data-dot=\\'1\\']').length }; }")
    print(f"       · 매물 배지 {badges}개 · 지도 레벨 {lv}")
    page.screenshot(path=SHOT)
    print(f"       · 스크린샷 {SHOT}")

    print("[3] 핀 → 매물 카드")
    zone_pin = page.locator('[data-testid="my-listing-pin"][data-rfine-no="10987542"]')
    check(zone_pin.count() == 1, "상도23구역 매물 핀(10987542)이 있다")
    # 핀이 서로 겹칠 수 있어 그 요소에 직접 클릭을 보낸다(지도 위 최상단 요소에 뺏기지 않게)
    zone_pin.evaluate("el => el.click()")
    page.wait_for_selector('[data-testid="my-pin-card"]', timeout=5000)
    card = page.locator('[data-testid="my-pin-card"]').inner_text()
    for needle in ["매매가 7억 4,000만원", "10987542", "010-2758-5292", "상도23구역"]:
        check(needle in card, f"카드에 '{needle}' 가 보인다")
    check(page.locator('[data-testid="my-pin-zone-open"]').count() == 1, "카드에 [구역 열기] 버튼이 있다")
    page.screenshot(path=SHOT_PIN)
    page.locator('[data-testid="my-pin-zone-open"]').evaluate("el => el.click()")
    page.wait_for_timeout(2000)
    panel = page.locator("aside").first.inner_text()
    check("상도23구역" in panel, "카드의 [구역 열기]가 상도23구역 상세를 연다")

    print("[4] 토글 OFF — 원래 지도로 복귀")
    page.locator('[data-testid="my-listings-toggle"]').click()
    page.wait_for_timeout(1800)
    check(page.locator('[data-testid="my-listings-toggle"]').get_attribute("aria-pressed") == "false", "토글이 꺼졌다")
    left = visible_pins(page)
    check(left == 0, f"내 매물 핀이 모두 사라졌다 (남은 핀 {left}개)")

    print("[5] /listings — 내 매물만 보기 칩")
    page.goto(f"{BASE}/listings", wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="filter-my-only"]', timeout=20000)
    page.wait_for_timeout(1200)
    chip = page.locator('[data-testid="filter-my-only"]')
    check(str(MY_TOTAL) in chip.inner_text(), f"칩에 {MY_TOTAL}건이 병기된다")
    chip.click()
    page.wait_for_timeout(800)
    cards = page.locator('[data-testid="listing-card"]').count()
    check(cards == MY_TOTAL, f"내 매물 {MY_TOTAL}건이 카드로 보인다 (실제 {cards}건)")
    mine_badges = page.evaluate("() => Array.from(document.querySelectorAll('[data-testid=listing-card]')).filter(e => e.innerText.includes('내 매물')).length")
    check(mine_badges == cards, f"모든 카드에 ‘내 매물’ 표시가 있다 ({mine_badges}건)")

    print("[6] /?my= 딥링크 — 매물 목록에서 [지도에서 보기])")
    page.goto(f"{BASE}/?my=rfine-10987542", wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    check(
        page.locator('[data-testid="my-listings-toggle"]').get_attribute("aria-pressed") == "true",
        "딥링크로 들어오면 「내 매물만 보기」가 켜진다",
    )
    card2 = page.locator('[data-testid="my-pin-card"]').first
    check(card2.count() == 1, "그 매물 카드가 지도에 펼쳐진다")
    check("10987542" in (card2.inner_text() if card2.count() else ""), "카드에 매물번호가 보인다")

    print("[7] 선택 구역 이름표 뱃지 — 방배16구역")
    page.goto(f"{BASE}/?zone={BANGBAE16}", wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    label = page.evaluate("() => document.querySelector('.zone-name-label')?.innerText || ''")
    check("신속통합기획" in label, f"이름표에 사업유형 ‘신속통합기획’ 이 보인다 — '{label}'")
    check("연번동의" in label, f"이름표에 단계 ‘연번동의’ 가 보인다 — '{label}'")
    check("방배16구역" in label, "이름표에 구역명이 보인다")
    page.screenshot(path="/workspace/downloads/redev-zone-label-badge.png")

    print(f"[8] 콘솔 오류 {len(errors)}건")
    for e in errors[:5]:
        print("   ·", e)
    if errors:
        failures.append(f"콘솔 오류 {len(errors)}건")

    browser.close()

print()
if failures:
    print("실패:", len(failures))
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("모든 항목 통과")
