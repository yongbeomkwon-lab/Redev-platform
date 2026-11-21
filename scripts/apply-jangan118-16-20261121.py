#!/usr/bin/env python3
"""
장안동 118-16 (rest17gu-ddm-장안동-118-16) 구역계 도면 반영 — 동대문구 신속통합기획 연번부여 구역

근거(공식 자료)
  · 동대문구 구정소식 「신속통합기획 주택재개발사업 수시모집 관련 동의서 번호부여 요청 구역 공개」
    (2023-06-09, 담당 주거정비과, bbsNo=38 nttNo=128230)
    첨부 「구역 공개_장안동 118-16번지 일대.pdf」 (2쪽)
      1쪽: 지적도 위 빨간 실선 = 장안동 118-16 일대 구역계(신청인 제출), 라벨 배봉초교·고차로·
            장안2동 주민센터·장안근린공원·성당·데시앙 APT
      2쪽: 추진주체(번호부여 신청인) 공개, 동의양식번호 제4호, 번호부여일자 2023.06.09,
            공개장소 동대문구 홈페이지>구정소식·장안2동 주민센터 게시판
  · 재개발닷컴 (가)장안동 118-16 사업정보 — 구역면적 73,670㎡, 토지등소유자 약 587명(추정),
    전체 552세대(공동주택 268·단독 284), 근린생활시설 67동, 노후도 89.8%(301/335동),
    과소필지 14%, 4m 접도율 63%, 반지하 50%, 용도지역 제2종 53,332㎡(72%)·제3종 20,607㎡(28%)
  · 정비닥터 장안동 118-16 — 사업면적 74,439㎡, 노후도 90.7%, 과소필지 15.5%, 접도율 36.6%,
    호수밀도 60.7호/ha, 반지하 60.7%, 2025-10-16 조정대상지역·투기과열지구 지정,
    2025-10-20 토지거래허가구역 지정

경계를 옮긴 방법 (타 사이트 폴리곤은 쓰지 않았다)
  1) PDF 1쪽 지적도(BinData Im1, 581×671px JPEG) 위 빨간 실선을 색 분리해 추적
     (빨강 4,714px → 내부 채움 → 외곽 윤곽 536점). 선 두께가 평균 2.5px라 중심선까지 1.2px
     안쪽으로 줄이고, Douglas–Peucker 0.9px로 단순화 → 74점(최대 이탈 0.66m).
  2) 도면에 축척 표기가 없고 스캔 해상도가 낮아 지번 글자를 읽을 수 없어, 도로·필지 패턴으로
     위치를 잡았다. 반경 800m OSM 도로망 1,319개 way를 2m 간격으로 표본(도형 안 1,276점)해
     도면의 도로 통로(연한 노랑, R≥250·G≥247·B 202~240)까지의 거리를 최소화하는
     축척·회전·이동을 최소제곱으로 구했다 → 회전 0°(지적도가 정북 방향), 평균 오차 1.3px(≈1.0m).
  3) 축척은 집계 구역면적 73,670㎡(약 7.4만㎡)에 맞춰 정했다(0.7451 m/px). 도로망만으로
     추정한 축척 범위(0.72~0.75 m/px)와 겹치고, 정비닥터 집계 74,439㎡와도 1% 차이다.
  4) 위치 검증: 폴리곤이 장한로 남측·장안근린공원 서측·장안2동 주민센터 남서측·
     천주교 장안동성당 북측에 놓여 도면 라벨과 지적 패턴이 모두 맞는다.

원칙
  · 공고문에 적힌 것과 공개 자료로 확인한 값만 적는다(집계값은 집계라고 밝힌다).
  · 구역 안에 들어간 가로주택(장안동 104-21, 96.7% 겹침)은 지우지 않고 note 에 병기한다 —
    부모 구역이 정비구역으로 지정된 장안1구역과 달리 이 구역은 번호부여 단계다.
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용:
  python3 scripts/apply-jangan118-16-20261121.py
  python3 scripts/apply-jangan118-16-20261121.py --check
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"

META_KEY = "jangan118_16_20261121"

ZONE_ID = "rest17gu-ddm-장안동-118-16"
ZONE_NAME = "장안동 118-16"
ZONE_TYPE = "신통기획"
ZONE_KIND = "신속통합기획"
ZONE_STAGE = "번호부여(2023-06-09)"
ZONE_GU = "동대문구"
ZONE_AREA = 73670
ZONE_SOURCE_ID = "동대문구 구역공개(2023-06-09)·동의양식번호 제4호"

ZONE_ALIAS = [
    "장안동 118-16",
    "장안동 118-16번지 일대",
    "장안동 118-16번지",
    "장안동 118-16 일대",
    "장안동118-16",
    "장안동 118-16일대",
    "(가)장안동 118-16",
    "(가칭)장안동 118-16",
    "가칭 장안동 118-16",
    "장안 118-16",
    "장안118-16",
    "장안동 118-16 재개발",
    "장안2동 118-16",
]

ZONE_NOTE = (
    "동대문구 장안동 118-16번지 일대(장안2동) 신속통합기획 주택재개발 사업지입니다. "
    "구역면적 약 7.4만㎡(73,670~74,439㎡)에 토지등소유자 약 587명(추정), 552세대"
    "(공동주택 268·단독주택 284)와 근린생활시설 67동이 모인 노후 저층 주거지입니다. "
    "30년 기준 노후도 89.8%(301/335동)로 90%에 가깝고, 과소필지 14%, 4m 이상 도로 접도율 63%, "
    "반지하 50%입니다. 용도지역은 제2종일반주거지역 53,332㎡(72%)가 대부분이고 제3종일반주거지역 "
    "20,607㎡(28%)가 섞여 있습니다. "
    "2023-05-08 서울시 「신속통합기획 주택재개발사업 후보지 수시 모집 안내문」의 동의서 번호부여 "
    "의무화에 따라 (가칭)추진주체가 번호부여를 요청해, 2023-06-09 동대문구가 구역계를 공개하고 "
    "동의양식번호 제4호를 부여했습니다(공개 장소: 동대문구 홈페이지·장안2동 주민센터 게시판). "
    "이후 2026-11-21 기준 후보지 선정 공고는 확인되지 않아 진행단계는 연번부여에 머물러 있습니다. "
    "입지로는 북쪽에 장한로, 동쪽에 장안근린공원, 북동쪽에 장안2동 주민센터·서울장안2동우체국, "
    "북서쪽에 서울배봉초등학교와 배봉산이 있고, 남쪽 도로 건너에 2026-06-11 정비구역으로 지정된 "
    "장안1구역(장안동 134-15 일대)과 마주합니다. 지하철은 7호선 용마산역·사가정역이 모두 약 1.4~1.6km "
    "거리로 도보보다 버스 이용이 편한 자리입니다. 2025-10-16 조정대상지역·투기과열지구, "
    "2025-10-20 토지거래허가구역으로 지정돼 거래 시 확인이 필요합니다. "
    "구역 안에는 (가칭)장안동 104-21번지 일원 가로주택정비사업 구역(7,503㎡·조합설립인가 추진중)이 "
    "96.7% 겹쳐 있고, 구역 경계에는 장안동 120-15·121-18·289-10 가로주택정비사업 구역이 각각 "
    "100~200㎡씩 걸칩니다. 신속통합기획 후보지 구역계는 신청인이 제출한 것이라 후보지 추천·기획 "
    "과정에서 조정될 수 있습니다."
)

ZONE_AREA_NOTE = (
    "도면 구역계의 도형 면적 73,669㎡입니다. 재개발닷컴 집계 구역면적 73,670㎡, 정비닥터 집계 "
    "74,439㎡(약 7.4만㎡)와 같은 범위입니다. 도면에 축척 표기가 없어 축척은 집계 구역면적 73,670㎡에 "
    "맞춰 정했고(0.745 m/px), 도로망 정합으로 추정한 축척 범위(0.72~0.75 m/px)와 겹칩니다. "
    "토지등소유자 약 587명(추정)·552세대."
)

ZONE_BOUNDARY_NOTE = (
    "동대문구 「구역 공개_장안동 118-16번지 일대.pdf」(2023-06-09) 1쪽 지적도 위 빨간 실선"
    "(신청인이 제출한 구역계)을 그대로 옮겼습니다. 원본 스캔이 581×671px이라 지번 글자를 읽을 수 없어, "
    "도면 안팎의 도로·필지 패턴을 OSM 도로망(도로 1,319개 구간·표본 1,276점)에 정합해 위치를 잡았습니다 — "
    "평균 오차 1.3px(≈1.0m), 회전 0°(지적도가 정북 방향). 폴리곤은 장한로 남측·장안근린공원 서측·"
    "장안2동 주민센터 남서측·천주교 장안동성당 북측에 놓여 도면 라벨과 일치합니다. "
    "공고문에 '신청인이 제출한 구역계로 후보지 추천 시 일부 변경·조정될 수 있음'이라 적혀 있어 "
    "확정 경계가 아닙니다. 구역 안 가로주택(장안동 104-21) 도형과 96.7% 겹칩니다."
)

ZONE_SOURCES = [
    {
        "label": "동대문구 구정소식 — 신속통합기획 주택재개발사업 수시모집 관련 동의서 번호부여 요청 구역 공개(2023-06-09, 주거정비과)",
        "url": "https://www.ddm.go.kr/www/selectBbsNttView.do?bbsNo=38&integrDeptCode=&key=198&nttNo=128230&pageIndex=1&searchCnd=all&searchCtgry=&searchKrwd=",
    },
    {
        "label": "동대문구 첨부 — 구역 공개_장안동 118-16번지 일대.pdf (지적도 위 구역계·동의양식번호 제4호 2023.06.09)",
        "url": "https://www.ddm.go.kr/www/downloadBbsFile.do?atchmnflNo=0494425328518DC5852565D6569B5948",
    },
    {
        "label": "재개발닷컴 — (가)장안동 118-16 사업정보(구역면적 73,670㎡·노후도 89.8%·552세대·소유자 약 587명·용도지역)",
        "url": "https://jaegebal.com/develops/4647",
    },
    {
        "label": "정비닥터 — 장안동 118-16(사업면적 74,439㎡·노후도 90.7%·규제지역 지정일)",
        "url": "https://www.jbdoctor.com/r/3495",
    },
]

# ── 구역계 도형 ──────────────────────────────────────────────────────────────
# PDF 1쪽 지적도의 빨간 실선(중심선)을 추적 → 정북 정합 → WGS84. [위도, 경도], 닫는 점 없음.
RING = [
    [37.5759405, 127.0677325], [37.5759336, 127.0678127], [37.5757923, 127.0685382],
    [37.5757921, 127.068581], [37.5757652, 127.0686825], [37.5757517, 127.0688092],
    [37.5757384, 127.0688353], [37.5757383, 127.0688848], [37.5757249, 127.0689271],
    [37.5757246, 127.0689703], [37.5757111, 127.0689964], [37.5756842, 127.0691898],
    [37.5755967, 127.0695862], [37.5755764, 127.0697469], [37.5755564, 127.0697895],
    [37.5755426, 127.0699077], [37.5754214, 127.0704558], [37.5753946, 127.0706331],
    [37.5753748, 127.0710742], [37.5753807, 127.071141], [37.5754027, 127.0711616],
    [37.5767874, 127.0712572], [37.5768008, 127.070985], [37.5768105, 127.0709697],
    [37.5770348, 127.0709757], [37.5770367, 127.070833], [37.577053, 127.0707924],
    [37.5771264, 127.0707901], [37.5771732, 127.0708066], [37.5771985, 127.0708003],
    [37.5771986, 127.0707475], [37.5772189, 127.0706292], [37.5773333, 127.0701143],
    [37.5773404, 127.0700117], [37.5773593, 127.0699796], [37.5776995, 127.0700299],
    [37.5779425, 127.0700807], [37.5780979, 127.0700976], [37.5784817, 127.0701735],
    [37.5786336, 127.0701894], [37.5786141, 127.069965], [37.5786141, 127.0698218],
    [37.5786006, 127.0697618], [37.5785806, 127.0692928], [37.5785737, 127.0692803],
    [37.5785535, 127.0686817], [37.5785406, 127.0686174], [37.5784698, 127.0685125],
    [37.5784116, 127.0685043], [37.5782974, 127.0684623], [37.5782633, 127.0684621],
    [37.5782156, 127.0684368], [37.5781555, 127.0684283], [37.5779936, 127.0683692],
    [37.577933, 127.0683608], [37.5777711, 127.0683016], [37.5776831, 127.0682846],
    [37.5776563, 127.0682681], [37.5776222, 127.0682677], [37.5775547, 127.0682339],
    [37.577292, 127.0681579], [37.577003, 127.0680569], [37.5769683, 127.0680565],
    [37.5769538, 127.06804], [37.5767665, 127.067989], [37.5767457, 127.0679725],
    [37.5767189, 127.067972], [37.5765852, 127.0679218], [37.5765368, 127.0679213],
    [37.5765268, 127.0679032], [37.5764632, 127.0678793], [37.5762615, 127.0678372],
    [37.5760526, 127.0677529], [37.5759591, 127.0677278],
]

M_LAT = 110_540.0
M_LNG = 111_320.0 * math.cos(math.radians(37.577))

META = {
    "asOf": "2026-11-21",
    "polygons": 1,
    "zoneId": ZONE_ID,
    "stage": ZONE_STAGE,
    "note": (
        "장안동 118-16 구역계 도면 반영 — 동대문구 구역 공개(2023-06-09, 동의양식번호 제4호) PDF "
        "1쪽 지적도의 빨간 실선을 74점 폴리곤으로 옮기고(geom='공고도면'), 축척은 집계 구역면적 "
        "73,670㎡에 맞춰 정했다. 위치는 OSM 도로망 정합(평균 1.3px≈1.0m, 회전 0°). "
        "면적 73,670㎡, 552세대·소유자 약 587명·노후도 89.8% 등 재개발닷컴·정비닥터 집계를 note 에 "
        "병기. 구역 안 장안동 104-21 가로주택(96.7% 겹침)은 지우지 않고 note 에 적었다. "
        "타 사이트 폴리곤은 쓰지 않았다."
    ),
}


def ring_area_m2(ring: list[list[float]]) -> float:
    lng0 = sum(p[1] for p in ring) / len(ring)
    lat0 = sum(p[0] for p in ring) / len(ring)
    xs = [(p[1] - lng0) * M_LNG for p in ring]
    ys = [(p[0] - lat0) * M_LAT for p in ring]
    s = 0.0
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        s += xs[i] * ys[j] - xs[j] * ys[i]
    return abs(s) / 2


def centroid(ring: list[list[float]]) -> list[float]:
    a = 0.0
    cx = cy = 0.0
    lng0 = ring[0][1]
    lat0 = ring[0][0]
    pts = [((p[1] - lng0) * M_LNG, (p[0] - lat0) * M_LAT) for p in ring]
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    a *= 0.5
    cx /= 6 * a
    cy /= 6 * a
    return [round(lat0 + cy / M_LAT, 7), round(lng0 + cx / M_LNG, 7)]


def _closed(ring: list[list[float]]) -> list[list[float]]:
    """GeoJSON 링(첫 점을 끝에 반복) — [경도, 위도]."""
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

    print(f"[{'OK' if len(ring) == 74 else 'FAIL'}] 도형 정점 {len(ring)}개(74 기대)")
    bad += 0 if len(ring) == 74 else 1
    ok_area = abs(area - ZONE_AREA) < 200
    print(f"[{'OK' if ok_area else 'FAIL'}] 도형 면적 {area:,.0f}㎡ (집계 73,670㎡와 200㎡ 이내)")
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

    for term in ("장안동 118-16", "(가)장안동 118-16", "장안동 118-16 일대", "장안 118-16", "장안동118-16"):
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
        f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {entry.get('name')} polygon={len(entry.get('polygon') or [])} "
        f"geom={entry.get('geom')} stage={entry.get('stage')}"
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
        feats.append({"type": "Feature", "id": ZONE_ID, "properties": want, "geometry": geometry})
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
