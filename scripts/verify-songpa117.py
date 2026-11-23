#!/usr/bin/env python3
"""송파동 117 일대(송파1동 하단) 모아타운 1~5구역계 — 배포본 검수 + 스크린샷 (3차 블록 기준)

  TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-songpa117.py

  3차(2026-11-23 밤) 확인 항목
    1) 배포본 zones.geojson 2,440곳 — 5개 구역이 새 블록 도형(꼭짓점 4·5·5·4·7)과 계측 면적으로 실렸는가
    2) 지도 배지 이름이 `송파117 1구역`~`송파117 5구역`으로 **잘리지 않고** 뜨는가
       (지도 이름표는 12~14자에서 잘린다 — DOM .zone-tag 글자에 `…` 가 없어야 한다)
       + 기존 긴 이름(`(가칭)송파1동 하단 모아타운 N구역` 등)이 alias 로 살아 검색되는가
    3) 3구역이 송파한양1차와 맞닿고(이격 ≤ 8m) 5구역이 송파한양1차와 겹치지 않는가(교집합 0㎡)
    4) 서울송파초등학교(114학)·송파근린공원(113공)과 교집합 0㎡
    5) 부모 `songpa117-moa` MultiPolygon 5장 · 합계 83,193㎡
    6) 콘솔 오류 0건
    7) 스크린샷 — 앱의 카카오맵 투영으로 위경도→화면 픽셀을 받아 구역계·송파한양1차·학교·공원을 겹쳐 그린다
         downloads/redev_songpa117_v3.png      (1~5구역 + 송파한양1차 + 학교·공원)
         downloads/redev_songpa117_v3_raw.png  (주석 없는 원본 화면)
"""
import json
import os
import sys
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TARGET_URL", "https://redev-platform-iota.vercel.app").rstrip("/")
D = "/workspace/downloads"
SS = 2  # device_scale_factor

# 2026-11-23 3차(블록 기준) — tmp/songpa117_clean_rings.json 과 같은 값
VERTS = {"1": 4, "2": 5, "3": 5, "4": 4, "5": 7}
AREAS = {"1": 15196, "2": 17426, "3": 17786, "4": 12862, "5": 19923}
NAMES = {n: f"송파117 {n}구역" for n in "12345"}
OLD_NAMES = {n: f"(가칭)송파1동 하단 모아타운 {n}구역" for n in "12345"}
TOTAL = 83193
HANYANG_ID = "11000UQ120PS202502050014"

# 브이월드 연속지적도 그대로 — 서울송파초등학교(송파동 114학) / 송파근린공원(송파동 113공)
SCHOOL = [[37.507824, 127.110755], [37.507618, 127.111079], [37.507570, 127.111153], [37.507270, 127.111626],
          [37.507242, 127.111669], [37.507197, 127.111674], [37.507153, 127.111626], [37.506790, 127.111229],
          [37.506282, 127.110674], [37.506867, 127.109830], [37.506943, 127.109913], [37.507089, 127.110067],
          [37.507238, 127.110217], [37.507388, 127.110363], [37.507541, 127.110506], [37.507618, 127.110575],
          [37.507696, 127.110645]]
PARK = [[37.506867, 127.109830], [37.506282, 127.110674], [37.506267, 127.110658], [37.505830, 127.110180],
        [37.506214, 127.109626], [37.506296, 127.109507], [37.506426, 127.109319], [37.506462, 127.109363],
        [37.506519, 127.109433], [37.506658, 127.109596], [37.506799, 127.109756]]
ZCOL = {"1": (200, 0, 0), "2": (0, 110, 110), "3": (0, 60, 220), "4": (190, 0, 190), "5": (40, 40, 40)}
failures: list[str] = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def overlap_area(a, b) -> float:
    """국지 평면(등장방형) 교차 면적 — 아핀변환이라 교차 판정은 실제와 같다."""
    from shapely.geometry import Polygon

    def xy(ring):
        return [(p[1] * 88300.0, p[0] * 110540.0) for p in ring]

    return Polygon(xy(a)).intersection(Polygon(xy(b))).area


def gap(a, b) -> float:
    from shapely.geometry import Polygon

    def xy(ring):
        return [(p[1] * 88300.0, p[0] * 110540.0) for p in ring]

    return Polygon(xy(a)).distance(Polygon(xy(b)))


def rings_of(feats, zid):
    g = (feats.get(zid) or {}).get("geometry") or {}
    ring = (g.get("coordinates") or [[]])[0]
    pts = [[c[1], c[0]] for c in ring]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def fetch_geojson():
    with urllib.request.urlopen(f"{BASE}/data/zones.geojson", timeout=60) as r:
        return json.load(r)


def map_state(page):
    return page.evaluate(
        """() => {const d=window.__redevDiag; if(!d) return null; const m=d.map(); if(!m) return null;
             const c=m.getCenter(); return {lat:+c.getLat().toFixed(5), lng:+c.getLng().toFixed(5), level:m.getLevel()};}"""
    )


def zoom_in(page, times=1):
    for _ in range(times):
        page.locator("button[aria-label='확대']").first.click(timeout=6000)
        time.sleep(2.0)


def cadastral_on(page):
    try:
        btn = page.locator("button:has-text('지적편집도')").first
        if btn.get_attribute("aria-pressed") != "true":
            btn.click(timeout=6000)
            time.sleep(3.0)
        print("지적편집도 on")
    except Exception as exc:  # noqa: BLE001
        print("지적편집도 토글 실패:", str(exc)[:100])


def project(page, rings):
    """앱의 카카오맵 투영(containerPointFromCoords)으로 위경도 → 화면 픽셀(CSS)."""
    return page.evaluate(
        """(rings) => {
             const d = window.__redevDiag, k = window.kakao, m = d.map();
             const proj = m.getProjection();
             const el = document.querySelector('.kakao-zone-canvas').parentElement;
             const box = el.getBoundingClientRect();
             const pt = (lat, lng) => {
               const p = proj.containerPointFromCoords(new k.maps.LatLng(lat, lng));
               return [p.x + box.left, p.y + box.top];
             };
             const out = {};
             for (const [k2, ring] of Object.entries(rings)) out[k2] = ring.map(([la, ln]) => pt(la, ln));
             return out;
           }""",
        rings,
    )


def annotate(raw_path, out_path, screens, title, pad=90):
    """원본 화면 위에 송파한양1차·학교·공원 필지와 1~5구역계를 겹쳐 그린 검수 이미지(3:2 로 잘라 냄)."""
    im = Image.open(raw_path).convert("RGB")
    xs = [p[0] for pts in screens.values() for p in pts]
    ys = [p[1] for pts in screens.values() for p in pts]
    x0, y0 = int(min(xs) * SS) - pad, int(min(ys) * SS) - pad
    x1, y1 = int(max(xs) * SS) + pad, int(max(ys) * SS) + pad
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0
    if w / h < 1.5:
        w = int(h * 1.5)
    else:
        h = int(w / 1.5)
    x0, y0, x1, y1 = int(cx - w / 2), int(cy - h / 2), int(cx + w / 2), int(cy + h / 2)
    if x0 < 0:
        x1 -= x0; x0 = 0
    if y0 < 0:
        y1 -= y0; y0 = 0
    if x1 > im.width:
        x0 -= x1 - im.width; x1 = im.width
    if y1 > im.height:
        y0 -= y1 - im.height; y1 = im.height
    x0, y0 = max(0, x0), max(0, y0)
    im = im.crop((x0, y0, x1, y1))
    screens = {k: [[p[0] * SS - x0, p[1] * SS - y0] for p in pts] for k, pts in screens.items()}

    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    font = ImageFont.truetype("/workspace/fonts/NanumGothic-Regular.ttf", 26)
    small = ImageFont.truetype("/workspace/fonts/NanumGothic-Regular.ttf", 22)

    def label(pts, col, text, dy=-16):
        cx2 = sum(p[0] for p in pts) / len(pts)
        cy2 = sum(p[1] for p in pts) / len(pts) + dy
        tw = d.textlength(text, font=small)
        d.rectangle([cx2 - tw / 2 - 8, cy2 - 16, cx2 + tw / 2 + 8, cy2 + 16], fill=(255, 255, 255, 225))
        d.text((cx2 - tw / 2, cy2 - 13), text, fill=col + (255,), font=small)

    for key, col, text in (("hanyang", (110, 60, 180), "송파한양1차(필지 119)"),
                           ("school", (0, 160, 0), "서울송파초등학교(114학)"),
                           ("park", (235, 110, 0), "송파근린공원(113공)")):
        pts = [tuple(p) for p in screens[key]]
        d.polygon(pts, fill=col + (46,))
        d.line(pts + [pts[0]], fill=col + (255,), width=4)
        label(pts, col, text)

    for n in "12345":
        pts = [tuple(p) for p in screens[f"zone{n}"]]
        d.line(pts + [pts[0]], fill=ZCOL[n] + (255,), width=4)

    # 범례 — 구역은 번호표 대신 색선으로 을라 준다(배지 글자를 가리지 않게)
    rows = [
        ((110, 60, 180), "송파한양1차 필지(겹침 0㎡) — 굵은 남색"),
        ((0, 160, 0), "서울송파초등학교(114학) — 굵은 초록"),
        ((235, 110, 0), "송파근린공원(113공) — 주황"),
    ] + [(ZCOL[n], f"송파117 {n}구역 — 색선") for n in "12345"]
    tw = max(d.textlength(t, font=small) for _, t in rows) + 26
    bw = tw + 46
    d.rectangle([24, 24, 24 + bw, 24 + 30 * len(rows) + 46], fill=(255, 255, 255, 235))
    d.text((36, 32), title, fill=(20, 20, 20, 255), font=font)
    for i, (col, t) in enumerate(rows):
        y = 74 + 30 * i
        d.line([40, y + 10, 68, y + 10], fill=col + (255,), width=5)
        d.text((80, y), t, fill=(40, 40, 40, 255), font=small)
    Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB").save(out_path)
    print("saved", out_path, im.size)


def run():
    geo = fetch_geojson()
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    check("배포본 zones.geojson 2,440곳", len(geo["features"]) == 2440, str(len(geo["features"])))

    hanyang = rings_of(feats, HANYANG_ID)
    check("송파한양1차(119) 도형 확보", len(hanyang) >= 3, f"정점 {len(hanyang)}")

    zones = {}
    for n in "12345":
        zid = f"songpa117-moa-{n}"
        ring = rings_of(feats, zid)
        zones[n] = ring
        p = (feats.get(zid) or {}).get("properties", {})
        sc = overlap_area(ring, SCHOOL) if ring else -1
        pk = overlap_area(ring, PARK) if ring else -1
        hy = overlap_area(ring, hanyang) if ring and hanyang else -1
        hd = gap(ring, hanyang) if ring and hanyang else -1
        ok = (
            len(ring) == VERTS[n]
            and p.get("geom") == "참고도"
            and abs((p.get("area") or 0) - AREAS[n]) < 1
            and p.get("name") == NAMES[n]
            and len(p.get("name") or "") <= 10
            and OLD_NAMES[n] in (p.get("alias") or [])
            and sc < 0.5 and pk < 0.5 and hy < 0.5
        )
        check(
            f"{n}구역 — 정점 {VERTS[n]}·{AREAS[n]:,}㎡·배지 '{NAMES[n]}'·alias 유지·학교/공원/한양 교집합 0",
            ok,
            f"정점 {len(ring)} · area={p.get('area')} · name={p.get('name')} · alias {len(p.get('alias') or [])}개"
            f" · 학교 {sc:.1f}㎡ · 공원 {pk:.1f}㎡ · 한양 {hy:.1f}㎡(이격 {hd:.1f}m)",
        )
        if n == "3":
            check("3구역이 송파한양1차에 맞닿음(이격 ≤ 8m)", 0 <= hd <= 8.0, f"{hd:.1f}m")
        if n == "5":
            check("5구역이 송파한양1차와 겹치지 않음", abs(hy) < 0.5, f"교집합 {hy:.1f}㎡ · 이격 {hd:.1f}m")

    pp = (feats.get("songpa117-moa") or {}).get("properties", {})
    pg = (feats.get("songpa117-moa") or {}).get("geometry") or {}
    parts = len(pg.get("coordinates") or [])
    check(
        f"부모 songpa117-moa — MultiPolygon {parts}장 · 합계 {TOTAL:,}㎡",
        pg.get("type") == "MultiPolygon" and parts == 5 and (pp.get("area") or 0) == TOTAL,
        f"{pg.get('type')} {parts}장 · area={pp.get('area')}",
    )

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1600, "height": 1060}, device_scale_factor=SS)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        page.goto(f"{BASE}/?zone=songpa117-moa&diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(8)
        body = page.locator("body").inner_text()
        check("부모 구역 패널 — 참고도·83,193㎡", "참고도" in body and "83,193" in body, "")
        check("부모 구역 패널 — 블록 기준·송파한양1차 설명", "필지" in body and "송파한양1차" in body, "")

        # 구역 상세 패널 — 짧은 이름·새 면적
        page.goto(f"{BASE}/?zone=songpa117-moa-3&diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(7)
        body3 = page.locator("body").inner_text()
        check("3구역 패널 — 짧은 이름·참고도·17,786㎡", "송파117 3구역" in body3 and "참고도" in body3 and "17,786" in body3, "")
        check("3구역 패널 — 옛 이름도 함께 보임", "(가칭)송파1동 하단" in body3, "")

        # 지도 화면 — 모아타운만 켜고(다른 구역 이름표가 자리를 비켜 주게) 레벨 3으로 맞춘다
        page.goto(f"{BASE}/?diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(7)
        page.evaluate(
            "()=>{const m=window.__redevDiag.map(); m.setLevel(3); m.panTo(new window.kakao.maps.LatLng(37.5065,127.1120));}"
        )
        time.sleep(3)
        try:
            page.locator("button:has-text('필터')").first.click(timeout=6000)
            time.sleep(1.2)
            page.get_by_role("button", name="모아타운", exact=True).first.click(timeout=6000)
            time.sleep(2.5)
            page.get_by_role("button", name="접기").first.click(timeout=5000)
            time.sleep(1.2)
            print("구역 유형 필터 — 모아타운만")
        except Exception as exc:  # noqa: BLE001
            print("필터 적용 실패:", str(exc)[:120])
        cadastral_on(page)
        time.sleep(1.5)

        st = map_state(page)
        check("지도 중심이 구역 안(37.5065±0.003)", abs((st or {}).get("lat", 0) - 37.5065) < 0.003, str(st))

        # 지도 배지 — DOM .zone-tag 글자 그대로(잘리면 이름 뒤에 … 가 붙는다)
        tags = page.eval_on_selector_all("[data-testid='zone-tag'] b", "els => els.map(e => e.textContent.trim())")
        mine = [t for t in tags if "송파117" in t]
        check("지도 배지 5개가 모두 뜸", set(NAMES.values()) <= set(mine), f"배지 {sorted(set(mine))}")
        check("배지 이름이 잘리지 않음(… 없음)", all("…" not in t for t in mine), f"{sorted(set(mine))}")
        for n in "12345":
            el = page.locator("[data-testid='zone-tag']", has_text=NAMES[n]).first
            if el.count():
                clip = el.evaluate("e => {const b=e.querySelector('b'); return {sw:b.scrollWidth, cw:b.clientWidth, text:b.textContent};}")
                check(f"배지 '{NAMES[n]}' 넘침 없음", clip["sw"] <= clip["cw"] + 1, str(clip))
            else:
                check(f"배지 '{NAMES[n]}' 넘침 없음", False, "이름표 없음")

        raw_full = f"{D}/redev_songpa117_v3_raw.png"
        page.screenshot(path=raw_full)
        rings = {"hanyang": hanyang, "school": SCHOOL, "park": PARK}
        for n, ring in zones.items():
            rings[f"zone{n}"] = ring
        annotate(raw_full, f"{D}/redev_songpa117_v3.png", project(page, rings),
                 "송파117 모아타운 1~5구역 — 블록 기준 재작성(2026-11-23 3차)")

        # 검색 — 옛 이름·줄인 이름 둘 다으로 찾히는지(별칭 유지 확인)
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(2)
        for term, want in (("송파동 117 일대 모아타운 3구역", "송파117 3구역"), ("송파1동 하단 3구역", "송파117 3구역"), ("송파117", "송파117")):
            box = page.locator("input[placeholder*='검색']").first
            box.click()
            box.fill(term)
            time.sleep(1.5)
            rows = page.locator("[data-testid='zone-result']").all_inner_texts()
            first = rows[0].split("\n")[0] if rows else ""
            check(f"검색 '{term}' → {want}", any(want in r for r in rows[:5]), f"결과 {len(rows)}개 · 첫줄 '{first}'")

        real = [e for e in errs if "favicon" not in e and "ResizeObserver" not in e]
        check("콘솔 오류 0", len(real) == 0, str(real[:3]))
        b.close()

    print("실패", len(failures), failures)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run())
