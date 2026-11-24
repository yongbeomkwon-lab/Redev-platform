#!/usr/bin/env python3
"""현석동 1-31 · 서빙고동 36구역 경계 반영 검증 (2026-11-24, 운영 URL)

확인
  1) 데이터(운영 geojson): geom·boundaryApprox·정점 수·면적·boundaryNote·sources, metadata.count
  2) 브라우저(운영): ?zone=<id> 로 열어 상세 카드 문구 → 지도에 폴리곤이 그려지는지(픽셀)
     → 스크린샷(downloads/redev_hyeonseok_1_31.png · redev_seobinggo_36.png), 지적편집도 켠 컷 추가
사용법
  python3 scripts/verify-hyeonseok-seobinggo-20261124.py

  ※ 2026-11-24 작업 환경에서는 playwright chromium 이 libnspr4 부재로 뜨지 않아(libnspr4.so 없음),
    실제 캡처는 브라우저 도구로 같은 URL(?zone=…)을 열어 했고 결과 파일은
    downloads/redev_hyeonseok_1_31.png · downloads/redev_seobinggo_36.png (+ _jijeok.png) 이다.
    데이터 검사(1번)는 이 스크립트만으로도 그대로 돌릴 수 있다.
"""
import json
import math
import os
import time
import urllib.request

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "https://redev-platform-iota.vercel.app/")
SHOT_DIR = os.environ.get("SHOT_DIR", "/workspace/downloads")
C_JANGI = (200, 162, 90)   # 장기전세 #C8A25A
C_SINTHONG = (192, 92, 201)  # 신통기획 #C05CC9

errors: list[str] = []

TARGETS = [
    {
        "id": "mp-hyeonseok-1-31",
        "name": "광흥창역세권(현석동 1-31)",
        "geom": "고시도면",
        "area": 22746.4,
        "shape": 22743,
        "verts": 34,
        "shot": "redev_hyeonseok_1_31.png",
        "card": ["현석동 1-31", "22,746", "고시 지형도면", "마포구 고시 제2026-116호"],
        "color": C_JANGI,
    },
    {
        "id": "sy-seobinggo-36",
        "name": "(가칭)서빙고동 36구역",
        "geom": "공고도면",
        "area": 26236,
        "shape": 26732,
        "verts": 60,
        "shot": "redev_seobinggo_36.png",
        "card": ["서빙고동 36", "26,236", "공고 도면", "신청인이 제출한 구역계"],
        "color": C_SINTHONG,
    },
]


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


def color_pixels(page, rgb, tol=26):
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

    from shapely.geometry import shape

    for t in TARGETS:
        f = feats.get(t["id"])
        log(f is not None, f"{t['id']} 존재")
        if not f:
            continue
        p = f["properties"]
        g = f["geometry"]
        log(g is not None and g["type"] == "Polygon", f"{t['id']} geometry {g and g['type']} (경계 있음)")
        log(p["geom"] == t["geom"] and p.get("boundaryApprox") is False, f"{t['id']} 경계 출처 = {p['geom']} · 근사 아님")
        log(p["area"] == t["area"], f"{t['id']} 표기 면적 {p['area']}㎡")
        log(abs((p.get("areaShape") or 0) - t["shape"]) <= 2, f"{t['id']} 도형 계측 {p.get('areaShape')}㎡")
        if g:
            ring = g["coordinates"][0]
            body = ring[:-1] if ring[0] == ring[-1] else ring
            log(len(body) == t["verts"], f"{t['id']} 정점 {len(body)}개")
            a = ring_area_m2(ring)
            log(abs(a - t["area"]) / t["area"] < 0.03, f"{t['id']} 도형 면적(근사) {a:,.0f}㎡ 대비 {(a - t['area']) / t['area'] * 100:+.1f}%")
            z = shape(g)
            mx = 111320 * math.cos(math.radians(z.centroid.y))
            ov = []
            for f2 in fc["features"]:
                if f2["properties"]["id"] == t["id"] or not f2["geometry"]:
                    continue
                try:
                    z2 = shape(f2["geometry"])
                except Exception:
                    continue
                if z2.intersects(z):
                    inter = z2.intersection(z).area * mx * 110540
                    if inter > 1:
                        ov.append((round(inter, 1), f2["properties"].get("name")))
            log(not ov, f"{t['id']} 이웃 구역 겹침 0 (겹침: {ov[:3] if ov else '없음'})")
        log(bool(p.get("boundaryNote")) and len(p.get("boundaryNote") or "") > 40, f"{t['id']} boundaryNote 있음")
        log(len(p.get("sources") or []) >= 2, f"{t['id']} 출처 {len(p.get('sources') or [])}건")

    print("1) 브라우저(운영)")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))
        for t in TARGETS:
            print(f"— {t['id']}")
            page.goto(URL + "?zone=" + t["id"], wait_until="domcontentloaded")
            page.wait_for_function(
                "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
                timeout=60000,
            )
            time.sleep(4)
            card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
            print("   상세 카드:", card[:200].replace("\n", " | "))
            for needle in t["card"]:
                log(needle in card, f"상세 카드에 '{needle}'")
            n = color_pixels(page, t["color"])
            log(n > 500, f"지도 픽셀(채움색) {n}개 — 폴리곤이 그려짐")
            page.screenshot(path=os.path.join(SHOT_DIR, t["shot"]))
            print("   저장:", os.path.join(SHOT_DIR, t["shot"]))
            try:
                page.click('button[title^="지적편집도"]')
                page.wait_for_timeout(5000)
                jj = t["shot"].replace(".png", "_jijeok.png")
                page.screenshot(path=os.path.join(SHOT_DIR, jj))
                print("   저장:", os.path.join(SHOT_DIR, jj))
                page.click('button[title^="지적편집도"]')
                page.wait_for_timeout(1500)
            except Exception as exc:  # noqa: BLE001
                print("   [참고] 지적편집도 캡처 생략 —", str(exc)[:120])
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
