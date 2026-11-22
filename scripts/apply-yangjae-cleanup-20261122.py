#!/usr/bin/env python3
"""
2026-11-22 양재2동(서초구) 구역계 정밀 보강 — 양재동 360·370 모아타운, 양재2동 2구역(도공복)

## 왜 (사용자 지적: "양재2동 겹침 정리")
  · `yangjae-360`(양재동 360 모아타운)·`yangjae-370`(양재동 370 모아타운)은 2026-11-18 추가 반영 때
    구역계 도면이 없어 **대표 지번 중심 근사원**(점선원)으로만 놓여 있었다.
  · `yangjae2-2`(양재2동 2구역, 도심공공주택복합 추진준비)도 넓은 근사원이라 옆의
    `양재동 374`(UQ120) 위를 크게 덮고 있었다.

## 무엇을 근거로
  ① 360·370 — **서초구 공고 도면**으로 확정.
     · 서초구청 공지사항 「양재2동 370번지 및 360번지 일대 주민제안 모아타운 신청 주민의견 사전조사
       결과 안내」(2026-01-21, 재건축사업과) 붙임 PDF
       `(홈페이지_게시)양재2동_모아타운_주민의견_조사_결과_최종(260116).pdf`
       — 사업개요 표 + A1/B1/B2 구역계를 빨간 점선으로 얹은 지적도.
     · 표 값: A1(양재동 370 일대) 14,968.7㎡(국공유지 제외 8,520.6), B1 12,857.4㎡, B2 12,527.2㎡,
       양재동 360 일대 합계 30,425.7㎡(국공유지 제외 25,384.6). 응답률 83.3%(678명 중 565명).
     · 도면의 빨간 점선을 지적도에 맞춰 옮기고(정합 오차 약 1~2m), 브이월드 연속지적도
       (LP_PA_CBND_BUBUN) 필지선에 붙여 다각형으로 만들었다.
       → 370: 29정점 15,230㎡(민간 대지 8,512㎡ — 공고 8,520.6과 0.1% 차)
       → 360: 43정점 30,699㎡(공고 30,425.7과 0.9% 차)
  ② 양재2동 2구역 — **가상경계**(공식 구역계 없음).
     · 양재동 335·345번지 일대. 매헌초등학교(양재동 311-1, 127.0421/37.4713) 동쪽에서
       양재동 374 서쪽 도로 사이 블록(연속지적도 필지 331~348번지 일대).
     · 필지 합집합(43,284㎡)의 안쪽 도로를 8m 모서리로 이어 붙여 40정점 56,162㎡(약 16,988평).
       민간 정리값 17,247평(56,990㎡)과 1.5% 차.

## 겹침
  · 360·370 은 서로 겹침 0㎡, 2구역과도 겹침 0㎡, 2구역은 양재동 374와 겹침 0㎡.
  · ⚠️ 저장된 `양재동 374`(UQ120)·`양재동 382`(UQ120)는 **2025-08-28 서울시 고시 제2025-476호에서
    축소되기 전(기정) 범위**다(374 65,070→45,953.2㎡, 382 74,515→36,683.1㎡). 그래서 360·370
    블록을 통째로 품고 있다(370은 374 안에 100%, 360은 382 안에 99.4%). 이 스크립트는 그 둘을
    건드리지 않는다 — `--trim-parents` 를 주면 새 블록만큼 차집합해 겹침을 0으로 만든다(기본 꺼짐).

실행: python3 scripts/apply-yangjae-cleanup-20261122.py [--check] [--trim-parents]   (멱등)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "yangjaeCleanup20261122"

TRIM_PARENTS = "--trim-parents" in sys.argv
TRIM_BUFFER_M = 0.3


# ── 좌표 (서초구 공고 도면 → 연속지적도 필지선) ───────────────────────────────

RING_360 = [
    [37.4689784, 127.044993], [37.4689333, 127.0449904], [37.4689778, 127.0449971], [37.4690302, 127.0451182],
    [37.4690575, 127.0451232], [37.4690678, 127.0451114], [37.4696952, 127.0456702], [37.4696584, 127.0456799],
    [37.4695759, 127.0458071], [37.4695794, 127.0458119], [37.4695188, 127.0458809], [37.4695188, 127.0459553],
    [37.4695886, 127.0460874], [37.4694839, 127.046196], [37.4694852, 127.0462861], [37.4694957, 127.0462741],
    [37.4696322, 127.0464619], [37.4693792, 127.0467702], [37.4693466, 127.0467702], [37.4693435, 127.0467738],
    [37.4691872, 127.0470015], [37.4691436, 127.0470015], [37.4690738, 127.0471337], [37.4690532, 127.0471027],
    [37.4690496, 127.0471068], [37.4675558, 127.0450632], [37.4675558, 127.0450081], [37.4674511, 127.0449641],
    [37.4674565, 127.0449082], [37.4675296, 127.044898], [37.4675819, 127.0447879], [37.4676466, 127.0447343],
    [37.4676608, 127.0447539], [37.4676674, 127.0446923], [37.467739, 127.0446667], [37.4677429, 127.0446369],
    [37.4678279, 127.0447544], [37.4677308, 127.0446201], [37.4681885, 127.0440987], [37.4683352, 127.0443363],
    [37.4683759, 127.0443693], [37.4684457, 127.0443693], [37.4684915, 127.0443211],
]

RING_370 = [
    [37.4701102, 127.0440567], [37.470557, 127.0435764], [37.4706727, 127.0437526], [37.4707489, 127.0438077],
    [37.4707489, 127.0438576], [37.4708013, 127.0438848], [37.4708362, 127.0439778], [37.4710979, 127.0443253],
    [37.4712154, 127.0443089], [37.4712978, 127.0445175], [37.4712696, 127.0446106], [37.471473, 127.0452174],
    [37.4711153, 127.0454156], [37.4710194, 127.0454376], [37.4709321, 127.0453936], [37.4709234, 127.0453605],
    [37.470871, 127.0453605], [37.4707925, 127.0452945], [37.4706704, 127.0452614], [37.4706617, 127.0452284],
    [37.4704959, 127.0451733], [37.4701465, 127.0446644], [37.470112, 127.0446557], [37.4700597, 127.0445235],
    [37.4700161, 127.0445125], [37.4699724, 127.0444024], [37.4698939, 127.0443253], [37.4700073, 127.0441821],
    [37.4700597, 127.0441711],
]

RING_YJ22 = [
    [37.4696803, 127.0415556], [37.4707203, 127.0430716], [37.4707149, 127.0431817], [37.4695661, 127.0444935],
    [37.4694782, 127.044372], [37.4693881, 127.0444746], [37.469273, 127.0443154], [37.469163, 127.0444408],
    [37.4690828, 127.0443302], [37.4690362, 127.0443833], [37.4689327, 127.0443329], [37.468883, 127.0442643],
    [37.4688479, 127.0443044], [37.4687072, 127.0442788], [37.4685828, 127.044279], [37.4685737, 127.0442665],
    [37.4685776, 127.0441622], [37.4684945, 127.0441571], [37.4683765, 127.0439943], [37.4683805, 127.04389],
    [37.4682972, 127.0438849], [37.4681799, 127.0437229], [37.4681838, 127.0436186], [37.4681007, 127.0436135],
    [37.467955, 127.0434124], [37.4680585, 127.0432945], [37.4678608, 127.0432825], [37.4676982, 127.0430579],
    [37.4677021, 127.0429536], [37.4676189, 127.0429486], [37.4675403, 127.0428401], [37.4676404, 127.042726],
    [37.4675403, 127.0425878], [37.467907, 127.0421696], [37.467952, 127.0421723], [37.468167, 127.0424692],
    [37.4690365, 127.0414776], [37.4690815, 127.0414812], [37.4693274, 127.0418399], [37.4695904, 127.0415487],
]


# ── 기하 유틸 ────────────────────────────────────────────────────────────────
def _proj():
    from pyproj import Transformer

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    inv = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True).transform
    return fwd, inv


def _poly(ring_lat_lng):
    from shapely.geometry import Polygon

    return Polygon([(lng, lat) for lat, lng in ring_lat_lng])


def _m2(ring_lat_lng) -> float:
    """면적(㎡, EPSG:5179)."""
    from shapely.ops import transform

    fwd, _ = _proj()
    return transform(lambda x, y, z=None: fwd(x, y), _poly(ring_lat_lng)).area


def _overlap(a_ring, b_ring) -> float:
    from shapely.ops import transform

    fwd, _ = _proj()
    a = transform(lambda x, y, z=None: fwd(x, y), _poly(a_ring))
    b = transform(lambda x, y, z=None: fwd(x, y), _poly(b_ring))
    return a.intersection(b).area


def _zone_ring(zid: str):
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
    if feat is None or not (feat.get("geometry") or {}).get("coordinates"):
        return None
    return [[round(c[1], 7), round(c[0], 7)] for c in feat["geometry"]["coordinates"][0][:-1]]


def _trim(ring, cut_rings):
    """ring 에서 cut_rings 를 차집합(버퍼 0.3m) — 겹침 항상 0."""
    from shapely.ops import transform

    fwd, inv = _proj()
    a = transform(lambda x, y, z=None: fwd(x, y), _poly(ring))
    for c in cut_rings:
        cm = transform(lambda x, y, z=None: fwd(x, y), _poly(c))
        if a.intersection(cm).area > 0.01:
            a = a.difference(cm.buffer(TRIM_BUFFER_M))
    if a.geom_type != "Polygon":
        a = max(a.geoms, key=lambda g: g.area)
    out = []
    for x, y in list(a.exterior.coords)[:-1]:
        lng, lat = inv(x, y)
        out.append([round(lat, 7), round(lng, 7)])
    return out


AREA_360 = int(round(_m2(RING_360)))
AREA_370 = int(round(_m2(RING_370)))
AREA_YJ22 = int(round(_m2(RING_YJ22)))


# ── 구역 속성 ────────────────────────────────────────────────────────────────
PROPS_360 = {
    "id": "yangjae-360",
    "name": "양재동 360",
    "alias": [
        "양재동 360번지", "양재동 360 일대", "양재2동 360", "양재2동 360 일대",
        "양재동 360번지 및 370번지 일대", "양재동 361-8", "양재동 360·370", "양재2동 모아타운",
    ],
    "type": "모아타운",
    "kind": "모아타운",
    "stage": "권리산정기준일고시(2026-08-27)",
    "gu": "서초구",
    "area": 30426,
    "featured": False,
    "geom": "공고도면",
    "boundaryApprox": False,
    "sourceId": "서초구 공고(2026-01-21) 주민의견 사전조사 결과 안내 도면 · 브이월드 연속지적도",
    "center": [37.468647, 127.045564],
    "centerLabel": "구역 중앙 — 대표 지번 양재동 361-8 일대",
    "note": (
        "양재동 360·370번지 일대 주민제안 모아타운입니다. 서초구가 2025-11-11~12-01 주민의견 "
        "사전조사(응답률 83.3%, 678명 중 565명)로 신청요건(반대동의율 등)을 검토했고, 2026-08-27 "
        "서울시 고시 제2026-481호로 권리산정기준일이 고시됐습니다. 구역계는 서초구가 2026-01-21 "
        "공개한 사전조사 결과 안내문의 지적도 도면(B1·B2) 그대로이고, 구역면적은 30,425.7㎡"
        "(국공유지 제외 25,384.6㎡)·토지등소유자 682명입니다. 아직 모아타운 대상지 선정·관리계획 "
        "수립 전 단계입니다."
    ),
    "areaNote": (
        f"서초구 공고 도면(2026-01-21) 표기 30,425.7㎡(국공유지 제외 25,384.6㎡) — B1 12,857.4㎡ + "
        f"B2 12,527.2㎡. 같은 도면의 구역계를 연속지적도 필지선에 맞춰 옮겨 잰 값은 {AREA_360:,}㎡"
        f"(약 {round(AREA_360 / 3.3058):,}평)로 0.9% 차입니다."
    ),
    "boundaryNote": (
        "서초구청 공지(2026-01-21) 붙임 PDF의 지적도 위 빨간 점선 구역계를 그대로 옮긴 경계입니다 — "
        "북동 B2는 양재동 361~365번지 블록의 톱니(도로 굴곡)를 따라가고, 남서 B1은 349·358·359번지 "
        "블록, 남변은 353~355번지 남측 도로까지입니다. 가운데를 가로지르는 내부 간선도로가 B1·B2를 "
        "가릅니다. 370 일대와는 20m 남짓 떨어져 겹침 0㎡입니다. 다만 동쪽 이웃 양재동 382 관리지역의 "
        "저장 폴리곤(UQ120)은 2025-08-28 서울시 고시 제2025-476호로 74,515→36,683.1㎡로 줄기 전인 "
        "기정 범위라 360 블록을 통째로 품고 있어 도형상으로는 겹칩니다(382 폴리곤을 변경 범위로 다시 "
        "그려야 0이 됩니다)."
    ),
    "sources": [
        {
            "label": "서초구청 — 양재2동 370번지 및 360번지 일대 주민제안 모아타운 신청 주민의견 사전조사 결과 안내(2026-01-21)",
            "url": "https://www.seocho.go.kr/site/seocho/ex/bbs/View.do?bcIdx=406866&cbIdx=57",
        },
        {
            "label": "재개발닷컴 — 서울시 고시 제2026-481호 권리산정기준일 고시(양재동 360)",
            "url": "https://jaegebal.com/gnotices/seoul-gs-2026-481",
        },
    ],
    "asOf": "2026-11-22",
}

PROPS_370 = {
    "id": "yangjae-370",
    "name": "양재동 370",
    "alias": [
        "양재동 370번지", "양재동 370 일대", "양재2동 370", "양재2동 370 일대",
        "양재동 370번지 및 360번지 일대", "양재동 373-4", "양재동 371", "양재동 373", "양재동 376",
    ],
    "type": "모아타운",
    "kind": "모아타운",
    "stage": "권리산정기준일고시(2026-08-27)",
    "gu": "서초구",
    "area": 14969,
    "featured": False,
    "geom": "공고도면",
    "boundaryApprox": False,
    "sourceId": "서초구 공고(2026-01-21) 주민의견 사전조사 결과 안내 도면 · 브이월드 연속지적도",
    "center": [37.470709, 127.044583],
    "centerLabel": "구역 중앙 — 대표 지번 양재동 373-4 일대",
    "note": (
        "양재동 370번지 일대 주민제안 모아타운입니다. 360번지 일대와 함께 2025-11 주민의견 사전조사"
        "(찬성 78.3%·반대 7.7%)를 거쳤고, 2026-08-27 서울시 고시 제2026-481호로 권리산정기준일이 "
        "고시됐습니다. 구역계는 서초구 2026-01-21 공고 도면의 A1 그대로이며, 구역면적 14,968.7㎡"
        "(국공유지 제외 8,520.6㎡)·토지등소유자 186명입니다. 아직 대상지 선정 전입니다."
    ),
    "areaNote": (
        f"서초구 공고 도면(2026-01-21) 표기 14,968.7㎡(국공유지 제외 8,520.6㎡) — 같은 도면의 구역계를 "
        f"연속지적도 필지선에 맞춰 옮겨 잰 값은 {AREA_370:,}㎡(약 {round(AREA_370 / 3.3058):,}평)로 1.7% 차입니다."
    ),
    "boundaryNote": (
        "서초구청 공지(2026-01-21) 붙임 PDF의 지적도 위 A1 구역계를 옮긴 경계입니다 — 서쪽 371·372번지 "
        "블록(372-4가 서쪽 꼭짓점), 중앙 370·373번지 블록, 북동 376번지 블록(376-3 근린공원 포함)까지이고, "
        "남동변은 390-1·390-2 도로 필지를 따라 자릅니다. 남쪽 360 일대와는 겹침 0㎡. 북동 이웃 양재동 374 "
        "관리지역의 저장 폴리곤(UQ120)은 2025-08-28 서울시 고시 제2025-476호로 65,070→45,953.2㎡로 줄기 전인 "
        "기정 범위라 370 블록을 통째로 품고 있어 도형상으로는 겹칩니다(374 폴리곤을 변경 범위로 다시 그려야 "
        "0이 됩니다)."
    ),
    "sources": [
        {
            "label": "서초구청 — 양재2동 370번지 및 360번지 일대 주민제안 모아타운 신청 주민의견 사전조사 결과 안내(2026-01-21)",
            "url": "https://www.seocho.go.kr/site/seocho/ex/bbs/View.do?bcIdx=406866&cbIdx=57",
        },
        {
            "label": "재개발닷컴 — 서울시 고시 제2026-481호 권리산정기준일 고시(양재동 370)",
            "url": "https://jaegebal.com/gnotices/seoul-gs-2026-481",
        },
    ],
    "asOf": "2026-11-22",
}

PROPS_YJ22 = {
    "id": "yangjae2-2",
    "name": "양재2동 2구역",
    "alias": [
        "양재2구역", "양재2동2", "양재2동 2", "양재2동 2구역(가칭)",
        "양재동 335", "양재동 335 일대", "양재동 335·345", "양재동 345 일대",
        "양재동 335번지 일대 도심공공주택복합", "양재2동 도심공공주택복합",
    ],
    "type": "도공복",
    "kind": "도심공공주택복합",
    "stage": "추진준비(공모 준비)",
    "gu": "서초구",
    "area": AREA_YJ22,
    "featured": False,
    "geom": "가상경계",
    "boundaryApprox": True,
    "sourceId": "브이월드 연속지적도 필지 합집합(공식 구역계 미고시) · 조아부동산 양재동 정비사업 현황",
    "center": [37.46917, 127.04301],
    "centerLabel": "블록 중앙 — 양재동 335·345번지 일대(매헌초 동쪽)",
    "note": (
        "양재동 335·345번지 일대 2구역입니다. 3080 도심공공주택복합 후보에서 탈락한 뒤 2024-05 "
        "모아타운 공모에서도 주민 반대로 미선정됐고, 현재 도심공공주택복합(도공복) 방식으로 다시 "
        "추진을 검토하는 추진준비 단계입니다. 공식 구역계·면적이 아직 확정되지 않아 필지선을 따라 "
        "가상경계로 표시합니다."
    ),
    "areaNote": (
        f"연속지적도 필지(양재동 331~348번지 일대) 합집합 43,284㎡에 안쪽 도로를 8m 모서리로 메워 만든 "
        f"{AREA_YJ22:,}㎡(약 {round(AREA_YJ22 / 3.3058):,}평)입니다. 민간 정리값 17,247평(56,990㎡)과 1.5% 차. "
        f"공식 공모·지정 도면이 나오면 그 값으로 대체해야 합니다."
    ),
    "boundaryNote": (
        "공식 구역계가 없어 필지선으로 잡은 가상경계입니다. 서쪽은 매헌초등학교(양재동 311-1) 동쪽 "
        "경계, 동쪽은 양재동 374 서쪽 도로, 북쪽은 양재동 333·334번지 블록, 남쪽은 347·348번지 "
        "남측 도로까지입니다. 370 일대(0㎡)·360 일대(0㎡)·양재동 374(0㎡)와 모두 겹치지 않게 "
        "차집합해 두었습니다."
    ),
    "sources": [
        {
            "label": "조아부동산 — 양재동 정비사업 현황((가)양재2동2 도심공공복합 추진준비)",
            "url": "https://joa-realty.co.kr/%EC%9E%AC%EA%B0%9C%EB%B0%9C/%EC%84%9C%EC%B4%88%EA%B5%AC/%EC%96%91%EC%9E%AC%EB%8F%99/",
        },
        {
            "label": "파이낸셜뉴스 — 양재2구역(양재동 335 일대) 모아타운 미선정(2024-05-21)",
            "url": "https://www.fnnews.com/news/202405211811022320",
        },
    ],
    "asOf": "2026-11-22",
}

JOBS = [
    ("yangjae-360", PROPS_360, RING_360),
    ("yangjae-370", PROPS_370, RING_370),
    ("yangjae2-2", PROPS_YJ22, RING_YJ22),
]

META = {
    "asOf": "2026-11-22",
    "zones": ["yangjae-360", "yangjae-370", "yangjae2-2"],
    "note": (
        "양재2동 모아타운·도공복 구역계 정밀 보강 — 360·370은 서초구 공고 도면(2026-01-21)의 지적도 "
        "구역계를 연속지적도 필지선에 맞춰 옮긴 실경계(30,426㎡·14,969㎡), 2구역은 필지선을 따라 잡은 "
        "가상경계(56,162㎡). 근사원(점선원) 3개를 모두 실제 다각형으로 대체."
    ),
}


# ── 검사/반영 ────────────────────────────────────────────────────────────────
def _ring_eq(a, b) -> bool:
    return len(a) == len(b) and all(abs(p[0] - q[0]) < 1e-6 and abs(p[1] - q[1]) < 1e-6 for p, q in zip(a, b))


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for zid, props, ring in JOBS:
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        entry = next((z for z in src if z.get("id") == zid), None)
        coords = (feat.get("geometry") or {}).get("coordinates", [[]])[0] if feat else []
        cur = [[round(c[1], 7), round(c[0], 7)] for c in coords[:-1]] if coords else []
        ok = bool(
            feat
            and (feat.get("geometry") or {}).get("type") == "Polygon"
            and len(coords) == len(ring) + 1
            and coords[0] == coords[-1]
            and _ring_eq(cur, ring)
            and feat["properties"].get("geom") == props["geom"]
            and feat["properties"].get("boundaryApprox") == props["boundaryApprox"]
            and abs((feat["properties"].get("area") or 0) - props["area"]) < 0.01
            and entry is not None
            and len(entry.get("polygon") or []) == len(ring)
        )
        print(
            f"[{'OK' if ok else 'FAIL'}] {zid} verts={len(coords) - 1 if coords else 0}(기대 {len(ring)}) "
            f"area={feat['properties'].get('area') if feat else None}(기대 {props['area']}) "
            f"geom={feat['properties'].get('geom') if feat else None} "
            f"approx={feat['properties'].get('boundaryApprox') if feat else None}"
        )
        bad += 0 if ok else 1

    r = {zid: ring for zid, _, ring in JOBS}
    r["374"] = _zone_ring("11000UQ120PS202503070074")
    r["382"] = _zone_ring("11000UQ120PS202503070075")
    for a, b in [
        ("yangjae-360", "yangjae-370"),
        ("yangjae-360", "yangjae2-2"),
        ("yangjae-370", "yangjae2-2"),
        ("yangjae2-2", "374"),
    ]:
        o = _overlap(r[a], r[b]) if r.get(a) and r.get(b) else float("nan")
        ok = o < 0.01
        print(f"[{'OK' if ok else 'FAIL'}] 겹침 {a}×{b} = {o:.3f}㎡")
        bad += 0 if ok else 1
    for a, b in [("yangjae-360", "382"), ("yangjae-370", "374")]:
        o = _overlap(r[a], r[b]) if r.get(a) and r.get(b) else float("nan")
        print(f"[참고] 겹침 {a}×{b} = {o:,.0f}㎡ (상대 구역 폴리곤이 고시 축소 전 기정 범위)")
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for zid, props, ring in JOBS:
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        entry = next((z for z in src if z.get("id") == zid), None)
        if feat is None:
            feat = {"type": "Feature", "id": zid, "properties": {}, "geometry": None}
            geo["features"].append(feat)
        if entry is None:
            entry = {"id": zid}
            src.append(entry)
        old = dict(feat["properties"])
        feat["properties"] = {**old, **props, "id": zid}
        ring_ll = [[lng, lat] for lat, lng in ring] + [[ring[0][1], ring[0][0]]]
        feat["geometry"] = {"type": "Polygon", "coordinates": [ring_ll]}
        entry.update({k: v for k, v in props.items() if k != "id"})
        entry["id"] = zid
        entry["polygon"] = [list(p) for p in ring]
        entry.pop("parts", None)
        entry.pop("holes", None)
        print(f"[반영] {zid} — {len(ring)}정점, area={props['area']}, geom={props['geom']}")

    if TRIM_PARENTS:
        r360 = next(r for z, _, r in JOBS if z == "yangjae-360")
        r370 = next(r for z, _, r in JOBS if z == "yangjae-370")
        for pid, cuts in [
            ("11000UQ120PS202503070075", [r360]),
            ("11000UQ120PS202503070074", [r370]),
        ]:
            feat = next((f for f in geo["features"] if f["properties"].get("id") == pid), None)
            cur = _zone_ring(pid)
            trimmed = _trim(cur, cuts)
            feat["geometry"] = {
                "type": "Polygon",
                "coordinates": [[[lng, lat] for lat, lng in trimmed] + [[trimmed[0][1], trimmed[0][0]]]],
            }
            print(f"[트림] {pid} {len(cur)}→{len(trimmed)}정점, {_m2(cur):,.0f}→{_m2(trimmed):,.0f}㎡")

    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
