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
    블록을 통째로 품고 있다(370은 374 안에 100%, 360은 382 안에 99.4%).
  · `--trim-parents` — 2026-11-23 사용자 결정으로 **실행**(360·370만 맞추고 두면 370이 374 색에
    가려 지도에서 보이지 않고, 주소검색 카드가 `30,426㎡ · 겹친 구역이 있습니다 · 겹침 양재동 382`
    로 결함을 안내한다). 374 에서 370 을, 382 에서 360 을 차집합(버퍼 0.3m)해 겹침 0㎡로 맞췄다.
    → 374 52,991㎡(13정점) · 382 39,797㎡(2조각 38,613+1,184 — 100㎡ 미만 부스러기 2개는 버림).
    표기 면적(61,289/68,804㎡)은 공개된 UQ120 기정 값이라 그대로 두고, note·areaNote·boundaryNote 에
    "서울시 고시 제2025-476호 변경면적(45,953.2 / 36,683.1㎡)으로 다시 그려 재정합 예정"을 적었다.

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
PARENT_TRIM_MIN_M2 = 100.0


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
    """저장된 도형의 가장 큰 조각 외곽 링 — [위도, 경도] (참고 출력용)."""
    rings = _zone_outer_rings(zid)
    return max(rings, key=_m2) if rings else None


def _open_holes(g, slit_m: float = 1.0, extend_m: float = 5.0):
    """홀(내부 링)을 슬릿으로 열어 단순 폴리곤으로 만든다.

    · 370 이 374 안에 **완전히** 들어 있어(경계 접점 0) 차집합은 도넛(홀 1개)이 된다.
    · 앱 렌더러(Leaflet·카카오 캔버스)는 외곽·조각 링만 칠하고 홀은 무시하므로, 홀을 그대로 두면
      374 채움색이 370을 다시 덮는다. 그래서 홀 안쪽 점에서 바깥 링 너머까지 폭 1m 슬릿을 내어
      C자 모양 단순 폴리곤으로 만든다(지도에서는 경계선 한 줄).
    · 슬릿은 **홀 안쪽 점**에서 시작해야 한다 — 홀 경계에서 시작하면 링이 퇴화해 잘못된 도형이 된다.
    """
    from shapely.geometry import LineString, Point
    from shapely.geometry import Polygon as SHPolygon
    from shapely.ops import nearest_points

    for _ in range(8):
        if not g.interiors:
            break
        hole = SHPolygon(g.interiors[0])
        c = hole.representative_point()
        p_out, _ = nearest_points(g.exterior, c)
        dx, dy = p_out.x - c.x, p_out.y - c.y
        dist = math.hypot(dx, dy) or 1.0
        end = Point(p_out.x + dx / dist * extend_m, p_out.y + dy / dist * extend_m)
        out = g.difference(LineString([c, end]).buffer(slit_m / 2, cap_style=2))
        polys = [p for p in getattr(out, "geoms", [out]) if p.geom_type == "Polygon"]
        g = max(polys, key=lambda p: p.area) if polys else g
    return g


def _trim_pieces(rings, cut_rings):
    """rings 에서 cut_rings 를 차집합(버퍼 0.3m) — 겹침 항상 0.

    · 입력은 조각별 외곽 링 목록이다(저장 도형이 이미 2조각이면 둘 다 넘긴다) — 두 번 돌려도
      조각이 줄지 않게 한다.
    · UQ120 기정 도형은 12~13정점짜리 간략화 도형이라, 정밀한 새 블록과 맞물리는 자리에
      100㎡ 미만 부스러기 조각이 생긴다(382−360 의 26㎡·5㎡). 지도에서도 보이지 않고 면적만
      흐리므로 버린다 — 382 는 38,613 + 1,184㎡ 두 조각이 남는다.
    """
    from shapely.ops import transform

    fwd, inv = _proj()
    geoms = []
    for ring in rings:
        a = transform(lambda x, y, z=None: fwd(x, y), _poly(ring))
        for c in cut_rings:
            cm = transform(lambda x, y, z=None: fwd(x, y), _poly(c))
            if a.intersection(cm).area > 0.01:
                a = a.difference(cm.buffer(TRIM_BUFFER_M))
        for piece in [a] if a.geom_type == "Polygon" else list(a.geoms):
            geoms.append(_open_holes(piece))
    keep = [g for g in geoms if g.area >= PARENT_TRIM_MIN_M2] or [max(geoms, key=lambda g: g.area)]
    keep.sort(key=lambda g: -g.area)
    pieces = []
    for g in keep:
        out = []
        for x, y in list(g.exterior.coords)[:-1]:
            lng, lat = inv(x, y)
            out.append([round(lat, 7), round(lng, 7)])
        pieces.append(out)
    return pieces, sum(g.area for g in keep)


def _geom_ll(pieces):
    """링 목록 → GeoJSON geometry (1조각 Polygon · 여러 조각 MultiPolygon)."""
    rings = [[[lng, lat] for lat, lng in p] + [[p[0][1], p[0][0]]] for p in pieces]
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": rings}
    return {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}


def _zone_outer_rings(zid: str):
    """저장된 도형의 외곽 링 목록(조각마다 1개) — [위도, 경도] 소수 7자리."""
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
    g = (feat or {}).get("geometry") or {}
    if not g.get("coordinates"):
        return []
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return [[[round(c[1], 7), round(c[0], 7)] for c in poly[0][:-1]] for poly in polys]


def _zone_shapely(zid: str):
    """저장된 도형(Polygon·MultiPolygon) → EPSG:5179 shapely 도형 (겹침 검사용)."""
    from shapely.geometry import shape
    from shapely.ops import transform

    fwd, _ = _proj()
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
    if feat is None or not (feat.get("geometry") or {}).get("coordinates"):
        raise KeyError(zid)
    return transform(lambda x, y, z=None: fwd(x, y), shape(feat["geometry"]))


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
        "가릅니다. 370 일대와는 20m 남짓 떨어져 겹침 0㎡입니다. 동쪽 이웃 양재동 382 관리지역의 "
        "저장 폴리곤(UQ120)은 2025-08-28 서울시 고시 제2025-476호로 74,515→36,683.1㎡로 줄기 전인 "
        "기정 범위라 360 블록을 통째로 품고 있습니다"
        + (
            " — 그 382 도형에서 이 블록(30,699㎡)을 차집합해 겹침 0㎡로 맞췄습니다. 382 표기 면적·도형은 "
            "고시 변경면적(36,683.1㎡)으로 다시 그려 재정합 예정입니다."
            if TRIM_PARENTS
            else "(382 폴리곤을 변경 범위로 다시 그려야 0이 됩니다)."
        )
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
        "기정 범위라 370 블록을 통째로 품고 있습니다"
        + (
            " — 그 374 도형에서 이 블록(15,230㎡)을 차집합해 겹침 0㎡로 맞췄습니다. 374 표기 면적·도형은 "
            "고시 변경면적(45,953.2㎡)으로 다시 그려 재정합 예정입니다."
            if TRIM_PARENTS
            else "(374 폴리곤을 변경 범위로 다시 그려야 0이 됩니다)."
        )
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

# ── 이웃 관리지역(374·382) — 새 블록만큼 차집합(2026-11-23 사용자 결정) ──────────────────
#   pid, 표기 이름, 표기 면적(UQ120 기정·공개값), 뺄 구역 id, 뺄 구역 이름, 뺄 면적(도면), 고시 변경면적
PARENT_JOBS = [
    ("11000UQ120PS202503070074", "양재동 374", 61289, "yangjae-370", "370 일대", 15230, 45953.2),
    ("11000UQ120PS202503070075", "양재동 382", 68804, "yangjae-360", "360 일대", 30699, 36683.1),
]


def _parent_props(name, published, cut_name, cut_area, changed, geom_area, npieces) -> dict:
    """374·382 에 붙일 설명 — 표기 면적은 공개된 UQ120 기정 값 그대로 두고, 지도 도형 면적과
    고시 변경면적·재정합 예정을 같이 밝힌다."""
    piece = f"{npieces}조각" if npieces > 1 else "1조각"
    return {
        "note": (
            f"{name} 일대 모아타운(관리지역)입니다. 지도 경계(geom UQ120)는 2025-08-28 서울시 고시 "
            f"제2025-476호로 줄기 전(기정) 범위에서, 2026-11-22 새로 잡은 양재동 {cut_name} 모아타운 "
            f"구역계({cut_area:,}㎡)를 차집합해 겹침 0㎡로 맞춘 것입니다. 서울시 고시 제2025-476호 "
            f"변경면적({changed:,.1f}㎡) 기준 도형으로 다시 그려 재정합 예정입니다."
        ),
        "areaNote": (
            f"표기 면적 {published:,}㎡는 2025-08-28 고시 전 UQ120 기정 도형의 공개 값입니다. 지도에 "
            f"그린 도형은 {cut_name} 구역계를 뺀 {geom_area:,.0f}㎡({piece})이고, 서울시 고시 "
            f"제2025-476호 변경면적은 {changed:,.1f}㎡ — 변경면적 기준으로 다시 그려 재정합 예정입니다."
        ),
        "boundaryNote": (
            f"고시 도형(UQ120)에서 양재동 {cut_name} 구역계를 차집합한 경계({piece}) · 고시 "
            f"변경면적({changed:,.1f}㎡)으로 재정합 예정"
        ),
    }

META = {
    "asOf": "2026-11-23",
    "zones": ["yangjae-360", "yangjae-370", "yangjae2-2"],
    "parentsTrimmed": ["11000UQ120PS202503070074", "11000UQ120PS202503070075"] if TRIM_PARENTS else [],
    "note": (
        "양재2동 모아타운·도공복 구역계 정밀 보강 — 360·370은 서초구 공고 도면(2026-01-21)의 지적도 "
        "구역계를 연속지적도 필지선에 맞춰 옮긴 실경계(30,426㎡·14,969㎡), 2구역은 필지선을 따라 잡은 "
        "가상경계(56,162㎡). 근사원(점선원) 3개를 모두 실제 다각형으로 대체"
        + (
            ". 이웃 양재동 374·382(UQ120 기정 도형)에서는 370·360 블록을 차집합해 겹침 0㎡ — 두 구역 "
            "도형 면적은 52,991·39,797㎡로 줄었고, 표기 면적은 고시 변경면적(45,953.2·36,683.1㎡)으로 "
            "재정합 예정."
            if TRIM_PARENTS
            else "."
        )
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

    P = {}
    for zid in ["yangjae-360", "yangjae-370", "yangjae2-2", *[p[0] for p in PARENT_JOBS]]:
        try:
            P[zid] = _zone_shapely(zid)
        except Exception as exc:  # noqa: BLE001 — 데이터가 없으면 FAIL 로 모은다
            print(f"[FAIL] {zid} 도형 읽기 실패 — {exc}")
            bad += 1

    pairs = [
        ("yangjae-360", "yangjae-370", 0.01),
        ("yangjae-360", "yangjae2-2", 0.01),
        ("yangjae-370", "yangjae2-2", 0.01),
        ("yangjae2-2", "11000UQ120PS202503070074", 0.01),
        ("yangjae2-2", "11000UQ120PS202503070075", 0.01),
        ("yangjae-360", "11000UQ120PS202503070074", 0.01),
        ("yangjae-370", "11000UQ120PS202503070075", 0.01),
        # 374·382 는 원래 껌딩한 자리가 있어 0.1㎡ 선으로 스치는 정도는 허용(도형 오차)
        ("11000UQ120PS202503070074", "11000UQ120PS202503070075", 1.0),
    ]
    if TRIM_PARENTS:
        pairs += [
            ("yangjae-360", "11000UQ120PS202503070075", 0.01),
            ("yangjae-370", "11000UQ120PS202503070074", 0.01),
        ]
    for a, b, tol in pairs:
        if a not in P or b not in P:
            continue
        o = P[a].intersection(P[b]).area
        ok = o < tol
        print(f"[{'OK' if ok else 'FAIL'}] 겹침 {a}×{b} = {o:,.3f}㎡")
        bad += 0 if ok else 1
    for a, b in [("yangjae-360", "382"), ("yangjae-370", "374")]:
        if TRIM_PARENTS:
            continue
        o = _overlap(r[a], r[b]) if r.get(a) and r.get(b) else float("nan")
        print(f"[참고] 겹침 {a}×{b} = {o:,.0f}㎡ (상대 구역 폴리곤이 고시 축소 전 기정 범위)")

    for pid, name, published, _cut_id, _cut_name, _cut_area, changed in PARENT_JOBS:
        g = P.get(pid)
        if g is None:
            continue
        entry = next((z for z in src if z.get("id") == pid), None)
        poly_pts = len((entry or {}).get("polygon") or [])
        synced = bool(entry and poly_pts == len(_zone_outer_rings(pid)[0]))
        info = (
            f"{name} 도형 {g.area:,.0f}㎡/{g.geom_type} 표기 {published:,}㎡ "
            f"고시 변경 {changed:,.1f}㎡ · seoul-zones 동기화 {'OK' if synced else 'FAIL'}"
        )
        if TRIM_PARENTS:
            ok = g.is_valid and g.area < published and synced
            print(f"[{'OK' if ok else 'FAIL'}] {info}")
            bad += 0 if ok else 1
        else:
            print(f"[참고] {info} (트림 없음)")
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
        cut_rings = {zid: ring for zid, _, ring in JOBS}
        for pid, name, published, cut_id, cut_name, cut_area, changed in PARENT_JOBS:
            feat = next((f for f in geo["features"] if f["properties"].get("id") == pid), None)
            if feat is None:
                print(f"[경고] {pid} 없음 — 트림 건너뜀")
                continue
            before = _zone_outer_rings(pid)
            pieces, area = _trim_pieces(before, [cut_rings[cut_id]])
            feat["geometry"] = _geom_ll(pieces)
            extra = _parent_props(name, published, cut_name, cut_area, changed, area, len(pieces))
            feat["properties"] = {**feat["properties"], **extra}
            entry = next((z for z in src if z.get("id") == pid), None)
            if entry is not None:
                entry.update(extra)
                entry["polygon"] = [list(p) for p in pieces[0]]
                if len(pieces) > 1:
                    entry["parts"] = [[list(p) for p in pc] for pc in pieces[1:]]
                else:
                    entry.pop("parts", None)
                entry.pop("holes", None)
            before_m2 = sum(_m2(ring) for ring in before)
            print(
                f"[트림] {pid}({name}) {len(before)}조각→{len(pieces)}조각, "
                f"{before_m2:,.0f}→{area:,.0f}㎡ (빼는 블록 {cut_name} {cut_area:,}㎡)"
            )

    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
