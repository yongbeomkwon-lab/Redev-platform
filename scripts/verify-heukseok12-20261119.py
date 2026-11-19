#!/usr/bin/env python3
"""흑석12구역 신규 반영 · 흑석10 정비구역지정(공람) 상향 검증 (2026-11-19).

확인
  1) 데이터(운영 zones.geojson)
     · dj-heukseok-12: 존재, geom=공고도면, 면적 88,093.05㎡, 정점 수, 도형 면적 vs 공고 면적,
       별칭·출처, metadata.count == 실제 구역 수
     · 11000UQ120PS202601310017(흑석10): stage=정비구역지정(공람), area=48,693.8㎡,
       2026-10-29 신통기획 확정·2026-11-12 동작구 공고 제2026-1856호 근거 문구
     · 흑석12 ↔ 흑석숲마을 등 겹침: 도면 내용대로 남겼는지 보고(0으로 만들지 않음)
  2) 브라우저(운영): ?zone=... 으로 상세 카드·지도 폴리곤(픽셀) 확인 + 스크린샷
     · downloads/redev-heukseok12.png, downloads/redev-heukseok12-jijeok.png, downloads/redev-heukseok10.png
사용법
  python3 scripts/verify-heukseok12-20261119.py
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
H12_ID = "dj-heukseok-12"
H10_ID = "11000UQ120PS202601310017"
H12_AREA = 88093.05
H10_AREA = 48693.8

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
    print("0) 데이터(운영)")
    fc = fetch_zones()
    feats = {f["properties"]["id"]: f for f in fc["features"]}
    print(f"   구역 {len(fc['features'])}곳 · metadata.count {fc['metadata'].get('count')}")
    log(len(fc["features"]) == fc["metadata"].get("count"), "metadata.count == 실제 구역 수")
    log(len(feats) == len(fc["features"]), "id 중복 없음")

    print("1) 흑석12구역")
    f = feats.get(H12_ID)
    log(f is not None, f"{H12_ID} 존재")
    if f:
        p, g = f["properties"], f["geometry"]
        log(g is not None and g["type"] == "Polygon", f"geometry {g and g['type']} (경계 있음)")
        log(p.get("geom") == "공고도면" and p.get("boundaryApprox") is False, "경계 출처 = 공고도면(실경계)")
        log(p.get("name") == "흑석12구역", f"이름 {p.get('name')}")
        log(p.get("stage") == "연번부여(2026-05-22)", f"단계 {p.get('stage')}")
        log(abs((p.get("area") or 0) - H12_AREA) < 0.01, f"공고 면적 {p.get('area')}㎡")
        log(any("186-25" in a for a in p.get("alias", [])), f"별칭 {p.get('alias')}")
        if g:
            ring = g["coordinates"][0]
            log(ring[0] == ring[-1], f"링 닫힘 ({len(ring)}점)")
            a = ring_area_m2(ring)
            log(abs(a - H12_AREA) / H12_AREA < 0.05,
                f"도형 면적 {a:,.0f}㎡ (공고 {H12_AREA:,.2f}㎡ 대비 {(a-H12_AREA)/H12_AREA*100:+.2f}%)")
        log(any("2026-07-07" in s.get("label", "") for s in p.get("sources", [])), "출처: 동작구 2026-07-07 구역계 안내")
        log("2026-10" in (p.get("note") or ""), "note: 2026-10 후보지 선정위 상정 보류 기재")

        # 겹침 — 도면 내용상 존재하므로 남긴다(0으로 만들지 않음)
        from shapely.geometry import shape

        z = shape(g)
        mx = 111320 * math.cos(math.radians(z.centroid.y))
        my = 110540
        ov = []
        for f2 in fc["features"]:
            if f2["properties"]["id"] == H12_ID or not f2["geometry"]:
                continue
            try:
                z2 = shape(f2["geometry"])
            except Exception:
                continue
            if z2.intersects(z):
                inter = z2.intersection(z).area * mx * my
                if inter > 1:
                    ov.append((f2["properties"].get("name"), round(inter)))
        print("   겹침(도면 그대로 유지):", ov)
        log(any(n == "흑석숲마을" and v > 20000 for n, v in ov), "흑석숲마을 겹침 유지(≈23,000㎡)")

    print("2) 흑석10구역(정비구역지정 공람)")
    f10 = feats.get(H10_ID)
    log(f10 is not None, f"{H10_ID} 존재")
    if f10:
        p = f10["properties"]
        log(p.get("stage") == "정비구역지정(공람)", f"단계 {p.get('stage')}")
        log(abs((p.get("area") or 0) - H10_AREA) < 0.01, f"구역면적 {p.get('area')}㎡ (공람안 48,693.8㎡)")
        log("2026-1856" in json.dumps(p.get("sources", []), ensure_ascii=False), "출처: 동작구 공고 제2026-1856호")
        log("2026-10-29" in (p.get("note") or ""), "note: 2026-10-29 신통기획 확정")
        log("2026-11-12" in (p.get("note") or "") and "11-30" in (p.get("note") or ""), "note: 공람 11-12~11-30")
        log(any("흑석동 204-104" in a for a in p.get("alias", [])), f"별칭 {p.get('alias')}")

    print("3) 브라우저(운영)")
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))

        page.goto(URL + "?zone=" + H12_ID, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(5)
        card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
        print("   흑석12 카드:", card[:200].replace("\n", " | "))
        log("흑석12" in card, "상세 카드: 구역명 흑석12")
        log("연번부여" in card, "상세 카드: 단계 연번부여")
        log("88,093" in card or "88093" in card, "상세 카드: 면적 88,093㎡")
        n = color_pixels(page, C_SINTHONG)
        log(n > 800, f"지도 픽셀(신통기획) {n}개 — 폴리곤이 그려짐")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-heukseok12.png"))
        try:
            page.click('button[title^="지적편집도"]')
            page.wait_for_timeout(6000)
            page.screenshot(path=os.path.join(SHOT_DIR, "redev-heukseok12-jijeok.png"))
            print("   지적편집도 스크린샷 저장")
        except Exception as e:
            log(False, f"지적편집도 전환 실패: {e}")

        page.goto(URL + "?zone=" + H10_ID, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(5)
        card10 = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
        print("   흑석10 카드:", card10[:200].replace("\n", " | "))
        log("흑석10" in card10, "상세 카드: 구역명 흑석10")
        log("정비구역지정" in card10, "상세 카드: 단계 정비구역지정(공람)")
        log("48,693" in card10 or "48693" in card10, "상세 카드: 면적 48,693㎡")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-heukseok10.png"))
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
