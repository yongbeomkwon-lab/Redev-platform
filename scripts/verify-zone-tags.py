#!/usr/bin/env python3
"""기본 구역 이름표(구역명 + 사업유형) 검증 — 서울 전경·동네 줌에서 겹침 없이 뜨는지.

   · 화면에 보이는 `.zone-tag` 개수와 이름 표본
   · 이름표끼리 사각형이 겹치는 쌍이 0인지
   · 이름표를 누르면 그 구역이 선택되는지(선택 이름표 .zone-name-label 등장)
   실행: scripts/with-dev.sh python3 scripts/verify-zone-tags.py [URL]
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100/"
OUT = "/workspace/downloads/"

OVERLAP_JS = """() => {
  const els = [...document.querySelectorAll('.zone-tag')].filter(e => e.style.visibility !== 'hidden');
  const boxes = els.map(e => { const r = e.getBoundingClientRect(); return {n: e.textContent, x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height}; });
  let overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 0 && oy > 0) overlaps.push({a: a.n, b: b.n, ox: Math.round(ox), oy: Math.round(oy)});
  }
  return {count: boxes.length, overlaps: overlaps, names: boxes.map(b => b.n).slice(0, 80)};
}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.goto(URL + "?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=40000)
    page.wait_for_selector(".zone-tag", timeout=20000)
    time.sleep(4)

    info = page.evaluate("() => ({ level: window.__redevDiag?.map()?.getLevel() })")
    first = page.evaluate(OVERLAP_JS)
    print("서울 전경 level", info["level"], "태그", first["count"], "겹침", len(first["overlaps"]))
    print("표본:", json.dumps(first["names"][:25], ensure_ascii=False))
    if first["overlaps"]:
        print("겹침 상세:", json.dumps(first["overlaps"][:5], ensure_ascii=False))
    page.screenshot(path=OUT + "tmp_tags_initial.png")

    # 동네 줌 — 장안1구역 검색으로 이동
    page.fill('input[placeholder^="구역명"]', "장안1")
    time.sleep(1.0)
    page.click("ul li button")
    time.sleep(4.0)
    second = page.evaluate(OVERLAP_JS)
    lv2 = page.evaluate("() => ({ level: window.__redevDiag?.map()?.getLevel() })")
    print("동네 줌 level", lv2["level"], "태그", second["count"], "겹침", len(second["overlaps"]))
    print("표본:", json.dumps(second["names"][:25], ensure_ascii=False))
    page.screenshot(path=OUT + "tmp_tags_neighborhood.png")

    # 강남(역삼) 근처로 한 단계 더 — 작은 구역 이름표가 나타나는지
    page.evaluate("() => window.__redevDiag.map().setLevel(5)")
    time.sleep(1.0)
    page.evaluate(
        "() => window.__redevDiag.map().setCenter(new kakao.maps.LatLng(37.5055, 127.0455))"
    )
    time.sleep(2.5)
    third = page.evaluate(OVERLAP_JS)
    print("역삼 확대 태그", third["count"], "겹침", len(third["overlaps"]))
    print("표본:", json.dumps(third["names"][:25], ensure_ascii=False))
    page.screenshot(path=OUT + "tmp_tags_zoom.png")

    # 이름표 클릭 → 구역 선택(선택 이름표 등장)
    clicked = page.evaluate(
        """() => {
          const els = [...document.querySelectorAll('.zone-tag')].filter(e => e.style.visibility !== 'hidden');
          const el = els[0]; if (!el) return null;
          const id = el.dataset.zoneId; el.click(); return {id, name: el.textContent};
        }"""
    )
    time.sleep(3.0)
    label = page.evaluate("() => { const el = document.querySelector('.zone-name-label'); return el ? el.textContent : null; }")
    print("클릭한 이름표:", json.dumps(clicked, ensure_ascii=False), "→ 선택 이름표:", label)
    page.screenshot(path=OUT + "tmp_tags_selected.png")
    b.close()
