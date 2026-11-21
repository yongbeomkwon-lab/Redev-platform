#!/usr/bin/env python3
"""
방배동 858-1번지 일대 모아타운(서초구 방배4동) — 서울시 고시 관계도면에서 구역계 추출·반영 (2026-11-22)

· 원천: 서울시보 제4175호(2026. 8. 27.) 수록 「서울특별시고시 제2026-481호 주택 등 건축물의
  분양받을 권리의 산정 기준일 고시」의 붙임 「관계도면 — 서초구 방배동 858-1번지 일원」.
  도면에 구역계를 붉은 점선으로 그려 두었고, 그 점선의 중심선을 픽셀 단위로 추출해 16정점
  다각형으로 옮겼다. 교차 확인: 서초구청 공지사항 2026-01-13 「방배동 858-1번지 일대 주민제안
  모아타운 주민의견 사전조사 실시 안내」 첨부 「모아타운 주민설문지.hwpx」 안의 위성 위치도
  (같은 구역계, 축척만 다른 도면) — 두 도면의 경계 모양이 정규화 좌표에서 일치.
· 축척: 관계도면의 구역계 계측 면적이 고시 면적(25,522.4㎡)과 맞도록 잡았다.
  지적편집도(카카오 지적편집도, 0.5m/px) 위에 겹쳐 필지선에 맞춘 결과 0.5115m/px,
  구역계 3면(북·동·동남)은 필지선과 1m 이내로 붙고 서쪽·남서쪽 변은 4~8m 어긋난다.
· 대상: 기존 레코드(bangbae-858-1, geom "미고시" 점선원) → 다각형 16정점.

실행: python3 scripts/apply-bangbae858-1-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "bangbae858MoaTown20261122"

ZID = "bangbae-858-1"

# 지번 858-1·861-5는 구역 안(고시 대표 지번), 855-1은 북동 경계 밖 바로 옆 필지.
RING = [
    [37.488563, 126.988338], [37.488542, 126.988204], [37.487787, 126.986358],
    [37.487693, 126.986183], [37.487527, 126.986161], [37.486683, 126.986177],
    [37.486787, 126.987168], [37.486821, 126.987257], [37.487560, 126.986777],
    [37.487609, 126.986843], [37.487945, 126.987637], [37.487917, 126.987749],
    [37.486958, 126.988347], [37.486937, 126.988487], [37.487147, 126.989168],
    [37.487233, 126.989206],
]

PROPS = {
    "id": ZID,
    "name": "방배동 858-1 일대 모아타운",
    "alias": [
        "방배동 858-1", "방배동 858-1번지", "방배동 858-1번지 일대", "방배동 858-1번지 일원",
        "방배동858-1", "방배 858-1", "858-1 모아타운",
        "방배동 855-1", "방배동 855-1 일대", "방배 855-1",
        "방배초 모아타운", "방배초모아타운", "방배초등학교 모아타운",
        "방배4동 모아타운", "서초구 모아타운", "서초 모아타운",
        "방배동 861-5", "방배동 861-1",
    ],
    "type": "모아타운",
    "kind": "모아타운(주민제안)",
    "stage": "주민제안·관리계획 수립 중(권리산정기준일 고시 2026-08-27)",
    "gu": "서초구",
    "area": 25522.4,
    "featured": False,
    "geom": "공고도면",
    "boundaryApprox": False,
    "sourceId": "서울시보 제4175호(2026-08-27) 서울특별시고시 제2026-481호 관계도면 · 서초구 공지(2026-01-13) 설문지 위성 위치도",
    "centerLabel": "구역계 중심(서울시 고시 관계도면)",
    "center": [37.487584, 126.987627],
    "selectedAt": "2026-06-22",
    "note": (
        "서초구 방배4동 방배동 858-1번지 일대(방배초등학교를 낀 블록)의 주민제안 모아타운입니다. "
        "2026-01-15~01-30 서초구가 「서울시 모아타운 갈등방지 세부지침」에 따라 주민의견 사전조사를 했고"
        "(대지면적 25,522.4㎡·제1·2종일반주거지역 7층), 2026-03-04 결과 공고에서 1구역(토지등소유자 149명·반대 8.05%, "
        "면적 기준 반대 28.71%·기준면적 9,018.6㎡)과 2구역(166명·반대 4.82%, 면적 반대 15.13%·기준면적 12,347.1㎡) "
        "모두 서울시 불허기준(소유자 25%·면적 1/3)을 넘지 않았습니다. 2026-08-27 서울시 고시 제2026-481호로 "
        "권리산정기준일이 2025-12-05로 고시됐고(2026년 제10차 전문가 자문회의 2026-06-22, 의견: 재자문 필요), "
        "고시문은 기준일로부터 2년 안에 관리계획이 승인되지 않으면 기준일이 자동 실효된다고 밝히고 있습니다. "
        "원래 4개 구역으로 추진하다 하단 구역을 빼고 1·2구역만 남겼으며(민간 정리 기준 1구역 306세대·2구역 445세대, "
        "합 751세대), 그 결과 지도 경계는 남쪽이 열린 ‘ㄷ’자 모양이고, 홈 안에 든 방배초등학교 블록은 구역에서 빠져 있습니다(구역 대지 구성에도 학교 부지가 없습니다). 지도 경계는 2026-08-27 서울시 고시 관계도면의 "
        "구역계입니다."
    ),
    "areaNote": (
        "고시 면적 25,522.4㎡(서울시 고시 제2026-481호·서초구 2026-01-13 공고 모두 같은 값). "
        "관계도면의 구역계를 0.5144m/px로 옮긴 다각형의 계측 면적은 25,481㎡로 고시 면적과 0.2% 차이입니다. "
        "사전조사 결과 공고의 동의율 기준면적은 1구역 9,018.6㎡ + 2구역 12,347.1㎡ = 21,365.7㎡로, "
        "고시 면적과의 차이 약 4,157㎡는 구역 안 도로 등 국·공유지입니다."
    ),
    "boundaryNote": (
        "서울시보 제4175호(2026. 8. 27.)에 실린 서울특별시고시 제2026-481호 붙임 「관계도면 — 서초구 방배동 858-1번지 "
        "일원」의 붉은 점선(구역계)을 픽셀 단위로 추출해 중심선을 16정점으로 이어 붙였습니다. 축척은 계측 면적이 고시 "
        "면적(25,522.4㎡)과 맞도록 0.5144m/px로 잡았고(계측 25,481㎡, -0.2%), 위치는 카카오 지적편집도(0.5m/px)에 "
        "겹쳐 잡았습니다 — 남쪽이 열린 ‘ㄷ’자 홈(원래 4개 구역 중 제외된 하단 구역)을 방배초등학교 블록에 맞추고, "
        "북쪽 변은 방배중앙로15길, 동쪽 변은 방배로25길 쪽 도로·필지선에 붙였습니다. 경계 오차는 ±5m 수준으로 봅니다. "
        "서초구 2026-01-13 공고 첨부 「모아타운 주민설문지.hwpx」의 위성 위치도에 같은 구역계가 축척만 다르게 그려져 "
        "있어 두 도면의 모양을 정규화 좌표로 대조했습니다(북동 꼭짓점 0.72, 0.00 / 남동 1.00, 0.73 / 남서 0.00, 1.00). "
        "관리계획 승인·고시로 지형도면이 나오면 그것 기준으로 다시 맞춰야 합니다."
    ),
    "sources": [
        {
            "label": "서울시보 제4175호(2026. 8. 27.) — 서울특별시고시 제2026-481호 주택 등 건축물의 분양받을 권리의 산정 기준일 고시(방배동 858-1번지 일원 25,522.4㎡·권리산정기준일 2025.12.05·관계도면)",
            "url": "https://www.seoul.go.kr/func/seoulsibo/fileDownload.do?fileName=seoulsibo_20260828163709_74413.pdf",
        },
        {
            "label": "서초구청 공지사항 — 방배동 858-1번지 일대 주민제안 모아타운 주민의견 사전조사 실시 안내(2026-01-13, 첨부 1. 모아타운 주민설문지.hwpx 안 위성 위치도)",
            "url": "https://www.seocho.go.kr/site/seocho/ex/bbs/View.do?bcIdx=406738&cbIdx=57",
        },
        {
            "label": "서초구청 공지사항 — 방배동 858-1번지 일원 모아타운 주민의견 사전조사 결과 안내(2026-03-04, 1구역·2구역 찬반 결과)",
            "url": "https://www.seocho.go.kr/site/seocho/ex/bbs/View.do?bcIdx=407700&cbIdx=57",
        },
        {
            "label": "서울 열린데이터광장 — 서울시 도시계획사업 현황(서울플랜+) 2026-09: 방배동 854번지 일원 가로주택정비사업(예정) 등 인접 사업 경계",
            "url": "https://data.seoul.go.kr",
        },
    ],
    "asOf": "2026-11-22",
}

META = {
    "asOf": "2026-11-22",
    "polygons": 1,
    "note": (
        "방배동 858-1번지 일대 모아타운(서초구)의 서울시 고시 관계도면(고시 제2026-481호, 서울시보 제4175호) "
        "구역계를 16정점으로 반영. 계측 25,481㎡(고시 25,522.4㎡)."
    ),
}


def _ring_lnglat() -> list[list[float]]:
    ring = [[lng, lat] for lat, lng in RING]
    ring.append(ring[0])
    return ring


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    ok = (
        bool(feat)
        and (feat.get("geometry") or {}).get("type") == "Polygon"
        and len(feat["geometry"]["coordinates"][0]) == len(RING) + 1
        and feat["properties"].get("geom") == PROPS["geom"]
        and abs((feat["properties"].get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson {ZID} geom={feat['properties'].get('geom') if feat else None} "
          f"rings={(len(feat['geometry']['coordinates'][0]) - 1) if feat and feat.get('geometry') else 0}")
    bad += 0 if ok else 1
    entry = next((z for z in src if z.get("id") == ZID), None)
    ok2 = bool(entry) and len(entry.get("polygon") or []) == len(RING) and entry.get("geom") == PROPS["geom"]
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZID} polygon={len(entry.get('polygon') or []) if entry else 0}")
    bad += 0 if ok2 else 1
    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(geo['features'])} batch={META_KEY in geo['metadata']}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZID), None)
    if feat is None:
        print("[실패] geojson에 구역 없음:", ZID)
        return 1
    old = dict(feat["properties"])
    feat["properties"] = {**old, **PROPS, "id": ZID}
    feat["geometry"] = {"type": "Polygon", "coordinates": [_ring_lnglat()]}
    entry = next((z for z in src if z.get("id") == ZID), None)
    if entry is None:
        print("[실패] seoul-zones에 구역 없음:", ZID)
        return 1
    entry.update(PROPS)
    entry["sid"] = PROPS["sourceId"]
    entry["polygon"] = [list(p) for p in RING]
    entry.pop("parts", None)
    print(f"[반영] {ZID} — {len(RING)}정점, area={PROPS['area']}, geom={PROPS['geom']}")

    import math as _m
    from shapely.geometry import Polygon as _Poly

    p = _Poly([(lo, la) for la, lo in RING])
    area = abs(p.area) * (111320 * _m.cos(_m.radians(p.centroid.y))) * 110950
    print(f"    계측 면적: {area:,.1f}㎡ (고시 25,522.4㎡ 대비 {(area / 25522.4 - 1) * 100:+.1f}%)")
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
