#!/usr/bin/env python3
"""역세권·장기전세 레이어 검증 — 범례·필터·캔버스·상세 패널·사업유형 검색·주소 판별.

  사용:
    MODE=prod scripts/with-dev.sh python3 scripts/verify-yeoksegwon.py
    TARGET_URL=https://redev-platform-iota.vercel.app/?diag=1 python3 scripts/verify-yeoksegwon.py

  확인 항목
    1) 범례에 역세권(역세권활성화·청년안심주택)·장기전세(장기전세주택·미리내집) 분류와 숫자
    2) 유형 필터 칩 — 역세권/장기전세만 지도 레이어에 남고 캔버스가 다시 그려지는지
    3) 검색 자동완성 → 상세 패널의 사업유형·고시 레코드
    4) 미리내집 공급차수 병합(래미안그레이튼(6차공급) → 래미안그레이튼 + alias)
    5) 사당역~이수역~남성역 일대 캡처(기본: downloads/redev-sadang-yeoksegwon-local.png)
    6) 콘솔 오류 0건
"""
import os
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/?diag=1")
SHOT = os.environ.get("SHOT", "/workspace/downloads/redev-sadang-yeoksegwon-local.png")

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
    page.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)

    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=45000)
    time.sleep(3.5)

    # ── 1) 범례: 새 두 분류가 숫자와 함께 보이는가 ─────────────────────────────
    legend = page.query_selector("text=범례")
    legend_text = page.evaluate(
        "() => Array.from(document.querySelectorAll('div')).map(d=>d.innerText).filter(t=>t && t.includes('역세권') && t.includes('장기전세') && t.length<400)"
    )
    body = page.inner_text("body")
    check("범례에 역세권 표기", "역세권" in body)
    check("범례에 장기전세 표기", "장기전세" in body)
    print("  범례 영역:", (legend_text[0][:200].replace("\n", " | ") if legend_text else "?"))
    check("범례 역세권 = 역세권활성화·청년안심주택 설명", "역세권활성화" in body and "청년안심주택" in body)
    check("범례 장기전세 = 장기전세주택·미리내집 설명", "미리내집" in body)

    # ── 2) 필터: 역세권 칩 → 지도 레이어가 역세권만 남는가 ─────────────────────
    page.click("text=필터")
    time.sleep(0.4)
    draws0 = page.evaluate("() => window.__redevDiag.draws()")
    page.click("button:has-text('역세권')")
    time.sleep(1.2)
    draws1 = page.evaluate("() => window.__redevDiag.draws()")
    head = page.evaluate(
        "() => Array.from(document.querySelectorAll('button')).map(b=>b.innerText).filter(t=>t && t.includes('곳') && t.includes('역세권만'))"
    )
    print("  필터 후 범례 머리:", head[:2])
    check("역세권 필터 → 범례에 '역세권만'", bool(head))
    check("역세권 필터 → 캔버스 다시 그림", draws1 > draws0, f"{draws0}→{draws1}")

    page.click("button:has-text('장기전세')")
    time.sleep(1.0)
    head2 = page.evaluate(
        "() => Array.from(document.querySelectorAll('button')).map(b=>b.innerText).filter(t=>t && t.includes('장기전세만'))"
    )
    check("장기전세 필터 → 범례에 '장기전세만'", bool(head2), head2[:1])
    page.click("button:has-text('전체')")
    time.sleep(1.0)

    # ── 3) 검색 자동완성 + 상세 패널 ─────────────────────────────────────────
    inp = page.get_by_test_id("zone-search-input")
    inp.click()
    inp.fill("남성역A")
    time.sleep(0.8)
    first = page.query_selector("ul li button")
    check("검색 자동완성에 남성역A", first is not None and "남성역A" in (first.inner_text() if first else ""))
    first.click()
    time.sleep(2.5)
    aside = page.query_selector("aside")
    atext = aside.inner_text() if aside else ""
    check("상세 패널에 역세권 표기", "역세권" in atext[:200], atext[:80].replace("\n", " | "))
    check("상세 패널에 사업유형 역세권활성화", "역세권활성화" in atext)
    check("상세 패널에 고시 레코드", "11000UQ120PS202505310918" in atext)

    # ── 4) 장기전세 상세 (미리내집 공급차수 alias) ───────────────────────────
    inp.click()
    inp.fill("남성두산위브")
    time.sleep(0.8)
    first = page.query_selector("ul li button")
    if first:
        first.click()
        time.sleep(2.5)
        aside = page.query_selector("aside")
        atext = aside.inner_text() if aside else ""
        check("미리내집 상세 — 유형 표기", "미리내집" in atext and "장기전세" in atext, atext[:90].replace("\n", " | "))
        check("미리내집 공급차수 alias 검색", "차공급" in atext)
    else:
        check("미리내집 검색", False, "자동완성 결과 없음")

    # ── 5) 사당역~이수역~남성역 일대 화면 ─────────────────────────────────────
    page.keyboard.press("Escape")
    page.evaluate(
        """() => {
          const d = window.__redevDiag;
          const k = window.kakao;
          const m = d && d.map && d.map();
          if (!m) return 'no-map';
          m.setLevel(5);
          m.setCenter(new k.maps.LatLng(37.4822, 126.9788));
          return 'ok';
        }"""
    )
    time.sleep(2.5)
    page.screenshot(path=SHOT)
    print("  캡처:", SHOT)

    print("errors:", errs[:6] if errs else "none")
    check("콘솔 오류 없음", not errs, str(errs[:3]))
    ctx.close()
    b.close()

print("\n실패:", fails if fails else "없음")
