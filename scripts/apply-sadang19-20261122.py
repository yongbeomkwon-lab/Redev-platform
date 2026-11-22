#!/usr/bin/env python3
"""
사당동 77-24 일대(가칭 사당19구역) — 동작구 구역 공개 도면에서 구역계 다각형 반영 (2026-11-22)

· 원천: 동작구 도시정비소식 2025-05-27 「사당19구역 신속통합기획 주택재개발사업 동의서 번호부여 및
  구역 공개(사당동 77-24번지 일대)」 붙임1 PDF (공고 구역계 25,321.816㎡·번호부여 사당2동 제2호).
  붙임1 첫 장의 지도에 구역계가 붉은 점선으로 그려져 있다. 점선 조각 109개의 중심을 순서대로 이어
  닫힌 고리를 만들고 단순화해 34정점 다각형으로 옮겼다.
· 축척: 도면에 적힌 구역계 면적 25,321.816㎡에 맞춰 1px=0.452m(2.21px/m). 계측 면적 25,191㎡.
· 위치: 정비사업 정보몽땅 「사당동 77-24일대」 위치도(서울시, 2026)의 대상지 도형과 형상을 겹쳐
  최대 일치(IoU 0.93)가 되는 자리로 잡았다. 지도 안 동작동노인정(=사당동 77-24, 배나무골경로당)과
  사당2동주민센터의 실제 좌표 대조, Esri World Imagery 위성영상의 도로·필지선 대조로 확인.
· 대상: 기존 레코드(sadang-19, geom "미고시") → 다각형 34정점.

실행: python3 scripts/apply-sadang19-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "sadang19District20261122"

RING = [
    [37.4903024, 126.9790874], [37.4902399, 126.9790878], [37.4899830, 126.9791367],
    [37.4892673, 126.9792107], [37.4892163, 126.9792485], [37.4891878, 126.9793147],
    [37.4891795, 126.9799701], [37.4891539, 126.9805444], [37.4891106, 126.9806062],
    [37.4891396, 126.9806521], [37.4890818, 126.9806688], [37.4889341, 126.9812166],
    [37.4888847, 126.9814431], [37.4891326, 126.9815184], [37.4892063, 126.9815543],
    [37.4891739, 126.9818147], [37.4891701, 126.9820575], [37.4891859, 126.9821620],
    [37.4892664, 126.9821970], [37.4895227, 126.9822471], [37.4895594, 126.9822004],
    [37.4895844, 126.9818847], [37.4896111, 126.9818930], [37.4895895, 126.9817999],
    [37.4896599, 126.9816623], [37.4897810, 126.9813703], [37.4898221, 126.9813449],
    [37.4898076, 126.9812997], [37.4899614, 126.9809363], [37.4900545, 126.9806307],
    [37.4900442, 126.9805540], [37.4900515, 126.9799835], [37.4904364, 126.9792249],
    [37.4904154, 126.9791724],
]

ZONES = [
    {
        "id": "sadang-19",
        "name": "사당동 77-24 일대",
        "alias": [
            "사당19", "사당19구역", "(가칭)사당19구역", "사당 19", "사당19신속통합기획",
            "사당동 77-24", "사당동77-24", "사당동 77-24번지", "사당동 77-24번지 일대",
            "사당동 77-24 일원", "사당동77-24일대", "사당2동 77-24",
            "동작구 사당동 77-24 일대", "사당동 77-24 재개발",
        ],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "후보지선정",
        "gu": "동작구",
        "area": 25194.8,
        "featured": False,
        "geom": "공고도면",
        "boundaryApprox": False,
        "sourceId": "동작구 고시공고(2025-05-27) 구역 공개 도면 · 서울시 신통기획 후보지 선정(2026-05-07) · 정비사업 정보몽땅 위치도",
        "centerLabel": "도면 구역계 중심",
        "center": [37.4895802, 126.9804601],
        "selectedAt": "2026-05-06",
        "asOf": "2026-11-22",
        "note": (
            "통칭 사당19구역. 동작구 사당동 77-24번지 일대 신속통합기획 주택재개발 사업지입니다. "
            "2025-05-27 동작구가 「사당19구역 신속통합기획 주택재개발사업 동의서 번호부여 및 구역 공개」를 "
            "공고하며 동의양식번호 사당2동 제2호를 부여하고 구역계(25,321.816㎡)와 지도를 공개했고, "
            "2025-07-28 개정양식으로 같은 구역 공개를 다시 게시(2025-10-02 동작구 도시정비소식)했습니다. "
            "2026-05-06 서울시 제7차 도시계획위원회에서 2026년 신속통합기획 후보지 18곳 중 한 곳으로 선정됐고"
            "(정보몽땅 구역면적 25,194.8㎡·503세대, 같은 회차로 토지거래허가구역 지정), 2026-09-03 보도에 따르면 "
            "동작구가 도시계획 업체를 선정해 정비계획 수립에 착수했으며 후보지 신청 당시 동의율 약 55%로 "
            "정비구역 지정 전 조합설립추진위원회 승인 요건을 갖춘 상태입니다. 2026-10-02 동작구 공고 "
            "제2026-1588호로 「(가칭)사당19구역 신속통합기획 후보지 주민참여단 모집 결과」가 공고됐습니다. "
            "지도 경계는 2025-05-27 공고 붙임1의 지도에 그려진 붉은 점선 구역계를 옮긴 것이며, 정비구역 지정 "
            "고시로 확정 도면이 나오면 다시 맞춰야 합니다."
        ),
        "areaNote": (
            "2025-05-27 동작구 구역 공개 공고 구역계 25,321.816㎡ · 정비사업 정보몽땅(2026-05-31 기준) 25,194.8㎡ · "
            "2026-09-03 보도(후보지 신청 당시) 25,027㎡. 도면 경계를 옮긴 다각형의 계측 면적은 25,191㎡로, "
            "같은 도면 공고 면적 대비 -0.5%, 정보몽땅 면적 대비 -0.01%입니다."
        ),
        "boundaryNote": (
            "동작구 도시정비소식 2025-05-27 게시 「[붙임1] 사당동 77-24번지 일대 동의서 번호부여 요청구역 "
            "공개.pdf」 첫 장의 지도(네이버 지도 화면)에 구역계가 붉은 점선으로 그려져 있습니다. 이 점선 픽셀을 "
            "색으로 분리해 조각 109개의 중심을 순서대로 이어 닫힌 고리를 만들고 단순화해 34정점 다각형으로 "
            "옮겼습니다. 축척은 도면에 적힌 구역계 면적 25,321.816㎡에 맞춰 1px=0.452m(2.21px/m)로 정했습니다. "
            "위치는 정비사업 정보몽땅 「사당동 77-24일대」 위치도(서울시, 2026)의 대상지 도형과 이 다각형의 "
            "형상을 겹쳐 최대 일치(IoU 0.93)가 되는 자리로 잡았고, 지도 안의 동작동노인정(=사당동 77-24, "
            "배나무골경로당)과 사당2동주민센터 두 지점의 실제 좌표를 도면 위 위치와 대조해 어긋남이 10m 안쪽임을 "
            "확인했습니다. 경계는 서쪽으로 동작대로29길·동작대로31길 변, 남쪽으로 동작대로29바길 일대 도로, "
            "동쪽으로 동작대로 서측 블록, 북쪽으로 사당동 77 일대 필지선을 따라갑니다. Esri World Imagery "
            "위성영상에서도 경계가 도로·필지선을 따라가는 것을 확인했습니다(경계 오차 ±5m 수준)."
        ),
        "sources": [
            {
                "label": "동작구 도시정비소식 — 사당19구역 신속통합기획 주택재개발사업 동의서 번호부여 및 구역 공개(사당동 77-24번지 일대), 2025-05-27 (붙임1 구역계 도면·25,321.816㎡·사당2동 제2호)",
                "url": "https://www.dongjak.go.kr/portal/bbs/B0001387/view.do?nttId=10702406&menuNo=201575",
            },
            {
                "label": "동작구 도시정비소식 — 사당19구역(사당동 77-24번지 일대) 동의서 번호부여 및 구역 공개('25.7.28.일자 개정양식으로 변경), 2025-10-02",
                "url": "https://www.dongjak.go.kr/portal/bbs/B0001387/list.do?menuNo=201575",
            },
            {
                "label": "서울시 — 2026년 제7차 도시계획위원회 신속통합기획(주택재개발) 후보지 18곳 선정·토지거래허가구역 지정(2026-05-07)",
                "url": "https://www.seoul.go.kr/news/news_report.do?bbsNo=158&nttNo=457529",
            },
            {
                "label": "정비사업 정보몽땅 — 신속통합기획 후보지 수시 선정구역 「사당동 77-24일대」 위치도·구역면적 25,194.8㎡·503세대",
                "url": "https://cleanup.seoul.go.kr/cleanup/view/publicIntgrPlanArea.do",
            },
            {
                "label": "디벨로퍼뉴스 — 사당19구역, 재개발 '속도전'…동의율 55%로 '추진위 직행' 기대감(2026-09-03, 도시계획 업체 선정·정비계획 수립 착수)",
                "url": "https://www.dpnews.co.kr/news/articleView.html?idxno=2356",
            },
        ],
    }
]

META = {
    "asOf": "2026-11-22",
    "polygons": 1,
    "note": (
        "사당동 77-24 일대(가칭 사당19구역, 동작구)의 2025-05-27 동작구 구역 공개 공고(붙임1) 구역계를 반영했다. "
        "도면의 붉은 점선 중심선을 추출해 34정점 다각형으로 옮기고, 정보몽땅 위치도 도형과 겹쳐 위치를 잡았다"
        "(계측 25,191㎡, 공고 25,321.8㎡)."
    ),
}


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for props in ZONES:
        zid = props["id"]
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        ok = bool(feat) and (feat.get("geometry") or {}).get("type") == "Polygon" \
            and len(feat["geometry"]["coordinates"][0]) == len(RING) + 1 \
            and feat["properties"].get("geom") == props["geom"] \
            and abs((feat["properties"].get("area") or 0) - props["area"]) < 0.01
        print(f"[{'OK' if ok else 'FAIL'}] geojson {zid} geom={feat['properties'].get('geom') if feat else None} "
              f"rings={(len(feat['geometry']['coordinates'][0]) - 1) if feat and feat.get('geometry') else 0}")
        bad += 0 if ok else 1
        entry = next((z for z in src if z.get("id") == zid), None)
        ok2 = bool(entry) and len(entry.get("polygon") or []) == len(RING) and entry.get("geom") == props["geom"]
        print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {zid} polygon={len(entry.get('polygon') or []) if entry else 0}")
        bad += 0 if ok2 else 1
    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(geo['features'])} batch={META_KEY in geo['metadata']}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for props in ZONES:
        zid = props["id"]
        ring = [[lng, lat] for lat, lng in RING]
        ring.append(ring[0])
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        if feat is None:
            print("[실패] geojson에 구역 없음:", zid)
            return 1
        old = dict(feat["properties"])
        feat["properties"] = {**old, **props, "id": zid}
        feat["geometry"] = {"type": "Polygon", "coordinates": [ring]}
        entry = next((z for z in src if z.get("id") == zid), None)
        if entry is None:
            print("[실패] seoul-zones에 구역 없음:", zid)
            return 1
        entry.update(props)
        entry["sid"] = props["sourceId"]
        entry["polygon"] = RING
        entry.pop("parts", None)
        print(f"[반영] {zid} — {len(RING)}정점, area={props['area']}, geom={props['geom']}")
        import math as _m
        from shapely.geometry import Polygon
        from shapely.ops import transform as _shp_transform
        from pyproj import Transformer
        p = Polygon([(lo, la) for la, lo in RING])
        try:
            _tr = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
            area = abs(_shp_transform(_tr.transform, p).area)
        except Exception:
            area = abs(p.area) * (111320 * _m.cos(_m.radians(p.centroid.y))) * 110950
        print(f"  계측 면적: {area:,.1f}㎡ (같은 도면 공고 25,321.8㎡ 대비 {(area/25321.816-1)*100:+.1f}%)")
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
