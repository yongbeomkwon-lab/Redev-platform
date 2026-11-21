#!/usr/bin/env python3
"""
(가)휘경동 295 일대 신규 등록 — 동대문구 신속통합기획 연번부여 구역 (2026-11-21)

확인한 공식 자료
  · 동대문구 「신속통합기획 관련 동의양식번호 부여 및 구역공개(휘경동 295 일대)」(2024-08-27)
      - 동의양식번호 부여일자 2024-08-22, 구역 안내문 제1호
  · 동대문구 「신속통합기획관련 동의양식번호 부여 신청인 변경 알림」(2024-09-20)
  · 동대문구 「신속통합기획 주택재개발사업 입안요청 접수 알림 및 구역공개(휘경동 295 일대)」
    (2025-05-28, 도시정비소식 bbsNo=38 nttNo=168030) — 첨부 「구역 공개(휘경동 295번지 일대).hwpx」
      : 빨간 구역계(입안 신청인이 제출한 구역계 56점) + 지적도 + 동의양식번호 제1호 + 휘경2동 게시
  · 동대문구 결재문서 「신속통합기획 주택재개발사업 후보지 입안요청 반려 처리 알림」(2025-06-30, 비공개)
  · 동대문구 공고 제2025-926호(2025-07-01, 고시공고 notAncmtMgtNo=19852) 「신속통합기획
    주택재개발사업 후보지 신청 제한지역 공고」 — 첨부 「공고문.hwpx」
      : 후보지 추천 제외(사유 반대동의율 25% 이상), 재신청 유예기간 공고일로부터 6개월
        ('25.07.01.~'26.01.01.), 표의 구역면적 107,860.00㎡, 구역계는 첨부 도면
  · 재개발닷컴 (가)휘경동 295 사업정보(develops/5485) — 구역면적 115,122㎡, 토지등소유자 약
    1,268명(추정), 세대·노후도·용도지역·입지 등 집계값

경계를 옮긴 방법 (지어내지 않는다)
  1) 구역공개 hwpx 안의 구역계는 한글 도형 개체(hp:polygon, 56점)로 들어 있어 좌표를 그대로
     읽었다. 같은 문서의 지적도 사진(BinData/image1, 1462×926)에 이 도형이 겹쳐져 있고,
     문서 레이아웃 값(imgClip 3612~94577 × 0~66282, 75 unit/px)과 한글 미리보기(PrvImage)의
     빨간 선 위치로 도형 좌표 → 지적도 픽셀 대응을 잡았다:
         x_px = 0.030213 * x + 94.6 ,  y_px = 0.031378 * y + 75.5
     (이 대응으로 옮긴 도형 면적 114,900㎡가 구역면적 '약 11.5만㎡'와 0.2% 안에서 맞는다)
  2) 지적도 픽셀 → WGS84는 도면 안 지번 8곳의 카카오 지번 좌표로 최소제곱 아핀 적합
     (267-40 · 294-5 · 283-5 · 295-49 · 302-9 · 293-196 · 286-355 · 286-66).
     대조점 오차 2.3m 이내, 축척 0.4992 m/px로 가로·세로가 같다(지적도가 정북 방향).
  3) 재개발닷컴 등 다른 사이트의 폴리곤은 쓰지 않았다. 구청이 공개한 도면만 사용.

실행: python3 scripts/apply-hwigyeong295-20261121.py            (멱등 — 2회 실행 결과 동일)
      python3 scripts/apply-hwigyeong295-20261121.py --check    (검증만)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"

META_KEY = "hwigyeong295_20261121"

ZONE_ID = "rest17gu-ddm-가-휘경동-295"
ZONE_NAME = "(가)휘경동 295"
ZONE_STAGE = "연번부여(2024-08-22)·후보지 추천 제외(2025-06-30)"
ZONE_TYPE = "신통기획"
ZONE_KIND = "신속통합기획"
ZONE_GU = "동대문구"
ZONE_AREA = 115122
ZONE_SOURCE_ID = "동대문구 구역공개(2025-05-28)·동의양식번호 제1호(2024-08-22)"

ZONE_ALIAS = [
    "(가)휘경동 295",
    "(가칭)휘경동 295",
    "휘경동 295",
    "휘경동 295 일대",
    "휘경동 295번지 일대",
    "휘경동 295번지",
    "휘경동295",
    "휘경295",
    "휘경동 293-86",
    "휘경동 293-86번지 일대",
    "휘경동 295-49",
    "휘경2동 295",
]

ZONE_NOTE = (
    "동대문구 휘경동 295번지 일대(대표 지번 휘경동 293-86, 휘경2동) 신속통합기획 주택정비형 "
    "재개발 구역입니다. 회기역(경의중앙선) 도보 약 3분(273m), 서울휘경초 224m 거리의 노후 저층 "
    "주거지로, 구역면적 약 11.5만㎡(115,122㎡)·토지등소유자 약 1,268명(추정)입니다. 구역 안 "
    "1,228세대 가운데 공동주택 766세대·단독주택 462세대, 근린생활시설 37동이고, 30년 기준 노후도 "
    "71.5%(405/566동), 과소필지 21%, 4m 이상 도로 접도율 80%, 반지하 59%입니다. 용도지역은 "
    "제2종일반주거지역 111,259㎡(98%)가 대부분이고 준주거 2,108㎡(2%)가 섞여 있으며, 구역 안 "
    "휘경동 295-49(2,291㎡)에 종교시설이 하나 있습니다. 2024-08-22 동대문구가 동의양식(연번) "
    "제1호를 부여하며 구역을 공개했고(2024-09-20 입안 요청인 변경), 2025-05-28 입안요청이 접수되며 "
    "구역계가 다시 공개됐습니다. 이어 2025-06-30 후보지 입안요청이 반려(추천 제외)되어 2025-07-01 "
    "동대문구 공고 제2025-926호로 후보지 재신청 유예기간이 공고됐습니다. 추천 제외 사유는 반대동의율 "
    "25% 이상이고 유예기간은 공고일부터 6개월(2025-07-01~2026-01-01)입니다. 유예기간이 지난 지금은 "
    "번호부여·후보지 신청을 다시 할 수 있는 상태이지만, 2026-11-21 기준 재신청이나 후보지 선정 "
    "관련 공고가 확인되지 않아 진행단계는 연번부여에 머물러 있습니다."
)

ZONE_AREA_NOTE = (
    "구역면적 약 11.5만㎡(재개발닷컴 사업정보 115,122㎡·동대문구 구역공개 안내 '약 11.5만㎡') — "
    "2025-07-01 동대문구 공고 제2025-926호 표에는 107,860.00㎡로 적혀 있습니다(기재 기준 차이). "
    "이 구역계 도형의 면적은 약 114,900㎡입니다. 토지등소유자 약 1,268명(추정)."
)

ZONE_BOUNDARY_NOTE = (
    "동대문구 「구역 공개(휘경동 295번지 일대)」(2025-05-28 접수분) 첨부 한글문서의 빨간 구역계"
    "(입안 신청인이 제출한 56점 도형)를 지적도 필지선에 맞춰 옮겼습니다. 도면 안 지번 8곳"
    "(267-40·294-5·283-5·295-49·302-9·293-196·286-355·286-66)의 카카오 지번 좌표로 위치를 잡았고 "
    "대조점 오차는 2.3m 이내입니다. 구청 공고문에 '신청인이 제출한 구역계로 후보지 추천시 일부 "
    "변경·조정될 수 있음'이라 적혀 있어 확정 경계가 아닙니다. 인접 휘경마을(준공)·휘경동 281-1 "
    "외9(역세권)의 서울시 일반화 도형과 400㎡ 안팎 겹칩니다."
)

ZONE_SOURCES = [
    {
        "label": "동대문구 — 신속통합기획 주택재개발사업 입안요청 접수 알림 및 구역공개(휘경동 295 일대), 2025-05-28(도시정비소식)",
        "url": "https://www.ddm.go.kr/www/selectBbsNttView.do?key=904&bbsNo=38&nttNo=168030&searchCtgry=%EB%8F%84%EC%8B%9C%EC%A0%95%EB%B9%84&searchCnd=all&searchKrwd=&integrDeptCode=&pageIndex=2",
    },
    {
        "label": "동대문구 공고 제2025-926호 — 신속통합기획 주택재개발사업 후보지 신청 제한지역 공고(2025-07-01, 추천 제외·재신청 유예 6개월·구역면적 107,860.00㎡)",
        "url": "https://www.ddm.go.kr/www/selectEminwonWebView.do?key=3291&notAncmtMgtNo=19852&searchNotAncmtSeCode=01%2C02%2C04%2C05%2C06%2C07",
    },
    {
        "label": "동대문구 — 신속통합기획관련 동의양식번호 부여 및 구역공개(휘경동 295 일대), 2024-08-27(동의양식번호 2024-08-22 부여)",
        "url": "https://jaegebal.com/gnotices/ddm-etc-2024-23539",
    },
    {
        "label": "동대문구 — 신속통합기획관련 동의양식번호 부여 신청인 변경 알림(휘경동 295번지 일대), 2024-09-20",
        "url": "https://jaegebal.com/gnotices/ddm-etc-2024-23537",
    },
    {
        "label": "동대문구 결재문서 — 신속통합기획 주택재개발사업 후보지 입안요청 반려 처리 알림(2025-06-30, 비공개 문서)",
        "url": "https://jaegebal.com/gnotices/ddm-og-2025-381857",
    },
    {
        "label": "재개발닷컴 — (가)휘경동 295 사업정보(구역면적 115,122㎡·토지등소유자 약 1,268명·노후도 71.5%·용도지역)",
        "url": "https://jaegebal.com/develops/5485",
    },
]

# ── 구역계 도형 ──────────────────────────────────────────────────────────────
# 구역공개 hwpx 안 한글 도형(hp:polygon) 56점 → 지적도 픽셀 → WGS84.
# 위 문서 상단 주석의 변환식으로 만들었고, 아래 구현이 그 식을 그대로 다시 계산한다.
POLY_HWP = [
    [575, 9340], [1524, 10535], [2653, 9797], [3598, 10938], [3142, 11850], [3060, 12506],
    [3012, 13050], [2832, 13457], [2928, 13640], [2684, 13826], [2272, 13807], [2065, 14309],
    [0, 15814], [57, 16094], [958, 17245], [1221, 17171], [1296, 16818], [5001, 19039],
    [6252, 19375], [7508, 19011], [7713, 19438], [8314, 20200], [8933, 21185], [10059, 21594],
    [10697, 21836], [11148, 21947], [13719, 21631], [15502, 21816], [15426, 22021], [16853, 22374],
    [19968, 22467], [20418, 20943], [21563, 21315], [27794, 18769], [27156, 12972], [36182, 11857],
    [34944, 6430], [27924, 7415], [27098, 498], [26837, 149], [26048, 186], [24697, 0],
    [22652, 93], [19949, 1152], [20400, 2676], [17115, 3773], [11792, 5701], [11404, 5823],
    [8109, 7045], [8056, 7167], [7767, 6914], [7474, 6329], [7010, 5982], [6820, 5907],
    [7758, 3345], [870, 5758],
]
# 한글 도형 좌표 → 지적도 픽셀 (2025-05-28 구역공개 도면, 1462×926)
PX_SX, PX_SY, PX_TX, PX_TY = 0.030213, 0.031378, 94.6, 75.5
# 지적도 픽셀 → WGS84 (도면 안 지번 8곳 카카오 지번 좌표 최소제곱, 오차 2.3m 이내)
LAT_K = (1.7542754723569112e-08, -4.515469358823802e-06, 37.589512141269665)
LNG_K = (5.658466492322203e-06, 1.6579691334495697e-08, 127.0560256399534)

M_LAT = 110_540.0
M_LNG = 111_320.0 * math.cos(math.radians(37.587))


def zone_ring() -> list[list[float]]:
    """구역계 링 [위도, 경도] (닫는 점 없이 — 내보내기 규칙과 같다)."""
    ring = []
    for x, y in POLY_HWP:
        px = PX_SX * x + PX_TX
        py = PX_SY * y + PX_TY
        lat = LAT_K[0] * px + LAT_K[1] * py + LAT_K[2]
        lng = LNG_K[0] * px + LNG_K[1] * py + LNG_K[2]
        ring.append([round(lat, 7), round(lng, 7)])
    return ring


def ring_area_m2(ring: list[list[float]]) -> float:
    """링 면적(㎡) — 위경도를 국지 평면으로 펴서 신발끈 공식."""
    lng0 = sum(p[1] for p in ring) / len(ring)
    lat0 = sum(p[0] for p in ring) / len(ring)
    xs = [(p[1] - lng0) * M_LNG for p in ring]
    ys = [(p[0] - lat0) * M_LAT for p in ring]
    s = 0.0
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        s += xs[i] * ys[j] - ys[i] * xs[j]
    return abs(s) / 2


def _closed(ring: list[list[float]]) -> list[list[float]]:
    """GeoJSON 링(첫 점을 끝에 반복) — [경도, 위도]."""
    return [[lng, lat] for lat, lng in ring] + [[ring[0][1], ring[0][0]]]


META = {
    "asOf": "2026-11-21",
    "additions": 1,
    "polygons": 1,
    "zoneId": ZONE_ID,
    "stage": ZONE_STAGE,
    "note": (
        "동대문구 신속통합기획 연번부여 구역 (가)휘경동 295 신규 등록 — 동의양식번호 제1호 "
        "(2024-08-22), 2025-05-28 입안요청 접수·구역공개, 2025-06-30 후보지 추천 제외, "
        "2025-07-01 공고 제2025-926호로 재신청 유예기간 6개월('25.07.01~'26.01.01) 공고. "
        "경계는 구역공개 도면의 빨간 구역계(56점 도형)를 지적도에 맞춰 옮겼고(geom='공고도면'), "
        "도형 면적 약 114,900㎡는 안내된 '약 11.5만㎡'와 0.2% 차이. 타 사이트 폴리곤은 쓰지 않았습니다."
    ),
}


def _props() -> dict:
    ring = zone_ring()
    return {
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
        "note": ZONE_NOTE,
        "areaNote": ZONE_AREA_NOTE,
        "boundaryNote": ZONE_BOUNDARY_NOTE,
        "sources": ZONE_SOURCES,
        "polygon": ring,
    }


def check() -> int:
    bad = 0
    want = _props()
    ring = want["polygon"]
    area = ring_area_m2(ring)

    print(f"[{'OK' if len(ring) == 56 else 'FAIL'}] 도형 정점 {len(ring)}개(56 기대)")
    bad += 0 if len(ring) == 56 else 1
    ok_area = 108_000 < area < 120_000
    print(f"[{'OK' if ok_area else 'FAIL'}] 도형 면적 {area:,.0f}㎡ (108,000~120,000 기대 · 안내 '약 11.5만㎡')")
    bad += 0 if ok_area else 1
    lon_ok = all(-180 < p[0] < 180 and 33 < p[1] < 39 for p in _closed(ring))
    print(f"[{'OK' if lon_ok else 'FAIL'}] 좌표 범위(경도·위도 순서) 정상")
    bad += 0 if lon_ok else 1

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    ids = [f["properties"].get("id") for f in feats]
    dup = {i for i in ids if ids.count(i) > 1}
    print(f"[{'OK' if not dup else 'FAIL'}] 중복 id 없음 (features={len(feats)}, dup={sorted(dup)})")
    bad += 0 if not dup else 1

    feat = next((f for f in feats if f["properties"].get("id") == ZONE_ID), None)
    if feat is None:
        print(f"[FAIL] geojson에 구역 없음: {ZONE_ID}")
        return bad + 1
    p = feat["properties"]
    g = feat.get("geometry") or {}
    coords = (g.get("coordinates") or [[]])[0]
    same_ring = [[round(c[1], 7), round(c[0], 7)] for c in coords[:-1]] == ring
    ok = (
        g.get("type") == "Polygon"
        and same_ring
        and coords[0] == coords[-1]
        and p.get("name") == want["name"]
        and p.get("geom") == "공고도면"
        and abs(float(p.get("area") or 0) - ZONE_AREA) < 0.01
        and p.get("stage") == ZONE_STAGE
        and p.get("note") == ZONE_NOTE
        and p.get("boundaryNote") == ZONE_BOUNDARY_NOTE
        and all(a in (p.get("alias") or []) for a in ZONE_ALIAS)
    )
    print(
        f"[{'OK' if ok else 'FAIL'}] geojson {p.get('name')} ({ZONE_ID}) geom={p.get('geom')} "
        f"area={p.get('area')} verts={len(coords) - 1} alias={len(p.get('alias') or [])}"
    )
    bad += 0 if ok else 1

    for term in ("휘경동 295", "휘경동 295 일대", "(가)휘경동 295", "휘경295", "휘경동 293-86"):
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
        entry.get("name") == want["name"]
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

    meta_ok = geo.get("metadata", {}).get(META_KEY) is not None and geo["metadata"].get("count") == len(feats)
    print(
        f"[{'OK' if meta_ok else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(feats)} "
        f"batch={META_KEY in geo.get('metadata', {})}"
    )
    bad += 0 if meta_ok else 1
    print(f"→ 총 구역 수 {len(feats)}곳")
    return bad


def apply() -> int:
    want = _props()
    ring = want["polygon"]

    # 1) public/data/zones.geojson — 배포 산출물
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    feat = next((f for f in feats if f["properties"].get("id") == ZONE_ID), None)
    props = {"polygon": ring, **want}
    props.pop("polygon")
    props = {"id": ZONE_ID, **props, "polygon": ring}
    geometry = {"type": "Polygon", "coordinates": [_closed(ring)]}
    if feat is None:
        feats.append({"type": "Feature", "id": ZONE_ID, "properties": props, "geometry": geometry})
        print(f"[geojson] 새 구역 추가: {ZONE_NAME} ({ZONE_ID})")
    else:
        feat["properties"] = props
        feat["geometry"] = geometry
        print(f"[geojson] 기존 구역 갱신: {ZONE_NAME} ({ZONE_ID})")
    print(f"          정점 {len(ring)}개 · 도형 면적 {ring_area_m2(ring):,.0f}㎡ · stage {ZONE_STAGE}")
    geo.setdefault("metadata", {})[META_KEY] = META
    geo["metadata"]["count"] = len(feats)
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] features={len(feats)}")

    # 2) src/data/seoul-zones.json — 파이프라인 원천
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((e for e in src if e.get("id") == ZONE_ID), None)
    if entry is None:
        entry = {"id": ZONE_ID}
        src.append(entry)
        print(f"[seoul-zones] 새 구역 추가: {ZONE_ID}")
    else:
        print(f"[seoul-zones] 기존 구역 갱신: {ZONE_ID}")
    entry.update({k: v for k, v in want.items() if k != "sourceId"})
    entry["sid"] = want["sourceId"]
    entry.pop("parts", None)
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
