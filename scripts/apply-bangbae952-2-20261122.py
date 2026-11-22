#!/usr/bin/env python3
"""
방배동 952-2 일대 민간도심복합(성장거점형, 서초구 방배2동) — 구역계 정밀 교정 (2026-11-22 2차)

· 1차 반영(de59dbf)은 도면을 도로명만 보고 11정점으로 어림해 그려, ① 북변이 서초대로를 넘어 북측
  블록(방배마에스트로·디오슈페리움)까지 침범하고 ② 서남 426 블록(세양아르비채 남측~방배천로20길)과
  ③ 동쪽 꼬리 954·956(유니트) 블록이 통째로 빠져 있었다(사용자 지적).
· 이번 판은 **브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 도형**을 원천으로 삼아, 사용자가 준
  두 도면(IMG_0736 지적도 손표시 · IMG_0735 신축계획안 P26-140)에 표시된 구역 안 필지를 그대로
  합집합(union)해 만든 59정점 구역계다. 필지 경계에 정확히 붙으므로 도로·아파트 단지와 겹침이 없다.

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

· 계측 면적 **41,200㎡(약 12,463평)** — 도면에 사업면적 숫자 표기는 확인되지 않아 필지 합집합 계측값.
· 필지 경계에 그대로 붙인 실경계형 도형이라 `geom: "추진위안내도"`, `boundaryApprox: false`.
  (사업시행자 지정·고시 도면이 나오면 그 도면 기준으로 다시 맞춰야 한다.)

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
        "방배동 952", "방배동 425", "방배동 426", "방배동 954", "방배동 956",
        "방배동 425-2", "방주교회", "방배2동 도심복합", "서초구 민간도심복합",
    ],
    "type": "민간도심복합(성장거점형)",
    "kind": "민간도심복합개발(성장거점형)",
    "stage": "추진준비",
    "gu": "서초구",
    "area": 41200,
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
        "인접한 방배5·방배13·방배14 등 기존 정비구역과는 별개 구역입니다."
    ),
    "areaNote": (
        "구역 안 필지(952·421·422·423·951·425·426·954·956 일대)와 내부 통로를 브이월드 연속지적도 도형 그대로 "
        "합집합해 계측한 41,200㎡(약 12,463평)입니다. 신축계획안 도면에 사업면적 숫자 표기가 확인되지 않아 "
        "계측값으로 표기합니다. 사업시행자 지정·고시 도면이 나오면 그 면적으로 대체해야 합니다."
    ),
    "boundaryNote": (
        "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 도형을 그대로 이어 붙인 실경계형 경계입니다 — 사용자가 준 "
        "① 지적도 손표시(IMG_0736), ② 신축계획안 배치도(P26-140, 2026-04-30)의 사업구역계와 같은 필지 묶음입니다. "
        "북변은 952·421·422·423·951 블록 북측(서초대로 남측 도로경계선 아래), 서변은 425·426 블록 서측"
        "(이수역 5번 출구에서 남서로 휘는 동작대로·방배천로 곡선), 남서는 426 블록 하단(방배천로20길 북측), "
        "동변은 954·956 꼬리의 동측(20M 도로 — 디에이치방배 건너편)이고 956 남단(아름빌리지 북측)까지 내려갑니다. "
        "안쪽 ㄷ자 홈의 방배롯데캐슬아르떼(424-28, 39,074㎡·101~111동)는 8M·12M·15M 도로를 경계로 완전히 제외했고, "
        "북측 서초대로 건너 블록과 동측 디에이치방배(949·950)도 제외입니다. 방주교회는 방배동 425-2"
        "(방배천로24길 8)로 서쪽 425 블록 안이며 구역에 포함됩니다. 아직 고시 전 추진준비 단계라 사업시행자 지정·"
        "고시 도면이 나오면 그것 기준으로 다시 맞춰야 합니다."
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
        "방배동 952-2 일대 민간도심복합(성장거점형, 서초구) 구역계 정밀 교정 — 브이월드 연속지적도 필지 "
        "도형을 합집합해 59정점 실경계형 경계로 교체(서초대로 남측·426 블록·954·956 꼬리 포함, "
        "방배롯데캐슬아르떼 424-28 완전 제외). 계측 41,200㎡·1,526세대(59㎡ 456·84㎡ 1,070, 분양 1,175·공공임대 351)."
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
        and feat["properties"].get("boundaryApprox") is False
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
