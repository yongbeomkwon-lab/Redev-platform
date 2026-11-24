#!/usr/bin/env python3
"""양재동 397-1 — 제척 4곳(성당·공원·전법회관·구룡사)을 골목 폭까지 이어 **단일 홀 하나**로 (2026-11-25)

## 왜
  2026-11-25 반영분은 성당·공원·전법회관을 따로 뚫은 홀 3개였고, 구룡사/구룡유치원(399-1)은 구역 안에 있었다.
  대표 지시: "양재동 구룡사까지 들어가야 하고 건물하나랑도 같이 연결돼야 하고 공원이랑 성당도 연결돼야"
  → 네 블록 + 블록 사이 골목(390-17·390-20 도로 필지)을 하나로 합친 **단일 제척 영역 1개**로 바꾼다.

## 무엇이 바뀌나 (yangjae-397-1 만)
  · polygon — 2026-11-24 대표 직접작도 8정점 **그대로**(53,949㎡). 손대지 않는다.
  · holes   — 3곳 → **1곳**. 성당(396-2·396-10) + 구룡어린이공원(399) + 구룡유치원/구룡사(399-1) +
              전법회관 건물(400-9) + 두 골목의 접면 구간. 실측 7,301㎡.
  · dividers — 보라 점선(사업예정구역 1·2)은 종전 방향 그대로, 통합 홀 경계에서 끊어 두 토막.
  · areaShape = 외곽 53,949㎡ − 제척 7,301㎡ = 46,648㎡, areaNote·boundaryNote 사실대로 갱신.
  ※ 표기면적(area 41,005㎡)은 공고·집계값 그대로. 나머지 2,378곳은 건드리지 않는다.

## 검증 (--check)
  외곽 불변 · 홀 1개이며 외곽 안 · 홀과 외곽 테두리 사이 최소 5m · 구분선 2토막이 홀을 가로지르지 않음
  · 이름표가 홀 밖 · 이웃 374·382와 겹침 없음 · 나머지 구역 변경 0건 · geojson/metadata/meta 일치

실행: python3 scripts/apply-yangjae-397-1-merged-20261125.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "yangjae-397-1-merged-20261125.json"
META_KEY = "yangjae397Merged20261125"
ZID = "yangjae-397-1"
EXPECTED_COUNT = 2379
NEIGHBOURS = ["11000UQ120PS202503070074", "11000UQ120PS202503070075"]  # 양재동 374 · 382
AREA_PUBLISHED = 41005
M_PER_DEG_LAT = 111132.0

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def _xy(p):
    return (p[1] * M_PER_DEG_LAT * math.cos(math.radians(37.471)), p[0] * M_PER_DEG_LAT)


def seg_dist_m(pt, a, b) -> float:
    px, py = _xy(pt)
    ax, ay = _xy(a)
    bx, by = _xy(b)
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def boundary_dist_m(pt, ring) -> float:
    return min(seg_dist_m(pt, ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring)))


def inside(pt, ring) -> bool:
    la, lo = pt
    c = False
    for i in range(len(ring)):
        la1, lo1 = ring[i]
        la2, lo2 = ring[(i + 1) % len(ring)]
        if (lo1 > lo) != (lo2 > lo) and la < (la2 - la1) * (lo - lo1) / (lo2 - lo1) + la1:
            c = not c
    return c


def seg_crosses_ring(a, b, ring, samples=200) -> int:
    """선분 a-b 가 링 안으로 들어가는 표본 수 — 0이면 가로지르지 않는다."""
    n = 0
    for k in range(1, samples):
        p = (a[0] + (b[0] - a[0]) * k / samples, a[1] + (b[1] - a[1]) * k / samples)
        if inside(p, ring):
            n += 1
    return n


def overlap_area(a, b) -> float:
    """두 링이 실제로 겹치는 면적(㎡) — 맞닿은 변은 겹침으로 보지 않는다."""
    mx = M_PER_DEG_LAT * math.cos(math.radians(37.471))
    my = M_PER_DEG_LAT
    A = [(p[1] * mx, p[0] * my) for p in a]
    B = [(p[1] * mx, p[0] * my) for p in b]

    def clip(subject, clipper):
        def inside_p(p, a1, a2):
            return (a2[0] - a1[0]) * (p[1] - a1[1]) - (a2[1] - a1[1]) * (p[0] - a1[0]) >= 0

        def intersect(p1, p2, a1, a2):
            x1, y1 = p1
            x2, y2 = p2
            x3, y3 = a1
            x4, y4 = a2
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(den) < 1e-12:
                return p2
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

        out = subject
        for i in range(len(clipper)):
            a1, a2 = clipper[i], clipper[(i + 1) % len(clipper)]
            if not out:
                return []
            inp, out = out, []
            s = inp[-1]
            for e in inp:
                if inside_p(e, a1, a2):
                    if not inside_p(s, a1, a2):
                        out.append(intersect(s, e, a1, a2))
                    out.append(e)
                elif inside_p(s, a1, a2):
                    out.append(intersect(s, e, a1, a2))
                s = e
        return out

    def area(ring):
        return abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1]
                       for i in range(len(ring)))) / 2

    poly = clip(A, B)
    return area(poly) if len(poly) >= 3 else 0.0


def _center(ring):
    lats = [p[0] for p in ring]
    lngs = [p[1] for p in ring]
    return [round((min(lats) + max(lats)) / 2, 6), round((min(lngs) + max(lngs)) / 2, 6)]


AREA_NOTE = (
    "서초구 공고문은 구역면적을 '약 4.1만㎡'로만 안내하고, 재개발닷컴 집계값 41,005㎡를 표기 면적으로 "
    "두었습니다. 2026-11-24 대표가 지도에서 직접 그린 테두리(8정점)의 실측 면적은 {outer}㎡"
    "(표기 대비 {dpct}%)이고, 그 안에서 필지 단위로 뺀 성당·구룡어린이공원·전법회관·구룡사 자리와 "
    "사이 골목 폭({hole}㎡)을 제외하면 {net}㎡입니다. 표기 면적은 이 제척 전 바깥 구역계를 기준으로 한 "
    "값이어서 실측과 차이가 납니다."
)

BOUNDARY_NOTE = (
    "대표님(권용범)이 2026-11-24 리디브 지도에서 도로선·필지선에 맞춰 직접 그린 8정점 테두리입니다"
    "(geom 직접작도, 정밀 측량값 아님). 2026-11-25 정리 — 구역 안에서 필지 단위로 뺀 곳은 양재2동성당"
    "(396-2·396-10), 구룡어린이공원(399), 구룡유치원(구룡사, 399-1), 전법회관 건물 자리(400-9) "
    "네 곳이며, 이 네 블록을 사이 골목(390-17·390-20 도로) 폭까지 포함해 '하나로 이어진 제척 영역 "
    "1개로 합쳤습니다(대표 지시: 구룡사까지 넣고 성당·공원·건물을 다 연결). 예미담·효신빌라·시화빌딩 "
    "등 나머지 필지는 그대로 구역 안입니다. 가운데 사업예정구역 1·2 구분선(보라 점선)은 종전 방향 그대로 "
    "두되 통합 제척 영역을 가로지르지 않도록 그 경계에서 두 토막으로 끊었습니다. 이 구역계는 "
    "신청인(추진주체)이 제출한 것이어서 후보지 추천·자치구 협의 과정에서 조정될 수 있습니다."
)


def _entry():
    d = _data()
    outer, holes = d["outer"], [h["ring"] for h in d["holes"]]
    if len(outer) != 8 or len(holes) != 1:
        raise SystemExit("[중단] 외곽 8정점 · 홀 1개가 아닙니다")
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    hit = next((z for z in src if z.get("id") == ZID), None)
    if hit is None:
        raise SystemExit(f"[중단] {ZID} 가 seoul-zones.json 에 없습니다")
    net = d["areaNet"]
    entry = dict(hit)
    entry["polygon"] = outer
    entry["holes"] = holes
    entry["dividers"] = [{"coords": dv["coords"], "labels": dv.get("labels") or []} for dv in d["dividers"]]
    entry["geom"] = "직접작도"
    entry["boundaryApprox"] = False
    entry["area"] = AREA_PUBLISHED
    entry["areaShape"] = net
    entry["ringPts"] = len(outer)
    entry["center"] = _center(outer)
    entry["centerLabel"] = "대표 직접작도 테두리(2026-11-24) 중심"
    entry["asOf"] = "2026-11-25"
    entry["areaNote"] = AREA_NOTE.format(
        outer=format(d["areaOuter"], ","),
        hole=format(d["areaHole"], ","),
        net=format(net, ","),
        dpct=f"{d['areaOuter'] / AREA_PUBLISHED * 100 - 100:+.1f}",
    )
    entry["boundaryNote"] = BOUNDARY_NOTE
    return entry, d


def _head(path: str):
    try:
        raw = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _body(ring):
    return ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring


def check() -> int:
    bad = 0
    entry, d = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    z = next((x for x in src if x.get("id") == ZID), None)
    f = _feat(geo, ZID)
    hole = entry["holes"][0]
    outer = entry["polygon"]

    ok = (len(src) == len(geo["features"]) == EXPECTED_COUNT and index.get("count") == EXPECTED_COUNT
          and (geo.get("metadata") or {}).get("count") == EXPECTED_COUNT)
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    bad += 0 if ok else 1

    ok = bool(z and f) and _norm(z.get("polygon")) == _norm(outer) and _norm(z.get("holes")) == _norm([hole])
    print(f"[{'OK' if ok else 'FAIL'}] {ZID} 도형 — 외곽 {len(outer)}정점 · 홀 {len(z.get('holes') or [])}개")
    bad += 0 if ok else 1

    want_outer = [[37.4724083, 127.0467935], [37.470459, 127.0490461], [37.4715981, 127.0507312], [37.4725401, 127.049754],
                  [37.4723555, 127.0494882], [37.4731397, 127.0486691], [37.4730542, 127.0485616], [37.4733471, 127.0482396]]
    ok = _norm(outer) == _norm(want_outer)
    print(f"[{'OK' if ok else 'FAIL'}] 외곽 8정점이 a1f209a 대표 원본과 동일(손대지 않음)")
    bad += 0 if ok else 1

    geo_holes = ((((f or {}).get("geometry") or {}).get("coordinates") or [])[1:])
    same_hole = len(geo_holes) == 1 and len(_body(geo_holes[0])) == len(hole) and all(
        abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(_body(geo_holes[0]), hole))
    geo_outer = ((((f or {}).get("geometry") or {}).get("coordinates") or [[]])[0])
    same_outer = len(_body(geo_outer)) == len(outer) and all(
        abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(_body(geo_outer), outer))
    print(f"[{'OK' if same_hole and same_outer else 'FAIL'}] geojson 외곽·홀 좌표 일치")
    bad += 0 if (same_hole and same_outer) else 1

    outside = [p for p in hole if not inside(p, outer)]
    print(f"[{'OK' if not outside else 'FAIL'}] 홀 꼭짓점이 모두 외곽 안 ({len(outside)}개 밖)")
    bad += 0 if not outside else 1

    gap = min(boundary_dist_m(p, outer) for p in hole)
    ok = gap >= 5.0
    print(f"[{'OK' if ok else 'FAIL'}] 홀 ↔ 외곽 테두리 최소 간격 {gap:.1f}m (5m 이상)")
    bad += 0 if ok else 1

    # 구분선 2토막 — 홀을 가로지르지 않고, 끝점이 홀 경계·외곽 경계에 닿는다
    divs = (z or {}).get("dividers") or []
    ok = len(divs) == 2 and all(len(dv.get("coords") or []) == 2 for dv in divs)
    print(f"[{'OK' if ok else 'FAIL'}] 구분선 {len(divs)}토막 · 각 2점")
    bad += 0 if ok else 1
    for i, dv in enumerate(divs):
        a, b = [tuple(p) for p in dv["coords"]]
        cross = seg_crosses_ring(a, b, hole)
        da = [boundary_dist_m(a, hole), boundary_dist_m(a, outer)]
        db = [boundary_dist_m(b, hole), boundary_dist_m(b, outer)]
        ok = cross == 0 and min(da) <= 1.0 and min(db) <= 1.0
        print(f"[{'OK' if ok else 'FAIL'}] 구분선 {i + 1}토막 — 홀 안 표본 {cross}개 · a끝↔(홀,외곽) "
              f"{[round(x, 1) for x in da]}m · b끝 {[round(x, 1) for x in db]}m")
        bad += 0 if ok else 1
    labels = [lb for dv in divs for lb in dv.get("labels") or []]
    ok = len(labels) == 2 and all(not inside(tuple(lb["at"]), hole) and inside(tuple(lb["at"]), outer) for lb in labels)
    print(f"[{'OK' if ok else 'FAIL'}] 구분선 이름표 {len(labels)}개 — 모두 외곽 안·홀 밖")
    bad += 0 if ok else 1

    # 이웃(374·382)과 겹치지 않는가
    n_over = []
    for nid in NEIGHBOURS:
        nf = _feat(geo, nid)
        if not nf or not nf.get("geometry"):
            continue
        g0 = nf["geometry"]["coordinates"]
        rings = [g0[0]] if nf["geometry"]["type"] == "Polygon" else [p[0] for p in g0]
        for r in rings:
            ring = [[p[1], p[0]] for p in _body(r)]
            a = overlap_area(outer, ring)
            if a > 1.0:
                n_over.append((nid, round(a, 1)))
    print(f"[{'OK' if not n_over else 'FAIL'}] 이웃 374·382 겹침 {len(n_over)}곳" + ("" if not n_over else f" {n_over}"))
    bad += 0 if not n_over else 1

    props = (f or {}).get("properties") or {}
    ok = (props.get("geom") == "직접작도" and props.get("area") == AREA_PUBLISHED
          and abs((props.get("areaShape") or 0) - d["areaNet"]) <= 1
          and _norm(props.get("dividers")) == _norm(z.get("dividers") if z else None)
          and len(props.get("dividers") or []) == 2)
    print(f"[{'OK' if ok else 'FAIL'}] geojson 속성 — geom {props.get('geom')} · area {props.get('area')} · "
          f"areaShape {props.get('areaShape')} · 구분선 {len(props.get('dividers') or [])}토막")
    bad += 0 if ok else 1

    head = _head("src/data/seoul-zones.json")
    if head is not None:
        old_by = {x.get("id"): x for x in head}
        diff = [x["id"] for x in src if x.get("id") != ZID and _norm(x) != _norm(old_by.get(x.get("id")))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(src) - 1}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old_by = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] != ZID and _norm(x) != _norm(old_by.get(x["properties"]["id"]))]
        print(f"[{'OK' if not diff else 'FAIL'}] geojson 나머지 구역 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1

    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY}")
    bad += 0 if ok else 1

    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    entry, d = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if len(src) != EXPECTED_COUNT:
        raise SystemExit(f"[중단] 예상 밖 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    old = next((z for z in src if z.get("id") == ZID), None)
    if old is None:
        raise SystemExit(f"[중단] {ZID} 없음")
    old.clear()
    old.update(entry)
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")
    hole = entry["holes"][0]
    print(f"[반영] seoul-zones.json {ZID} — 외곽 {len(entry['polygon'])}정점 · 홀 1개({len(hole)}정점) · "
          f"구분선 {len(entry['dividers'])}토막 · 계측 {format(d['areaNet'], ',')}㎡ "
          f"(외곽 {format(d['areaOuter'], ',')}㎡ · 제척 {format(d['areaHole'], ',')}㎡)")

    meta[META_KEY] = {
        "asOf": "2026-11-25",
        "zones": [ZID],
        "note": (
            "양재동 397-1 제척을 성당·공원·전법회관 3개 홀에서 **성당(396-2·396-10)·"
            "구룡어린이공원(399)·구룡유치원/구룡사(399-1)·전법회관(400-9)을 골목(390-17·390-20) 폭까지 "
            f"이어 붙인 단일 홀 1개**({format(d['areaHole'], ',')}㎡)로 교체. 외곽 8정점(53,949㎡)은 "
            f"그대로, 차감 {format(d['areaNet'], ',')}㎡. 사업예정구역 1·2 점선은 방향 그대로 두고 통합 홀 "
            "경계에서 두 토막으로 끊음."
        ),
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[기록] zones-meta.json — {META_KEY}")

    print("[내보내기] node scripts/export-geojson.mjs")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
