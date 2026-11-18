#!/usr/bin/env python3
"""‘경계·정보 수정’ 검증 — 누르면 구역 정보 입력 폼(사업유형·추진단계·자치구·비고)이 즉시 열린다.

확인 항목
  1) 공식 구역 선택 → ‘경계·정보 수정’ → ✓ 완료 없이 바로 정보 입력 폼이 열리고 값이 채워진다
  2) 경계를 안 고치고 사업유형만 바꿔 ‘저장’ → 그대로 저장된다(도형은 고른 구역 그대로)
  3) 목록의 ‘경계·정보 수정’ 버튼 → 폼이 바로 열리고 저장된 값이 채워진다
  4) 폼이 열린 채로(그리는 중) ✓ 완료를 눌러도 입력값이 지워지지 않고, 고친 추진단계가 저장된다
  5) 버튼 문구가 ‘경계·정보 수정’으로 통일

사용법
    scripts/with-dev.sh python3 scripts/verify-edit-info.py
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?admin=1")
SHOT = os.environ.get("SHOT_PATH", "/workspace/downloads/redev-edit-info.png")

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg), flush=True)
    if not ok:
        errors.append(str(msg))


def main() -> int:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1500, "height": 1000})
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(3)
        page.evaluate("() => localStorage.removeItem('redev.customZones.v1')")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(3)

        print("0) 버튼 문구")
        panel_text = page.locator("[data-testid=admin-panel]").inner_text()
        log("경계·정보 수정" in panel_text, "패널 버튼·안내에 '경계·정보 수정' 표기")

        print("1) 공식 구역 선택 → ‘경계·정보 수정’")
        page.fill('[data-testid="zone-search-input"]', "자양동 10")
        page.wait_for_selector('[data-testid="zone-result"]', timeout=15000)
        page.click('[data-testid="zone-result"]')
        page.wait_for_timeout(2500)
        edit_btn = page.locator('[data-testid="admin-edit-selected"]')
        log(edit_btn.is_enabled(), "경계가 있는 구역을 골라 수정 버튼 활성")
        log("경계·정보 수정" in edit_btn.inner_text(), f"버튼 문구: {edit_btn.inner_text().strip()}")
        edit_btn.click()
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=5000)
        log(True, "✓ 완료를 누르지 않아도 정보 입력 폼이 바로 열림")

        type_sel = page.locator('[data-testid="admin-zone-type"]')
        stage_sel = page.locator('[data-testid="admin-zone-stage"]')
        name_in = page.locator('[data-testid="admin-zone-name"]')
        gu_in = page.locator('[data-testid="admin-zone-gu"]')
        print("   폼 값:", name_in.input_value(), "|", type_sel.input_value(), "|",
              stage_sel.input_value(), "|", gu_in.input_value())
        log("자양동 10번지 일원" in name_in.input_value(), "구역명이 고른 구역으로 채워짐")
        log(type_sel.input_value() == "민간도심복합(성장거점형)", "사업유형이 지금 값으로 채워짐")
        log(stage_sel.input_value() == "추진준비", "추진단계가 지금 값으로 채워짐")
        log(gu_in.input_value() == "광진구", "자치구가 지금 값으로 채워짐")
        log(not page.locator('[data-testid="admin-finish"]').is_disabled(), "폼이 열려 있어도 ✓ 완료 버튼 살아 있음")

        print("2) 경계는 그대로, 사업유형만 바꿔 저장")
        type_sel.select_option(label="가로주택")
        page.wait_for_timeout(200)
        page.click('[data-testid="admin-save"]')
        page.wait_for_timeout(1200)
        log(page.locator('[data-testid="admin-meta-form"]').count() == 0, "저장 후 폼이 닫힘")
        msg = page.locator('[data-testid="admin-message"]').inner_text()
        print("   안내:", msg.replace("\n", " ")[:120])
        log("저장 완료" in msg, "저장 완료 안내")

        saved = page.evaluate("() => JSON.parse(localStorage.getItem('redev.customZones.v1') || '[]')")
        log(len(saved) == 1, f"브라우저에 저장된 구역 {len(saved)}곳")
        z = saved[0] if saved else {}
        log(z.get("type") == "가로주택", f"저장된 사업유형: {z.get('type')}")
        log(z.get("stage") == "추진준비", f"저장된 추진단계: {z.get('stage')}")
        official = [
            f for f in json.load(open("public/data/zones.geojson"))["features"]
            if (f.get("properties") or {}).get("name") == "자양동 10번지 일원"
        ][0]["geometry"]["coordinates"][0]
        ring = z.get("ring") or []
        same_shape = (
            len(ring) == len(official)
            and abs(ring[0][0] - official[0][1]) < 1e-9
            and abs(ring[0][1] - official[0][0]) < 1e-9
        )
        log(same_shape, f"경계 {len(ring)}점 — 고른 구역 도형(공식 {len(official)}점) 그대로")
        log(z.get("replacesName") == "자양동 10번지 일원", f"공식 구역 대체 표시: {z.get('replacesName')}")
        item = page.locator('[data-testid=admin-zone-item]').first.inner_text()
        log("가로주택" in item, "목록 줄에 바뀐 사업유형 표시")

        print("3) 목록의 ‘경계·정보 수정’")
        page.locator('[data-testid="admin-edit-custom"]').first.click()
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=5000)
        log(True, "목록 버튼에서도 폼이 바로 열림")
        log(page.locator('[data-testid="admin-zone-type"]').input_value() == "가로주택", "저장된 사업유형이 채워짐")

        print("4) 폼이 열린 채로 ✓ 완료 → 입력값 유지, 추진단계 바꿔 저장")
        page.locator('[data-testid="admin-zone-note"]').fill("검증 스크립트 입력")
        page.locator('[data-testid="admin-finish"]').click()
        page.wait_for_timeout(400)
        log(page.locator('[data-testid="admin-meta-form"]').count() == 1, "✓ 완료 뒤에도 폼 유지")
        log(page.locator('[data-testid="admin-zone-note"]').input_value() == "검증 스크립트 입력",
            "✓ 완료가 입력값을 덮어쓰지 않음")
        page.locator('[data-testid="admin-zone-stage"]').select_option(label="관리처분")
        page.click('[data-testid="admin-save"]')
        page.wait_for_timeout(1200)
        saved = page.evaluate("() => JSON.parse(localStorage.getItem('redev.customZones.v1') || '[]')")
        log(len(saved) == 1 and saved[0].get("stage") == "관리처분",
            f"고친 추진단계 저장: {saved[0].get('stage') if saved else None}")
        log(len(saved) == 1 and saved[0].get("note") == "검증 스크립트 입력", "비고도 함께 저장")

        page.screenshot(path=SHOT)
        print("   screenshot:", SHOT)
        ctx.close()
        b.close()

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
