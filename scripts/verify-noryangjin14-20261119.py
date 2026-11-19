#!/usr/bin/env python3
"""노량진14구역 고시 구역계 반영 검증 (2026-11-19).

확인
  1) 데이터: geom=고시도면, 단계·면적·정점 수, 도형 면적 vs 고시 59,308.3㎡,
     겹침(인접 구역) 0, metadata.count == 실제 구역 수
  2) 브라우저(운영): "노량진14" 검색 → 결과 → 상세 카드 → 지도에 폴리곤이 그려지는지(픽셀)
     → 지적편집도 켜고 스크린샷(지번 경계 대조)
사용법
  python3 scripts/verify-noryangjin14-20261119.py
"""
import json
import math
import os
import time
import urllib.request

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "https://redev-platform-iota.vercel.app/")
SHOT_DIR = os.environ.get("SHOT_DIR", "/workspace/downloads")
C_SINTHONG = (124, 58, 237)  # 신통기획 #7c3aed
GOSI_AREA = 59308.3

errors: list[str] = []


def log(ok, msg):
    print(("  OK  " if ok else "  FAIL ") + str(msg))
    if not ok:
        errors.append(str(msg))


def fetch_zones():
    with urllib.request.urlopen(URL.rstrip("/") + "/data/zones.geojson?ts=" + str(int(time.time())), timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def ring_area_m2(coords):
    lat0 = sum(c[1] for c in coords) / len(coords)
    mx = 111320 * math.cos(math.radians(lat0))
    my = 110540
    pts = [(c[0] * mx, c[1] * my) for c in coords]
    s = 0.0
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def color_pixels(page, rgb, tol=10):
    return page.evaluate(
        """([r,g,b,tol]) => {
          const c = document.querySelector('canvas.kakao-zone-canvas');
          if (!c) return -1;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i]-r)<=tol && Math.abs(d[i+1]-g)<=tol && Math.abs(d[i+2]-b)<=tol && d[i+3]>120) n++;
          }
          return n;
        }""",
        list(rgb) + [tol],
    )


def main() -> int:
    print("0) 데이터")
    fc = fetch_zones()
    feats = {f["properties"]["id"]: f for f in fc["features"]}
    print(f"   구역 {len(fc['features'])}곳 · metadata.count {fc['metadata'].get('count')}")
    log(len(fc["features"]) == fc["metadata"].get("count"), "metadata.count == 실제 구역 수")
    log(len(feats) == len(fc["features"]), "id 중복 없음")

    f = feats.get("noryangjin-14")
    log(f is not None, "noryangjin-14 존재")
    if f:
        p = f["properties"]
        g = f["geometry"]
        log(g is not None and g["type"] == "Polygon", f"geometry {g and g['type']} (경계 있음)")
        log(p["geom"] == "고시도면" and p.get("boundaryApprox") is False, "경계 출처 = 고시도면(실경계)")
        log(p["stage"].startswith("후보지선정"), f"단계 {p['stage']}")
        log(p["area"] == GOSI_AREA, f"고시 면적 {p['area']}㎡")
        log(p["name"] == "노량진14구역" and any("노량진동 205-269" in a for a in p.get("alias", [])),
            f"이름 {p['name']} · 별칭 {p.get('alias')}")
        if g:
            a = ring_area_m2(g["coordinates"][0])
            log(abs(a - GOSI_AREA) / GOSI_AREA < 0.05,
                f"도형 면적 {a:,.0f}㎡ (고시 {GOSI_AREA:,.1f}㎡ 대비 {(a-GOSI_AREA)/GOSI_AREA*100:+.1f}%)")
            log(len(g["coordinates"][0]) >= 40, f"정점 {len(g['coordinates'][0])}개")
        log("본동 441" in (p.get("boundaryNote") or ""), "boundaryNote: 본동 441 겹침 절단 기록")
        log(any("2026-266" in s.get("label", "") for s in p.get("sources", [])), "출처: 서울특별시고시 제2026-266호")

        # 겹침 검사
        from shapely.geometry import shape

        z = shape(g)
        mx = 111320 * math.cos(math.radians(z.centroid.y))
        my = 110540
        ov = []
        for f2 in fc["features"]:
            if f2["properties"]["id"] == "noryangjin-14" or not f2["geometry"]:
                continue
            try:
                z2 = shape(f2["geometry"])
            except Exception:
                continue
            if z2.intersects(z):
                inter = z2.intersection(z).area * mx * my
                if inter > 1:
                    ov.append((round(inter, 1), f2["properties"].get("name")))
        log(not ov, f"인접 구역 겹침 0 (겹침: {ov[:3] if ov else '없음'})")

    print("1) 브라우저(운영)")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))
        page.goto(URL + "?zone=noryangjin-14", wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(4)
        card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
        print("   상세 카드:", card[:160].replace("\n", " | "))
        log("노량진" in card, "상세 카드: 구역명 표시")
        log("후보지선정" in card, "상세 카드: 단계 후보지선정")
        log("59,308" in card or "59308" in card, "상세 카드: 면적 59,308㎡")
        n = color_pixels(page, C_SINTHONG)
        log(n > 800, f"지도 픽셀(신통기획) {n}개 — 폴리곤이 그려짐")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-noryangjin14.png"))
        page.click('button[title^="지적편집도"]')
        page.wait_for_timeout(5000)
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-noryangjin14-jijeok.png"))
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
    raise SystemExit(main())
