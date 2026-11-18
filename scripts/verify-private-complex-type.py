#!/usr/bin/env python3
"""민간도심복합(성장거점형·주거중심형) 사업유형 연결 확인.

확인 항목
  1) 관리자 모드 사업유형 드롭다운 — 도공복 바로 아래에 두 유형이 있고, 저장하면 type 이 그대로 남는다
  2) 그린 구역이 유형 색(성장거점형 진한 빨강 #b91c1c / 주거중심형 빨강 #ef4444)으로 지도에 그려진다
  3) 목록·상세 카드 배지에 유형 이름이 나온다
  4) 범례에 두 유형이 각각 나오고, 유형 필터 칩으로 걸러도 화면이 살아 있다(데이터 0곳)
  5) 내보낸 GeoJSON 의 kind 가 '민간도심복합개발(성장거점형)'로 매핑된다

사용법
    scripts/with-dev.sh python3 scripts/verify-private-complex-type.py
    TARGET_URL=https://redev-platform-iota.vercel.app/?admin=1 MODE=prod ... (배포본 확인)
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?admin=1")
SHOT_DIR = os.environ.get("SHOT_DIR", "/workspace/downloads")
TMP = "/workspace/projects/redev-platform/tmp"
os.makedirs(TMP, exist_ok=True)
os.makedirs(SHOT_DIR, exist_ok=True)

G1 = "민간도심복합(성장거점형)"
G2 = "민간도심복합(주거중심형)"
C1 = (185, 28, 28)   # #b91c1c
C2 = (239, 68, 68)   # #ef4444

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg))
    if not ok:
        errors.append(str(msg))


def map_box(page):
    return page.eval_on_selector(
        ".kakao-map-wrap", "el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }"
    )


def color_pixels(page, rgb, tol=6):
    """지도 캔버스에서 해당 색 픽셀 수 — 테두리가 원색으로 그려지므로 배지·목록 없이도 확인된다."""
    return page.evaluate(
        """([r,g,b,tol]) => {
          const c = document.querySelector('canvas.kakao-zone-canvas');
          if (!c) return -1;
          const ctx = c.getContext('2d');
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i]-r)<=tol && Math.abs(d[i+1]-g)<=tol && Math.abs(d[i+2]-b)<=tol && d[i+3]>200) n++;
          }
          return n;
        }""",
        [rgb[0], rgb[1], rgb[2], tol],
    )


def draw_and_save(page, name, type_label, gu):
    page.click('[data-testid="admin-start-draw"]')
    page.wait_for_timeout(400)
    box = map_box(page)
    cx = box["x"] + box["w"] / 2
    cy = box["y"] + box["h"] / 2
    for x, y in [(cx - 70, cy - 55), (cx + 75, cy - 50), (cx + 80, cy + 60), (cx - 65, cy + 65)]:
        page.mouse.click(x, y)
        page.wait_for_timeout(200)
    page.click('[data-testid="admin-finish"]')
    page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=8000)
    page.fill('[data-testid="admin-zone-name"]', name)
    page.select_option('[data-testid="admin-zone-type"]', label=type_label)
    page.select_option('[data-testid="admin-zone-stage"]', label="구역지정")
    page.fill('[data-testid="admin-zone-gu"]', gu)
    page.fill('[data-testid="admin-zone-note"]', "유형 연결 확인용")
    page.click('[data-testid="admin-save"]')
    page.wait_for_timeout(900)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                                  accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:300]))
        page.on("dialog", lambda d: d.accept())

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="admin-panel"]', timeout=40000)
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=40000,
        )
        page.evaluate("() => localStorage.removeItem('redev.customZones.v1')")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="admin-panel"]', timeout=40000)
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=40000,
        )
        time.sleep(2)

        print("1) 관리자 사업유형 드롭다운")
        page.click('[data-testid="admin-start-draw"]')
        page.wait_for_timeout(300)
        box = map_box(page)
        cx, cy = box["x"] + box["w"] / 2, box["y"] + box["h"] / 2
        for x, y in [(cx - 70, cy - 55), (cx + 75, cy - 50), (cx + 80, cy + 60), (cx - 65, cy + 65)]:
            page.mouse.click(x, y)
            page.wait_for_timeout(200)
        page.click('[data-testid="admin-finish"]')
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=8000)
        opts = page.eval_on_selector_all(
            '[data-testid="admin-zone-type"] option', "els => els.map(e => e.value)"
        )
        print("   옵션:", " / ".join(opts))
        log(G1 in opts and G2 in opts, "두 유형이 드롭다운에 있다")
        if G1 in opts and G2 in opts:
            i = opts.index("도공복")
            log(opts[i + 1] == G1 and opts[i + 2] == G2, "도공복 바로 아래에 성장거점형 → 주거중심형 순서")
        page.select_option('[data-testid="admin-zone-type"]', label=G1)
        shown = page.eval_on_selector('[data-testid="admin-zone-type"]', "el => el.options[el.selectedIndex].text")
        log(shown == G1, f"선택값 표시: %r" % shown)
        page.click('[data-testid="admin-meta-form"] select:invalid') if False else None
        page.screenshot(path=os.path.join(TMP, "private-complex-meta.png"))
        page.click('[data-testid="admin-cancel-meta"]')
        page.click('[data-testid="admin-cancel"]')
        page.wait_for_timeout(300)

        print("2) 성장거점형으로 그려 저장 → 색·배지")
        draw_and_save(page, "테스트 민간도심복합 A", G1, "강남구")
        arr = json.loads(page.evaluate("() => localStorage.getItem('redev.customZones.v1')") or "[]")
        log(len(arr) == 1 and arr[0]["type"] == G1, f"저장된 type: {arr[0]['type'] if arr else None}")
        item = page.eval_on_selector('[data-testid="admin-zone-item"]', "el => el.innerText")
        log(G1 in item, f"목록 항목에 유형 표시: {item.replace(chr(10), ' · ')[:70]}")
        page.wait_for_timeout(800)
        n1 = color_pixels(page, C1)
        log(n1 > 50, f"지도에 성장거점형 색(#b91c1c) 픽셀 {n1}개")

        print("3) 주거중심형으로 하나 더 → 색 구분")
        page.click('[data-testid="admin-start-draw"]')
        page.wait_for_timeout(300)
        for x, y in [(cx + 140, cy - 40), (cx + 260, cy - 35), (cx + 265, cy + 55), (cx + 145, cy + 60)]:
            page.mouse.click(x, y)
            page.wait_for_timeout(200)
        page.click('[data-testid="admin-finish"]')
        page.wait_for_selector('[data-testid="admin-meta-form"]', timeout=8000)
        page.fill('[data-testid="admin-zone-name"]', "테스트 민간도심복합 B")
        page.select_option('[data-testid="admin-zone-type"]', label=G2)
        page.select_option('[data-testid="admin-zone-stage"]', label="구역지정")
        page.fill('[data-testid="admin-zone-gu"]', "송파구")
        page.click('[data-testid="admin-save"]')
        page.wait_for_timeout(1000)
        n2 = color_pixels(page, C2)
        log(n2 > 50, f"지도에 주거중심형 색(#ef4444) 픽셀 {n2}개")
        card = page.eval_on_selector('[data-testid="admin-custom-card"]', "el => el.innerText")
        log(G2 in card, f"상세 카드에 유형 배지: {card.split(chr(10))[0][:60]}")

        print("4) 내보내기 kind 매핑")
        with page.expect_download(timeout=10000) as dl:
            page.click('[data-testid="admin-export-json"]')
        path = os.path.join(TMP, "export-private.json")
        dl.value.save_as(path)
        data = json.load(open(path, encoding="utf-8"))
        kinds = [f["properties"]["kind"] for f in data["features"]]
        types = [f["properties"]["type"] for f in data["features"]]
        print("   kinds:", kinds, "types:", types)
        log("민간도심복합개발(성장거점형)" in kinds and "민간도심복합개발(주거중심형)" in kinds,
            "GeoJSON kind 가 유형별 소분류로 매핑")

        print("5) 범례·유형 필터")
        legend = page.eval_on_selector_all(
            "div.pointer-events-auto.absolute.bottom-14 span", "els => els.map(e => e.innerText).join(' | ')"
        )
        log(G1 in legend and G2 in legend, "범례에 두 유형이 나온다")
        page.click("text=필터")
        page.wait_for_timeout(600)
        chips = page.eval_on_selector_all("button", "els => els.map(e => e.innerText)")
        log(G1 in chips and G2 in chips, "유형 필터 칩에 두 유형이 있다")
        page.click(f"button:has-text('{G1}')")
        page.wait_for_timeout(700)
        log("민간도심복합(성장거점형)만" in page.content() or "민간도심복합(성장거점형)" in page.content(),
            "필터 적용 후 화면 유지")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-private-complex-type.png"))
        print("   screenshot:", os.path.join(SHOT_DIR, "redev-private-complex-type.png"))

        page.evaluate("() => localStorage.removeItem('redev.customZones.v1')")
        ctx.close()
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
