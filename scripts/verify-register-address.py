#!/usr/bin/env python3
"""매물 등록(/register) 주소 자동연동 + 표시·광고 명시사항 검증 (로컬/배포 공용)

  사용:
    TARGET_URL=http://localhost:3100 python3 scripts/verify-register-address.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-register-address.py

  확인 항목
    1) 주소 검색 → 구역 **자동 선택**(구역 안 주소) + 건축물대장 자동 채움(사용승인일·층수·대지면적·건물명)
    2) 구역 밖 주소 → '구역 밖' 안내 + 가까운 구역 후보
    3) 표시·광고 명시사항 입력 → 미리보기에 그대로 반영(거래형태·층/총층·방/욕실·방향·입주·주차·승인일·관리비·중개사무소)
    4) 등록 → 완료 카드(소재지·좌표 저장) → /listings 카드에 명시사항·중개사무소 법정 표시
    5) 테스트 매물은 검증 후 **삭제**(이 브라우저 + 공용 DB) — 깔끔히 정리
    6) 콘솔 오류 0건 + 스크린샷(downloads/)
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3100").rstrip("/")
SHOT_ADDR = "/workspace/downloads/redev-register-address.png"
SHOT_SPEC = "/workspace/downloads/redev-register-spec.png"
SHOT_CARD = "/workspace/downloads/redev-listing-card-spec.png"

# 구역 안 주소(서울 관악구 신림동 362-32 → 신림1구역) / 구역 밖 주소(강남파이낸스센터)
INSIDE_Q = "신림동 362-32"
OUTSIDE_Q = "테헤란로 152"
TEST_NOTE = "검증 스크립트 매물 — 주소 자동연동/표시광고 점검(삭제 예정)"
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def search_address(page, query: str) -> None:
    box = page.get_by_test_id("register-address-search")
    box.click()
    box.fill(query)
    page.wait_for_selector("[data-testid=register-address-result]", timeout=20000)


def pick_first_address(page) -> str:
    first = page.get_by_test_id("register-address-result").first
    label = first.inner_text()
    first.click()
    page.wait_for_selector("[data-testid=register-address-picked]", timeout=15000)
    return label


def wait_ledger(page, timeout=45000) -> str:
    """건축물대장 줄이 **끝난 상태**(표제부 채움 / 건너뜀)가 될 때까지 기다린다
    · 주소를 고른 직후에는 '주소를 고르면 …' 안내 그대로라, 그것을 끝으로 오해하지 않는다.
    """
    block = page.get_by_test_id("register-ledger-fill")
    deadline = time.time() + timeout / 1000
    text = ""
    while time.time() < deadline:
        text = block.inner_text()
        if "건축물대장 표제부" in text or "건너뜀" in text:
            return text
        page.wait_for_timeout(400)
    return text


def ensure_ledger(page, tries: int = 2) -> str:
    """대장 자동 채움을 읽는다 — 실패했으면 「다시 조회」로 한 번 더 눌러 본다
    (국토부 건축개발자 API 는 일시 장애(SERVICETIMEOUT)가 잦다)."""
    text = wait_ledger(page)
    for _ in range(tries):
        if "건축물대장 표제부" in text:
            return text
        retry = page.get_by_test_id("register-ledger-retry")
        if retry.count() == 0:
            break
        retry.click()
        text = wait_ledger(page)
    return text


# 국토부 쪽 사정으로 못 읽은 경우 — 코드 버그와 구분해 기록한다(실패로 세지 않고 경고만)
def external_ledger_reason(text: str) -> str | None:
    for token in ("한도", "일시 장애", "응답하지 않습니다", "응답을 읽지 못했습니다", "연결하지 못했습니다"):
        if token in text:
            return text.replace("\n", " | ")[:160]
    return None


def run() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))

        # ── 1) 구역 밖 주소 → 대장 자동 채움(강남파이낸스센터 — 대장이 확실한 필지) ─────
        page.goto(f"{BASE}/register", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=register-address-search]", timeout=30000)
        # 구역 데이터(2,394곳)가 준비될 때까지 — 자동 판정에 필요하다
        page.wait_for_timeout(2500)
        search_address(page, OUTSIDE_Q)
        label = pick_first_address(page)
        print("고른 주소:", label.replace("\n", " | "))
        auto = page.get_by_test_id("register-zone-auto").inner_text()
        check("구역 밖 주소 → '구역 밖' 안내", "구역 밖" in auto, auto.replace("\n", " | ")[:160])
        check("구역 밖 → 가까운 구역 후보", page.get_by_test_id("register-zone-candidate").count() >= 1, "")
        ledger_text = ensure_ledger(page)
        approval = page.get_by_test_id("register-approval-date").input_value()
        floors = page.get_by_test_id("register-total-floors").input_value()
        plat = page.get_by_test_id("register-plat-area").input_value()
        bname = page.get_by_test_id("register-building-name").input_value()
        filled_any = bool(approval or floors or plat or bname)
        reason = external_ledger_reason(ledger_text)
        if reason:
            print("WARN 국토부 건축물대장 응답 불가로 자동 채움 확인 생략 —", reason)
        else:
            check(
                "건축물대장 값이 폼에 채워짐",
                filled_any,
                f"승인 {approval!r} · 총층 {floors!r} · 대지 {plat!r} · 건물 {bname!r}",
            )
            check(
                "채운 항목 안내 문구",
                "폼에 채운 항목" in ledger_text or "덮어쓰지 않았습니다" in ledger_text,
                ledger_text.replace("\n", " | ")[:160],
            )
        addr_value = page.get_by_test_id("register-address").input_value()
        check("소재지(지번) 자동 입력", bool(addr_value.strip()), addr_value)
        page.screenshot(path=SHOT_ADDR, full_page=True)
        check("스크린샷 redev-register-address.png", os.path.exists(SHOT_ADDR), SHOT_ADDR)

        # ── 2) 구역 안 주소 → 구역 자동 선택 + 앞 필지 대장 값이 남지 않음 ─────
        before_floors = page.get_by_test_id("register-total-floors").input_value()
        before_name = page.get_by_test_id("register-building-name").input_value()
        search_address(page, INSIDE_Q)
        label2 = pick_first_address(page)
        print("고른 주소2:", label2.replace("\n", " | "))
        auto2 = page.get_by_test_id("register-zone-auto").inner_text()
        check("구역 안 주소 → 구역 자동 선택", "자동 선택" in auto2, auto2.replace("\n", " | ")[:160])
        check("구역 자동 선택 근거 문구", "경계 안" in auto2 or "지번 이름" in auto2, auto2.replace("\n", " | ")[:160])
        zone_sel = page.get_by_test_id("register-zone-selected").inner_text()
        check("자동 선택된 구역 표시", "신림1" in zone_sel, zone_sel.replace("\n", " | ")[:120])
        ledger2 = ensure_ledger(page)
        after_floors = page.get_by_test_id("register-total-floors").input_value()
        after_name = page.get_by_test_id("register-building-name").input_value()
        after_plat = page.get_by_test_id("register-plat-area").input_value()
        after_approve = page.get_by_test_id("register-approval-date").input_value()
        # 앞 필지(강남파이낸스센터, 45층 · 대지 13,156.7㎡)의 값이 남아 있으면 안 된다
        stale = (
            after_floors == before_floors
            and before_floors != ""
            and after_approve == approval
            and after_plat == plat
        )
        check(
            "주소 변경 시 앞 필지 대장 값이 남지 않음",
            not stale,
            f"앞 필지 층 {before_floors!r}/{before_name!r}/{plat!r} → 새 필지 층 {after_floors!r}/{after_name!r}/{after_plat!r}",
        )
        reason2 = external_ledger_reason(ledger2)
        if reason2:
            print("WARN 국토부 응답 불가로 새 필지 자동 채움 확인 생략 —", reason2)
            check("앞 필지 대지면적이 남지 않음", after_plat.strip() == "", repr(after_plat))
        else:
            check(
                "지금 필지 대장 값이 채워짐",
                "건축물대장 표제부" in ledger2,
                ledger2.replace("\n", " | ")[:180],
            )

        # ── 2-b) 주소를 되돌려도 구역·소재지가 따라 따라온다 ────────────────
        search_address(page, OUTSIDE_Q)
        pick_first_address(page)
        ensure_ledger(page)
        check("구역 밖으로 바꾸면 구역 선택 해제", page.get_by_test_id("register-zone-selected").count() == 0, "")
        search_address(page, INSIDE_Q)
        pick_first_address(page)
        ensure_ledger(page)
        zone_sel = page.get_by_test_id("register-zone-selected").inner_text()
        check("구역 안 주소로 되돌리면 구역 재선택", "신림1" in zone_sel, zone_sel.replace("\n", " | ")[:120])

        # ── 3) 표시·광고 명시사항 입력 + 미리보기 ────────────────────────────
        page.get_by_test_id("register-property-type").select_option("다세대/도시형")
        page.get_by_test_id("register-unit-type").fill("302호")
        page.get_by_test_id("register-sale-price").fill("62000")
        page.get_by_test_id("register-deposit").fill("21000")
        page.get_by_test_id("register-exclusive-area").fill("39.6")
        page.get_by_test_id("register-land-share").fill("18.3")
        page.get_by_test_id("register-floor").fill("3")
        if not page.get_by_test_id("register-total-floors").input_value():
            page.get_by_test_id("register-total-floors").fill("5")
        page.get_by_test_id("register-rooms").fill("2")
        page.get_by_test_id("register-baths").fill("1")
        page.get_by_test_id("register-direction").select_option("남동향")
        page.get_by_test_id("register-move-in-즉시입주").click()
        page.get_by_test_id("register-parking").fill("세대당 1대")
        page.get_by_test_id("register-maintenance-fee").fill("5만원 (수도·전기 별도)")
        page.get_by_test_id("register-note").fill(TEST_NOTE)
        page.wait_for_timeout(400)
        missing = page.get_by_test_id("register-spec-missing")
        missing_text = missing.inner_text() if missing.count() else ""
        check("명시사항 점검 — 채운 항목은 빠짐", "방향" not in missing_text, missing_text)
        preview = page.get_by_test_id("register-preview").inner_text()
        print("미리보기:", preview.replace("\n", " | ")[:400])
        for token, label in [
            ("남동향", "미리보기 · 방향"),
            ("방 2", "미리보기 · 방/욕실"),
            ("즉시입주", "미리보기 · 입주가능일"),
            ("세대당 1대", "미리보기 · 주차"),
            ("5만원", "미리보기 · 관리비"),
            ("제11680-2025-00292호", "미리보기 · 중개사무소 등록번호"),
            ("김성환", "미리보기 · 대표자"),
            ("권용범", "미리보기 · 소속공인중개사"),
        ]:
            check(label, token in preview)
        check("미리보기 · 소재지(지번)", "신림동" in preview, preview.replace("\n", " | ")[:120])
        page.screenshot(path=SHOT_SPEC, full_page=True)
        check("스크린샷 redev-register-spec.png", os.path.exists(SHOT_SPEC), SHOT_SPEC)

        # 번지 비공개 토글 — 카드에는 동까지만
        page.get_by_test_id("register-address-hidden").check()
        page.wait_for_timeout(200)
        hidden_preview = page.get_by_test_id("register-preview").inner_text()
        check("번지 비공개 → '번지 비공개' 표시", "번지 비공개" in hidden_preview, hidden_preview.replace("\n", " | ")[:120])
        page.get_by_test_id("register-address-hidden").uncheck()
        page.wait_for_timeout(200)

        # ── 4) 등록 ────────────────────────────────────────────────────────
        live = page.get_by_test_id("register-initial-investment").inner_text()
        check("초기투자금 실시간 계산 (6.2억−2.1억=4.1억)", "4억 1,000만원" in live, live)
        page.get_by_test_id("register-submit").click()
        page.wait_for_selector("[data-testid=register-done]", timeout=20000)
        done = page.get_by_test_id("register-done").inner_text()
        check("등록 완료 카드", "등록 완료" in done, done.replace("\n", " | ")[:200])
        check("완료 카드 · 소재지 저장", "신림동" in done, done.replace("\n", " | ")[:200])
        check("완료 카드 · 좌표 저장", bool(re.search(r"37\.\d{3,}", done)), done.replace("\n", " | ")[:220])
        page.wait_for_timeout(1500)
        done2 = page.get_by_test_id("register-done").inner_text()
        print("완료 카드:", done2.replace("\n", " | ")[:300])

        # ── 5) 매물 목록에 명시사항·중개사무소 표시 ──────────────────────────
        page.goto(f"{BASE}/listings", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=listing-card]", timeout=30000)
        page.get_by_test_id("listings-search").fill("302호")
        page.wait_for_timeout(600)
        cards = page.get_by_test_id("listing-card")
        card_text = ""
        target = None
        for i in range(cards.count()):
            txt = cards.nth(i).inner_text()
            if TEST_NOTE in txt:
                target = cards.nth(i)
                card_text = txt
                break
        check("등록 매물이 /listings 에 표시", target is not None, card_text.replace("\n", " | ")[:200])
        if target is not None:
            for token, label in [
                ("남동향", "목록 카드 · 방향"),
                ("방 2", "목록 카드 · 방/욕실"),
                ("즉시입주", "목록 카드 · 입주가능일"),
                ("세대당 1대", "목록 카드 · 주차"),
                ("5만원", "목록 카드 · 관리비"),
                ("신림동", "목록 카드 · 소재지"),
                ("제11680-2025-00292호", "목록 카드 · 중개사무소 등록번호"),
                ("대표 김성환", "목록 카드 · 대표자"),
            ]:
                check(label, token in card_text)
            target.screenshot(path=SHOT_CARD)
            check("스크린샷 redev-listing-card-spec.png", os.path.exists(SHOT_CARD), SHOT_CARD)

        # ── 6) 테스트 매물 정리(이 브라우저 + 공용 DB) ───────────────────────
        page.goto(f"{BASE}/register", wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=register-mine-item]", timeout=20000)
        items = page.get_by_test_id("register-mine-item")
        removed = 0
        for i in range(items.count()):
            item = items.nth(i)
            if TEST_NOTE[:20] in item.inner_text() or "302호" in item.inner_text():
                item.get_by_role("button", name="삭제").click()
                page.wait_for_timeout(1200)
                removed += 1
                break
        check("테스트 매물 삭제", removed == 1, f"삭제 {removed}건")
        page.wait_for_timeout(500)
        left = page.get_by_test_id("register-mine-item").count()
        print("남은 내 매물:", left)

        real = [
            e
            for e in errors
            if "favicon" not in e.lower()
            # 로컬 dev 에는 브이월드 키(VWORLD_API_KEY)가 없어 /api/parcel 이 503 을 돌려준다 —
            #   그 환경 차이만 빼고 본다(배포본에서는 0건이어야 한다).
            and not (e.startswith("Failed to load resource") and "503" in e)
        ]
        check("콘솔 오류 0건", len(real) == 0, "; ".join(real[:3]))

        ctx.close()
        browser.close()

    print("\n" + ("모두 통과" if not failures else f"실패 {len(failures)}건: " + ", ".join(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run())
