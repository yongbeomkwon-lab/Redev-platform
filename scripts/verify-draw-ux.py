"""그리기 모드 UX 검증 — 제자리 완료(더블클릭·우클릭·Enter)·Esc 취소·고무줄 선 정리.

    sh scripts/with-dev.sh python3 scripts/verify-draw-ux.py      (개발 서버 3100 재사용)

  · 카카오 JS 키는 localhost:3100 도메인에 등록되어 있어 다른 포트에서는 지도가 뜨지 않는다.
  · 캔버스 픽셀 알파로 고무줄 선이 그려졌는지/지워졌는지 판정한다(스크린샷 비교 없이).
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://localhost:3100/?admin=1"


def log(*a):
    print(*a, flush=True)


def toolbar_count(page):
    """도구 막대·패널이 보여주는 현재 꼭짓점 수"""
    txt = page.locator("[data-testid=admin-toolbar]").inner_text() if page.locator("[data-testid=admin-toolbar]").count() else ""
    if "점" in txt:
        for part in txt.split():
            if part.endswith("점"):
                return int(part[:-1])
    panel = page.locator("[data-testid=admin-panel]").inner_text()
    m = re.search(r"꼭짓점 (\d+)개", panel)
    return int(m.group(1)) if m else None


def start_draw(page):
    page.locator("[data-testid=admin-start-draw]").click()
    page.wait_for_timeout(300)


def cancel_all(page):
    """초안이 남아 있으면 취소"""
    if page.locator("[data-testid=admin-meta-form]").count():
        page.locator("[data-testid=admin-cancel-meta]").click()
        page.wait_for_timeout(150)
    btn = page.locator("[data-testid=admin-cancel]")
    if btn.count() and btn.first.is_visible():
        btn.first.click()
        page.wait_for_timeout(200)


def canvas_box(page):
    return page.evaluate(
        """() => {
            const el = document.querySelector('.kakao-zone-canvas');
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, w: r.width, h: r.height, dpr: Math.min(window.devicePixelRatio||1, 2)};
        }"""
    )


def alpha_at(page, x, y):
    """캔버스 (x,y) — 지도 영역 기준 CSS 픽셀 — 의 알파값(0~255)"""
    return page.evaluate(
        """([x, y]) => {
            const el = document.querySelector('.kakao-zone-canvas');
            const dpr = Math.min(window.devicePixelRatio||1, 2);
            const d = el.getContext('2d').getImageData(Math.round(x*dpr), Math.round(y*dpr), 1, 1).data;
            return [d[0], d[1], d[2], d[3]];
        }""",
        [x, y],
    )


def main():
    results = []
    ok = True

    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1500, "height": 980})
        pg = ctx.new_page()
        pg.on("console", lambda m: log("CONSOLE", m.type, m.text[:200]) if m.type == "error" else None)
        pg.goto(URL, wait_until="domcontentloaded")
        pg.wait_for_selector(".kakao-zone-canvas", timeout=60000)
        pg.wait_for_function("() => !!window.kakao?.maps?.services", timeout=30000)
        time.sleep(3)
        pg.evaluate("() => localStorage.removeItem('redev:custom-zones:v1')")

        box = canvas_box(pg)
        log("canvas box", box)
        # 지도 안쪽에서 패널/막대를 피한 좌표들
        P = [
            (box["x"] + 420, box["y"] + 420),
            (box["x"] + 620, box["y"] + 380),
            (box["x"] + 700, box["y"] + 560),
            (box["x"] + 480, box["y"] + 620),
            (box["x"] + 380, box["y"] + 500),
        ]

        def level():
            return pg.evaluate("() => window.__redevDiag?.map()?.getLevel()")

        def add_points(n):
            for i in range(n):
                pg.mouse.click(P[i][0], P[i][1])
                pg.wait_for_timeout(250)

        # ── 1) 고무줄 선: 지도 위에서 마우스를 움직이면 점선이 따라오고,
        #        UI(도구 막대·패널)로 나가면 사라진다 ────────────────────────────
        start_draw(pg)
        add_points(3)
        log("① 3점:", toolbar_count(pg))
        # 커서를 마지막 점 반대편으로 보낸다 → 마지막 점에서 커서까지 선
        cx, cy = box["x"] + 900, box["y"] + 300
        pg.mouse.move(cx, cy, steps=8)
        pg.wait_for_timeout(300)
        mid = ((P[2][0] + cx) / 2 - box["x"], (P[2][1] + cy) / 2 - box["y"])
        on_map = alpha_at(pg, mid[0], mid[1])
        # 지도 위 도구 막대(상단 중앙)로 마우스를 옮긴다
        tb = pg.locator("[data-testid=admin-toolbar]")
        if tb.count() and tb.first.is_visible():
            tb.first.hover()
        else:
            pg.mouse.move(box["x"] + 60, box["y"] + 40, steps=6)
        pg.wait_for_timeout(400)
        after = alpha_at(pg, mid[0], mid[1])
        log("② 고무줄 선 픽셀(지도 위):", on_map, "→ UI 위:", after)
        results.append(("고무줄 선이 지도에서는 보이고 UI 위에서는 사라짐", on_map[3] > 0 and after[3] == 0))

        # ── 2) Enter 로 그 자리 완료 ────────────────────────────────────────
        pg.mouse.click(P[3][0], P[3][1])
        pg.wait_for_timeout(250)
        log("③ Enter 전 점수:", toolbar_count(pg))
        lv0 = level()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(600)
        meta = pg.locator("[data-testid=admin-meta-form]").count()
        log("④ Enter 후 구역정보 폼:", meta, "| 점수:", toolbar_count(pg), "| level", lv0, "→", level())
        results.append(("Enter 로 완료(구역정보 폼 열림, 점 4개 유지)", meta == 1 and toolbar_count(pg) == 4))
        cancel_all(pg)

        # ── 3) 더블클릭으로 그 자리 완료 (지도 확대도 되지 않아야 한다) ──────────
        start_draw(pg)
        add_points(3)
        lv0 = level()
        pg.mouse.dblclick(P[3][0], P[3][1])
        pg.wait_for_timeout(700)
        meta = pg.locator("[data-testid=admin-meta-form]").count()
        cnt = toolbar_count(pg)
        lv1 = level()
        log("⑤ 더블클릭 후 폼:", meta, "| 점수:", cnt, "| level", lv0, "→", lv1)
        results.append(("더블클릭 한 번으로 완료 + 꼭짓점 중복 없음(3+1=4)", meta == 1 and cnt == 4))
        results.append(("더블클릭에 지도가 확대되지 않음", lv0 == lv1))
        cancel_all(pg)

        # ── 4) 우클릭으로 그 자리 완료 ──────────────────────────────────────
        start_draw(pg)
        add_points(3)
        pg.mouse.click(P[3][0], P[3][1], button="right")
        pg.wait_for_timeout(700)
        meta = pg.locator("[data-testid=admin-meta-form]").count()
        cnt = toolbar_count(pg)
        log("⑥ 우클릭 후 폼:", meta, "| 점수:", cnt)
        results.append(("우클릭 한 번으로 완료(점 추가 없이 3개 유지)", meta == 1 and cnt == 3))
        cancel_all(pg)

        # ── 5) Esc 로 취소 ────────────────────────────────────────────────
        start_draw(pg)
        add_points(2)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)
        left = pg.locator("[data-testid=admin-cancel]").count()
        log("⑦ Esc 후 남은 초안(취소 버튼 존재):", left)
        results.append(("Esc 로 초안 취소", left == 0))

        # ── 6) 도구 막대 버튼 클릭이 점을 찍지 않는다 ─────────────────────────
        start_draw(pg)
        add_points(3)
        before = toolbar_count(pg)
        undo = pg.locator("[data-testid=admin-toolbar] button[aria-label^=실행취소]")
        if undo.count():
            undo.first.click()
            pg.wait_for_timeout(350)
            after_undo = toolbar_count(pg)
        else:
            after_undo = None
        log("⑧ 도구 막대 실행취소:", before, "→", after_undo)
        results.append(("도구 막대 버튼 클릭이 지도에 점을 더하지 않음(3→2)", after_undo == 2))

        # ── 7) 꼭짓점이 3개 미만일 때 더블클릭해도 완료되지 않는다 ─────────────────
        start_draw(pg)
        add_points(1)
        pg.mouse.dblclick(P[3][0], P[3][1])
        pg.wait_for_timeout(600)
        meta = pg.locator("[data-testid=admin-meta-form]").count()
        cnt = toolbar_count(pg)
        log("⑨ 1점 + 더블클릭 → 폼:", meta, "| 점수:", cnt)
        results.append(("꼭짓점 3개 미만에서는 더블클릭이 완료로 가지 않음(2점 유지)", meta == 0 and cnt == 2))
        cancel_all(pg)

        # ── 8) 좁은 화면: 지도 위 안내 문구가 보인다 ─────────────────────────
        pg.set_viewport_size({"width": 1024, "height": 800})
        pg.wait_for_timeout(600)
        start_draw(pg)
        add_points(1)
        hint = pg.locator("[data-testid=admin-draw-hint]")
        vis = hint.count() > 0 and hint.first.is_visible()
        log("⑩ 좁은 화면 안내 문구:", vis, "|", hint.first.inner_text() if vis else "-")
        results.append(("좁은 화면에서 지도 위 조작 안내가 보임", vis))
        cancel_all(pg)
        pg.set_viewport_size({"width": 1500, "height": 980})
        pg.wait_for_timeout(500)
        start_draw(pg)
        add_points(3)
        pg.screenshot(path="/workspace/downloads/redev-draw-ux.png")
        cancel_all(pg)

        ctx.close()
        b.close()

    log("\n=== 결과 ===")
    for name, good in results:
        log(("✅" if good else "❌"), name)
        ok = ok and good
    log("ALL OK" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
