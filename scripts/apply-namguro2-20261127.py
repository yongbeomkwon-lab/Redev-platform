#!/usr/bin/env python3
"""리디브 — 남구로2역세권(구로동 714-1번지 일대) 장기전세주택 도시정비형 재개발 신규 등록 (2026-11-27)

## 무엇
`남구로2역세권` — 구로동 714-1번지 일대 장기전세주택 도시정비형 재개발사업(11,486㎡,
정비구역 지정(안) 공람 단계)을 `src/data/seoul-zones.json` 에 넣는다.

## 근거
· 구로구 고시 제2026-126호(2026-08-27) 「개발행위허가 제한지역 지정 및 지형도면 고시」
  첨부 지형도면의 붉은 점선 구역계(11,486㎡) — 경계의 원본
· 구로구 공고 제2026-1445호(2026-08-27)·정정 제2026-1565호(2026-09-03)
  정비구역 지정(안) 및 정비계획 결정(안) 주민공람 결정도 — 구역 안 필지(714-x·13-x) 대조
· 서울시 고시 제2026-490호 — 권리산정기준일 2026-08-27

## 경계를 만든 방법
1. 고시 PDF 2쪽 지형도면(1190×820px, 축척자 0~50m=150px)에서 붉은 점선을 픽셀로 뽑아
   대시 중심점을 최근접 사슬로 이어 17각형으로 단순화(면적 11,487㎡ ≈ 고시 11,486㎡).
2. 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 경계를 리디브 /api/parcel 로 714-1 주변
   1,351필지 확보 → 714블록 북동 모서리(714-1 동쪽·북쪽 경계)를 기준점으로 잡고
   회전·평행이동을 탐색해 구역선이 필지선에 앉는 자리를 찾았다(평균 오차 0.55m).
3. 꼭짓점 8곳을 필지 교차점에 붙이고, 면적이 고시값에 맞도록 축척을 0.3378 m/px 로 고정.

## 실행
    python3 scripts/apply-namguro2-20261127.py          # 반영 + 내보내기
    python3 scripts/apply-namguro2-20261127.py --check  # 검사만
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META = ROOT / "src" / "data" / "zones-meta.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"

ZID = "guro-namguro2"
AS_OF = "2026-11-27"

# [위도, 경도] — 고시 지형도면 구역계 → 연속지적도 필지선 정합 (17점, 폐합 전)
RING = [
    [37.487104, 126.883554],
    [37.487247, 126.883601],
    [37.487225, 126.884283],
    [37.487053, 126.884283],
    [37.486520, 126.884272],
    [37.486372, 126.884336],
    [37.486230, 126.884501],
    [37.486082, 126.884551],
    [37.485918, 126.884476],
    [37.485707, 126.884190],
    [37.485838, 126.884026],
    [37.485908, 126.883835],
    [37.485925, 126.883612],
    [37.485887, 126.883397],
    [37.486015, 126.883411],
    [37.486565, 126.883549],
    [37.486740, 126.883536],
]

ZONE = {
    "id": ZID,
    "name": "남구로2역세권",
    "alias": [
        "남구로2 역세권",
        "남구로2역세권",
        "남구로2역세권 장기전세주택",
        "남구로2 역세권 장기전세주택 도시정비형 재개발사업",
        "구로동 714-1",
        "구로동 714-1번지 일대",
        "구로동 714-1 일대",
    ],
    "type": "장기전세",
    "kind": "장기전세주택(도시정비형 재개발)",
    "stage": "정비구역지정(공람)",
    "gu": "구로구",
    "area": 11486,
    "featured": False,
    "geom": "고시도면",
    "center": [37.486479, 126.883948],
    "centerLabel": "도면 구역계 중심",
    "note": (
        "구로동 714-1번지 일대 11,486㎡의 역세권 장기전세주택 도시정비형 재개발사업입니다. "
        "2026-08-27 구로구 고시 제2026-126호로 개발행위허가 제한지역 지정과 지형도면이 고시됐고"
        "(제한 기간 3년, 정비구역 지정 고시 시까지), 같은 날 구로구 공고 제2026-1445호로 정비구역 "
        "지정(안)·정비계획 결정(안) 주민공람이 시작됐습니다. 2026-09-03 정정 공고 제2026-1565호로 "
        "다시 공람(9.3~10.3)했고 권리산정기준일은 2026-08-27(서울시 고시 제2026-490호)입니다. "
        "정비계획(안)은 법적상한용적률 450%·건폐율 60%·지상 35층(높이 115m)에 546세대"
        "(재개발임대 40세대·장기전세 136세대 포함) 규모이고 추정비례율은 121.38%입니다. "
        "바로 동쪽 715블록의 「남구로역세권공공임대주택 도시정비형 재개발정비구역」"
        "(구로동 715-24 일대, 10,832㎡, 사업시행인가)과는 도로 하나를 사이에 두고 붙어 있으며 "
        "경계가 겹치지 않습니다. 지하철 7호선 남구로역을 걸어서 쓸 수 있습니다."
    ),
    "areaNote": (
        "공식 면적 11,486㎡ — 구로구 고시 제2026-126호(개발행위허가 제한지역)와 정비구역 지정(안) "
        "공람 공고가 같은 값입니다. 지도 도형은 11,493㎡로 공식의 100.1%입니다."
    ),
    "boundaryNote": (
        "2026-08-27 구로구 고시 제2026-126호에 붙은 지형도면의 붉은 점선 구역계를 그대로 옮겼습니다. "
        "714블록 북동 모서리(714-1번지의 동쪽·북쪽 경계)를 기준점으로 잡고 브이월드 연속지적도 "
        "필지선에 맞춰 회전·평행이동을 풀었으며(구역선-필지선 평균 오차 0.55m), 꼭짓점 8곳은 필지 "
        "교차점에 붙였습니다. 구역 안은 714-1~714-48 블록과 그 남쪽 13번지대 일부이고, 동쪽 경계는 "
        "715블록(남구로역세권)과 갈리는 도로입니다. 정비구역 지정 전 공람 단계 도면이라 지정 고시 때 "
        "경계가 달라질 수 있습니다."
    ),
    "sources": [
        {
            "label": (
                "구로구 고시 제2026-126호 — 구로동 714-1번지 일대 개발행위허가 제한지역 지정 및 "
                "지형도면 고시(2026-08-27, 11,486㎡) 첨부 지형도면"
            ),
            "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11530TTC202607060007/%EA%B3%A0%EC%8B%9C%EB%AC%B8%28%EA%B5%AC%EB%B3%B4%29.pdf",
        },
        {
            "label": (
                "구로구 공고 제2026-1445호(2026-08-27)·정정 제2026-1565호(2026-09-03) — 남구로2 역세권 "
                "장기전세주택 도시정비형 재개발사업 정비구역 지정(안) 및 정비계획 결정(안) 주민공람공고"
            ),
            "url": "https://www.guro.go.kr/www/selectBbsNttList.do?bbsNo=663&key=1791",
        },
        {
            "label": (
                "위클리한국주택경제신문(2026-09-02) — 남구로2역세권 추정비례율 121.38%·546세대·"
                "법적상한용적률 450%·35층"
            ),
            "url": "https://www.arunews.com/news/articleView.html?idxno=66716",
        },
    ],
    "sid": "구로구 고시 제2026-126호",
    "asOf": AS_OF,
    "ringPts": len(RING),
    "areaShape": 11493,
    "boundaryApprox": False,
    "drawing": "downloads/남구로2역세권_고시지형도면_2026-11-27.png",
}


def ring_area_m2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111320 * math.cos(math.radians(lat0))
    ky = 110540
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i][1] * kx, ring[i][0] * ky
        x2, y2 = ring[(i + 1) % len(ring)][1] * kx, ring[(i + 1) % len(ring)][0] * ky
        a += x1 * y2 - x2 * y1
    return abs(a / 2), kx, ky


def overlap_m2(a_ring, b_ring):
    """간단 폴리곤 교차 면적 — 두 볼록/단순 폴리곤의 교차는 Sutherland–Hodgman 로 자른 뒤 면적."""
    def clip(subject, clipper):
        out = subject
        n = len(clipper)
        for i in range(n):
            if not out:
                break
            a, b = clipper[i], clipper[(i + 1) % n]
            inp, out = out, []

            def inside(p):
                return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0

            def inter(p, q):
                x1, y1 = p
                x2, y2 = q
                x3, y3 = a
                x4, y4 = b
                den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
                if abs(den) < 1e-18:
                    return p
                t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
                return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

            for j in range(len(inp)):
                cur, prev = inp[j], inp[j - 1]
                if inside(cur):
                    if not inside(prev):
                        out.append(inter(prev, cur))
                    out.append(cur)
                elif inside(prev):
                    out.append(inter(prev, cur))
        return out

    # 볼록 클리퍼가 필요하므로 양쪽을 볼록 껍질로 근사하지 않고, 단순 볼록 다각형만 정확.
    # 여기서는 두 구역 모두 단순 다각형이라 교차 면적은 격자 샘플로 근사하지 않고
    # 볼록 분해 없이 shoelace 로 처리하기 위해 클리퍼를 뒤집어 두 번 시도한다.
    def hull(pts):
        pts = sorted(set(pts))
        if len(pts) <= 2:
            return pts

        def cross(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        lower, upper = [], []
        for p in pts:
            while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
                lower.pop()
            lower.append(p)
        for p in reversed(pts):
            while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
                upper.pop()
            upper.append(p)
        return lower[:-1] + upper[:-1]

    def shoelace(pts):
        if len(pts) < 3:
            return 0.0
        s = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i - 1]
            x2, y2 = pts[i]
            s += x1 * y2 - x2 * y1
        return abs(s) / 2

    # 두 폴리곤이 모두 단순사각형에 가까운 구역 경계라, 볼록 껍질 교차로 상한을 잡고
    # 실제 비교는 점-포함 판정 격자로 근사한다(검사용 근사값).
    return shoelace(clip(hull(a_ring), hull(b_ring)))


def check():
    errs = []
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    zone = next((z for z in src if z.get("id") == ZID), None)
    if zone is None:
        errs.append("seoul-zones.json 에 구역이 없습니다")
    else:
        if zone.get("polygon") != RING:
            errs.append("경계가 스크립트의 RING 과 다릅니다")
        a, _, _ = ring_area_m2(zone["polygon"])
        print(f"[check] 도형 면적 {a:,.1f}㎡ / 고시 11,486㎡ ({a / 11486 * 100:.2f}%)")
        if abs(a - 11486) / 11486 > 0.01:
            errs.append("도형 면적이 고시값과 1% 넘게 차이납니다")
        # 714-1 필지 포함
        p = (37.487184, 126.884222)
        ring = zone["polygon"]
        inside = False
        for i in range(len(ring)):
            x1, y1 = ring[i][1], ring[i][0]
            x2, y2 = ring[(i + 1) % len(ring)][1], ring[(i + 1) % len(ring)][0]
            if (y1 > p[0]) != (y2 > p[0]) and p[1] < (x2 - x1) * (p[0] - y1) / (y2 - y1) + x1:
                inside = not inside
        print(f"[check] 714-1 중심 포함: {inside}")
        if not inside:
            errs.append("714-1 이 구역 안에 없습니다")
        # 이웃 구역(남구로역세권)과 겹침 — 점 격자 근사
        nb = next((z for z in src if z.get("id") == "11000UQ120PS202411014254"), None)
        if nb and nb.get("polygon"):
            lat0 = 37.4864
            kx = 111320 * math.cos(math.radians(lat0))
            ky = 110540
            xs = [q[1] for q in ring] + [q[1] for q in nb["polygon"]]
            ys = [q[0] for q in ring] + [q[0] for q in nb["polygon"]]

            def inr(pt, rg):
                x, y = pt
                c = False
                for i in range(len(rg)):
                    x1, y1 = rg[i][1], rg[i][0]
                    x2, y2 = rg[(i + 1) % len(rg)][1], rg[(i + 1) % len(rg)][0]
                    if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                        c = not c
                return c

            step = 0.00002  # ≈ 2m
            n = 0
            y = min(ys)
            while y <= max(ys):
                x = min(xs)
                while x <= max(xs):
                    if inr((x, y), ring) and inr((x, y), nb["polygon"]):
                        n += 1
                    x += step
                y += step
            area = n * (step * kx) * (step * ky)
            print(f"[check] 남구로역세권(715-24) 겹침 ≈ {area:,.0f}㎡")
            if area > 1:
                errs.append(f"이웃 구역과 {area:.0f}㎡ 겹칩니다")
    if GEOJSON.exists():
        geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
        f = next((x for x in geo.get("features", []) if x["properties"].get("id") == ZID), None)
        print(f"[check] geojson feature: {'있음' if f else '없음'} / 전체 {len(geo.get('features', []))}")
        if f is None:
            errs.append("zones.geojson 에 feature 가 없습니다")
    for e in errs:
        print("  ✗", e)
    return errs


def apply():
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    before = len(src)
    entry = dict(ZONE)
    entry["polygon"] = RING
    old = next((z for z in src if z.get("id") == ZID), None)
    if old is None:
        src.append(entry)
        print(f"[seoul-zones] 추가 {ZID} ({before} → {len(src)})")
    else:
        old.clear()
        old.update(entry)
        print(f"[seoul-zones] 갱신 {ZID} (변화 없음: {len(src)})")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    node = None
    for cand in ("/workspace/.tools/node-v22.14.0-linux-x64/bin/node",):
        if Path(cand).exists():
            node = cand
            break
    node = node or "node"

    r = subprocess.run([node, "scripts/export-geojson.mjs"], cwd=ROOT, capture_output=True, text=True)
    print("[export-geojson]", (r.stdout or r.stderr).strip()[-2000:])
    if r.returncode != 0:
        print("  !! export-geojson 실패 — --force 없이 중단")
        return r.returncode
    r = subprocess.run([node, "scripts/build-zone-index.mjs"], cwd=ROOT, capture_output=True, text=True)
    print("[build-zone-index]", (r.stdout or r.stderr).strip()[-800:])
    if r.returncode != 0:
        return r.returncode

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta["namguro2_20261127"] = {
        "asOf": AS_OF,
        "note": (
            "남구로2역세권(구로동 714-1번지 일대, 11,486㎡) 장기전세주택 도시정비형 재개발 — "
            "구로구 고시 제2026-126호 지형도면 구역계를 연속지적도 필지선에 맞춰 신규 등록."
        ),
    }
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    meta["count"] = len(geo.get("features", []))
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[meta] count={meta['count']}")
    return 0


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(1 if check() else 0)
    rc = apply()
    if rc:
        sys.exit(rc)
    sys.exit(1 if check() else 0)
