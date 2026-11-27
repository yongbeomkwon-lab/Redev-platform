#!/usr/bin/env python3
"""매물 등록(/register) — 부동산포스 양식 개편 + 주소 자동연동 + 표시·광고 명시사항 검증 (로컬/배포 공용)

  사용:
    TARGET_URL=http://localhost:3210 python3 scripts/verify-register-address.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-register-address.py

  확인 항목 (2026-11-27 개편판)
    0) 중개사무소 입력 섹션이 **없다**(프로필 자동) + ②~⑤ 섹션 순서(부동산포스 양식)
    1) 주소 검색 → 구역 **자동 선택**(구역 안 주소) + 건축물대장 자동 채움(사용승인일·층수·대지면적·건물명)
    2) 구역 밖 주소 → '구역 밖' 안내 + 가까운 구역 후보
    3) ② 거래·가격: 매매가·기보증금·기월세·융자금(3택) / ③ 재개발: 감정평가액→프리미엄, 불하금, 대지지분, 이주비
    4) ④ 건물: 공급/전용면적·층·방/욕실·방향·현관구조·난방·엘리베이터·주차·관리비·위반건축물
    5) ⑤ 특징(40자)·상세 설명 → 미리보기·/listings 카드에 그대로
    6) 등록 → 완료 카드 → 매물 목록 카드(프리미엄·융자금·상세 설명) → 테스트 매물 삭제
    7) 모바일 390px 레이아웃(가로 넘침 없음) + 스크린샷(downloads/)
    8) 콘솔 오류 0건
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3210").rstrip("/")
IS_LOCAL = "localhost" in BASE or "127.0.0.1" in BASE
SHOT_MAIN = "/workspace/downloads/redev-register-rfine.png"
SHOT_MOBILE = "/workspace/downloads/redev-register-rfine-mobile.png"
SHOT_CARD = "/workspace/downloads/redev-listing-card-rfine.png"

# 구역 안 주소(서울 관악구 신림동 362-32 → 신림1구역) / 구역 밖 주소(강남파이낸스센터)
INSIDE_Q = "신림동 362-32"
OUTSIDE_Q = "테헤란로 152"
TEST_NOTE = "검증 스크립트 매물 부동산포스 양식 점검 삭제 예정"
TEST_DETAIL = "테스트빌라 제3층 제302호"
TEST_DESC = (
    "테스트 물건 상세 설명입니다.\n"
    "초기투자금·프리미엄·융자금이 카드에 함께 보이는지 확인하는 문장입니다."
)
# 카카오 주소 검색이 이 실행 환경에서 막혔는지(사내망·프록시가 dapi.kakao.com 을 막는 경우).
#   · 막혔으면 주소 자동연동 검사는 WARN 으로 남기고, 폼 검사는 구역 검색으로 이어 간다.
ADDRESS_OK = True
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def search_address(page, query: str) -> None:
    """주소 검색 — 결과가 안 뜨면 카카오 SDK 가 이 환경에서 막힌 것으로 보고 예외를 올린다"""
    box = page.get_by_test_id("register-address-search")
    box.click()
    box.fill(query)
    try:
        page.wait_for_selector("[data-testid=register-address-result]", timeout=15000)
    except Exception:
        body = page.inner_text("body")
        if "주소 검색을 쓸 수 없습니다" in body:
            raise AddressUnavailable("카카오 주소 검색 SDK 를 불러오지 못했습니다") from None
        raise


class AddressUnavailable(Exception):
    """이 실행 환경에서 카카오 주소 검색이 막힌 경우 — 실패가 아니라 환경 제약으로 기록한다"""


def pick_zone_by_search(page, name: str) -> None:
    """주소 검색을 못 쓸 때 — 구역 검색으로 같은 검사를 이어 간다"""
    box = page.get_by_test_id("register-zone-search")
    box.click()
    box.fill(name)
    page.wait_for_selector("[data-testid=register-zone-result]", timeout=15000)
    page.get_by_test_id("register-zone-result").first.click()
    page.wait_for_timeout(300)


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
    for token in (
        "한도",
        "일시 장애",
        "응답하지 않습니다",
        "응답을 읽지 못했습니다",
        "연결하지 못했습니다",
        "없는 필지",  # 국토부가 일시 장애로 빈 결과를 주는 경우가 있다(2026-11-27 확인)
    ):
        if token in text:
            return text.replace("\n", " | ")[:160]
    return None


def wait_pnu(page, needle: str, timeout=20000) -> str:
    """필지 PNU 가 화면에 나타날 때까지 — /api/parcel 응답이 늦으면 앞 필지 PNU 가 잠깐 남아 있다"""
    block = page.get_by_test_id("register-address-picked")
    deadline = time.time() + timeout / 1000
    text = ""
    while time.time() < deadline:
        text = block.inner_text()
        if needle in text:
            return text
        page.wait_for_timeout(300)
    return text


def fill_trade_and_redev(page) -> None:
    """② 거래·가격 + ③ 재개발 항목 — 부동산포스 양식 값"""
    page.get_by_test_id("register-property-type").select_option("다세대/도시형")
    page.get_by_test_id("register-sale-price").fill("62000")
    page.get_by_test_id("register-deposit").fill("21000")
    page.get_by_test_id("register-tenant-rent").fill("40")
    # 융자금 3택 — 금액 입력
    page.get_by_test_id("register-mortgage-amount").click()
    page.get_by_test_id("register-mortgage-value").fill("12000")
    # ③ 재개발
    page.get_by_test_id("register-appraised").fill("50000")
    page.get_by_test_id("register-transfer-included").check()
    page.get_by_test_id("register-transfer-fee").fill("3000")
    page.get_by_test_id("register-land-share").fill("18.3")
    page.get_by_test_id("register-relocation-cost").fill("10000")
    page.get_by_test_id("register-lease-operator").check()
    page.get_by_test_id("register-land-permit").check()
    page.get_by_test_id("register-mark-verified").check()


def fill_building(page) -> None:
    """④ 건물·상세 정보"""
    page.get_by_test_id("register-supply-area").fill("49.5")
    page.get_by_test_id("register-exclusive-area").fill("39.6")
    page.get_by_test_id("register-floor").fill("3")
    if not page.get_by_test_id("register-total-floors").input_value():
        page.get_by_test_id("register-total-floors").fill("5")
    page.get_by_test_id("register-rooms").fill("2")
    page.get_by_test_id("register-baths").fill("1")
    page.get_by_test_id("register-direction").select_option("남동향")
    page.get_by_test_id("register-entrance-type").select_option("계단식")
    page.get_by_test_id("register-heating").select_option("개별난방")
    page.get_by_test_id("register-elevator").select_option("있음")
    page.get_by_test_id("register-parking").fill("총 8대 · 세대당 1대")
    page.get_by_test_id("register-maintenance-fee").fill("5만원 (수도·전기 별도)")
    page.get_by_test_id("register-violation").select_option("해당 없음")
    page.get_by_test_id("register-move-in-즉시입주").click()
    page.get_by_test_id("register-detail-address").fill(TEST_DETAIL)


def run_address_flow(page) -> None:
    """주소 자동연동 — 구역 밖 안내 · 대장 자동 채움 · 구역 안 자동 선택.
    카카오 SDK 가 막힌 환경에서는 AddressUnavailable 을 올려 호출측이 구역 검색으로 대체한다.
    """
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
    reason = external_ledger_reason(ledger_text)
    if reason:
        print("WARN 국토부 건축물대장 응답 불가로 자동 채움 확인 생략 —", reason)
    else:
        check(
            "건축물대장 값이 폼에 채워짐",
            bool(approval or floors or plat or bname),
            f"승인 {approval!r} · 총층 {floors!r} · 대지 {plat!r} · 건물 {bname!r}",
        )
        check(
            "채운 항목 안내 문구",
            "폼에 채운 항목" in ledger_text or "덮어쓰지 않았습니다" in ledger_text,
            ledger_text.replace("\n", " | ")[:160],
        )
    check("소재지(지번) 자동 입력", bool(page.get_by_test_id("register-address").input_value().strip()))
    pinned = wait_pnu(page, "116801010010737")
    check("PNU(지번 → 19자리) 계산", "116801010010737" in pinned, pinned.replace("\n", " | ")[-120:])

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
    pinned2 = wait_pnu(page, "1162010200103620032")
    check("신림동 362-32 PNU", "1162010200103620032" in pinned2, pinned2.replace("\n", " | ")[-120:])
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


def run_desktop(p, errors: list[str]) -> None:
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))

    # ── 0) 섹션 구성 — 중개사무소 입력 없음 + 부동산포스 순서 ─────────────────
    page.goto(f"{BASE}/register", wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid=register-address-search]", timeout=30000)
    # 구역 데이터(2,300여 곳)가 준비될 때까지 — 자동 판정에 필요하다
    page.wait_for_timeout(2500)
    check(
        "중개사무소 입력 섹션 삭제",
        page.get_by_test_id("register-broker-agency").count() == 0
        and page.get_by_test_id("register-broker-license").count() == 0,
        "",
    )
    body = page.inner_text("body")
    for token in ("① 매물 소재지", "② 거래·가격 정보", "③ 재개발 전용 항목", "④ 건물·상세 정보", "⑤ 매물 특징 · 상세 설명"):
        check(f"섹션 {token}", token in body)
    check("중개사무소 자동 표시 안내", "프로필" in body and "자동 표시" in body)
    check("④ 중개사무소 정보 없음", "④ 중개사무소" not in body)

    # ── 1) 구역 밖 주소 → 안내 + 대장 자동 채움 ──────────────────────────────
    # ── 2) 구역 안 주소 → 구역 자동 선택 + 앞 필지 값 정리 ───────────────────
    global ADDRESS_OK
    try:
        run_address_flow(page)
        ADDRESS_OK = True
    except AddressUnavailable as e:
        ADDRESS_OK = False
        print("WARN 주소 자동연동 검사 생략 —", e, "(이 환경이 dapi.kakao.com 을 막고 있습니다)")
        # 구역 검색으로 폼 검사를 이어 간다 — 나머지 항목은 주소와 무관하게 확인할 수 있다
        pick_zone_by_search(page, "신림1")
        page.get_by_test_id("register-address").fill("서울특별시 관악구 신림동 362-32")
        page.wait_for_timeout(300)
        check("구역 검색으로 구역 선택(주소 검색 대체)", "신림1" in page.get_by_test_id("register-zone-selected").inner_text())

    # ── 3) ② 거래·가격 + ③ 재개발 항목 ────────────────────────────────────────
    fill_trade_and_redev(page)
    page.wait_for_timeout(300)
    mortgage_mode = page.locator("[data-testid=register-mortgage-amount]").get_attribute("aria-pressed")
    check("융자금 3택 — 금액 선택", mortgage_mode == "true", str(mortgage_mode))
    live = page.get_by_test_id("register-initial-investment").inner_text()
    check("초기투자금 = 6.2억 − 2.1억 + 불하 0.3억 = 4.4억", "4억 4,000만원" in live, live)
    premium = page.get_by_test_id("register-premium").inner_text()
    check("프리미엄 자동 계산 = 1.2억", "1억 2,000만원" in premium, premium)

    # ── 4) ④ 건물·상세 정보 ─────────────────────────────────────────────────
    fill_building(page)
    page.wait_for_timeout(300)
    missing = page.get_by_test_id("register-spec-missing")
    missing_text = missing.inner_text() if missing.count() else ""
    check("명시사항 점검 — 채운 항목은 빠짐", "방향" not in missing_text and "위반건축물" not in missing_text, missing_text)

    # ── 5) ⑤ 특징(40자) · 상세 설명 ─────────────────────────────────────────
    note_box = page.get_by_test_id("register-note")
    note_box.fill("가" * 50)
    check("특징 40자 제한", len(note_box.input_value()) == 40, f"{len(note_box.input_value())}자")
    note_box.fill("명품 급급 " + TEST_NOTE)
    page.wait_for_timeout(200)
    banned = page.get_by_test_id("register-note-banned").inner_text()
    check("금지문구 경고", "명품" in banned and "급급" in banned, banned)
    note_box.fill(TEST_NOTE)
    page.wait_for_timeout(200)
    check("특징 글자수 표시", f"{len(TEST_NOTE)}/40" in page.get_by_test_id("register-note-count").inner_text(), "")
    page.get_by_test_id("register-description").fill(TEST_DESC)
    page.wait_for_timeout(300)
    check(
        "상세 설명 글자수 표시",
        f"{len(TEST_DESC)}/1000" in page.get_by_test_id("register-description-count").inner_text(),
        page.get_by_test_id("register-description-count").inner_text(),
    )

    # ── 6) 미리보기 — 카드에 그대로 ─────────────────────────────────────────
    preview = page.get_by_test_id("register-preview").inner_text()
    print("미리보기:", preview.replace("\n", " | ")[:700])
    for token, label in [
        ("남동향", "미리보기 · 방향"),
        ("방 2", "미리보기 · 방/욕실"),
        ("즉시입주", "미리보기 · 입주가능일"),
        ("세대당 1대", "미리보기 · 주차"),
        ("5만원", "미리보기 · 관리비"),
        ("위반건축물 없음", "미리보기 · 위반건축물"),
        ("공급 49.5㎡", "미리보기 · 공급면적"),
        ("계단식", "미리보기 · 현관구조"),
        ("개별난방", "미리보기 · 난방방식"),
        ("엘리베이터 있음", "미리보기 · 엘리베이터"),
        ("융자금 1억 2,000만원", "미리보기 · 융자금"),
        ("기월세 40만원", "미리보기 · 기월세"),
        ("이주비 1억 (무이자)", "미리보기 · 이주비"),
        ("프리미엄 1억 2,000만원", "미리보기 · 프리미엄"),
        ("제11680-2025-00292호", "미리보기 · 중개사무소 등록번호(자동)"),
        ("김성환", "미리보기 · 대표자(자동)"),
        ("권용범", "미리보기 · 소속공인중개사(자동)"),
    ]:
        check(label, token in preview)
    check("미리보기 · 소재지(지번)", "신림동" in preview, preview.replace("\n", " | ")[:120])
    check("미리보기 · 상세 설명 접힘", "상세 설명 보기" in preview)
    page.get_by_test_id("register-preview").locator("summary").first.click()
    page.wait_for_timeout(200)
    check("미리보기 · 상세 설명 펼침", "초기투자금·프리미엄" in page.get_by_test_id("register-preview").inner_text())

    # 번지 비공개 토글 — 카드에는 동까지만
    page.get_by_test_id("register-address-hidden").check()
    page.wait_for_timeout(200)
    hidden_preview = page.get_by_test_id("register-preview").inner_text()
    check("번지 비공개 → '번지 비공개' 표시", "번지 비공개" in hidden_preview, hidden_preview.replace("\n", " | ")[:120])
    page.get_by_test_id("register-address-hidden").uncheck()
    page.wait_for_timeout(200)

    # 데스크톱 전체 화면 스크린샷(등록 전 상태)
    page.screenshot(path=SHOT_MAIN, full_page=True)
    check("스크린샷 redev-register-rfine.png", os.path.exists(SHOT_MAIN), SHOT_MAIN)

    # ── 7) 등록 ─────────────────────────────────────────────────────────────
    page.get_by_test_id("register-submit").click()
    page.wait_for_selector("[data-testid=register-done]", timeout=25000)
    done = page.get_by_test_id("register-done").inner_text()
    check("등록 완료 카드", "등록 완료" in done, done.replace("\n", " | ")[:200])
    check("완료 카드 · 소재지 저장", "신림동" in done, done.replace("\n", " | ")[:200])
    if ADDRESS_OK:
        check("완료 카드 · 좌표 저장", bool(re.search(r"37\.\d{3,}", done)), done.replace("\n", " | ")[:220])
    else:
        print("WARN 주소 검색을 못 쓴 환경이라 좌표 저장은 확인하지 않았습니다(구역 검색으로 등록)")
    page.wait_for_timeout(1800)
    done2 = page.get_by_test_id("register-done").inner_text()
    print("완료 카드:", done2.replace("\n", " | ")[:300])
    if IS_LOCAL:
        print("WARN 로컬 dev — Supabase 환경변수가 없어 DB 공유 여부는 확인하지 않습니다(브라우저 저장만)")
    else:
        check("완료 카드 · 공용 DB 공유", "DB 저장 — 모든 방문자에게 공유" in done2, done2.replace("\n", " | ")[:200])

    # ── 8) 매물 목록 카드 — 프리미엄·융자금·상세 설명 ─────────────────────────
    page.goto(f"{BASE}/listings", wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid=listing-card]", timeout=30000)
    page.get_by_test_id("listings-search").fill("검증스크립트매물")
    page.wait_for_timeout(800)
    cards = page.get_by_test_id("listing-card")
    target = None
    card_text = ""
    for i in range(cards.count()):
        txt = cards.nth(i).inner_text()
        if TEST_NOTE in txt:
            target = cards.nth(i)
            card_text = txt
            break
    check("등록 매물이 /listings 에 표시", target is not None, card_text.replace("\n", " | ")[:240])
    print("목록 카드:", card_text.replace("\n", " | ")[:700])
    if target is not None:
        for token, label in [
            ("남동향", "목록 카드 · 방향"),
            ("방 2", "목록 카드 · 방/욕실"),
            ("즉시입주", "목록 카드 · 입주가능일"),
            ("세대당 1대", "목록 카드 · 주차"),
            ("5만원", "목록 카드 · 관리비"),
            ("신림동", "목록 카드 · 소재지"),
            ("프리미엄 1억 2,000만원", "목록 카드 · 프리미엄"),
            ("융자금 1억 2,000만원", "목록 카드 · 융자금"),
            ("공급 49.5㎡", "목록 카드 · 공급면적"),
            ("위반건축물 없음", "목록 카드 · 위반건축물"),
            ("제11680-2025-00292호", "목록 카드 · 중개사무소 등록번호"),
            ("대표 김성환", "목록 카드 · 대표자"),
            ("302호", "목록 카드 · 상세주소(타입 자리)"),
        ]:
            check(label, token in card_text)
        target.get_by_text("상세 설명 보기").first.click()
        page.wait_for_timeout(200)
        check("목록 카드 · 상세 설명 펼침", "초기투자금·프리미엄" in target.inner_text())
        target.screenshot(path=SHOT_CARD)
        check("스크린샷 redev-listing-card-rfine.png", os.path.exists(SHOT_CARD), SHOT_CARD)

    # ── 9) 테스트 매물 정리(이 브라우저 + 공용 DB) ───────────────────────────
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
    print("남은 내 매물:", page.get_by_test_id("register-mine-item").count())

    ctx.close()
    browser.close()


def run_mobile(p, errors: list[str]) -> None:
    """모바일 390×844 — 부동산포스 양식이 한 화면 폭에서 넘치지 않는지 확인"""
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        locale="ko-KR",
        is_mobile=True,
        has_touch=True,
        device_scale_factor=2,
    )
    page = ctx.new_page()
    page.on("console", lambda m: errors.append("mobile: " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("mobile pageerror: " + str(e)[:200]))
    page.goto(f"{BASE}/register", wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid=register-address-search]", timeout=30000)
    page.wait_for_timeout(1500)

    width = page.evaluate("() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth })")
    check(
        "모바일 390px 가로 넘침 없음",
        width["doc"] <= width["win"] + 1,
        f"docW={width['doc']} winW={width['win']}",
    )
    for token in ("① 매물 소재지", "② 거래·가격 정보", "③ 재개발 전용 항목", "④ 건물·상세 정보", "⑤ 매물 특징 · 상세 설명"):
        check(f"모바일 · {token}", page.get_by_text(token, exact=True).count() >= 1)
    check("모바일 · 중개사무소 입력 없음", page.get_by_test_id("register-broker-agency").count() == 0)
    page.screenshot(path=SHOT_MOBILE, full_page=True)
    check("스크린샷 redev-register-rfine-mobile.png", os.path.exists(SHOT_MOBILE), SHOT_MOBILE)
    ctx.close()
    browser.close()


def run() -> int:
    with sync_playwright() as p:
        errors: list[str] = []
        run_desktop(p, errors)
        run_mobile(p, errors)

        real = [
            e
            for e in errors
            if "favicon" not in e.lower()
            # 로컬 dev 에는 브이월드 키(VWORLD_API_KEY)가 없어 /api/parcel 이 503,
            # 국토부 건축물대장이 일시 장애면 /api/building-info 가 5xx 를 돌려준다 —
            #   그 환경·외부 사정만 빼고 본다(자바스크립트 오류는 그대로 잡는다).
            and not (e.startswith("Failed to load resource") and re.search(r"status of [45]\d\d", e))
            and not (e.startswith("mobile: Failed to load resource") and re.search(r"status of [45]\d\d", e))
            # 카카오맵 SDK — 이 실행 환경(사내망·프록시)이 dapi.kakao.com 을 막으면 SDK 스크립트가
            #   ORB/CORS 로 실패한다. 사용자 브라우저에서 생기는 문제가 아니므로 환경 경고로만 남긴다.
            and "dapi.kakao.com" not in e
            and "kakao" not in e.lower()
            and not (not ADDRESS_OK and "Failed to load resource" in e)
        ]
        if not ADDRESS_OK:
            print("WARN 주소 자동연동은 이 환경에서 확인하지 못했습니다 — 카카오 SDK 차단")
        else:
            print("주소 자동연동 — 확인 완료")
        resource_5xx = [e for e in errors if "Failed to load resource" in e and re.search(r"status of [45]\d\d", e)]
        if resource_5xx:
            print("WARN 외부 API 환경으로 5xx/4xx 응답", len(resource_5xx), "건 —", resource_5xx[0][:90])
        check("콘솔 오류 0건", len(real) == 0, "; ".join(real[:3]))

    print("\n" + ("모두 통과" if not failures else f"실패 {len(failures)}건: " + ", ".join(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run())
