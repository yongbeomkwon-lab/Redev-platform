#!/usr/bin/env python3
"""송파동 117번지 일원(송파1동 하단) 모아타운 — 검토용 참고도 5개 구역계 (2026-11-23)

## 3차 수정 (2026-11-23 밤) — 사용자 지적 두 가지 반영
  사용자가 배포본을 보고 지적했다.
    ① "배지도 길어서 몇 구역인지 잘려 나오고" — 지도 이름표는 12~14자에서 잘린다(tagName/cardName).
       `송파동 117 일대 모아타운 3구역`(19자)은 `송파동 117 일대 모…`로 나와 구역 번호가 사라졌다.
       → 지도에 뜨는 `name` 을 **`송파117 1구역`~`송파117 5구역`**(9자)**로 줄이고**, 기존 긴 이름은
       전부 `alias` 에 남겨 검색·패널에서는 그대로 찾을 수 있게 했다.
    ② "3구역 위치랑 5구역 한양1차 겹침이 생겼네" — 2차본은 사진 색 마스크를 직선화한 도형이라
       3구역이 북서로 밀려 학교 담장에 붙고, 5구역 동쪽이 송파한양1차 필지(필지 119)를 덮었다.
       → 브이월드 연속지적도 필지(458필지)에 참고도 색 구역을 배정해 **블록 단위로 다시 조립**했다.
         구역별 격자 방향(1·2구역 57°, 3구역 51°, 4구역 48°, 5구역 46°)으로 변을 직선화하고,
         필지를 지나지 않는 도로선에 스냅해 5구역 포함 어느 구역도 송파한양1차와 겹치지 않는다
         (교집합 0㎡). 3구역 동쪽은 송파한양1차 서쪽 담장·도로에 맞닿아 있다(이격 5.4m).
       · 서울송파초등학교(114학)·송파근린공원(113공)은 그대로 구역 밖(교집합 0㎡).
       · 면적 합계 83,193㎡ (1구역 15,196 · 2구역 17,426 · 3구역 17,786 · 4구역 12,862 · 5구역 19,923).

## 2차 수정 (2026-11-23 저녁) — 사용자 지적 반영
  사용자가 배포본을 보고 두 가지를 지적했다.
    ① "송파초등학교 절반 정도가 재개발구역 내로 들어갔어 옆의 공원도 바로 수정해"
    ② "내가 처음 줬을 땐 구역계가 직각 형태인데 너는 둥글게 되었어"
  원인은 1차 작업에서 사진을 색 마스크로 따면서 (a) 사진 정합(회전·축척·이동)이 남서쪽으로
  밀려 있었고(그래서 3구역이 학교 4,056㎡·4구역이 학교 1,318㎡와 공원 3,260㎡를 덮었다),
  (b) 윤곽선을 1.5px 허용으로 단순화해 모서리가 둥글고 잘록하게 남은 것이었다.
  이번에는
    · 사진 속 두 역(송파나루역 37.510276,127.112224 / 석촌역 37.505714,127.107069)으로 초기
      유사변환을 잡은 뒤, 브이월드 연속지적도 필지선 10만여 표본점과 사진 인쇄선의 거리(중앙값)를
      최소화하도록 회전·축척·평행이동을 다시 맞췄다(중앙값 2.6m, 축척 1.388px/m, 회전 1.29°).
    · 구역별 색 마스크의 윤곽을 넉넉한 허용(둘레 2%)으로 직선화한 뒤, 짧은 변(6m 미만)과
      거의 일직선인 꼭짓점을 지워 **4~6꼭짓점의 각진 도형**으로 다시 그렸다. 다섯 구역 모두
      변이 블록·도로 경계선(연속지적도 필지선·도로 중심선)을 따라가고, 모서리는 직각 또는
      도로가 꺾이는 각도만 남는다.
    · 서울송파초등학교 필지(송파동 114학, 13,813㎡)와 송파근린공원(송파동 113공, 6,618㎡)은
      구역에 **1㎡도 들어가지 않는다**(교집합 0㎡, 최소 이격 11.7m·16.8m).

## 1차 자료 (그대로 유지)
  - 사용자가 보낸 사진 「(가칭)송파1동 하단 모아통합기획구역 — 송파동 117번지 일원 모아타운
    구역계 안내(1~5번 구역계 참고도)」(attachments/2026-11-23/
    1000085489-21cd66b2bbd14d9c9f4761ae5dd11ea9.jpg).
    사진 안에도 "검토용 참고도입니다. 공식 지정 여부와 경계는 별도로 확인해 주세요."라고 적혀 있다.
  - 2026-11-23 확인: 송파구 모아타운 알림방·서울시 모아주택 모아타운 아카이브(동남권)·
    서울시 공고 제2026-3045호(모아통합기획 후보지 공모) 어디에도 이곳(송파동 117번지 일원 /
    (가칭)송파1동 하단)의 후보지 선정·구역계 공개·동의서 번호부여 공고는 없다.
    → 공식 구역계가 아니라 참고도이므로 geom="참고도", boundaryApprox=true 로 넣는다.

## 넣는 구역 (면적은 참고도 도형 계측값 — 공식 고시 면적이 나오면 그 값으로 바꿔야 한다)
  1구역 15,611㎡ · 2구역 16,385㎡ · 3구역 16,043㎡ · 4구역 13,142㎡ · 5구역 19,514㎡
  합계 80,695㎡ — 모아통합기획 후보지 요건(전체 1만~10만㎡)에 들어간다.
  전체(부모) 구역은 지도에서 기본으로 숨기고(hiddenByDefault) 검색했을 때만 그린다.
  → 3차 수정 후 면적은 위 83,193㎡ (참고도 도형 계측값, 공식 고시 면적이 나오면 그 값으로 바꿔야 한다).

실행: python3 scripts/apply-songpa117-moa-20261123.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
META_KEY = "songpa117MoaFix20261123"

EXPECTED_TOTAL = 2440  # 송파동 117 일대 모아타운 6곳 반영 후 (2026-11-23)

SOURCE_ID = "사용자 제공 검토용 참고도(2026-11-23) — 송파동 117번지 일원 모아타운 1~5구역계"

IMAGE_NOTE = (
    "지도 경계는 2026-11-23 사용자가 보낸 「(가칭)송파1동 하단 모아통합기획구역 — 송파동 117번지 "
    "일원 모아타운 구역계 안내(1~5번 구역계 참고도)」 사진을 옮긴 검토용 참고도입니다. 사진에도 "
    "\"검토용 참고도입니다. 공식 지정 여부와 경계는 별도로 확인해 주세요.\"라고 적혀 있습니다. "
    "2026-11-23 기준 송파구 모아타운 알림방·서울시 모아주택 모아타운 아카이브·정비사업 정보몽땅 "
    "어디에도 이곳(송파동 117번지 일원 / (가칭)송파1동 하단)의 후보지 선정·구역계 공개·동의서 "
    "번호부여 공고는 없습니다."
)

SOURCES = [
    {
        "label": "송파구청 모아타운 알림방 — 송파구 모아타운 공고 목록(2026-11-23 확인, 송파동 117 관련 공고 없음)",
        "url": "https://www.songpa.go.kr/www/selectBbsNttList.do?bbsNo=382&key=5917",
    },
    {
        "label": "서울시 모아주택·모아타운 온라인 아카이브(동남권) — 송파구는 풍납동 483-10·거여동 555만 수록",
        "url": "https://news.seoul.go.kr/citybuild/moa-housing-town/archive/seoul-southeast",
    },
    {
        "label": "서울특별시 공고 제2026-3045호 — 모아통합기획 모아타운 후보지 선정 공모 변경공고(2026-11-04)",
        "url": "https://www.seoul.go.kr/news/news_notice.do?nttNo=469588",
    },
    {
        "label": "서울시 보도자료 — '모아통합기획' 후보지 공모 개시·2030년까지 100곳 선정(2026-10-12)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=467904",
    },
]

SOURCES_PARENT = SOURCES + [
    {
        "label": "송파구청 모아타운 소개 및 현황(주택사업과 주택기획팀 02-2147-2880)",
        "url": "https://www.songpa.go.kr/www/contents.do?key=5883",
    },
]

AREA_NOTE = (
    "참고도에서 옮긴 다각형의 계측 면적입니다. 2026-11-23 3차 수정에서 경계를 연속지적도 "
    "필지 블록 단위로 다시 조립해 잰 값이라, 2차 때 값(합계 80,695㎡)과 구역별로 5~11% 차이가 "
    "납니다(1구역 -2.7%, 2구역 +6.4%, 3구역 +10.9%, 4구역 -2.1%, 5구역 +2.1%). "
    "참고도가 검토용이라 공식 고시 면적이 나오면 그 값으로 바꿔야 합니다."
)

BOUNDARY_NOTE = (
    "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 458개에 참고도 색 구역을 배정한 뒤, 구역별 "
    "격자 방향(1·2구역 57°, 3구역 51°, 4구역 48°, 5구역 46°)으로 변을 직선화하고 필지를 "
    "지나지 않는 도로선에 스냅해 블록 단위로 다시 조립했습니다. 그래서 모든 변이 필지선·도로 "
    "경계를 따라가고 모서리는 직각(또는 도로가 꺾이는 각)만 남습니다. 129공(송파공원, 1,645㎡)은 "
    "참고도와 같이 2구역 안에 포함되어 있고, 송파한양1차아파트 필지(119)는 어느 구역과도 "
    "겹치지 않습니다(교집합 0㎡ — 3구역 동쪽은 담장·도로에 맞닿아 이격 5.4m). "
    "서울송파초등학교 필지(송파동 114학)와 송파근린공원(송파동 113공)도 구역 밖으로 완전히 "
    "빠졌습니다(교집합 0㎡, 최소 이격 6.2m·16.4m). 참고도 자체가 검토용이라 위치 정확도는 "
    "±5m 수준이며, 공식 구역계가 공개되면 그 도면으로 다시 맞춰야 합니다."
)

PARENT_NOTE = (
    "(가칭)송파1동 하단 모아통합기획구역입니다. 송파동 117번지 일원(송파나루역 남쪽, 송파초등학교·"
    "송파근린공원 동쪽, 송파한양1차아파트 서쪽 블록)을 1~5구역으로 나눈 모아타운 구역계 참고도이며, "
    "합계 면적은 약 8.3만㎡입니다. 모아통합기획은 서울시와 자치구가 관리계획을 함께 세우면서 "
    "모아주택 조합설립을 동시에 추진하는 방식으로, 후보지 요건은 전체 면적 1만~10만㎡·노후도 50% "
    "이상(사업예정지별 50% 이상)·사업예정구역별 토지등소유자 60% 및 토지면적 1/2 이상 동의입니다"
    "(서울특별시 공고 제2026-3045호로 면적 하한이 2만㎡에서 1만㎡로 바뀜). 자치구가 동의서 번호를 "
    "부여하는 즉시 구 누리집에 구역계가 공개되고, 그 공개일이 주택 분양권 산정 기준일이 됩니다. "
    "2026-11-23 현재 송파구에 이 구역의 구역계 공개·동의서 번호부여 공고는 없어 검토용 참고도로만 "
    "표시합니다. 서쪽의 서울송파초등학교(송파동 114학)와 송파근린공원(송파동 113공)은 어느 구역에도 "
    "들어가지 않습니다. 동쪽 경계 너머의 송파한양1차아파트는 서울시 자료상 신속통합기획(기획완료)으로 "
    "따로 추진되는 단지라 이 구역계에 들어가지 않습니다."
)

# 계측 면적(㎡) — 2026-11-23 3차(블록 기준) 수정본, 합계 83,193㎡
AREAS = {'1': 15196, '2': 17426, '3': 17786, '4': 12862, '5': 19923}

# 구역계 — [위도, 경도], 폐합점 없음.
#   2026-11-23 3차: /workspace/tmp/songpa117_clean_rings.json 의 ring_lnglat([경도,위도])을 그대로 옮겼다.
#   브이월드 필지 배정 → 격자 방향 직선화 → 도로선 스냅을 마친 블록 단위 도형(참고도 ±5m 근사).
ZONES = {
    "1": [[37.507694, 127.111081], [37.507088, 127.112247], [37.508002, 127.112995], [37.508653, 127.111862]],  # 15,196㎡
    "2": [[37.508002, 127.112995], [37.507278, 127.114308], [37.506379, 127.113586],
          [37.506325, 127.113528], [37.507088, 127.112247]],  # 17,426㎡
    "3": [[37.507178, 127.111794], [37.506590, 127.111104], [37.505650, 127.112179],
          [37.505541, 127.112587], [37.506220, 127.113346]],  # 17,786㎡
    "4": [[37.506446, 127.111092], [37.505586, 127.110175], [37.504881, 127.110843], [37.505822, 127.111896]],  # 12,862㎡
    "5": [[37.504365, 127.112429], [37.503931, 127.111760], [37.504881, 127.110843],
          [37.505822, 127.111896], [37.505209, 127.112878], [37.504870, 127.112509],
          [37.504732, 127.112626]],  # 19,923㎡
}

# 기존(1·2차) 긴 이름 — 지도 배지에서는 짧은 name을 쓰고, 이 이름들은 alias로 검색을 받는다.
OLD_NAMES = {
    str(n): [
        f"(가칭)송파1동 하단 모아타운 {n}구역",
        f"송파동 117 일대 모아타운 {n}구역",
        f"송파동 117 {n}구역",
        f"송파1동 하단 {n}구역",
        f"송파1동 하단 모아타운 {n}구역",
        f"송파동 모아타운 {n}구역",
        f"송파117 {n}",
    ]
    for n in ("1", "2", "3", "4", "5")
}
SHORT_NAMES = {n: f"송파117 {n}구역" for n in ("1", "2", "3", "4", "5")}

# 참고: 학교·공원 필지(브이월드 연속지적도 그대로) — 구역과 겹침 0㎡ 인지 검사에 쓴다
SCHOOL_RING = [
    [37.507824, 127.110755], [37.507618, 127.111079], [37.507570, 127.111153], [37.507270, 127.111626],
    [37.507242, 127.111669], [37.507197, 127.111674], [37.507153, 127.111626], [37.506790, 127.111229],
    [37.506282, 127.110674], [37.506867, 127.109830], [37.506943, 127.109913], [37.507089, 127.110067],
    [37.507238, 127.110217], [37.507388, 127.110363], [37.507541, 127.110506], [37.507618, 127.110575],
    [37.507696, 127.110645],
]
PARK_RING = [
    [37.506867, 127.109830], [37.506282, 127.110674], [37.506267, 127.110658], [37.505830, 127.110180],
    [37.506214, 127.109626], [37.506296, 127.109507], [37.506426, 127.109319], [37.506462, 127.109363],
    [37.506519, 127.109433], [37.506658, 127.109596], [37.506799, 127.109756],
]

PARENT_RING = ZONES["1"]
PARENT_PARTS = [ZONES[k] for k in ("2", "3", "4", "5")]

# 송파한양1차아파트(필지 119) — 동쪽 경계 대조용. 3구역은 여기 맞닿고, 5구역은 겹치면 안 된다.
HANYANG_ID = "11000UQ120PS202502050014"

META_ENTRY = {
    "asOf": "2026-11-23",
    "zones": [f"songpa117-moa-{n}" for n in ("1", "2", "3", "4", "5")] + ["songpa117-moa"],
    "note": (
        "송파동 117 일대(송파1동 하단) 모아타운 참고도 1~5구역계를 2026-11-23 3차 수정 — 연속지적도 "
        "필지에 참고도 색 구역을 배정해 블록 단위로 다시 조립하고, 배지에 구역 번호가 잘리지 않도록 "
        "이름을 `송파117 1구역`~`송파117 5구역`으로 줄였다(긴 이름은 alias로 검색 유지). 3구역은 "
        "송파한양1차 서쪽 담장·도로에 맞닿고(이격 5.4m), 5구역을 포함해 어느 구역도 송파한양1차와 "
        "겹치지 않으며, 송파초등학교·송파근린공원도 구역 밖이다(교집합 0㎡, 합계 83,193㎡)."
    ),
}


def _centroid(ring):
    """간단 무게중심(경위도 평균) — 말풍선 자리용."""
    return [round(sum(p[0] for p in ring) / len(ring), 6), round(sum(p[1] for p in ring) / len(ring), 6)]


def zone_props(n: str) -> dict:
    idx = int(n)
    c = _centroid(ZONES[n])
    return {
        # 지도 배지가 잘리지 않도록 짧은 이름을 쓴다(2026-11-23 3차). 긴 이름은 alias 에 전부 남긴다.
        "name": SHORT_NAMES[n],
        "alias": OLD_NAMES[n],
        "type": "모아타운",
        "kind": "모아타운(모아통합기획)",
        "stage": "추진준비·구역계 검토(공식 공고 전)",
        "gu": "송파구",
        "area": AREAS[n],
        "featured": False,
        "geom": "참고도",
        "boundaryApprox": True,
        "sourceId": SOURCE_ID,
        "asOf": "2026-11-23",
        "center": [c[0], c[1]],
        "centerLabel": "참고도 구역계 중심",
        "note": (
            f"(가칭)송파1동 하단 모아타운 {idx}구역(지도 표기 `{SHORT_NAMES[n]}`)입니다. " + IMAGE_NOTE
        ),
        "areaNote": f"{idx}구역 계측 면적 {AREAS[n]:,}㎡ — " + AREA_NOTE,
        "boundaryNote": BOUNDARY_NOTE,
        "sources": SOURCES,
    }


def parent_props() -> dict:
    total = sum(AREAS.values())
    return {
        "name": "(가칭)송파1동 하단 모아타운(송파동 117번지 일원)",
        "alias": [
            "송파1동 하단",
            "송파1동 하단 모아타운",
            "송파1동 하단 모아통합기획",
            "송파1동 하단 모아통합기획구역",
            "송파동 117",
            "송파동 117번지",
            "송파동 117번지 일원",
            "송파동 117 일대",
            "송파동 117 모아타운",
            "송파동 117 일대 모아타운",
            "송파동 모아타운",
            "송파 모아타운",
            "송파 모아통합기획",
            "모아통합기획 송파",
            "송파117",
            "송파117 모아타운",
        ],
        "type": "모아타운",
        "kind": "모아타운(모아통합기획)",
        "stage": "추진준비·구역계 검토(공식 공고 전)",
        "gu": "송파구",
        "area": total,
        "featured": False,
        "geom": "참고도",
        "boundaryApprox": True,
        "hiddenByDefault": True,
        "sourceId": SOURCE_ID,
        "asOf": "2026-11-23",
        "center": [37.506300, 127.112000],
        "centerLabel": "참고도 1~5구역계 중심",
        "note": PARENT_NOTE,
        "areaNote": (
            f"1~5구역 계측 면적 합계 {total:,}㎡(1구역 {AREAS['1']:,}·2구역 {AREAS['2']:,}·"
            f"3구역 {AREAS['3']:,}·4구역 {AREAS['4']:,}·5구역 {AREAS['5']:,}㎡). " + AREA_NOTE
        ),
        "boundaryNote": BOUNDARY_NOTE,
        "sources": SOURCES_PARENT,
    }


def entries() -> list[dict]:
    out = []
    for n in ("1", "2", "3", "4", "5"):
        e = {"id": f"songpa117-moa-{n}", "sid": SOURCE_ID, "polygon": ZONES[n]}
        e.update(zone_props(n))
        out.append(e)
    parent = {
        "id": "songpa117-moa",
        "sid": SOURCE_ID,
        "polygon": PARENT_RING,
        "parts": PARENT_PARTS,
    }
    parent.update(parent_props())
    out.append(parent)
    return out


# ── 기하 (경위도 → 평면) ──────────────────────────────────────────────────────
#   pyproj 가 있으면 실제 TM(EPSG:5179)로, 없으면 국지 등장방형 근사로 편다.
#   어느 쪽이든 모든 링을 **같은 좌표계**에 놓아야 교차 판정이 맞는다.
REF_LAT = 37.5075


def _projector():
    try:
        from pyproj import Transformer

        tr = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
        return lambda p: tr.transform(p[1], p[0])
    except Exception:  # noqa: BLE001 — pyproj 없는 환경
        import math as _m

        kx = 111320.0 * _m.cos(_m.radians(REF_LAT))
        ky = 110540.0
        return lambda p: (p[1] * kx, p[0] * ky)


_PROJ = _projector()


def _xy(ring):
    return [_PROJ(p) for p in ring]


def _area(ring) -> float:
    from shapely.geometry import Polygon

    return Polygon(_xy(ring)).area


def _overlap(a, b) -> float:
    from shapely.geometry import Polygon

    return Polygon(_xy(a)).intersection(Polygon(_xy(b))).area


def _distance(a, b) -> float:
    from shapely.geometry import Polygon

    return Polygon(_xy(a)).distance(Polygon(_xy(b)))


def _baseline_ids():
    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return [f["properties"]["id"] for f in json.loads(raw)["features"]]
    except Exception as exc:  # noqa: BLE001 — git 이 없으면 개수만 본다
        print("[참고] git 기준 비교 불가 — %s" % exc)
        return None


def check() -> int:
    bad = 0
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    _hy = next((x for x in src if x.get("id") == HANYANG_ID), None)
    hanyang = (_hy or {}).get("polygon") or None
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    ids = {z.get("id") for z in src}
    gids = {f["properties"]["id"] for f in geo["features"]}
    print(f"    seoul-zones {len(src)}곳 · zones.geojson {len(geo['features'])}곳 (기대 {EXPECTED_TOTAL}곳)")
    ok_count = len(src) == EXPECTED_TOTAL == len(geo["features"])
    print(f"[{'OK' if ok_count else 'FAIL'}] 구역 수")
    bad += 0 if ok_count else 1

    base = _baseline_ids()
    if base is not None:
        missing = [i for i in base if i not in gids]
        extra = [i for i in gids if i not in base]
        print(f"[{'OK' if not missing and not extra else 'FAIL'}] 직전 커밋 대비 사라진 구역 {len(missing)}곳 · 늘어난 구역 {len(extra)}곳")
        bad += 0 if not missing and not extra else 1

    for n in ("1", "2", "3", "4", "5"):
        zid = f"songpa117-moa-{n}"
        z = next((x for x in src if x.get("id") == zid), None)
        ring = (z or {}).get("polygon") or []
        f = next((x for x in geo["features"] if x["properties"]["id"] == zid), None)
        g = (f or {}).get("geometry") or {}
        ok = (
            bool(z) and bool(f)
            and z.get("geom") == "참고도"
            and 4 <= len(ring) <= 8
            and g.get("type") == "Polygon"
            and g["coordinates"][0][0] == g["coordinates"][0][-1]
            and len(g["coordinates"][0]) == len(ring) + 1
            and abs(_area(ring) - (z or {}).get("area", 0)) / max(1, _area(ring)) < 0.02
        )
        a = _area(ring) if ring else 0
        print(f"[{'OK' if ok else 'FAIL'}] {zid} 꼭짓점 {len(ring)} · 계측 {a:,.0f}㎡ · 표기 {(z or {}).get('area')}㎡ · geojson {g.get('type')}")
        bad += 0 if ok else 1

        # 지도 배지 이름 — 잘리지 않는 짧은 이름(10자 이하) + 기존 긴 이름은 alias 에 그대로
        name_ok = (z or {}).get("name") == SHORT_NAMES[n] and len(SHORT_NAMES[n]) <= 10
        alias_ok = all(m in ((z or {}).get("alias") or []) for m in OLD_NAMES[n])
        print(f"[{'OK' if name_ok else 'FAIL'}] {zid} name='{(z or {}).get('name')}'({len((z or {}).get('name') or '')}자)"
              f" · [{'OK' if alias_ok else 'FAIL'}] 기존 이름 {len(OLD_NAMES[n])}개 alias 유지")
        bad += 0 if name_ok else 1
        bad += 0 if alias_ok else 1

        sc = _overlap(ring, SCHOOL_RING) if ring else 0
        pk = _overlap(ring, PARK_RING) if ring else 0
        ok2 = sc < 0.01 and pk < 0.01
        print(f"[{'OK' if ok2 else 'FAIL'}] {zid} ∩ 서울송파초등학교(114학) = {sc:.2f}㎡ · ∩ 송파근린공원(113공) = {pk:.2f}㎡"
              f" · 이격 {_distance(ring, SCHOOL_RING):.1f}m / {_distance(ring, PARK_RING):.1f}m")
        bad += 0 if ok2 else 1

        if hanyang is not None:
            hy = _overlap(ring, hanyang) if ring else 0
            hd = _distance(ring, hanyang) if ring else -1
            # 3구역은 송파한양1차 서쪽 담장·도로에 맞닿고(도로 폭만큼), 5구역도 겹치지 않아야 한다
            ok3 = hy < 0.01 and (hd <= 8.0 if n == "3" else True)
            print(f"[{'OK' if ok3 else 'FAIL'}] {zid} ∩ 송파한양1차(119) = {hy:.2f}㎡ · 이격 {hd:.1f}m")
            bad += 0 if ok3 else 1

    p = next((x for x in src if x.get("id") == "songpa117-moa"), None)
    pf = next((x for x in geo["features"] if x["properties"]["id"] == "songpa117-moa"), None)
    total = sum(AREAS.values())
    okp = (
        bool(p) and len(p.get("parts") or []) == 4
        and (pf or {}).get("geometry", {}).get("type") == "MultiPolygon"
        and (p or {}).get("area") == total
        and len(((pf or {}).get("geometry", {}) or {}).get("coordinates") or []) == 5
    )
    print(f"[{'OK' if okp else 'FAIL'}] songpa117-moa parent parts={len((p or {}).get('parts') or [])} "
          f"geojson={(pf or {}).get('geometry', {}).get('type')} · 합계 {(p or {}).get('area')}㎡ (기대 {total:,}㎡)")
    bad += 0 if okp else 1

    # 구역끼리 겹치지 않는지
    for i in range(1, 6):
        for j in range(i + 1, 6):
            o = _overlap(ZONES[str(i)], ZONES[str(j)])
            if o > 0.5:
                print(f"[FAIL] {i}구역 ∩ {j}구역 = {o:.1f}㎡")
                bad += 1

    missing = [i for i in gids if i not in ids]
    if missing:
        print(f"[FAIL] geojson 에만 있는 구역 {len(missing)}곳: {missing[:5]}")
        bad += 1
    ok_meta = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok_meta else 'FAIL'}] zones-meta {META_KEY}")
    bad += 0 if ok_meta else 1
    return bad


def _restore_untouched() -> None:
    """이 스크립트가 건드리지 않는 구역의 properties 를 직전 커밋 그대로 되돌린다.

    export-geojson 은 경계가 있는 구역의 `center` 를 일부러 빼기도 하는데(화면이 bbox 로 다시 계산),
    그렇게 다른 구역의 바이트가 조용히 달라지면 "송파117 말고는 아무것도 안 바뀌었다"를 증명할 수 없다.
    songpa117-moa* 를 뺀 나머지 구역은 properties 를 직전 커밋 값으로 되돌리고, 도형은 같아야 한다.
    """
    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        prev = {f["properties"]["id"]: f for f in json.loads(raw)["features"]}
    except Exception as exc:  # noqa: BLE001 — git 이 없으면 건너뛴다
        print("[참고] 직전 커밋 비교 불가 — 건너뜀: %s" % exc)
        return
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    restored, geom_bad = 0, 0
    for f in geo["features"]:
        fid = f["properties"]["id"]
        if fid.startswith("songpa117-moa"):
            continue
        old = prev.get(fid)
        if not old:
            continue
        if json.dumps(old.get("geometry"), sort_keys=True) != json.dumps(f.get("geometry"), sort_keys=True):
            geom_bad += 1
        if json.dumps(old["properties"], ensure_ascii=False, sort_keys=True) != json.dumps(
            f["properties"], ensure_ascii=False, sort_keys=True
        ):
            f["properties"] = old["properties"]
            restored += 1
    if geom_bad:
        raise SystemExit(f"[중단] 송파117 밖 구역의 도형이 {geom_bad}곳 바뀌었습니다 — 원인을 확인하세요")
    if restored:
        GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[보존] 송파117 밖 구역 properties 되돌림 {restored}곳 · 도형 변경 0곳")


def apply() -> int:
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    by_id = {z.get("id"): z for z in src}
    added, updated = 0, 0
    for e in entries():
        found = by_id.get(e["id"])
        if found is None:
            src.append(e)
            added += 1
        else:
            found.clear()
            found.update(e)
            updated += 1
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    meta[META_KEY] = META_ENTRY
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[저장] seoul-zones.json — 추가 {added} · 갱신 {updated} · 전체 {len(src)}")
    # 이 작업 환경에서는 npm 이 HOME 캐시를 못 써 exit 1 로 끝난다 — 같은 일을 하는 node 스크립트를 직접 부른다
    print("[내보내기] node scripts/export-geojson.mjs (= npm run geojson)")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    _restore_untouched()
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    sys.exit(apply())
