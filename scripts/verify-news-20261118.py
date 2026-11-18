#!/usr/bin/env python3
"""2026-11-18 저녁 뉴스 반영 검증 — 신림9·모아타운 4곳·용두7·민간도심복합 2곳.

확인 항목
  1) 데이터: 신림9구역 단계 '정비구역지정(공람)', 모아타운 4곳 '관리계획수립(심의통과)',
     용두동 39 별칭(가칭 용두7구역·용두7), (가칭)내방1지구·(가칭)증산역세권 = 민간도심복합(주거중심형)
     · geom 근사원 · boundaryApprox · 점선원 면적(고시 면적 대비 ±1%)
  2) 검색 → 선택 → 상세 카드 문구(단계·계획·경계 설명)
  3) 지도 픽셀: 주거중심형 색(#ef4444) 점선원이 실제로 그려지는지
  4) 스크린샷 저장

사용법
    scripts/with-dev.sh python3 scripts/verify-news-20261118.py
    TARGET_URL=https://redev-platform-iota.vercel.app/ MODE=prod SHOT_DIR=/workspace/downloads ...
"""
import json
import math
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

URL = os.environ.get("TARGET_URL", "http://localhost:3100/")
SHOT_DIR = os.environ.get("SHOT_DIR", "/workspace/downloads")
SHOT_MAIN = os.path.join(SHOT_DIR, "redev-news-20261118.png")
C_RED500 = (239, 68, 68)  # 민간도심복합(주거중심형)

errors: list[str] = []


def log(ok, msg):
    print(("  ✅ " if ok else "  ❌ ") + str(msg))
    if not ok:
        errors.append(str(msg))


def fetch_zones():
    # 로컬 검증은 프록시 환경 때문에 urllib 이 localhost 를 못 찾는다 — 파일을 직접 읽는다
    if "localhost" in URL or "127.0.0.1" in URL:
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data", "zones.geojson")
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    with urllib.request.urlopen(URL.rstrip("/") + "/data/zones.geojson", timeout=60) as r:
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


def dashed_ring_pixels(page, rgb, tol=8):
    """주거중심형 색(#ef4444) 픽셀이 지도 캔버스에 있는지 — 점선이라 세밀하지 않게 센다."""
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
    print("0) 데이터 확인")
    fc = fetch_zones()
    feats = {f["properties"]["id"]: f for f in fc["features"]}
    print(f"   구역 {len(fc['features'])}곳 · metadata.count {fc['metadata'].get('count')}")
    log(len(fc["features"]) == fc["metadata"].get("count"), "metadata.count == 실제 구역 수")
    log(len(feats) == len(fc["features"]), "id 중복 없음")

    sillim = feats["11620UQ120PS202603030002"]["properties"]
    log(sillim["stage"] == "정비구역지정(공람)", f"신림9구역 단계: {sillim['stage']}")
    log("2026.11.26" in sillim.get("note", "") and "105.64" in sillim.get("note", ""), "신림9 note: 설명회·비례율")

    moa = {
        "11000UQ120PS202503070001": ("개봉동 20", "1,485"),
        "11000UQ120PS202503070031": ("목2동 231-27", "1,786"),
        "11000UQ120PS202503070055": ("수유동 141", "2,441"),
        "hawolgok-40-107": ("하월곡동 40-107 일대 모아타운", "607"),
    }
    for zid, (name, hh) in moa.items():
        p = feats[zid]["properties"]
        log(
            p["stage"] == "관리계획수립(심의통과)" and hh in p.get("note", ""),
            f"{name}: {p['stage']} · 계획 {hh}세대",
        )

    yongdu = feats["rest17gu-ddm-용두동-39"]["properties"]
    log(all(a in yongdu.get("alias", []) for a in ["가칭 용두7구역", "용두7구역", "용두7"]), "용두동 39 별칭")
    log(len(yongdu["alias"]) == len(set(yongdu["alias"])), "용두동 39 별칭 중복 없음")
    log("2026-11-18" in yongdu.get("note", "") and "70%" in yongdu.get("note", ""), "용두동 39 note: 11-18 발표")

    for zid, area in [("seocho-naebang-1", 59961.5), ("eunpyeong-jeungsan-253", 50216)]:
        f = feats.get(zid)
        log(f is not None, f"{zid} 존재")
        if not f:
            continue
        p = f["properties"]
        log(p["type"] == "민간도심복합(주거중심형)", f"{zid} 유형 {p['type']}")
        log(p.get("boundaryApprox") is True and p.get("geom") == "근사원", f"{zid} boundaryApprox·근사원")
        ring = f["geometry"]["coordinates"][0]
        a = ring_area_m2(ring)
        err = abs(a - area) / area * 100
        log(err < 1.0, f"{zid} 점선원 면적 {a:,.0f}㎡ (고시 {area:,.1f}㎡ 대비 {err:.2f}%)")
        r = math.sqrt(area / math.pi)
        log(f"반경 약 {r:.0f}m" in p.get("boundaryNote", ""), f"{zid} boundaryNote에 반경 {r:.0f}m")

    print("1) 브라우저 — 검색·상세 카드·지도")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => { const c = document.querySelector('canvas.kakao-zone-canvas'); return c && c.width > 100; }",
            timeout=45000,
        )
        time.sleep(3)

        def search_and_open(q):
            page.fill('[data-testid="zone-search-input"]', q)
            page.wait_for_selector('[data-testid="zone-result"]', timeout=10000)
            results = page.eval_on_selector_all('[data-testid="zone-result"]', "els => els.map(e => e.innerText)")
            page.click('[data-testid="zone-result"]')
            page.wait_for_timeout(2500)
            return results

        # 신림9구역
        res = search_and_open("신림9")
        print("   신림9 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
        log("정비구역지정(공람)" in card, "신림9 상세 카드: 정비구역지정(공람)")
        log("505세대" in card, "신림9 상세 카드: 505세대")
        page.screenshot(path=SHOT_MAIN)
        print("   screenshot:", SHOT_MAIN)

        # 내방1지구
        res = search_and_open("내방1지구")
        print("   내방1 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        log(any("내방1지구" in r for r in res), "검색 결과에 내방1지구")
        card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
        log("민간도심복합(주거중심형)" in card, "내방1 상세 카드: 유형 주거중심형")
        log("위치 참고용 점선원" in card, "내방1 상세 카드: 경계 설명(점선원)")
        log("59,961" in card, "내방1 상세 카드: 면적 59,961㎡")
        n = dashed_ring_pixels(page, C_RED500)
        log(n > 60, f"내방1 지도 픽셀(주거중심형 #ef4444) {n}개")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-news-20261118-naebang1.png"))

        # 증산역세권
        res = search_and_open("증산역세권")
        print("   증산 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        log(any("증산역세권" in r for r in res), "검색 결과에 증산역세권")
        card = page.query_selector("aside").inner_text() if page.query_selector("aside") else ""
        log("추진준비(설명회)" in card, "증산 상세 카드: 추진준비(설명회)")
        log("50,216" in card, "증산 상세 카드: 면적 50,216㎡")
        n = dashed_ring_pixels(page, C_RED500)
        log(n > 60, f"증산 지도 픽셀(주거중심형 #ef4444) {n}개")
        page.screenshot(path=os.path.join(SHOT_DIR, "redev-news-20261118-jeungsan.png"))

        # 용두7 별칭 검색
        res = search_and_open("용두7")
        print("   용두7 검색:", " | ".join(r.replace("\n", " · ") for r in res[:3]))
        log(any("용두동 39" in r for r in res), "별칭 '용두7'로 용두동 39 검색")

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
    sys.exit(main())
