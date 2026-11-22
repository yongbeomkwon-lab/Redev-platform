#!/usr/bin/env python3
"""도선동 332 일대 민간도심복합개발사업 추진준비 구역 — 성동구 신규 등록 (2026-11-22)

· 원천
  - 도선동 332번지 일대 민간도심복합개발사업 추진준비위원회 「우선협상대상 신탁사(예비신탁사)
    선정 입찰공고」 공고 제2026-001호(2026-10-21): 구역위치 서울특별시 성동구 도선동 332번지
    일원, 구역면적 58,713.70㎡, 접수처 도선동 185-8 2층.
  - 재개발닷컴 「(가)도선동 332」(jaegebal.com/develops/5110): 사업유형 민간도심복합,
    구역면적 58,557㎡, 토지등소유자 560명(추정), 533세대, 노후도 89.0%(253/284),
    제2종일반주거 58,608㎡(100%), 종교시설 홍익동 396-2 340.8㎡, 상왕십리역 도보 3분 227m.
  - 브이월드 연속지적도(lt_c_landinfobasemap) 필지 경계 — 성동구 도선동·홍익동 4,642필지 중
    구역 안 필지의 지번선을 이어 경계를 만들었다.
· 경계: 공개된 구역계 도면이 없는 추진준비 단계라 geom "가상경계". 서쪽 무학로, 북쪽 마장로,
  동쪽 왕십리로26길, 남쪽 무학로2길의 **필지 쪽 지번선**을 따라 39정점으로 그렸다(도로 중심선이
  아니라 도로에 접한 필지선). 계측 57,726㎡ — 공고 58,713.70㎡ 대비 -1.7%.
· 정합 확인: 기존 도선동 185-1 가로주택(성동구 UQ120)·도선동 286 역세권과 겹침 0㎡,
  대표 지번(도선동 332·314·333-1, 홍익동 346·396-2) 모두 구역 안, 구역 중심에서 상왕십리역
  까지 238m(재개발닷컴 도보 227m와 같은 범위).

실행: python3 scripts/apply-doseon332-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "seongdongDoseon332Mdb20261122"
ZONE_ID = "seongdong-doseon-332"

# [lat, lng] — 무학로 → 마장로 → 왕십리로26길 → 무학로2길 순서(반시계)
RING = [
    [37.5647450, 127.0302401], [37.5665300, 127.0302222], [37.5665679, 127.0302723],
    [37.5664813, 127.0303946], [37.5664823, 127.0306775], [37.5665323, 127.0306823],
    [37.5665148, 127.0308043], [37.5664197, 127.0308042], [37.5663867, 127.0310631],
    [37.5664758, 127.0310760], [37.5664299, 127.0313964], [37.5663488, 127.0313778],
    [37.5662703, 127.0320509], [37.5663347, 127.0320608], [37.5662220, 127.0328473],
    [37.5659432, 127.0327969], [37.5659100, 127.0330880], [37.5658656, 127.0331285],
    [37.5655846, 127.0330773], [37.5655291, 127.0329831], [37.5654565, 127.0330515],
    [37.5651768, 127.0330008], [37.5651146, 127.0328938], [37.5650316, 127.0329718],
    [37.5647512, 127.0329209], [37.5646881, 127.0328286], [37.5646176, 127.0328988],
    [37.5643357, 127.0328463], [37.5642796, 127.0327528], [37.5642057, 127.0328226],
    [37.5636943, 127.0327290], [37.5636720, 127.0326685], [37.5641367, 127.0316123],
    [37.5642366, 127.0315728], [37.5642114, 127.0314439], [37.5644340, 127.0309415],
    [37.5645220, 127.0308829], [37.5645151, 127.0307593],
]

ZONE = {
    "id": ZONE_ID,
    "name": "(가)도선동 332 민간도심복합",
    "alias": [
        "도선동 332", "도선동332", "도선동 332 일대", "도선동 332번지", "도선동 332번지 일대",
        "도선동 332번지 일원", "(가)도선동 332", "(가칭)도선동 332", "가칭 도선동 332",
        "도선동 332 민도복", "도선동 332 민간도심복합", "도선동 민도복",
        "상왕십리역 민도복", "상왕십리역 민간도심복합", "성동구 도선동 332",
        "도선동 332번지 일대 민간도심복합개발사업", "무학로6길 10", "도선동 314", "도선동 333-1",
        "홍익동 346", "홍익동 396-2",
    ],
    "type": "민간도심복합(주거중심형)",
    "kind": "민간도심복합개발(주거중심형)",
    "stage": "추진준비",
    "gu": "성동구",
    "area": 58713.7,
    "featured": False,
    "geom": "가상경계",
    "boundaryApprox": True,
    "sourceId": (
        "도선동 332번지 일대 민간도심복합개발사업 추진준비위원회 입찰공고 제2026-001호(2026-10-21) · "
        "재개발닷컴 「(가)도선동 332」 구역 정보 · 브이월드 연속지적도 필지 경계"
    ),
    "centerLabel": "상왕십리역 남동쪽 — 무학로·마장로·왕십리로26길·무학로2길 사이 도선동 332·314·333-1·홍익동 346 일대",
    "center": [37.5652670, 127.0316588],
    "asOf": "2026-11-22",
    "note": (
        "도선동 332번지 일대 민간도심복합개발사업 추진준비위원회가 추진하는 민간도심복합(주거중심형) "
        "구역입니다. 상왕십리역 남동쪽 무학로·마장로·왕십리로26길·무학로2길 사이 도선동 332·314·333-1, 홍익동 346·396-2 "
        "일대로, 재개발닷컴 표기로 구역면적 58,557㎡(제2종일반주거 100%), 토지등소유자 약 560명, 533세대"
        "(공동주택 321·단독주택 212), 근린생활시설 81동, 노후도 89.0%(253/284동)입니다. 추진준비위원회는 "
        "2026-10-21 공고 제2026-001호로 「우선협상대상 신탁사(예비신탁사) 선정 입찰공고」를 내 구역면적을 "
        "58,713.70㎡로 밝혔고, 같은 공고의 입찰지침서는 선정된 신탁사가 「도심 복합개발 지원에 관한 법률」에 따른 "
        "도심복합개발혁신지구 지정·인허가 지원, 사업시행예정자·사업시행자 지정 지원, 주민설명회·공청회 준비를 "
        "맡는다고 정하고 있습니다(입찰 마감 2026-10-30, 접수처 도선동 185-8 2층). 이후 2026-11-10 무렵 "
        "신한자산신탁과 업무협약(MOU)을 맺었다는 소식이 추진위 게시글로 전해졌고, 2026-11-21 오후 3시 "
        "주민설명회를 열었습니다. 사업지 선정·구역 지정 전 단계로 공식 고시된 구역계가 없습니다."
    ),
    "areaNote": (
        "입찰공고(공고 제2026-001호, 2026-10-21) 구역면적 58,713.70㎡ · 재개발닷컴 표기 58,557㎡"
        "(용도별 토지면적 합 58,608㎡) · 지도 도형 계측 57,726㎡(공고 대비 -1.7%). 재개발닷컴 구성: "
        "공동주택 7,503㎡(13%)·단독주택 20,615㎡(35%)·근린생활시설 15,422㎡(26%)·도로 9,468㎡(16%)·기타 5,601㎡(10%)."
    ),
    "boundaryNote": (
        "공개된 구역계 도면이 없어, 브이월드 연속지적도(lt_c_landinfobasemap)의 성동구 도선동·홍익동 필지 "
        "지번선을 이어 만든 가상경계입니다. 서쪽은 무학로, 북쪽은 마장로, 동쪽은 왕십리로26길, 남쪽은 무학로2길에 "
        "접한 필지의 지번선을 따라 39정점으로 그렸습니다(도로 중심선이 아니라 도로에 붙은 필지선). 경계 안에 "
        "도선동 332(청기와빌라)·314(로젠빌)·333-1(로얄드림캐슬), 홍익동 346·396-2가 모두 들어가고, 도선동 185-1 "
        "가로주택정비사업 구역·도선동 286 역세권과 겹치는 면적은 0㎡입니다. 구역 중심에서 상왕십리역까지 238m로 "
        "재개발닷컴 표기(도보 3분 227m)와 같은 범위입니다. 도심복합개발혁신지구 지정·고시로 확정 도면이 나오면 "
        "다시 맞춰야 하며, 그전까지 실제 구역계와는 ±15m 안팎 차이가 있을 수 있습니다."
    ),
    "sources": [
        {
            "label": "도선동 332번지 일대 민간도심복합개발사업 추진준비위원회 — 우선협상대상 신탁사(예비신탁사) 선정 입찰공고, 공고 제2026-001호, 2026-10-21 (구역면적 58,713.70㎡·도선동 332번지 일원)",
            "url": "https://work.00data.kr/projects/R26BK01784546",
        },
        {
            "label": "위클리한국주택경제신문 — 도선동 332번지 일대 민간도심복합개발사업 추진위원회 우선협상대상 신탁사 선정 입찰공고(2026-10-22)",
            "url": "https://www.arunews.com/news/articleView.html?idxno=68506",
        },
        {
            "label": "재개발닷컴 — (가)도선동 332 구역 정보(구역면적 58,557㎡·토지등소유자 560명·533세대·노후도 89.0%·제2종일반주거 100%)",
            "url": "https://jaegebal.com/develops/5110",
        },
        {
            "label": "재개발닷컴 — 「11/21(토) 오후 3시 주민설명회 합니다」(2026-11-15 게시) 및 신한자산신탁 업무협약(MOU) 관련 게시글(2026-11-10)",
            "url": "https://jaegebal.com/develops/5110/posts/12551",
        },
        {
            "label": "브이월드 연속지적도(lt_c_landinfobasemap) — 성동구 도선동·홍익동 필지 경계(경계 도형 원천)",
            "url": "https://www.vworld.kr",
        },
    ],
}

META = {
    "asOf": "2026-11-22",
    "polygons": 1,
    "note": (
        "성동구 도선동 332 일대 민간도심복합(주거중심형) 추진준비 구역을 가상경계로 신규 등록했다. "
        "공개 구역계가 없어 연속지적도 지번선으로 무학로·마장로·왕십리로26길·무학로2길을 따라 39정점을 그렸고"
        "(계측 57,726㎡, 공고 58,713.70㎡ 대비 -1.7%), 도선동 185-1 가로주택·도선동 286 역세권과 겹침 0㎡다."
    ),
}


def _ring_geojson() -> list:
    ring = [[lng, lat] for lat, lng in RING]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    ok = bool(feat) and (feat.get("geometry") or {}).get("type") == "Polygon" \
        and len(feat["geometry"]["coordinates"][0]) == len(RING) + 1 \
        and feat["properties"].get("geom") == ZONE["geom"] \
        and feat["properties"].get("boundaryApprox") is True \
        and abs((feat["properties"].get("area") or 0) - ZONE["area"]) < 0.01
    print(f"[{'OK' if ok else 'FAIL'}] geojson {ZONE_ID} geom={feat['properties'].get('geom') if feat else None} "
          f"rings={(len(feat['geometry']['coordinates'][0]) - 1) if feat and feat.get('geometry') else 0} "
          f"area={feat['properties'].get('area') if feat else None}")
    bad += 0 if ok else 1
    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    ok2 = bool(entry) and len(entry.get("polygon") or []) == len(RING) and entry.get("geom") == ZONE["geom"]
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZONE_ID} polygon={len(entry.get('polygon') or []) if entry else 0}")
    bad += 0 if ok2 else 1
    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(geo['features'])} "
          f"batch={META_KEY in geo['metadata']}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    ring_geo = _ring_geojson()
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    if feat is None:
        feat = {"type": "Feature", "properties": {}, "geometry": None}
        geo["features"].append(feat)
        print(f"[신규] geojson 피처 추가 — {ZONE_ID}")
    feat["properties"] = {**feat.get("properties", {}), **ZONE, "id": ZONE_ID}
    feat["geometry"] = {"type": "Polygon", "coordinates": [ring_geo]}

    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    if entry is None:
        entry = {"id": ZONE_ID}
        src.append(entry)
        print(f"[신규] seoul-zones 레코드 추가 — {ZONE_ID}")
    entry.update(ZONE)
    entry["sid"] = ZONE["sourceId"]
    entry["polygon"] = RING
    entry.pop("parts", None)

    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    import math

    from pyproj import Transformer
    from shapely.geometry import Polygon
    from shapely.ops import transform as shp_transform

    p = Polygon([(lng, lat) for lat, lng in RING])
    tr = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    area = abs(shp_transform(tr.transform, p).area)
    print(f"[반영] {ZONE_ID} — {len(RING)}정점, 계측 {area:,.0f}㎡ "
          f"(공고 58,713.7㎡ 대비 {(area/58713.7-1)*100:+.1f}%)")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
