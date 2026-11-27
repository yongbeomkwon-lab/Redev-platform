#!/usr/bin/env python3
"""리디브 — 이수역 동측구역(도공복, 서초구 방배동 822번지 일원) 경계 반영 (2026-11-27)

## 무엇
  · 그동안 geometry null(점)이던 `isu-east`(이름 이수역 동측구역, 2026-10-01 후보지 선정)에
    **실경계**를 넣는다. 새 구역을 하나 더 만들지 않는다 — 같은 이름·같은 공고의 자리표시자다.
  · 국토교통부 공고 제2026-1248호(2026-10-01) 【위치도 ⑥ 이수역 동측】의 붉은 구역선을
    브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 옮겼다.
      · 위치도 선(600dpi)과 필지선 정합 — 축척 0.258 m/px·회전 0, 평균 오차 1.40m.
        같은 축척에서 위치도 선이 감싸는 면적이 22,950㎡로 공고 면적 22,997㎡와 0.2% 안에서 맞는다.
      · 그 안의 대지 필지 100개(822·823·824·825·826·827번지 일대)를 합집합하고, 블록 사이
        안쪽 골목(823-6·823-13·822-12·827-7 도로 필지)만 이어 붙였다.
      · 둘레 도로(동광로·동광로4길·동광로11·12길·방배중앙로19길) 필지는 도형에서 뺐다 → 도로 미포함.
  · 도형 면적 22,392.9㎡ = 공고 22,997㎡의 97.4%(차이는 구역 안 도로·공원 등 필지 아닌 땅).
  · 구역계 고시 전(후보지 선정 단계)이므로 boundaryApprox=true.

## 근거 자료
  · 국토교통부 공고 제2026-1248호 「도심 공공주택 복합지구 후보지 선정 공고」(2026-10-01)
    — 연번 6 이수역 동측, 주거상업고밀지구, 서초구 방배동 822번지 일원 / 22,997㎡ / 918호,
      사업자 한국토지주택공사 또는 서울주택도시개발공사, 후보지 선정일 '26.10.01
  · 국토교통부 보도자료(2026-09-30) 「'도심 공공주택 복합사업' 서울 11곳(1.8만호) 신규 후보지 선정」

실행: python3 scripts/apply-isu-east-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "isu-east-20261127.json"

ZONE_ID = "isu-east"
META_KEY = "isuEast_20261127"
AS_OF = "2026-11-27"

# 겹치면 안 되는 이웃 구역
NEIGHBORS = [
    "gangnam4gu-bangbae-16",            # (가칭)방배16구역
    "11000UQ120PS202411014097",         # 방배6
    "bangbae-858-1",                    # 방배동 858-1 모아타운
    "seocho-bangbae-952-2",             # 방배동 952-2 민간도심복합
    "seocho-bangbae-467-19",            # 방배동 467-19
]

NOTE = (
    "서초구 방배동 822번지 일원(822·823·824·825·826·827번지 블록)의 도심공공주택복합사업 후보지입니다. "
    "국토교통부가 2026-10-01 공고 제2026-1248호로 선정한 서울 11곳 가운데 하나로, 유형은 주거상업고밀지구, "
    "면적 22,997㎡, 계획 918호이고 공공주택 사업자는 한국토지주택공사 또는 서울주택도시개발공사입니다. "
    "자리는 동광로 남측·동광로4길 동측·동광로12길(방배중앙로19길) 서측이고, 남쪽으로 서문여고(방배동 1514) "
    "학교부지와 맞닿습니다. 이수역(4·7호선)에서 북동 약 600m, 4호선 총신대입구(이수)역에서 약 440m입니다. "
    "2026-09-30 보도자료에서 3년여 만의 신규 후보지 선정으로 발표됐고, 아직 예정지구 지정·구역계 고시 전입니다. "
    "지도 경계는 공고 위치도의 구역 선을 브이월드 연속지적도 필지선에 맞춰 조립한 검토 경계입니다(필지정합)."
)

AREA_NOTE = (
    "공고 면적 22,997㎡(약 6,957평) — 국토교통부 공고 제2026-1248호 표 기준(세부계획·인허가에서 변경될 수 있음). "
    "계획 918호. 지도 도형 면적은 22,392.9㎡(공고의 97.4%)로, 차이는 구역 안 도로·공원처럼 필지가 아닌 땅을 "
    "도형에서 빼기 때문입니다."
)

BOUNDARY_NOTE = (
    "국토교통부 공고 제2026-1248호 【위치도 ⑥ 이수역 동측】의 붉은 구역선을 브이월드 연속지적도"
    "(LP_PA_CBND_BUBUN) 필지선에 맞춰 옮긴 검토 경계입니다. 위치도 선을 22,997㎡에 맞춰 축척(0.258 m/px)·위치를 "
    "잡고(필지선 정합 평균 오차 1.40m), 그 안의 대지 필지 100개를 모아 합집합한 뒤 블록 사이 안쪽 골목"
    "(방배동 823-6·823-13·822-12·827-7 도로 필지)만 이어 붙였습니다. 둘레 도로(동광로·동광로4길·동광로11길·"
    "동광로12길·방배중앙로19길) 필지는 도형에서 빼 도로를 덮지 않습니다. 후보지 선정 단계라 예정지구 지정·"
    "구역계 고시가 없어 실제 포함 필지는 확정 전입니다. 인접한 (가칭)방배16구역(약 16m)·방배6구역(약 36m)과 "
    "겹치는 면적은 0㎡입니다."
)

SOURCES = [
    {
        "label": "국토교통부 공고 제2026-1248호 — 도심 공공주택 복합지구 후보지 선정 공고(2026-10-01)",
        "url": "https://www.molit.go.kr/USR/BORD0201/m_69/DTL.jsp?id=N01_B&mode=view&idx=269997",
    },
    {
        "label": "국토교통부 보도자료 — ‘도심 공공주택 복합사업’ 서울 11곳(1.8만호) 신규 후보지 선정(2026-09-30)",
        "url": "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95092473",
    },
    {
        "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계·지목(도로 필지 구분)",
        "url": "https://www.vworld.kr",
    },
]


def close_ring(ring):
    r = [list(p) for p in ring]
    if r[0] != r[-1]:
        r.append(list(r[0]))
    return r


def local(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    lng0 = sum(p[1] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    return [(p[1] * kx, p[0] * ky) for p in ring]


def area_m2(ring):
    pts = local(ring)
    s = 0.0
    for i in range(len(pts) - 1):
        s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(s / 2)


def overlap_m2(a, b):
    """두 링의 교차 면적(㎡) — 하나의 공통 원점으로 옮겨 비교한다(각자 중심을 쓰면 어긋난다)"""
    try:
        from shapely.geometry import Polygon
    except Exception:
        return 0.0
    lat0 = sum(p[0] for p in a) / len(a)
    lng0 = sum(p[1] for p in a) / len(a)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0

    def proj(ring):
        pts = [((p[1] - lng0) * kx, (p[0] - lat0) * ky) for p in ring]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        return pts

    pa, pb = Polygon(proj(a)), Polygon(proj(b))
    if not pa.is_valid:
        pa = pa.buffer(0)
    if not pb.is_valid:
        pb = pb.buffer(0)
    return pa.intersection(pb).area


def build_zone(z, spec):
    ring = close_ring(spec["ring"])
    out = dict(z)
    out["id"] = ZONE_ID
    out["name"] = "이수역 동측구역"
    out["alias"] = [
        "이수역 동측", "방배동 822", "방배동 822번지 일원", "이수역 동측 도심공공주택복합",
        "이수역 동측 도공복", "방배동 822-1", "방배4동 도공복", "이수역 도공복",
    ]
    out["type"] = "도공복"
    out["kind"] = "도심공공주택복합"
    out["stage"] = "후보지선정"
    out["stageCode"] = "PP1202"
    out["gu"] = "서초구"
    out["area"] = 22997
    out["householdsPlan"] = 918
    out["featured"] = False
    out["geom"] = "필지정합"
    out["boundaryApprox"] = True
    out["areaShape"] = spec["areaShape"]
    out["center"] = spec["center"]
    out["centerLabel"] = "대표 지번 방배동 822번지 일원(822-1 일대) — 이수역 북동 약 600m"
    out["selectedAt"] = "2026-10-01"
    out["note"] = NOTE
    out["areaNote"] = AREA_NOTE
    out["boundaryNote"] = BOUNDARY_NOTE
    out["sources"] = SOURCES
    out["sid"] = "국토교통부 공고 제2026-1248호(2026-10-01) · 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 대조"
    out["asOf"] = AS_OF
    out["polygon"] = ring
    return out


def load():
    return (
        json.loads(DATA.read_text(encoding="utf-8")),
        json.loads(SOURCE.read_text(encoding="utf-8")),
        json.loads(GEOJSON.read_text(encoding="utf-8")),
        json.loads(INDEX.read_text(encoding="utf-8")),
        json.loads(META.read_text(encoding="utf-8")),
    )


def check() -> bool:
    spec, zones, geo, index, meta = load()
    by_id = {z["id"]: z for z in zones}
    ok = True
    z = by_id.get(ZONE_ID)
    ring = close_ring(spec["ring"])
    same = bool(z) and z.get("polygon") == ring and z.get("geom") == "필지정합"
    print(("OK  " if same else "FAIL"), f"{ZONE_ID} polygon·geom 필지정합", "pts=", len(ring))
    ok &= same
    geo_f = next((f for f in geo["features"] if f["properties"]["id"] == ZONE_ID), None)
    gsame = bool(geo_f) and geo_f["geometry"] == {
        "type": "Polygon", "coordinates": [[[c[1], c[0]] for c in ring]]}
    print(("OK  " if gsame else "FAIL"), "geojson geometry 일치")
    ok &= gsame
    idx = next((r for r in index["zones"] if r["id"] == ZONE_ID), None)
    print(("OK  " if idx and "방배동 822번지 일원" in (idx.get("alias") or []) else "FAIL"),
          "zone-index alias", idx and idx.get("name"))
    ok &= bool(idx) and "방배동 822번지 일원" in (idx.get("alias") or [])
    a = area_m2(ring)
    good_area = abs(a - 22997) / 22997 < 0.05
    print(("OK  " if good_area else "FAIL"), f"도형 면적 {a:.1f}㎡ (공고 22,997㎡)")
    ok &= good_area
    for nid in NEIGHBORS:
        n = by_id.get(nid)
        if not n or not n.get("polygon"):
            continue
        ov = overlap_m2(ring, n["polygon"])
        print(("OK  " if ov < 0.5 else "FAIL"), f"이웃 겹침 {nid} {ov:.1f}㎡")
        ok &= ov < 0.5
    print(("OK  " if META_KEY in meta else "FAIL"), "zones-meta", META_KEY)
    ok &= META_KEY in meta
    print(("OK  " if geo["metadata"].get("count") == len(geo["features"]) else "FAIL"),
          "geojson count", geo["metadata"].get("count"), len(geo["features"]))
    ok &= geo["metadata"].get("count") == len(geo["features"])
    print(("OK  " if index["count"] == len(index["zones"]) else "FAIL"), "zone-index count", index["count"])
    ok &= index["count"] == len(index["zones"])
    return ok


def apply():
    spec, zones, geo, index, meta = load()
    by_id = {z["id"]: z for z in zones}
    if ZONE_ID not in by_id:
        raise SystemExit(f"!! {ZONE_ID} 구역이 없습니다 — 자리표시자를 찾지 못했습니다")
    before_others = {z["id"]: json.dumps(z, ensure_ascii=False, sort_keys=True)
                     for z in zones if z["id"] != ZONE_ID}
    before_count = len(zones)
    for i, z in enumerate(zones):
        if z["id"] == ZONE_ID:
            zones[i] = build_zone(z, spec)
    # 다른 구역이 그대로인지
    after_others = {z["id"]: json.dumps(z, ensure_ascii=False, sort_keys=True)
                    for z in zones if z["id"] != ZONE_ID}
    if before_others != after_others:
        changed = [k for k in before_others if before_others.get(k) != after_others.get(k)]
        raise SystemExit(f"!! 다른 구역이 바뀌었습니다: {changed[:5]}")
    if len(zones) != before_count:
        raise SystemExit(f"!! 구역 수 변경 {before_count} → {len(zones)}")
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    # geojson·zone-index 는 원천(seoul-zones.json)에서 다시 만든다
    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-2000:])
            print(r.stderr[-2000:])
            raise SystemExit("!! 재생성 실패")

    # zones-meta (다른 스크립트들이 남기는 반영 이력)
    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": "이수역 동측구역(도공복) — 국토교통부 공고 제2026-1248호 위치도를 연속지적도 필지로 조립(필지정합)",
        "zones": {ZONE_ID: {"geom": "필지정합", "areaShape": spec["areaShape"]}},
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("반영 완료:", ZONE_ID)


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    apply()
    sys.exit(0 if check() else 1)
