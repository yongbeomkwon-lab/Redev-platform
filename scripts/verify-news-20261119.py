#!/usr/bin/env python3
"""2026-11-19 뉴스 반영 검증 — 쌍문동 710(폴리곤)·구로동 466(단계 상향)·DDP 1·2·3구역(근사원).

확인
  1) 데이터: 3건의 단계·면적·geom·boundaryApprox, metadata.count, id·이름 중복
  2) 브라우저(운영): 검색 → 결과 → 상세 카드 문구, 지도에 실제로 그려지는지(픽셀 색)
  3) 쌍문동 710은 지적편집도를 켜고 스크린샷 — 지번 경계와 폴리곤이 맞는지 눈으로 대조
사용법
  TARGET_URL=https://redev-platform-iota.vercel.app/ python3 scripts/verify-news-20261119.py
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
C_ILBAN = (16, 185, 129)  # 일반재개발 #10b981

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg))
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
    log("news20261119" in fc["metadata"], "metadata.news20261119 기록")

    sm = feats.get("dobong-ssangmun-710")
    log(sm is not None, "쌍문동 710 존재")
    if sm:
        p = sm["properties"]
        log(p["stage"].startswith("후보지선정"), f"단계 {p['stage']}")
        log(p["area"] == 45200.5, f"면적 {p['area']}㎡")
        log(p["geom"] == "고시도면" and p.get("boundaryApprox") is False, "경계 출처 = 고시도면(실경계)")
        a = ring_area_m2(sm["geometry"]["coordinates"][0])
        log(abs(a - 45200.5) / 45200.5 < 0.02, f"도형 면적 {a:,.0f}㎡ (고시 45,200.5㎡ 대비 {(a-45200.5)/45200.5*100:+.1f}%)")
        log("겹침 0" in (p.get("boundaryNote") or ""), "boundaryNote: 쌍문5구역 겹침 0")

    gu = feats.get("11530UQ120PS202608040001")
    log(gu is not None, "구로동 466 존재")
    if gu:
        p = gu["properties"]
        log(p["stage"] == "정비구역지정(공람)", f"단계 {p['stage']}")
        log(p["area"] == 70797, f"면적 {p['area']}㎡")
        log("1,535세대" in p.get("note", "") and "106.93" in p.get("note", ""), "note: 1,535세대·추정비례율 106.93%")
        log("2026-11-12~12-14" in p.get("note", ""), "note: 공람 11.12~12.14")
        log(any("구로구 공고 제2026-1937호" in s.get("label", "") for s in p.get("sources", [])), "출처: 구로구 공고 제2026-1937호")

    dp = feats.get("junggu-ddp-123")
    log(dp is not None, "DDP 1·2·3구역 존재")
    if dp:
        p = dp["properties"]
        log(p["geom"] == "근사원" and p.get("boundaryApprox") is True, "경계 출처 = 근사원(점선원)")
        log(p["type"] == "일반재개발" and p["kind"] == "재개발(도시정비형)", f"유형 {p['type']} / {p['kind']}")
        log(p["area"] == 366950, f"면적 {p['area']}㎡")
        a = ring_area_m2(dp["geometry"]["coordinates"][0])
        log(abs(a - 366950) / 366950 < 0.01, f"점선원 면적 {a:,.0f}㎡")
        log("반경 약 342m" in p.get("boundaryNote", ""), "boundaryNote에 반경 342m")

    # 이름 중복
    names = [f["properties"]["name"] for f in fc["features"]]
    for n in ("쌍문동 710", "구로동 466", "DDP 1·2·3구역"):
        log(names.count(n) == 1, f"이름 중복 없음: {n}")

    print("1) 브라우저")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=60000,
        )
        time.sleep(3)

        def open_zone(q):
            page.fill('[data-testid="zone-search-input"]', q)
            page.wait_for_selector('[data-testid="zone-result"]', timeout=15000)
            results = page.eval_on_selector_all('[data-testid="zone-result"]', "els => els.map(e => e.innerText)")
            page.click('[data-testid="zone-result"]')
            page.wait_for_timeout(3000)
            card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
            return results, card

        # 쌍문동 710
        res, card = open_zone("쌍문동 710")
        print("   쌍문동 710 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        log(any("쌍문동 710" in r for r in res), "검색 결과에 쌍문동 710")
        log("후보지선정" in card, "상세 카드: 단계 후보지선정")
        log("45,200" in card or "45200" in card, "상세 카드: 면적 45,200㎡")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-20261119-ssangmun710.png"))
        n = color_pixels(page, C_SINTHONG)
        log(n > 500, f"지도 픽셀(신통기획 #7c3aed) {n}개 — 폴리곤이 그려짐")
        # 지적편집도 켜고 대조
        page.click('button[title^="지적편집도"]')
        page.wait_for_timeout(4000)
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-20261119-ssangmun710-jijeok.png"))
        page.click('button[title^="지적편집도"]')
        page.wait_for_timeout(1500)

        # 구로동 466
        res, card = open_zone("구로동 466")
        print("   구로동 466 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        log(any("구로동 466" in r for r in res), "검색 결과에 구로동 466")
        log("정비구역지정(공람)" in card, "상세 카드: 단계 정비구역지정(공람)")
        log("1,535" in card or "1535" in card, "상세 카드: 1,535세대")
        log("106.93" in card, "상세 카드: 추정비례율 106.93%")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-20261119-guro466.png"))

        # DDP
        res, card = open_zone("DDP")
        print("   DDP 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        log(any("DDP" in r for r in res), "검색 결과에 DDP 1·2·3구역")
        log("재공람" in card, "상세 카드: 재공람 단계")
        log("366,950" in card or "366950" in card, "상세 카드: 면적 366,950㎡")
        log("위치 참고용 점선원" in card, "상세 카드: 점선원(근사 경계) 설명")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-20261119-ddp123.png"))
        n = color_pixels(page, C_ILBAN)
        log(n > 300, f"지도 픽셀(일반재개발 #10b981) {n}개 — 점선원이 그려짐")

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
