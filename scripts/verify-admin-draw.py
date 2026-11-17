#!/usr/bin/env python3
"""관리자 모드(지도 위 구역 그리기·경계 수정) 동작 확인 스크립트.

확인 항목
  1) ?admin=1 → 관리자 패널, localStorage 기억
  2) 새 구역 그리기 → 지도 클릭으로 꼭짓점 4개 → 실시간 면적
  3) 꼭짓점 드래그 · 변 + 핸들로 점 추가 · ✕ 배지로 삭제
  4) 완료 → 메타 입력 → 저장 → 목록·localStorage·지도 반영(새로고침 유지)
  5) JSON 다운로드(GeoJSON [경도,위도] + official-*.json [위도,경도]) · 클립보드 복사
  6) 공식 구역(신림1구역) 경계 수정 — 고시면적과 그린 면적 비교(면적 계산 검증)
  7) 아이패드 터치: 탭으로 점 찍기 · 지도 끌기는 점을 만들지 않음 · 핸들 터치 드래그
  8) 관리자 모드 종료 → 일반 화면(관리자 요소 없음)

사용법
    scripts/with-dev.sh python3 scripts/verify-admin-draw.py
"""
import json
import math
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?admin=1")
SHOT = os.environ.get("SHOT_PATH", "/workspace/downloads/redev-admin-draw.png")
TMP = "/workspace/projects/redev-platform/tmp"
os.makedirs(TMP, exist_ok=True)

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg))
    if not ok:
        errors.append(str(msg))


def area_el(page, testid="admin-draft-area"):
    el = page.query_selector(f'[data-testid="{testid}"]')
    return el.inner_text() if el else ""


def area_num(text):
    try:
        return float(text.split("㎡")[0].replace(",", "").strip())
    except Exception:
        return 0.0


def map_box(page):
    return page.eval_on_selector(
        ".kakao-map-wrap", "el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }"
    )


def search_zone(page, term):
    page.fill('[data-testid="zone-search-input"]', term)
    page.wait_for_selector('[data-testid="zone-result"]', timeout=8000)
    page.click('[data-testid="zone-result"]')
    page.wait_for_timeout(2200)  # 경계에 맞추는 애니메이션


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── 데스크톱(마우스) ──────────────────────────────────────────────
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        page = ctx.new_page()
        page.on("dialog", lambda d: d.accept())
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:300]))

        print("1) 관리자 모드 진입")
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="admin-panel"]', timeout=30000)
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=30000,
        )
        time.sleep(1.5)
        log(True, "?admin=1 로 관리자 패널이 열렸다")
        log(page.evaluate("() => localStorage.getItem('redev.admin')") == "1", "localStorage 에 관리자 모드 기억")

        print("2) 신림1구역으로 확대 후 새 구역 그리기")
        search_zone(page, "신림1")
        box = map_box(page)
        cx = box["x"] + box["w"] / 2
        cy = box["y"] + box["h"] / 2
        page.click('[data-testid="admin-start-draw"]')
        pts = [(cx - 70, cy - 55), (cx + 75, cy - 50), (cx + 80, cy + 60), (cx - 65, cy + 65)]
        for i, (x, y) in enumerate(pts):
            page.mouse.click(x, y)
            page.wait_for_timeout(250)
            print(f"   점 {i + 1} → {area_el(page)}")
        page.wait_for_timeout(400)
        t = area_el(page)
        log("㎡" in t and "평" in t and not t.startswith("면적 —"), f"실시간 면적 표시: {t}")
        draft_area = area_num(t)
        log(20000 < draft_area < 800000, f"구역 크기에 맞는 면적({draft_area:,.0f}㎡)")
        log(area_el(page, "admin-toolbar-area") == t, "지도 위 도구 막대에도 같은 면적")
        log(page.eval_on_selector_all("[data-vx]", "els => els.length") == 4, "꼭짓점 핸들 4개")
        page.screenshot(path=os.path.join(TMP, "admin-draw-editing.png"))

        print("3) 꼭짓점 드래그")
        page.mouse.move(pts[1][0], pts[1][1])
        page.mouse.down()
        for k in range(1, 9):
            page.mouse.move(pts[1][0] + 8 * k, pts[1][1] - 5 * k)
            page.wait_for_timeout(30)
        page.mouse.up()
        page.wait_for_timeout(400)
        after_drag = area_num(area_el(page))
        log(abs(after_drag - draft_area) > 100, f"드래그로 면적 변경: {draft_area:,.0f} → {after_drag:,.0f}㎡")

        print("4) 변 가운데 + 핸들로 점 추가 / ✕ 배지로 삭제")
        mids = page.query_selector_all("[data-mid]")
        log(len(mids) == 4, f"변 + 핸들 {len(mids)}개")
        mids[0].query_selector("button").click()
        page.wait_for_timeout(350)
        log(page.eval_on_selector_all("[data-vx]", "els => els.length") == 5, "점 추가 → 5개")
        page.query_selector('[data-testid="admin-vertex-del-4"]').click()
        page.wait_for_timeout(300)
        log(page.eval_on_selector_all("[data-vx]", "els => els.length") == 4, "✕ 배지 삭제 → 4개")

        print("5) 완료 → 메타 입력 → 저장")
        final_area = area_num(area_el(page))
        page.click('[data-testid="admin-finish"]')
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=8000)
        page.fill('[data-testid="admin-zone-name"]', "테스트 관리자 구역")
        page.select_option('[data-testid="admin-zone-type"]', label="모아타운")
        page.select_option('[data-testid="admin-zone-stage"]', label="구역지정")
        page.fill('[data-testid="admin-zone-gu"]', "관악구")
        page.fill('[data-testid="admin-zone-note"]', "검증 스크립트로 그린 경계")
        page.click('[data-testid="admin-save"]')
        page.wait_for_timeout(800)
        print("   message:", (page.query_selector('[data-testid="admin-message"]') or page).inner_text()[:80])
        items = page.eval_on_selector_all('[data-testid="admin-zone-item"]', "els => els.map(e => e.innerText)")
        log(len(items) == 1 and "테스트 관리자 구역" in items[0], "목록에 저장됨")
        arr = json.loads(page.evaluate("() => localStorage.getItem('redev.customZones.v1')") or "[]")
        log(len(arr) == 1 and arr[0]["name"] == "테스트 관리자 구역", "localStorage 에 저장")
        if arr:
            log(abs(arr[0]["areaSqm"] - final_area) < 2, f"저장 면적 = 초안 면적 ({arr[0]['areaSqm']:,.0f}㎡)")
        log(page.query_selector('[data-testid="admin-custom-card"]') is not None, "저장 후 구역 상세 카드")
        page.wait_for_timeout(1200)
        page.screenshot(path=SHOT)
        print("   screenshot:", SHOT)

        print("6) 새로고침 후 유지")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="admin-panel"]', timeout=30000)
        page.wait_for_timeout(2000)
        items2 = page.eval_on_selector_all('[data-testid="admin-zone-item"]', "els => els.map(e => e.innerText)")
        log(len(items2) == 1 and "테스트 관리자 구역" in items2[0], "새로고침 후에도 남아 있음")

        print("7) JSON 내보내기 / 클립보드")
        with page.expect_download(timeout=8000) as dl:
            page.click('[data-testid="admin-export-json"]')
        d = dl.value
        path = os.path.join(TMP, "export-check.json")
        d.save_as(path)
        data = json.load(open(path, encoding="utf-8"))
        feat = data["features"][0]
        ring_latlng = feat["properties"]["ringLatLng"]
        coords = feat["geometry"]["coordinates"][0]
        log(data["type"] == "FeatureCollection" and feat["properties"]["name"] == "테스트 관리자 구역",
            f"GeoJSON: {d.suggested_filename}")
        log(abs(coords[0][0] - ring_latlng[0][1]) < 1e-6 and abs(coords[0][1] - ring_latlng[0][0]) < 1e-6,
            "좌표 순서: GeoJSON [경도,위도] ↔ ringLatLng [위도,경도]")
        log(len(coords) == len(ring_latlng) + 1, f"링 닫힘(첫 점 반복): {len(coords)} vs {len(ring_latlng)}+1")
        # 파이썬 독립 계산과 비교(면적)
        R = 6378137.0
        s = 0.0
        n = len(ring_latlng)
        for i in range(n):
            la1, ln1 = ring_latlng[i]
            la2, ln2 = ring_latlng[(i + 1) % n]
            s += math.radians(ln2 - ln1) * (2 + math.sin(math.radians(la1)) + math.sin(math.radians(la2)))
        py_area = abs(s * R * R / 2)
        log(abs(py_area - feat["properties"]["area"]) / max(py_area, 1) < 0.001,
            f"면적 교차검증: JS {feat['properties']['area']:,}㎡ / Python {py_area:,.0f}㎡")

        page.click('[data-testid="admin-export-copy"]')
        page.wait_for_timeout(500)
        clip = page.evaluate("() => navigator.clipboard.readText()")
        log(clip.startswith("{") and "테스트 관리자 구역" in clip, f"클립보드 복사 {len(clip)}자")

        print("8) 공식 구역(신림1구역) 경계 수정 — 면적 검증")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="admin-panel"]', timeout=30000)
        page.wait_for_timeout(1500)
        search_zone(page, "신림1구역")
        page.click('[data-testid="admin-edit-selected"]')
        page.wait_for_timeout(900)
        v = page.eval_on_selector_all("[data-vx]", "els => els.length")
        edit_area = area_num(area_el(page))
        log(v >= 3, f"신림1구역 경계 핸들 {v}개")
        log(abs(edit_area - 223201) / 223201 < 0.05,
            f"고시면적 223,201㎡ ↔ 그린 도형 {edit_area:,.0f}㎡ (오차 {abs(edit_area - 223201) / 223201 * 100:.1f}%)")
        page.click('[data-testid="admin-finish"]')
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=8000)
        prefill = page.input_value('[data-testid="admin-zone-name"]')
        log(prefill == "신림1구역", f"경계 수정 시 구역명 자동 채움: {prefill!r}")
        page.click('[data-testid="admin-cancel-meta"]')
        page.wait_for_timeout(300)
        log(page.query_selector('[data-testid="admin-meta-form"]') is None, "메타 취소 → 초안 유지")
        page.click('[data-testid="admin-finish"]')
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=8000)
        page.click('[data-testid="admin-save"]')
        page.wait_for_timeout(800)
        arr2 = json.loads(page.evaluate("() => localStorage.getItem('redev.customZones.v1')") or "[]")
        ov = [z for z in arr2 if z.get("replacesZoneId")]
        log(
            len(ov) == 1 and bool(ov[0].get("replacesZoneId")) and ov[0].get("replacesName") == "신림1구역",
            f"고시 구역 경계 보정본 저장: {ov[0].get('replacesName') if ov else None} / {ov[0].get('replacesZoneId') if ov else None}",
        )
        dels = page.query_selector_all('[data-testid="admin-delete-zone"]')
        dels[-1].click()
        page.wait_for_timeout(600)
        arr3 = json.loads(page.evaluate("() => localStorage.getItem('redev.customZones.v1')") or "[]")
        log(len(arr3) == 1 and arr3[0]["name"] == "테스트 관리자 구역", "보정본 삭제 → 원래 1건만 남음")

        print("9) 관리자 모드 종료")
        page.click('[data-testid="admin-exit"]')
        page.wait_for_timeout(500)
        log(page.query_selector('[data-testid="admin-panel"]') is None, "종료 후 패널이 사라짐")
        log(page.evaluate("() => localStorage.getItem('redev.admin')") is None, "localStorage 플래그 삭제")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        log(page.query_selector('[data-testid="admin-panel"]') is None, "새로고침해도 일반 화면")
        log(page.query_selector('[data-testid="admin-toolbar"]') is None, "지도 위 관리자 도구도 없음")
        ctx.close()

        # ── 아이패드 터치 ────────────────────────────────────────────────
        print("10) 아이패드(1024×768, 터치) 확인")
        ictx = browser.new_context(
            viewport={"width": 1024, "height": 768}, device_scale_factor=2, has_touch=True, is_mobile=False
        )
        ipage = ictx.new_page()
        ipage.goto(URL, wait_until="domcontentloaded")
        ipage.wait_for_selector('[data-testid="admin-panel"]', timeout=30000)
        ipage.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=30000,
        )
        time.sleep(1.5)
        ibox = map_box(ipage)
        icx = ibox["x"] + ibox["w"] / 2
        icy = ibox["y"] + ibox["h"] / 2
        ipage.tap('[data-testid="admin-start-draw"]')
        ipage.wait_for_timeout(400)

        cdp = ictx.new_cdp_session(ipage)

        def touch_drag(x0, y0, x1, y1, steps=10):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
            for i in range(1, steps + 1):
                cdp.send(
                    "Input.dispatchTouchEvent",
                    {
                        "type": "touchMove",
                        "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y0 + (y1 - y0) * i / steps}],
                    },
                )
                time.sleep(0.02)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            time.sleep(0.35)

        # 지도 끌기(한 손가락)는 점을 만들지 않아야 한다
        touch_drag(icx - 40, icy + 180, icx + 40, icy + 120)
        n_after_pan = ipage.eval_on_selector_all("[data-vx]", "els => els.length")
        log(n_after_pan == 0, f"지도 끌기 → 점 추가 없음(핸들 {n_after_pan}개)")

        taps = [(icx - 60, icy - 50), (icx + 60, icy - 45), (icx + 65, icy + 55)]
        for i, (x, y) in enumerate(taps):
            ipage.touchscreen.tap(x, y)
            ipage.wait_for_timeout(400)
            print(f"   탭 {i + 1} → {area_el(ipage)}")
        n = ipage.eval_on_selector_all("[data-vx]", "els => els.length")
        log(n == 3, f"터치 탭으로 꼭짓점 {n}개")
        ipage.touchscreen.tap(icx - 25, icy + 95)  # 4번째
        ipage.wait_for_timeout(500)
        area_before = area_num(area_el(ipage))
        log(area_before > 0, f"터치로 그린 면적 {area_before:,.0f}㎡")
        ipage.screenshot(path=os.path.join(TMP, "admin-ipad-editing.png"))

        # 핸들 터치 드래그 — 점을 옮기고 지도는 끌리지 않아야 한다
        handle = ipage.query_selector('[data-vx="1"] button')
        hb = handle.bounding_box()
        touch_drag(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2, hb["x"] + hb["width"] / 2 + 40,
                   hb["y"] + hb["height"] / 2 - 30)
        n2 = ipage.eval_on_selector_all("[data-vx]", "els => els.length")
        area_after = area_num(area_el(ipage))
        log(n2 == 4, f"핸들 터치 드래그 후에도 꼭짓점 {n2}개(지도 끌림 없음)")
        log(abs(area_after - area_before) > 100, f"핸들 드래그로 면적 변경 {area_before:,.0f} → {area_after:,.0f}㎡")
        ipage.tap('[data-testid="admin-cancel"]')
        ictx.close()
        browser.close()

    print()
    if errors:
        print(f"실패 {len(errors)}건:")
        for e in errors:
            print(" -", e)
        return 1
    print("모든 확인 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
