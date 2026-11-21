#!/usr/bin/env python3
"""
삼각맨션(용산구 한강로1가 231-23 일원 · 한강로1가 도시정비형 재개발사업) 정비구역 반영 — 2026-11-21

근거(공식 고시)
  · 서울특별시고시 제2026-297호(2026-05-28, 서울시보 제4152호 214~243쪽)
    「도시관리계획(용도지역) 결정(변경), 한강로1가 도시정비형 재개발사업 정비구역 지정 및 정비계획,
      지구단위계획(변경) 결정 및 지형도면 고시」
    - 정비구역: 용산구 한강로1가 231-23 일원, 면적 20,860㎡
    - 지구: 1지구(231-23 일원) 16,455.0㎡ / 2지구(231-30 일원) 4,405.0㎡
    - 토지이용계획: 획지 20,216.6㎡ + 정비기반시설(도로) 643.4㎡ = 20,860㎡
    - 용도지역 변경: 제2·3종일반주거·일반상업 → 준주거 (준주거 20,216.6㎡, 96.9%)
    - 용적률(기존/허용/상한/법적상한): 1지구 주거 256/352/403/500%, 2지구 업무 258/355/405
    - 높이 100m/120m 이하, 공공기여: 1지구 2,012.7㎡(사회복지시설 지상1~2층 4,360㎡),
      2지구 760.3㎡(문화시설 지하1층 1,200㎡)
    - 2지구는 154kV 한남변전소 부지(전기공급설비 변전시설 8,968.6㎡, 변경 없음)
  · 조합설립추진위원회 승인 2026-04-03 (정비사업 정보몽땅 진행단계)
  · 보도(위클리한국주택경제 2026-05-28): 최고 39층 697세대, 추정비례율 99.08%,
    전용 39㎡ 146(임대 50)·59㎡ 316(임대 33·공공 15)·84㎡ 199(공공 47)·103㎡ 36
  · 재개발닷컴 집계: 구역면적 20,860㎡, 토지등소유자 약 155명, 697세대(조합원 155·일반 397·임대 145),
    노후도 97.8%, 평균 대지지분 135㎡

경계를 옮긴 방법 (타 사이트 폴리곤은 쓰지 않았다)
  1) 고시 PDF 27쪽 「정비구역 결정도」 지적도 위 붉은 점선(도시정비형 재개발구역)을 색 분리해
     점선 조각 32개의 중심을 잇는 30점 폴리곤으로 추적했다(점선 중심 연결, 최대 이탈 2m).
  2) 축척: 도면 안에 인쇄된 1:1,500 눈금(150m=278px)은 시보 지면에 축소 인쇄되며 실제 축척과
     맞지 않았다(눈금값 0.54 m/px vs 실제 0.33 m/px). 대신 도면 내부 필지 면적으로 확정했다 —
     삼각맨션 아파트 대지 69,719px², 한전(2지구) 대지 83,580px²를 고시·집계 면적
     (7,004㎡·8,972㎡)과 맞추면 0.329 m/px이고, 이 값에서 구역 도형면적이 20,856㎡로
     고시 20,860㎡와 0.02% 차이다.
  3) 위치: 지적편집도에서 구역 블록(삼각맨션 A·B동, 231·30 필지, 동쪽 근생 열)의 필지 경계와
     대조해 정합(경계-필지 평균 이탈 2.4m). 카카오 지번 좌표(한강로1가 231-23 =
     37.5338231, 126.9732897)가 폴리곤 안에 들어오는 것을 확인했다.
  4) 북쪽 첨두는 삼각지역 남측 도로 교차부, 서쪽은 한강대로62길, 남·동쪽은 구역을 감싸는 도로를 따른다.

원칙
  · 고시문에 적힌 값과 보도·집계로 확인한 값만 적고, 집계·추정은 그렇게 밝힌다.
  · 삼각지역 역세권활성화구역(9,640㎡)과는 겹치지 않는다(0㎡). 옆 '한강로' 구역(41,744㎡)과는
    경계에서 68㎡만 스친다.
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용:
  python3 scripts/apply-samgak-mansion-20261121.py
  python3 scripts/apply-samgak-mansion-20261121.py --check
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"

META_KEY = "samgak_mansion_20261121"

ZONE_ID = "ys-samgak-mansion"
ZONE_NAME = "삼각맨션"
ZONE_TYPE = "일반재개발"
ZONE_KIND = "재개발(도시정비형)"
ZONE_STAGE = "정비구역지정(2026-05-28)"
ZONE_GU = "용산구"
ZONE_AREA = 20860
ZONE_SOURCE_ID = "서울특별시고시 제2026-297호(2026-05-28)"

ZONE_ALIAS = [
    "삼각맨션",
    "삼각맨션 재개발",
    "삼각맨션재개발",
    "삼각맨션 일대",
    "삼각맨션구역",
    "삼각맨션 아파트",
    "삼각아파트",
    "한강로1가 도시정비형 재개발",
    "한강로1가 도시정비형 재개발사업",
    "한강로1가구역",
    "한강로1가 231-22",
    "한강로1가 231-23",
    "한강로1가 231-23 일원",
    "한강로1가 231-23번지 일대",
    "한강로1가 231-24",
    "한강로1가 231-30",
    "용산구 삼각맨션",
]

ZONE_NOTE = (
    "용산구 한강로1가 231-23번지 일원(삼각맨션 일대) 도시정비형 재개발사업 정비구역입니다. "
    "2025년 제17차 서울시 도시계획위원회 심의(수정가결)와 용산구 공고 제2026-432호(2026-03-13) "
    "재공람을 거쳐 2026-05-28 서울특별시고시 제2026-297호로 정비구역 지정·정비계획 결정과 "
    "지구단위계획 변경, 지형도면 고시가 이뤄졌습니다(조합설립추진위원회 승인은 2026-04-03). "
    "정비구역은 20,860㎡로 한강로1가 1지구(231-23 일원, 16,455.0㎡)와 2지구(231-30 일원, 4,405.0㎡)로 "
    "나뉘고, 2지구는 154kV 한남변전소가 있는 한국전력공사 부지입니다. 토지등소유자는 약 155명, "
    "계획은 최고 39층 697세대(조합원 155·일반분양 397·임대 145)이고 추정비례율은 99.08%입니다. "
    "용도지역은 제2·3종일반주거지역과 일반상업지역에서 준주거지역으로 변경돼 준주거지역이 "
    "20,216.6㎡(96.9%)를 차지합니다. 허용용적률 352%(2지구 355%), 상한용적률 403%(2지구 405%)이고, "
    "공공주택 특별법상 공공주택을 포함할 때 법적상한용적률 500%까지 적용되며 높이는 120m 이하로 "
    "관리됩니다. 기부채납은 1지구 2,012.7㎡(사회복지시설 지상 1~2층, 연면적 4,360㎡)와 2지구 "
    "760.3㎡(문화시설 지하 1층, 연면적 1,200㎡)입니다. 입지는 4·6호선 삼각지역 바로 남쪽으로 "
    "역 승강장에서 100~200m 거리이고, 서쪽으로 한강대로, 그 안쪽으로 한강대로62길이 지납니다. "
    "구역 안에는 1970년 준공한 삼각맨션 A·B·C동(130세대)과 근린생활시설 39동, 노후도 97.8%의 "
    "저층 주거지가 섞여 있습니다. 토지거래허가구역(2026-12-31까지)이라 매수 시 확인이 필요합니다."
)

ZONE_AREA_NOTE = (
    "고시 정비구역 면적 20,860㎡입니다(1지구 16,455.0㎡ = 획지 16,000.7 + 정비기반시설 454.3, "
    "2지구 4,405.0㎡ = 획지 4,215.9 + 도로 189.1). 도면 경계로 옮긴 다각형의 계측 면적은 "
    "20,856㎡로 고시값과 4㎡(0.02%) 차이입니다. 토지등소유자 약 155명(집계), 평균 대지지분 135㎡."
)

ZONE_BOUNDARY_NOTE = (
    "서울특별시고시 제2026-297호 PDF 27쪽 「정비구역 결정도」(지적도)의 붉은 점선(도시정비형 "
    "재개발구역)을 그대로 추적해 30점 폴리곤으로 옮겼습니다. 도면의 1:1,500 눈금은 시보 지면에 "
    "축소 인쇄돼 실제 축척과 맞지 않아, 도면 안 필지 면적(삼각맨션 대지 약 7,500㎡, 2지구 한전 "
    "대지 약 9,000㎡)과 고시 구역면적으로 축척을 0.329 m/px로 확정했습니다. 위치는 지적편집도의 "
    "구역 블록 필지 경계와 대조해 정합했고(경계-필지 평균 이탈 2.4m), 카카오 지번 좌표 "
    "(한강로1가 231-23 = 37.5338231, 126.9732897)가 폴리곤 안에 들어옵니다. 북쪽 첨두는 삼각지역 "
    "남측 도로 교차부, 서쪽은 한강대로62길, 남·동쪽은 구역을 감싸는 도로를 따릅니다. "
    "삼각지역 역세권활성화구역(9,640㎡)과는 겹치지 않고, 옆 '한강로' 구역(41,744㎡)과는 경계에서 "
    "68㎡만 스칩니다. 도면 도형·축척·정합 오차를 합치면 경계 오차는 ±10m 안쪽입니다."
)

ZONE_SOURCES = [
    {
        "label": "서울특별시고시 제2026-297호 — 도시관리계획(용도지역) 결정(변경), 한강로1가 도시정비형 재개발사업 정비구역 지정 및 정비계획, 지구단위계획(변경) 결정 및 지형도면 고시(서울시보 제4152호, 2026-05-28)",
        "url": "https://jaegebal.com/gnotices/seoul-gs-2026-297",
    },
    {
        "label": "용산구 고시(2026-06-02) — 서울특별시고시 제2026-297호 게시(정비구역 지정·지형도면)",
        "url": "https://jaegebal.com/gnotices/ys-gs-2026-9186",
    },
    {
        "label": "정비사업 정보몽땅 — 한강로1가 도시정비형 재개발정비사업(진행단계: 추진위 승인 2026-04-03, 정비구역지정 2026-05-28)",
        "url": "https://cleanup.seoul.go.kr/assc/scrin-bbs/execute.do?cafeId=170900001257t08",
    },
    {
        "label": "위클리한국주택경제 — 한강로1가, 도시정비형 재개발 정비구역으로 지정(2026-05-28): 최고 39층 697세대·비례율 99.08%·전용면적별 구성",
        "url": "https://www.arunews.com/news/articleView.html?idxno=63114",
    },
    {
        "label": "재개발닷컴 — 삼각맨션 사업정보(구역면적 20,860㎡·소유자 약 155명·697세대·평균 대지지분 135㎡)",
        "url": "https://jaegebal.com/develops/3225",
    },
]

# ── 구역계 도형 ──────────────────────────────────────────────────────────────
# 고시 PDF 27쪽 정비구역 결정도의 붉은 점선(중심) 추적 → WGS84. [위도, 경도], 닫는 점 없음.
RING = [
    [37.5347147, 126.9736811], [37.5346948, 126.9738534], [37.5344899, 126.97383],
    [37.5342869, 126.9738006], [37.5340853, 126.9737742], [37.5338807, 126.973747],
    [37.5336738, 126.9737202], [37.5334758, 126.9736941], [37.5332689, 126.9736625],
    [37.5330667, 126.9736364], [37.5328612, 126.9736108], [37.5326567, 126.9735828],
    [37.5324935, 126.9735192], [37.5325422, 126.9732791], [37.5326011, 126.9730268],
    [37.532654, 126.9727834], [37.5327129, 126.9725362], [37.5327694, 126.9722906],
    [37.5328651, 126.9720665], [37.5329933, 126.9718945], [37.5331535, 126.9720345],
    [37.5333155, 126.9721916], [37.5334603, 126.9723754], [37.5335917, 126.9725712],
    [37.5337383, 126.9727461], [37.5339013, 126.9729025], [37.5340654, 126.973058],
    [37.5342274, 126.973211], [37.534393, 126.9733666], [37.5345533, 126.9735222],
]

M_LAT = 110_540.0
M_LNG = 111_320.0 * math.cos(math.radians(37.5335))

META = {
    "asOf": "2026-11-21",
    "polygons": 1,
    "zoneId": ZONE_ID,
    "stage": ZONE_STAGE,
    "note": (
        "삼각맨션(한강로1가 도시정비형 재개발) 정비구역 반영 — 서울특별시고시 제2026-297호(2026-05-28) "
        "PDF 27쪽 정비구역 결정도의 붉은 점선을 30점 폴리곤으로 옮겼다(geom='공고도면'). "
        "축척은 도면 필지 면적·고시 구역면적 20,860㎡로 확정(0.329 m/px), 도형 면적 20,856㎡(-0.02%). "
        "위치는 지적편집도 필지 경계 정합(평균 2.4m)과 카카오 지번 좌표(한강로1가 231-23)로 확인. "
        "삼각지역 역세권구역과 겹침 없음. 타 사이트 폴리곤은 쓰지 않았다."
    ),
}


def ring_area_m2(ring: list[list[float]]) -> float:
    lat0 = sum(p[0] for p in ring) / len(ring)
    lng0 = sum(p[1] for p in ring) / len(ring)
    xs = [(p[1] - lng0) * M_LNG for p in ring]
    ys = [(p[0] - lat0) * M_LAT for p in ring]
    s = 0.0
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        s += xs[i] * ys[j] - xs[j] * ys[i]
    return abs(s) / 2


def centroid(ring: list[list[float]]) -> list[float]:
    lng0 = ring[0][1]
    lat0 = ring[0][0]
    pts = [((p[1] - lng0) * M_LNG, (p[0] - lat0) * M_LAT) for p in ring]
    a = cx = cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    a *= 0.5
    return [round(lat0 + (cy / (6 * a)) / M_LAT, 7), round(lng0 + (cx / (6 * a)) / M_LNG, 7)]


def _closed(ring: list[list[float]]) -> list[list[float]]:
    return [[lng, lat] for lat, lng in ring] + [[ring[0][1], ring[0][0]]]


def props() -> dict:
    return {
        "id": ZONE_ID,
        "name": ZONE_NAME,
        "alias": ZONE_ALIAS,
        "type": ZONE_TYPE,
        "kind": ZONE_KIND,
        "stage": ZONE_STAGE,
        "gu": ZONE_GU,
        "area": ZONE_AREA,
        "featured": False,
        "sourceId": ZONE_SOURCE_ID,
        "geom": "공고도면",
        "center": centroid(RING),
        "note": ZONE_NOTE,
        "areaNote": ZONE_AREA_NOTE,
        "boundaryNote": ZONE_BOUNDARY_NOTE,
        "sources": ZONE_SOURCES,
        "polygon": RING,
    }


def check() -> int:
    bad = 0
    want = props()
    ring = want["polygon"]
    area = ring_area_m2(ring)

    print(f"[{'OK' if len(ring) == 30 else 'FAIL'}] 도형 정점 {len(ring)}개(30 기대)")
    bad += 0 if len(ring) == 30 else 1
    ok_area = abs(area - ZONE_AREA) < 60
    print(f"[{'OK' if ok_area else 'FAIL'}] 도형 면적 {area:,.0f}㎡ (고시 20,860㎡와 60㎡ 이내)")
    bad += 0 if ok_area else 1
    ok_order = all(33 < lat < 39 and 126 < lng < 128 for lat, lng in ring)
    print(f"[{'OK' if ok_order else 'FAIL'}] 좌표 순서([위도,경도])·범위 정상")
    bad += 0 if ok_order else 1
    b = (min(p[0] for p in ring), max(p[0] for p in ring), min(p[1] for p in ring), max(p[1] for p in ring))
    print(f"  bbox lat {b[0]:.5f}~{b[1]:.5f} / lon {b[2]:.5f}~{b[3]:.5f}")

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    feat = next((f for f in feats if f["properties"].get("id") == ZONE_ID), None)
    if feat is None:
        print(f"[FAIL] geojson에 구역 없음: {ZONE_ID}")
        return bad + 1
    p = feat["properties"]
    g = feat.get("geometry") or {}
    coords = (g.get("coordinates") or [[]])[0]
    same = [[round(c[1], 7), round(c[0], 7)] for c in coords[:-1]] == ring
    ok = (
        g.get("type") == "Polygon"
        and same
        and coords[0] == coords[-1]
        and p.get("name") == ZONE_NAME
        and p.get("geom") == "공고도면"
        and abs(float(p.get("area") or 0) - ZONE_AREA) < 0.01
        and p.get("stage") == ZONE_STAGE
        and p.get("note") == ZONE_NOTE
        and p.get("areaNote") == ZONE_AREA_NOTE
        and p.get("boundaryNote") == ZONE_BOUNDARY_NOTE
        and all(a in (p.get("alias") or []) for a in ZONE_ALIAS)
        and len(p.get("sources") or []) == len(ZONE_SOURCES)
    )
    print(
        f"[{'OK' if ok else 'FAIL'}] geojson {p.get('name')} ({ZONE_ID}) geom={p.get('geom')} "
        f"area={p.get('area')} verts={len(coords) - 1} alias={len(p.get('alias') or [])}"
    )
    bad += 0 if ok else 1

    for term in ("삼각맨션", "삼각맨션 재개발", "한강로1가 도시정비형 재개발", "한강로1가 231-23", "삼각아파트"):
        flat = term.replace(" ", "")
        hit = any(flat in s.replace(" ", "") for s in [p.get("name", "")] + list(p.get("alias") or []))
        print(f"[{'OK' if hit else 'FAIL'}] 검색어 '{term}' → 별칭에서 걸림")
        bad += 0 if hit else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((e for e in src if e.get("id") == ZONE_ID), None)
    if entry is None:
        print(f"[FAIL] seoul-zones.json에 구역 없음: {ZONE_ID}")
        return bad + 1
    ok2 = (
        entry.get("name") == ZONE_NAME
        and entry.get("geom") == "공고도면"
        and abs(float(entry.get("area") or 0) - ZONE_AREA) < 0.01
        and entry.get("stage") == ZONE_STAGE
        and entry.get("note") == ZONE_NOTE
        and entry.get("polygon") == ring
    )
    print(
        f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {entry.get('name')} "
        f"polygon={len(entry.get('polygon') or [])} geom={entry.get('geom')} stage={entry.get('stage')}"
    )
    bad += 0 if ok2 else 1

    ids = [f["properties"].get("id") for f in feats]
    dup = {i for i in ids if ids.count(i) > 1}
    print(f"[{'OK' if not dup else 'FAIL'}] 중복 id 없음 (features={len(feats)})")
    bad += 0 if not dup else 1

    meta_ok = META_KEY in (geo.get("metadata") or {}) and geo["metadata"].get("count") == len(feats)
    print(
        f"[{'OK' if meta_ok else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(feats)} "
        f"batch={META_KEY in (geo.get('metadata') or {})}"
    )
    bad += 0 if meta_ok else 1
    print(f"→ 총 구역 수 {len(feats)}곳")
    return bad


def apply() -> int:
    want = props()
    ring = want["polygon"]
    geometry = {"type": "Polygon", "coordinates": [_closed(ring)]}

    # 1) public/data/zones.geojson — 배포 산출물
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    feat = next((f for f in feats if f["properties"].get("id") == ZONE_ID), None)
    before = json.dumps(feat["properties"], ensure_ascii=False, sort_keys=True) if feat else None
    if feat is None:
        feat = {"type": "Feature", "id": ZONE_ID, "properties": want, "geometry": geometry}
        feats.append(feat)
        print(f"[geojson] 새 구역 추가: {ZONE_NAME} ({ZONE_ID})")
    else:
        feat["properties"] = want
        feat["geometry"] = geometry
        print(f"[geojson] 기존 구역 갱신: {ZONE_NAME} ({ZONE_ID})")
    after = json.dumps(feat["properties"], ensure_ascii=False, sort_keys=True)
    print(f"          정점 {len(ring)}개 · 도형 면적 {ring_area_m2(ring):,.0f}㎡ · geom 공고도면")
    geo.setdefault("metadata", {})[META_KEY] = META
    geo["metadata"]["count"] = len(feats)
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] features={len(feats)} · changed={before != after}")

    # 2) src/data/seoul-zones.json — 파이프라인 원천
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((e for e in src if e.get("id") == ZONE_ID), None)
    if entry is None:
        entry = {"id": ZONE_ID}
        src.append(entry)
        print(f"[seoul-zones] 새 구역 추가: {ZONE_ID}")
    else:
        print(f"[seoul-zones] 기존 구역 갱신: {ZONE_ID}")
    entry.pop("asOf", None)
    entry.update({k: v for k, v in want.items() if k != "id"})
    entry["sid"] = ZONE_SOURCE_ID
    entry["asOf"] = META["asOf"]
    entry.pop("parts", None)
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
