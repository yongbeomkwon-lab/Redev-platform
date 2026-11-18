#!/usr/bin/env python3
"""
2026-11-18 야간 — 사용자가 보낸 공식 PDF 3건 반영.

1) 서울특별시고시 제2025-734호(2025.12.26, 건축허가등 제한 지형도면 고시)
   · 신규 선정: 금천 독산동 979(93,990㎡)·독산동 1022(83,203㎡)·강북 수유동 310-15(15,944㎡)
               · 은평 신사동 300(30,222㎡)·마포 신수동 250(44,718㎡)
   · 면적 변경: 영등포 신길동 90-31(80,811→58,162㎡)·성북 정릉동 16-179(60,329→42,810㎡)
   · 기간 연장(미선정): 마포 노고산동 19-1(56,995㎡)
   → 이미 있는 구역은 면적·단계·출처를 고시 값으로 맞추고, 없던 '수유동 310-15'를 추가한다.
   (지형도면은 스캔 도면이라 좌표 정합 없이 면적·고시 사실만 반영. 다각형은 추후 과제)

2) 서울시 공문(2026.10.14, 접수 공공주택과-12417)
   광흥창역세권(신수동 301-1) 정비구역 지정·정비계획 결정 및 지형도면 고시 — 기존 구역에 출처 추가.

3) 마포구 공고 제2026-1046호(2026.7.2, 10쪽)
   광흥창역세권(현석동 1-31 일원) 정비구역 지정 및 정비계획 결정(안) 공람
   — 면적 22,746.4㎡, 추정비례율 110.32%, 토지이용·용도지역·추정분담금 수치를 상세에 반영.

실행 순서(멱등): npm run geojson → official_supplement.py → apply-news-20261118.py
                → apply-extra-zones-20261118.py → apply-official-pdfs-20261118.py
사용: python3 scripts/apply-official-pdfs-20261118.py [--check]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "public" / "data" / "zones.geojson"

M_LAT = 110_540.0
M_LNG = 111_320.0 * math.cos(math.radians(37.575))

GOSI_2025_734 = (
    "서울특별시고시 제2025-734호 「건축허가등 제한 지형도면 고시」(2025-12-26, 서울시보 제4114호) — "
    "'25년 제6차(12월) 신속통합기획 주택재개발 후보지 상정구역"
)
GOSI_URL = "https://www.seoul.go.kr/"
MAPO_2026_1046 = "마포구 공고 제2026-1046호 「광흥창역세권(현석동 1-31일원) 장기전세주택 도시정비형 재개발사업 정비구역 지정 및 정비계획 결정(안) 공람공고」(2026-07-02)"
SEOUL_2026_1014 = "서울시 공문 공공주택과-12417(2026-10-14) 「광흥창역세권(신수동 301-1번지 일원) 장기전세주택 도시정비형 재개발사업 정비구역 지정 및 정비계획 결정 및 지형도면 고시」"


def circle_ring(lat, lng, radius_m, points=96):
    ring = []
    for i in range(points):
        t = 2 * math.pi * i / points
        ring.append([round(lng + radius_m * math.cos(t) / M_LNG, 7), round(lat + radius_m * math.sin(t) / M_LAT, 7)])
    ring.append(ring[0][:])
    return ring


def find(features, zone_id):
    for f in features:
        if f["properties"].get("id") == zone_id:
            return f
    raise SystemExit(f"[실패] 구역 없음: {zone_id}")


def add_source(props, label, url):
    cur = props.get("sources") or []
    if any(s.get("label") == label for s in cur):
        return
    cur.append({"label": label, "url": url})
    props["sources"] = cur


def add_alias(props, extra):
    cur = props.get("alias") or []
    for a in extra:
        if a not in cur:
            cur.append(a)
    props["alias"] = list(dict.fromkeys(cur))


# ── 고시 2025-734 반영 대상 ────────────────────────────────────────────────
RESTRICT = [
    (
        "11545UQ120PS202603100003",
        93990,
        "독산동 979",
        "2025-12-26 건축허가등 제한(신규 선정, 제한면적 93,990㎡·제한기간 2년)이 고시됐습니다. "
        "이 구역은 2026-03-10 서울플랜+에 대상지선정(추진중)으로 올라와 있습니다.",
    ),
    (
        "11545UQ120PS202603100001",
        83203,
        "독산동 1022",
        "2025-12-26 건축허가등 제한(신규 선정, 제한면적 83,203㎡·제한기간 2년)이 고시됐습니다.",
    ),
    (
        "sinsa-300",
        30222,
        "신사동 300",
        "2025-12-26 건축허가등 제한(신규 선정, 제한면적 30,222㎡)이 고시됐습니다. "
        "은평구 신사동 300번지 일대 신속통합기획 주택재개발 후보지입니다.",
    ),
    (
        "mp-shinsu-250",
        44718,
        "신수동 250",
        "2025-12-26 건축허가등 제한(신규 선정, 제한면적 44,718㎡)이 고시됐습니다. "
        "마포구 신수동 250번지 일대로, 리디브에는 신수13구역(신통기획 후보지 선정 2025-12-16)으로 들어가 있습니다.",
    ),
    (
        "singil-90-31",
        58162,
        "신길동 90-31",
        "2025-12-26 고시에서 건축허가 제한면적이 기정 80,811㎡에서 58,162㎡로 변경(확대 10,570·제척 33,219)됐습니다. "
        "종전 고시는 서울특별시고시 제2024-382호입니다.",
    ),
    (
        "jeongneung-16-179",
        42810,
        "정릉동 16-179",
        "2025-12-26 고시에서 건축허가 제한면적이 기정 60,329㎡에서 42,810㎡로 변경(제척 17,519)됐습니다. "
        "종전 고시는 서울특별시고시 제2024-569호입니다.",
    ),
]


def apply_restrictions(features):
    for zone_id, area, label, text in RESTRICT:
        props = find(features, zone_id)["properties"]
        props["area"] = area
        props["stage"] = "건축허가등 제한(2025-12-26)"
        base = props.get("note") or ""
        marker = "2025-12-26 건축허가등 제한"
        if marker not in base:
            props["note"] = (base + " " if base else "") + text
        props["areaNote"] = f"건축허가 제한면적 {area:,}㎡ — {GOSI_2025_734}"
        add_source(props, GOSI_2025_734, GOSI_URL)
        print(f"[고시] {label} — 면적 {area:,}㎡·건축허가 제한")


# ── 신규: 수유동 310-15 (신통기획 후보지) ─────────────────────────────────
def apply_suyu(features):
    zone_id = "gangbuk-suyu-310-15"
    if any(f["properties"].get("id") == zone_id for f in features):
        print("[건너뜀] 수유동 310-15 — 이미 있음")
        return 0
    area = 15944
    radius = math.sqrt(area / math.pi)
    center = [37.64266, 127.015743]
    props = {
        "id": zone_id,
        "name": "수유동 310-15",
        "alias": ["수유동 310-15 일대", "수유동310-15", "수유동 310", "수유동 313-8 일대"],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "건축허가등 제한(2025-12-26)",
        "gu": "강북구",
        "area": area,
        "featured": False,
        "sourceId": "서울특별시고시 제2025-734호",
        "geom": "근사원",
        "boundaryApprox": True,
        "center": center,
        "centerLabel": "대표 지번 수유동 310-15(도면상 중심부 필지 313-8 일대)",
        "boundaryNote": (
            f"위치 참고용 점선원 — 고시 지형도면의 구역계를 좌표로 옮기지 못해 대표 지번 중심 반경 약 {radius:.0f}m"
            f"(면적 {area:,}㎡를 원으로 환산)로 표시합니다. 실제 구역계는 고시 지형도면(서울시보 제4114호 41쪽) 참조."
        ),
        "areaNote": f"건축허가 제한면적 {area:,}㎡ — {GOSI_2025_734}",
        "note": (
            "'25년 제6차(12월) 신속통합기획 주택재개발 후보지로 상정돼 2025-12-26 건축허가등 제한이 고시됐습니다"
            "(수유동 310-15 일대, 15,944㎡). 같은 지번 일대에 (가칭)수유동 310-15번지 일대 가로주택정비사업"
            "(별개 사업, 4,908㎡)이 있어 검색 별칭에 함께 넣었습니다."
        ),
        "sources": [{"label": GOSI_2025_734, "url": GOSI_URL}],
    }
    features.append(
        {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [circle_ring(center[0], center[1], radius)]},
            "properties": props,
        }
    )
    print(f"[추가] 수유동 310-15 (신통기획 후보지, {area:,}㎡)")
    return 1


# ── 광흥창역세권 2곳 ─────────────────────────────────────────────────────
def apply_gwangheungchang(features):
    p = find(features, "mp-shinsu-301-1")["properties"]
    p["stage"] = "정비구역 지정·고시(2026-10-22)"
    p["area"] = 15734.9
    add_source(p, SEOUL_2026_1014, "https://www.seoul.go.kr/")
    if "서울시 고시 제2026-590호" not in (p.get("note") or ""):
        p["note"] = (p.get("note") or "") + (
            " 2026-10-14 서울시 공문(공공주택과-12417)으로 정비구역 지정 및 정비계획 결정·지형도면 고시가 "
            "통보됐고, 서울시 고시 제2026-590호(2026-10-22)로 고시됐습니다."
        )
    print("[보강] 광흥창역세권(신수동 301-1) — 정비구역 지정·고시")

    h = find(features, "mp-hyeonseok-1-31")["properties"]
    h["area"] = 22746.4
    h["stage"] = "정비구역 지정(안) 공람(2026-07-02~08-03)"
    h["note"] = (
        "광흥창역세권(현석동 1-31 일원) 장기전세주택 도시정비형 재개발사업입니다. 마포구가 2026-07-02 "
        "공고 제2026-1046호로 정비구역 지정 및 정비계획 결정(안) 공람을 시작했습니다(공람 2026.7.2~8.3). "
        "구역면적 22,746.4㎡, 토지이용계획은 정비기반시설 5,272.4㎡(도로 3,152.4·공원 2,120.0)와 획지 "
        "17,474.0㎡(획지1 16,009.0 공동주택·부대복리시설, 획지2 816.0 산모건강증진센터, 획지3 649.0)이고, "
        "용도지역은 제2종(7층 이하) 15,934㎡를 준주거지역으로 올립니다. 추정비례율은 110.32%"
        "(총수입 7,811.9억·총지출 4,279.6억·종전자산 3,201.8억), 추정분담금은 전용 59.9㎡ 기준 약 12.24억원"
        " 수준으로 공고문이 산출했습니다. 정비구역 지정(안) 단계라 최종 고시 내용과 달라질 수 있습니다."
    )
    h["areaNote"] = "구역면적 22,746.4㎡(공고문) / 추정비례율 110.32%"
    add_source(h, MAPO_2026_1046, "https://www.mapo.go.kr/")
    print("[보강] 광흥창역세권(현석동 1-31) — 공람 수치·비례율·분담금 반영")
    return 2


def apply_sangsu(features):
    """마포구 상수동 319-4번지 일대 — 마포구 동의서 번호부여(제19호, 2026-09-22) 안내문 1쪽 구역도."""
    zone_id = "mapo-sangsu-319-4"
    if any(f["properties"].get("id") == zone_id for f in features):
        print("[건너뜀] 상수동 319-4 — 이미 있음")
        return 0
    src = ROOT / "scripts" / "data" / "official-sangsu-319-4.json"
    d = json.loads(src.read_text(encoding="utf-8"))
    ring = [[p[1], p[0]] for p in d["polygon"]]
    ring.append(ring[0][:])
    props = {
        "id": zone_id,
        "name": "상수동 319-4",
        "alias": [
            "상수동 319-4번지 일대",
            "상수동319-4",
            "상수동 319",
            "당인동 일대",
            "당인동",
            "서강동 일대",
        ],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "연번부여(2026-09-22, 제19호)",
        "gu": "마포구",
        "area": d["area"],
        "featured": False,
        "sourceId": "마포구 동의서 번호부여 안내문 2026-09-22",
        "geom": "공고도면",
        "center": d["center"],
        "centerLabel": "상수동 319-4번지 일대(마포구 안내문 구역도 중심)",
        "boundaryNote": (
            "마포구 「상수동 319-4번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개」 안내문"
            "(번호부여일 2026-09-22, 동의양식 제19호) 1쪽 구역도의 붉은 구역계를 따라 옮긴 폴리곤. "
            "도면 속 지번 10곳(319-4·320-6·321-7·335-8·336-3·328-5·332-1·334-13·338-14 등)의 카카오 지번 좌표로"
            "아핀 정합했고 잔차는 5~19m입니다(지번 라벨 위치 오차 포함). 지번 대조 기준 오차 ±15m 수준이며, "
            "신청인이 제출한 구역계라 후보지 추천·정비구역 지정 과정에서 조정될 수 있습니다."
        ),
        "areaNote": (
            f"공고문에 구역면적 표기가 없어 도면에서 옮긴 폴리곤 면적으로 산출했습니다 — {d['area']:,}㎡(약 {d['area'] / 3.305785:,.0f}평)"
        ),
        "note": (
            "마포구가 2026-09-22 상수동 319-4번지 일대에 대해 동의서 번호부여(동의양식 제19호) 후 구역계를 "
            "공개했습니다. 안내문은 이 일대에 3개 추진주체가 연번(16·18·19호)을 받은 지역이라 구역계와 동의서 "
            "연번을 반드시 확인하라고 안내합니다 — 리디브에 이미 있는 (가칭)당인동 15-22구역(연번 16호, "
            "66,803㎡)과 구역이 겹치거나 맞닿을 수 있습니다. 후보지 선정 전이라 경계·면적은 변경될 수 있습니다."
        ),
        "sources": [
            {
                "label": "마포구 — 상수동 319-4번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개(2026-09-22, 동의양식 제19호)",
                "url": "https://www.mapo.go.kr/",
            }
        ],
    }
    features.append(
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": props}
    )
    print(f"[추가] 상수동 319-4 (공고도면 다각형, {d['area']:,}㎡)")
    return 1


def apply_sadang419(features):
    """(가칭)사당동 419 일대 민간도심복합 — 사용자 제공 사업지 분석 이미지 2장에서 옮긴 경계.

    · IMG_0236(카카오 지도 화면): 사업대상지 35,688.1㎡ 폴리곤 내부 음영을 따라 추적
    · 지도 위 지물 7곳(다인공방·네오베이커리·산빛교회·삼성할인마트·황금종교회·최윤정치과·정안사)의
      카카오 좌표로 아핀 정합(잔차 0.8~12.3m) → 면적을 공지된 35,688.1㎡에 맞춰 미세 조정
    · 사당15구역(사당동 419-1, 서울시 UQ120 경계)과 겹치는 부분은 차집합으로 정리
    """
    zone_id = "dj-sadang-419-mdb"
    if any(f["properties"].get("id") == zone_id for f in features):
        print("[건너뜀] 사당동 419 민간도심복합 — 이미 있음")
        return 0
    src = ROOT / "scripts" / "data" / "official-sadang-419.json"
    d = json.loads(src.read_text(encoding="utf-8"))
    ring = [[p[1], p[0]] for p in d["polygon"]]
    ring.append(ring[0][:])
    props = {
        "id": zone_id,
        "name": "(가칭)사당동 419 일대 민간도심복합",
        "alias": [
            "사당동 419",
            "사당동 419 일대",
            "사당동419",
            "사당역세권 민간도심복합",
            "사당동 419 일대 민간도심복합",
            "(가칭)사당동 419 일대 민간도심복합",
        ],
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발(주거중심형)",
        "stage": "추진준비",
        "gu": "동작구",
        "area": d["area"],
        "featured": False,
        "sourceId": "사업지 현황 분석 자료(사용자 제공)",
        "geom": "가상경계",
        "center": d["center"],
        "centerLabel": "사당로·남부순환로 사이 사당동 419 일대(사당역 서북쪽)",
        "areaNote": (
            "사업대상지 35,688.1㎡(약 10,796평) — 제공 자료 표기 / 사당15구역과 겹친 부분을 뺀 지도 도형 면적 35,008㎡. 참고로 전체 검토범위(총면적)는 56,477.0㎡"
        ),
        "boundaryNote": (
            "사용자가 보낸 사업지 현황 분석 자료 2장에서 옮긴 참고 경계입니다. 카카오 지도 화면(IMG_0236)의"
            " 35,688.1㎡ 폴리곤 내부 음영을 따라 추적하고, 지도 위 지물 7곳(다인공방·네오베이커리·산빛교회·"
            "삼성할인마트·황금종교회·최윤정치과의원·정안사)의 카카오 좌표로 정합한 뒤(잔차 0.8~12.3m)"
            " 면적을 35,688.1㎡에 맞췄습니다. 사당15구역(사당동 419-1 일대, 서울시 UQ120 경계)과 겹친 부분은"
            " 차집합으로 정리해 지도에서 두 구역이 겹치지 않게 했습니다. 공식 고시 전 추진준비 단계여서"
            " 실제 구역계와는 ±10~15m 차이가 있을 수 있습니다."
        ),
        "note": (
            "사당역 서북쪽 사당동 419 일대(사당로·남부순환로 사이)에서 추진 중인 (가칭)민간도심복합개발사업입니다."
            " 제공 자료는 서울특별시 「도심 복합개발 지원에 관한 조례」(2026.1.5.) 준용 검토를 전제로 사업대상지"
            " 35,688.1㎡와 역세권 경계(350m·500m)를 표시하고 있습니다. 인접한 사당동 419-1 일대는 사당15구역"
            "(신속통합기획, 대상지 선정 추진중)으로 이미 따로 추진되고 있어 두 사업의 경계·추진 주체를 함께"
            " 확인해야 합니다. 고시된 구역계가 없는 추진준비 단계입니다."
        ),
        "sources": [],
    }
    feat = {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": props}

    # 사당15구역과 겹치는 부분은 차집합으로 정리(멱등)
    try:
        from shapely.geometry import shape as shp_shape

        official = next(
            (f for f in features if f["properties"].get("id") == "11000UQ120PS202601310020"), None
        )
        if official is not None:
            import shapely
            from shapely.geometry import Polygon as SPoly

            g = SPoly(feat["geometry"]["coordinates"][0])
            go = shp_shape(official["geometry"])
            inter = g.intersection(go)
            if inter.area * 9.8e9 > 0.5:
                diff = g.difference(go)
                polys = list(diff.geoms) if diff.geom_type == "MultiPolygon" else [diff]
                if len(polys) == 1:
                    feat["geometry"] = {
                        "type": "Polygon",
                        "coordinates": [[[round(x, 7), round(y, 7)] for x, y in polys[0].exterior.coords]],
                    }
                props["area"] = round(diff.area * 9.8e9)
                print(f"[보정] 사당동 419 — 사당15구역과 겹친 {round(inter.area * 9.8e9):,}㎡ 차집합 제거")
    except Exception as e:  # shapely 없으면 그대로 추가
        print("[알림] 사당동 419 겹침 정리 건너뜀:", e)

    features.append(feat)
    print(f"[추가] (가칭)사당동 419 일대 민간도심복합 ({props['area']:,}㎡)")
    return 1


def main() -> int:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    features = data["features"]
    before = len(features)

    apply_restrictions(features)
    added = apply_suyu(features) + apply_sangsu(features) + apply_sadang419(features)
    touched = apply_gwangheungchang(features)

    data["metadata"]["count"] = len(features)
    data["metadata"]["officialPdfs20261118"] = {
        "asOf": "2026-11-18",
        "additions": added,
        "updated": len(RESTRICT) + touched,
        "note": (
            "사용자 제공 공식 PDF 3건 반영 — 서울특별시고시 제2025-734호(2025-12-26) 건축허가등 제한: "
            "독산동 979·1022, 수유동 310-15(신규 추가), 신사동 300, 신수동 250, 신길동 90-31·정릉동 16-179(면적 변경). "
            "광흥창역세권(신수동 301-1) 정비구역 지정·고시(2026-10-22) 확인, 광흥창역세권(현석동 1-31) 공람 수치 반영."
        ),
    }

    if "--check" in sys.argv:
        print(json.dumps(data["metadata"]["officialPdfs20261118"], ensure_ascii=False, indent=1))
        return 0

    PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[완료] 구역 {before} → {len(features)}곳 (추가 {added})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
