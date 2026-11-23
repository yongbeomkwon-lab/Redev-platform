#!/usr/bin/env python3
"""송파동 117 일대(송파1동 하단) 모아타운 1~5구역계 — 배포본 검수 + 스크린샷

  TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-songpa117.py

  확인
    1) 배포본 zones.geojson 의 5개 구역이 새 도형(꼭짓점 4·4·6·4·5)과 계측 면적으로 실렸는가
    2) 서울송파초등학교(송파동 114학)·송파근린공원(송파동 113공) 필지와 교집합이 0㎡ 인가
    3) `?zone=` 상세 패널이 '참고도'·면적·새 경계 설명을 보여주는가
    4) 지도에 경계가 그려지고(지적편집도 켜고) 콘솔 오류 0건인가
    5) 스크린샷 — 앱의 카카오맵 투영으로 위경도→화면 픽셀을 받아, 학교·공원 필지와 1~5구역계를
       화면 위에 겹쳐 그린 검수 이미지를 남긴다
         downloads/redev_songpa117_fixed.png        (1~5구역 전체)
         downloads/redev_songpa117_fixed_school.png (학교 담장·공원 경계 확대)
         downloads/redev_songpa117_fixed*_raw.png   (주석 없는 원본 화면)
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

VERTS = {"1": 4, "2": 4, "3": 6, "4": 4, "5": 5}
AREAS = {"1": 15611, "2": 16385, "3": 16043, "4": 13142, "5": 19514}
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


def annotate(raw_path, out_path, screens, title, pad=70):
    """원본 화면 위에 학교·공원 필지와 1~5구역계를 겹쳐 그린 검수 이미지(3:2 로 잘라 냄)."""
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
    for key, col, label in (("school", (0, 160, 0), "서울송파초등학교 (송파동 114학)"),
                            ("park", (235, 110, 0), "송파근린공원 (송파동 113공)")):
        pts = [tuple(p) for p in screens[key]]
        d.polygon(pts, fill=col + (60,))
        d.line(pts + [pts[0]], fill=col + (255,), width=5)
        cx2 = sum(p[0] for p in pts) / len(pts)
        cy2 = sum(p[1] for p in pts) / len(pts)
        tw = d.textlength(label, font=small)
        d.rectangle([cx2 - tw / 2 - 8, cy2 - 16, cx2 + tw / 2 + 8, cy2 + 16], fill=(255, 255, 255, 225))
        d.text((cx2 - tw / 2, cy2 - 13), label, fill=col + (255,), font=small)
    for n in "12345":
        pts = [tuple(p) for p in screens[f"zone{n}"]]
        d.line(pts + [pts[0]], fill=ZCOL[n] + (255,), width=4)
        cx2 = sum(p[0] for p in pts) / len(pts)
        cy2 = sum(p[1] for p in pts) / len(pts)
        d.ellipse([cx2 - 17, cy2 - 17, cx2 + 17, cy2 + 17], fill=(255, 255, 255, 230), outline=ZCOL[n] + (255,), width=3)
        d.text((cx2 - 7, cy2 - 14), n, fill=ZCOL[n] + (255,), font=small)
    lines = ["굵은 초록 = 서울송파초등학교 필지", "굵은 주황 = 송파근린공원 필지", "색선 1~5 = 모아타운 구역계(참고도)"]
    bw = max(d.textlength(t, font=small) for t in lines) + 26
    d.rectangle([24, 24, 24 + bw, 24 + 30 * len(lines) + 46], fill=(255, 255, 255, 235))
    d.text((36, 32), title, fill=(20, 20, 20, 255), font=font)
    for i, t in enumerate(lines):
        d.text((36, 74 + 30 * i), t, fill=(40, 40, 40, 255), font=small)
    Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB").save(out_path)
    print("saved", out_path, im.size)


def run():
    geo = fetch_geojson()
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    check("배포본 zones.geojson 2,440곳", len(geo["features"]) == 2440, str(len(geo["features"])))
    zones = {}
    for n in "12345":
        ring = rings_of(feats, f"songpa117-moa-{n}")
        zones[n] = ring
        p = (feats.get(f"songpa117-moa-{n}") or {}).get("properties", {})
        ok = len(ring) == VERTS[n] and p.get("geom") == "참고도" and abs((p.get("area") or 0) - AREAS[n]) < 1
        sc = overlap_area(ring, SCHOOL) if ring else -1
        pk = overlap_area(ring, PARK) if ring else -1
        ok = ok and sc < 0.5 and pk < 0.5
        check(f"{n}구역 — 꼭짓점 {VERTS[n]}·{AREAS[n]:,}㎡·학교/공원 교집합 0",
              ok, f"정점 {len(ring)} · area={p.get('area')} · geom={p.get('geom')} · 학교 {sc:.1f}㎡ · 공원 {pk:.1f}㎡")

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1600, "height": 1060}, device_scale_factor=SS)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        # ① 1~5구역 전체 — 부모 구역 딥링크(레벨 4) → 확대 1회(레벨 3)
        page.goto(f"{BASE}/?zone=songpa117-moa&diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(8)
        body = page.locator("body").inner_text()
        check("부모 구역 패널 — 참고도·80,695㎡", "참고도" in body and "80,695" in body, "")
        check("부모 구역 패널 — 새 경계 설명(정합·직선)", "직선" in body and "송파초등학교" in body, "")
        zoom_in(page, 1)
        cadastral_on(page)
        time.sleep(1.0)
        st = map_state(page)
        check("지도 중심이 구역 안(37.5063±0.002)", abs((st or {}).get("lat", 0) - 37.5063) < 0.002, str(st))
        raw_full = f"{D}/redev_songpa117_fixed_raw.png"
        page.screenshot(path=raw_full)
        rings = {"school": SCHOOL, "park": PARK}
        for n, ring in zones.items():
            rings[f"zone{n}"] = ring
        annotate(raw_full, f"{D}/redev_songpa117_fixed.png", project(page, rings), "송파1동 하단 모아타운 — 수정 후")

        # ② 학교 담장·공원 확대 — 3구역 딥링크(레벨 4) → 확대 2회(레벨 2) + 서쪽으로 이동
        page.goto(f"{BASE}/?zone=songpa117-moa-3&diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(8)
        body = page.locator("body").inner_text()
        check("3구역 패널 — 참고도·16,043㎡", "참고도" in body and "16,043" in body, "")
        zoom_in(page, 2)
        page.mouse.move(700, 520)
        page.mouse.down()
        for x in range(700, 980, 28):
            page.mouse.move(x, 520)
            time.sleep(0.04)
        page.mouse.up()
        time.sleep(2.0)
        cadastral_on(page)
        time.sleep(1.0)
        raw_close = f"{D}/redev_songpa117_fixed_school_raw.png"
        page.screenshot(path=raw_close)
        annotate(raw_close, f"{D}/redev_songpa117_fixed_school.png", project(page, rings),
                 "학교 담장·공원 경계 확대")

        real = [e for e in errs if "favicon" not in e and "ResizeObserver" not in e]
        check("콘솔 오류 0", len(real) == 0, str(real[:3]))
        b.close()
    print("실패", len(failures), failures)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run())
