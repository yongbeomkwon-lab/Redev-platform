#!/usr/bin/env python3
"""리디브 — 광진·성동 6개 구역 경계·유형 반영 (2026-11-27)

  1) `gui3-224-54`  광진구 구의3동 224-54 일대 모아타운 — 서울특별시 공고 제2026-1510호(2026-05-14)
     붙임1 토지거래허가구역 지형도면 3번(8쪽)을 브이월드 연속지적도 필지선에 맞춰 필지정합.
  2) `jayang1-655`  광진구 자양1동 655 일대 모아타운 — 서울특별시 공고 제2026-2452호(2026-08-27)
     붙임1 지형도면 1번(3쪽) 필지정합.
  3) `sy-geumho23`   성동구 금호동4가 1109 일대 — 서울특별시 공고 제2026-456호(2026-02-12)
     토지거래허가구역 해제 공고 12쪽 지형도면 필지정합.
  4) `11000UQ120PS202411014498` 금호21구역 — 유형 일반재개발 → 신통기획 정정.
  5) `rest17gu-jayang4b` 자양4동B(자양동 858) — 동일로 서쪽(성수동2가)으로 넘어간 부분을 잘라
     동쪽 블록만 남긴 경계로 교정.
  6) `rest17gu-gj-가-자양동-614` (가)자양동 614 — 광진구 공고(2026-07-27) 붙임1 hwpx 도면 필지정합 (47,317㎡).
  7) `gwangjin-jayang17-1` 신규 — 광진구 자양동 17-1 일원 민간도심복합(성장거점형) 시범사업지
     (서울시 보도자료 2026-09-15, 5,132.6㎡) · 자양동 17-1·17-3·17-5 필지 합집합.

실행: python3 scripts/apply-zones-20261127.py [--check]
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data"
AS_OF = "2026-11-27"

ID_GUI3 = "gui3-224-54"
ID_JY655 = "jayang1-655"
ID_GH23 = "sy-geumho23"
ID_GH21 = "11000UQ120PS202411014498"
ID_J4B = "rest17gu-jayang4b"
ID_J614 = "rest17gu-gj-가-자양동-614"
ID_J171 = "gwangjin-jayang17-1"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


GUI3 = load("gui3-224-54-20261127.json")
JY655 = load("jayang1-655-20261127.json")
GH23 = load("geumho23-20261127.json")
J614 = load("jayang614-20261127.json")
J4B = load("jayang4b-fix-20261127.json")
J171 = load("jayang17-1-20261127.json")

SRC_1510 = {
    "label": "서울특별시 공고 제2026-1510호(2026-05-14) 토지거래허가구역 (재)지정 및 조정 공고 — "
             "붙임1 토지거래허가구역 지형도면 3. 광진구 구의3동 224-54 일대(8쪽)",
    "url": "https://land.seoul.go.kr/land/other/downloadAppointPbancFile.do?fileUuid=59d9172df79c0038e063621d0f8d00381085097",
}
SRC_2452 = {
    "label": "서울특별시 공고 제2026-2452호(2026-08-27) 토지거래허가구역 지정 공고 — "
             "붙임1 지형도면 1. 광진구 자양1동 655 일대(3쪽)",
    "url": "https://land.seoul.go.kr/land/other/downloadAppointPbancFile.do?fileUuid=59eaca13115b00d0e063621d0f8d00d01085136",
}
SRC_456 = {
    "label": "서울특별시 공고 제2026-456호(2026-02-12) 토지거래허가구역 지정·조정·해제 공고 — "
             "2. 허가구역 해제 대상지역 성동구 금호동4가 1109 일대(30,706㎡) / 12쪽 지형도면",
    "url": "https://land.seoul.go.kr/land/other/downloadAppointPbancFile.do?fileUuid=59d9172df7a20038e063621d0f8d00381085103",
}
SRC_VWORLD = {
    "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 경계 — 리디브 /api/parcel 점 조회(2026-11-27)",
    "url": "https://www.vworld.kr/dtld/dbndDtlPage.do",
}
SRC_GJ614 = {
    "label": "광진구 「신속통합기획 후보지 신청 동의양식 번호 부여 알림(자양1동 614번지 일대)」(2026-07-27) "
             "붙임1 구역공개 안내문 hwpx 도면 — 구역계 47,317㎡",
    "url": "https://www.gwangjin.go.kr/portal/bbs/B0000001/view.do?nttId=6617660",
}
SRC_GJ858 = {
    "label": "광진구 「신속통합기획 후보지 신청 동의양식 번호 부여 알림(자양4동 858번지 일대)」(2026-08-11) "
             "붙임1 구역공개 안내문 — 구역계 58,680.1㎡",
    "url": "https://www.gwangjin.go.kr/portal/bbs/B0000001/view.do?nttId=6620384",
}
SRC_SEOUL_171 = {
    "label": "서울시 보도자료(2026-09-15) 「서울시, 다핵도시 재편 시동… 역삼·자양동 '성장거점', 성내·창동 등 4곳 '생활거점'」"
             " — 성장거점형 복합개발사업 시범사업지 광진구 자양동 17-1 일원(5,132.6㎡)",
    "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=466369",
}

# ── 구역별 갱신 내용 ──────────────────────────────────────────────────────────
GUI3_NOTE = (
    "광진구 구의동 224-54번지 일대 모아타운 대상지입니다. 2026-05-07 서울시가 모아타운 10곳 가운데 하나로 "
    "묶어 토지거래허가구역(도로 지목 한정)으로 지정했고, 2026-05-14 공고 제2026-1510호로 지형도면이 실렸습니다. "
    "지정기간은 2026-05-19부터 2027-08-30까지이고, 2026-05-19 관리계획 수립 절차에 들어갔습니다. "
    "권리산정기준일은 2025-09-23입니다. 지도 경계는 공고 지형도면의 구역선을 브이월드 연속지적도 필지선에 "
    "맞춰 필지 단위로 다시 조립한 검토 경계입니다."
)
GUI3_AREA = (
    "공고 면적 22,240.0㎡(약 6,728평) — 서울특별시 공고 제2026-1510호 지형도면 표 기준. "
    "지도 도형 면적은 22,130.0㎡로 공고의 99.5%이며, 차이는 구역선이 밟고 지나가는 도로·골목 필지를 "
    "필지선에 맞춰 다듬었기 때문입니다."
)
GUI3_BOUND = (
    "서울특별시 공고 제2026-1510호(2026-05-14) 붙임1 지형도면 3번(8쪽)의 붉은 구역선을 브이월드 연속지적도"
    "(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립했습니다. 600dpi 도면에서 구역선을 뽑아 공고 면적으로 축척을 잡고"
    "(0.1006 m/px) 필지선에 정합했으며(정합 오차 중앙값 1.5m), 꼭짓점을 필지선에 붙이고 변 위의 필지 꼭짓점을 "
    "끼워 넣었습니다. 관리계획 수립 단계라 구역계가 확정 고시된 것은 아니며, 관리계획 승인 과정에서 달라질 수 있습니다."
)

JY655_NOTE = (
    "광진구 자양동 655-19번지 일대 모아타운 대상지입니다. 2026-08-20 서울시 모아타운 대상지로 선정됐고, "
    "2026-08-27 공고 제2026-2452호로 토지거래허가구역(도로 지목 한정)으로 지정되면서 지형도면이 실렸습니다. "
    "지정기간은 2026-09-01부터 2031-08-31까지이고, 권리산정기준일은 2026-05-18입니다. "
    "지금은 관리계획 수립 단계입니다. 지도 경계는 공고 지형도면의 구역선을 브이월드 연속지적도 필지선에 맞춰 "
    "필지 단위로 다시 조립한 검토 경계입니다."
)
JY655_AREA = (
    "공고 면적 73,019.7㎡(약 22,088평) — 서울특별시 공고 제2026-2452호 표 기준. 도로 지목 토지만 "
    "토지거래허가 대상입니다. 지도 도형 면적은 73,985.3㎡로 공고의 101.3%이며, 구역선을 필지선에 붙이는 "
    "과정에서 구역 안 도로 필지 일부가 함께 들어간 차이입니다."
)
JY655_BOUND = (
    "서울특별시 공고 제2026-2452호(2026-08-27) 붙임1 지형도면 1번(3쪽)의 붉은 구역선을 브이월드 연속지적도"
    "(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립했습니다. 600dpi 도면에서 구역선을 뽑아 공고 면적으로 축척을 잡고"
    "(0.1539 m/px) 정합했으며(구역선 위 표본의 필지선까지 오차 중앙값 2.4m), 꼭짓점을 필지선에 붙이고 변 위의 "
    "필지 꼭짓점을 끼워 넣었습니다. 대상지 선정·관리계획 수립 단계라 구역계 확정 고시 전입니다. "
    "남서쪽 (가)자양동 614 구역과 겹치는 면적은 약 239㎡로, 두 신청 구역의 구역선이 서로 맞닿는 자리입니다."
)

GH23_NOTE = (
    "성동구 금호동4가 1109번지 일대입니다. 2021년 공공재개발 후보지였으나 주민의견조사에서 반대가 많아 "
    "해제 수순을 밟았고, 2026-02-12 서울특별시 공고 제2026-456호로 토지거래허가구역에서도 풀렸습니다"
    "(공고 당시 면적 30,706㎡). 이어 2026-02-26 성동구가 신속통합기획 주택재개발 후보지 신청을 위한 "
    "동의서 발급 사실을 안내하며 2026-03-05 동의서 번호를 부여했고, 지금은 후보지 신청 전 단계입니다. "
    "지도 경계는 해제 공고 12쪽 지형도면의 구역선을 브이월드 연속지적도 필지선에 맞춰 필지 단위로 다시 조립한 "
    "검토 경계이며, 실제 구역계는 신청인이 제출한 안으로 후보지 추천 과정에서 바뀔 수 있습니다."
)
GH23_AREA = (
    "공고 면적 30,706㎡(약 9,289평) — 서울특별시 공고 제2026-456호 표 기준(공공재개발 후보지 시절 구역계). "
    "지도 도형 면적은 31,232.1㎡로 공고의 101.7%이며, 구역선을 필지선에 붙이는 과정에서 구역 안 도로 필지가 "
    "일부 함께 들어간 차이입니다."
)
GH23_BOUND = (
    "서울특별시 공고 제2026-456호(2026-02-12) 12쪽 지형도면(금호동4가 1109번지 일대 토지거래허가구역도)의 "
    "붉은 구역선을 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립했습니다. 600dpi 도면에서 "
    "구역선을 뽑아 공고 면적으로 축척을 잡고(0.1044 m/px) 필지선에 정합했으며(오차 중앙값 1.2m), 꼭짓점을 "
    "필지선에 붙이고 변 위의 필지 꼭짓점을 끼워 넣었습니다. 후보지 신청 전이라 구역계 확정 고시 전입니다."
)

GH21_TYPENOTE = (
    "2026-11-27 유형 정정 — 금호21구역은 2024-11-14 신속통합기획 후보지로 선정돼 추진돼 온 구역입니다. "
    "서울시 데이터의 사업구분(재개발(주택정비형))만 보고 '일반재개발'로 잘못 넣었던 것을 신통기획으로 바로잡았습니다."
)

J4B_AREA = (
    "공고 면적 58,680.1㎡(약 17,751평) — 광진구 공고(2026-08-11) 구역계 표 기준(신청인 제출 구역계). "
    "지도 도형 면적은 52,018.0㎡로 공고의 88.6%입니다. 차이는 두 가지로, ① 공고 면적에는 구역계가 밟고 지나는 "
    "동일로·뚝섬로 도로 부지 몫이 들어 있는데 도형에서는 자양동 필지가 아닌 서쪽(성수동2가) 몫을 잘라냈고, "
    "② 저해상(812×637px) 스캔 도면이라 위치를 공고 면적으로만 잡아 경계가 서쪽으로 밀렸던 것을 동일로 동쪽 "
    "자양동 블록에 맞춰 다시 놓았기 때문입니다."
)
J4B_BOUND = (
    "광진구 공고(2026-08-11) 첨부 「자양4동 858번지 일대 동의서 번호부여 요청 구역 공개」 도면의 붉은 구역선을 "
    "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립한 경계입니다. 2026-11-27 교정 — 종전 경계는 "
    "저해상 스캔 도면의 축척을 공고 면적으로만 잡아 서쪽으로 밀리면서 동일로(노란 간선도로)를 건너 "
    "성수동2가 필지까지 덮었습니다(약 6,500㎡). 이번에 자양동 필지 경계 안쪽으로 잘라 동일로 동쪽 블록"
    "(자양동 858번지 일대)에만 놓이도록 다시 정합하고, 꼭짓점을 필지선에 붙였습니다. 둘레 도로(동일로·뚝섬로) "
    "필지는 도형에서 빼 도로를 덮지 않습니다. 서쪽 자양1의4구역 가로주택정비사업과 겹치는 면적은 0㎡이고, "
    "남쪽 지주택 자양동 548(지구단위계획구역)과도 겹치지 않습니다. 후보지 추천·구역계 고시 전이라 실제 경계는 "
    "달라질 수 있습니다."
)

J614_NOTE = (
    "광진구 자양동 614번지 일대 주택정비형 재개발 추진 구역입니다. (가칭)자양1동 614번지 일대 재개발사업 "
    "추진준비위원회가 동의서 번호부여를 요청해 광진구가 2026-07-27 안내문을 내고 2026-07-24 동의서 번호를 "
    "부여했습니다. 구역계는 47,317㎡이고, 신청인이 제출한 안이라 후보지 추천 과정에서 일부 변경·조정될 수 "
    "있습니다. 후보지로 선정되면 분양받을 권리 산정기준일이 추천일(구→시) 또는 별도 구청 요청일이 되고 "
    "토지거래허가구역으로 지정됩니다."
)
J614_AREA = (
    "구역계 47,317㎡(약 14,313평) — 광진구 안내문(2026-07-27) 붙임1 표 기준(신청인 제출 구역계). "
    "지도 도형 면적은 47,818.0㎡로 101.1%이며, 구역선을 필지선에 붙이는 과정에서 구역 안 도로 필지가 일부 "
    "함께 들어간 차이입니다."
)
J614_BOUND = (
    "광진구 안내문(2026-07-27) 붙임1 「구역공개 안내문(자양1동 614번지 일대)」 hwpx 안의 구역계 도면(812×705px)을 "
    "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립했습니다. 공고 구역계 면적으로 축척을 잡고"
    "(0.734 m/px) 필지선에 정합해(오차 중앙값 1.0m) 꼭짓점을 필지선에 붙이고 변 위의 필지 꼭짓점을 끼워 넣었습니다. "
    "동쪽으로 맞닿은 자양1동 655 모아타운과 겹치는 면적은 약 239㎡입니다(양쪽 신청 구역선이 맞닿는 자리). "
    "후보지 신청 전이라 구역계 확정 고시 전입니다."
)

J171_NOTE = (
    "광진구 자양동 17-1번지(아차산로 200) 일원입니다. 2026-09-15 서울시가 「다핵도시 재편」 구상의 첫 "
    "성장거점형 복합개발사업 시범사업지 2곳 가운데 하나로 선정했습니다(강남구 역삼동 680-1과 함께). "
    "건대입구역(2·7호선) 환승역세권이자 폭 35m 아차산로에 접하고 세종대학교·어린이대공원과 가까운 자리로, "
    "면적은 5,132.6㎡입니다. 2026-12월까지 복합개발계획안을 만들고 2027-01월부터 입안 제안 등 행정절차를 "
    "시작할 계획이며, 입지·접도 요건을 갖추면 일반상업지역 기준 용적률 최대 1,300%까지 적용될 수 있습니다. "
    "아직 계획 수립 초기 단계라 법적 구역계는 없습니다."
)
J171_AREA = (
    "선정 면적 5,132.6㎡(약 1,553평) — 서울시 보도자료(2026-09-15) 기준. 지도 도형은 이 자리의 필지 "
    "자양동 17-1(1,893.9㎡)·17-3(1,325.6㎡)·17-5(1,910.0㎡)를 합친 5,129.6㎡로 선정 면적의 99.9%입니다."
)
J171_BOUND = (
    "연속지적도(LP_PA_CBND_BUBUN)에서 자양동 17-1·17-3·17-5 세 필지를 그대로 합쳐 만든 필지정합 경계입니다"
    "(5,129.6㎡). 선정 면적 5,132.6㎡와 0.06% 차이이고, 커먼그라운드(아차산로 200) 부지에 해당합니다. "
    "사업시행자가 제출할 계획안과 도심복합개발혁신지구 지정 과정에서 구역계가 정해지므로 지금 경계는 "
    "선정 대상지 범위를 보여 주는 참고 경계입니다. 북서쪽 자양동 10번지 일원 추진준비 구역(대표님이 관리자 "
    "모드에서 그린 참고 경계)과 약 2,190㎡ 겹칩니다."
)

NEW_171 = {
    "id": ID_J171,
    "name": "자양동 17-1 일원 민간도심복합(성장거점형)",
    "alias": [
        "자양동 17-1", "자양동 17-1 일원", "자양동 17-1번지", "(가)자양동 17-1",
        "아차산로 200", "커먼그라운드", "건대입구역 민간도심복합", "자양동 성장거점",
        "민간도심복합 자양동", "성장거점형 복합개발",
    ],
    "type": "민간도심복합(성장거점형)",
    "kind": "민간도심복합개발(성장거점형)",
    "stage": "시범사업지 선정(2026-09-15)",
    "gu": "광진구",
    "area": 5132.6,
    "featured": False,
    "geom": "필지정합",
    "boundaryApprox": True,
    "areaShape": J171["areaShape"],
    "selectedAt": "2026-09-15",
    "centerLabel": "자양동 17-1 일원(아차산로 200, 건대입구역 환승역세권)",
    "polygon": J171["ring"],
    "center": [37.541013, 127.065806],
    "note": J171_NOTE,
    "areaNote": J171_AREA,
    "boundaryNote": J171_BOUND,
    "sources": [SRC_SEOUL_171, SRC_VWORLD],
    "sid": "서울시 보도자료(2026-09-15) · 브이월드 연속지적도 필지정합(2026-11-27)",
    "asOf": AS_OF,
}


def set_geom(z, spec, note=None, area_note=None, boundary_note=None, extra_sources=()):
    z = dict(z)
    z["geom"] = "필지정합"
    z["boundaryApprox"] = True
    z["areaShape"] = spec["areaShape"]
    z["polygon"] = spec["ring"]
    if spec.get("parts") and len(spec["parts"]) > 1:
        z["parts"] = spec["parts"][1:]
    else:
        z.pop("parts", None)
    z["asOf"] = AS_OF
    if note:
        z["note"] = note
    if area_note:
        z["areaNote"] = area_note
    if boundary_note:
        z["boundaryNote"] = boundary_note
    srcs = list(z.get("sources") or [])
    for s in extra_sources:
        if s["url"] not in [x.get("url") for x in srcs if isinstance(x, dict)]:
            srcs.append(s)
    z["sources"] = srcs
    return z


def apply():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    ids = {z["id"] for z in zones}
    for i in (ID_GUI3, ID_JY655, ID_GH23, ID_GH21, ID_J4B, ID_J614):
        if i not in ids:
            raise SystemExit(f"!! 구역 없음: {i}")
    if ID_J171 in ids:
        raise SystemExit(f"!! {ID_J171} 가 이미 있습니다")

    before_others = {z["id"]: json.dumps(z, ensure_ascii=False, sort_keys=True) for z in zones}
    before_count = len(zones)

    for i, z in enumerate(zones):
        zid = z["id"]
        if zid == ID_GUI3:
            zones[i] = set_geom(z, GUI3, GUI3_NOTE, GUI3_AREA, GUI3_BOUND, [SRC_1510, SRC_VWORLD])
        elif zid == ID_JY655:
            zones[i] = set_geom(z, JY655, JY655_NOTE, JY655_AREA, JY655_BOUND, [SRC_2452, SRC_VWORLD])
        elif zid == ID_GH23:
            zones[i] = set_geom(z, GH23, GH23_NOTE, GH23_AREA, GH23_BOUND, [SRC_456, SRC_VWORLD])
        elif zid == ID_J614:
            z = dict(z)
            z["area"] = 47317
            z["stage"] = "연번부여(2026-07-24)"
            zones[i] = set_geom(z, J614, J614_NOTE, J614_AREA, J614_BOUND, [SRC_GJ614, SRC_VWORLD])
        elif zid == ID_J4B:
            zones[i] = set_geom(z, J4B, None, J4B_AREA, J4B_BOUND, [SRC_GJ858, SRC_VWORLD])
        elif zid == ID_GH21:
            z = dict(z)
            z["type"] = "신통기획"
            z["kind"] = "신속통합기획(재개발)"
            z["typeNote"] = GH21_TYPENOTE
            z["asOf"] = AS_OF
            zones[i] = z

    pos = max(i for i, z in enumerate(zones) if z.get("gu") == "광진구")
    zones.insert(pos + 1, dict(NEW_171))

    after_others = {z["id"]: json.dumps(z, ensure_ascii=False, sort_keys=True) for z in zones}
    changed = [k for k in before_others
               if k not in (ID_GUI3, ID_JY655, ID_GH23, ID_GH21, ID_J4B, ID_J614)
               and before_others[k] != after_others.get(k)]
    if changed:
        raise SystemExit(f"!! 다른 구역이 바뀌었습니다: {changed[:5]}")
    if len(zones) != before_count + 1:
        raise SystemExit(f"!! 구역 수 {before_count} → {len(zones)}")
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-1500:])
            print(r.stderr[-1500:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    key = "gwangsungZones_20261127"
    meta[key] = {
        "asOf": AS_OF,
        "note": ("광진 구의3동 224-54·자양1동 655 모아타운과 성동 금호23, (가)자양동 614, 자양4동B 경계를 공고 도면에서 "
                 "필지정합으로 반영 · 자양동 17-1 민간도심복합(성장거점형) 신규 · 금호21 유형 신통기획 정정"),
        "zones": {
            ID_GUI3: {"geom": "필지정합", "areaShape": GUI3["areaShape"]},
            ID_JY655: {"geom": "필지정합", "areaShape": JY655["areaShape"]},
            ID_GH23: {"geom": "필지정합", "areaShape": GH23["areaShape"]},
            ID_J614: {"geom": "필지정합", "areaShape": J614["areaShape"]},
            ID_J4B: {"geom": "필지정합", "areaShape": J4B["areaShape"]},
            ID_J171: {"geom": "필지정합", "areaShape": J171["areaShape"], "area": 5132.6},
            ID_GH21: {"type": "신통기획", "kind": "신속통합기획(재개발)"},
        },
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][key] = meta[key]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("반영 완료:", ID_GUI3, ID_JY655, ID_GH23, ID_J614, ID_J4B, ID_J171, ID_GH21)


def check():
    ok = True
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by = {z["id"]: z for z in zones}
    expect = {
        ID_GUI3: (GUI3["areaShape"], 22240),
        ID_JY655: (JY655["areaShape"], 73019.7),
        ID_GH23: (GH23["areaShape"], 30706),
        ID_J614: (J614["areaShape"], 47317),
        ID_J4B: (J4B["areaShape"], 58680.1),
        ID_J171: (J171["areaShape"], 5132.6),
    }
    for zid, (ash, area) in expect.items():
        z = by.get(zid)
        if not z:
            print("!! 없음", zid); ok = False; continue
        if z.get("geom") != "필지정합":
            print("!! geom", zid, z.get("geom")); ok = False
        if abs((z.get("areaShape") or 0) - ash) > 1:
            print("!! areaShape", zid, z.get("areaShape"), ash); ok = False
        if abs((z.get("area") or 0) - area) > 1:
            print("!! area", zid, z.get("area"), area); ok = False
        if not z.get("polygon"):
            print("!! polygon 없음", zid); ok = False
        if z.get("boundaryApprox") is not True:
            print("!! boundaryApprox", zid); ok = False
    g21 = by.get(ID_GH21) or {}
    if g21.get("type") != "신통기획" or g21.get("kind") != "신속통합기획(재개발)":
        print("!! 금호21 유형", g21.get("type"), g21.get("kind")); ok = False
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    for zid in list(expect) + [ID_GH21]:
        f = feats.get(zid)
        if not f:
            print("!! geojson 없음", zid); ok = False
            continue
        if zid in expect and not f.get("geometry"):
            print("!! geojson geometry 없음", zid); ok = False
    idx = json.loads((ROOT / "public" / "data" / "zone-index.json").read_text(encoding="utf-8"))
    if ID_J171 not in {z["id"] for z in idx["zones"]}:
        print("!! zone-index 에 17-1 없음"); ok = False
    print("검사", "통과" if ok else "실패", f"구역 {len(zones)}")
    return ok


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    apply()
    sys.exit(0 if check() else 1)
