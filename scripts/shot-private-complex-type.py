#!/usr/bin/env python3
"""범례·필터 카드의 민간도심복합 표기 확인(요소 단위 스크린샷) — 데스크톱/아이패드."""
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/")
OUT = "/workspace/projects/redev-platform/tmp"


def shot(page, sel, name):
    el = page.query_selector(sel)
    if not el:
        print("  ❌ element 없음:", sel)
        return None
    el.screenshot(path=os.path.join(OUT, name))
    print("  →", os.path.join(OUT, name))
    return el.inner_text()


def main() -> int:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for label, vp, touch in [("desktop", {"width": 1440, "height": 900}, False),
                                 ("ipad", {"width": 1024, "height": 768}, True),
                                 ("phone", {"width": 390, "height": 844}, True)]:
            print(f"[{label}] {vp['width']}x{vp['height']}")
            ctx = b.new_context(viewport=vp, has_touch=touch, device_scale_factor=2)
            page = ctx.new_page()
            page.goto(URL, wait_until="domcontentloaded")
            page.wait_for_function(
                "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
                timeout=40000,
            )
            time.sleep(2.5)
            # 범례 펼치기 (좁은 화면은 접힌 채로 시작)
            btn = page.query_selector("button:has-text('범례')")
            if btn and "▲" not in btn.inner_text():
                btn.click()
                page.wait_for_timeout(500)
            txt = shot(page, "div.pointer-events-auto.absolute.bottom-14", f"legend-{label}.png")
            if txt:
                ok = "민간도심복합(성장거점형)" in txt and "민간도심복합(주거중심형)" in txt
                print("   ", "✅" if ok else "❌", "범례에 두 유형:", ok)
            # 필터 카드
            page.click("text=필터")
            page.wait_for_timeout(500)
            f = page.query_selector("div.pointer-events-auto.rounded-2xl.border.border-slate-200.bg-white\\/95")
            f = f or page.query_selector_all("div.pointer-events-auto")[0]
            if f:
                f.screenshot(path=os.path.join(OUT, f"filters-{label}.png"))
                t = f.inner_text()
                print("   ", "✅" if ("민간도심복합(성장거점형)" in t and "민간도심복합(주거중심형)" in t) else "❌",
                      "필터 카드에 두 유형")
                print("    →", os.path.join(OUT, f"filters-{label}.png"))
            ctx.close()
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
