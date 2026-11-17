#!/usr/bin/env python3
"""성동·용산 37곳 반영 점검 — 데이터 로드·검색·드로어·콘솔 오류.

사용: scripts/with-dev.sh python3 scripts/verify-sy.py            (로컬)
      TARGET_URL=https://... python3 scripts/verify-sy.py        (배포본)
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100") + "/?diag=1"
SHOT = os.environ.get("SHOT", "/workspace/downloads/redev-seongdong-yongsan.png")
PREFIX = "sy-"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=30000)
    time.sleep(3)
    page.wait_for_function(
        "() => fetch('/data/zones.geojson').then(r=>r.json()).then(d=>d.features.length>2200).catch(()=>false)",
        timeout=20000,
    )

    data = page.evaluate(
        """async () => {
      const d = await (await fetch('/data/zones.geojson')).json();
      const mine = d.features.filter(f => (f.properties.id||'').startsWith('sy-'));
      return {
        total: d.features.length,
        mine: mine.map(f => ({
          id: f.properties.id, name: f.properties.name, gu: f.properties.gu,
          area: f.properties.area, geom: f.properties.geom,
          type: f.properties.type, stage: f.properties.stage,
          hasPoly: !!f.geometry, polyPts: f.geometry ? f.geometry.coordinates[0].length : 0,
          sources: (f.properties.sources||[]).length,
        })),
        meta: d.metadata.seongdongYongsan || null,
      };
    }"""
    )
    print("총 구역:", data["total"], "· 성동·용산 신규:", len(data["mine"]))
    print("meta:", json.dumps(data["meta"], ensure_ascii=False))
    for z in data["mine"]:
        print(f"  {z['id']:26s} {z['name']:28s} {z['gu']} {z['area']:>7} {z['geom']:5s} poly={z['hasPoly']}({z['polyPts']}) src={z['sources']}")

    # 검색 → 드로어
    box = page.get_by_label("구역명·자치구·주소 검색")
    box.click()
    box.fill("숙대입구역세권")
    time.sleep(1.5)
    results = page.locator("text=숙대입구역세권").count()
    print("검색 결과 노출:", results)
    page.screenshot(path="/workspace/projects/redev-platform/tmp/sy/search.png")
    if results:
        page.locator("text=숙대입구역세권").first.click()
        time.sleep(2.0)
        aside = page.query_selector("aside")
        print("드로어:", (aside.inner_text()[:160].replace("\n", " | ") if aside else "none"))
        page.screenshot(path=SHOT)
        print("스크린샷:", SHOT)

    print("engine:", page.evaluate("() => (document.querySelector('.kakao-zone-canvas') ? 'kakao' : 'leaflet')"))
    print("errors:", errs[:6] if errs else "none")

    # 점선원(경계 미고시) 표시 확인 — 신금호역세권(금호동2가 684)
    box.click()
    box.fill("신금호역세권")
    time.sleep(1.5)
    if page.locator("text=신금호역세권(금호동2가 684)").count():
        page.locator("text=신금호역세권(금호동2가 684)").first.click()
        time.sleep(2.0)
        page.screenshot(path="/workspace/downloads/redev-seongdong-yongsan-dot.png")
        print("점선원 스크린샷: /workspace/downloads/redev-seongdong-yongsan-dot.png")

    ctx.close()
    b.close()
