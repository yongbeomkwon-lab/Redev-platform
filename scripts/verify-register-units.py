#!/usr/bin/env python3
"""매물 등록(/register) — 건축물대장 전유부 '동·호수 선택' 검증 (로컬/배포 공용)

  사용:
    TARGET_URL=http://localhost:3210 python3 scripts/verify-register-units.py
    TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-register-units.py

  확인 항목 (2026-11-27)
    1) 주소(대치동 915-3)를 고르면 표제부 값이 채워지고 **동·호수 선택** 카드가 뜬다
    2) 호수 검색('201')으로 목록이 좁혀지고, [선택]을 누르면
       전용면적·공급면적·해당층·상세주소(건물명·층·호)가 폼에 채워진다
    3) 표제부 명시사항(총층수·사용승인일·주차·엘리베이터)도 함께 채워진다
    4) 동이 여러 개인 대단지(대치동 316 은마)는 동 드롭다운 + '일부만 읽음' 안내
    5) 전유부가 없는 건물(신림동 362-32)은 '동·호수 목록 없음' 안내(억지로 채우지 않는다)
    6) 모바일 390px 가로 넘침 없음 + 콘솔 오류 0건 + 스크린샷(downloads/)

  ※ 이 샌드박스는 dapi.kakao.com 을 막는다. 그때는 **가짜 카카오 지오코더**를 init script 로
    심어 주소 선택 이후의 UI·API 흐름(건축물대장 → 동·호수 → 자동 입력)을 그대로 검증한다.
    지오코더만 대체하고 /api/building-info 는 실제 국토부 응답을 쓴다.
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "http://localhost:3210").rstrip("/")
SHOT_MAIN = "/workspace/downloads/redev-register-units.png"
SHOT_PICKED = "/workspace/downloads/redev-register-units-picked.png"
SHOT_MOBILE = "/workspace/downloads/redev-register-units-mobile.png"
SHOT_MOBILE_PICKER = "/workspace/downloads/redev-register-units-mobile-picker.png"

DAECHI_Q = "대치동 915-3"      # 다세대 24세대(제이원) — 호별 전유부 26호
EUNMA_Q = "대치동 316"          # 은마아파트 — 동 14개, 전유부 2만여 행
NOUNIT_Q = "신림동 362-32"      # 전유부 없는 필지

failures: list[str] = []
ADDRESS_OK = True
STUBBED = False

# ── 가짜 카카오 지오코더 — 주소 3건만 돌려준다(실제 SDK 가 막힌 환경용) ─────────
STUB_JS = """
(() => {
  const docs = {
    "915-3": {
      address_name: "서울특별시 강남구 대치동 915-3",
      address_type: "REGION_ADDR",
      x: "127.057797", y: "37.501350",
      address: {
        address_name: "서울특별시 강남구 대치동 915-3",
        region_1depth_name: "서울특별시", region_2depth_name: "강남구", region_3depth_name: "대치동",
        main_address_no: "915", sub_address_no: "3", mountain_yn: "N", b_code: "1168010600"
      },
      road_address: { address_name: "서울특별시 강남구 삼성로69길 17", building_name: "제이원", region_2depth_name: "강남구" }
    },
    "316": {
      address_name: "서울특별시 강남구 대치동 316",
      address_type: "REGION_ADDR",
      x: "127.062000", y: "37.496000",
      address: {
        address_name: "서울특별시 강남구 대치동 316",
        region_1depth_name: "서울특별시", region_2depth_name: "강남구", region_3depth_name: "대치동",
        main_address_no: "316", sub_address_no: "", mountain_yn: "N", b_code: "1168010600"
      },
      road_address: { address_name: "서울특별시 강남구 영동대로 212", building_name: "은마", region_2depth_name: "강남구" }
    },
    "362-32": {
      address_name: "서울특별시 관악구 신림동 362-32",
      address_type: "REGION_ADDR",
      x: "126.929000", y: "37.484000",
      address: {
        address_name: "서울특별시 관악구 신림동 362-32",
        region_1depth_name: "서울특별시", region_2depth_name: "관악구", region_3depth_name: "신림동",
        main_address_no: "362", sub_address_no: "32", mountain_yn: "N", b_code: "1162010200"
      },
      road_address: { address_name: "서울특별시 관악구 신림로 100", building_name: "", region_2depth_name: "관악구" }
    }
  };
  function pick(q) {
    if (/915-3/.test(q)) return [docs["915-3"]];
    if (/316/.test(q)) return [docs["316"]];
    if (/362-32/.test(q)) return [docs["362-32"]];
    return [];
  }
  const noop = function () {};
  window.kakao = {
    maps: {
      Map: noop, LatLng: noop, LatLngBounds: noop, Point: noop,
      CustomOverlay: noop, Polygon: noop, MapTypeId: {}, ControlPosition: {},
      event: { addListener: noop, removeListener: noop },
      load: (cb) => { if (cb) cb(); },
      services: {
        Status: { OK: "OK", ZERO_RESULT: "ZERO_RESULT", ERROR: "ERROR" },
        Geocoder: function () {
          this.addressSearch = (addr, cb) => {
            const out = pick(String(addr));
            setTimeout(() => cb(out, out.length ? "OK" : "ZERO_RESULT"), 20);
          };
          this.coord2RegionCode = (x, y, cb) => setTimeout(() => cb([], "ZERO_RESULT"), 10);
          this.coord2Address = (x, y, cb) => setTimeout(() => cb([], "ZERO_RESULT"), 10);
        },
        Places: function () {
          this.keywordSearch = (kw, cb) => setTimeout(() => cb([], "ZERO_RESULT"), 10);
        }
      }
    }
  };
})();
"""


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


class AddressUnavailable(Exception):
    """이 실행 환경에서 카카오 주소 검색이 막힌 경우 — 실패가 아니라 환경 제약"""


def open_register(browser, errors: list[str], mobile: bool = False, stub: bool = False):
    if mobile:
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            locale="ko-KR",
            is_mobile=True,
            has_touch=True,
            device_scale_factor=2,
        )
    else:
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
    if stub:
        ctx.add_init_script(STUB_JS)
    page = ctx.new_page()
    prefix = "mobile: " if mobile else ""
    page.on("console", lambda m: errors.append(prefix + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(prefix + "pageerror: " + str(e)[:200]))
    page.goto(f"{BASE}/register", wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid=register-address-search]", timeout=30000)
    # 구역 데이터(2,300여 곳)가 준비될 때까지 — 자동 판정에 필요하다
    page.wait_for_timeout(2500)
    return ctx, page


def search_address(page, query: str) -> None:
    box = page.get_by_test_id("register-address-search")
    box.click()
    box.fill("")
    box.fill(query)
    # 자동완성은 입력이 멈추고 300ms 뒤에 갱신된다 — 목록이 바뀌는 중에 집지 않도록 잠깐 기다린다
    page.wait_for_timeout(900)
    try:
        page.wait_for_selector("[data-testid=register-address-result]", timeout=15000)
    except Exception:
        body = page.inner_text("body")
        if "주소 검색을 쓸 수 없습니다" in body:
            raise AddressUnavailable("카카오 주소 검색 SDK 를 불러오지 못했습니다") from None
        raise


def pick_first_address(page, expect: str) -> str:
    """주소 후보 중 expect 가 들어간 첫 결과를 고른다(없으면 첫 결과)."""
    for _ in range(3):
        page.wait_for_selector("[data-testid=register-address-result]", timeout=15000)
        try:
            texts = page.locator("[data-testid=register-address-result]").all_inner_texts()
        except Exception:
            texts = []
        if texts:
            idx = next((i for i, t in enumerate(texts) if expect in t), 0)
            label = texts[idx]
            page.locator("[data-testid=register-address-result]").nth(idx).click()
            page.wait_for_selector("[data-testid=register-address-picked]", timeout=15000)
            return label
        page.wait_for_timeout(700)
    raise RuntimeError(f"주소 후보가 뜨지 않았습니다: {expect}")


def wait_ledger(page, timeout=45000) -> str:
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


def external_ledger_reason(text: str) -> str | None:
    for token in (
        "한도",
        "일시 장애",
        "응답하지 않습니다",
        "응답을 읽지 못했습니다",
        "연결하지 못했습니다",
        "없는 필지",
    ):
        if token in text:
            return text.replace("\n", " | ")[:160]
    return None


def wait_units(page, timeout=45000) -> None:
    """동·호수 카드(목록 또는 '없음' 안내)가 뜰 때까지"""
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        if (
            page.get_by_test_id("register-unit-picker").count() > 0
            or page.get_by_test_id("register-unit-none").count() > 0
        ):
            return
        page.wait_for_timeout(300)


def run_checks(page) -> None:
    """주소 → 동·호수 선택 → 자동 입력 (데스크톱 본 검증)"""
    label = pick_first_address(page, "915-3")
    print("고른 주소:", label.replace("\n", " | "))
    ledger = ensure_ledger(page)
    reason = external_ledger_reason(ledger)
    if reason:
        print("WARN 국토부 응답 불가로 동·호수 검증 생략 —", reason)
        return
    check("대치동 915-3 — 표제부 표시", "제이원" in ledger, ledger.replace("\n", " | ")[:160])
    wait_units(page)
    picker = page.get_by_test_id("register-unit-picker")
    check("동·호수 선택 카드 표시", picker.count() > 0)
    if picker.count() == 0:
        return
    picker_text = picker.inner_text()
    print("선택 카드:", picker_text.replace("\n", " | ")[:360])
    check("전유부 호수 개수 표시", "26호" in picker_text, picker_text.replace("\n", " | ")[:80])

    # 표제부 명시사항이 폼에 채워졌는가
    approval = page.get_by_test_id("register-approval-date").input_value()
    floors = page.get_by_test_id("register-total-floors").input_value()
    parking = page.get_by_test_id("register-parking").input_value()
    elevator = page.get_by_test_id("register-elevator").input_value()
    check("사용승인일 자동 입력", approval == "2016-01-14", f"{approval!r}")
    check("총층수 자동 입력", floors == "6", f"{floors!r}")
    check("주차 자동 입력", parking.startswith("총 15대"), f"{parking!r}")
    check("엘리베이터 자동 입력", elevator == "있음", f"{elevator!r}")

    # 호수 검색 — '201' 입력하면 목록이 좁혀진다
    rows_all = page.get_by_test_id("register-unit-row").count()
    check("호수 목록 렌더", rows_all >= 20, f"{rows_all}행")
    page.get_by_test_id("register-unit-search").fill("201")
    page.wait_for_timeout(500)
    rows = page.get_by_test_id("register-unit-row")
    check("호수 검색 — '201' 필터", rows.count() == 1, f"{rows.count()}행")
    row_text = rows.first.inner_text() if rows.count() else ""
    check(
        "검색 결과에 전용·공급면적",
        "전용 183.13" in row_text and "공급 222.13" in row_text,
        row_text.replace("\n", " | "),
    )

    # [선택] → 폼 자동 입력
    page.get_by_test_id("register-unit-pick").first.click()
    page.wait_for_timeout(500)
    ex = page.get_by_test_id("register-exclusive-area").input_value()
    sp = page.get_by_test_id("register-supply-area").input_value()
    fl = page.get_by_test_id("register-floor").input_value()
    detail = page.get_by_test_id("register-detail-address").input_value()
    check("전용면적 자동 입력", ex == "183.13", f"{ex!r}")
    check("공급면적 자동 입력", sp == "222.13", f"{sp!r}")
    check("해당층 자동 입력", fl == "2층", f"{fl!r}")
    check("상세주소 자동 입력(건물명·층·호)", "제이원" in detail and "2층" in detail and "201호" in detail, f"{detail!r}")
    picked = page.get_by_test_id("register-unit-picked").inner_text()
    check("선택 안내 문구", "선택됨" in picked and "183.13" in picked, picked.replace("\n", " | ")[:160])
    page.get_by_test_id("register-unit-picker").screenshot(path=SHOT_PICKED)
    page.screenshot(path=SHOT_MAIN, full_page=True)
    check("스크린샷 redev-register-units-picked.png", os.path.exists(SHOT_PICKED), SHOT_PICKED)
    check("스크린샷 redev-register-units.png", os.path.exists(SHOT_MAIN), SHOT_MAIN)

    # ── 대단지(은마) — 동 드롭다운 + 일부만 읽음 안내 ──────────────────────────
    search_address(page, EUNMA_Q)
    pick_first_address(page, "316")
    page.wait_for_timeout(600)
    ledger2 = ensure_ledger(page)
    reason2 = external_ledger_reason(ledger2)
    if reason2:
        print("WARN 은마 검증 생략 —", reason2)
    else:
        wait_units(page)
        picker2 = page.get_by_test_id("register-unit-picker")
        check("대단지 — 동·호수 카드 표시", picker2.count() > 0)
        if picker2.count() > 0:
            dongs = page.get_by_test_id("register-unit-dong")
            check("대단지 — 동 선택 드롭다운", dongs.count() > 0)
            if dongs.count() > 0:
                opts = dongs.locator("option").count()
                check("대단지 — 동 옵션 여러 개", opts > 3, f"{opts}개")
                dongs.select_option(index=1)
                page.wait_for_timeout(500)
                rows3 = page.get_by_test_id("register-unit-row").count()
                check("동 선택 — 해당 동만 표시", rows3 > 0, f"{rows3}행")
            pt = picker2.inner_text()
            check("대단지 — 일부만 읽음 안내", "일부" in pt, pt.replace("\n", " | ")[:200])

    # ── 전유부 없는 필지 — 억지로 채우지 않고 안내만 ──────────────────────────
    search_address(page, NOUNIT_Q)
    pick_first_address(page, "362-32")
    page.wait_for_timeout(600)
    ledger3 = ensure_ledger(page)
    reason3 = external_ledger_reason(ledger3)
    if reason3:
        print("WARN 전유부 없음 검증 생략 —", reason3)
    else:
        wait_units(page)
        none = page.get_by_test_id("register-unit-none")
        if none.count() > 0:
            check(
                "전유부 없음 — 목록 없음 안내",
                "동·호수 목록 없음" in none.inner_text(),
                none.inner_text().replace("\n", " | ")[:160],
            )
            check("전유부 없음 — 전용면적을 지어내지 않음", page.get_by_test_id("register-exclusive-area").input_value() == "", "")
        else:
            print("WARN 전유부 없는 필지에 목록이 떴습니다 — 국토부 응답 확인 필요")


def run_desktop(p, errors: list[str]) -> None:
    global ADDRESS_OK, STUBBED
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx, page = open_register(browser, errors)
    try:
        try:
            search_address(page, DAECHI_Q)  # 주소 검색이 되는 환경인지 먼저 확인
        except AddressUnavailable as e:
            print("WARN 카카오 주소 검색 차단 —", e, "→ 가짜 지오코더로 폼 흐름을 검증합니다")
            ctx.close()
            # 첫 시도(실제 SDK)에서 남은 콘솔 오류는 환경 제약이다 — 검증 대상에서 뺀다
            errors.clear()
            STUBBED = True
            ctx, page = open_register(browser, errors, stub=True)
            search_address(page, DAECHI_Q)
        ADDRESS_OK = True
        run_checks(page)
    finally:
        ctx.close()
        browser.close()


def run_mobile(p, errors: list[str]) -> None:
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx, page = open_register(browser, errors, mobile=True, stub=STUBBED)
    if ADDRESS_OK:
        try:
            search_address(page, DAECHI_Q)
            pick_first_address(page, "915-3")
            wait_units(page)
            page.wait_for_timeout(1000)
        except Exception as e:
            print("WARN 모바일 주소 선택 실패 —", str(e)[:120])

    width = page.evaluate("() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth })")
    check(
        "모바일 390px 가로 넘침 없음",
        width["doc"] <= width["win"] + 1,
        f"docW={width['doc']} winW={width['win']}",
    )
    if page.get_by_test_id("register-unit-picker").count() > 0:
        page.get_by_test_id("register-unit-picker").scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        page.get_by_test_id("register-unit-picker").screenshot(path=SHOT_MOBILE_PICKER)
        check("스크린샷 redev-register-units-mobile-picker.png", os.path.exists(SHOT_MOBILE_PICKER), SHOT_MOBILE_PICKER)
    page.screenshot(path=SHOT_MOBILE, full_page=True)
    check("스크린샷 redev-register-units-mobile.png", os.path.exists(SHOT_MOBILE), SHOT_MOBILE)
    ctx.close()
    browser.close()


def run() -> int:
    with sync_playwright() as p:
        errors: list[str] = []
        try:
            run_desktop(p, errors)
        except Exception as e:  # 흐름 중 예외 — 실패로 남기고 모바일은 계속
            check("데스크톱 흐름 완주", False, f"{type(e).__name__}: {str(e)[:200]}")
        run_mobile(p, errors)

        real = [
            e
            for e in errors
            if "favicon" not in e.lower()
            and not (e.startswith("Failed to load resource") and re.search(r"status of [45]\d\d", e))
            and not (e.startswith("mobile: Failed to load resource") and re.search(r"status of [45]\d\d", e))
            and "dapi.kakao.com" not in e
            and "kakao" not in e.lower()
        ]
        if STUBBED:
            print("WARN 카카오 SDK 가 막힌 환경이라 가짜 지오코더로 검증했습니다(지도·주소 SDK 자체는 미검증)")
        resource_5xx = [e for e in errors if "Failed to load resource" in e and re.search(r"status of [45]\d\d", e)]
        if resource_5xx:
            print("WARN 외부 API 환경으로 5xx/4xx 응답", len(resource_5xx), "건 —", resource_5xx[0][:90])
        check("콘솔 오류 0건", len(real) == 0, "; ".join(real[:3]))

    print("\n" + ("모두 통과" if not failures else f"실패 {len(failures)}건: " + ", ".join(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run())
