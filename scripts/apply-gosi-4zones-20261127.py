#!/usr/bin/env python3
"""리디브 — 2026-11-25~26 서울시 고시·공고 4개 구역 반영 (2026-11-27)

  1) 구로주공아파트 재건축       서울특별시고시 제2026-670호 (2026-11-26, 시보 제4196호 p.393)
     · 정비구역 지정·고시 — 119,243.2㎡, 최고 49층, 3,289세대, 추정비례율 105.46%
     · 사업유형: 신통기획(BZ101) → 재건축(공동) — 고시 사업명이 '구로주공아파트 재건축사업'이고
       현황 공동주택 2,126세대를 재건축하는 공동재건축이다(리디브 규칙: kind 재건축* → type 재건축).
     · 경계: 고시 【정비구역 결정도】를 브이월드 연속지적도 필지와 대조해 **필지 단위로 재조립**
       → 685-222 대(87,627㎡) + 685-223 대(25,892㎡) + 685-225 도(5,515㎡), 안쪽 685-213·214·215·216 은
       도면처럼 구멍(제외). 도형 119,033.7㎡ = 고시 119,243.2㎡ 대비 −0.18%.
  2) 중곡1동 A구역               서울특별시고시 제2026-673호 (2026-11-26, 시보 제4196호 p.447)
     · 정비구역 지정·고시 — 81,100.3㎡, 최고 35층, 2,200세대(분양 1,776·공공 424), 토지등소유자 613명
     · 경계: 고시 【정비구역 결정도】 붉은 점선을 필지선에 맞춰 옮김 — 도형 80,975.7㎡(−0.15%).
  3) 불광역세권(녹번동) 장기전세    서울특별시고시 제2026-643호 (2026-11-19, 시보 제4194호 p.119)
     · 정비구역 지정·고시 — 129,600.8㎡, 최고 45층, 4,092세대
     · 경계: 그동안 geometry null(점 표시)이던 것을 고시 【정비구역 결정도】의 붉은 점선을
       연속지적도와 대조(정합 오차 중앙값 2.4m)해 옮김 — 도형 129,664.7㎡(+0.05%).
  4) 방학동 641(방학1구역)         도봉구 공고 제2026-1607호 (2026-11-26)
     · 정비구역 지정(안) 공람 — 약 81,887㎡, 2,093세대, 토지등소유자 1,054명, 공람 2026-12-28까지
     · 공람 도면을 확보하지 못해 도형은 2025년 후보지 구역계(72,283㎡) 그대로 둔다.

실행: python3 scripts/apply-gosi-4zones-20261127.py [--check]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data"
AS_OF = "2026-11-27"
TR = Transformer.from_crs(4326, 5179, always_xy=True)
TRB = Transformer.from_crs(5179, 4326, always_xy=True)


def area_shape(ring5179, holes5179=()):
    g = Polygon(ring5179)
    if not g.is_valid:
        g = g.buffer(0)
    for h in holes5179:
        hp = Polygon(h)
        if hp.is_valid:
            g = g.difference(hp)
    return round(g.area, 1)


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


# ── 경계 자료 ────────────────────────────────────────────────────────────────
guro = load("gosi20261127-guro.json")          # {"ring5179": [...], "holes5179": [[...]]}
junggok = load("gosi20261127-junggok.json")     # {"ring": [[lat,lng],...]}
bulgwang = load("gosi20261127-bulgwang.json")   # {"ring": [[lat,lng],...]}

GURO_RING_5179 = [tuple(p) for p in guro["ring5179"]]
GURO_HOLES_5179 = [[tuple(p) for p in h] for h in guro["holes5179"]]
GURO_RING = [[round(lat, 7), round(lng, 7)] for lng, lat in (TRB.transform(x, y) for x, y in GURO_RING_5179)]
GURO_HOLES = [
    [[round(lat, 7), round(lng, 7)] for lng, lat in (TRB.transform(x, y) for x, y in h)] for h in GURO_HOLES_5179
]

ZONES = {
    "11000UQ120PS202505310014": {
        "name": "구로주공아파트 재건축",
        "alias": [
            "구로주공", "구로주공아파트", "구로주공아파트 재건축", "구로주공 재건축", "구로주공아파트재건축사업",
            "구로동 685-222", "구로동 685-222번지 일대", "구로동 685-223", "구로동 재건축", "구로 재건축",
            "구일역 재건축", "구로구 재건축", "구로주공 1·2단지",
        ],
        "type": "재건축",
        "kind": "재건축(공동)",
        "stage": "정비구역 지정·고시(2026-11-26)",
        "area": 119243,
        "areaShape": area_shape(GURO_RING_5179, GURO_HOLES_5179),
        "households": 3289,
        "geom": "고시도면",
        "boundaryApprox": False,
        "ring": GURO_RING,
        "holes": GURO_HOLES,
        "centerLabel": "구일역(1호선) 남측 — 구로동 685-222·685-223 일대 (안양천 동측)",
        "note": (
            "구로구 구로동 685-222번지 일대 구로주공아파트(1·2단지, 현황 2,126세대) 재건축사업이 "
            "2026-11-26 서울특별시고시 제2026-670호로 정비구역 지정·정비계획 결정 및 지구단위계획구역 결정, "
            "지형도면 고시가 났습니다. 정비구역 119,243.2㎡에 법적상한용적률 400% 이하·건폐율 30% 이하를 "
            "적용해 최고 49층, 3,289세대(분양 2,955·공공 334)와 부대복리시설을 짓습니다. 현황 2,126세대에서 "
            "1,163세대가 늘어나고, 추정비례율은 105.46%(총수입 3조6,632억·총사업비 1조9,785억·종전자산 "
            "1조5,974억)입니다. 사업시행은 재건축사업 관리처분 방식으로 (가칭)구로주공아파트 재건축사업 "
            "조합이 맡고, 정비구역 지정 고시일부터 4년 이내에 착수할 예정입니다. 토지이용계획은 획지1 "
            "공동주택 75,264.5㎡·획지2 26,229.3㎡와 정비기반시설 17,749.4㎡(어린이공원 9,867.0·도로 7,282.4·"
            "공공청사 600.0)입니다. 신속통합기획으로 추진돼 왔으나 이번 고시로 재건축 정비구역으로 확정됐습니다."
        ),
        "areaNote": (
            "고시(제2026-670호) 정비구역 면적 119,243.2㎡ — 획지 101,493.8㎡(획지1 75,264.5·획지2 26,229.3)와 "
            "정비기반시설 17,749.4㎡의 합입니다. 지도 도형은 고시 도면의 구역계를 연속지적도 필지로 다시 "
            "조립해 119,033.7㎡로 고시 면적의 99.82%입니다(도로·공원 부지 경계의 미세 차이)."
        ),
        "boundaryNote": (
            "2026-11-26 고시 【정비구역 결정도】의 구역계를 브이월드 연속지적도와 대조해 필지 단위로 다시 "
            "조립했습니다. 구역은 구로동 685-222 대(공동주택 부지, 87,627㎡)·685-223 대(26,892→25,892㎡)·"
            "685-225 도(도로, 5,515㎡)를 포함하고, 도면에 구역계 밖으로 표시된 685-213·685-214·685-215·"
            "685-216 은 구멍(제외)으로 비웠습니다. 고시 도면과 필지선 정합 오차는 중앙값 1.2m입니다."
        ),
        "sources": [
            {
                "label": "서울특별시고시 제2026-670호(2026-11-26) 「구로주공아파트 재건축사업 정비구역 지정 및 "
                         "정비계획 결정, 지구단위계획(구역) 결정·지형도면 고시」 — 서울시보 제4196호 392쪽",
                "url": "https://event.seoul.go.kr/snews/data/CN_MST/seoulsibo_20261126150006_98194.pdf#page=393",
            },
            {
                "label": "위클리한국주택경제신문 「구로주공아파트, 최고 49층 3,289세대로 재건축」(2026-11-26)",
                "url": "https://www.arunews.com/news/articleView.html?idxno=70055",
            },
            {
                "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 경계 — 리디브 /api/parcel 점 조회로 필지 합집합(2026-11-27)",
                "url": "https://www.vworld.kr/dtld/dbndDtlPage.do",
            },
        ],
    },
    "11000UQ120PS202505310011": {
        "name": "중곡1동 A구역",
        "alias": [
            "중곡1동 A구역", "중곡1동A구역", "중곡1동 A", "중곡동 254-15", "중곡1동 254-15",
            "중곡동 254-15번지 일대", "중곡1동 주택정비형 재개발", "중곡동 재개발", "중곡1동 재개발",
            "광진구 중곡동 재개발", "중곡1동A구역 주택정비형 재개발사업",
        ],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "정비구역 지정·고시(2026-11-26)",
        "area": 81100,
        "areaShape": None,  # 아래에서 ring 으로 계산
        "households": 2200,
        "geom": "고시도면",
        "boundaryApprox": False,
        "ring": [[round(p[0], 7), round(p[1], 7)] for p in junggok["ring"]],
        "holes": [],
        "centerLabel": "중랑천 서측·동일로 동측 — 중곡1동 254-15번지 일대 (긴고랑로 남측)",
        "note": (
            "광진구 중곡1동 254-15번지 일대(중곡1동 A구역) 주택정비형 재개발사업이 2026-11-26 서울특별시고시 "
            "제2026-673호로 정비계획 결정·정비구역 지정(81,100.3㎡)과 지구단위계획구역 결정, 지형도면 고시가 "
            "났습니다. 2026-09-28 도시계획위원회 신속통합기획 정비사업 등 수권분과위원회 수정가결 내용을 "
            "반영했고, 중곡동 저층주거지에서 처음 추진되는 재개발입니다. 제3종일반주거지역으로 용도지역을 "
            "올려(공동주택용지 66,192.6㎡) 최고 35층·2,200세대(분양 1,776·공공 424)를 짓고, 정비계획용적률 "
            "265.03%·법적상한용적률 299.54%를 적용합니다. 현황 1,027세대에서 1,173세대가 늘어나며 토지등소유자는 "
            "613명입니다. 동일로를 34m로 넓히고 긴고랑로·동일로66길·면목로를 정비하며, 어린이공원 6,724㎡와 "
            "공공복합청사 1,600㎡(중곡1동 주민센터 이전·사회복지시설), 공영주차장 2,890㎡(공원·청사 하부)를 "
            "갖춥니다. 추정비례율 104.18%, 사업시행은 조합 방식으로 정비계획 결정 후 4년 이내 착수 예정입니다."
        ),
        "areaNote": (
            "고시(제2026-673호) 정비구역 면적 81,100.3㎡ — 획지(공동주택) 66,192.6㎡ + 정비기반시설 14,907.7㎡"
            "(공원 6,724.0·도로 6,583.7·공공복합청사 1,600.0)입니다. 지도 도형은 고시 도면 구역계를 옮긴 것으로 "
            "80,975.7㎡(고시 대비 99.85%)입니다."
        ),
        "boundaryNote": (
            "2026-11-26 고시 【정비구역 결정도】의 붉은 점선 구역계를 도면 위에서 옮기고 필지선에 맞춰 "
            "다듬었습니다(도면 축척 0~150m 막대, 정합 오차 중앙값 1.9m). 구역계는 토지구획정리사업으로 조성된 "
            "블록의 외곽을 따라 직선으로 그어져 있어 필지 하나하나를 따르지는 않습니다."
        ),
        "sources": [
            {
                "label": "서울특별시고시 제2026-673호(2026-11-26) 「중곡1동 A구역 주택정비형 재개발사업 정비계획 결정 및 "
                         "정비구역 지정, 지구단위계획(구역) 결정 및 지형도면 고시」 — 서울시보 제4196호 446쪽",
                "url": "https://event.seoul.go.kr/snews/data/CN_MST/seoulsibo_20261126150006_98194.pdf#page=447",
            },
            {
                "label": "연합뉴스 「광진구 중곡1동 A구역 정비구역 지정…2천200세대로 재개발」(2026-11-26)",
                "url": "https://www.yna.co.kr/view/AKR20261126083300004",
            },
            {
                "label": "도시팩트 「중랑천변에 35층 2200가구…중곡1동 A구역, 정비구역 지정 '확정'」(2026-11-26)",
                "url": "https://cityfact.co.kr/news/275",
            },
        ],
    },
    "rest17gu-ep-녹번동-125-1-불광역세권-장기전세": {
        "name": "녹번동 125-1 (불광역세권 장기전세)",
        "type": "장기전세",
        "kind": "장기전세주택",
        "stage": "정비구역 지정·고시(2026-11-19)",
        "area": 129600.8,
        "households": 4092,
        "geom": "고시도면",
        "boundaryApprox": True,
        "ring": [[round(p[0], 7), round(p[1], 7)] for p in bulgwang["ring"]],
        "holes": [],
        "areaNote": (
            "고시(제2026-643호) 정비구역 면적 129,600.8㎡ — 정비기반시설 34,138.2㎡(도로 21,238.2·공원 "
            "12,900.0 문화공원) + 획지 95,462.6㎡(획지1 공동주택 92,621.6·획지2 1,030.0·획지3 694.0·획지4 "
            "1,117.0). 지도 도형은 고시 도면 구역계를 옮긴 것으로 129,664.7㎡(고시 대비 100.05%)입니다."
        ),
        "boundaryNote": (
            "2026-11-19 고시 【정비구역 결정도】(서울시보 제4194호 119쪽)의 붉은 점선 구역계를 옮겼습니다. "
            "도면에 축척 표기가 없어(S=NONE) 축척은 구역 면적 129,600.8㎡에서 역산하고, 위치는 브이월드 "
            "연속지적도 필지선과의 정합(오차 중앙값 2.4m, 2.16px/m 도면)으로 잡았습니다. 해상도가 낮아 경계 "
            "모서리는 ±3m 정도 차이가 날 수 있습니다. 고시 도면은 정비구역 지정 시 확정된 경계이지만 도형은 "
            "그 도면을 옮긴 근사 경계(점선 표시)입니다."
        ),
        "sources": [
            {
                "label": "서울특별시고시 제2026-643호(2026-11-19) 「불광역세권(녹번동) 장기전세주택 도시정비형 "
                         "재개발사업 정비구역 지정 및 정비계획 결정, 지구단위계획구역 지정·결정 및 지형도면 고시」 "
                         "— 서울시보 제4194호 112쪽 이하, 결정도 119쪽 (정비구역 129,600.8㎡)",
                "url": "https://event.seoul.go.kr/snews/data/CN_MST/seoulsibo_20261119142550_26254.pdf#page=120",
            },
        ],
    },
    "11320UQ120PS202608040001": {
        "name": "방학동 641 (방학1구역)",
        "alias": [
            "방학1구역", "방학동 641", "방학동 641번지 일대", "방학동641", "방학1",
            "도봉구 방학동 재개발", "방학동 주택정비형 재개발", "방학1구역 주택정비형 재개발사업",
        ],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "정비구역 지정(안) 공람(2026-11-26~12-28)",
        "area": 81887,
        "households": 2093,
        "geom": "UQ120",
        "areaNote": (
            "도봉구 공고 제2026-1607호(2026-11-26) 공람 공고문에 구역면적이 약 81,887㎡로 표기됩니다. 종전 "
            "리디브 데이터(2025년 후보지 구역계)는 73,274㎡로, 정비계획을 수립하면서 구역계가 약 8,600㎡ "
            "넓어진 것으로 보입니다. 공람 도면(구역계)을 확보하지 못해 지도 도형은 후보지 구역계(도형 계측 "
            "73,218㎡) 그대로이며, 정비구역 지정 고시 때 고시 도면으로 교체해야 합니다."
        ),
        "boundaryNote": (
            "2026-11-26 도봉구 공람 공고(제2026-1607호) 단계로, 공람 기간은 2026-12-28까지입니다. 지도 "
            "도형은 2025년 신속통합기획 후보지 구역계(72,283㎡, 도형 계측 73,218㎡)이고, 공람안 구역계"
            "(약 81,887㎡)는 아직 반영하지 못했습니다."
        ),
        "note": (
            "도봉구 방학동 641번지 일대(방학1구역) 주택정비형 재개발사업이 2026-11-26 도봉구 공고 제2026-1607호로 "
            "정비계획 결정 및 정비구역 지정(안) 공람에 들어갔습니다. 공람 기간은 2026-12-28까지이고, 공고문에는 "
            "구역면적 약 81,887㎡, 공동주택 2,093세대, 토지등소유자 1,054명(추정)으로 적혀 있습니다. 2025년 "
            "신속통합기획 후보지로 선정된 곳으로, 2026-07-28 신속통합기획이 확정되면서 방학동 638 일대와 함께 "
            "용도지역을 제2종(7층 이하)에서 제3종으로 올리고 최고 35층까지 높이를 완화하는 계획이 마련됐습니다"
            "(당시 계획은 641 일대 1,813세대). 방학동 638 일대(방학2구역)도 같은 날 공고 제2026-1609호로 함께 "
            "공람에 들어갔습니다."
        ),
        "sources": [
            {
                "label": "서울특별시 도봉구 공고 제2026-1607호(2026-11-26) 「방학동 641번지 일대(방학1구역) "
                         "주택정비형 재개발사업 정비계획 결정 및 정비구역 지정(안)에 대한 공람 공고」",
                "url": "https://jaegebal.com/gnotices/db-gg-2026-1607",
            },
            {
                "label": "서울시 보도자료 「방학동 638, 641 일대 신속통합기획 확정…동북4산을 품은 숲세권 단지로」(2026-07-28)",
                "url": "https://news.seoul.go.kr/citybuild/archives/541398",
            },
            {
                "label": "도봉구 「재개발정비사업 추진현황」 — 방학동 641 일대 대지면적 72,283㎡ (2026-07-24 기준)",
                "url": "https://www.dobong.go.kr/Contents.asp?code=10010114",
            },
        ],
    },
}


def ensure_ring(zid, z, src_by_id):
    """링 자료가 없는 구역(방학동 641)은 기존 원천 폴리곤을 그대로 쓴다"""
    if z.get("ring"):
        return z
    old = src_by_id.get(zid) or {}
    poly = old.get("polygon")
    if not poly:
        raise SystemExit(f"{zid}: 폴리곤이 없습니다")
    z["ring"] = [[round(p[0], 7), round(p[1], 7)] for p in poly]
    z["holes"] = [[[round(p[0], 7), round(p[1], 7)] for p in h] for h in (old.get("holes") or [])]
    return z


def _ring_latlng(zone):
    ring = [[round(p[0], 7), round(p[1], 7)] for p in zone["ring"]]
    if ring[0] != ring[-1]:
        ring.append(ring[0][:])
    return ring


def _holes(zone):
    out = []
    for h in zone.get("holes") or []:
        hh = [[round(p[0], 7), round(p[1], 7)] for p in h]
        if hh[0] != hh[-1]:
            hh.append(hh[0][:])
        out.append(hh)
    return out


def _area_shape(zone):
    ring = [TR.transform(lng, lat) for lat, lng in zone["ring"]]
    holes = [[TR.transform(lng, lat) for lat, lng in h] for h in (zone.get("holes") or [])]
    return area_shape(ring, holes)


def props_of(zone, zid):
    p = {
        "id": zid,
        "name": zone["name"],
        "type": zone["type"],
        "kind": zone["kind"],
        "stage": zone["stage"],
        "gu": GU[zid],
        "area": zone["area"],
        "featured": False,
        "sourceId": zid,
        "geom": zone["geom"],
        "asOf": AS_OF,
    }
    if zone.get("alias"):
        p["alias"] = zone["alias"]
    if zone.get("areaShape"):
        p["areaShape"] = zone["areaShape"]
    if zone.get("households"):
        p["households"] = zone["households"]
    if zone.get("boundaryApprox"):
        p["boundaryApprox"] = True
    for k in ("centerLabel", "note", "areaNote", "boundaryNote", "sources"):
        if zone.get(k):
            p[k] = zone[k]
    return p


GU = {
    "11000UQ120PS202505310014": "구로구",
    "11000UQ120PS202505310011": "광진구",
    "rest17gu-ep-녹번동-125-1-불광역세권-장기전세": "은평구",
    "11320UQ120PS202608040001": "도봉구",
}


def feature_of(zone, zid):
    ring = _ring_latlng(zone)
    holes = _holes(zone)
    coords = [[[round(lng, 7), round(lat, 7)] for lat, lng in ring]]
    for h in holes:
        coords.append([[round(lng, 7), round(lat, 7)] for lat, lng in h])
    return {
        "type": "Feature",
        "id": zid,
        "properties": props_of(zone, zid),
        "geometry": {"type": "Polygon", "coordinates": coords},
    }


def center_of(zone):
    g = Polygon([TR.transform(lng, lat) for lat, lng in zone["ring"]])
    if not g.is_valid:
        g = g.buffer(0)
    c = g.representative_point()
    return [round(v, 7) for v in TRB.transform(c.x, c.y)[::-1]]  # [lat,lng]


def entry_of(zone, zid, old):
    ring = [[round(p[0], 7), round(p[1], 7)] for p in zone["ring"]]
    entry = dict(old or {})
    entry.update(
        {
            "id": zid,
            "name": zone["name"],
            "type": zone["type"],
            "kind": zone["kind"],
            "stage": zone["stage"],
            "gu": GU[zid],
            "area": zone["area"],
            "featured": False,
            "geom": zone["geom"],
            "asOf": AS_OF,
            "polygon": ring,
            "sid": zid,
        }
    )
    if zone.get("alias"):
        entry["alias"] = zone["alias"]
    if zone.get("areaShape"):
        entry["areaShape"] = zone["areaShape"]
    else:
        entry.pop("areaShape", None)
    if zone.get("households"):
        entry["households"] = zone["households"]
    if zone.get("boundaryApprox"):
        entry["boundaryApprox"] = True
    else:
        entry.pop("boundaryApprox", None)
    for k in ("centerLabel", "note", "areaNote", "boundaryNote", "sources"):
        if zone.get(k):
            entry[k] = zone[k]
    if zone.get("holes"):
        entry["holes"] = [[[round(p[0], 7), round(p[1], 7)] for p in h] for h in zone["holes"]]
    else:
        entry.pop("holes", None)
    entry["center"] = center_of(zone)
    entry.pop("nameNote", None)
    return entry


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    src = {z["id"]: z for z in json.loads(SOURCE.read_text(encoding="utf-8"))}
    for zid, z in ZONES.items():
        ensure_ring(zid, z, src)
    idx = {r["id"]: r for r in json.loads((ROOT / "public/data/zone-index.json").read_text(encoding="utf-8"))["zones"]}
    for zid, z in ZONES.items():
        f = feats.get(zid)
        s = src.get(zid)
        ok_f = bool(f) and f["geometry"]["type"] == "Polygon"
        ok_s = bool(s) and s.get("stage") == z["stage"] and s.get("area") == z["area"]
        measured = area_shape(
            [TR.transform(lng, lat) for lat, lng in z["ring"]],
            [[TR.transform(lng, lat) for lat, lng in h] for h in (z.get("holes") or [])],
        )
        gap = (measured / z["area"] - 1) * 100
        print(f"[{'OK' if ok_f and ok_s else 'FAIL'}] {zid} {z['name']}")
        print(f"     단계 {s.get('stage') if s else None} · 면적 {s.get('area') if s else None} · 세대 {s.get('households') if s else None}")
        print(f"     도형 {measured:,.1f}㎡ ({gap:+.2f}%) · 정점 {len(z['ring'])} · 구멍 {len(z.get('holes') or [])} · 인덱스 {zid in idx}")
        bad += 0 if (ok_f and ok_s) else 1
        if abs(gap) > 1.5 and zid != "11320UQ120PS202608040001":
            print("     [WARN] 도형 면적이 고시 면적과 1.5% 넘게 차이")
            bad += 1
    return bad


def apply() -> int:
    src0 = {z["id"]: z for z in json.loads(SOURCE.read_text(encoding="utf-8"))}
    # areaShape 계산 (방학동 641은 기존 폴리곤 기준)
    for zid, z in ZONES.items():
        ensure_ring(zid, z, src0)
        if not z.get("areaShape"):
            z["areaShape"] = _area_shape(z)

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    for zid, z in ZONES.items():
        feat = feature_of(z, zid)
        cur = next((f for f in feats if f["properties"].get("id") == zid), None)
        if cur is None:
            feats.append(feat)
            print(f"[geojson] 추가 {zid}")
        else:
            old_geom = cur.get("geometry")
            cur["properties"] = feat["properties"]
            cur["geometry"] = feat["geometry"]
            print(f"[geojson] 갱신 {zid} (geom {old_geom and old_geom.get('type')} → Polygon)")
    geo.setdefault("metadata", {})["gosi4zones20261127"] = {
        "asOf": AS_OF,
        "note": (
            "2026-11-25~26 고시·공고 4개 구역 반영 — 구로주공아파트 재건축(고시 제2026-670호, 정비구역 지정·"
            "3,289세대·재건축 유형 정정·필지정합 경계), 중곡1동 A구역(고시 제2026-673호, 정비구역 지정·"
            "2,200세대·고시 도면 경계), 불광역세권(녹번동) 장기전세(고시 제2026-643호, 점 표시 → 고시 도면 "
            "구역계 129,600.8㎡), 방학동 641(도봉구 공고 제2026-1607호, 정비구역 지정(안) 공람·2,093세대)."
        ),
    }
    geo["metadata"]["count"] = len(feats)
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] features={len(feats)}")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in src}
    for zid, z in ZONES.items():
        old = by_id.get(zid)
        entry = entry_of(z, zid, old)
        if old is None:
            src.append(entry)
        else:
            old.clear()
            old.update(entry)
        print(f"[seoul-zones] 갱신 {zid} · 면적 {entry['area']} · 단계 {entry['stage']}")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] zones={len(src)}")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta["gosi4zones20261127"] = {
        "asOf": AS_OF,
        "note": (
            "구로주공아파트 재건축·중곡1동 A구역·불광역세권(녹번동) 장기전세·방학동 641(방학1구역) — "
            "2026-11-25~26 서울시 고시·도봉구 공고 반영(면적·단계·세대수·경계)."
        ),
    }
    meta["count"] = len(feats)
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[meta] count={meta['count']}")

    r = subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    return 0 if r.returncode == 0 else 1


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(1 if check() else 0)
    apply()
    sys.exit(1 if check() else 0)
