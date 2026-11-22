#!/usr/bin/env python3
"""
방배동 467-19번지 일대(서초구 방배2동) — 추진위·신탁사 상세구역도에서 구역계 다각형 반영 (2026-11-22)

· 원천: 사용자가 보낸 「상세구역도」 이미지(attachments/2026-11-22/IMG_0729-*.jpg).
  카카오 지적편집도 위에 파란 실선으로 그린 구역계이고, 아래에
  「방배동 467-19 지번: 451,453,454,464,465,467,468-1~5」와 「총면적 46,570.4㎡」가 적혀 있다.
· 경계 추출: 파란 실선의 꼭짓점 마커(파란 원 10곳)를 픽셀로 잡고,
  ① 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 경계와 ECC(affine)로 위치·축척·회전을 맞춘 뒤,
  ② 1m 간격으로 다시 떠서 필지 경계 3m 안쪽은 그 경계에 붙이고(지적 계단 반영),
  ③ 1.2m 단순화 → 28정점. 계측 면적 45,938㎡로 공식 총면적(46,570.4㎡)보다 1.4% 작아
     축척을 0.69% 키워 공식 면적에 정확히 맞췄다(모서리 기준 최대 1.5m 이동).
· 구역 안 필지(브이월드 확인): 방배동 451(36필지)·453(31)·454(38)·464(36)·465(34)·467(32) · 468-1~5.
  필지 면적 합 41,755㎡ + 구역 안 도로(미등록) 약 4,800㎡ = 46,570.4㎡.
  서울이수초 부지(468-6학, 13,078㎡)는 구역 밖이다.
· 사업 방식 미정: 신속통합기획(재개발)과 모아타운을 함께 검토 중이라 지도 뱃지는
  `badgeType: "신통모아미정"`으로 띄운다(범례·필터는 type=신통기획 유지).

실행: python3 scripts/apply-bangbae467-19-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "bangbae46719Survey20261122"

ZID = "seocho-bangbae-467-19"

# [lat, lng] 28정점 — 상세구역도 파란 구역계(계측 46,570.4㎡)
RING = [
    [37.480529, 126.982656], [37.480408, 126.985325], [37.479969, 126.985303],
    [37.479846, 126.985277], [37.479762, 126.985291], [37.479395, 126.985271],
    [37.479334, 126.985246], [37.479186, 126.985260], [37.479149, 126.985243],
    [37.478822, 126.985240], [37.478778, 126.985203], [37.478710, 126.985209],
    [37.478744, 126.984593], [37.478526, 126.984579], [37.478574, 126.983855],
    [37.478464, 126.983864], [37.478444, 126.983838], [37.478398, 126.983861],
    [37.478346, 126.983858], [37.478330, 126.983838], [37.478291, 126.983855],
    [37.477824, 126.983827], [37.478136, 126.983234], [37.479377, 126.983302],
    [37.479395, 126.983191], [37.479413, 126.982621], [37.479439, 126.982593],
    [37.480447, 126.982633],
]

PROPS = {
    "id": ZID,
    "name": "방배동 467-19번지 일대",
    "alias": [
        "방배동 467-19",
        "방배동 467-19번지 일대",
        "방배동 467-19 일대",
        "방배동 467-19번지 일원",
        "방배467-19",
        "방배2동 467-19",
        "이수초 인근",
        "서울이수초 인근",
        # 상세구역도에 적힌 지번 (구역 안 필지)
        "방배동 451", "방배동 453", "방배동 454", "방배동 464", "방배동 465", "방배동 467",
        "방배동 468", "방배동 468-1", "방배동 468-2", "방배동 468-3", "방배동 468-4", "방배동 468-5",
        "468-1~5", "방배동468-1~5", "방배동 451·453·454·464·465·467·468-1~5",
    ],
    "type": "신통기획",
    "badgeType": "신통모아미정",
    "kind": "신속통합기획(모아타운 병행 검토)",
    "stage": "추진준비(신탁사 입찰)",
    "gu": "서초구",
    "area": 46570.4,
    "featured": False,
    "sourceId": "추진위·신탁사 사업설명회 상세구역도(총면적 46,570.4㎡·지번 451·453·454·464·465·467·468-1~5)",
    "geom": "추진위안내도",
    "boundaryApprox": False,
    "centerLabel": "구역계 중심(방배동 451·453·454·464·465·467·468-1~5, 서울이수초 북쪽)",
    "center": [37.479508, 126.983998],
    "note": (
        "서초구 방배2동, 서울이수초 바로 북쪽 방배동 451·453·454·464·465·467·468-1~5번지 일대입니다. "
        "정식 후보지 선정 전 추진준비 단계로, 2026-08-10 사업시행자(신탁사) 선정 입찰공고가 났고 "
        "2026-08-21 오후 7시 방주교회 비전홀(방배천로24길 8)에서 추진준비위원회 주최 주민설명회가 열렸습니다. "
        "설명회에는 ㈜오엔랜드이십일(정비사업 절차·추진안내), ㈜하우드엔지니어링종합건축사사무소(사업 비전), "
        "㈜랜드엔지니어링(방식별 사업성), ㈜코람코자산신탁(신탁방식)이 참여했고 토지등소유자가 참석했습니다. "
        "신속통합기획(재개발)과 모아타운(가로주택) 두 방식을 함께 검토 중이며, 설명회 자료 기준 노후도는 "
        "신속통합기획 61%·모아타운 70%로 두 요건을 모두 충족합니다. 서초구청 연번(동의서 번호) 부여 전이라 "
        "고시된 구역계는 아직 없지만, 추진위·신탁사가 만든 상세구역도에 총면적 46,570.4㎡의 구역계가 나와 있어 "
        "그 경계를 지도에 반영했습니다. 아직 신속통합기획인지 모아타운인지 정해지지 않아 지도 뱃지에는 "
        "‘신통모아미정’으로 표기합니다."
    ),
    "areaNote": (
        "추진위·신탁사 상세구역도 표기 총면적 46,570.4㎡(약 14,088평). "
        "구역 안 필지(방배동 451·453·454·464·465·467·468-1~5)의 지적 면적 합은 41,755㎡이고, "
        "나머지 약 4,800㎡는 구역 안에 포함된 도로(필지로 등록되지 않은 길)입니다. "
        "서울이수초 부지(468-6학, 13,078㎡)는 구역 밖입니다."
    ),
    "boundaryNote": (
        "추진위·신탁사 사업설명회 「상세구역도」(카카오 지적편집도 위 파란 실선)에서 옮긴 구역계입니다 — "
        "파란 실선의 꼭짓점 10곳을 픽셀로 잡고, 브이월드 연속지적도 필지 경계에 맞춰(ECC 정합) 위치·축척·회전을 "
        "잡은 뒤 1m 간격으로 다시 떠서 필지 경계에 붙였습니다(28정점). 계측 면적이 45,938㎡로 도면 표기 "
        "46,570.4㎡보다 1.4% 작아 축척을 0.69% 키워 표기 면적에 맞췄습니다(경계 오차 ±2m 수준). "
        "정비구역 지정 고시로 지형도면이 나오면 그것 기준으로 다시 맞춰야 합니다."
    ),
    "sources": [
        {
            "label": "위클리한국주택경제신문 — 방배동 467-19번지 일원 신속통합재개발사업 사업시행자(신탁사) 선정 입찰공고(2026-08-10)",
            "url": "https://www.arunews.com/news/articleView.html?idxno=65810",
        },
        {
            "label": "㈜오엔랜드이십일 공지 — 방배동467-19일원 정비사업 설명회(2026-08-21 방주교회 비전홀, 2026-08-24 등록)",
            "url": "http://onland21.com/board/index.html?id=notice&no=297",
        },
        {
            "label": "도시계획연구소 — 방배2동 재개발, 이수초 인근 방배동 467-19일대 신통기획·모아타운 설명회(2026-08-20)",
            "url": "https://m.blog.naver.com/dosi_lab/224384729892",
        },
        {
            "label": "국토교통부 브이월드 연속지적도(LP_PA_CBND_BUBUN) — 방배동 451·453·454·464·465·467·468-1~5 필지 경계(2025년 기준)",
            "url": "https://www.vworld.kr",
        },
    ],
    "asOf": "2026-11-22",
}

META = {
    "asOf": "2026-11-22",
    "polygons": 1,
    "note": (
        "방배동 467-19번지 일대(서초구) — 추진위·신탁사 상세구역도(지적편집도 위 파란 구역계)에서 28정점 구역계를 "
        "반영. 도면 표기 총면적 46,570.4㎡(지번 451·453·454·464·465·467·468-1~5), 계측 45,938㎡ → 축척 보정으로 일치. "
        "사업 방식 미정이라 지도 뱃지는 badgeType='신통모아미정'(중립 슬레이트)."
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
        and feat["properties"].get("badgeType") == PROPS["badgeType"]
        and feat["properties"].get("boundaryApprox") is False
        and abs((feat["properties"].get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(
        f"[{'OK' if ok else 'FAIL'}] geojson {ZID} geom={feat['properties'].get('geom') if feat else None} "
        f"badge={feat['properties'].get('badgeType') if feat else None} "
        f"verts={len(ring) - 1 if ring else 0} area={feat['properties'].get('area') if feat else None}"
    )
    bad += 0 if ok else 1

    entry = next((z for z in src if z.get("id") == ZID), None)
    ok2 = (
        bool(entry)
        and len(entry.get("polygon") or []) == len(RING)
        and entry.get("geom") == PROPS["geom"]
        and entry.get("badgeType") == PROPS["badgeType"]
        and abs((entry.get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(
        f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZID} polygon={len(entry.get('polygon') or []) if entry else 0} "
        f"geom={entry.get('geom') if entry else None} badge={entry.get('badgeType') if entry else None}"
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
    if feat is None or entry is None:
        print("[실패] 기존 레코드 없음:", ZID)
        return 1

    old = dict(feat["properties"])
    feat["properties"] = {**old, **PROPS, "id": ZID}
    feat["geometry"] = {"type": "Polygon", "coordinates": [_ring_lnglat()]}

    entry.update(PROPS)
    entry["sid"] = PROPS["sourceId"]
    entry["polygon"] = [list(p) for p in RING]
    entry.pop("parts", None)
    entry.pop("holes", None)

    print(f"[반영] {ZID} — {len(RING)}정점, area={PROPS['area']}, geom={PROPS['geom']}, badge={PROPS['badgeType']}")
    print(f"    계측 면적: {_measured_area():,.1f}㎡ (도면 표기 46,570.4㎡ 대비 "
          f"{(_measured_area() / 46570.4 - 1) * 100:+.2f}%)")

    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
