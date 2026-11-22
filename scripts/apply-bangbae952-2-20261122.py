#!/usr/bin/env python3
"""
방배동 952-2 일대 민간도심복합(성장거점형, 서초구 방배2동) — 구역계 정밀 교정 (2026-11-22 3차)

· 1차 반영(de59dbf)은 도면을 도로명만 보고 11정점으로 어림해 그려, ① 북변이 서초대로를 넘어 북측
  블록(방배마에스트로·디오슈페리움)까지 침범하고 ② 서남 426 블록(세양아르비채 남측~방배천로20길)과
  ③ 동쪽 꼬리 954·956(유니트) 블록이 통째로 빠져 있었다(사용자 지적).
· 2차 반영(791b5c1)은 **브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 도형**을 원천으로 삼아, 사용자가 준
  두 도면(IMG_0736 지적도 손표시 · IMG_0735 신축계획안 P26-140)에 표시된 구역 안 필지를 그대로
  합집합(union)해 만든 59정점 구역계다.

  · 구역 안 필지(전부 포함): 방배동 **952**(-1~-9) · **421**(-1·-3·-23 등) · **422** · **423** ·
    **951**(-1~-34) · **425**(-1~-5) · **426**(-1~-21) · **954**(-1~-38) · **956**(-1~-28).
  · 내부 통로(도로 필지) 포함: 952-9·952-10·952-12·952-15 도, 951-10 도, 955-34 도, 956-4 도,
    955-39 도, 424-30 공.
  · 제외: **방배롯데캐슬아르떼 424-28(39,074㎡)** — 구역 안쪽 ㄷ자 홈의 아파트 단지(101~111동).
    424-28을 감싸는 8M·12M·15M 도로(424-31 도)를 경계선으로 삼아 0㎡ 겹침.
  · 제외: 서초대로(864-41 도) 북측 블록, 동측 디에이치방배(949·950), 957·432 블록.
  · 방주교회는 **방배동 425-2(방배천로24길 8)** — 즉 서쪽 425 블록 안이며 구역 **안**이다
    (로드명주소·카카오 place 10397878·126.98380/37.48455). 신축계획안의 북동 모서리 '방주교회'
    표기는 별도 표기이고, 지적도 손표시·연속지적도 모두 951 블록 동측까지 구역 안으로 잡는다.

· 3차 반영(2026-11-22, 이 스크립트) — **방배15구역과의 겹침(overlap_deg2 6.4655e-07, 약 6,300㎡) 해소**.
  · 2차 폴리곤의 동쪽 꼬리가 **방배15구역**(`11000UQ120PS202411014101`, 서울시 고시 제2022-378호로
    2022-09-08 지정, UQ120 실경계)의 북단 안으로 들어가 겹쳤다. 카카오 coord2Address로 꼬리 안 20여 점의
    지번을 확인한 결과 **956 블록(956-1~-28)** 과 **957·432 블록**, **955-34 도로 남단**이었고 — 956은
    방배15구역 소관, 957·432는 이미 제외 대상 — 952-2 자기 필지는 없었다.
  · 그래서 꼬리를 **955-34 도로 남측 목 필지선**(정점 7 → 30, 길이 8m)에서 통째로 잘라낸다. 방배15구역
    경계는 그대로 두고, 잘린 952-2 경계는 방배15 고시경계에서 **6.4m** 떨어져 겹침 **0㎡**가 된다.
  · 잘라낸 뒤에도 겹침이 남으면(방배15가 목선을 넘어오는 경우) EPSG:5179에서 방배15 경계를 0.7m 물린
    선으로 한 번 더 차집합한다(`TRIM_BUFFER_M`). 지금 데이터에서는 겹침이 0이라 이 단계는 작동하지 않는다.
  · 계측 면적 **34,000㎡(약 10,286평)** — 41,200㎡에서 꼬리 약 7,200㎡를 뺀 값.
    세대수(1,526)는 신축계획안 도면 기준이라 그대로 둔다.
  · 956 블록은 이제 방배15구역 소관이라 `alias`의 '방배동 956'은 뺐고(검색이 952-2로 잘못 걸리지 않게),
    boundaryNote에 956 블록이 방배15구역 소관임을 밝힌다.

실행: python3 scripts/apply-bangbae952-2-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "bangbae9522Mdobok20261122"

ZID = "seocho-bangbae-952-2"

# 겹침 상대 — 방배15구역(서울시 고시 UQ120 실경계). 이 구역 경계는 건드리지 않는다.
TRIM_ID = "11000UQ120PS202411014101"
TRIM_NAME = "방배15구역"
TRIM_BUFFER_M = 0.7  # 경계 접합부 미세 버퍼(0.5~1m) — 지도에서 두 구역이 0.7m 떨어져 보인다
TRIM_SIMPLIFY_M = 0.25  # 버퍼가 만든 잘게 부서진 모서리를 다듬는 단순화 허용오차

# 꼬리 절단 — 2차 원형(아래 BASE_RING)에서 동쪽 꼬리(옛 정점 8~29)를 떼어낸다.
#   · 꼬리는 정점 7(37.483336,126.986288)과 30(37.483359,126.986194) 사이 8m 목으로 달려 있다.
#     그 목이 955-34 도로 남측 필지선이라, 목에서 자르면 필지선을 따라 깔끔하게 떨어진다.
#   · 꼬리 안 필지(카카오 coord2Address 확인): 956-1·3·8·11·12·14·18·19·20·21·23·25·27, 957-3·7·8·13,
#     432-7·16, 497-2, 955-34 도 남단 — 956은 방배15구역, 957·432는 2차부터 제외 대상이던 블록이다.
TAIL_CUT = (8, 30)  # BASE_RING[8:30] 제거, 정점 7 → 30 직결

# [lat, lng] — 연속지적도 필지 합집합 원형(2차 반영, 59정점).
BASE_RING = [
    [37.485643, 126.985829], [37.485583, 126.985922], [37.484867, 126.985925],
    [37.483673, 126.986648], [37.483556, 126.986676], [37.483548, 126.986656],
    [37.483488, 126.986656], [37.483336, 126.986288], [37.482764, 126.986656],
    [37.482646, 126.986656], [37.482257, 126.986908], [37.482214, 126.986900],
    [37.482078, 126.986758], [37.482258, 126.986553], [37.482315, 126.986506],
    [37.482333, 126.986541], [37.482440, 126.986615], [37.482485, 126.986538],
    [37.482633, 126.986510], [37.482620, 126.986317], [37.482559, 126.986290],
    [37.482586, 126.986024], [37.482575, 126.985957], [37.482506, 126.985847],
    [37.482498, 126.985710], [37.482639, 126.985738], [37.482732, 126.985726],
    [37.482868, 126.985670], [37.482984, 126.985555], [37.483075, 126.985498],
    [37.483359, 126.986194], [37.483791, 126.985917], [37.483791, 126.985996],
    [37.484719, 126.985396], [37.484811, 126.985462], [37.484810, 126.985098],
    [37.484832, 126.985098], [37.484840, 126.984891], [37.484901, 126.984830],
    [37.484846, 126.984742], [37.484866, 126.984211], [37.484358, 126.984183],
    [37.484302, 126.984106], [37.484240, 126.984177], [37.483941, 126.984160],
    [37.483911, 126.984119], [37.483950, 126.982877], [37.483983, 126.982839],
    [37.484105, 126.982860], [37.484290, 126.982937], [37.484348, 126.983054],
    [37.484406, 126.983017], [37.484662, 126.983298], [37.484816, 126.983428],
    [37.484867, 126.983543], [37.484928, 126.983492], [37.485174, 126.983576],
    [37.485151, 126.983436], [37.485367, 126.983500],
]


# ── 기하 계산 ────────────────────────────────────────────────────────────────
def _projectors():
    from pyproj import Transformer

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    inv = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True).transform
    return fwd, inv


def _trim_ring(base: list[list[float]], trim_geom: dict) -> list[list[float]]:
    """base([lat,lng]) 에서 trim 폴리곤(+버퍼)을 빼고 [lat,lng] 링을 돌려준다.

    목 절단만으로 이미 겹침이 0이면 원형을 그대로 돌려준다(불필요한 정점 변형 없음).
    """
    from shapely.geometry import Polygon, shape

    fwd, inv = _projectors()
    a = Polygon([(lng, lat) for lat, lng in base])
    b = shape(trim_geom)
    am = Polygon([fwd(*xy) for xy in a.exterior.coords])
    bm = Polygon([fwd(*xy) for xy in b.exterior.coords])
    shapes = am
    if am.intersection(bm).area > 0.5:
        cut = bm.buffer(TRIM_BUFFER_M)
        shapes = am.difference(cut).simplify(TRIM_SIMPLIFY_M, preserve_topology=True)
        # 단순화가 버퍼 안쪽으로 파고들었으면 그만큼 다시 깎는다 → 겹침 항상 0
        if shapes.intersection(bm).area > 0:
            shapes = shapes.difference(cut)
    if shapes.geom_type != "Polygon":
        raise SystemExit(f"[중단] 차집합 결과가 Polygon이 아닙니다: {shapes.geom_type}")
    out: list[list[float]] = []
    for x, y in list(shapes.exterior.coords)[:-1]:
        lng, lat = inv(x, y)
        out.append([round(lat, 7), round(lng, 7)])
    return out


def load_trim_geometry() -> dict:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == TRIM_ID), None)
    if feat is None or not feat.get("geometry"):
        raise SystemExit(f"[중단] {TRIM_NAME}({TRIM_ID}) 도형을 zones.geojson에서 찾지 못했습니다")
    return feat["geometry"]


def _measured_area(ring: list[list[float]]) -> float:
    from shapely.geometry import Polygon

    p = Polygon([(lo, la) for la, lo in ring])
    return abs(p.area) * (111320 * math.cos(math.radians(p.centroid.y))) * 110574


def _overlap_m2(ring_lat_lng: list[list[float]], trim_geom: dict) -> float:
    """링이 방배15구역과 겹치는 면적(㎡, EPSG:5179)."""
    from shapely.geometry import Polygon, shape

    fwd, _ = _projectors()
    a = Polygon([fwd(lng, lat) for lat, lng in ring_lat_lng])
    b = shape(trim_geom)
    bm = Polygon([fwd(*xy) for xy in b.exterior.coords])
    return a.intersection(bm).area


_GEOM = load_trim_geometry()
# ① 동쪽 꼬리(956·957·432)를 목 필지선에서 떼고 ② 남은 몸통이 방배15와 겹치면 차집합
BASE_MAIN = BASE_RING[: TAIL_CUT[0]] + BASE_RING[TAIL_CUT[1]:]
RING = _trim_ring(BASE_MAIN, _GEOM)
AREA = int(round(_measured_area(RING) / 100) * 100)
CUT_M2 = int(round(_measured_area(BASE_RING) - AREA, -2))

PROPS = {
    "id": ZID,
    "name": "방배동 952-2 일대",
    "alias": [
        "방배동 952-2", "방배동 952-2 일대", "방배 952-2", "방배952-2",
        "이수역 민간도심복합", "이수역 도심복합",
        "방배동 952-2번지 일원 도심복합개발사업",
        "방배동 952-2번지 일원", "방배동 952-2 일원",
        # 구역 안 필지(연속지적도 기준)
        "방배동 952-2번지", "방배동 421", "방배동 422", "방배동 423", "방배동 951",
        "방배동 952", "방배동 425", "방배동 426", "방배동 954",
        "방배동 425-2", "방주교회", "방배2동 도심복합", "서초구 민간도심복합",
    ],
    "type": "민간도심복합(성장거점형)",
    "kind": "민간도심복합개발(성장거점형)",
    "stage": "추진준비",
    "gu": "서초구",
    "area": AREA,
    "households": 1526,
    "featured": False,
    "geom": "추진위안내도",
    "boundaryApprox": False,
    "sourceId": "사용자 제공 「방배동 952-2번지 일원 도심복합개발사업 신축계획안」 배치도(2026-04-30, AA) · 추진위 예비 사업시행자(신탁사) 선정 입찰공고(2026-10)",
    "centerLabel": "구역계 중심(이수역 4·5번 출구 앞, 방배롯데캐슬아르떼 북동측)",
    "center": [37.48518, 126.98468],
    "note": (
        "서초구 방배2동, 이수역(7호선) 4·5번 출구 앞 방배동 952-2번지 일원(952·952-2·421·422·423·951 일대)에서 "
        "추진 중인 민간도심복합개발(성장거점형) 사업입니다. 2026-04-30자 신축계획안 배치도(건축사사무소 AA, "
        "S=1/1,200, P26-140) 기준 총 1,526세대로 전용 59㎡ 456세대(공공임대 205·분양 251, 30%)와 "
        "전용 84㎡ 1,070세대(공공임대 146·분양 924, 70%)로 구성되고, 구역 남서측에는 4~5층 관리시설 블록이 "
        "배치됩니다. 2026-10-06~07 위클리한국주택경제신문 보도로 추진위원회가 예비 사업시행자(신탁사) 선정 "
        "입찰공고를 냈습니다. 아직 혁신지구 지정 전 추진준비 단계라 법적 구역계 고시는 없으며, "
        "인접한 방배5·방배13·방배14 등 기존 정비구역과는 별개 구역입니다. 동쪽 꼬리 956·957·432 블록은 "
        "방배15구역 소관·이웃 블록이어서 구역계에서 끊어냈습니다."
    ),
    "areaNote": (
        f"구역 안 필지(952·421·422·423·951·425·426·954 일대)와 내부 통로를 브이월드 연속지적도 도형 그대로 "
        f"합집합한 41,200㎡에서, 동쪽 꼬리(956·957·432 블록과 955-34 도로 남단, 계측 약 {CUT_M2:,}㎡)를 "
        f"955-34 도로 남측 필지선에서 끊어낸 {AREA:,}㎡(약 {round(AREA / 3.3058):,}평)입니다. 956 블록은 "
        f"방배15구역(2022-09-08 고시) 소관입니다. 신축계획안 도면에 사업면적 숫자 표기가 확인되지 않아 "
        f"계측값으로 표기합니다. 사업시행자 지정·고시 도면이 나오면 그 면적으로 대체해야 합니다."
    ),
    "boundaryNote": (
        "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 도형을 그대로 이어 붙인 실경계형 경계입니다 — 사용자가 준 "
        "① 지적도 손표시(IMG_0736), ② 신축계획안 배치도(P26-140, 2026-04-30)의 사업구역계와 같은 필지 묶음입니다. "
        "북변은 952·421·422·423·951 블록 북측(서초대로 남측 도로경계선 아래), 서변은 425·426 블록 서측"
        "(이수역 5번 출구에서 남서로 휘는 동작대로·방배천로 곡선), 남서는 426 블록 하단(방배천로20길 북측), "
        "동변은 954 블록 동측(20M 도로 — 디에이치방배 건너편)까지입니다. "
        "안쪽 ㄷ자 홈의 방배롯데캐슬아르떼(424-28, 39,074㎡·101~111동)는 8M·12M·15M 도로를 경계로 완전히 제외했고, "
        "북측 서초대로 건너 블록과 동측 디에이치방배(949·950)도 제외입니다. 방주교회는 방배동 425-2"
        "(방배천로24길 8)로 서쪽 425 블록 안이며 구역에 포함입니다. 동쪽 꼬리(956-1~-28 · 957 · 432 블록과 "
        "955-34 도로 남단)는 방배15구역(서울시 고시 제2022-378호로 2022-09-08 지정, UQ120 실경계)의 북단 안으로 "
        f"들어가 있어, 2026-11-22 955-34 도로 남측 필지선(계측 약 {CUT_M2:,}㎡)에서 끊어냈습니다 — 방배15구역 "
        "경계는 그대로이고 두 구역은 6m 남짓 떨어져 겹침 0㎡입니다. 세대수(1,526)와 사업 설명은 신축계획안 도면 "
        "기준이라 그대로 두었습니다. 아직 고시 전 추진준비 단계라 사업시행자 지정·고시 도면이 나오면 그것 기준으로 "
        "다시 맞춰야 합니다."
    ),
    "sources": [
        {
            "label": "위클리한국주택경제신문 — 방배동 952-2번지 일원 도심복합개발사업 추진위원회 예비 사업시행자(신탁사) 선정 입찰공고(2026-10-07)",
            "url": "https://www.arunews.com/news/articleView.html?idxno=67921",
        },
        {
            "label": "위클리한국주택경제신문 — 같은 입찰공고 재보도(2026-10-06)",
            "url": "https://www.arunews.com/news/articleView.html?idxno=67868",
        },
    ],
    "asOf": "2026-11-22",
}

META = {
    "asOf": "2026-11-22",
    "polygons": 1,
    "note": (
        "방배동 952-2 일대 민간도심복합(성장거점형, 서초구) 구역계 — 브이월드 연속지적도 필지 도형을 합집합한 "
        "실경계형 경계에서, 방배15구역(서울시 고시 UQ120) 북단으로 넘어가던 동쪽 꼬리(956·957·432 블록, "
        f"약 7,200㎡)를 955-34 도로 남측 필지선에서 끊어냄(겹침 0㎡, 두 구역 간격 6m). "
        f"계측 {AREA:,}㎡·1,526세대(59㎡ 456·84㎡ 1,070, 분양 1,175·공공임대 351)."
    ),
}


# ── 검사/반영 ────────────────────────────────────────────────────────────────
def _ring_lnglat() -> list[list[float]]:
    ring = [[lng, lat] for lat, lng in RING]
    ring.append(ring[0])
    return ring


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    ring = (feat.get("geometry") or {}).get("coordinates", [[[]]])[0] if feat else []
    ring_ll = [[round(c[1], 7), round(c[0], 7)] for c in ring[:-1]] if ring else []
    same = len(ring_ll) == len(RING) and all(
        abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6 for a, b in zip(ring_ll, RING)
    )
    overlap = _overlap_m2(RING, _GEOM)
    ok = (
        bool(feat)
        and (feat.get("geometry") or {}).get("type") == "Polygon"
        and len(ring) == len(RING) + 1
        and ring[0] == ring[-1]
        and same
        and feat["properties"].get("geom") == PROPS["geom"]
        and feat["properties"].get("boundaryApprox") is False
        and feat["properties"].get("households") == 1526
        and abs((feat["properties"].get("area") or 0) - AREA) < 0.01
        and overlap < 0.01
    )
    print(
        f"[{'OK' if ok else 'FAIL'}] geojson {ZID} geom={feat['properties'].get('geom') if feat else None} "
        f"verts={len(ring) - 1 if ring else 0}(기대 {len(RING)}) area={feat['properties'].get('area') if feat else None}"
        f"(기대 {AREA}) households={feat['properties'].get('households') if feat else None} "
        f"ring일치={same} {TRIM_NAME}겹침={overlap:.4f}㎡"
    )
    bad += 0 if ok else 1

    entry = next((z for z in src if z.get("id") == ZID), None)
    ok2 = (
        bool(entry)
        and len(entry.get("polygon") or []) == len(RING)
        and entry.get("geom") == PROPS["geom"]
        and entry.get("households") == 1526
        and abs((entry.get("area") or 0) - AREA) < 0.01
    )
    print(
        f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZID} polygon={len(entry.get('polygon') or []) if entry else 0}"
        f"(기대 {len(RING)}) geom={entry.get('geom') if entry else None} area={entry.get('area') if entry else None}"
    )
    bad += 0 if ok2 else 1

    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(
        f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(geo['features'])} "
        f"batch={META_KEY in geo['metadata']}"
    )
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    entry = next((z for z in src if z.get("id") == ZID), None)

    if feat is None:
        feat = {"type": "Feature", "id": ZID, "properties": {"id": ZID}, "geometry": None}
        geo["features"].append(feat)
        print("[신규] geojson feature 추가:", ZID)
    if entry is None:
        entry = {"id": ZID, "sid": "", "polygon": [], "center": []}
        src.append(entry)
        print("[신규] seoul-zones entry 추가:", ZID)

    old = dict(feat["properties"])
    feat["properties"] = {**old, **PROPS, "id": ZID}
    feat["geometry"] = {"type": "Polygon", "coordinates": [_ring_lnglat()]}

    entry.update(PROPS)
    entry["sid"] = PROPS["sourceId"]
    entry["polygon"] = [list(p) for p in RING]
    entry.pop("parts", None)
    entry.pop("holes", None)

    print(f"[반영] {ZID} — {len(RING)}정점, area={AREA}, geom={PROPS['geom']}, households={PROPS['households']}")
    print(f"    원형 계측 {_measured_area(BASE_RING):,.1f}㎡ − 동쪽 꼬리 → {_measured_area(RING):,.1f}㎡")
    print(f"    {TRIM_NAME} 겹침: {_overlap_m2(RING, _GEOM):.4f}㎡ (0이어야 함)")

    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
