#!/usr/bin/env python3
"""
2026-11-18 야간 추가 반영 — ① 용두동 39 동쪽 변 보정 ② 신정5구역 별칭
③ 누락 구역 9곳 추가(양재5·중곡 민도복 4곳·구의2동A·양재동 360·370·양재2동 2·신당동 156-4)

## ① 용두동 39(rest17gu-ddm-용두동-39) 동쪽·남동쪽 변 보정
   동대문구 구역공개 도면(2024-11-04)에서 옮긴 폴리곤의 남동쪽 변이 2026-11-18
   보도 구역도(동대문구 제공)와 대조했을 때 도로(천호대로49길) 쪽으로 밀려 있어,
   남동쪽 모서리 두 점을 도로 경계 방향으로 넓혔다.
     · [37.573475,127.042208] +20m (동남 방향 수직)
     · [37.574836,127.043317] +8m  (용두3구역 서측 경계에 닿지 않도록 작게)
   ※ 공식 고시 좌표 목록이 공개되면 그 값으로 교체해야 한다(아래 boundaryNote 참고).

## ② 신정5구역 = 신정동 1152번지 일대(신정1-5) 별칭
   사용자 매물(신정동 1159-6) 설명의 '신정5구역'이 정식 구역명 '신정동 1152번지 일대'와
   같은 곳인지 확인: 서울시 신속통합기획 아카이브(2022-08-09)의 구역명이 '신정1-5'이고,
   정비사업 정보몽땅도 '신정1-5'(44,083㎡·956세대)로 같은 사업이다. 별개 구역은 아니다.

## ③ 신규 구역
   · 양재5구역(양재동 278-4) — 양재2동 7개 구역 중 5구역(주민제안·추진준비). 공식 면적·경계 미공개.
   · 중곡동 B4·B5·C3·C4 — 민간도심복합개발 추진준비 블록. 공고·구역계 없음 → 위치 점만.
   · 구의2동 A(구의동 46) — 신통기획 후보지 선정(2026-02-03, 105,957.2㎡). 좌표는 인접 지번 기준.
   · 양재동 360·370 — 모아타운 권리산정기준일 고시(2026-08-27, 서울시 고시 제2026-481호).
   · 양재2동 2구역(양재동 335) — 도심공공주택복합 추진준비.
   · 신당동 403-20 장기전세(청구역, 행위제한 4,928.5㎡)·신당현대 재건축(신당동 840, 44,338㎡).
   · '신당동 655'는 기존 '신당동 741'과 같은 사업(중구 고시 제2026-69호에서 표기 변경) → 별칭·면적·단계 갱신.

실행 순서(멱등): npm run geojson → scripts/official_supplement.py → scripts/apply-news-20261118.py
                → scripts/apply-extra-zones-20261118.py
사용: python3 scripts/apply-extra-zones-20261118.py [--check]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "public" / "data" / "zones.geojson"
REST17 = ROOT / "scripts" / "data" / "official-rest17gu.json"

M_LAT = 110_540.0
M_LNG = 111_320.0 * math.cos(math.radians(37.575))


def circle_ring(lat: float, lng: float, radius_m: float, points: int = 96):
    ring = []
    for i in range(points):
        t = 2 * math.pi * i / points
        ring.append(
            [
                round(lng + radius_m * math.cos(t) / M_LNG, 7),
                round(lat + radius_m * math.sin(t) / M_LAT, 7),
            ]
        )
    ring.append(ring[0][:])
    return ring


def area_m2(coords):
    """구면 근사 면적(㎡) — [lng,lat] 링"""
    R = 6_371_000.0
    s = 0.0
    for i in range(len(coords) - 1):
        lat1, lon1 = coords[i][1], coords[i][0]
        lat2, lon2 = coords[i + 1][1], coords[i + 1][0]
        s += (math.radians(lon2) - math.radians(lon1)) * (
            2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2))
        )
    return abs(s) * R * R / 2


def find(features, zone_id):
    for f in features:
        if f["properties"].get("id") == zone_id:
            return f
    raise SystemExit(f"[실패] 구역을 찾을 수 없음: {zone_id}")


def add_alias(props, extra):
    cur = props.get("alias") or []
    for a in extra:
        if a not in cur:
            cur.append(a)
    seen, out = set(), []
    for a in cur:
        if a not in seen:
            seen.add(a)
            out.append(a)
    props["alias"] = out


# ── ① 용두동 39 남동쪽 변 보정 ───────────────────────────────────────────────
YONGDU_ID = "rest17gu-ddm-용두동-39"
# 남동쪽 변(SE)의 수직 바깥 방향 단위벡터 — (동, 남) 성분
SE_PERP = (0.839, -0.545)
YONGDU_SHIFTS = {
    (37.573475, 127.042208): 20.0,
    (37.574836, 127.043317): 8.0,
}


def shift_latlng(lat, lng, dist_m, perp=SE_PERP):
    east, south = perp
    return (lat + (south * dist_m) / 111_000.0, lng + (east * dist_m) / M_LNG)


def apply_yongdu(features):
    feat = find(features, YONGDU_ID)
    ring = feat["geometry"]["coordinates"][0]
    # 이미 보정된 폴리곤이면(다시 돌릴 때) 그대로 둔다 — 멱등
    shifted = {
        (round(shift_latlng(klat, klng, d)[0], 6), round(shift_latlng(klat, klng, d)[1], 6))
        for (klat, klng), d in YONGDU_SHIFTS.items()
    }
    present = {(round(lat, 6), round(lng, 6)) for lng, lat in ring}
    if not any(abs(lat - k[0]) < 1e-6 and abs(lng - k[1]) < 1e-6 for lng, lat in ring for k in YONGDU_SHIFTS):
        if shifted & present:
            print("[건너뜀] 용두동 39 — 이미 보정된 폴리곤")
            return area_m2(ring)
    moved = []
    new_ring = []
    for lng, lat in ring:
        key = None
        for (klat, klng), d in YONGDU_SHIFTS.items():
            if abs(lat - klat) < 1e-6 and abs(lng - klng) < 1e-6:
                key = ((klat, klng), d)
                break
        if key:
            dlat, dlng = shift_latlng(key[0][0], key[0][1], key[1])
            new_ring.append([round(dlng, 7), round(dlat, 7)])
            moved.append((key[0], key[1], (round(dlat, 6), round(dlng, 6))))
        else:
            new_ring.append([lng, lat])
    if len(moved) != len(YONGDU_SHIFTS):
        raise SystemExit(f"[실패] 용두동 39 보정 대상 점을 찾지 못함 (찾은 점 {len(moved)}개)")
    feat["geometry"]["coordinates"][0] = new_ring
    props = feat["properties"]
    poly_area = area_m2(new_ring)
    props["areaNote"] = (
        f"서울시·보도상 구역면적 75,408㎡ / 2024-11-04 구역공개 도면 추적 폴리곤 74,379㎡ "
        f"/ 동쪽·남동쪽 변을 2026-11-18 보도 구역도(도로 경계)에 맞춰 넓힌 폴리곤 {poly_area:,.0f}㎡"
    )
    props["boundaryNote"] = (
        "동대문구 「신속통합기획 관련 동의양식 번호부여 및 구역공개(용두동 39번지 일대)」 안내문"
        "(2024-11-04, 동의양식 제2호) 구역도(지적편집도 화면)에서 구역계를 따라 옮긴 폴리곤. "
        "2026-11-18 동대문구 제공 구역 지도(뉴시스)와 대조해 남동쪽 변이 도로(천호대로49길) 쪽으로 "
        "15~25m 밀려 있던 것을 확인하고, 남동쪽 모서리 두 점을 도로 경계 방향으로 20m·8m 넓혔다"
        "(용두3구역 서측 경계와 겹치지 않도록 모서리는 작게 보정). 신청인이 제출한 구역계라 "
        "후보지 추천·정비구역 지정 과정에서 조정될 수 있고, 고시 좌표 목록이 공개되면 그 값으로 교체해야 한다."
    )
    props["note"] = (
        props["note"].split(" 구역계는 동대문구")[0]
        + " 구역계는 동대문구 구역공개 안내문(2024-11-04, 동의양식 제2호) 구역도에서 옮긴 폴리곤(geom=공고도면)을 "
        "2026-11-18 보도 구역도 기준으로 남동쪽 변만 넓혀 반영했습니다."
    )
    # 레포 원본(official-rest17gu.json)도 같은 값으로 맞춘다 — npm run geojson 재생성 시 유지
    if REST17.exists():
        data = json.loads(REST17.read_text(encoding="utf-8"))
        for item in data.get("additions", []):
            if item.get("id") != YONGDU_ID:
                continue
            poly = []
            for lng, lat in new_ring:
                poly.append([lat, lng])
            item["polygon"] = poly
            item["areaNote"] = props["areaNote"]
            item["boundaryNote"] = props["boundaryNote"]
            item["note"] = props["note"]
        data["asOf"] = "2026-11-18"
        REST17.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[보정] 용두동 39 남동쪽 변 2점 이동 → 폴리곤 면적 {poly_area:,.0f}㎡")
    return poly_area


# ── ② 신정5구역 별칭 ─────────────────────────────────────────────────────────
SINJEONG_ID = "11000UQ120PS202411014501"


def apply_sinjeong(features):
    props = find(features, SINJEONG_ID)["properties"]
    add_alias(props, ["신정5구역", "신정5", "신정1-5구역", "신정1-5", "신정동 1159-6"])
    props["nameNote"] = (
        "정식 구역명은 '신정동 1152번지 일대'이고 서울시 신속통합기획 아카이브·정비사업 정보몽땅에서는 "
        "'신정1-5'(44,083㎡·956세대)로 표기합니다. 현장·매물에서는 '신정5구역'으로도 부릅니다"
        "(사용자 매물 신정동 1159-6 설명). 별개 구역이 아니라 같은 사업입니다."
    )
    if not props.get("sources"):
        props["sources"] = []
    props["sources"] = [
        {
            "label": "서울시 신속통합기획 아카이브 — 양천구 신정동 1152 일대 재개발 가이드라인(2022-08-09, 구역명 신정1-5)",
            "url": "https://news.seoul.go.kr/citybuild/archives/531229",
        },
        {
            "label": "서울특별시고시 제2023-387호 — 신정동 1152번지 일대 정비구역 지정·지형도면 고시(2023-09-07)",
            "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11470NTC202309070003/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C_%EC%A0%9C2023-387%ED%98%B8_%EA%B3%A0%EC%8B%9C.pdf",
        },
    ]
    print("[별칭] 신정동 1152번지 일대 ← '신정5구역·신정1-5'")


# ── ③ 신규 구역 ──────────────────────────────────────────────────────────────
NEW = [
    {
        "id": "yangjae2-5",
        "name": "양재5구역",
        "alias": [
            "가칭 양재5구역",
            "양재5",
            "양재2동 5구역",
            "양재2동 모아타운 5구역",
            "양재동 278",
            "양재동 278 일대",
            "양재동 278-4",
            "양재동 278-4 일대",
        ],
        "type": "모아타운",
        "kind": "모아타운(주민제안)",
        "stage": "추진준비(주민제안)",
        "gu": "서초구",
        "area": 20106,
        "center": [37.4758050032214, 127.045726607837],
        "centerLabel": "대표 지번 양재동 278-4(양재시민의숲역 인근)",
        "radius": 80,
        "areaNote": "공식 구역면적 미공개 — 위치 확인용 점선원(반경 80m, 약 20,106㎡)의 면적",
        "note": (
            "서초구 양재2동은 7개 구역으로 나눠 모아타운·소규모정비를 추진해 왔습니다. 1구역(양재동 374·382)은 "
            "2024-02 모아타운 대상지로 선정돼 관리계획을 수립 중이고, 2구역(양재동 335)·6구역(양재동 280)은 "
            "2024-05 주민 반대(토지면적 30~50%)로 미선정됐습니다. 5구역은 양재동 278 일대(양재시민의숲역 "
            "인근)로 주민제안·추진준비 단계이며, 공식 구역계와 면적은 아직 공개되지 않았습니다. "
            "사용자 매물(양재동 278-4, 부동산포스 10390006) 설명의 '가칭 양재5구역'이 이 구역입니다."
        ),
        "sources": [
            {
                "label": "파이낸셜뉴스 — 양재 2·6구역 모아타운 '퇴짜'…양재2동 7개 구역 추진(2024-05-21)",
                "url": "https://www.fnnews.com/news/202405211811022320",
            },
            {
                "label": "조선비즈 — 재개발 소외됐던 양재2동, 잇따라 '모아타운' 도전(2023-05-19)",
                "url": "https://biz.chosun.com/real_estate/real_estate_general/2023/05/19/O4ZE77Y65BG6RPU6WFU6553VXM/",
            },
        ],
    },
    {
        "id": "gwangjin-junggok-b4",
        "name": "중곡동 B4 민간도심복합",
        "alias": ["중곡동B4", "(가)중곡동B4", "(가)중곡동 B4", "중곡 B4", "중곡동 B4구역"],
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발",
        "stage": "추진준비(공모 준비)",
        "gu": "광진구",
        "area": 67206,
        "center": [37.5621, 127.0799],
        "centerLabel": "위치 추정 — 군자역·중곡역 거리와 거래 지번(중곡동 242·259 일대) 기준(±100m)",
        "areaNote": "민간 정리값 67,206㎡(약 20,330평) — 재개발닷컴·조아부동산 2026-09 기준",
        "note": (
            "군자역 북동쪽 중곡동 일대 민간도심복합개발 추진준비 블록 중 하나입니다. 구청 공고·구역계가 "
            "아직 공개되지 않아 위치 참고 점으로만 표시합니다(공식 발표 전). 공모 준비 단계이고, "
            "사업 방식·유형(주거중심형/성장거점형)도 확정 발표되지 않았습니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — (가)중곡동B4(민간도심복합) 사업 정보", "url": "https://jaegebal.com/develops/4578"},
            {"label": "조아부동산 — 중곡동 정비사업 현황(민간도심복합 4곳)", "url": "https://joa-realty.co.kr/%EC%9E%AC%EA%B0%9C%EB%B0%9C/%EA%B4%91%EC%A7%84%EA%B5%AC/%EC%A4%91%EA%B3%A1%EB%8F%99/"},
        ],
    },
    {
        "id": "gwangjin-junggok-b5",
        "name": "중곡동 B5 민간도심복합",
        "alias": ["중곡동B5", "(가)중곡동B5", "(가)중곡동 B5", "중곡 B5", "중곡동 B5구역"],
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발",
        "stage": "추진준비(공모 준비)",
        "gu": "광진구",
        "area": 40948,
        "center": [37.5598, 127.0803],
        "centerLabel": "위치 추정 — 군자역 262m·중곡역 860m 거리 기준(±100m)",
        "areaNote": "민간 정리값 40,948㎡(약 12,387평) — 재개발닷컴·정비닥터 2026-11 기준",
        "note": (
            "군자역 인근 중곡동 민간도심복합개발 추진준비 블록입니다. 구역 안에 종교시설이 있어 "
            "사업 추진 난이도가 있다는 현장 평가가 있고, 구청 공고·구역계는 아직 없습니다. "
            "위치는 역 거리 기준 추정입니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — (가)중곡동B5(민간도심복합) 사업 정보", "url": "https://jaegebal.com/develops/4898"},
            {"label": "정비닥터 — 중곡 B5 민간도심복합개발(사업면적 4.08만㎡)", "url": "https://www.jbdoctor.com/r/3439"},
        ],
    },
    {
        "id": "gwangjin-junggok-c3",
        "name": "중곡동 C3 민간도심복합",
        "alias": ["중곡동C3", "(가)중곡동C3", "(가)중곡동 C3", "중곡 C3", "중곡동 C3구역"],
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발",
        "stage": "추진준비(공모 준비)",
        "gu": "광진구",
        "area": 59830,
        "center": [37.5612, 127.0829],
        "centerLabel": "위치 추정 — 서울용마초 123m·군자역 465m 거리와 거래 지번(중곡동 43 일대) 기준(±100m)",
        "areaNote": "민간 정리값 5.96만㎡(조아부동산 18,099평) — 2026-09·11 기준",
        "note": (
            "서울용마초등학교 남쪽 중곡동 일대 민간도심복합개발 추진준비 블록입니다. 반지하 비율이 높고 "
            "(50.7%) 노후도 75.6%로 정비 필요성이 큰 곳이지만, 구청 공고·구역계가 없어 위치 참고 점으로만 "
            "표시합니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — (가)중곡동C3(민간도심복합) 사업 정보", "url": "https://jaegebal.com/develops/4900"},
            {"label": "정비닥터 — 중곡 C3 민간도심복합개발(사업면적 5.96만㎡)", "url": "https://www.jbdoctor.com/r/3437"},
        ],
    },
    {
        "id": "gwangjin-junggok-c4",
        "name": "중곡동 C4 민간도심복합",
        "alias": ["중곡동C4", "(가)중곡동C4", "(가)중곡동 C4", "중곡 C4", "중곡동 C4구역"],
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발",
        "stage": "추진준비(공모 준비)",
        "gu": "광진구",
        "area": 33702,
        "center": [37.5600, 127.0814],
        "centerLabel": "위치 추정 — 서울용마초 73m·군자역 252m 거리 기준(±100m)",
        "areaNote": "민간 정리값 3.35만㎡(조아부동산 10,195평) — 2026-09·11 기준",
        "note": (
            "군자역·서울용마초 사이 중곡동 민간도심복합개발 추진준비 블록입니다. 공고·구역계가 없어 "
            "위치 참고 점으로만 표시하고, 사업 방식·유형도 확정 발표되지 않았습니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — (가)중곡동C4(민간도심복합) 사업 정보", "url": "https://jaegebal.com/develops/5309"},
            {"label": "정비닥터 — 중곡 C4 민간도심복합개발(사업면적 3.35만㎡)", "url": "https://www.jbdoctor.com/r/3438"},
        ],
    },
    {
        "id": "gwangjin-gui2-a",
        "name": "구의2동 A구역",
        "alias": ["구의동 46", "구의동 46번지 일대", "구의2동A", "(가)구의2동 A", "구의2동 A"],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "대상지선정(2026-02-03)",
        "gu": "광진구",
        "area": 105957,
        "center": [37.55129, 127.093877],
        "centerLabel": "구의동 46 일대(좌표는 인접 지번 구의동 46-1 기준)",
        "radius": 184,
        "areaNote": "서울시 선정 공고 105,957.2㎡",
        "note": (
            "2026-02-03 '26년 1차 재개발 후보지 선정위원회'에서 신속통합기획 후보지로 선정됐습니다"
            "(구의동 46번지 일대, 용도지역 1·2종(7층)·3종, 105,957.2㎡, 주민 동의율 70% 이상). "
            "정비계획 수립 전이라 구역계가 고시되지 않아 위치 참고용 점선원으로 표시합니다."
        ),
        "sources": [
            {
                "label": "서울시 — '26년 1차 재개발 후보지 선정위원회 결과(2026-02-03, 구의동 46번지 일대 105,957.2㎡)",
                "url": "https://news.seoul.go.kr/citybuild/archives/535814",
            }
        ],
    },
    {
        "id": "yangjae-360",
        "name": "양재동 360",
        "alias": ["양재동 360번지", "양재동 360 일대", "양재2동 360", "양재동 361-8"],
        "type": "모아타운",
        "kind": "모아타운",
        "stage": "권리산정기준일고시(2026-08-27)",
        "gu": "서초구",
        "area": 34000,
        "center": [37.4686456801869, 127.045455014529],
        "centerLabel": "대표 지번 양재동 361-8",
        "radius": 104,
        "areaNote": "약 3.4만㎡ — 서울시 고시·민간 정리값",
        "note": (
            "양재동 360번지 및 370번지 일대 주민제안 모아타운입니다. 서초구가 2025-11 주민의견 사전조사를 "
            "거쳐 신청했고, 서울시가 2026-08-27 '주택 등 건축물의 분양받을 권리의 산정 기준일 고시'"
            "(서울시 고시 제2026-481호)로 권리산정기준일을 고시했습니다. 아직 모아타운 대상지 선정 전이라 "
            "구역계가 없어 위치 참고용 점선원으로 표시합니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — 서울시 고시 제2026-481호 권리산정기준일 고시(양재동 360)", "url": "https://jaegebal.com/gnotices/seoul-gs-2026-481"},
            {"label": "조아부동산 — 양재동 정비사업 현황(모아타운 6곳)", "url": "https://joa-realty.co.kr/%EC%9E%AC%EA%B0%9C%EB%B0%9C/%EC%84%9C%EC%B4%88%EA%B5%AC/%EC%96%91%EC%9E%AC%EB%8F%99/"},
        ],
    },
    {
        "id": "yangjae-370",
        "name": "양재동 370",
        "alias": ["양재동 370번지", "양재동 370 일대", "양재2동 370", "양재동 373-4"],
        "type": "모아타운",
        "kind": "모아타운",
        "stage": "권리산정기준일고시(2026-08-27)",
        "gu": "서초구",
        "area": 15000,
        "center": [37.4707474806069, 127.044713012875],
        "centerLabel": "대표 지번 양재동 373-4",
        "radius": 69,
        "areaNote": "약 1.5만㎡ — 서울시 고시·민간 정리값",
        "note": (
            "양재동 360번지와 함께 추진되는 주민제안 모아타운으로, 2026-08-27 서울시 고시 제2026-481호로 "
            "권리산정기준일이 고시됐습니다. 대상지 선정 전이라 구역계가 없어 위치 참고용 점선원으로 표시합니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — 서울시 고시 제2026-481호 권리산정기준일 고시(양재동 370)", "url": "https://jaegebal.com/gnotices/seoul-gs-2026-481"},
        ],
    },
    {
        "id": "yangjae2-2",
        "name": "양재2동 2구역",
        "alias": ["양재2구역", "양재동 335", "양재동 335 일대", "양재2동2"],
        "type": "도공복",
        "kind": "도심공공주택복합",
        "stage": "추진준비(공모 준비)",
        "gu": "서초구",
        "area": 56990,
        "center": [37.4701720323698, 127.043186341098],
        "centerLabel": "대표 지번 양재동 335 일대",
        "radius": 135,
        "areaNote": "약 17,247평(56,990㎡) — 민간 정리값",
        "note": (
            "양재동 335번지 일대 2구역입니다. 3080 도심공공주택복합사업 후보에서 탈락한 뒤 2024-05 모아타운 "
            "공모에서도 주민 반대로 미선정됐고, 현재는 도심공공주택복합(도공복) 방식으로 다시 추진을 검토하는 "
            "추진준비 단계입니다. 공식 구역계·면적은 확정되지 않아 위치 참고용 점선원으로 표시합니다."
        ),
        "sources": [
            {"label": "파이낸셜뉴스 — 양재2구역(양재동 335 일대) 모아타운 미선정(2024-05-21)", "url": "https://www.fnnews.com/news/202405211811022320"},
            {"label": "조아부동산 — 양재동 정비사업 현황((가)양재2동2 도심공공복합 추진준비)", "url": "https://joa-realty.co.kr/%EC%9E%AC%EA%B0%9C%EB%B0%9C/%EC%84%9C%EC%B4%88%EA%B5%AC/%EC%96%91%EC%9E%AC%EB%8F%99/"},
        ],
    },
    {
        "id": "junggu-sindang-403-20",
        "name": "신당동 403-20 장기전세",
        "alias": ["신당동 403-20", "신당동403-20", "청구역세권", "청구역세권 장기전세", "청구역 역세권 장기전세주택"],
        "type": "장기전세",
        "kind": "역세권 장기전세주택(도시정비형 재개발)",
        "stage": "행위제한(정비계획 공람 2026-10-28)",
        "gu": "중구",
        "area": 4928.5,
        "center": [37.560586, 127.01247],
        "centerLabel": "대표 지번 신당동 403-20 일대(청구역 인근)",
        "radius": 40,
        "areaNote": "개발행위허가 제한지역 면적 4,928.5㎡(중구 고시 제2026-5호) — 민간 정리값 5,019㎡",
        "note": (
            "청구역 인근 신당동 403-20번지 일대 역세권 장기전세주택 건립사업(도시정비형 재개발)입니다. "
            "중구가 2026-02-11 고시 제2026-5호로 개발행위허가 제한지역(4,928.5㎡, 3년)을 지정했고, "
            "2026-10-28 정비구역 지정 및 정비계획 결정(안) 공람을 진행했습니다. 정비구역 지정 전이라 "
            "구역계가 고시되지 않아 위치 참고용 점선원으로 표시합니다."
        ),
        "sources": [
            {"label": "중구 고시 제2026-5호 — 신당동 403-20 일대 개발행위허가 제한지역 지정·지형도면 고시(2026-02-11)", "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11140NTC202603100003/%EC%A4%91%EA%B5%AC_%EC%A0%9C2026-5%ED%98%B8_%EA%B3%A0%EC%8B%9C.pdf"},
            {"label": "정비닥터 — 청구역세권 장기전세주택(사업면적 5,019㎡, 2026-10-28 정비계획 공람)", "url": "https://www.jbdoctor.com/r/4564"},
        ],
    },
    {
        "id": "junggu-sindang-hyundai",
        "name": "신당현대 재건축",
        "alias": ["신당현대", "신당현대아파트", "신당동 840", "신당동 840 일대", "신당현대 재건축사업"],
        "type": "일반재개발",
        "kind": "재건축(공동재건축)",
        "stage": "추진준비(신통기획 자문 신청 2026-11)",
        "gu": "중구",
        "area": 44338,
        "center": [37.5599482819725, 127.021658835597],
        "centerLabel": "신당동 840 신당현대아파트(다산로36길 109)",
        "radius": 119,
        "areaNote": "구역면적 약 4.4만㎡(44,338㎡) — 재개발닷컴·중구 결재문서 기준, 단지 942세대(1993년 준공)",
        "note": (
            "신당동 840번지 신당현대아파트(10개 동 942세대, 1993년 준공)가 재건축 추진준비 단계입니다. "
            "2026-11 중구가 신속통합기획 자문 상정을 검토하는 결재문서가 확인되고, 재건축 신속통합기획 "
            "자문 신청에 따른 업무 협의도 진행됐습니다. 정비구역 지정 전이라 단지 경계를 원으로 환산한 "
            "위치 참고용 점선원으로 표시합니다."
        ),
        "sources": [
            {"label": "재개발닷컴 — 신당현대(재건축·공동재건축) 사업 정보(신당동 840, 44,338㎡, 942세대)", "url": "https://jaegebal.com/develops/5342"},
            {"label": "중구 결재문서 — 신당현대아파트 재건축사업 신속통합기획 자문상정 검토보고(2026-11-09)", "url": "https://jaegebal.com/gnotices/jg-og-2026-529988?develop=5342&from=develop"},
        ],
    },
]


# ── ④ 신당동 655 = 기존 '신당동 741'과 같은 사업(표기 변경) ─────────────────
SINDANG_655_ID = "rest17gu-jg-신당동-741"


def apply_sindang655(features):
    props = find(features, SINDANG_655_ID)["properties"]
    add_alias(props, ["신당동 655", "신당동655", "신당동 620", "상왕십리역 장기전세", "신당동 741"])
    props["area"] = 11305
    props["stage"] = "행위제한(기간연장 2026-10-23)"
    props["areaNote"] = "구역면적 11,305㎡ — 행위제한 연장·지형도면 변경 고시(중구 고시 제2026-69호, 2026-10-23). 종전 13,482㎡에서 정비계획 수립 중 구역계가 바뀌며 축소"
    props["nameNote"] = (
        "상왕십리역 인근 역세권 장기전세주택 건립사업입니다. 2023-12-01 행위제한 고시 때는 위치를 '신당동 741번지 일원'으로 "
        "표기했고, 2026-10-23 기간 연장 고시에서 '신당동 655번지 일원'으로 표기가 바뀌었습니다(중구 고시 제2026-69호). "
        "같은 사업이라 별도 구역으로 넣지 않고 '신당동 655'를 별칭으로 붙였습니다."
    )
    props["note"] = (
        "상왕십리역 동쪽 왕십리로39길 일대 역세권 장기전세주택 건립사업(도시정비형 재개발)입니다. "
        "개발행위허가 제한이 2026-10-23 2년 연장(2023-10-26~2028-10-26)됐고, 같은 고시에서 구역면적이 "
        "13,482㎡에서 11,305㎡로 줄었습니다. 정비계획 수립 단계로 구역계는 아직 고시 전입니다."
    )
    if not props.get("sources"):
        props["sources"] = []
    props["sources"] = [
        {"label": "중구 고시 제2026-69호 — 신당동 655일대 역세권 장기전세주택 건립사업 행위제한 기간 연장·지형도면 변경 고시(2026-10-23)", "url": "https://jaegebal.com/gnotices/jg-gs-2026-69-2"},
        {"label": "데일리하우징 — 신당동 655 일대 행위제한 2년 연장·구역 축소(2026-10-28)", "url": "https://www.dailyhousing.kr/news/articleView.html?idxno=947"},
    ]
    print("[별칭] 신당동 741 ← '신당동 655·620' (같은 사업, 표기 변경)")


# ── ⑤ 겹침 정리: 중동 112(사전검토·UQ120 일반화) − 성산동 160-4 모아타운(UQ181 실경계) ─
#   일반화 경계(UQ120)는 도로·필지를 다듬어 그린 도형이라 이웃 실경계(UQ181)와 살짝 겹친다.
#   2026-11-18 사용자 제보(스크린샷): 중동 112 남쪽 모서리가 성산동 160-4 모아타운과 겹침.
#   → 성산동 160-4는 손대지 않고, 중동 112에서 겹치는 부분만 차집합으로 잘라낸다.
JUNG_ID = "11000UQ120PS202505311065"
SEONGSAN_ID = "11440UQ120PS202605060001"


def trim_overlap(features):
    try:
        from shapely.geometry import Polygon as SPoly, MultiPolygon as SMulti
    except Exception:
        print("[건너뜀] shapely 없음 — 중동 112 겹침 정리 못 함")
        return
    a = find(features, JUNG_ID)
    b = find(features, SEONGSAN_ID)
    ga = SPoly(a["geometry"]["coordinates"][0]).buffer(0)
    gb = SPoly(b["geometry"]["coordinates"][0]).buffer(0)
    inter = ga.intersection(gb)
    if inter.area * 9.8e9 < 0.5:
        print("[건너뜀] 중동 112 ↔ 성산동 160-4 겹침 없음(이미 정리)")
        return
    diff = ga.difference(gb)
    polys = list(diff.geoms) if isinstance(diff, SMulti) else [diff]

    def ring(coords):
        return [[round(x, 7), round(y, 7)] for x, y in coords]

    if len(polys) == 1:
        geom = {"type": "Polygon", "coordinates": [ring(polys[0].exterior.coords)]}
    else:
        geom = {
            "type": "MultiPolygon",
            "coordinates": [[ring(p.exterior.coords)] + [ring(i.coords) for i in p.interiors] for p in polys],
        }
    a["geometry"] = geom
    props = a["properties"]
    trimmed = inter.area * 9.8e9
    props["area"] = round(diff.area * 9.8e9)
    props["note"] = (props.get("note") or "") + (
        f" 2026-11-18 겹침 정리: 남쪽 모서리가 성산동 160-4번지 일대 모아타운(마포구 관리지역고시, UQ181 실경계)과"
        f" 겹치는 부분 {round(trimmed):,}㎡를 차집합으로 잘라냈습니다(성산동 160-4 경계는 그대로)."
    )
    props["areaNote"] = (
        f"서울플랜+ 고시면적 58,027㎡ / 이웃 실경계와 겹친 {round(trimmed):,}㎡를 뺀 도형 면적 {props['area']:,}㎡"
    )
    props["boundaryNote"] = (
        (props.get("boundaryNote") or "")
        + " 서울플랜+ UQ120 일반화 도형에서 성산동 160-4번지 일대 모아타운(UQ181)과 겹치는 남쪽 모서리를 차집합으로 제거."
    ).strip()
    props["geom"] = "UQ120보정"
    print(f"[보정] 중동 112 — 겹침 {round(trimmed):,}㎡ 제거 → 면적 {props['area']:,}㎡")


def apply_new(features):
    existing = {f["properties"].get("id") for f in features}
    added = 0
    for spec in NEW:
        if spec["id"] in existing:
            print(f"[건너뜀] 이미 있음: {spec['id']}")
            continue
        props = {
            "id": spec["id"],
            "name": spec["name"],
            "alias": spec["alias"],
            "type": spec["type"],
            "kind": spec["kind"],
            "stage": spec["stage"],
            "gu": spec["gu"],
            "area": spec["area"],
            "featured": False,
            "sourceId": "2026-11-18 추가 조사",
            "center": spec["center"],
            "centerLabel": spec["centerLabel"],
            "areaNote": spec["areaNote"],
            "note": spec["note"],
            "sources": spec["sources"],
        }
        radius = spec.get("radius")
        if radius:
            props["geom"] = "근사원"
            props["boundaryApprox"] = True
            props["boundaryNote"] = (
                f"위치 참고용 점선원 — {spec['centerLabel']} 중심 반경 약 {radius}m"
                f"(면적 {math.pi * radius * radius:,.0f}㎡를 원으로 환산). 실제 사업 구역계가 아니며 고시 전입니다."
            )
            geometry = {"type": "Polygon", "coordinates": [circle_ring(spec["center"][0], spec["center"][1], radius)]}
        else:
            props["geom"] = "미고시"
            geometry = None
        features.append({"type": "Feature", "geometry": geometry, "properties": props})
        existing.add(spec["id"])
        added += 1
        print(f"[추가] {spec['name']} ({spec['id']}) — 면적 {spec['area']:,.0f}㎡, {'점선원' if radius else '위치 점'}")
    return added


def main() -> int:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    features = data["features"]
    before = len(features)

    poly_area = apply_yongdu(features)
    apply_sinjeong(features)
    apply_sindang655(features)
    trim_overlap(features)
    added = apply_new(features)

    data["metadata"]["count"] = len(features)
    data["metadata"]["extraZones20261118"] = {
        "asOf": "2026-11-18",
        "additions": added,
        "fixed": 1,
        "aliases": 5,
        "note": (
            "사용자 매물·질문 직결 누락 구역 보강 — 양재5구역(양재동 278-4, 주민제안), 군자역 인근 민간도심복합 "
            "중곡동 B4·B5·C3·C4(공고 전 → 위치 점), 구의2동 A(구의동 46, 신통기획 후보지 선정 2026-02-03), "
            "양재동 360·370(모아타운 권리산정기준일 고시 2026-08-27), 양재2동 2구역(도공복 추진준비), "
            "신당동 403-20 장기전세(청구역)·신당현대 재건축(신당동 840). '신당동 655'는 기존 신당동 741과 같은 사업이라 별칭으로 처리. "
            "신정동 1152번지 일대에 '신정5구역' 별칭 추가. 용두동 39 남동쪽 변을 "
            "2026-11-18 보도 구역도(도로 경계)에 맞춰 보정."
        ),
    }

    if "--check" in sys.argv:
        print(json.dumps(data["metadata"]["extraZones20261118"], ensure_ascii=False, indent=1))
        return 0

    PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[완료] 구역 {before} → {len(features)}곳 (추가 {added}) / 용두동 39 폴리곤 {poly_area:,.0f}㎡")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
