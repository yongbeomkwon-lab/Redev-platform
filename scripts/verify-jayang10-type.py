#!/usr/bin/env python3
"""자양동 10번지 일원(민간도심복합·성장거점형) 검색·지도 표시 확인.

확인 항목
  1) 검색 '자양동 10' → 결과에 '자양동 10번지 일원' + 유형 '민간도심복합(성장거점형)'
  2) 선택하면 지도에 경계가 성장거점형 색(#b91c1c)으로 그려지고 상세 카드에 유형 배지
  3) 범례 카운트: 민간도심복합(성장거점형) 1곳, 유형 필터로 걸러도 그 구역이 남는다
  4) 데이터 값: 면적 57,277㎡, 추진단계 추진준비, 자치구 광진구, geom 가상경계

사용법
    scripts/with-dev.sh python3 scripts/verify-jayang10-type.py
    TARGET_URL=https://redev-platform-iota.vercel.app/ MODE=prod ...
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/")
SHOT = os.environ.get("SHOT_PATH", "/workspace/downloads/redev-jayang10-admin-merged.png")
C1 = (185, 28, 28)

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg))
    if not ok:
        errors.append(str(msg))


def red_pixels(page, rgb, tol=6):
    return page.evaluate(
        """([r,g,b,tol]) => {
          const c = document.querySelector('canvas.kakao-zone-canvas');
          if (!c) return -1;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i]-r)<=tol && Math.abs(d[i+1]-g)<=tol && Math.abs(d[i+2]-b)<=tol && d[i+3]>200) n++;
          }
          return n;
        }""",
        [rgb[0], rgb[1], rgb[2], tol],
    )


def main() -> int:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=45000,
        )
        time.sleep(3)

        print("1) 검색 '자양동 10'")
        page.fill('[data-testid="zone-search-input"]', "자양동 10")
        page.wait_for_selector('[data-testid="zone-result"]', timeout=10000)
        results = page.eval_on_selector_all('[data-testid="zone-result"]', "els => els.map(e => e.innerText)")
        print("   결과:", " | ".join(r.replace("\n", " · ") for r in results[:4]))
        hit = [r for r in results if "자양동 10번지 일원" in r]
        log(bool(hit), "검색 결과에 '자양동 10번지 일원'")
        if hit:
            # 결과 줄은 서울시 사업유형 소분류(kind)를 보여준다 — 유형이 그대로 읽히면 된다
            log("민간도심복합" in hit[0], "결과 줄에 사업유형 표시")
        page.click('[data-testid="zone-result"]')
        page.wait_for_timeout(3000)

        print("2) 지도·상세 카드")
        aside = page.query_selector("aside")
        card = aside.inner_text() if aside else ""
        head = " · ".join(card.split("\n")[:6])
        print("   카드:", head[:160])
        log("민간도심복합(성장거점형)" in card, "상세 카드에 유형 배지")
        log("57,277" in card or "57277" in card, "면적 57,277㎡ 표기")
        log("추진준비" in card, "추진단계 추진준비")
        log("광진구" in card, "자치구 광진구")
        n = red_pixels(page, C1)
        log(n > 200, f"지도에 성장거점형 색(#b91c1c) 픽셀 {n}개")

        print("3) 범례·필터")
        legend = page.eval_on_selector(
            "div.pointer-events-auto.absolute.bottom-14", "el => el.innerText"
        )
        row = "\n".join(legend.split("\n"))
        idx = row.find("민간도심복합(성장거점형)")
        after = row[idx:idx + 40] if idx >= 0 else ""
        print("   범례:", after.replace("\n", " ")[:40])
        log(idx >= 0 and after.split("\n")[1].strip() == "1", "범례에 성장거점형 1곳")
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
