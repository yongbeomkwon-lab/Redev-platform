#!/usr/bin/env python3
"""운영 배포본 검증 — 용두동 39번지 일대 3개 구역(용두3·가칭 용두7·가칭 용두8).

  BASE=https://redev-platform-iota.vercel.app ZONE=y3 python3 scripts/verify-yongdu378-20261121.py

하는 일
  · `/?zone=<id>` 로 운영 사이트를 열어 드로어가 그 구역을 보여 주는지 확인(이름·단계·면적·지번 메모).
  · 지도를 그 구역으로 옮겨 화면을 캡처(OUT 경로).
  · ZONE=y8 이면 검색창에 '용두8'을 입력해 결과 목록에 잡히는지까지 확인한다(사용자가 못 찾던 문제).
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://redev-platform-iota.vercel.app")
ZONE = os.environ.get("ZONE", "y3")
W = int(os.environ.get("W", "1440"))
H = int(os.environ.get("H", "1000"))

ZONES = {
    "y3": {
        "id": "11230UQ120PS202605210001",
        "out": "/workspace/downloads/리디브_용두3구역_2026-11-21.png",
        "level": 3,
        "expect": ["용두3구역", "추진위구성", "23,793", "39-361", "695세대", "95.78"],
        "search": None,
    },
    "y7": {
        "id": "rest17gu-ddm-용두동-39",
        "out": "/workspace/downloads/리디브_용두7구역_2026-11-21.png",
        "level": 4,
        "expect": ["용두동 39", "대상지선정(2026-11-13)", "75,408", "가칭 용두7구역", "75,729"],
        "search": ("용두7", "용두동 39"),
    },
    "y8": {
        "id": "rest17gu-ddm-용두동-39-24-역세시프",
        "out": "/workspace/downloads/리디브_용두8구역_2026-11-21.png",
        "level": 2,
        "expect": ["용두8역세권", "번호부여(2025-06-20)", "26,485.8", "39-446", "39-15"],
        "search": ("용두8", "용두8역세권"),
    },
}

cfg = ZONES[ZONE]
if os.environ.get("OUT"):
    cfg = dict(cfg, out=os.environ["OUT"])

# 구역 중심 좌표 — zones.geojson(로컬 빌드와 같은 파일)
with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "public", "data", "zones.geojson"), encoding="utf-8") as fp:
    fc = json.load(fp)
feat = next(f for f in fc["features"] if f["properties"].get("id") == cfg["id"])
props = feat["properties"]
if props.get("center"):
    lat, lng = props["center"]
else:
    ring = feat["geometry"]["coordinates"][0]
    lats = [p[1] for p in ring]
    lngs = [p[0] for p in ring]
    lat, lng = (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2

url = f"{BASE}/?zone={cfg['id']}&diag=1"
print("open", url)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
    time.sleep(6)

    # 지도를 그 구역으로 — 폴리곤 구역은 경계가 한눈에, 점 구역은 점선 원이 보이게.
    #   ★ 프로그램으로 setLevel 하면 앱 상태(줌 유지)가 곧바로 되돌려 화면이 안 바뀐다.
    #     사용자가 하는 것과 같은 입력(지도 위 마우스 휠)으로만 화면이 실제로 확대된다.
    page.mouse.move(700, 500)
    for _ in range(6):
        cur = page.evaluate("() => window.__redevDiag.map().getLevel()")
        if cur <= cfg["level"]:
            break
        page.mouse.wheel(0, -240)
        time.sleep(1.8)
    time.sleep(1.2)
    page.screenshot(path=cfg["out"])
    print("saved", cfg["out"])
    print("map level:", page.evaluate("() => window.__redevDiag.map().getLevel()"), "target", cfg["level"])

    body = page.inner_text("body")
    missing = [s for s in cfg["expect"] if s not in body]
    print("drawer-check:", "OK" if not missing else f"MISSING {missing}")

    # 검색어로도 잡히는지 (사용자가 지도에서 못 찾던 문제)
    search_ok = None
    if cfg["search"]:
        term, expect_name = cfg["search"]
        box = page.locator("input[placeholder*='구역명']").first
        box.click()
        box.fill("")
        box.type(term, delay=40)
        time.sleep(2.5)
        hits = page.inner_text("body")
        search_ok = expect_name in hits
        print(f"search '{term}' → {expect_name}: {'OK' if search_ok else 'NOT FOUND'}")
        page.screenshot(path=cfg["out"].replace(".png", "_search.png"))
        # 검색 결과 첫 항목을 눌러 그 구역으로 이동
        try:
            page.get_by_text(expect_name, exact=False).first.click(timeout=4000)
            time.sleep(4)
            page.evaluate("() => window.__redevDiag.draw && window.__redevDiag.draw()")
            time.sleep(2)
            print("map level after search pick:", page.evaluate("() => window.__redevDiag.map().getLevel()"))
        except Exception as e:
            print("검색 결과 클릭 실패:", str(e)[:120])
    print("errors:", errs[:5])
    ctx.close()
    b.close()

print(json.dumps({"zone": ZONE, "missing": missing, "search_ok": search_ok}, ensure_ascii=False))
sys.exit(1 if missing else 0)
