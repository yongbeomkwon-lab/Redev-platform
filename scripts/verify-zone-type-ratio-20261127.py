#!/usr/bin/env python3
"""리디브 — 유형 비율(단독·근생 vs 빌라) 라이브 검증 (2026-11-27)

  python3 scripts/verify-zone-type-ratio-20261127.py [ZONE] [--mobile]
  환경변수 BASE(기본 https://redev-platform-iota.vercel.app), OUTDIR(기본 /workspace/downloads)

  · ZONE 구역을 열어 정밀 분석 패널의 「유형 비율 (단독·근생 vs 빌라)」를 확인한다.
    방배동 467-19 처럼 확정 전 구역은 `분석 실행`을 눌러 돌린다(나머지는 자동).
  · 브라우저가 실제로 받은 /api/zone-stats/precise 청크의 types 를 합쳐, 화면에 적힌
    동수·비율(%)이 그 합과 같은지 대조한다(계산·표시 검증).
  · 데스크톱(1440)은 새로 분석해 결과를 남기고, --mobile 은 그 저장 결과(localStorage)를
    물려받아 390 폭에서 렌더링만 확인한다 — 같은 구역을 두 번 조회하지 않는다.
  · 콘솔 error·pageerror 를 모아 0건인지 확인하고, 패널·카드 스크린샷을 남긴다.

  두 구역 예:
    python3 scripts/verify-zone-type-ratio-20261127.py seocho-bangbae-467-19
    python3 scripts/verify-zone-type-ratio-20261127.py seocho-bangbae-467-19 --mobile
    python3 scripts/verify-zone-type-ratio-20261127.py 11620UQ120PS202605200001
"""
import json
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://redev-platform-iota.vercel.app").rstrip("/")
OUTDIR = os.environ.get("OUTDIR", "/workspace/downloads")
MOBILE = "--mobile" in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
ZONE = ARGS[0] if ARGS else "seocho-bangbae-467-19"
STATE = os.path.join(OUTDIR, f".zone-type-ratio-state-{ZONE}.json")
TAG = f"{ZONE}-{'mobile' if MOBILE else 'desktop'}"
WAIT_MS = int(os.environ.get("WAIT_MS", "600000"))

KEYS = ("villa", "detached", "commercial", "apartment")

READ_JS = """
() => {
  const root = document.querySelector('[data-testid=zone-precise-type-ratio]');
  if (!root) return null;
  const card = (key) => {
    const el = document.querySelector(`[data-testid=zone-precise-type-${key}]`);
    if (!el) return null;
    const t = el.innerText.replace(/\\s+/g, ' ').trim();
    const dong = /([\\d,]+)\\s*동/.exec(t);
    const pct = /(\\d+(?:\\.\\d+)?)\\s*%/.exec(t);
    return { text: t, dong: dong ? Number(dong[1].replace(/,/g, '')) : null, pct: pct ? Number(pct[1]) : null };
  };
  const segs = [...document.querySelectorAll('[data-testid^=zone-precise-type-seg-]')]
    .map((s) => ({ key: s.getAttribute('data-testid').replace('zone-precise-type-seg-', ''), width: s.style.width }));
  const cmp = document.querySelector('[data-testid=zone-precise-type-compare]');
  const note = document.querySelector('[data-testid=zone-precise-type-note]');
  return {
    text: root.innerText,
    header: root.innerText.split('\\n')[0],
    villa: card('villa'), detached: card('detached'), commercial: card('commercial'), apartment: card('apartment'),
    segs, compare: cmp ? cmp.innerText.replace(/\\s+/g, ' ').trim() : '', note: note ? note.innerText.replace(/\\s+/g, ' ').trim() : '',
    overflowX: root.scrollWidth > root.clientWidth + 1,
    rootWidth: root.clientWidth,
  };
}
"""


def main() -> int:
    checks: list[bool] = []
    errs: list[str] = []

    def check(ok: bool, label: str) -> None:
        checks.append(ok)
        print(f"  {'OK  ' if ok else 'FAIL'} {label}")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        if MOBILE:
            viewport = {"width": 390, "height": 844}
            ctx = browser.new_context(
                viewport=viewport,
                device_scale_factor=3,
                is_mobile=True,
                has_touch=True,
                storage_state=STATE if os.path.exists(STATE) else None,
            )
        else:
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)

        sums = {k: {"dong": 0, "units": 0, "floorArea": 0.0} for k in KEYS}
        seen_chunks = set()

        def on_response(resp):
            if "/api/zone-stats/precise" not in resp.url:
                return
            try:
                body = resp.json()
            except Exception:
                return
            if not body.get("ok"):
                return
            chunk = body.get("chunk") or {}
            types = chunk.get("types")
            if not types:
                return
            key = json.dumps({k: types[k]["dong"] for k in KEYS}) + str(chunk.get("buildings"))
            if key in seen_chunks:
                return
            seen_chunks.add(key)
            for k in KEYS:
                for f in ("dong", "units", "floorArea"):
                    sums[k][f] += (types.get(k) or {}).get(f, 0)

        page.on("response", on_response)

        print(f"===== {ZONE} ({'모바일 390' if MOBILE else '데스크톱 1440'}) =====")
        page.goto(f"{BASE}/?zone={ZONE}", wait_until="domcontentloaded")
        try:
            page.wait_for_selector("[data-testid=zone-vital-stats]", timeout=120000)
        except Exception:
            print("  FAIL 구역현황 패널이 뜨지 않았습니다")
            return 1

        # 확정 전 구역은 분석 실행 버튼을 눌러야 돈다(자동 구역은 버튼이 없거나 ↻ 다시).
        #   모바일은 데스크톱 실행이 저장해 둔 결과(localStorage)를 물려받아 바로 뜨는지 본다.
        try:
            page.wait_for_timeout(2500)
            btn = page.query_selector("[data-testid=zone-precise-run]")
            label = btn.inner_text().strip() if btn else ""
            if btn and "분석 실행" in label:
                print("  → 「분석 실행」 클릭")
                btn.click()
        except Exception as e:
            print("  (분석 실행 클릭 생략:", str(e)[:80], ")")

        t0 = time.time()
        try:
            page.wait_for_selector("[data-testid=zone-precise-type-ratio]", timeout=WAIT_MS)
        except Exception:
            print("  FAIL 유형 비율 섹션이 나타나지 않았습니다")
            page.screenshot(path=f"{OUTDIR}/redev_type_ratio_{TAG}_fail.png", full_page=False)
            return 1
        print(f"  유형 비율 표시까지 {time.time() - t0:.0f}초")
        page.wait_for_timeout(600)

        ui = page.evaluate(READ_JS)
        print("  ── 화면 ──")
        print("  " + (ui["header"] if ui else "(없음)"))
        for k in KEYS:
            c = ui.get(k) if ui else None
            if c:
                print(f"    {k}: {c['text']}")
        print("  비교:", ui["compare"])
        print("  안내:", ui["note"])
        print("  바:", ui["segs"])

        check(ui is not None, "유형 비율 섹션 렌더")
        if ui:
            check(all(ui[k] for k in ("villa", "detached", "commercial")), "빌라·단독·근생 카드 3개 표시")
            check("vs" in ui["compare"] and "빌라" in ui["compare"], "「… vs 빌라 …」 대비 한 줄 표시")
            check(not ui["overflowX"], "가로 넘침 없음")
            total_dong = sum(ui[k]["dong"] or 0 for k in KEYS if ui[k])
            print(f"  화면 동수 합 {total_dong} / 주건축물 {re.search(r'주건축물 ([\d,]+)동', ui['text']).group(1) if re.search(r'주건축물 ([\d,]+)동', ui['text']) else '?'}")
            # 비율 합이 100 근처인지(반올림 오차 포함)
            pct_sum = sum(ui[k]["pct"] or 0 for k in KEYS if ui[k])
            check(abs(pct_sum - 100) <= 1.5, f"비율 합 {pct_sum:.1f}% (100±1.5)")
            # 아파트 0동이면 카드가 없어야 한다
            has_apt = ui["apartment"] is not None
            check(not has_apt or (ui["apartment"]["dong"] or 0) > 0, "아파트 카드는 있을 때만(0동이면 숨김)")

        api_total = sum(sums[k]["dong"] for k in KEYS)
        if api_total > 0:
            print("  ── API 청크 합계 ──")
            for k in KEYS:
                print(f"    {k}: {sums[k]['dong']}동 · {sums[k]['units']}세대/가구 · {round(sums[k]['floorArea'])}㎡")
            for k in KEYS:
                if ui and ui.get(k):
                    check(ui[k]["dong"] == sums[k]["dong"], f"{k} 동수 화면={ui[k]['dong']} API={sums[k]['dong']}")
                    expect_pct = round(sums[k]["dong"] / api_total * 100, 1)
                    check(abs((ui[k]["pct"] or 0) - expect_pct) <= 0.15, f"{k} 비율 화면={ui[k]['pct']} 계산={expect_pct}")
        else:
            print("  (캐시된 결과로 렌더 — API 합계 대조는 데스크톱 실행에서 한다)")
        # 아파트 버킷은 API 에 0동일 때 카드가 없어야 한다
        if api_total > 0 and ui:
            check((ui["apartment"] is not None) == (sums["apartment"]["dong"] > 0), "아파트 카드 유무 = API 0동 여부")

        # 스크린샷 — 카드·패널 두 장
        root = page.query_selector("[data-testid=zone-precise-type-ratio]")
        if root:
            root.screenshot(path=f"{OUTDIR}/리디브_유형비율_{ZONE}_{'모바일' if MOBILE else '데스크톱'}.png")
            print("  saved", f"{OUTDIR}/리디브_유형비율_{ZONE}_{'모바일' if MOBILE else '데스크톱'}.png")
        aside = page.query_selector("aside")
        if aside:
            aside.screenshot(path=f"{OUTDIR}/리디브_유형비율_패널_{ZONE}_{'모바일' if MOBILE else '데스크톱'}.png")
            print("  saved", f"{OUTDIR}/리디브_유형비율_패널_{ZONE}_{'모바일' if MOBILE else '데스크톱'}.png")

        if not MOBILE:
            ctx.storage_state(path=STATE)
            print("  저장된 상태:", STATE)

        print("\n  errors:", errs[:10] if errs else "none")
        check(len(errs) == 0, "콘솔 오류 0건")
        ctx.close()
        browser.close()

    print(f"\n=== {sum(1 for x in checks if x)}/{len(checks)} checks passed ===")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
