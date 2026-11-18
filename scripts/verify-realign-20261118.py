#!/usr/bin/env python3
"""수정 구역 화면 확인 + ‘구역을 클릭하면 지도가 작아지던’ 회귀 확인.

  사용: MODE=prod scripts/with-dev.sh python3 scripts/verify-realign-20261118.py
        BASE=https://redev-platform-iota.vercel.app python3 scripts/verify-realign-20261118.py
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3100")
OUT = "/workspace/downloads"
ZONES = json.load(open(os.path.join(os.path.dirname(__file__), "..", "public", "data", "zones.geojson")))
BY = {f["properties"]["id"]: f for f in ZONES["features"]}

# (검색어, 결과 라벨, 파일명, 구역 id, 화면 레벨)
SHOTS = [
    ("사당동 419", "(가칭)사당동 419 일대 민간도심복합", "redev-sadang-419-v2.png", "dj-sadang-419-mdb", 3),
    ("수유동 310-15", "수유동 310-15", "redev-suyu-310-15-v2.png", "gangbuk-suyu-310-15", 2),
    ("광흥창역세권", "광흥창역세권(신수동 301-1)", "redev-gwangheungchang-301-1-v2.png", "mp-shinsu-301-1", 2),
    ("상수동 319-4", "상수동 319-4", "redev-sangsu-319-4-v2.png", "mapo-sangsu-319-4", 3),
]
fail = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        fail.append(name)


def centroid(zone_id):
    ring = BY[zone_id]["geometry"]["coordinates"][0]
    lat = sum(p[1] for p in ring) / len(ring)
    lng = sum(p[0] for p in ring) / len(ring)
    return lat, lng


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 940}, device_scale_factor=1.6)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:140]) if m.type == "error" else None)
    page.goto(BASE + "/?diag=1", wait_until="domcontentloaded")
    page.wait_for_selector(".kakao-zone-canvas", timeout=120000)
    time.sleep(4)

    def search_and_pick(q, label):
        box = page.locator("input[placeholder*='구역명']").first
        box.click()
        box.fill("")
        box.fill(q)
        time.sleep(1.8)
        try:
            page.locator(f"text={label}").first.click(timeout=7000)
        except Exception:
            page.get_by_text(label, exact=True).first.click(timeout=7000)
        time.sleep(2.5)

    for q, label, fname, zid, lvl in SHOTS:
        search_and_pick(q, label)
        if zid:
            la, ln = centroid(zid)
            page.evaluate(
                "([la,ln,lv]) => { const m = window.__redevDiag.map();"
                " m.setLevel(lv); m.setCenter(new kakao.maps.LatLng(la,ln));"
                " window.__redevDiag.draw && window.__redevDiag.draw(); }",
                [la, ln, lvl],
            )
            time.sleep(2.2)
        body = page.inner_text("body")
        ok = "구역면적" in body
        page.screenshot(path=f"{OUT}/{fname}")
        check(f"{label} 상세 패널", ok, f"{OUT}/{fname}")

    # ── 회귀: 지도에서 다른 구역을 클릭하면 줌이 그대로여야 한다 ──────────
    search_and_pick("사당15구역", "사당15구역")
    lvl1 = page.evaluate("() => window.__redevDiag.map().getLevel()")
    lat, lng = centroid("dj-sadang-419-mdb")
    pt = page.evaluate(
        """([lat, lng]) => {
             const m = window.__redevDiag.map();
             const p = m.getProjection().containerPointFromCoords(new kakao.maps.LatLng(lat, lng));
             return [p.x, p.y];
           }""",
        [lat, lng],
    )
    box = page.locator(".kakao-zone-canvas").first.bounding_box()
    x, y = box["x"] + pt[0], box["y"] + pt[1]
    inside = 0 < pt[0] < box["width"] and 0 < pt[1] < box["height"]
    print(f"클릭 지점 {x:.0f},{y:.0f} (캔버스 {box['width']:.0f}x{box['height']:.0f}) 화면 안={inside}")
    if inside:
        page.mouse.click(x, y)
        time.sleep(2.5)
        lvl2 = page.evaluate("() => window.__redevDiag.map().getLevel()")
        txt = page.inner_text("body")
        picked = "사당동 419" in txt
        check("지도 클릭으로 사당419 선택", picked)
        check("클릭 후 줌 유지", lvl1 == lvl2, f"level {lvl1} → {lvl2}")
        page.screenshot(path=f"{OUT}/redev-click-zoom-after.png")
    else:
        print("SKIP 클릭 회귀 — 대상 지점이 화면 밖")

    check("콘솔 오류 0", len(errs) == 0, "; ".join(errs[:2]))
    b.close()

print("\n실패:", fail if fail else "없음")
raise SystemExit(1 if fail else 0)
