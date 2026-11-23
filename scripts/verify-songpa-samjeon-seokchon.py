#!/usr/bin/env python3
"""송파 삼전동·석촌고분 민도복 5곳 필지정합 경계 — 배포본 검수 + 스크린샷

  TARGET_URL=https://redev-platform-iota.vercel.app python3 scripts/verify-songpa-samjeon-seokchon.py

  확인
    1) 배포본 zones.geojson 의 5개 구역이 새 필지정합 도형(꼭짓점 35·47·38·24·46)인가
       — geom "필지정합", boundaryApprox false, 표기 면적(60,199·59,028·59,602·38,073·45,449㎡) 유지,
         좌표가 tmp/samjeon_seokchon_fix.json 과 1e-7 까지 같은가
    2) 2,440곳이 그대로이고(사라짐·증가 0), 5곳끼리·기존 구역과 겹침이 0㎡ 인가
    3) 제방(184-x제)·하천(185-x천)·학교(63·172-1·220학)·공원(62-1·70·248공) 필지와 교집합이 0㎡ 인가
       (나루터어린이공원 37공은 존치로 구역 안 — 예외)
    4) `?zone=` 상세 패널이 '필지정합' 경계 문구와 계측 면적을 보여주는가
    5) 지도에 5곳 경계가 그려지고(지적편집도 켜고) 콘솔 오류 0건인가
    6) 스크린샷 — 앱의 카카오맵 투영으로 위경도→화면 픽셀을 받아 5개 구역계와 제외 필지를 겹쳐 그린다
         downloads/redev_samjeon_seokchon_fixed.png           (5곳 전체, 주석)
         downloads/redev_samjeon_seokchon_fixed_zoom.png      (삼전동1·2 확대)
         downloads/redev_samjeon_seokchon_fixed*_raw.png      (주석 없는 원본 화면)
       주석은 앱의 카카오맵 투영으로 5개 구역계·제외 필지(제방·하천·학교·공원)를 얹고,
       오른쪽 상세 패널·상단바·하단바는 잘라 낸 지도 영역만 남긴다.
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
FIX = "/workspace/tmp/samjeon_seokchon_fix.json"
PARCELS = "/workspace/tmp/samjeon/parcel_cache.json"

# id: (꼭짓점, 표기 면적, 계측 면적)
EXPECT = {
    "songpa-samjeon-1": (35, 60199, 60459),
    "songpa-samjeon-2": (47, 59028, 58972),
    "songpa-samjeon-3": (38, 59602, 60374),
    "songpa-seokchongobun-1": (24, 38073, 38111),
    "songpa-seokchongobun-2": (46, 45449, 47264),
}
LABEL = {
    "songpa-samjeon-1": "삼전동1",
    "songpa-samjeon-2": "삼전동2",
    "songpa-samjeon-3": "삼전동3",
    "songpa-seokchongobun-1": "석촌고분1",
    "songpa-seokchongobun-2": "석촌고분2",
}
ZCOL = {
    "songpa-samjeon-1": (200, 0, 0),
    "songpa-samjeon-2": (0, 110, 110),
    "songpa-samjeon-3": (0, 60, 220),
    "songpa-seokchongobun-1": (190, 0, 190),
    "songpa-seokchongobun-2": (40, 40, 40),
}
KEEP_PARK = "37공"  # 나루터어린이공원 — 존치로 구역 안에 포함(예외)
failures: list[str] = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


# ── 기하 ──────────────────────────────────────────────────────────────────────
def to_m(geom_latlng):
    from shapely.geometry import Polygon
    from shapely.ops import transform as tr
    import pyproj

    fwd = pyproj.Transformer.from_crs(4326, 5179, always_xy=True).transform
    poly = Polygon([(lng, lat) for lat, lng in geom_latlng])
    return tr(lambda x, y, z=None: fwd(x, y), poly)


def rings_of(feat):
    ring = (feat.get("geometry") or {}).get("coordinates") or [[]]
    pts = [[c[1], c[0]] for c in ring[0]]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def fetch_geojson():
    req = urllib.request.Request(f"{BASE}/data/zones.geojson", headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def special_parcels():
    """사전 조사 때 받아 둔 연속지적도 필지 캐시 — 지번이 제/천/학/공 으로 끝나는 필지."""
    cache = json.load(open(PARCELS, encoding="utf-8"))
    out = {}
    for v in cache.values():
        if "rings" not in v:
            continue
        j = v["jibun"]
        cls = "제방" if j.endswith("제") else "하천" if j.endswith("천") else "학교" if j.endswith("학") else "공원" if j.endswith("공") else None
        if not cls or j in out:
            continue
        outer = [[lat, lng] for lat, lng in v["rings"][0]]
        out[j] = (cls, outer)
    return out


# ── 지도 ──────────────────────────────────────────────────────────────────────
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


def fit_bounds(page, rings, pad=(90, 90, 560, 90)):
    lats = [p[0] for r in rings.values() for p in r]
    lngs = [p[1] for r in rings.values() for p in r]
    return page.evaluate(
        """([s, w, n, e, p]) => { const d=window.__redevDiag, k=window.kakao, m=d.map();
             const b=new k.maps.LatLngBounds(new k.maps.LatLng(s,w), new k.maps.LatLng(n,e));
             m.setBounds(b, p[0], p[1], p[2], p[3]);
             const c=m.getCenter(); return [c.getLat(), c.getLng(), m.getLevel()]; }""",
        [min(lats) - 0.0006, min(lngs) - 0.0006, max(lats) + 0.0006, max(lngs) + 0.0006, list(pad)],
    )


def panel_left(page):
    """오른쪽 상세 패널(사업 개요)의 왼쪽 가장자리 — 캡처에서 패널을 잘라 낼 때 쓴다."""
    try:
        return page.evaluate(
            """() => { const els=[...document.querySelectorAll('div')].filter(el=>{
                 const r=el.getBoundingClientRect();
                 return r.width>300 && r.width<520 && r.height>500 && r.left>900; });
               return els.length ? els[0].getBoundingClientRect().left : null; }"""
        )
    except Exception:  # noqa: BLE001
        return None


def project(page, rings):
    return page.evaluate(
        """(rings) => {
             const d = window.__redevDiag, k = window.kakao, m = d.map();
             const proj = m.getProjection();
             const el = document.querySelector('.kakao-zone-canvas').parentElement;
             const box = el.getBoundingClientRect();
             const pt = (lat, lng) => { const p = proj.containerPointFromCoords(new k.maps.LatLng(lat, lng));
               return [p.x + box.left, p.y + box.top]; };
             const out = {};
             for (const [key, ring] of Object.entries(rings)) out[key] = ring.map(([la, ln]) => pt(la, ln));
             return out; }""",
        rings,
    )


def annotate(raw_path, out_path, screens, title, clamp=None):
    im = Image.open(raw_path).convert("RGB")
    xs = [p[0] for pts in screens.values() for p in pts]
    ys = [p[1] for pts in screens.values() for p in pts]
    pad = 90
    x0, y0 = int(min(xs) * SS) - pad, int(min(ys) * SS) - pad
    x1, y1 = int(max(xs) * SS) + pad, int(max(ys) * SS) + pad
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    if w / h < 1.6:
        w = int(h * 1.6)
    else:
        h = int(w / 1.6)
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
    if clamp:  # (left, top, right, bottom) CSS px — 앱 패널·상단바·하단바를 잘라 낸다
        x0 = max(x0, int(clamp[0] * SS))
        y0 = max(y0, int(clamp[1] * SS))
        x1 = min(x1, int(clamp[2] * SS))
        y1 = min(y1, int(clamp[3] * SS))
    im = im.crop((x0, y0, x1, y1))
    screens = {k: [[p[0] * SS - x0, p[1] * SS - y0] for p in pts] for k, pts in screens.items()}

    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    font = ImageFont.truetype("/workspace/fonts/NanumGothic-Regular.ttf", 30)
    small = ImageFont.truetype("/workspace/fonts/NanumGothic-Regular.ttf", 23)
    tiny = ImageFont.truetype("/workspace/fonts/NanumGothic-Regular.ttf", 20)

    # 제외 필지 — 제방·하천은 남색 점선, 학교·공원은 초록/주황 채움
    for key, pts in screens.items():
        if not key.startswith("parcel:"):
            continue
        _, jibun, cls = key.split(":", 2)
        pts2 = [tuple(p) for p in pts]
        if cls in ("제방", "하천"):
            col = (30, 60, 170)
            for i in range(0, len(pts2), 1):
                d.line([pts2[i], pts2[(i + 1) % len(pts2)]], fill=col + (230,), width=3)
        else:
            col = (0, 160, 0) if cls == "학교" else (235, 110, 0)
            d.polygon(pts2, fill=col + (70,))
            d.line(pts2 + [pts2[0]], fill=col + (255,), width=4)
        cx2 = sum(p[0] for p in pts2) / len(pts2)
        cy2 = sum(p[1] for p in pts2) / len(pts2)
        txt = jibun
        tw = d.textlength(txt, font=tiny)
        d.rectangle([cx2 - tw / 2 - 5, cy2 - 12, cx2 + tw / 2 + 5, cy2 + 12], fill=(255, 255, 255, 210))
        d.text((cx2 - tw / 2, cy2 - 10), txt, fill=col + (255,), font=tiny)

    # 5개 구역계
    for key, pts in screens.items():
        if not key.startswith("zone:"):
            continue
        zid = key.split(":", 1)[1]
        col = ZCOL[zid]
        pts2 = [tuple(p) for p in pts]
        d.polygon(pts2, fill=col + (34,))
        d.line(pts2 + [pts2[0]], fill=col + (255,), width=5)
        # 이름표는 도형 위쪽 모서리 밖에 앉혀 앱 자체 구역 이름표와 겹치지 않게 한다
        lx = min(p[0] for p in pts2) + 10
        ly = min(p[1] for p in pts2) - 34
        label = LABEL[zid]
        tw = d.textlength(label, font=font)
        d.rectangle([lx - 8, ly - 18, lx + tw + 8, ly + 16], fill=(255, 255, 255, 240), outline=col + (255,), width=2)
        d.text((lx, ly - 15), label, fill=col + (255,), font=font)

    lines = [
        "색 실선 = 5개 구역계(필지정합, 연속지적도 필지선)",
        "초록 = 학교(63·172-1·220학)  주황 = 공원(62-1·70·248공)",
        "남색 = 제방(184-x제)·하천(185-x천) — 모두 구역 밖",
        "안쪽 37공(나루터어린이공원)은 존치로 구역 안에 포함",
    ]
    bw = max(d.textlength(t, font=small) for t in lines) + 30
    d.rectangle([26, 26, 26 + bw, 26 + 32 * len(lines) + 56], fill=(255, 255, 255, 240))
    d.text((40, 36), title, fill=(20, 20, 20, 255), font=font)
    for i, t in enumerate(lines):
        d.text((40, 84 + 32 * i), t, fill=(40, 40, 40, 255), font=small)
    Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB").save(out_path)
    print("saved", out_path, im.size)


def run():
    geo = fetch_geojson()
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    check("배포본 zones.geojson 2,440곳", len(geo["features"]) == 2440, str(len(geo["features"])))
    fix = {z["id"]: z for z in json.load(open(FIX, encoding="utf-8"))["zones"]}

    rings = {}
    for zid, (nvert, area, measured) in EXPECT.items():
        f = feats.get(zid)
        p = (f or {}).get("properties", {})
        ring = rings_of(f) if f else []
        rings[zid] = ring
        copied = (fix[zid]["geometry"]["coordinates"][0])[:-1]
        same = len(copied) == len(ring) and all(abs(a[1] - b[0]) < 1e-6 and abs(a[0] - b[1]) < 1e-6 for a, b in zip(copied, ring))
        m2 = round(to_m(ring).area) if ring else -1
        ok = (
            len(ring) == nvert
            and p.get("geom") == "필지정합"
            and p.get("boundaryApprox") is False
            and p.get("area") == area
            and p.get("asOf") == "2026-11-23"
            and same
            and abs(m2 - measured) <= 8
        )
        check(
            f"{LABEL[zid]} — {nvert}정점·{area:,}㎡·필지정합·사전조사 좌표 일치",
            ok,
            f"정점 {len(ring)} · geom={p.get('geom')} · approx={p.get('boundaryApprox')} · area={p.get('area')} · 계측 {m2:,}㎡ · asOf={p.get('asOf')}",
        )

    # 겹침 — 5곳끼리, 그리고 기존 2,435곳
    from shapely.geometry import shape
    from shapely.ops import transform as tr
    import pyproj

    fwd = pyproj.Transformer.from_crs(4326, 5179, always_xy=True).transform
    to_m_shp = lambda g: tr(lambda x, y, z=None: fwd(x, y), g)
    zb = {zid: to_m_shp(shape(feats[zid]["geometry"])) for zid in EXPECT}
    keys = list(zb)
    self_ov = sum(zb[keys[i]].intersection(zb[keys[j]]).area for i in range(len(keys)) for j in range(i + 1, len(keys)))
    other_ov, other_names = 0.0, []
    for fid, f in feats.items():
        if fid in EXPECT or not f.get("geometry"):
            continue
        g = to_m_shp(shape(f["geometry"]))
        for zid, zg in zb.items():
            if zg.bounds[0] > g.bounds[2] or zg.bounds[2] < g.bounds[0] or zg.bounds[1] > g.bounds[3] or zg.bounds[3] < g.bounds[1]:
                continue
            a = zg.intersection(g).area
            if a > 1:
                other_ov += a
                other_names.append((fid, round(a)))
    check("5곳끼리 겹침 0㎡", self_ov < 1, f"{self_ov:.2f}㎡")
    check("기존 구역과 겹침 0㎡", other_ov < 1, f"{other_ov:.2f}㎡ {other_names[:3]}")

    # 제외 필지 검사
    sp = special_parcels()
    print(f"제외 대상 필지 {len(sp)}곳: {', '.join(sorted(sp))}")
    viol, slivers = [], []
    for jibun, (cls, ring) in sp.items():
        if jibun == KEEP_PARK:
            continue
        g = to_m(ring)
        for zid, zg in zb.items():
            a = g.intersection(zg).area
            if a > 5:
                viol.append((jibun, cls, zid, round(a)))
            elif a > 1:
                slivers.append((jibun, cls, zid, round(a, 1), round(a / g.area * 100, 2)))
    check("제방·하천·학교·공원 필지와 교집합 0㎡", not viol, str(viol[:5]))
    if slivers:
        print(f"  (참고) 5㎡ 미만 접합 오차 {len(slivers)}건 — {slivers}")
    if KEEP_PARK in sp:
        g = to_m(sp[KEEP_PARK][1])
        inside = max(g.intersection(zg).area for zg in zb.values()) / g.area
        check(f"{KEEP_PARK} 나루터어린이공원은 구역 안(존치 포함)", inside > 0.98, f"{inside * 100:.0f}% 포함")

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1600, "height": 1060}, device_scale_factor=SS)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)

        # ① 구역별 상세 패널 — 필지정합 문구·계측 면적
        for zid, (nvert, area, measured) in EXPECT.items():
            page.goto(f"{BASE}/?zone={zid}&diag=1", wait_until="domcontentloaded")
            page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
            time.sleep(7)
            body = page.locator("body").inner_text()
            ok = "필지선에 맞춰 다시 조립한 경계" in body and f"{area:,}" in body
            check(
                f"{LABEL[zid]} 패널 — 필지정합 문구·{area:,}㎡",
                ok,
                "" if ok else body[:160].replace("\n", " "),
            )

        # ② 5곳 전체 — 지적편집도 켜고 한 화면에
        page.goto(f"{BASE}/?zone=songpa-samjeon-2&diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(8)
        cadastral_on(page)
        st = fit_bounds(page, rings)
        print("setBounds →", st)
        time.sleep(4)
        cadastral_on(page)
        time.sleep(1.0)
        try:
            pressed = page.locator("button:has-text('지적편집도')").first.get_attribute("aria-pressed")
        except Exception:  # noqa: BLE001
            pressed = None
        check("지적편집도 켜짐", pressed == "true", f"aria-pressed={pressed}")
        st = map_state(page)
        inside = page.evaluate(
            """(rings) => { const m=window.__redevDiag.map(); const b=m.getBounds();
                 const c=[rings.map(r=>r.reduce((a,p)=>a+p[0],0)/r.length), rings.map(r=>r.reduce((a,p)=>a+p[1],0)/r.length)];
                 return c[0].map((la,i)=> b.contain(new window.kakao.maps.LatLng(la, c[1][i]))); }""",
            list(rings.values()),
        )
        check("5곳 무게중심이 모두 화면 안", all(inside), f"{inside} · {st}")
        raw = f"{D}/redev_samjeon_seokchon_fixed_raw.png"
        page.screenshot(path=raw)

        to_project = {f"zone:{zid}": ring for zid, ring in rings.items()}
        for jibun, (cls, ring) in sp.items():
            to_project[f"parcel:{jibun}:{cls}"] = ring
        clamp = panel_left(page)
        box = (0, 54, clamp or 1600, 1010)
        print("패널 왼쪽", clamp)
        annotate(raw, f"{D}/redev_samjeon_seokchon_fixed.png", project(page, to_project),
                 "송파 삼전동·석촌고분 민도복 5곳 — 필지정합 경계", clamp=box)

        # ③ 삼전동1·2 확대 — 필지선을 따라가는 경계를 눈으로 확인
        page.goto(f"{BASE}/?zone=songpa-samjeon-1&diag=1", wait_until="domcontentloaded")
        page.wait_for_selector(".kakao-zone-canvas", timeout=90000)
        time.sleep(7)
        cadastral_on(page)
        print("zoom fit →", fit_bounds(page, {z: rings[z] for z in ("songpa-samjeon-1", "songpa-samjeon-2")},
                                       pad=(60, 90, 560, 90)))
        time.sleep(3.5)
        raw_zoom = f"{D}/redev_samjeon_seokchon_fixed_zoom_raw.png"
        page.screenshot(path=raw_zoom)
        near = {k: v for k, v in to_project.items()
                if k.startswith("parcel:") and v[0][0] > 37.4995}
        near.update({f"zone:{z}": rings[z] for z in ("songpa-samjeon-1", "songpa-samjeon-2")})
        annotate(raw_zoom, f"{D}/redev_samjeon_seokchon_fixed_zoom.png", project(page, near),
                 "삼전동1·2 — 필지선을 따라가는 경계(확대)",
                 clamp=(0, 54, panel_left(page) or 1600, 1010))

        real = [e for e in errs if "favicon" not in e and "ResizeObserver" not in e]
        check("콘솔 오류 0", len(real) == 0, str(real[:3]))
        b.close()
    print("실패", len(failures), failures)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(run())
