#!/usr/bin/env python3
"""💎 원석 찾기 라이브 검증 — 토글 켜기 · 배지/폴리곤 표시 · 카드 열기 · 콘솔 오류 0건 · 스크린샷

  python3 scripts/verify-gem-blocks.py [--out tmp/gem/live.png]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

URL = "https://redev-platform-iota.vercel.app/"
DATA = "https://redev-platform-iota.vercel.app/data/gem-blocks.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="tmp/gem/live.png")
    ap.add_argument("--url", default=URL)
    a = ap.parse_args()

    # 배포본 데이터가 실제로 올라갔는지 먼저 확인(캐시 무시)
    try:
        with urllib.request.urlopen(DATA + "?v=" + str(int(time.time())), timeout=60) as r:
            d = json.load(r)
        print(f"data: {d['summary']['total']}곳 · {len(d['blocks'])}블록 · generatedAt {d['generatedAt']}")
    except Exception as e:  # noqa: BLE001
        print("data fetch failed:", e)

    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page = ctx.new_page()
        errs: list[str] = []
        page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:200]))
        page.on(
            "console",
            lambda m: errs.append("console:" + m.text[:160]) if m.type == "error" else None,
        )
        page.goto(a.url, wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=45000)
        time.sleep(3)

        toggle = page.query_selector('[data-testid="gem-toggle"]')
        print("toggle:", bool(toggle))
        if not toggle:
            print("errors:", errs[:6])
            ctx.close()
            b.close()
            return 2
        toggle.click()
        page.wait_for_selector('[data-testid="gem-legend"]', timeout=20000)
        page.wait_for_selector('[data-testid="gem-badge"]', timeout=20000)
        time.sleep(1.5)

        badges = page.query_selector_all('[data-testid="gem-badge"]')
        legend = page.query_selector('[data-testid="gem-legend"]').inner_text().replace("\n", " | ")
        print("legend:", legend)
        print("badges:", len(badges), "first:", badges[0].inner_text() if badges else None)
        page.screenshot(path=a.out, full_page=False)

        # 배지를 눌러 카드 열기
        badges[0].click()
        page.wait_for_selector('[data-testid="gem-card"]', timeout=15000)
        time.sleep(0.8)
        card = page.query_selector('[data-testid="gem-card"]').inner_text().replace("\n", " | ")
        print("card:", card[:400])
        page.screenshot(path=a.out.replace(".png", "-card.png"))

        # 왼쪽 패널 TOP 목록
        items = page.query_selector_all('[data-testid="gem-top-item"]')
        print("top list:", len(items), items[0].inner_text().replace("\n", " | ") if items else None)

        # 지도 위 폴리곤을 직접 눌러 보기 — 두 번째 블록 중심 근처를 지도 좌표 → 화면 좌표로
        print("mapclick:", page.evaluate(
            """() => {
              const el = document.querySelector('.kakao-map-wrap > div');
              return el ? {w: el.clientWidth, h: el.clientHeight} : null;
            }"""
        ))
        print("errors:", errs[:8] if errs else "none")
        print("screenshots:", a.out, a.out.replace(".png", "-card.png"))
        ctx.close()
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
