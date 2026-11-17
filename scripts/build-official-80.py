#!/usr/bin/env python3
"""
「리디브 누락구역 비교리스트」 ① 선정·고시 80곳 중 **실제로 빠진 구역**을
서울시·국토부·자치구 공식 자료로 확인해 `scripts/data/official-80.json` 으로 만든다.

원칙
  · 80곳을 그대로 믿지 않는다. 기존 zones.geojson(2,179곳)에 이미 있는 구역은
    '중복'으로 분류하고 별칭(alias)만 보강한다(같은 구역을 두 번 그리지 않는다).
  · 공식 경계 도형(서울시 의제처리구역 UQ181)이 확인된 곳만 폴리곤을 넣는다.
  · 나머지는 대표 지점(중심 좌표)만 두고 `geom: "미고시"` — 가짜 경계를 만들지 않는다.
  · 중심 좌표는 공식 대표 지번을 카카오 주소 검색으로 지오코딩해 `data/official-80-centers.json` 에 두고 읽는다.
  · 공식 경계 도형(UQ181) 2곳은 `data/official-80-polygons.json`(EPSG:5174→WGS84, 간략화)에서 읽는다.

산출물 구조
  { asOf, description, sources: {key: {label,url}}, aliases: [...], additions: [...] }
"""
import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))

S = {
    # ── 서울시 정비사업 정보몽땅 (공식 현황) ──────────────────────────────
    "cleanup-intgr": {
        "label": "정비사업 정보몽땅 — 신속통합기획 후보지 수시 선정구역(총 100개소)",
        "url": "https://cleanup.seoul.go.kr/cleanup/view/publicIntgrPlanArea.do",
    },
    "cleanup-public-rdv": {
        "label": "정비사업 정보몽땅 — 공공재개발 선정구역(2차 8곳·후보지 수시 3곳)",
        "url": "https://cleanup.seoul.go.kr/cleanup/view/publicRdvlpmntArea.do",
    },
    "cleanup-moa": {
        "label": "정비사업 정보몽땅 — 모아타운 취소현황",
        "url": "https://cleanup.seoul.go.kr/cleanup/view/moaTown.do",
    },
    # ── 서울시 보도자료 ──────────────────────────────────────────────────
    "seoul-2025-11-04": {
        "label": "서울시 — 신속통합기획 주택재개발 후보지 7곳 추가선정(2025-11-04, ’25년 제5차 선정위원회)",
        "url": "https://news.seoul.go.kr/citybuild/archives/532260",
    },
    "seoul-2026-05-07": {
        "label": "서울시 — 신통기획 후보지 18곳·모아타운 10곳 토지거래허가구역 지정(2026-05-07)",
        "url": "https://www.seoul.go.kr/news/news_report.do?bbsNo=158&nttNo=457529",
    },
    "seoul-2026-07-30": {
        "label": "서울시 — 구의·신길·갈현 신통기획 후보지 3곳 추가선정(2026-07-30)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=462965",
    },
    "seoul-2026-03-20": {
        "label": "서울시 — 원효로1가역세권 장기전세주택 정비구역 지정 심의 결과(2026-03-20)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=454594",
    },
    # ── 국토교통부 ───────────────────────────────────────────────────────
    "molit-2026-09-30": {
        "label": "국토교통부 — 도심 공공주택 복합사업 서울 11곳(1.8만호) 신규 후보지 선정(2026-09-30)",
        "url": "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95092473",
    },
    "molit-notice-2026-1248": {
        "label": "국토교통부 공고 제2026-1248호 — 도심 공공주택 복합사업 후보지 선정 공고(2026-10-01)",
        "url": "https://www.molit.go.kr/USR/BORD0201/m_69/DTL.jsp?id=N01_B&mode=view&idx=269997",
    },
    "molit-2026-571": {
        "label": "국토교통부 고시 제2026-571호 — 서울 동자동 공공주택지구 지정 및 지형도면(2026-10-21)",
        "url": "https://www.molit.go.kr/USR/BORD0201/m_69/LST.jsp",
    },
    # ── 서울시 고시(서울시보) ─────────────────────────────────────────────
    "seoul-gosi-search": {
        "label": "토지이음 고시정보 — 서울특별시 고시 원문 검색",
        "url": "https://www.eum.go.kr/web/gs/gv/gvGosiList.jsp",
    },
    "seoul-oa-20957": {
        "label": "서울 열린데이터광장 OA-20957 — 서울시 의제처리구역 위치정보(UQ181, 정비구역 실경계)",
        "url": "https://data.seoul.go.kr/dataList/OA-20957/S/1/datasetView.do",
    },
    # ── 자치구 ───────────────────────────────────────────────────────────
    "ys-gosi-2026-137": {
        "label": "용산구 고시 제2026-137호 — 남영역세권·서빙고역세권 개발행위허가 제한지역 지정(2026-10-08)",
        "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11170TTC202610080009/%EA%B3%A0%EC%8B%9C%EB%AC%B8.pdf",
    },
    "ys-gonggo-2026-1271": {
        "label": "용산구 공고 제2026-1271호 — 남산대림아파트 재건축 정비계획·정비구역 지정(안) 주민공람(2026-09-18)",
        "url": "http://eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp?seq=5591",
    },
    "ydp-2026-05-26": {
        "label": "영등포구 — 대림동 680번지 일대 신통기획 동의서 번호부여 구역 공개(2026-05-26)",
        "url": "https://www.ydp.go.kr/www/selectBbsNttView.do?bbsNo=40&key=2848&nttNo=415022",
    },
    "sb-gonggo-2026-1819": {
        "label": "성북구 공고 제2026-1819호 — 장위동 219-15번지 일대 모아타운 관리계획(안) 공람(2026-11-12)",
        "url": "https://www.sb.go.kr/",
    },
    "dj-gonggo-2026-139": {
        "label": "동작구 공고 — 상도동 279번지 일대 모아타운 관리계획(안) 주민공람(2026-11-05)",
        "url": "https://www.dongjak.go.kr/",
    },
    "moa-archive": {
        "label": "서울시 모아주택·모아타운 온라인 아카이브",
        "url": "https://news.seoul.go.kr/citybuild/moa-housing-town/archive/seoul-southwest",
    },
    "seoul-opendata-22712": {
        "label": "서울 열린데이터광장 OA-22712 — 서울시 도시계획사업 현황(서울플랜+)",
        "url": "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do",
    },
}

# ── 이미 리디브에 있는 구역(중복) → 이름·지번 별칭만 보강 ──────────────────
ALIASES = [
    {
        "id": "11000UQ120PS202601310048",
        "name": "자양4동A구역주택재개발사업",
        "alias": ["자양4 A", "자양4A", "자양4동 A", "자양4동통합구역", "자양4동 57-90", "자양4동 57-90번지 일대"],
        "note": "비교리스트의 ‘자양4 A’는 이 구역이다. ‘동’ 표기 차이로 누락으로 잘못 잡혔다(신속통합기획 2차 공모 자양4동통합구역 139,130㎡ → 구역지정).",
        "sources": ["cleanup-intgr"],
    },
    {
        "id": "11215UQ120PS202609020001",
        "name": "구의2동 A구역 주택재개발사업",
        "alias": ["구의동 46", "구의동 46번지 일대", "구의2동A", "구의2동 A", "구의2동A구역"],
        "note": "비교리스트의 ‘구의2동A(구의동 46)’·‘구의동 46’ 두 줄이 모두 이 구역이다. 서울시 신속통합기획 후보지 목록은 105,957.2㎡, 서울플랜+ 도형·면적은 120,702.8㎡로 적혀 있다.",
        "sources": ["cleanup-intgr"],
    },
    {
        "id": "11215UQ120PS202609030001",
        "name": "구의2동 32번지 일재 주택재개발사업",
        "alias": ["구의동 32", "구의동 32번지 일대", "구의2동 32"],
        "note": "비교리스트의 ‘구의동 32’는 이 구역이다(2026-07-29 신통기획 후보지 선정, 29,576~29,780㎡).",
        "sources": ["seoul-2026-07-30"],
    },
    {
        "id": "11215UQ120PS202609020002",
        "name": "중곡1동 B구역 주택재개발사업",
        "alias": ["중곡동 232-1", "중곡동 232-1번지 일대", "중곡1동B"],
        "note": "비교리스트의 ‘중곡동 232-1’은 이 구역이다(2026-05-06 신통기획 후보지 선정, 63,963.3㎡).",
        "sources": ["cleanup-intgr", "seoul-2026-05-07"],
    },
    {
        "id": "11000UQ120PS202505310012",
        "name": "개봉동 120-1",
        "alias": ["개봉7", "개봉7구역", "개봉동 120-1번지 일대"],
        "note": "비교리스트의 ‘개봉7’은 이 구역이다(2025년 2월 신통기획 후보지 선정, 76,163.5㎡).",
        "sources": ["cleanup-intgr"],
    },
    {
        "id": "11000UQ120PS202601310019",
        "name": "상도16구역",
        "alias": ["상도동 214", "상도동 214번지 일대", "상도16"],
        "note": "비교리스트의 ‘상도동 214(상도16)’는 이 구역이다(2025년 8월 신통기획 후보지 선정, 85,787.7㎡).",
        "sources": ["cleanup-intgr"],
    },
    {
        "id": "11000UQ120PS202505310058",
        "name": "상계5동 일대",
        "alias": ["상계동 154-3", "상계동 154-3번지 일대", "상계5동 154-3"],
        "note": "비교리스트의 ‘상계동 154-3’은 이 구역이다(서울시 고시 제2025-218호, 2025-04-17 정비구역 지정, 216,364.5㎡·4,591세대). 이름이 ‘상계5동 일대’로만 실려 있어 누락으로 잘못 잡혔다.",
        "sources": ["seoul-gosi-search"],
    },
    {
        "id": "11000UQ120PS202503070047",
        "name": "상도동 279",
        "alias": ["상도22", "상도22구역", "상도동 279번지 일대"],
        "note": "비교리스트의 ‘상도22’는 이 구역이다. 2024-02-16 모아타운 후보지 선정(공공참여형), 관리계획(안) 주민공람 2026-11-05(1,250세대). 서울플랜+ 단계는 후보지 선정 시점 값이다.",
        "sources": ["dj-gonggo-2026-139"],
    },
]

# ── 실제로 빠진 구역 ────────────────────────────────────────────────────
A = []


def add(**kw):
    A.append(kw)


# 신속통합기획 후보지 ─────────────────────────────────────────────────────
SIN = dict(type="신통기획", kind="신속통합기획", stage="후보지선정")
add(id="haengchon-210-2", name="행촌동 210-2 일대", alias=["행촌동 210-2"], gu="종로구",
    area=76310.0, selectedAt="2025-11-03", jibun="서울 종로구 행촌동 210-2",
    note="2025-11-03 ’25년 제5차 신통기획 후보지 선정. 구역계 미고시(정비구역 지정 전).",
    sources=["seoul-2025-11-04", "cleanup-intgr"], **SIN)
add(id="yongsan2ga-1-597", name="용산동2가 1-597 일대", alias=["남산1", "남산1구역"], gu="용산구",
    area=53734.6, selectedAt="2025-11-03", jibun="서울 용산구 용산동2가 1-597",
    note="통칭 남산1구역. 2025-11-03 ’25년 제5차 신통기획 후보지 선정(주민 동의율 70% 이상). 구역계 미고시.",
    sources=["seoul-2025-11-04", "cleanup-intgr"], **SIN)
add(id="okcheon-123-2", name="옥천동 123-2 일대", alias=["옥천동 123-2"], gu="서대문구",
    area=9863.5, jibun="서울 서대문구 옥천동 123-2",
    note="비교리스트는 용산구로 적었으나 공식 위치는 서대문구 옥천동 123-2다. 2026년 수시선정(제7차 도계위 토허구역 지정 18곳에 포함). 구역계 미고시.",
    sources=["cleanup-intgr", "seoul-2026-05-07"], **SIN)
add(id="yongsan-3", name="용산동2가 44-3 일대", alias=["용산3", "용산3구역"], gu="용산구",
    area=73070.5, selectedAt="2026-05-06", jibun="서울 용산구 용산동2가 44-3",
    note="통칭 용산3구역. 2026-05-06 후보지 선정(서울시 고시 제2026-266호 건축허가 제한 지형도면). 구역계 미고시.",
    sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="wonhyo4ga-110-1", name="원효로4가 110-1 일대", alias=["원효로4가 110-1"], gu="용산구",
    area=14526.0, selectedAt="2026-05-06", jibun="서울 용산구 원효로4가 110-1",
    note="2026-05-06 후보지 선정. 구역계 미고시.", sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="itaewon-214-37", name="이태원동 214-37 일대", alias=["이태원동 214-37"], gu="용산구",
    area=66986.2, selectedAt="2025-11-03", jibun="서울 용산구 이태원동 214-37",
    note="2025-11-03 ’25년 제5차 신통기획 후보지 선정. 구역계 미고시.", sources=["seoul-2025-11-04", "cleanup-intgr"], **SIN)
add(id="yongdap-2", name="용답동 15 일대", alias=["용답2", "용답2구역"], gu="성동구",
    area=95889.5, selectedAt="2026-05-06", jibun="서울 성동구 용답동 15",
    note="통칭 용답2구역. 2026-05-06 후보지 선정. 구역계 미고시.", sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="haengdang-300-1", name="행당동 300-1 일대", alias=["행당동 300-1"], gu="성동구",
    area=66276.1, jibun="서울 성동구 행당동 300-1",
    note="2025년 12월 수시선정(정보몽땅 ’25.12월 선정구역). 구역계 미고시.", sources=["cleanup-intgr"], **SIN)
add(id="jeongneung-16-179", name="정릉동 16-179 일대", alias=["정릉동 16-179"], gu="성북구",
    area=42810.6, jibun="서울 성북구 정릉동 16-179",
    note="2025년 12월 수시선정. 구역계 미고시.", sources=["cleanup-intgr"], **SIN)
add(id="suyu-442-10", name="수유동 442-10 일대", alias=["수유동 442-10"], gu="강북구",
    area=41731.0, selectedAt="2026-05-06", jibun="서울 강북구 수유동 442-10",
    note="2026-05-06 후보지 선정. 구역계 미고시.", sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="suyu-486", name="수유동 486 일대", alias=["수유동 486"], gu="강북구",
    area=72364.0, selectedAt="2026-05-06", jibun="서울 강북구 수유동 486",
    note="2026-05-06 후보지 선정. 구역계 미고시. (구역 안에 수유동 486-677·486-761 가로주택정비사업이 따로 있다.)",
    sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="chang-608", name="창동 608 일대", alias=["창동 608"], gu="도봉구",
    area=66395.8, jibun="서울 도봉구 창동 608",
    note="2026년 수시선정(정보몽땅 2026년 선정구역). 구역계 미고시.", sources=["cleanup-intgr"], **SIN)
add(id="galhyeon-3", name="갈현동 510-1 일대", alias=["갈현3", "갈현3구역"], gu="은평구",
    area=129814.1, selectedAt="2026-07-29", jibun="서울 은평구 갈현동 510-1",
    note="통칭 갈현3구역. 2026-07-29 ’26년 제3차 신통기획 후보지 선정. 구역계 미고시.",
    sources=["seoul-2026-07-30", "cleanup-intgr"], **SIN)
add(id="nokbeon-35-78", name="녹번동 35-78 일대", alias=["녹번동 35-78"], gu="은평구",
    area=20320.5, selectedAt="2025-11-03", jibun="서울 은평구 녹번동 35-78",
    note="2025-11-03 ’25년 제5차 신통기획 후보지 선정(주민 동의율 70% 이상). 구역계 미고시.",
    sources=["seoul-2025-11-04", "cleanup-intgr"], **SIN)
add(id="sinsa-300", name="신사동 300 일대", alias=["신사동 300"], gu="은평구",
    area=30222.2, jibun="서울 은평구 신사동 300",
    note="2025년 12월 수시선정. 구역계 미고시. (구역 안 신사동 300-47은 준공된 자율주택정비사업으로 별개다.)",
    sources=["cleanup-intgr"], **SIN)
add(id="yeonhui-170-14", name="연희동 170-14 일대", alias=["연희동 170-14"], gu="서대문구",
    area=35623.6, selectedAt="2026-05-06", jibun="서울 서대문구 연희동 170-14",
    note="2026-05-06 후보지 선정. 구역계 미고시.", sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="hapjeong-444-12", name="합정동 444-12 일대", alias=["합정동 444-12"], gu="마포구",
    area=40735.5, selectedAt="2025-11-03", jibun="서울 마포구 합정동 444-12",
    note="2025-11-03 ’25년 제5차 신통기획 후보지 선정. 구역계 미고시.", sources=["seoul-2025-11-04", "cleanup-intgr"], **SIN)
add(id="gaebong-66-15", name="개봉동 66-15 일대", alias=["개봉동 66-15"], gu="구로구",
    area=109371.0, jibun="서울 구로구 개봉동 66-15",
    note="2026년 수시선정. 구역계 미고시.", sources=["cleanup-intgr"], **SIN)
add(id="guro-739-7", name="구로동 739-7 일대", alias=["구로동 739-7"], gu="구로구",
    area=92521.4, selectedAt="2025-11-03", jibun="서울 구로구 구로동 739-7",
    note="2025-11-03 ’25년 제5차 신통기획 후보지 선정. 구역계 미고시.", sources=["seoul-2025-11-04", "cleanup-intgr"], **SIN)
add(id="guro-792-3", name="구로동 792-3 일대", alias=["구로동 792-3"], gu="구로구",
    area=58472.7, jibun="서울 구로구 구로동 792-3",
    note="2026년 수시선정. 구역계 미고시.", sources=["cleanup-intgr"], **SIN)
add(id="onsu-62", name="온수동 62 일대", alias=["온수동 62"], gu="구로구",
    area=10927.0, selectedAt="2026-05-06", jibun="서울 구로구 온수동 62",
    note="2026-05-06 후보지 선정. 구역계 미고시.", sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="daerim-680", name="대림동 680 일대", alias=["대림동 680"], gu="영등포구",
    area=76753.0, selectedAt="2026-11-12", jibun="서울 영등포구 대림동 680",
    note="2026-11-12 ’26년 제4차 신통기획 후보지 선정(10-30·11-12 두 차례 선정위). 권리산정기준일 2026-08-24. 구역계 미고시.",
    sources=["ydp-2026-05-26", "cleanup-intgr"], **SIN)
add(id="singil-90-31", name="신길동 90-31 일대", alias=["신길동 90-31"], gu="영등포구",
    area=58162.0, jibun="서울 영등포구 신길동 90-31",
    note="2025년 12월 수시선정. 구역계 미고시.", sources=["cleanup-intgr"], **SIN)
add(id="noryangjin-14", name="노량진동 205-269 일대", alias=["노량진14", "노량진14구역"], gu="동작구",
    area=59308.3, selectedAt="2026-05-06", jibun="서울 동작구 노량진동 205-269",
    note="통칭 노량진14구역. 2026-05-06 후보지 조건부 선정(진입도로 확보 조건). 구역계 미고시.",
    sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="sadang-19", name="사당동 77-24 일대", alias=["사당19", "사당19구역"], gu="동작구",
    area=25194.8, selectedAt="2026-05-06", jibun="서울 동작구 사당동 77-24",
    note="통칭 사당19구역. 2026-05-06 후보지 선정(사당21구역과 같은 회차). 구역계 미고시.",
    sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)
add(id="cheonho-6", name="천호동 392-9 일대", alias=["천호6", "천호6구역"], gu="강동구",
    area=40592.7, selectedAt="2026-05-06", jibun="서울 강동구 천호동 392-9",
    note="통칭 천호6구역. 2026-05-06 후보지 선정. 구역계 미고시.", sources=["seoul-2026-05-07", "cleanup-intgr"], **SIN)

# 모아타운 ────────────────────────────────────────────────────────────────
def moa(**kw):
    base = dict(type="모아타운", kind="모아타운", stage="대상지선정")
    base.update(kw)
    add(**base)

moa(id="sinchang-76-1-moa", name="신창동 76-1 일대 모아타운", alias=["신창동 76", "신창동 76번지"], gu="용산구",
    area=13844.9, jibun="서울 용산구 신창동 76-1",
    note="2026-06-25 서울시 토지거래허가구역 지정 공고(모아타운 후보지). 구역 안 신창동 76-1 가로주택정비사업(6,071㎡)과는 별개 구역이다. 관리지역 경계 미고시.",
    areaNote="서울시 공고 기준 13,844.9㎡", sources=["seoul-gosi-search", "moa-archive"])
moa(id="gui3-224-54", name="구의3동 224-54 일대 모아타운", alias=["구의3동 224-54"], gu="광진구",
    area=22240.0, jibun="서울 광진구 구의3동 224-54",
    note="주민제안 모아타운. 권리산정기준일 2025-09-23. 2026-05-19 토지거래허가구역(도로 한정) 지정. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-2026-05-07", "moa-archive"])
moa(id="gui3-587-58", name="구의3동 587-58 일대 모아타운", alias=["구의3동 587-58"], gu="광진구",
    area=20358.1, selectedAt="2025-07-02", jibun="서울 광진구 구의3동 587-58",
    note="서울시 고시 제2025-384호(2025-07-17) 권리산정기준일 2025-02-28. 2026-10-29 관리계획 승인·고시(591세대).",
    stage="관리계획고시", sources=["seoul-gosi-search", "moa-archive"])
moa(id="jayang1-655", name="자양1동 655 일대 모아타운", alias=["자양1동 655"], gu="광진구",
    area=73019.7, selectedAt="2026-08-20", jibun="서울 광진구 자양1동 655",
    note="2026-08-20 대상지 선정, 서울시 공고 제2026-2452호(2026-08-27) 토지거래허가구역. 권리산정기준일 2026-05-18.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="jayang2-593", name="자양2동 593 일대 모아타운", alias=["자양2동 593"], gu="광진구",
    area=74127.2, jibun="서울 광진구 자양2동 593",
    note="주민제안 모아타운. 권리산정기준일 2025-07-22. 2026-05-19 토지거래허가구역(도로 한정). 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-2026-05-07", "moa-archive"])
moa(id="jayang-663", name="자양동 663 일대 모아타운", alias=["자양동 663"], gu="광진구",
    area=38525.4, jibun="서울 광진구 자양동 663",
    note="주민제안 모아타운. 권리산정기준일 2026-01-07. 2026-05-19 토지거래허가구역(도로 한정). 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-2026-05-07", "moa-archive"])
moa(id="myeonmok-127-26", name="면목동 127-26 일대 모아타운", alias=["면목동 127-26"], gu="중랑구",
    area=21829.1, jibun="서울 중랑구 면목동 127-26",
    note="주민제안 모아타운. 서울시 공고 제2026-456호(2026-02-12) 토지거래허가구역. 관리계획(안) 통합심의 수정가결(2026-10-08, 626세대).",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="myeonmok-377-4", name="면목동 377-4 일대 모아타운", alias=["면목동 337-4", "면목동 377-4"], gu="중랑구",
    area=22041.87, jibun="서울 중랑구 면목동 377-4",
    note="비교리스트의 ‘면목동 337-4’는 공식 지번 377-4의 표기 오류다. 서울시 공고 제2026-456호 토지거래허가구역. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="samseon3ga-42-7", name="삼선동3가 42-7 일대 모아타운", alias=["삼선동 42-7", "삼선동3가 42-7"], gu="성북구",
    area=16815.15, selectedAt="2025-12-03", jibun="서울 성북구 삼선동3가 42-7",
    note="주민제안 모아타운. 서울시 고시 제2025-693호 권리산정기준일 2025-11-17. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="jangwi-219-15", name="장위동 219-15 일대 모아타운", alias=["장위동 219-15"], gu="성북구",
    area=26222.3, selectedAt="2025-11-20", jibun="서울 성북구 장위동 219-15",
    note="주민제안 모아타운. 구역계 변경으로 23,025.1㎡ → 26,222.3㎡(서울시 고시 제2026-373호). 관리계획(안) 공람 2026-11-12.",
    areaNote="변경 후 26,222.3㎡ (기존 23,025.1㎡)", stage="관리계획수립", sources=["seoul-gosi-search", "sb-gonggo-2026-1819"])
moa(id="jangwi-65-107", name="장위동 65-107 일대 모아타운", alias=["장위동 65-107"], gu="성북구",
    area=18914.95, jibun="서울 성북구 장위동 65-107",
    note="주민제안 모아타운. 2026-05-19 토지거래허가구역(도로 한정) 지정. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-2026-05-07", "moa-archive"])
moa(id="jeongneung-266-108", name="정릉동 266-108 일대 모아타운", alias=["정릉동 266-108"], gu="성북구",
    area=78919.7, selectedAt="2026-08-20", jibun="서울 성북구 정릉동 266-108",
    note="2026-08-20 대상지 선정, 서울시 공고 제2026-2452호(2026-08-27) 토지거래허가구역. 권리산정기준일 2026-07-30.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="hawolgok-40-107", name="하월곡동 40-107 일대 모아타운", alias=["하월곡동 40-107"], gu="성북구",
    area=17452.0, jibun="서울 성북구 하월곡동 40-107",
    note="주민제안 모아타운. 서울시 공고 제2026-456호(2026-02-12) 토지거래허가구역. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="mia-791-1134", name="미아동 791-1134 일대 모아타운", alias=["미아동 791-1134"], gu="강북구",
    area=14175.0, selectedAt="2025-04-17", jibun="서울 강북구 미아동 791-1134",
    note="주민제안 모아타운. 서울시 고시 제2025-235호 권리산정기준일 2025-02-27. 관리계획(안) 통합심의 수정가결(2026-10-22).",
    areaNote="고시 14,175㎡ / 이후 구역 16,243㎡로 확대", stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="hagye-65-1", name="하계동 65-1 일대 모아타운", alias=["하계동 65-1"], gu="노원구",
    area=19090.1, selectedAt="2026-09-09", jibun="서울 노원구 하계동 65-1",
    note="2026-09-09 전문가 자문회의 선정, 서울시 고시 제2026-2609호 토지거래허가구역(2026-09-11). 권리산정기준일 2026-08-06.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="dongjak-102-8", name="동작동 102-8 일대 모아타운", alias=["동작동 102-8", "사당20", "사당20구역"], gu="동작구",
    area=21211.0, selectedAt="2025-06-19", jibun="서울 동작구 동작동 102-8",
    note="통칭 사당20구역. 주민제안 모아타운. 권리산정기준일 2025-03-20. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="sillim-661-2", name="신림동 661-2 일대 모아타운", alias=["신림동 661-2"], gu="관악구",
    area=19043.1, selectedAt="2026-06-22", jibun="서울 관악구 신림동 661-2",
    note="주민제안 모아타운. 서울시 고시 제2026-390호 권리산정기준일 2025-11-28. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="bangbae-858-1", name="방배동 858-1 일대 모아타운", alias=["방배동 858-1"], gu="서초구",
    area=25522.4, selectedAt="2026-06-22", jibun="서울 서초구 방배동 858-1",
    note="주민제안 모아타운. 서울시 고시 제2026-481호 권리산정기준일 2025-12-05. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="bangbae-920-1", name="방배동 920-1 일대 모아타운", alias=["방배동 920-1"], gu="서초구",
    area=19070.3, selectedAt="2026-09-09", jibun="서울 서초구 방배동 920-1",
    note="2026-09-09 전문가 자문회의 선정, 서울시 고시 제2026-2609호 토지거래허가구역(2026-09-11). 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="seocho-1506-6", name="서초동 1506-6 일대 모아타운", alias=["서초동 1506-6"], gu="서초구",
    area=46697.4, selectedAt="2025-12-23", jibun="서울 서초구 서초동 1506-6",
    note="주민제안 모아타운. 서울시 고시 제2025-389호 권리산정기준일 2025-06-18. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="yangjae-77", name="양재동 77 일대 모아타운", alias=["양재동 77"], gu="서초구",
    area=38793.6, jibun="서울 서초구 양재동 77",
    note="주민제안 모아타운. 서울시 고시 제2025-665호 권리산정기준일 2025-11-18. 2026-06-30 토지거래허가구역(도로 한정). 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="ilwon-720", name="일원동 720 일대 모아타운", alias=["일원동 720"], gu="강남구",
    area=25868.4, selectedAt="2026-04-16", jibun="서울 강남구 일원동 720",
    note="주민제안 모아타운. 서울시 고시 제2026-307호(구역계 확대 포함) 권리산정기준일 2024-06-05. 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])
moa(id="bangi-162", name="방이동 162 일대 모아타운", alias=["방이동 162"], gu="송파구",
    area=24592.0, selectedAt="2026-06-22", jibun="서울 송파구 방이동 162",
    note="주민제안 모아타운. 권리산정기준일 2026-03-31(서울시 고시 제2026-593호). 관리계획 수립 중.",
    stage="관리계획수립", sources=["seoul-gosi-search", "moa-archive"])

# 도심 공공주택 복합사업(도공복) ────────────────────────────────────────────
DG = dict(type="도공복", kind="도심공공주택복합", stage="후보지선정")
for _z in [
    ("hyochang-north", "효창공원앞역 북측구역", "용산구", "효창동 10-1", 93262, "4,040세대·역세권형(주거상업고밀지구)"),
    ("yeomchang-south", "염창역 남측구역", "양천구", "목동 529-12", 117900, "4,222세대·역세권형(주거상업고밀지구)"),
    ("achasan-east", "아차산역 동측구역", "광진구", "구의동 27-1", 44620, "1,663세대·역세권형(주거상업고밀지구)"),
    ("isu-east", "이수역 동측구역", "서초구", "방배동 822", 22997, "918세대·역세권형(주거상업고밀지구)"),
    ("oryu-south", "오류동역 남측구역", "구로구", "개봉동 309", 28402, "858세대·역세권형(주거상업고밀지구)"),
    ("sungshin-north", "성신여대입구역 북측구역", "성북구", "동소문동6가 62", 24795, "755세대·역세권형(주거상업고밀지구)"),
    ("hwagog-east", "화곡역 동측구역", "강서구", "화곡동 105-194", 86111, "2,335세대·저층주거지형(주택공급활성화지구)"),
    ("baengnyeon-west", "백련산 서측구역", "은평구", "응암동 197-33", 31229, "961세대·저층주거지형(주택공급활성화지구)"),
    ("mangwon-park", "망원체육공원 인근구역", "마포구", "망원동 406-1", 31090, "940세대·저층주거지형(주택공급활성화지구)"),
    ("olympic-park", "올림픽공원 인근구역", "송파구", "방이동 173-10", 31186, "935세대·저층주거지형(주택공급활성화지구)"),
    ("seongdongcho", "성동초 인근구역", "광진구", "자양동 683-28", 10293, "254세대·저층주거지형(주택공급활성화지구)"),
]:
    _id, _name, _gu, _jb, _area, _supply = _z
    add(id=_id, name=_name, alias=[_name.replace("구역", ""), _jb], gu=_gu, area=_area,
        selectedAt="2026-10-01", jibun=f"서울 {_gu} {_jb}",
        note=f"국토교통부 공고 제2026-1248호(2026-10-01) 후보지 선정. {_supply}. 예정지구 지정 전이라 구역계 미고시.",
        areaNote="국토교통부 후보지 선정 공고 기준(세부계획·인허가에서 변경 가능)",
        sources=["molit-2026-09-30", "molit-notice-2026-1248"], **DG)

# 역세권 장기전세주택(도시정비형 재개발) ─────────────────────────────────────
JS = dict(type="장기전세", kind="장기전세주택")
add(id="namyeong-yeoksegwon", name="남영역세권 장기전세주택", alias=["남영역세권", "청파동3가 118-133"], gu="용산구",
    area=28248.4, stage="행위제한", jibun="서울 용산구 청파동3가 118-133",
    note="역세권 장기전세주택 도시정비형 재개발. 용산구 고시 제2026-137호(2026-10-08) 개발행위허가 제한지역 지정(3년). 정비계획 수립 전이라 구역계 미고시.", sources=["ys-gosi-2026-137"], **JS)
add(id="seobinggo-yeoksegwon", name="서빙고역세권 장기전세주택", alias=["서빙고역세권", "서빙고동 271-18"], gu="용산구",
    area=6298.0, stage="행위제한", jibun="서울 용산구 서빙고동 271-18",
    note="역세권 장기전세주택 도시정비형 재개발. 용산구 고시 제2026-137호(2026-10-08) 개발행위허가 제한지역 지정. 정비계획 수립 전이라 구역계 미고시.", sources=["ys-gosi-2026-137"], **JS)
add(id="wonhyo1ga-yeoksegwon", name="원효로1가역세권 장기전세주택", alias=["원효로 1가 역세권", "원효로1가 82-1"], gu="용산구",
    area=97166.9, stage="정비구역지정", jibun="서울 용산구 원효로1가 82-1",
    note="2026-03-19 도시계획위원회 수권분과소위원회 ‘수정가결’ — 정비구역 97,166.9㎡ 신규 지정, 2,743세대(장기전세 553·재개발임대 210). 정비구역 고시 전이라 구역계 미고시.", sources=["seoul-2026-03-20"], **JS)
add(id="dohwa-242", name="마포역세권 장기전세주택(도화동 242)", alias=["도화동 242", "마포역세권"], gu="마포구",
    area=35880.0, stage="행위제한", jibun="서울 마포구 도화동 242",
    note="역세권 장기전세주택 도시정비형 재개발(마포역세권). 2026-11-12 마포구 개발행위허가 제한 주민 열람공고. 정비계획 수립 전이라 구역계 미고시.",
    areaNote="추진위 기준 35,880㎡(초기 사전검토안 40,273~42,121㎡)",
    sources=["seoul-gosi-search"], **JS)

# 공공재개발 ──────────────────────────────────────────────────────────────
PB = dict(type="일반재개발", kind="공공재개발")
add(id="suyu-540", name="수유동 540 일대 공공재개발", alias=["수유동 540", "인수마을"], gu="강북구",
    area=84031.0, stage="후보지선정", jibun="서울 강북구 수유동 540",
    note="공공재개발 후보지 수시 선정구역(정보몽땅). 2026-05-19 토지거래허가구역 지정 대상에 포함. 구역계 미고시.", sources=["cleanup-public-rdv", "seoul-2026-05-07"], **PB)
add(id="chang-470", name="창동 470 일대 공공재개발", alias=["창동 470"], gu="도봉구",
    area=135144.0, stage="후보지선정", jibun="서울 도봉구 창동 470",
    note="공공재개발 후보지 수시 선정구역(정보몽땅). 구역계 미고시.", sources=["cleanup-public-rdv"], **PB)
add(id="ahyeon-1", name="아현1구역", alias=["아현1", "아현동 699"], gu="마포구",
    area=105609.2, stage="선정구역", jibun="서울 마포구 아현동 699",
    note="공공재개발 2차 선정구역(아현동 699 일대). 구역계 미고시.", sources=["cleanup-public-rdv"], **PB)
add(id="siheung-4", name="시흥4동 4 일대 공공재개발", alias=["시흥4", "시흥4구역"], gu="금천구",
    area=67255.0, stage="선정구역", jibun="서울 금천구 시흥4동 4",
    note="공공재개발 2차 선정구역(시흥4동 4 일대). 인접한 시흥4동 1 일대(24,901.5㎡)는 별개의 신통기획 후보지다. 구역계 미고시.",
    sources=["cleanup-public-rdv"], **PB)

# 재건축 ─────────────────────────────────────────────────────────────────
add(id="namsan-daerim", name="남산대림아파트 재건축", alias=["남산대림", "이태원동 729"], gu="용산구",
    area=39944.1, stage="정비구역지정(공람)", jibun="서울 용산구 이태원동 729",
    type="일반재개발", kind="재건축(공동)",
    note="용산구 공고 제2026-1271호(2026-09-18) 정비계획 결정·정비구역 지정(안) 주민공람 — 39,944.1㎡, 630세대. 정비구역 지정 전이라 구역계 미고시.", sources=["ys-gonggo-2026-1271"], )

# 공공주택지구 ────────────────────────────────────────────────────────────
add(id="dongja-jjokbang", name="동자동 쪽방촌 공공주택지구", alias=["동자동 쪽방촌", "동자동 19-61"], gu="용산구",
    area=47573.9, stage="지구지정", jibun="서울 용산구 동자동 19-61",
    type="일반재개발", kind="공공주택지구",
    note="국토교통부 고시 제2026-571호(2026-10-21) 서울 동자동 공공주택지구 지정 — 47,573.9㎡, 2,150호(공공임대 1,000). LH 시행, 2029 착공·2032 준공 목표. 지구계획 수립 전이라 구역계 미고시.", sources=["molit-2026-571"], )

# 공식 경계 도형이 있는 구역(서울시 UQ181) ──────────────────────────────────
add(id="jangwi-11-yeoksegwon", name="돌곶이·상월곡역세권(장위11) 장기전세주택", alias=["장위11", "장위11구역", "장위동 66-300"], gu="성북구",
    area=94411.1, stage="정비구역지정", jibun="서울 성북구 장위동 66-300",
    type="장기전세", kind="장기전세주택",
    note="서울시 고시 제2026-267호(2026-05-14) 정비계획 결정·정비구역 지정 — 94,411.1㎡, 2,617세대(장기전세 565). 2017년 해제된 옛 장위11구역 일부를 포함한다. 경계는 서울시 의제처리구역(UQ181) 실경계.",
    areaNote="서울시 고시 제2026-267호 94,411.1㎡ / UQ181 도형 94,410.8㎡", geomFrom="11290UQ181PS202609090001",
    sources=["seoul-oa-20957", "seoul-gosi-search"], )


def main():
    # 중심 좌표 파일(지오코딩 결과)이 있으면 채운다
    geo_path = os.path.join(HERE, "data", "official-80-centers.json")
    centers = {}
    if os.path.exists(geo_path):
        with open(geo_path, encoding="utf-8") as fp:
            centers = json.load(fp)

    # 폴리곤 파일(있으면) — [lat,lng] 링 목록
    poly_path = os.path.join(HERE, "data", "official-80-polygons.json")
    polys = {}
    if os.path.exists(poly_path):
        with open(poly_path, encoding="utf-8") as fp:
            polys = json.load(fp)

    out_adds = []
    for a in A:
        rec = dict(a)
        rec.setdefault("geom", "미고시")
        src = centers.get(a["id"])
        if src:
            rec["center"] = [round(src["lat"], 6), round(src["lng"], 6)]
            rec["centerLabel"] = src.get("label", "공식 대표 지번")
        if a.get("geomFrom") and polys.get(a["geomFrom"]):
            rec["polygon"] = polys[a["geomFrom"]]
            rec["geom"] = "UQ181"
        rec.pop("geomFrom", None)
        rec.pop("jibun", None)
        out_adds.append(rec)

    doc = {
        "asOf": "2026-11-17",
        "description": "리디브 누락 비교리스트 ① 선정·고시 80곳 재검증 — 공식 자료로 확인한 신규 구역과 기존 구역 별칭",
        "sources": S,
        "aliases": ALIASES,
        "additions": out_adds,
    }
    out = os.path.join(HERE, "data", "official-80.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fp:
        json.dump(doc, fp, ensure_ascii=False, indent=1)

    c = Counter()
    for a in out_adds:
        c[a["geom"]] += 1
    print(f"추가 {len(out_adds)}곳 (폴리곤 {c['UQ181']} · 점 {c['미고시']}) · 별칭 보강 {len(ALIASES)}곳")
    missing = [a["id"] for a in out_adds if "center" not in a]
    if missing:
        print("중심좌표 미확보:", len(missing), missing)


if __name__ == "__main__":
    main()
