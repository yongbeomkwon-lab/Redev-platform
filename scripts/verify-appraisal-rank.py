#!/usr/bin/env python3
"""리디브 — 구역 내 추정 감평 순위(공시가격 기반) 라이브 검증

  python3 scripts/verify-appraisal-rank.py [BASE] [OUTDIR]

  · ?zone=seocho-bangbae-467-19 로 상세 드로어를 열고, 「📊 추정 감평 순위」 카드의
    「불러오기」를 눌러 실제 공시가격 조회·순위·분위·지번 조회가 화면에서 되는지 본다.
  · 확인: 요약 숫자(최고·중위·최저), 분위 5구간, 슬라이더 보정률 반영, 지번 조회 문구
    "N건 중 O위 (상위 OO%)", 안내 문구(참고용 추정치), 금지 문구(경쟁사 이름) 없음,
    콘솔 오류 0건. 스크린샷 2장(전체 카드·지번 조회 결과).
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://redev-platform-iota.vercel.app"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/workspace/downloads"
ZONE = os.environ.get("ZONE", "seocho-bangbae-467-19")
MOBILE = os.environ.get("MOBILE", "1") == "1"

BANNED = ["정비닥터", "재개발닷컴", "갈타맵", "재개발뷰"]

results = []
failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    results.append((name, ok, detail))
    if not ok:
        failures.append(name)


def wait_done(page, card, timeout=200):
    """카드가 결과(분위 분포)나 오류로 끝날 때까지 기다린다"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        card = page.query_selector("[data-testid=zone-appraisal-rank]")
        text = card.inner_text() if card else ""
        if "분위 분포" in text or "건 중" in text:
            return "done"
        if "불러오지 못했습니다" in text or "거절" in text:
            return "error"
        page.wait_for_timeout(1500)
    return "timeout"


def mobile_pass(browser):
    """좁은 화면(390px)에서 카드가 넘치지 않고 같은 결과를 보여 주는지"""
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/?zone={ZONE}", wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    card = page.query_selector("[data-testid=zone-appraisal-rank]")
    if card is None:
        # ?zone= 로 패널이 안 열리는 화면이면 구역명으로 검색해 연다
        try:
            page.fill('input[placeholder^="구역명"]', "방배동 467-19")
            page.wait_for_timeout(900)
            page.click("ul li button")
            page.wait_for_timeout(2500)
        except Exception:
            pass
        card = page.query_selector("[data-testid=zone-appraisal-rank]")
    check("모바일: 카드 존재", card is not None)
    if card is None:
        ctx.close()
        return
    card.scroll_into_view_if_needed()
    run = card.query_selector("[data-testid=zone-appraisal-run]")
    if run:
        run.click()
    state = wait_done(page, card)
    check("모바일: 조회 완료", state == "done", state)
    overflow = page.evaluate(
        """() => {
          const c = document.querySelector('[data-testid=zone-appraisal-rank]');
          if (!c) return null;
          const bad = [];
          for (const el of c.querySelectorAll('*')) {
            if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') bad.push(el.tagName);
          }
          return { cardScroll: c.scrollWidth, cardClient: c.clientWidth, body: document.body.scrollWidth, vw: window.innerWidth, bad: bad.slice(0, 6) };
        }"""
    )
    check(
        "모바일: 가로 넘침 없음",
        bool(overflow) and overflow["cardScroll"] <= overflow["cardClient"] + 1 and overflow["body"] <= overflow["vw"] + 1,
        str(overflow),
    )
    card.screenshot(path=f"{OUTDIR}/redev_appraisal_card_mobile.png")
    check("모바일: 콘솔 오류 0건", len(errs) == 0, " | ".join(errs[:2]))
    ctx.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page = ctx.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        page.goto(f"{BASE}/?zone={ZONE}", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)

        # 구역현황 카드가 뜰 때까지 (구역 폴리곤·정밀 분석 블록)
        try:
            page.wait_for_selector("[data-testid=zone-vital-stats]", timeout=40000)
        except Exception:
            check("구역현황 카드", False, "zone-vital-stats 를 찾지 못함")
            browser.close()
            return
        card = page.query_selector("[data-testid=zone-appraisal-rank]")
        check("감평 순위 카드 존재", card is not None)
        if not card:
            browser.close()
            return

        text = card.inner_text()
        check("카드 제목", "추정 감평 순위" in text, text.splitlines()[0][:40] if text else "")

        run = card.query_selector("[data-testid=zone-appraisal-run]")
        check("불러오기 버튼", run is not None)
        if run:
            run.scroll_into_view_if_needed()
            run.click()
        # 필지 수만큼 브이월드를 왕복한다 — 진행률이 끝날 때까지 기다린다
        deadline = time.time() + 150
        state = ""
        while time.time() < deadline:
            card = page.query_selector("[data-testid=zone-appraisal-rank]")
            card_text = card.inner_text() if card else ""
            if "건 중" in card_text or "분위 분포" in card_text:
                state = "done"
                break
            if "불러오지 못했습니다" in card_text or "거절" in card_text:
                state = "error"
                break
            page.wait_for_timeout(1500)
        check("조회 완료", state == "done", state or "timeout")

        card = page.query_selector("[data-testid=zone-appraisal-rank]")
        text = card.inner_text() if card else ""
        for key, label in [
            ("[data-testid=zone-appraisal-max]", "최고"),
            ("[data-testid=zone-appraisal-p25]", "상위 25%"),
            ("[data-testid=zone-appraisal-median]", "중위"),
            ("[data-testid=zone-appraisal-min]", "최저"),
        ]:
            el = card.query_selector(key)
            val = el.inner_text() if el else ""
            check(f"요약 {label} 값", bool(re.search(r"\d", val)), val)
        check("분위 5구간", text.count("건") >= 5 and "상위 10%" in text and "하위 25%" in text)

        # 보정률 슬라이더 — 값을 바꾸면 최고 금액이 함께 바뀐다
        max_before = card.query_selector("[data-testid=zone-appraisal-max]").inner_text()
        slider = card.query_selector("[data-testid=zone-appraisal-slider]")
        box = slider.bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.9, box["y"] + box["height"] / 2)
        page.wait_for_timeout(600)
        mult = card.query_selector("[data-testid=zone-appraisal-mult]").inner_text()
        max_after = card.query_selector("[data-testid=zone-appraisal-max]").inner_text()
        check("보정률 슬라이더 반영", mult != "×1.30" and max_after != max_before, f"{mult} · {max_before} → {max_after}")

        card.screenshot(path=f"{OUTDIR}/redev_appraisal_card.png")

        # 지번 조회 — datalist 첫 지번을 그대로 넣는다
        inp = card.query_selector("[data-testid=zone-appraisal-query]")
        first_option = page.evaluate(
            "() => { const l = document.querySelector('#zone-appraisal-jibun'); return l && l.options.length ? l.options[0].value : null; }"
        )
        check("지번 후보(datalist)", bool(first_option), str(first_option))
        if first_option:
            inp.click()
            inp.type(first_option)
            page.wait_for_timeout(700)
            match = card.query_selector("[data-testid=zone-appraisal-match]")
            mtext = match.inner_text() if match else ""
            check("지번 순위 문구", bool(re.search(r"\d+건 중 \d+위", mtext)), mtext.replace("\n", " / ")[:80])
            check("상위 % 표시", bool(re.search(r"상위 \d+(\.\d+)?%", mtext)), "")

        # 금액 조회 — 구역 금액대 하나를 넣어 본다
        amount_btn = card.query_selector("button:has-text('금액')")
        if amount_btn:
            amount_btn.click()
            page.wait_for_timeout(300)
            inp = card.query_selector("[data-testid=zone-appraisal-query]")
            inp.click()
            inp.type("9억")
            page.wait_for_timeout(500)
            abox = card.query_selector("[data-testid=zone-appraisal-amount-rank]")
            atext = abox.inner_text() if abox else ""
            check("금액 순위 문구", bool(re.search(r"\d+건 중 \d+위", atext)), atext.replace("\n", " / ")[:80])
        card.screenshot(path=f"{OUTDIR}/redev_appraisal_lookup.png")

        # 안내 문구 · 금지 문구
        text = card.inner_text()
        check("참고용 추정치 안내", "참고용 추정치" in text and "감정평가" in text, "")

        # 저장된 결과 — 새로고침 뒤에도 「불러오기」 없이 바로 뜼다(브라우저 30일 저장)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(6000)
        card2 = page.query_selector("[data-testid=zone-appraisal-rank]")
        t2 = card2.inner_text() if card2 else ""
        check("저장 결과 즉시 표시(새로고침)", "분위 분포" in t2, t2.splitlines()[0][:30] if t2 else "카드 없음")

        page_text = page.inner_text("body")
        found = [b for b in BANNED if b in page_text]
        check("경쟁사 이름 없음", not found, ",".join(found))

        check("콘솔 오류 0건", len(console_errors) == 0, " | ".join(console_errors[:2]))
        if MOBILE:
            mobile_pass(browser)
        browser.close()

    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))


if __name__ == "__main__":
    main()
