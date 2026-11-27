#!/usr/bin/env python3
"""리디브 — 대기 6건 반영 (2026-11-27)

1) (가)염리동 27-46 모아타운 — 점(geom "미고시") → 연속지적도 필지 합집합 「참고경계」
2) 도화동 196-11 신통기획 — 점 → 마포구 공개 구역계 도면(붙임1)을 필지선에 맞춘 「필지정합」
3) 화곡역 동측 도심공공주택복합 — 점 → 국토부 공고 제2026-1248호 위치도 ① 「필지정합」
4) 화곡동 1033(화곡역세권 장기전세) — 점 → 강서구 고시 제2026-46호·의회 의견청취안 결정도 「고시도면」
5) 고척동 241번지 일대 모아타운 — 2026-11-27 모아주택 4~6구역 사업시행계획(안) 통합심의 조건부 의결 반영
6) 상도15구역 — 2026-11-26 동작구 사업시행계획인가 공람공고 반영

실행: python3 scripts/apply-6zones-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "mapozones-20261127.json"
AS_OF = "2026-11-27"

B = json.loads(DATA.read_text(encoding="utf-8"))

VWORLD = {
    "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계(리디브 /api/parcel 점 조회)",
    "url": "https://www.vworld.kr",
}


# ── 1) (가)염리동 27-46 모아타운 ───────────────────────────────────────────────
YEOMNI = dict(
    geom="참고경계",
    boundaryApprox=True,
    areaShape=B["yeomni"]["areaShape"],
    center=B["yeomni"]["center"],
    centerLabel="공식 대표 지번 염리동 27-46 — 공덕역(5·6호선·공항철도) 북서 약 550m",
    boundaryNote=(
        "공식 구역계가 아직 공고되지 않아, 대표 지번 염리동 27-46이 속한 필지 묶음을 브이월드 연속지적도"
        "(LP_PA_CBND_BUBUN)로 모아 만든 참고 경계입니다. 염리동 27-·45-·48-·52-번지대 필지 55개를 "
        "합집합하고 도로 경계선까지 2.5m 넓혀 그렸습니다. 공개 자료의 구역면적 12,732㎡에 맞춰 필지를 "
        "고른 것이 아니라, 대표 지번이 속한 블록을 그대로 이어 붙인 것이라 실제 모아타운 구역계와는 "
        "다를 수 있습니다(도형 11,667.0㎡ = 공개 면적의 91.7%). 마포구가 모아타운 동의서 번호를 부여하며 "
        "구역계를 공개하거나 후보지로 선정되면 그 도면으로 다시 맞춥니다."
    ),
    areaNote=(
        "공개 자료 기준 12,732㎡(토지등소유자 약 224명, 노후도 약 64%). 지도 도형은 11,667.0㎡로 "
        "공개 면적의 91.7%입니다 — 공식 구역계가 아니라 필지 합집합 참고 경계라 차이가 납니다."
    ),
    note_add=(
        " 지도에는 그동안 대표 지번 점만 찍혀 있었는데, 이번에 대표 지번이 속한 필지 묶음(염리동 27-·45-·"
        "48-·52-번지대)을 연속지적도로 이어 붙인 참고 경계를 넣었습니다. 공식 구역계가 아니므로 점선으로 "
        "표시하고, 모아타운 관리계획(안) 공람이나 후보지 선정으로 도면이 나오면 그 선으로 바꿉니다."
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
        VWORLD,
    ],
)

# ── 2) 도화동 196-11 신통기획 ──────────────────────────────────────────────────
DOHWA = dict(
    geom="필지정합",
    boundaryApprox=True,
    area=28929,
    areaShape=B["dohwa"]["areaShape"],
    center=B["dohwa"]["center"],
    centerLabel="공덕역(5·6호선·공항철도) 10번 출구 맞은편 — 도화동 196-11번지 일대",
    boundaryNote=(
        "2025-09-26 마포구가 공개한 「주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개」 붙임1 "
        "구역계 도면의 붉은 구역선을 브이월드 연속지적도 필지선에 맞춰 옮긴 경계입니다. 도면에 축척·방위 "
        "표기가 없어, 도면의 지적선 전체를 필지선 위에 겹쳐 축척(8.2px/m)·회전(4°)·위치를 잡았고 정합 "
        "오차는 평균 1.3m(중앙값 1.0m)입니다. 대표 지번 도화동 196-11 필지가 경계 안 중앙부에 오는 것을 "
        "확인했습니다. 도형 면적 27,704.2㎡는 공개 자료 28,929㎡(도면 기준 29,061㎡)의 95.8~95.9%입니다. "
        "신청인이 제출한 구역계라 후보지 추천·정비구역 지정에서 일부 변경될 수 있습니다."
    ),
    areaNote=(
        "공개 자료 28,929~29,061㎡(자료별 차이), 토지등소유자 336~451명. 지도 도형은 27,704.2㎡로 "
        "공개 면적의 약 95.8%입니다 — 도면 선을 필지선에 맞춰 옮기는 과정에서 생긴 차이입니다."
    ),
    note_add=(
        " 지도에는 그동안 점만 찍혀 있었는데, 이번에 마포구가 공개한 동의서 번호부여 구역계 도면(붙임1)을 "
        "필지선에 맞춰 옮겨 실제 구역 형태로 그렸습니다. 도면은 신청인이 제출한 구역계여서 후보지 추천·"
        "정비구역 지정 과정에서 일부 조정될 수 있습니다."
    ),
    sources=[
        {
            "label": "서울특별시 마포구 — 「신속통합기획 주택재개발사업 후보지 신청 동의서 번호 부여 처리 공개(도화동 196-11번지 일대, 제10호)」(2025-09-26)",
            "url": "https://www.mapo.go.kr/site/main/board/notice/271395",
        },
        {
            "label": "마포구 — (붙임1) 주택재개발 추진을 위한 동의서 번호부여 요청 구역 공개(구역계 도면)",
            "url": "https://www.mapo.go.kr/site/main/file/download/uu/edb28fa0455449539fea767d2cf77b31",
        },
        VWORLD,
    ],
)

# ── 3) 화곡역 동측구역 도심공공주택복합 ─────────────────────────────────────────
HWAGOK_EAST = dict(
    geom="필지정합",
    boundaryApprox=True,
    area=86111,
    areaShape=B["hge"]["areaShape"],
    center=B["hge"]["center"],
    centerLabel="화곡역(5호선) 동측 — 화곡동 105-194번지 일원",
    householdsPlan=2335,
    boundaryNote=(
        "국토교통부 공고 제2026-1248호(2026-10-01) 【위치도 ① 화곡역 동측】의 붉은 구역선을 브이월드 "
        "연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 옮긴 검토 경계입니다. 위치도 선에 공고 면적 86,111㎡를 "
        "맞춰 축척(3.58px/m)을 잡고 필지선 정합으로 위치를 잡았습니다(정합 오차 평균 2.1m·중앙값 1.0m). "
        "위치도 위 화곡역·화곡본동성당·신월초·화일초 자리와 지도 경계가 어긋나지 않는 것을 확인했습니다. "
        "후보지 선정 단계라 예정지구 지정·구역계 고시 전이며, 그때 실제 포함 필지가 확정됩니다."
    ),
    areaNote=(
        "국토교통부 공고 제2026-1248호 기준 86,111㎡·계획 2,335호(세부계획·인허가에서 변경될 수 있음). "
        "지도 도형은 85,052.7㎡로 공고 면적의 98.8%입니다."
    ),
    note=(
        "강서구 화곡동 105-194번지 일원의 도심공공주택복합사업 후보지입니다. 국토교통부가 2026-10-01 공고 "
        "제2026-1248호로 선정한 서울 11곳 가운데 하나로, 유형은 주택공급활성화지구(저층주거지형), 면적 "
        "86,111㎡, 계획 2,335호이고 공공주택 사업자는 한국토지주택공사 또는 서울주택도시개발공사입니다. "
        "자리는 5호선 화곡역 동측, 화곡로 이북의 저층 주거지로 동쪽으로 화일초, 남쪽으로 화곡본동성당과 "
        "맞닿습니다. 2026-09-30 국토교통부 보도자료로 3년여 만의 신규 후보지로 발표됐고, 2026-10월 주민 "
        "설명회를 거쳐 2027년 상반기 예정지구 지정, 2030년 하반기 착공이 목표입니다. 지도 경계는 공고 "
        "위치도의 구역선을 브이월드 연속지적도 필지선에 맞춰 옮긴 검토 경계입니다."
    ),
    sources=[
        {
            "label": "국토교통부 공고 제2026-1248호 — 도심 공공주택 복합지구 후보지 선정 공고(2026-10-01)",
            "url": "https://www.molit.go.kr/USR/BORD0201/m_69/DTL.jsp?id=N01_B&mode=view&idx=269997",
        },
        {
            "label": "국토교통부 보도자료 — '도심 공공주택 복합사업' 서울 11곳(1.8만호) 신규 후보지 선정(2026-09-30)",
            "url": "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95092473",
        },
        VWORLD,
    ],
)

# ── 4) 화곡동 1033 (화곡역세권 장기전세 도시정비형 재개발) ─────────────────────
HWAGOK1033 = dict(
    geom="고시도면",
    boundaryApprox=True,
    area=93458.1,
    areaShape=B["hg1033"]["areaShape"],
    center=B["hg1033"]["center"],
    centerLabel="화곡역(5호선) 동측 — 화곡동 1033번지 일대",
    householdsPlan=2146,
    boundaryNote=(
        "강서구의회 의견청취안(의안 2026-4, 2026-02-02)에 붙은 「정비계획결정(안)도」(1:2,000)의 붉은 "
        "점선 정비구역계를 옮긴 경계입니다. 도면의 축척자(0~100m)로 5.54px/m를 잡고, 도면의 지적선 "
        "전체를 브이월드 연속지적도 필지선에 겹쳐 위치를 맞췄습니다(정합 오차 평균 2.2m). 같은 도면의 "
        "구역선을 그대로 따라 그렸고, 2026-06-17 서울시 도시계획위원회 수정가결 뒤 정비구역 지정 절차가 "
        "이어지고 있어 실제 고시 구역계와 1~2m 차이가 날 수 있습니다. 획지 3곳(화곡동 1033·1037-27·"
        "1067-20번지 일원)이 모두 도형 안에 들어옵니다."
    ),
    areaNote=(
        "공식 면적 93,458.1㎡(강서구 고시 제2026-46호 제한면적·의회 의견청취안 구역면적). 지도 도형은 "
        "90,170.4㎡로 공식의 96.5%입니다 — 1:2,000 도면을 줄여 그린 선을 옮겨 그린 데서 오는 차이입니다. "
        "계획 2,146세대(장기전세 319·의무임대 227)."
    ),
    note=(
        "강서구 화곡동 1033번지 일대 93,458.1㎡의 역세권 장기전세주택 도시정비형 재개발사업입니다. 5호선 "
        "화곡역에 붙은 노후 저층주거지로, 2024-06-13 주민제안으로 정비계획 수립에 들어가 2026-04-01 강서구 "
        "고시 제2026-46호로 행위제한·지형도면이 고시됐고, 2026-04-15~05-18 공람을 거쳐 2026-06-17 서울시 "
        "도시계획위원회에서 정비구역 지정 및 정비계획(안)이 수정가결됐습니다. 2026-11-04 조합설립추진위원회 "
        "승인, 2026-11-11 정정 고시가 있었습니다. 계획은 아파트 25개 동, 지하 3층~지상 18층(54m), 총 "
        "2,146세대(장기전세 319·재개발 의무임대 227)이고, 동측 15m 진입도로 신설과 화곡로21길 확폭(6→15m), "
        "강서로33길 공원·공영주차장이 함께 들어갑니다. 지도 경계는 정비계획결정(안)도의 구역계를 옮긴 "
        "것입니다."
    ),
    sources=[
        {
            "label": "서울특별시 강서구 고시 제2026-46호(2026-04-01) 「화곡역세권 장기전세주택 재개발사업 행위제한 및 지형도면 고시」 — 93,458.1㎡",
            "url": "https://jaegebal.com/gnotices/gs-gs-2026-46",
        },
        {
            "label": "강서구의회 제317회 임시회 도시·교통위원회 「화곡역세권 장기전세주택 도시정비형 재개발사업 정비계획 결정 및 정비구역 지정을 위한 의견청취(안)」(2026-02-02) — 정비계획결정(안)도",
            "url": "https://gsc.gangseo.seoul.kr/meeting/comm/download.do?code=08SC0L&ext=00.PDF&mode=burok&path=08%2FSC%2F0L",
        },
        {
            "label": "서울시 — 제10차 도시계획위원회 개최결과(2026-06-18) 화곡역세권 정비구역 지정 및 정비계획 '수정가결'",
            "url": "https://www.seoul.go.kr/news/news_report.do?bbsNo=158&nttNo=459950",
        },
        VWORLD,
    ],
)

# ── 5) 고척동 241번지 일대 모아타운 ────────────────────────────────────────────
GOCHEOK = dict(
    stage="관리지역고시(2024-12-26)·모아주택 4~6구역 사업시행계획(안) 심의 통과(2026-11-27)",
    stageCode="PP0406",
    prog=25,
    householdsPlan=2574,
    note_add=(
        " 2026-11-27 서울시 제4차 소규모주택정비 통합심의 본위원회에서 이 모아타운 안 모아주택 4~6구역"
        "(3개 구역)의 사업시행계획안이 조건부 의결됐습니다. 최고 25층·10개 동·총 627세대(공공임대 71세대)로, "
        "제2종일반주거지역 층수 완화와 임대주택·정비기반시설 확보에 따른 용적률 완화, 사업성 보정계수 적용으로 "
        "기존 427세대보다 200세대 늘었습니다(4구역 227·5구역 192·6구역 208세대). 특별건축구역 지정으로 3개 "
        "구역의 지하주차장과 주민공동시설을 통합 배치해 하나의 단지처럼 조성하고, 구역 사이에 공공보행통로와 "
        "공원·경로당·어린이집·스터디카페를 넣습니다. 세입자 손실보상 방안도 반영됐고, 사업시행계획인가 등 후속 "
        "절차를 거쳐 2028년 착공이 목표입니다. 모아타운은 8개 구역 가운데 6개 구역이 조합설립인가·사업시행자 "
        "지정을 마쳤고, 전체 계획은 최고 29층·약 2,574세대입니다."
    ),
    sources=[
        {
            "label": "연합뉴스 — 서울 구로구 고척동 모아주택 3곳에 627세대 공급…2028년 착공(2026-11-27)",
            "url": "https://www.yna.co.kr/view/AKR20261127047800004",
        },
        {
            "label": "아이뉴스24 — 서울 구로구 고척동 모아주택 3곳 통합심의 통과…627호 공급(2026-11-27) — 구역별 4구역 227·5구역 192·6구역 208호",
            "url": "https://www.inews24.com/view/2031265",
        },
        {
            "label": "구로구청 — 「모아타운 사업 추진 지원」 추진실적(고척동 241번지 일대 98,735.6㎡, 2024-12-26 관리계획 승인·고시)",
            "url": "https://www.guro.go.kr/ceo/downloadBbsFile.do?atchmnflNo=344912&bbsNo=988&key=3581&nttNo=226008",
        },
    ],
)

# ── 6) 상도15구역 ─────────────────────────────────────────────────────────────
SANGDO15 = dict(
    stage="사업시행계획인가(공람)",
    stageCode="PP0208",
    prog=65,
    householdsPlan=3187,
    note_add=(
        " 2026-11-26 동작구 공고 제2026-1963호로 사업시행계획인가를 위한 공람이 시작됐습니다(2026-11-26~12-11, "
        "동작구청 도시정비과·사업시행자 사무실·정비사업위원회 사무실). 사업시행자는 대신자산신탁이고, 같은 날 "
        "동작구 고시 제2026-157호로 정비구역(계획) 경미한 변경이 함께 고시됐습니다. 공람 자료 기준 추정비례율 "
        "112.56%, 총수입 약 3조 9,227억원, 공급 3,187세대(조합원분 2,187·일반분양 521·임대 479), 전용 84㎡ "
        "일반분양가 3.3㎡당 5,100만원입니다. 2025-04-03 서울시 고시 제2025-178호로 정비구역 지정, 2026-05-21 "
        "서울시 통합심의 조건부 통과, 2026-07-16 시공사로 대우건설 선정을 거쳤고, 연내 사업시행인가를 목표로 "
        "합니다."
    ),
    sources=[
        {
            "label": "서울특별시 동작구 공고 제2026-1963호(2026-11-26) 「상도15구역 주택정비형 재개발사업 사업시행계획 인가를 위한 공람·공고」",
            "url": "https://jaegebal.com/gnotices/dj-gg-2026-1963",
        },
        {
            "label": "도시팩트 — 구역 지정 1년 7개월 만에 사업시행인가 문턱…상도15구역(2026-11-26) — 추정비례율 112.56%·3,187세대·대우건설",
            "url": "https://cityfact.co.kr/news/271",
        },
        {
            "label": "서울시 — 상도15구역 추진경과(2025-04-03 서울시 고시 제2025-178호 정비구역 지정, 2026-05-21 통합심의 조건부 통과)",
            "url": "https://jaegebal.com/develops/2042",
        },
    ],
)


EXTRA = [
    "alias", "selectedAt", "centerLabel", "locationMap", "note", "areaNote", "boundaryNote",
    "nameNote", "nameSources", "sources", "hiddenByDefault", "boundaryApprox", "badgeType",
    "asOf", "areaShape", "dividers", "households", "rightsDate", "drawing", "consentRate",
    "consentDate", "consentNote", "owners", "householdsNow", "householdsPlan", "deterioration",
]


def to_ring(ring):
    pts = [list(p) for p in ring]
    if pts[0] != pts[-1]:
        pts.append(list(pts[0]))
    return [[p[1], p[0]] for p in pts]


def build_feature(z):
    props = {
        "id": z["id"], "name": z["name"], "type": z["type"], "kind": z.get("kind"),
        "stage": z["stage"], "gu": z["gu"], "area": z.get("area"), "featured": bool(z.get("featured")),
        "sourceId": z.get("sid"), "geom": z.get("geom", "UQ120"),
    }
    for k in EXTRA:
        if z.get(k) is not None:
            props[k] = z[k]
    if not z.get("polygon"):
        props["center"] = z.get("center")
        return {"type": "Feature", "id": z["id"], "properties": props, "geometry": None}
    rings = [to_ring(z["polygon"])] + [to_ring(p) for p in (z.get("parts") or [])]
    holes = [to_ring(h) for h in (z.get("holes") or []) if isinstance(h, list) and len(h) >= 3]
    if not holes:
        geom = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]} if len(rings) > 1 \
            else {"type": "Polygon", "coordinates": [rings[0]]}
    elif len(rings) == 1:
        geom = {"type": "Polygon", "coordinates": [rings[0], *holes]}
    else:
        polys = [[r] for r in rings]
        for h in holes:
            x, y = h[0]
            target = 0
            for i, ring in enumerate(rings):
                inside = False
                for a in range(len(ring)):
                    b = (a - 1) % len(ring)
                    xi, yi = ring[a]
                    xj, yj = ring[b]
                    if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                        inside = not inside
                if inside:
                    target = i
                    break
            polys[target].append(h)
        geom = {"type": "MultiPolygon", "coordinates": polys}
    return {"type": "Feature", "id": z["id"], "properties": props, "geometry": geom}


def export_python():
    """노드가 없는 환경용 — 바뀐 6곳만 다시 만들어 geojson·zone-index 에 덮어쓴다."""
    zones = {z["id"]: z for z in json.loads(SOURCE.read_text(encoding="utf-8"))}
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    targets = ("mapo-yeomni-27-46", "mp-dohwa-196-11", "hwagog-east",
               "rest17gu-gs-화곡동-1033", "11530UQ120PS202605040001", "11000UQ120PS202601310054")
    feats = {f["properties"]["id"]: i for i, f in enumerate(geo["features"])}
    for zid in targets:
        f = build_feature(zones[zid])
        if zid in feats:
            geo["features"][feats[zid]] = f
        else:
            geo["features"].append(f)
            feats[zid] = len(geo["features"]) - 1
        e = next((x for x in idx["zones"] if x["id"] == zid), None)
        entry = {"id": zid, "name": zones[zid]["name"], "gu": zones[zid]["gu"], "type": zones[zid]["type"]}
        if zones[zid].get("alias"):
            entry["alias"] = zones[zid]["alias"]
        if e is not None:
            e.update(entry)
        else:
            idx["zones"].append(entry)
    geo["metadata"]["count"] = len(geo["features"])
    idx["count"] = len(idx["zones"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    INDEX.write_text(json.dumps(idx, ensure_ascii=False), encoding="utf-8")
    print("geojson·zone-index 갱신(파이썬):", len(geo["features"]), len(idx["zones"]))


def close_ring(ring):
    r = [list(p) for p in ring]
    if r[0] != r[-1]:
        r.append(list(r[0]))
    return r


def area_m2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    s = 0.0
    pts = [(p[1] * kx, p[0] * 111320.0) for p in ring]
    for i in range(len(pts) - 1):
        s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(s / 2)


def patch(zones):
    by_id = {z["id"]: z for z in zones}
    log = {}
    for zid, spec, key in (
        ("mapo-yeomni-27-46", YEOMNI, "yeomni"),
        ("mp-dohwa-196-11", DOHWA, "dohwa"),
        ("hwagog-east", HWAGOK_EAST, "hge"),
        ("rest17gu-gs-화곡동-1033", HWAGOK1033, "hg1033"),
    ):
        z = by_id[zid]
        ring = close_ring(B[key]["ring"])
        note_add = spec.pop("note_add", None)
        for k, v in spec.items():
            z[k] = v
        z["polygon"] = ring
        z["ringPts"] = len(ring)
        z["asOf"] = AS_OF
        z["center"] = [round(sum(p[0] for p in ring[:-1]) / (len(ring) - 1), 7),
                       round(sum(p[1] for p in ring[:-1]) / (len(ring) - 1), 7)]
        if note_add and note_add.strip()[:40] not in (z.get("note") or ""):
            z["note"] = (z.get("note") or "").rstrip() + note_add
        src = z.get("sources")
        if isinstance(src, str):
            try:
                src = json.loads(src)
            except Exception:
                src = []
        if not isinstance(src, list):
            src = []
        z["sources"] = src
        for s in spec.get("sources", []):
            if not any(x.get("url") == s["url"] for x in src):
                src.append(s)
        log[zid] = z["areaShape"]

    z = by_id["11530UQ120PS202605040001"]
    z["stage"] = GOCHEOK["stage"]
    z["stageCode"] = GOCHEOK["stageCode"]
    z["prog"] = GOCHEOK["prog"]
    z["householdsPlan"] = GOCHEOK["householdsPlan"]
    z["asOf"] = AS_OF
    if GOCHEOK["note_add"].strip()[:40] not in (z.get("note") or ""):
        z["note"] = (z.get("note") or "").rstrip() + GOCHEOK["note_add"]
    src = z.setdefault("sources", [])
    for s in GOCHEOK["sources"]:
        if not any(x.get("url") == s["url"] for x in src):
            src.append(s)
    log[z["id"]] = z["stage"]

    z = by_id["11000UQ120PS202601310054"]
    z["stage"] = SANGDO15["stage"]
    z["stageCode"] = SANGDO15["stageCode"]
    z["prog"] = SANGDO15["prog"]
    z["householdsPlan"] = SANGDO15["householdsPlan"]
    z["asOf"] = AS_OF
    if SANGDO15["note_add"].strip()[:40] not in (z.get("note") or ""):
        z["note"] = (z.get("note") or "").rstrip() + SANGDO15["note_add"]
    src = z.setdefault("sources", [])
    for s in SANGDO15["sources"]:
        if not any(x.get("url") == s["url"] for x in src):
            src.append(s)
    log[z["id"]] = z["stage"]
    return zones, log


def check():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in zones}
    ok = True
    for zid, key, area, tol in (
        ("mapo-yeomni-27-46", "yeomni", 12732, 0.10),
        ("mp-dohwa-196-11", "dohwa", 28929, 0.06),
        ("hwagog-east", "hge", 86111, 0.06),
        ("rest17gu-gs-화곡동-1033", "hg1033", 93458.1, 0.06),
    ):
        z = by_id[zid]
        ring = close_ring(B[key]["ring"])
        same = z.get("polygon") == ring
        a = area_m2(ring)
        inside = abs(a - area) / area < tol
        g = next((f for f in geo["features"] if f["properties"]["id"] == zid), None)
        gsame = bool(g) and g["geometry"]["coordinates"] == [[[c[1], c[0]] for c in ring]]
        i = next((r for r in idx["zones"] if r["id"] == zid), None)
        print(("OK  " if same and inside and gsame else "FAIL"),
              f"{zid}: 도형 {a:.1f}㎡ / 공식 {area} ({a/area*100:.1f}%), geom={z.get('geom')}, "
              f"geojson={'일치' if gsame else '불일치'}, index={'있음' if i else '없음'}")
        ok &= same and inside and gsame
    for zid, key in (("11530UQ120PS202605040001", "stage"), ("11000UQ120PS202601310054", "stage")):
        print("OK  ", zid, "stage =", by_id[zid]["stage"])
    gcount = geo["metadata"].get("count") == len(geo["features"])
    icount = idx["count"] == len(idx["zones"])
    print(("OK  " if gcount else "FAIL"), "geojson count", geo["metadata"].get("count"))
    print(("OK  " if icount else "FAIL"), "zone-index count", idx["count"])
    ok &= gcount and icount
    return ok


def apply():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    before = len(zones)
    zones, log = patch(zones)
    if len(zones) != before:
        raise SystemExit("!! 구역 수가 바뀌었습니다")
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    export_python()
    meta = json.loads(META.read_text(encoding="utf-8"))
    zones_now = {z["id"]: z for z in json.loads(SOURCE.read_text(encoding="utf-8"))}
    meta["sixzones_20261127"] = {
        "asOf": AS_OF,
        "note": "염리동 27-46 참고경계·도화동 196-11·화곡역 동측·화곡동 1033 경계 반영, 고척동 241·상도15 단계 갱신",
        "zones": {
            zid: {"geom": zones_now[zid].get("geom"), "areaShape": zones_now[zid].get("areaShape")}
            for zid in ("mapo-yeomni-27-46", "mp-dohwa-196-11", "hwagog-east", "rest17gu-gs-화곡동-1033")
        },
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("반영 완료:", log)


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    apply()
    sys.exit(0 if check() else 1)
