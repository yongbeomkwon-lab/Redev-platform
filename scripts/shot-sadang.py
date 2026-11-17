#!/usr/bin/env python3
"""배포본 사당역~이수역~남성역 일대 캡처 (역세권·장기전세 레이어 포함)."""
import time

from playwright.sync_api import sync_playwright

URL = "https://redev-platform-iota.vercel.app/?diag=1"
OUT = "/workspace/downloads/redev-sadang-yeoksegwon.png"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=45000)
    time.sleep(4)

    # 오른쪽 드로어를 접어 지도를 넓게
    try:
        page.click("button:has-text('접기')", timeout=3000)
    except Exception as e:
        print("drawer close skip:", e)
    time.sleep(0.8)

    # 사당역(37.4765,126.9784) · 이수역(37.4837,126.9814) · 남성역(37.4843,126.9712)이 모두 들어오는 화면
    #   level 4 ≈ 2.9km × 1.7km (1440×900) — 세 역을 한 화면에 담는 가장 가까운 배율
    page.evaluate(
        """() => {
          const d = window.__redevDiag, k = window.kakao;
          const m = d && d.map && d.map();
          if (!m) return 'no-map';
          m.setCenter(new k.maps.LatLng(37.4805, 126.9757));
          m.setLevel(4);
          return 'ok';
        }"""
    )
    # 레벨·중심이 두 번 연속 같아질 때까지(타일·캔버스가 그 자리에 선 뒤) 캡처
    last = None
    for _ in range(12):
        time.sleep(0.8)
        cur = page.evaluate(
            "() => { const m = window.__redevDiag.map(); const b = m.getBounds();"
            " return [m.getLevel(), +m.getCenter().getLat().toFixed(6), +m.getCenter().getLng().toFixed(6),"
            " +b.getSouthWest().getLat().toFixed(5), +b.getNorthEast().getLng().toFixed(5)]; }"
        )
        if cur == last:
            break
        last = cur
    print("view:", last)
    page.evaluate("() => window.__redevDiag.draw()")
    time.sleep(2)

    body = page.inner_text("body")
    print("legend:", [ln for ln in body.split("\n") if "역세권" in ln or "장기전세" in ln][:4])
    print("draws:", page.evaluate("() => window.__redevDiag.draws()"), "anchor:", page.evaluate("() => window.__redevDiag.anchor()"))
    page.screenshot(path=OUT)
    print("saved", OUT)
    print("errors:", errs[:4] if errs else "none")
    ctx.close()
    b.close()
