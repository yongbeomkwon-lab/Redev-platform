#!/usr/bin/env python3
"""양재동 397-1 — 제척 4곳(성당·공원·전법회관·구룡사)을 **하나로 이어진 홀 1개**로 만든다 (2026-11-25)

## 왜
  앞선 반영(2026-11-25, 홀 3곳)은 성당(396-2·396-10) · 구룡어린이공원(399) · 전법회관(400-9)을
  각각 따로 뚫고 구룡사/구룡유치원(399-1)은 구역 안에 두었다. 대표 지시:
  "양재동 구룡사까지 들어가야 하고 건물하나랑도 같이 연결돼야 하고 공원이랑 성당도 연결돼야"
  → 네 블록을 그 사이 골목(도로) 폭까지 포함해 **하나로 쭉 이어진 단일 제척 영역**으로 바꾼다.

## 무엇으로 잇나 — 실제 지적 필지·도로 필지
  · 성당(396-2+396-10) ↔ 구룡어린이공원(399) 사이 골목 = 양재동 390-17번지 도로 필지
  · 공원(399)+구룡유치원(399-1) ↔ 전법회관(400-9) 사이 골목 = 양재동 390-20번지 도로 필지
  두 골목 필지 중 **마주 보는 두 블록의 접면 구간에 해당하는 부분만** 잘라 붙인다(골목 전체를 넣지 않는다).
  절단선은 골목 진행 방향에 수직 — 블록 경계와 골목 경계만 그대로 따라가고, 주변 일반 건물
  (예미담·효신빌라·시화빌딩·이오스빌딩·지니하우스2 등)은 건드리지 않는다.

## 입력
  · 필지 경계 = 2026-11-24 브이월드 연속지적도 라이브 조회분(tmp/yj397_parcels.json, 390필지)
  · 외곽 = 2026-11-24 대표 직접작도 8정점 (a1f209a) — 손대지 않는다

출력: scripts/data/yangjae-397-1-merged-20261125.json
사용: python3 scripts/build-yangjae-397-1-merged-20261125.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from pyproj import Transformer
import shapely

ROOT = Path(__file__).resolve().parent.parent
PARCELS = ROOT / "tmp" / "yj397_parcels.json"
OUT = ROOT / "scripts" / "data" / "yangjae-397-1-merged-20261125.json"

FWD = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
INV = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)

DONG = "서울특별시 서초구 양재동 "
BLOCKS = {
    "church": {"label": "양재2동(포이동)성당 — 종교시설", "parcels": ["396-2", "396-10"]},
    "park": {"label": "구룡어린이공원(구룡공원 공영주차장 포함)", "parcels": ["399"]},
    "temple": {"label": "양재동 400-9 — 전법회관 건물 자리", "parcels": ["400-9"]},
    "temple2": {"label": "구룡유치원(구룡사) — 종교시설", "parcels": ["399-1"]},
}
ALLEY_1 = "390-17"  # 성당 ↔ 공원 골목
ALLEY_2 = "390-20"  # 공원·유치원 ↔ 전법회관 골목
OUTER = [
    [37.4724083, 127.0467935],
    [37.470459, 127.0490461],
    [37.4715981, 127.0507312],
    [37.4725401, 127.049754],
    [37.4723555, 127.0494882],
    [37.4731397, 127.0486691],
    [37.4730542, 127.0485616],
    [37.4733471, 127.0482396],
]
DIVIDER = {"coords": [[37.4713989, 127.04796], [37.4724176, 127.049423]],
           "labels": [{"text": "사업예정구역 1", "at": [37.472696, 127.048256]},
                      {"text": "사업예정구역 2", "at": [37.471744, 127.049754]}]}


def _proj(ring_latlng):
    g = Polygon([(lng, lat) for lat, lng in ring_latlng])
    if not g.is_valid:
        g = g.buffer(0)
    return shapely.transform(g, lambda c: list(zip(*FWD.transform(c[:, 0], c[:, 1]))))


def load():
    return json.loads(PARCELS.read_text(encoding="utf-8"))


def parcel(P, jibun):
    key = DONG + jibun
    if key not in P:
        raise SystemExit(f"[중단] 필지 없음: {key}")
    return P[key], _proj(P[key]["rings"][0])


def area_m2(g) -> float:
    return float(g.area)


def alley_dir(g):
    cs = list(g.exterior.coords)
    (x1, y1), (x2, y2) = max(
        ((cs[i], cs[i + 1]) for i in range(len(cs) - 1)), key=lambda e: math.dist(*e)
    )
    L = math.hypot(x2 - x1, y2 - y1)
    return ((x2 - x1) / L, (y2 - y1) / L), L


def facing_points(alley, blocks):
    """블록 경계 중 골목에 닿는(0.6m 이내) 점들 — 접면 구간의 양 끝."""
    pts = []
    for b in blocks:
        near = b.boundary.intersection(alley.buffer(0.6))
        for g in getattr(near, "geoms", [near]):
            if not g.is_empty:
                pts += list(g.coords)
    return pts


def bridge(alley, a_blocks, b_blocks):
    """골목 필지 중 **두 블록이 마주 보는 접면 구간**만 사각형으로 잘라낸다.

    절단선의 양 끝은 골목 경계 위의 실제 필지 꼭짓점을 그대로 쓴다 — 새 좌표를 만들지 않으므로
    합친 뒤에도 문턱(바늘)이나 미세한 겹침이 생기지 않는다.
    """
    v, _ = alley_dir(alley)
    o = (alley.centroid.x, alley.centroid.y)

    def pr(p):
        return (p[0] - o[0]) * v[0] + (p[1] - o[1]) * v[1]

    pa = facing_points(alley, a_blocks)
    pb = facing_points(alley, b_blocks)
    ta = [pr(p) for p in pa]
    tb = [pr(p) for p in pb]
    t0, t1 = max(min(ta), min(tb)), min(max(ta), max(tb))
    if t1 - t0 < 2:
        raise SystemExit("[중단] 두 블록의 골목 접면이 겹치지 않습니다")

    def pick(pts, ts, t):
        return min(range(len(pts)), key=lambda i: (abs(ts[i] - t), -ts[i]))

    a0, b0 = pa[pick(pa, ta, t0)], pb[pick(pb, tb, t0)]
    a1, b1 = pa[pick(pa, ta, t1)], pb[pick(pb, tb, t1)]
    quad = Polygon([a0, b0, b1, a1])
    if not quad.is_valid:
        raise SystemExit("[중단] 연결 사각형이 유효하지 않습니다")
    return quad.intersection(alley), round(t1 - t0, 2)


def main() -> int:
    P = load()
    ring_out = OUTER
    outer = _proj(ring_out)

    blocks = {}
    for key, spec in BLOCKS.items():
        parts = []
        info = []
        for j in spec["parcels"]:
            raw, g = parcel(P, j)
            parts.append(g)
            info.append({"jibun": "양재동 " + j, "jibunFull": raw.get("jibun"), "pnu": raw.get("pnu"),
                         "areaM2": round(area_m2(g))})
        blocks[key] = {"geom": unary_union(parts), "label": spec["label"], "parcels": info}

    a1_raw, a1 = parcel(P, ALLEY_1)
    a2_raw, a2 = parcel(P, ALLEY_2)
    b1, span1 = bridge(a1, [blocks["church"]["geom"]], [blocks["park"]["geom"]])
    b2, span2 = bridge(a2, [blocks["park"]["geom"], blocks["temple2"]["geom"]], [blocks["temple"]["geom"]])
    if b1.is_empty or b2.is_empty:
        raise SystemExit("[중단] 연결 다리가 비었습니다")

    merged = unary_union([blocks[k]["geom"] for k in BLOCKS] + [b1, b2])
    if merged.geom_type != "Polygon":
        raise SystemExit(f"[중단] 통합 결과가 단일 폴리곤이 아닙니다: {merged.geom_type}")
    # 문턱 정리 — 접면 절단선이 만든 0.5m 안팎의 바늘(spike)만 걷어낸다(면적 변화 < 1㎡)
    clean = merged.buffer(0.05).buffer(-0.05)
    if clean.geom_type != "Polygon":
        clean = max(getattr(clean, "geoms", [clean]), key=lambda g: g.area)
    simple = clean.simplify(0.2, preserve_topology=True)
    if simple.geom_type != "Polygon" or not simple.is_valid:
        raise SystemExit("[중단] 단순화 결과가 유효한 단일 폴리곤이 아닙니다")
    # 접면 절단선이 남긴 0.5m 안팎의 짧은 변(사실상 중복 정점)을 덜어낸다 — 면적 변화 5㎡ 이내일 때만
    pts = list(simple.exterior.coords)[:-1]
    kept: list[tuple[float, float]] = []
    for p in pts:
        if not kept or math.dist(p, kept[-1]) >= 0.9:
            kept.append(p)
    if len(kept) > 3 and math.dist(kept[0], kept[-1]) < 0.9:
        kept.pop()
    trimmed = Polygon(kept)
    if trimmed.is_valid and trimmed.geom_type == "Polygon" and abs(trimmed.area - simple.area) <= 5.0:
        simple = trimmed

    hole = [[round(lat, 6), round(lng, 6)] for lng, lat in (INV.transform(x, y) for x, y in simple.exterior.coords)]
    if hole[0] == hole[-1]:
        hole = hole[:-1]

    # 구분선 — 통합 홀을 가로지르지 않게 홀 경계에서 끊는다(방향은 그대로)
    d = LineString([(FWD.transform(lng, lat)) for lat, lng in DIVIDER["coords"]])
    rest = d.difference(simple.buffer(0.001))
    segs = sorted([g for g in getattr(rest, "geoms", [rest]) if g.length > 1], key=lambda g: g.length, reverse=True)
    if len(segs) != 2:
        raise SystemExit(f"[중단] 구분선이 2토막이 아닙니다: {len(segs)}")
    segs.sort(key=lambda g: g.coords[0][1])  # 남서 → 북동
    divs = []
    for g in segs:
        coords = [[round(lat, 6), round(lng, 6)] for lng, lat in (INV.transform(x, y) for x, y in g.coords)]
        divs.append({"coords": coords})
    # 이름표는 자기 쪽 토막에 붙인다(남서 토막=1? 실제 자리 기준: 1은 북서쪽, 2는 동쪽)
    for lb in DIVIDER["labels"]:
        x, y = FWD.transform(lb["at"][1], lb["at"][0])
        p = shapely.Point(x, y)
        if simple.contains(p):
            raise SystemExit(f"[중단] 이름표 '{lb['text']}' 가 통합 홀 안에 있습니다")
        # 가장 가까운 토막에 붙인다
        idx = min(range(len(segs)), key=lambda i: segs[i].distance(p))
        divs[idx].setdefault("labels", []).append(lb)
    for dv in divs:
        dv.setdefault("labels", [])

    holes_area = round(area_m2(simple))
    out = {
        "zoneId": "yangjae-397-1",
        "asOf": "2026-11-25",
        "source": (
            "외곽 = 2026-11-24 대표가 리디브 지도에서 직접 그린 8정점 테두리(a1f209a 값) 그대로. "
            "제척 = 양재2동성당(396-2·396-10) · 구룡어린이공원(399) · 전법회관 건물(400-9) · "
            "구룡유치원(구룡사, 399-1) 네 블록 + 블록 사이 골목(390-17·390-20 도로 필지의 접면 구간)을 "
            "하나로 합친 단일 홀. 필지 경계는 브이월드 연속지적도(LP_PA_CBND_BUBUN, 2026-11-24 라이브 조회). "
            "구분선(사업예정구역 1·2)은 종전 방향 그대로 두고 통합 홀 경계에서 끊어 두 토막으로 나눴다."
        ),
        "outer": ring_out,
        "holes": [{
            "key": "merged",
            "label": "성당·공원·전법회관·구룡사 — 골목 폭까지 이어 하나로 제척",
            "parcels": [p["jibun"] for k in ("church", "park", "temple", "temple2") for p in blocks[k]["parcels"]],
            "blockAreas": {k: round(area_m2(blocks[k]["geom"])) for k in blocks},
            "bridges": [
                {"alley": "양재동 " + ALLEY_1, "alleyJibun": a1_raw.get("jibun"), "spanM": span1,
                 "areaM2": round(area_m2(b1)), "connects": "성당 ↔ 구룡어린이공원"},
                {"alley": "양재동 " + ALLEY_2, "alleyJibun": a2_raw.get("jibun"), "spanM": span2,
                 "areaM2": round(area_m2(b2)), "connects": "공원·구룡사 ↔ 전법회관"},
            ],
            "ring": hole,
        }],
        "dividers": divs,
        "areaOuter": 53949,
        "areaHole": holes_area,
        "areaNet": 53949 - holes_area,
        "ringPts": len(hole),
        "holeInsideOuter": all(outer.contains(shapely.Point(FWD.transform(lng, lat))) for lat, lng in hole),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[작성] {OUT.relative_to(ROOT)}")
    block_sum = sum(round(area_m2(blocks[k]["geom"])) for k in blocks)
    bridge_sum = round(area_m2(b1)) + round(area_m2(b2))
    print(f"  통합 홀 {len(hole)}정점 · {holes_area:,}㎡ (블록 {block_sum:,}㎡ + 골목 {bridge_sum:,}㎡)")
    print(f"  외곽 53,949㎡ − 제척 {holes_area:,}㎡ = {53949 - holes_area:,}㎡")
    print(f"  구분선 토막 {[ (len(dv['coords']), [lb['text'] for lb in dv['labels']]) for dv in divs ]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
