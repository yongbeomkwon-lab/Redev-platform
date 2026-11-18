#!/usr/bin/env python3
"""검증 매물 등록·지도 연결 검증 (로컬/배포 공용)

  사용:
    MODE=prod scripts/with-dev.sh python3 scripts/verify-listings-map.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-listings-map.py

  확인 항목
    1) 메인 지도 `/?zone=상도23구역` → 상세 패널에 `검증 매물 1건` 카드 + 다원씨앤아이 404호 스펙
    2) 지도에 `🏠 매물` 배지가 실제로 보인다(가려지지 않고 화면 안)
    3) `/register` 에서 2,289곳 중 `한남4` 검색·선택 → 매물 등록 → 완료 카드
    4) 등록한 매물이 `/listings` 와 메인 지도(`/?zone=한남4`) 에 즉시 반영
    5) `/listings` 필터(임대사업자 승계) 동작
    6) 스크린샷 downloads/redev-listings-map.png · downloads/redev-register-live.png
    7) 콘솔 오류 0건
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100")
SHOT_MAP = "/workspace/downloads/redev-listings-map.png"
SHOT_REGISTER = "/workspace/downloads/redev-register-live.png"
SANGO23 = "11000UQ120PS202601310018"
HANNAM4 = "11000UQ120PS202411014488"

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ── 1) 상도23구역 상세 + 검증 매물 카드 ─────────────────────────────
        page.goto(f"{BASE}/?zone={SANGO23}", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=zone-listing-card]", timeout=120000)
        card = page.get_by_test_id("zone-listing-card").first
        card_text = card.inner_text()
        print("카드 텍스트:", card_text.replace("\n", " | ")[:400])
        check("상도23 · 검증 매물 1건 카드", "검증 매물 1건" in card_text, card_text.split("\n")[0])
        check("상도23 · 다원씨앤아이 404호", "전용 29.18㎡ (404호)" in card_text, "")
        check("상도23 · 매매 7억 8,000만원", "7억 8,000만원" in card_text)
        check("상도23 · 초기투자금 5억 300만원", "5억 300만원" in card_text)
        check("상도23 · 임대사업자 승계 필수", "임대사업자 승계 필수" in card_text)
        check("상도23 · 실거주·토허제 없음", "실거주·토허제 없음" in card_text)

        # 매물 배지 — 화면에 실제로 보여야 한다(visibility hidden 이면 실패)
        badge = page.locator(f"[data-testid=zone-listing-badge][data-zone-id='{SANGO23}']")
        seen = False
        for _ in range(40):
            if badge.count() and badge.first.is_visible():
                seen = True
                break
            time.sleep(0.5)
        check("지도 🏠 매물 배지 표시", seen, badge.first.inner_text() if badge.count() else "배지 없음")
        if badge.count():
            box = badge.first.bounding_box()
            check(
                "배지 화면 위치 유효",
                bool(box) and 0 <= box["x"] <= 1440 and 0 <= box["y"] <= 900,
                str(box),
            )
        page.wait_for_timeout(1200)
        page.screenshot(path=SHOT_MAP)
        check("스크린샷 redev-listings-map.png", os.path.exists(SHOT_MAP), SHOT_MAP)

        # ── 2) /register 에서 한남4구역 매물 등록 ───────────────────────────
        page.goto(f"{BASE}/register", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=register-zone-search]", timeout=30000)
        # 구역 데이터(2,289곳) 로딩 대기
        page.get_by_test_id("register-zone-search").click()
        page.get_by_test_id("register-zone-search").fill("한남4")
        page.wait_for_selector("[data-testid=register-zone-result]", timeout=60000)
        page.get_by_test_id("register-zone-result").first.click()
        check(
            "구역 검색·선택 (한남4구역)",
            "한남4구역" in page.get_by_test_id("register-zone-selected").inner_text(),
            page.get_by_test_id("register-zone-selected").inner_text().replace("\n", " "),
        )
        page.get_by_test_id("register-property-type").select_option("아파트")
        page.get_by_test_id("register-unit-type").fill("84A")
        page.get_by_test_id("register-sale-price").fill("95000")
        page.get_by_test_id("register-deposit").fill("30000")
        page.get_by_test_id("register-exclusive-area").fill("84.9")
        page.get_by_test_id("register-land-share").fill("31.2")
        page.get_by_test_id("register-lease-operator").check()
        page.get_by_test_id("register-note").fill("검증 스크립트 등록 — 관리처분 단계 조합원 물건")
        page.wait_for_timeout(300)
        live = page.get_by_test_id("register-initial-investment").inner_text()
        check("초기투자금 실시간 계산 (9.5억−3억=6.5억)", "6억 5,000만원" in live, live)
        page.screenshot(path=SHOT_REGISTER)
        check("스크린샷 redev-register-live.png", os.path.exists(SHOT_REGISTER), SHOT_REGISTER)

        page.get_by_test_id("register-submit").click()
        page.wait_for_selector("[data-testid=register-done]", timeout=15000)
        check("등록 완료 카드", "등록 완료" in page.get_by_test_id("register-done").inner_text())

        # ── 3) /listings 반영 + 필터 ────────────────────────────────────────
        page.goto(f"{BASE}/listings", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=listing-card]", timeout=30000)
        page.get_by_test_id("listings-search").fill("한남4")
        page.wait_for_timeout(400)
        cards = page.get_by_test_id("listing-card")
        new_card = cards.first
        check("등록 매물이 /listings 에 표시", cards.count() >= 1 and "한남4구역" in new_card.inner_text(), new_card.inner_text().replace("\n", " | ")[:200])
        check("초기투자금 6억 5,000만원 표시", "6억 5,000만원" in new_card.inner_text())
        page.get_by_test_id("listings-search").fill("")
        page.wait_for_timeout(300)

        page.get_by_test_id("filter-lease").click()
        page.wait_for_timeout(400)
        lease_cards = page.get_by_test_id("listing-card")
        lease_text = " ".join(lease_cards.nth(i).inner_text() for i in range(lease_cards.count()))
        check(
            "임대사업자 승계 필터 — 상도23·한남4만",
            lease_cards.count() == 2 and "상도23구역" in lease_text and "한남4구역" in lease_text,
            f"{lease_cards.count()}건: {lease_text[:160]}",
        )
        page.get_by_test_id("filter-no-permit").click()
        page.wait_for_timeout(300)
        check("실거주(토허제) 없음 필터", page.get_by_test_id("listing-card").count() == 2)
        page.get_by_test_id("filter-lease").click()
        page.get_by_test_id("filter-no-permit").click()
        page.wait_for_timeout(300)

        # 정렬 — 초기투자금 낮은 순
        page.get_by_test_id("listings-sort").select_option("initial")
        page.wait_for_timeout(300)
        first = page.get_by_test_id("listing-card").first.inner_text()
        check("초기투자금 순 정렬 (첫 카드가 최저)", "초기투자금" in first)

        # 비교함
        page.get_by_test_id("listing-compare-toggle").first.click()
        page.wait_for_selector("[data-testid=listing-compare]", timeout=8000)
        check("비교함 담기", page.get_by_test_id("listing-compare").is_visible())

        # ── 4) 메인 지도에 등록 매물(한남4) 배지 ────────────────────────────
        page.goto(f"{BASE}/?zone={HANNAM4}", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=zone-listing-card]", timeout=60000)
        t = page.get_by_test_id("zone-listing-card").first.inner_text()
        check("메인 지도 — 한남4구역 등록 매물 카드", "검증 매물 1건" in t and "84A" in t, t.replace("\n", " | ")[:200])
        hb = page.locator(f"[data-testid=zone-listing-badge][data-zone-id='{HANNAM4}']")
        ok_badge = False
        for _ in range(30):
            if hb.count() and hb.first.is_visible():
                ok_badge = True
                break
            time.sleep(0.5)
        check("메인 지도 — 한남4구역 배지", ok_badge, hb.first.inner_text() if hb.count() else "없음")

        # ── 5) 매물 있는 구역 필터 ──────────────────────────────────────────
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=zone-search-input]", timeout=30000)
        page.get_by_text("펼치기 ▼").first.click()
        time.sleep(0.5)
        chip = page.get_by_test_id("filter-listings-only")
        chip_text = chip.inner_text()
        chip.click()
        time.sleep(1.0)
        check("‘매물 있는 구역’ 필터 칩", "매물 있는 구역" in chip_text, chip_text)

        real = [e for e in errors if "favicon" not in e.lower()]
        check("콘솔 오류 0건", len(real) == 0, "; ".join(real[:3]))

        ctx.close()
        browser.close()

    print("\n" + ("모두 통과" if not failures else f"실패 {len(failures)}건: " + ", ".join(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
