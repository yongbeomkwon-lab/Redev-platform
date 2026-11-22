#!/usr/bin/env python3
"""
리디브 미고시 1차 4곳 보강 — 2026-11-22
 · 아현1구역(마포)  : 서울시보 제4152호 고시 제2026-304호(2026-05-28) 정비구역 지정·지형도면.
                       단계 선정구역 → 정비구역지정(2026-05-28), 유형 일반재개발 → 공공재개발,
                       면적 105,609.2 → 106,012.9(고시), 도면 구역계 92정점.
 · 응암동 101번지(은평) : 서울시보 제4136호 고시 제2026-157호(2026-03-26) 정비구역 지정·지형도면.
                       단계(사업시행자 지정)는 그대로, 고시 출처·도면 구역계 15정점.
 · 불광역세권(녹번동)(은평) : 서울시보 제4194호 고시 제2026-643호(2026-11-19) 정비구역 지정·지형도면.
                       단계 추진위원회 승인 → 정비구역 지정·고시(2026-11-19), 면적 0 → 129,600.8.
                       도면(지적도)은 축척란 "S=NONE"에 축척 막대와 구역 면적이 서로 맞지 않아
                       도로망 정합을 확정하지 못해 폴리곤은 넣지 않았다(geom 고시미반영).

도면 구역계 추출 방법(공통)
 · 서울시보 PDF의 【정비구역 결정도】 지적도에서 붉은 일점쇄선을 색으로 분리하고,
   점선 조각들의 중심을 대략 윤곽선 방향으로 정렬해 닫힌 고리로 이었다(굵기·닫기 커널 오차 없음).
 · 위치는 도면의 지번 라벨 ↔ 카카오 지번 좌표(리디브 앱 지오코더로 조회) 최소제곱 정합:
     - 아현1: 34개 지번 중 24개 채택, 배율 7.843px/m, 회전 -0.02°, RMS 2.6m
     - 응암동: 17개 지번 중 10개 채택, 배율 4.835px/m, 회전 -2.07°, RMS 3.2m
 · 계측 면적: 아현1 107,128㎡(고시 106,012.9의 +1.05%), 응암동 39,221㎡(고시 38,758의 +1.2%).

실행: python3 scripts/apply-migosi-1st-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
DATA = ROOT / "scripts" / "data" / "migosi-1st-batch-20261122.json"
META_KEY = "migosi1stBatch20261122"

B = json.loads(DATA.read_text(encoding="utf-8"))["zones"]
AH = B["ahyeon-1"]                      # ring: [[lon,lat],...]
EU = B["rest17gu-ep-응암동-101번지"]

SRC_AH = {
    "label": "서울시보 제4152호(2026-05-28) 서울특별시고시 제2026-304호 — 아현1구역 주택정비형 공공재개발사업 정비계획 결정 및 정비구역 지정, 지구단위계획(구역) 결정 및 지형도면 고시 (정비구역 106,012.9㎡)",
    "url": "https://www.seoul.go.kr/func/snews/data/CN_MST/seoulsibo_20260528103443_57221.pdf",
}
SRC_EU = {
    "label": "서울시보 제4136호(2026-03-26) 서울특별시고시 제2026-157호 — 응암동 101번지 일대 주택정비형 공공재개발사업 정비구역 지정 및 정비계획 결정·지구단위계획(구역) 결정 및 지형도면 고시 (정비구역 38,758㎡)",
    "url": "https://www.seoul.go.kr/func/snews/data/CN_MST/seoulsibo_20260325161105_54413.pdf",
}
SRC_BG = {
    "label": "서울시보 제4194호(2026-11-19) 서울특별시고시 제2026-643호 — 불광역세권(녹번동) 장기전세주택 도시정비형 재개발사업 정비구역 지정 및 정비계획 결정, 지구단위계획구역 지정·결정 및 지형도면 고시 (정비구역 129,600.8㎡)",
    "url": "https://event.seoul.go.kr/snews/data/CN_MST/seoulsibo_20261119142550_26254.pdf",
}

ZONES = [
    {
        "id": "ahyeon-1",
        "name": "아현1구역",
        "alias": [
            "아현1", "아현동 699", "아현동 699 일대", "아현동 699번지 일대", "아현1구역 공공재개발",
            "마포 아현1", "마포구 아현1구역", "아현1 주택정비형 공공재개발", "아현동 699번지",
        ],
        "type": "공공재개발",
        "kind": "공공재개발",
        "stage": "정비구역지정(2026-05-28)",
        "gu": "마포구",
        "area": 106012.9,
        "featured": False,
        "geom": "고시도면",
        "boundaryApprox": False,
        "sourceId": "서울시보 제4152호 고시 제2026-304호(2026-05-28) 정비구역 결정도(지형도면)",
        "centerLabel": "고시 지형도면 구역계 중심",
        "center": AH["center"],
        "asOf": "2026-11-22",
        "note": (
            "아현동 699번지 일대 주택정비형 공공재개발사업입니다. 2026-03-19 서울시 도시계획위원회 수권분과위원회 "
            "심의(수정가결)를 거쳐, 2026-05-28 서울시보 제4152호 서울특별시고시 제2026-304호로 정비계획 결정·"
            "정비구역 지정·지구단위계획(구역) 결정 및 지형도면 고시가 났습니다. 정비구역 면적은 106,012.9㎡이고 "
            "획지1(공동주택) 22,553.0㎡·획지2 57,303.0㎡, 정비기반시설 26,156.9㎡(도로 11,055.8·보행자전용도로 370.0·"
            "공원 10,574.2·녹지 333.1·공공공지 131.6·사회복지시설 3,692.2㎡)입니다. 용도지역은 제2종일반주거지역"
            "(7층 이하) 94,545.8㎡가 전부 제2종일반주거지역으로 1단계 종상향되고, 제3종일반주거지역 7,350.8㎡·"
            "준주거지역 1,623.4㎡가 감소합니다. 고시 비례율 산출 기준으로 분양주택 2,780세대(토지등소유자)·"
            "재개발의무 공공임대 465세대·국민주택규모주택 231세대가 계획돼 있습니다. 지도 경계는 이 고시 "
            "【정비구역 결정도】의 붉은 일점쇄선을 옮긴 것이며, 지형도면 확정 도면이므로 추정 경계가 아닙니다."
        ),
        "areaNote": (
            "고시(제2026-304호) 정비구역 면적 106,012.9㎡. 종전 데이터(105,609.2㎡)는 정보몽땅 사업개요 값으로 "
            "고시 표기와 403.7㎡ 차이가 있어 고시 값으로 정정했습니다. 도면 구역계를 옮긴 다각형의 계측 면적은 "
            "107,128㎡로 고시 면적 대비 +1.05%입니다."
        ),
        "boundaryNote": (
            "서울시보 제4152호 418~457쪽 【정비구역 결정도(신설)】의 지적도에 그려진 붉은 일점쇄선 구역계를 "
            "옮겼습니다. 점선 조각 160개의 중심을 윤곽선 방향으로 정렬해 닫힌 고리로 잇고 1.5m 단순화해 "
            "92정점 다각형으로 만들었습니다. 위치(정합)는 도면의 지번 라벨(699·698·693~696·701~704·706·717·745·751 등) "
            "34개를 카카오 지번 좌표와 최소제곱으로 맞춰 잡았고, 24개가 채택되며 배율 7.843px/m(축척 막대 "
            "200m=1,580px의 7.92px/m와 1% 이내)·회전 -0.02°·RMS 2.6m입니다. 경계는 손기정로·손기정로2길·"
            "마포대로24길·마포대로26길을 따라가며, 아현동 699·706·717·745·751은 내부, 802·799·800·386-1"
            "(마포래미안푸르지오·임야)은 외부로 나옵니다."
        ),
        "sources": [SRC_AH],
    },
    {
        "id": "rest17gu-ep-응암동-101번지",
        "name": "응암동 101번지",
        "alias": [
            "은평구 응암동 101번지 일대", "응암동 101번지", "응암동 101", "응암동 101번지 공공재개발",
            "은평 응암동 101번지", "응암동 101번지 일대 공공재개발사업",
        ],
        "type": "공공재개발",
        "kind": "공공재개발",
        "stage": "사업시행자 지정(2026-05-21, SH)",
        "gu": "은평구",
        "area": 38758,
        "featured": False,
        "geom": "고시도면",
        "boundaryApprox": False,
        "sourceId": "서울시보 제4136호 고시 제2026-157호(2026-03-26) 정비구역 결정도(지형도면)",
        "centerLabel": "고시 지형도면 구역계 중심",
        "center": EU["center"],
        "asOf": "2026-11-22",
        "note": (
            "은평구 응암동 101번지 일대 주택정비형 공공재개발사업입니다. 2025-12-08 서울시 도시계획위원회 "
            "수권분과위원회 심의(수정가결)를 거쳐 2026-03-26 서울시보 제4136호 서울특별시고시 제2026-157호로 "
            "정비구역 지정·정비계획 결정·지구단위계획(구역) 결정 및 지형도면 고시가 났고, 2026-05-21 은평구 "
            "고시 제2026-47호로 SH가 사업시행자로 지정됐습니다. 정비구역 면적 38,758㎡ 중 획지 33,445㎡"
            "(공동주택·부대복리시설), 정비기반시설 5,313㎡(도로)이며, 용도지역은 제2종일반주거지역(7층 이하) "
            "38,758㎡ 전부가 제2종일반주거지역으로 1단계 종상향(용적률 300% 이하)됩니다. 계획 999세대·최고 33층."
            " 지도 경계는 이 고시 【정비구역 결정도】의 붉은 점선을 옮긴 것입니다."
        ),
        "areaNote": (
            "고시(제2026-157호) 정비구역 면적 38,758㎡. 도면 구역계를 옮긴 다각형의 계측 면적은 39,221㎡로 "
            "고시 면적 대비 +1.2%입니다."
        ),
        "boundaryNote": (
            "서울시보 제4136호 134쪽 【정비구역 결정도(신설)】의 지적도에 그려진 붉은 점선 구역계를 옮겼습니다. "
            "점선 조각 62개의 중심을 윤곽선 방향으로 정렬해 닫힌 고리를 만들고 1.0m 단순화해 15정점 다각형으로 "
            "만들었습니다. 위치는 도면의 지번 라벨(101-1·101-9·102-7·102-17·102-18·102-22·102-26·102-27·99-45·100-54 등) "
            "17개를 카카오 지번 좌표와 최소제곱으로 맞춰 잡았고(10개 채택, 배율 4.835px/m·회전 -2.07°·RMS 3.2m), "
            "경계는 응암로34길·은평로 일대 도로를 따라갑니다."
        ),
        "sources": [SRC_EU],
    },
    {
        "id": "rest17gu-ep-녹번동-125-1-불광역세권-장기전세",
        "name": "녹번동 125-1 (불광역세권 장기전세)",
        "alias": [
            "녹번동 125-1 (불광역세권 장기전세)", "은평구 녹번동 125-1번지", "불광역세권(녹번동)",
            "불광역세권", "불광역세권 녹번동", "녹번동 125-1", "불광역세권 장기전세주택",
        ],
        "type": "장기전세",
        "kind": "장기전세주택",
        "stage": "정비구역 지정·고시(2026-11-19)",
        "gu": "은평구",
        "area": 129600.8,
        "featured": False,
        "geom": "고시미반영",
        "center": [37.607258, 126.928296],
        "asOf": "2026-11-22",
        "note": (
            "은평구 녹번동 125-1번지 일원 불광역세권(녹번동) 장기전세주택 도시정비형 재개발사업입니다. "
            "2026-08-19 제13차 서울시 도시계획위원회 심의(수정가결)를 거쳐 2026-11-19 서울시보 제4194호 "
            "서울특별시고시 제2026-643호로 정비구역 지정·정비계획 결정·지구단위계획구역 지정 및 지형도면 "
            "고시가 났습니다(종전 정보몽땅 등록명과 같은 사업). 정비구역 면적 129,600.8㎡이며 정비기반시설 "
            "34,138.2㎡(도로 21,238.2·공원 12,900.0 문화공원)·획지 95,462.6㎡(획지1 공동주택 92,621.6㎡)입니다. "
            "용도지역은 제3종일반주거지역 19,757.3㎡·준주거지역 59,914.8㎡·제3종일반주거지역 13,949.5㎡가 "
            "새로 정해지고 제2종일반주거지역(7층 이하) 78,672.1㎡가 줄어듭니다."
        ),
        "areaNote": (
            "고시(제2026-643호) 정비구역 면적 129,600.8㎡ (종전 데이터는 면적 0·미확인이었음). "
            "정비기반시설 34,138.2㎡ + 획지 95,462.6㎡."
        ),
        "boundaryNote": (
            "고시 119쪽 【정비구역 결정도】의 지적도에 붉은 점선 구역계가 있으나 지도에 축척이 적혀 있지 않고"
            "(축척란 S=NONE) 축척 막대에서 읽은 배율(약 3.9px/m)과 구역 면적 129,600.8㎡로 계산한 배율"
            "(약 2.1px/m)이 1.9배 어긋나 도면 자체가 축척대로 그려지지 않은 것으로 보입니다. 도로망에 맞춰 "
            "위치를 찾아봤지만 점수가 평탄해(경계-도로 평균거리 6~10m 구간이 넓게 분포) 확정할 수 없어 "
            "경계 도형은 반영하지 않았습니다. 지도에는 대표 지번(녹번동 125-1) 위치만 표시합니다."
        ),
        "sources": [SRC_BG],
    },
]

META = {
    "asOf": "2026-11-22",
    "zones": 2,
    "note": (
        "서울시보 고시 지형도면에서 구역계를 옮겨 반영한 1차 2곳(아현1구역·응암동 101번지)과 "
        "고시로 단계·면적만 갱신한 1곳(불광역세권)을 담았다. 아현1구역은 도면 정합 RMS 2.6m·계측면적 +1.05%, "
        "응암동 101번지는 RMS 3.2m·계측면적 +1.2%다."
    ),
}


def _apply_props(props: dict, ring_lonlat: list | None) -> dict:
    """seoul-zones 엔트리·geojson 피처에 공통으로 넣을 값."""
    p = {k: v for k, v in props.items() if k not in ("sources",)}
    p["sources"] = props.get("sources") or []
    if ring_lonlat:
        p["polygon"] = [[lat, lon] for lon, lat in ring_lonlat]
    return p


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for props in ZONES:
        zid = props["id"]
        ring = AH["ring"] if zid == "ahyeon-1" else EU["ring"] if zid.startswith("rest17gu-ep-응암동") else None
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        if feat is None:
            print(f"[FAIL] geojson에 없음 {zid}")
            bad += 1
            continue
        pr = feat["properties"]
        ok = pr.get("stage") == props["stage"] and abs((pr.get("area") or 0) - props["area"]) < 0.01 \
            and pr.get("geom") == props["geom"]
        n = len(feat["geometry"]["coordinates"][0]) - 1 if feat.get("geometry") else 0
        if ring:
            ok = ok and feat["geometry"]["type"] == "Polygon" and n == len(ring)
        print(f"[{'OK' if ok else 'FAIL'}] {zid}: stage={pr.get('stage')} area={pr.get('area')} "
              f"geom={pr.get('geom')} rings={n}")
        bad += 0 if ok else 1
        e = next((z for z in src if z.get("id") == zid), None)
        ok2 = bool(e) and e.get("stage") == props["stage"] and e.get("geom") == props["geom"]
        if ring:
            ok2 = ok2 and len(e.get("polygon") or []) == len(ring)
        print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {zid}: polygon={len((e or {}).get('polygon') or [])}")
        bad += 0 if ok2 else 1
    print(f"[{'OK' if META_KEY in geo['metadata'] else 'FAIL'}] metadata {META_KEY}")
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for props in ZONES:
        zid = props["id"]
        ring = AH["ring"] if zid == "ahyeon-1" else EU["ring"] if zid.startswith("rest17gu-ep-응암동") else None
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        entry = next((z for z in src if z.get("id") == zid), None)
        if feat is None or entry is None:
            print("[실패] 없는 구역:", zid)
            return 1
        newp = _apply_props(props, ring)
        old = dict(feat["properties"])
        # 기존 alias 유지 + 새 alias 추가
        alias = list(dict.fromkeys((old.get("alias") or []) + (newp.get("alias") or [])))
        merged = {**old, **newp, "alias": alias}
        merged.pop("boundaryApprox", None)
        if props.get("boundaryApprox") is not None:
            merged["boundaryApprox"] = props["boundaryApprox"]
        if ring is None:
            merged.pop("polygon", None)
        feat["properties"] = merged
        if ring:
            ring_geo = [[lon, lat] for lon, lat in ring]
            ring_geo.append(ring_geo[0])
            feat["geometry"] = {"type": "Polygon", "coordinates": [ring_geo]}
        entry.update(newp)
        entry["alias"] = alias
        entry["sid"] = props.get("sourceId") or entry.get("sid")
        entry["sourceId"] = props.get("sourceId") or entry.get("sourceId")
        print(f"[반영] {zid} — {len(ring) if ring else 0}정점, area={props['area']}, geom={props['geom']}")
        if ring:
            from pyproj import Transformer
            from shapely.geometry import Polygon
            from shapely.ops import transform as shp

            tr = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
            poly = Polygon([(lon, lat) for lon, lat in ring])
            a = abs(shp(lambda x, y, z=None: tr.transform(x, y), poly).area)
            print(f"   계측 면적 {a:,.0f}㎡ (고시 {props['area']:,.1f}의 {a/props['area']*100-100:+.2f}%)")
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
