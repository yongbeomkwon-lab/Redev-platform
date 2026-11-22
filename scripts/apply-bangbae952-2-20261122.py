#!/usr/bin/env python3
"""
방배동 952-2 일대 민간도심복합(성장거점형, 서초구 방배2동) — 신규 등록 (2026-11-22)

· 원천: 사용자가 보낸 도면 2장.
  1) 「방배동 952-2번지 일원 도심복합개발사업 신축계획안」 배치도(S=1/1,200 · AA · 2026.04.30. · P26-140)
     — 붉은 점선이 전체 사업구역 경계, 세대표 총 1,526세대(분양 1,175 + 공공임대 351).
  2) 지적도 손표시 — 이수역 4·5번 출구 앞, 방배롯데캐슬아르떼 북쪽~동쪽 일대
     (방배동 952-2, 421, 422, 423, 425, 426, 951, 954, 956 등 필지 일대).
· 경계 추출: 두 도면을 OSM 도로망(서초대로·동광로·동작대로)과 랜드마크
  (이수역 4번출구·방배초등학교·방배롯데캐슬아르떼·디에이치방배)로 정합해 11정점 다각형으로 만들었다.
  북변=서초대로 남측, 동변=동광로 서측, 남변=422·421 남측(방배초교 북측), 서변=방배천로26길 동측.
  신축계획안에서 방주교회(425 일대)는 개발부지(파란선) 밖 제척 표기 → 구역에서 제외.
  방배롯데캐슬아르떼(744세대)·954·956 남측 블록도 구역 밖.
  추진준비 단계 도면이라 boundaryApprox: true(점선 테두리, 실제 다각형).
· 계측 면적 41,455㎡(12,542평) — 도면에 사업면적 숫자 표기는 확인되지 않았다.

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

# [lat, lng] 11정점 — 신축계획안 구역계(붉은 점선)를 도로망에 정합.
# 동변은 서울시 실경계의 방배5구역(착공, 동쪽 블록) 서측 경계(lng 126.98610)와
# 겹치지 않도록 동광로 서측 lng 126.9860~126.9861선에 두었다.
RING = [
    [37.48575, 126.98230], [37.48583, 126.98490], [37.48585, 126.98600],
    [37.48500, 126.98603], [37.48460, 126.98605], [37.48435, 126.98605],
    [37.48450, 126.98555], [37.48470, 126.98310], [37.48485, 126.98285],
    [37.48505, 126.98258], [37.48532, 126.98238],
]

PROPS = {
    "id": ZID,
    "name": "방배동 952-2 일대",
    "alias": [
        "방배동 952-2", "방배동 952-2 일대", "방배 952-2", "방배952-2",
        "이수역 민간도심복합", "이수역 도심복합",
        "방배동 952-2번지 일원 도심복합개발사업",
        "방배동 952-2번지 일원", "방배동 952-2 일원",
        # 구역 안·경계 필지(사용자 표기 기준)
        "방배동 952-2번지", "방배동 421", "방배동 422", "방배동 423", "방배동 951",
        "방배동 952", "방배2동 도심복합", "서초구 민간도심복합",
    ],
    "type": "민간도심복합(성장거점형)",
    "kind": "민간도심복합개발(성장거점형)",
    "stage": "추진준비",
    "gu": "서초구",
    "area": 41455,
    "households": 1526,
    "featured": False,
    "geom": "가상경계",
    "boundaryApprox": True,
    "sourceId": "사용자 제공 「방배동 952-2번지 일원 도심복합개발사업 신축계획안」 배치도(2026-04-30, AA) · 추진위 예비 사업시행자(신탁사) 선정 입찰공고(2026-10)",
    "centerLabel": "구역계 중심(이수역 4·5번 출구 앞, 방배롯데캐슬아르떼 북동측)",
    "center": [37.48516, 126.98455],
    "note": (
        "서초구 방배2동, 이수역(7호선) 4·5번 출구 앞 방배동 952-2번지 일원(952·952-2·421·422·423·951 일대)에서 "
        "추진 중인 민간도심복합개발(성장거점형) 사업입니다. 2026-04-30자 신축계획안 배치도(건축사사무소 AA, "
        "S=1/1,200, P26-140) 기준 총 1,526세대로 전용 59㎡ 456세대(공공임대 205·분양 251, 30%)와 "
        "전용 84㎡ 1,070세대(공공임대 146·분양 924, 70%)로 구성되고, 구역 남서측에는 4~5층 관리시설 블록이 "
        "배치됩니다. 2026-10-06~07 위클리한국주택경제신문 보도로 추진위원회가 예비 사업시행자(신탁사) 선정 "
        "입찰공고를 냈습니다. 아직 혁신지구 지정 전 추진준비 단계라 법적 구역계 고시는 없으며, "
        "인접한 방배5·방배13·방배14 등 기존 정비구역과는 별개 구역입니다."
    ),
    "areaNote": (
        "도면 구역계를 옮긴 계측 면적 41,455㎡(약 12,542평) — 신축계획안 도면에 사업면적 숫자 표기가 확인되지 "
        "않아 계측값으로 표기합니다. 신축계획안 상 구역 남동측에 동광로·공원 부지가 추가로 편입될 수 있고 "
        "도면 판독 오차(±20~40m)가 있어 실제 사업면적과 차이가 날 수 있습니다."
    ),
    "boundaryNote": (
        "사용자가 보낸 두 도면에서 옮긴 참고 경계입니다. ① 「방배동 952-2번지 일원 도심복합개발사업 신축계획안」 "
        "배치도(2026-04-30)의 붉은 점선(전체 사업구역 경계), ② 지적도 손표시(이수역 4·5번 출구 앞 구역계). "
        "두 도면을 OSM 도로망(서초대로·동광로·동작대로)과 이수역·방배초등학교·방배롯데캐슬아르떼 등 "
        "랜드마크로 정합해 11정점으로 만들었습니다 — 북변 서초대로 남측, 동변 동광로 서측(서울시 실경계의 "
        "방배5구역 서측 경계와 겹치지 않게), 남변 422·421 남측 "
        "필지선(방배초교 북측), 서변 방배천로26길 동측. 신축계획안에서 방주교회(방배동 425 일대)는 개발부지 "
        "파란선 밖 제척 표기라 구역에서 제외했고, 지적도 손표시 목록에만 있는 426·954·956 남측 블록도 "
        "신축계획안 경계에 없어 제외했습니다(확정 단계에서 다시 확인 필요). 방배롯데캐슬아르떼(744세대)는 "
        "구역 밖입니다. 추진준비 단계 참고 경계(±20~40m)로, 혁신지구 지정·고시 도면이 나오면 그것 기준으로 "
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
        "방배동 952-2 일대 민간도심복합(성장거점형, 서초구) 신규 등록 — 사용자 제공 신축계획안 배치도"
        "(2026-04-30, AA·P26-140)와 지적도 손표시를 도로망·랜드마크로 정합해 11정점 구역계를 만들었다. "
        "계측 41,455㎡·1,526세대(59㎡ 456·84㎡ 1,070, 분양 1,175·공공임대 351). 방주교회(425)·954·956·"
        "방배롯데캐슬아르떼는 구역 밖."
    ),
}


def _ring_lnglat() -> list[list[float]]:
    ring = [[lng, lat] for lat, lng in RING]
    ring.append(ring[0])
    return ring


def _measured_area() -> float:
    from shapely.geometry import Polygon

    p = Polygon([(lo, la) for la, lo in RING])
    return abs(p.area) * (111320 * math.cos(math.radians(p.centroid.y))) * 110574


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    ring = (feat.get("geometry") or {}).get("coordinates", [[[]]])[0] if feat else []
    ok = (
        bool(feat)
        and (feat.get("geometry") or {}).get("type") == "Polygon"
        and len(ring) == len(RING) + 1
        and ring[0] == ring[-1]
        and feat["properties"].get("geom") == PROPS["geom"]
        and feat["properties"].get("boundaryApprox") is True
        and feat["properties"].get("households") == 1526
        and abs((feat["properties"].get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(
        f"[{'OK' if ok else 'FAIL'}] geojson {ZID} geom={feat['properties'].get('geom') if feat else None} "
        f"verts={len(ring) - 1 if ring else 0} area={feat['properties'].get('area') if feat else None} "
        f"households={feat['properties'].get('households') if feat else None}"
    )
    bad += 0 if ok else 1

    entry = next((z for z in src if z.get("id") == ZID), None)
    ok2 = (
        bool(entry)
        and len(entry.get("polygon") or []) == len(RING)
        and entry.get("geom") == PROPS["geom"]
        and entry.get("households") == 1526
        and abs((entry.get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(
        f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZID} polygon={len(entry.get('polygon') or []) if entry else 0} "
        f"geom={entry.get('geom') if entry else None}"
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

    area = _measured_area()
    print(f"[반영] {ZID} — {len(RING)}정점, area={PROPS['area']}, geom={PROPS['geom']}, "
          f"households={PROPS['households']}")
    print(f"    계측 면적: {area:,.1f}㎡")

    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
