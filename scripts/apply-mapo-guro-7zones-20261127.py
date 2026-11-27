#!/usr/bin/env python3
"""리디브 — 구로·가리봉 3곳 경계 보완 + 마포구 4곳 누락·단계 보완 (2026-11-27)

## 무엇
A. 구로·가리봉 3곳 — 대표 점(geom "미고시")이던 구역에 **공식 고시·공고 지형도면**을
   브이월드 연속지적도 필지선에 맞춰 옮긴 실경계를 넣는다.
   1) `rest17gu-gr-가리봉동-2-92`  가리봉동 2-92(공공재개발, 25,776㎡)
      · 구로구 공고 제2025-1133호(2025-06-19) 「건축허가 제한 공고」 붙임 지형도면(1:2,000)
      · 도형 25,689.6㎡ = 공식의 99.7%
      · 유형도 '신통기획' → '공공재개발'로 바로잡는다(구로구 추진현황·서울시 선정위원회 모두 공공재개발).
   2) `guro-739-7`  구로동 739-7 일대(신통기획, 92,521㎡)
      · 구로구 고시 제2025-181호(2025-11-06) 「건축허가등 제한 지형도면 고시」 붙임(1:3,000)
      · 도형 92,824.1㎡ = 공식의 100.3%
   3) `guro-792-3`  구로동 792-33 일대(신통기획, 58,472.7㎡)
      · 서울특별시고시 제2026-103호(2026-02-26, 서울시보 제4129호 447쪽) 관계도면(1:2,000)
      · 도형 58,311.9㎡ = 공식의 99.7%
      · 단계도 후보지 선정 → **추진위원회 승인(2026-11-12, 구로구 고시 제2026-171호)** 로 갱신
B. 마포구 염리·공덕 일대 4곳
   4) 신규 `mapo-yeomni-5` 염리5구역 — 추진위 승인 고시(마포구 고시 제2026-158호, 2026-10-08)
      붙임 결정도의 (예정)구역계 → 도형 72,465.1㎡ = 공식 72,178.27㎡의 100.4%
   5) 신규 `mapo-yeomni-27-46` (가)염리동 27-46 모아타운 — 공식 구역계가 아직 없어 대표 점만
      (geom "미고시") + 사유 기재
   6) 신규 `mapo-hyeondae` 마포현대아파트 재건축 — 공람(2026-05-14) 단계. 결정도 원본을
      내려받지 못해 **단지 필지(공덕동 188-108)** 지적으로 표시(공람안 21,559㎡ 대비 98.9%)
   7) `11000UQ120PS202505310816` 공덕현대아파트 소규모재건축 — 단계 `건축심의` →
      **관리처분계획인가(2025-10-02)**

실행: python3 scripts/apply-mapo-guro-7zones-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "mapo-guro-20261127.json"
AS_OF = "2026-11-27"
M_LAT = 110900.0

B = json.loads(DATA.read_text(encoding="utf-8"))


def kx(lat):
    return 111320.0 * math.cos(math.radians(lat))


# 평면 좌표 원점 — 큰 좌표(1e8)에서 GEOS 정밀도가 떨어지므로 서울 중심을 원점으로 뺀다.
ORIGIN = (37.50, 126.90)
KX = kx(ORIGIN[0])


def to_m(ring):
    """[lat,lng] → 평면 m (원점 공통)."""
    return [((p[1] - ORIGIN[1]) * KX, (p[0] - ORIGIN[0]) * M_LAT) for p in ring]


def shape(ring):
    return Polygon(to_m(ring)).area


def overlap(a, b):
    pa = Polygon(to_m(a)).buffer(0)
    pb = Polygon(to_m(b)).buffer(0)
    return pa.intersection(pb).area


def close(ring):
    r = [[round(p[0], 7), round(p[1], 7)] for p in ring]
    if r[0] != r[-1]:
        r.append(list(r[0]))
    return r


# ── 공통 출처
VWORLD = {
    "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 경계 — 리디브 /api/parcel 점 조회(2026-11-27)",
    "url": "https://www.vworld.kr/dtld/dbndDtlPage.do",
}

# ── 1) 가리봉동 2-92
GARIBONG = dict(
    type="공공재개발",
    kind="공공재개발",
    stage="후보지 선정(2025-08-27) → 준비위원회 구성 승인(2026-01-28)",
    stageCode="PP0205",
    spec=8,
    prog=35,
    area=25776,
    geom="고시도면",
    boundaryApprox=False,
    areaShape=B["garibong292"]["areaShape"],
    note=(
        "구로구 가리봉동 2-92번지 일대(영일초 서북쪽) 25,776㎡가 2025-08-27 '25년 제4차 주택재개발사업 "
        "후보지 선정위원회에서 공공재개발 후보지로 선정됐습니다. LH가 사업을 맡아 2025-11-03 준비위원회 "
        "구성 관련 주민설명회를 열었고, 2026-01-28 준비위원회 구성 승인, 2026-03-04 LH와 준비위원회 "
        "업무협약까지 마쳤습니다. 설명회에서는 용적률 300%(종상향)·지상 26층·642~651가구 규모의 "
        "계획(안)이 제시됐습니다. 2025-06-19 구로구는 미선정 구역이던 이 일대에 건축허가·착공 제한을 "
        "고시(구로구 공고 제2025-1133호)했고, 그 지형도면의 구역계(25,776㎡)가 지금 지도의 경계입니다. "
        "남쪽으로 구로동 719번지 일대(신속통합기획)와 맞닿아 있어 2023~2024년 두 사업 추진주체 간 "
        "중복구역 조정을 거쳤고, 그 결과 조정된 구역계가 지금의 경계입니다."
    ),
    areaNote=(
        "공식 면적 25,776㎡ — 구로구 공고 제2025-1133호 제한면적과 2025년 제4차 후보지 선정 면적이 "
        "같습니다. 지도 도형은 25,689.6㎡로 공식의 99.7%입니다."
    ),
    boundaryNote=(
        "2025-06-19 구로구 공고 제2025-1133호 「건축허가 제한 공고」 붙임 지형도면(1:2,000)의 적색 "
        "구역선을 브이월드 연속지적도 필지선에 맞춰 옮겨 그린 경계입니다. 같은 변환으로 도면의 지적선 "
        "전체를 필지선 위에 겹쳐 정합을 확인했습니다(적색 구역선과 필지선 오차 1~2m). 구역계는 정비구역 "
        "지정 전 후보지 단계의 것이어서 정비계획 수립 과정에서 달라질 수 있습니다."
    ),
    sources=[
        {
            "label": "구로구 공고 제2025-1133호(2025-06-19) 「건축허가 제한 공고(가리봉동 2-92일대, 온수동 62일대)」 — 붙임 지형도면",
            "url": "https://www.guro.go.kr/bbs/selectBbsNttView.do?bbsNo=662&key=3477&nttNo=225930",
        },
        {
            "label": "구로구청 — 재개발정비사업 추진현황(총괄) 11번 가리봉동 2-92번지 일대",
            "url": "https://www.guro.go.kr/www/contents.do?key=2591",
        },
        {
            "label": "서울시 — 신속통합기획 주택재개발 후보지 8곳 추가선정(2025-08-28, '25년 제4차 선정위원회)",
            "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=442032",
        },
        VWORLD,
    ],
)

# ── 2) 구로동 739-7
GURO739 = dict(
    type="신통기획",
    kind="신속통합기획",
    stage="후보지선정",
    area=92521,
    geom="고시도면",
    boundaryApprox=False,
    areaShape=B["guro739"]["areaShape"],
    note=(
        "구로구 구로동 739-7번지 일대 92,521㎡가 2025-11-03 '25년 제5차 주택재개발 후보지 선정위원회에서 "
        "신속통합기획 후보지로 선정됐습니다(1·2종 일반주거지역, 권리산정기준일 2025-09-25). 2025-11-06 "
        "구로구 고시 제2025-181호로 건축허가·착공 제한 지형도면이 고시됐고, 2025-11-11부터 토지거래허가구역으로 "
        "묶였습니다. 같은 해 4월 동의서 (추가)번호부여 때 공개된 구역계를 바탕으로 후보지가 됐고, 2026년에는 "
        "주민 설문(의견)조사와 정비계획 수립 용역 절차가 이어졌습니다. 아직 정비구역 지정 전입니다."
    ),
    areaNote=(
        "공식 면적 92,521㎡(구로구 고시 제2025-181호 제한면적 92,521㎡, 서울시 선정 공고 92,521.1㎡). "
        "지도 도형은 92,824.1㎡로 공식의 100.3%입니다."
    ),
    boundaryNote=(
        "2025-11-06 구로구 고시 제2025-181호 「건축허가등 제한 지형도면 고시」 붙임 지형도면(1:3,000)의 "
        "적색 구역선을 브이월드 연속지적도 필지선에 맞춰 옮겨 그린 경계입니다. 같은 변환으로 도면의 지적선 "
        "전체를 필지선 위에 겹쳐 정합을 확인했고(오차 1~2m), 도형 면적은 공식의 100.3%입니다. 후보지 단계 "
        "구역계라 정비구역 지정 과정에서 달라질 수 있습니다."
    ),
    sources=[
        {
            "label": "서울특별시 구로구 고시 제2025-181호(2025-11-06) 「건축허가등 제한 지형도면 고시」 — 구로동 739-7 일대 92,521㎡",
            "url": "https://www.guro.go.kr/bbs/selectBbsNttView.do?bbsNo=662&key=3477&nttNo=225930",
        },
        {
            "label": "서울시 — 신속통합기획 주택재개발 후보지 7곳 추가선정(2025-11-04, '25년 제5차 선정위원회)",
            "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=445987",
        },
        {
            "label": "구로구청 — 재개발정비사업 추진현황(총괄) 14번 구로동 739-7(위치·면적 92,521㎡)",
            "url": "https://www.guro.go.kr/www/contents.do?key=2591",
        },
        VWORLD,
    ],
)

# ── 3) 구로동 792-33
GURO792 = dict(
    stage="추진위원회 승인(2026-11-12)",
    stageCode="PP0205",
    spec=8,
    prog=35,
    geom="고시도면",
    boundaryApprox=False,
    areaShape=B["guro792"]["areaShape"],
    note=(
        "구로구 구로동 792-33번지 일대 신속통합기획 주택재개발사업입니다. 2026-02-23 후보지 선정위원회에서 "
        "선정돼 2026-02-26 서울특별시고시 제2026-103호로 건축허가등 제한 지형도면(제한면적 58,472.7㎡)이 "
        "고시됐고, 같은 날 고시 제2026-104호로 권리산정기준일이 2026-01-26으로 정해졌습니다. 2026-03-17부터 "
        "2027-04-03까지 토지거래허가구역입니다. 정비계획 수립과 주민참여단 모집을 거쳐 2026-11-12 구로구 고시 "
        "제2026-171호로 조합설립추진위원회 구성이 승인됐습니다(구역면적 58,472.7㎡ 그대로). 정비구역 지정은 "
        "아직입니다."
    ),
    areaNote=(
        "공식 면적 58,472.7㎡(서울특별시고시 제2026-103호 제한면적·구로구 고시 제2026-171호 구역면적). "
        "지도 도형은 58,311.9㎡로 공식의 99.7%입니다."
    ),
    boundaryNote=(
        "2026-02-26 서울특별시고시 제2026-103호 「건축허가등 제한 지형도면 고시」의 관계도면(1:2,000, 서울시보 "
        "제4129호 447쪽)에 그려진 적색 구역계를 브이월드 연속지적도 필지선에 맞춰 옮겨 그린 경계입니다. 같은 "
        "변환으로 도면의 지적선 전체를 필지선 위에 겹쳐 정합을 확인했습니다. 2026-11-12 추진위 승인 고시의 "
        "구역면적이 58,472.7㎡로 같아 그대로 씁니다. 후보지 단계 구역계라 정비구역 지정 시 달라질 수 있습니다."
    ),
    sources=[
        {
            "label": "서울특별시고시 제2026-103호(2026-02-26) 「건축허가등 제한 지형도면 고시」 — 서울시보 제4129호 444~447쪽, 구로동 792-33 일대 58,472.7㎡",
            "url": "https://www.seoul.go.kr/func/snews/data/CN_MST/seoulsibo_20260227133418_23907.pdf",
        },
        {
            "label": "서울특별시 구로구 고시 제2026-171호(2026-11-12) 「구로동 792-33번지 일대 주택재개발정비사업 조합설립추진위원회 승인 고시」 — 구역면적 58,472.7㎡",
            "url": "https://www.guro.go.kr/www/selectBbsNttGosiView.do?bbsNo=663&nttNo=51806",
        },
        {
            "label": "서울시 — 신통기획 후보지 6곳 토지거래허가구역 지정(2026-03-05, 2026-03-17~2027-04-03)",
            "url": "https://www.yna.co.kr/view/AKR20260304182800004",
        },
        VWORLD,
    ],
)

# ── 4) 염리5구역 (신규)
YEOMNI5 = dict(
    id="mapo-yeomni-5",
    name="염리5구역",
    alias=[
        "염리5", "염리5구역", "염리동 81번지 일대", "염리동 81", "마포 염리5구역",
        "염리동 81번지 일대 주택정비형 재개발사업", "염리5구역 재개발", "마포구 염리동 재개발",
        "대흥역 염리5구역",
    ],
    type="일반재개발",
    kind="재개발(주택정비형)",
    stage="추진위원회 승인(2026-10-08)",
    stageCode="PP0205",
    spec=8,
    prog=35,
    gu="마포구",
    guCode="11440",
    area=72178,
    households=1617,
    geom="고시도면",
    boundaryApprox=True,
    areaShape=B["yeomni5"]["areaShape"],
    centerLabel="대흥역(6호선) 남측 — 백범로 이북 염리동 81번지 일대",
    note=(
        "마포구 염리동 81번지 일대 주택정비형 재개발사업(옛 아현뉴타운 염리5구역)입니다. 2003년 아현뉴타운 "
        "염리5구역으로 정비구역에 들어갔다가 2015년 정비구역과 촉진지구가 모두 해제됐고, 2020년 사전타당성 "
        "주민요청으로 재추진에 들어갔습니다. 2026-04-30 정비계획 수립 및 정비구역 지정(안) 공람(마포구 공고 "
        "제2026-751호)을 마치고 2026-09-10 마포구의회 의견청취를 거쳐, 2026-10-06 조합설립추진위원회 구성을 "
        "승인받아 2026-10-08 고시(마포구 고시 제2026-158호)됐습니다. 구역면적 72,178.27㎡에 토지등소유자 "
        "1,034명, 정비계획(안)은 용적률 287.72%(예정법적상한 290%)로 지하 3층~지상 32층 15개동 1,617세대"
        "(임대 343세대 포함)입니다. 현재 863세대에서 754세대가 늘어납니다. 2027년 하반기 조합설립인가를 "
        "목표로 서울시 도시계획위원회 심의와 정비구역 지정을 남겨두고 있습니다."
    ),
    areaNote=(
        "공식 면적 72,178.27㎡ — 마포구 고시 제2026-158호 구역면적. 지도 도형은 72,465.1㎡로 공식의 "
        "100.4%입니다."
    ),
    boundaryNote=(
        "마포구 고시 제2026-158호(2026-10-08) 붙임 결정도(1:2,000)의 적색 점선 「정비구역 구역계(예정)」를 "
        "브이월드 연속지적도 필지선에 맞춰 옮겨 그린 경계입니다. 같은 변환으로 도면의 지적선 전체를 필지선 "
        "위에 겹쳐 정합을 확인했습니다(오차 1~2m). 도면에 구역에서 빼낸 것으로 표시된 안쪽 블록은 도형에서도 "
        "비웠습니다. 아직 정비구역 지정 고시 전인 (예정)구역계라 점선으로 표시하며, 서울시 도시계획위원회 "
        "심의·정비구역 지정에서 달라질 수 있습니다."
    ),
    sources=[
        {
            "label": "서울특별시 마포구 고시 제2026-158호(2026-10-08) 「염리동 81번지 일대 조합설립추진위원회 승인 고시」 — 구역면적 72,178.27㎡",
            "url": "https://www.mapo.go.kr/site/main/nPortal/detail?bcId=21164",
        },
        {
            "label": "서울특별시 마포구 공고 제2026-751호(2026-04-30) 「염리동 81번지 일대 주택정비형 재개발사업 정비계획 수립 및 정비구역 지정(안) 공람공고」",
            "url": "https://www.mapo.go.kr/site/main/nPortal/list",
        },
        {
            "label": "마포구의회 제286회 도시환경건설위원회 제3차(2026-09-10) 회의록 — 염리동 81번지 일대 정비구역 지정(안) 의견청취",
            "url": "https://council.mapo.seoul.kr/record/recordView.do?key=1c42a8dda2060677af0ead65eb327f61330e00d9a00bc76fc5245a50c25bba86cf1e92da414ee5e5",
        },
        VWORLD,
    ],
)

# ── 5) (가)염리동 27-46 모아타운 (신규, 대표 점)
YEOMNI2746 = dict(
    id="mapo-yeomni-27-46",
    name="(가)염리동 27-46 모아타운",
    alias=["염리동 27-46", "(가)염리동 27-46", "염리동 27-46 모아타운", "마포 염리동 모아타운"],
    type="모아타운",
    kind="모아타운",
    stage="추진준비",
    gu="마포구",
    guCode="11440",
    area=12732,
    geom="미고시",
    center=[37.548943, 126.94914],
    centerLabel="공식 대표 지번 염리동 27-46",
    note=(
        "마포구 염리동 27-46번지 일대는 모아타운 추진을 준비하는 구역으로, 공개 자료 기준 면적 12,732㎡·"
        "토지등소유자 약 224명·노후도 약 64%입니다. 아직 마포구나 서울시가 후보지로 선정하거나 구역계를 "
        "공고하지 않아 공식 경계가 없습니다. 서울시는 2026-10-12 '모아통합기획' 후보지 수시 공모를 시작했고"
        "(11-02부터 접수, 면적 2만~10만㎡·노후도 50% 이상·토지등소유자 60% 동의 필요), 이 구역은 1만2천㎡대라 "
        "단독 신청은 면적 요건에 미달합니다. 인접 구역과 묶이거나 관리계획 수립 과정에서 범위가 정해질 "
        "것으로 보입니다. 지도에는 대표 지번 위치만 표시하고 경계는 그리지 않습니다."
    ),
    boundaryNote=(
        "공식 구역계가 아직 공고되지 않아 경계를 그리지 못했습니다(대표 지번 점 표시). 마포구가 모아타운 "
        "동의서 번호를 부여하며 구역계를 공개하거나 후보지로 선정되면 그 도면으로 경계를 채웁니다."
    ),
    sources=[
        {
            "label": "서울시 — '모아통합기획' 후보지 공모 개시… '30년까지 100곳 선정(2026-10-12, 주택실 모아주택과)",
            "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=467904",
        },
        {
            "label": "정비사업 정보몽땅 — 모아타운(소규모주택정비 관리지역) 현황",
            "url": "https://cleanup.seoul.go.kr/cleanup/view/moaTown.do",
        },
    ],
)

# ── 6) 마포현대아파트 재건축 (신규, 단지 필지 경계)
MAPOHYEONDAE = dict(
    id="mapo-hyeondae",
    name="마포현대아파트 재건축",
    alias=[
        "마포현대", "마포현대아파트", "마포현대 재건축", "공덕동 188-108", "공덕동 188-108번지 일대",
        "마포현대아파트 재건축정비사업", "아현 재정비촉진지구 마포현대", "마포현대아파트 재건축정비사업 조합",
    ],
    type="재건축",
    kind="재건축(공동)",
    stage="정비구역지정(공람)",
    stageCode="PP0101",
    spec=2,
    prog=10,
    gu="마포구",
    guCode="11440",
    area=21559,
    households=670,
    geom="필지정합",
    boundaryApprox=True,
    areaShape=B["mapohyeondae"]["areaShape"],
    centerLabel="공덕역(5·6호선·공항철도) 북동쪽 고지대 — 공덕동 188-108번지 일대(아현 재정비촉진지구)",
    note=(
        "아현재정비촉진지구 안에서 존치구역으로 묶여 있던 마포현대아파트(공덕동 188-108번지 일대, 현황 480세대)를 "
        "재정비촉진구역으로 편입해 재건축하는 사업입니다. 마포구는 2026-05-14 공고 제2026-820호로 재정비촉진구역 "
        "지정 및 촉진계획 변경(안)을 공람(5-14~5-28)했고, 2026-09-10 마포구의회 의견청취를 거쳐 2026-11-30 "
        "주민공청회를 엽니다(공고 제2026-1764호). 구역면적 21,559㎡에 기준용적률 220%·정비계획 226.06%·법적상한 "
        "310%, 건폐율 50% 이하, 최고 35층 110m로 670세대(분양 613·임대 57)를 짓습니다. 단지 옆 소로2-A 도로를 "
        "8~12m에서 12~16m로 넓히고 어린이놀이터·경로당·어린이집·작은도서관·다함께돌봄센터 등 주민공동시설 "
        "3,260㎡를 넣습니다. 공청회 뒤 서울시 도시재정비위원회 심의를 거쳐 구역 지정이 결정됩니다."
    ),
    areaNote=(
        "공람안 구역면적 21,559㎡ 대비 지도 도형은 21,312.2㎡로 98.9%입니다. 차이는 소로2-A 도로 확폭분 등 "
        "구역계에 포함된 도로 일부를 단지 필지 도형이 담지 못한 데서 생깁니다."
    ),
    boundaryNote=(
        "마포구 공람 공고(제2026-820호)의 정비구역 결정도 원본을 내려받지 못해, 재건축 대상 단지 필지인 "
        "공덕동 188-108(21,310.6㎡)의 지적 경계로 표시했습니다. 실제 구역계는 이 필지에 인접 도로 일부를 더한 "
        "형태라 구역 지정 고시 뒤 그 도면으로 다시 맞춥니다. 점선으로 표시합니다."
    ),
    sources=[
        {
            "label": "서울특별시 마포구 공고 제2026-820호(2026-05-14) 「아현 재정비촉진지구 마포현대아파트 재정비촉진구역 지정 및 촉진계획 변경(안) 공람·공고」 — 구역면적 21,559㎡",
            "url": "https://www.mapo.go.kr/site/main/nPortal/list",
        },
        {
            "label": "서울특별시 마포구 공고 제2026-1764호(2026-11-05) 「마포현대아파트 재정비촉진구역 지정 및 촉진계획 변경(안)에 따른 공청회 알림 공고」 — 2026-11-30 19:00 마포구청",
            "url": "https://www.mapo.go.kr/site/main/nPortal/list",
        },
        {
            "label": "마포구의회 제286회 도시환경건설위원회 제3차(2026-09-10) 회의록 — 마포현대아파트 정비구역 지정(안) 의견청취",
            "url": "https://council.mapo.seoul.kr/record/recordView.do?key=1c42a8dda2060677af0ead65eb327f61330e00d9a00bc76fc5245a50c25bba86cf1e92da414ee5e5",
        },
        VWORLD,
    ],
)

# ── 7) 공덕현대 — 단계 갱신
GONGDEOK_STAGE = dict(
    stage="관리처분계획인가",
    stageCode="PP0209",
    prog=70,
    note_add=(
        " 2025-10-02 마포구 고시 제2025-164호로 사업시행계획이 인가·고시됐고(지하 2층~지상 20층 공동주택 "
        "2개동 232세대, 건폐율 22.62%·용적률 273.64%), 같은 날 관리처분계획인가까지 받은 것으로 공개자료에 "
        "표시돼 있습니다. 2026-05-21 고시 제2026-81호, 2026-11-12 고시 제2026-180호로 조합설립변경인가가 "
        "있었습니다(조합임원·사무소 소재지 변경)."
    ),
    sources=[
        {
            "label": "서울특별시 마포구 고시 제2025-164호(2025-10-02) 「공덕현대아파트 소규모재건축정비사업 사업시행계획인가 고시」 — 232세대",
            "url": "https://eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=630771",
        },
        {
            "label": "서울특별시 마포구 고시 제2026-180호(2026-11-12) 「공덕현대아파트 소규모재건축정비사업 조합설립변경인가 고시」",
            "url": "https://www.mapo.go.kr/site/main/nPortal/list",
        },
    ],
)


def apply_patch(zones: list) -> tuple[list, dict]:
    by_id = {z["id"]: z for z in zones}
    report = {}

    # 1) 가리봉동 2-92
    z = by_id["rest17gu-gr-가리봉동-2-92"]
    for k, v in GARIBONG.items():
        z[k] = v
    z["polygon"] = close(B["garibong292"]["ring"])
    z["holes"] = [close(h) for h in B["garibong292"]["holes"]]
    z["ringPts"] = len(z["polygon"])
    z["asOf"] = AS_OF
    z["center"] = [round(sum(p[0] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7),
                   round(sum(p[1] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7)]
    report["garibong"] = z["areaShape"]

    # 2) 구로동 739-7
    z = by_id["guro-739-7"]
    for k, v in GURO739.items():
        z[k] = v
    z["polygon"] = close(B["guro739"]["ring"])
    z["ringPts"] = len(z["polygon"])
    z["asOf"] = AS_OF
    z["center"] = [round(sum(p[0] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7),
                   round(sum(p[1] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7)]
    report["guro739"] = z["areaShape"]

    # 3) 구로동 792-33
    z = by_id["guro-792-3"]
    for k, v in GURO792.items():
        z[k] = v
    z["polygon"] = close(B["guro792"]["ring"])
    z["ringPts"] = len(z["polygon"])
    z["asOf"] = AS_OF
    report["guro792"] = z["areaShape"]

    # 4) 염리5구역
    if "mapo-yeomni-5" not in by_id:
        z = dict(YEOMNI5)
        z["sid"] = "서울시 마포구 고시 제2026-158호(2026-10-08)"
        z["polygon"] = close(B["yeomni5"]["ring"])
        z["ringPts"] = len(z["polygon"])
        z["asOf"] = AS_OF
        z["date"] = "2026-10-08"
        z["featured"] = False
        z["center"] = [round(sum(p[0] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7),
                       round(sum(p[1] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7)]
        zones.append(z)
        report["yeomni5"] = z["areaShape"]

    # 5) (가)염리동 27-46
    if "mapo-yeomni-27-46" not in by_id:
        z = dict(YEOMNI2746)
        z["sid"] = "공개 자료(2026-11-27)"
        z["asOf"] = AS_OF
        z["featured"] = False
        zones.append(z)
        report["yeomni2746"] = None

    # 6) 마포현대
    if "mapo-hyeondae" not in by_id:
        z = dict(MAPOHYEONDAE)
        z["sid"] = "서울시 마포구 공고 제2026-820호(2026-05-14)"
        z["polygon"] = close(B["mapohyeondae"]["ring"])
        z["ringPts"] = len(z["polygon"])
        z["asOf"] = AS_OF
        z["date"] = "2026-05-14"
        z["featured"] = False
        z["center"] = [round(sum(p[0] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7),
                       round(sum(p[1] for p in z["polygon"][:-1]) / (len(z["polygon"]) - 1), 7)]
        zones.append(z)
        report["mapohyeondae"] = z["areaShape"]

    # 7) 공덕현대
    z = by_id["11000UQ120PS202505310816"]
    z["stage"] = GONGDEOK_STAGE["stage"]
    z["stageCode"] = GONGDEOK_STAGE["stageCode"]
    z["prog"] = GONGDEOK_STAGE["prog"]
    z["asOf"] = AS_OF
    z["note"] = (z.get("note") or "").rstrip() + GONGDEOK_STAGE["note_add"]
    src = z.setdefault("sources", [])
    for s in GONGDEOK_STAGE["sources"]:
        if not any(x.get("url") == s["url"] for x in src):
            src.append(s)
    report["gongdeok"] = z["stage"]

    return zones, report


def prev_zones() -> dict:
    try:
        txt = subprocess.run(["git", "show", "HEAD:src/data/seoul-zones.json"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout
        return {z["id"]: z for z in json.loads(txt)}
    except Exception as e:  # noqa: BLE001
        print("!! HEAD 비교 불가:", e)
        return {}


def main():
    check_only = "--check" in sys.argv
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    before = len(zones)
    zones, report = apply_patch(zones)

    by_id = {z["id"]: z for z in zones}
    ok = True

    # 검증 1 — 개수·필수 구역
    print(f"구역 {before} → {len(zones)}")
    for zid in ("rest17gu-gr-가리봉동-2-92", "guro-739-7", "guro-792-3",
                "mapo-yeomni-5", "mapo-yeomni-27-46", "mapo-hyeondae", "11000UQ120PS202505310816"):
        if zid not in by_id:
            print("!! 없음:", zid)
            ok = False

    # 검증 2 — 도형 면적·공식 면적
    for zid, official in (("rest17gu-gr-가리봉동-2-92", 25776), ("guro-739-7", 92521),
                          ("guro-792-3", 58472.7), ("mapo-yeomni-5", 72178.27), ("mapo-hyeondae", 21559)):
        z = by_id[zid]
        a = shape(z["polygon"][:-1])
        ratio = a / official * 100
        flag = "ok" if 98.0 <= ratio <= 102.0 else "!!"
        print(f"  {zid:34s} 도형 {a:9.1f}㎡ / 공식 {official:9.1f}㎡ = {ratio:6.2f}% {flag}")
        if flag != "ok":
            ok = False

    # 검증 3 — 이웃 구역과 겹침
    changed = {"rest17gu-gr-가리봉동-2-92", "guro-739-7", "guro-792-3", "mapo-yeomni-5", "mapo-hyeondae"}
    for zid in changed:
        z = by_id[zid]
        ring = z["polygon"][:-1]
        # 좌표 범위로 후보를 좁힌다
        lat0 = min(p[0] for p in ring); lat1 = max(p[0] for p in ring)
        lng0 = min(p[1] for p in ring); lng1 = max(p[1] for p in ring)
        for other in zones:
            if other["id"] == zid or not other.get("polygon"):
                continue
            o = other["polygon"]
            if max(p[0] for p in o) < lat0 or min(p[0] for p in o) > lat1:
                continue
            if max(p[1] for p in o) < lng0 or min(p[1] for p in o) > lng1:
                continue
            ov = overlap(ring, o[:-1] if o[0] == o[-1] else o)
            if ov > 200:
                print(f"  ! 겹침 {zid} ↔ {other['id']}({other['name']}) {ov:.0f}㎡")

    # 검증 4 — 다른 구역이 바뀌지 않았는지
    prev = prev_zones()
    if prev:
        changed_ids = set()
        for z in zones:
            p = prev.get(z["id"])
            if p is None:
                changed_ids.add(z["id"] + "(신규)")
            elif json.dumps(z, sort_keys=True, ensure_ascii=False) != json.dumps(p, sort_keys=True, ensure_ascii=False):
                changed_ids.add(z["id"])
        missing = set(prev) - {z["id"] for z in zones}
        print("바뀐 구역:", sorted(changed_ids) if changed_ids else "없음")
        if missing:
            print("!! 사라진 구역:", missing)
            ok = False

    if check_only:
        print("검사만 수행:", "통과" if ok else "문제 있음")
        return

    if not ok:
        print("문제가 있어 쓰지 않습니다.")
        sys.exit(1)

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    meta = json.loads(META.read_text(encoding="utf-8"))
    meta.setdefault("updates", {})
    meta["updates"]["mapoGuro20261127"] = {
        "asOf": AS_OF,
        "note": "구로·가리봉 3곳 지형도면 필지정합 경계 반영(가리봉동 2-92 유형 공공재개발 정정, 구로동 792-33 추진위 승인 단계), "
                "마포구 염리5구역·(가)염리동 27-46·마포현대아파트 재건축 신규, 공덕현대 관리처분계획인가 단계 갱신",
        "added": 3,
        "rebuilt": 4,
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("저장 완료:", SOURCE.relative_to(ROOT), "·", META.relative_to(ROOT))


if __name__ == "__main__":
    main()
