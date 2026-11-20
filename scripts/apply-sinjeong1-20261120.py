#!/usr/bin/env python3
"""
신정역1구역(신정4동 922번지 일대, 양천구) — 정비구역지정(공람) 상향·별칭 반영 (2026-11-20)

· 대상: 11000UQ120PS202505310025 (신정4동 922 일대, 신속통합기획, 기획완료)
  → stage="정비구역지정(공람)", area=95,476㎡, alias=["신정역1구역", "신정역1", …],
    selectedAt=2025-04-28, note·areaNote·boundaryNote·sources 보강
· 근거:
  - 2026-10-15 양천구 공고 제2026-1788호 「신정4동 922번지 일대 주택정비형 재개발사업 정비계획
    결정 및 정비구역 지정(안) 공람공고」 — 공람 2026.10.15.~11.16.(30일 이상),
    구역면적 95,476㎡(공고문 표기 9만5,475.7㎡), 2,177세대(조합원 1,434·일반분양 304·임대 439),
    지상 25층, 용적률 267.9%, 권리산정기준일 2025-03-14, 토지등소유자 1,540명(추정)
  - 2026-11-19 서울시 도시계획과-14303 「… 공람 안내 및 협의 회신」(부분공개) — 시 협의 단계
  - 진행: 대상지선정 2025-04-28 → 기획완료 2026-08-20 → 정비구역지정(공람) 2026-10-15
· 경계: 기존 서울시 도시계획사업(서울플랜+ 2026-09-10) UQ120 실경계 그대로 둔다(도형 85,218㎡).
  공람안 면적 95,476㎡와 약 10,200㎡(-10.7%) 차이가 있어, 정비구역 지정 고시·지형도면이
  나오면 경계를 다시 반영해야 한다.

실행: python3 scripts/apply-sinjeong1-20261120.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
ZONE_ID = "11000UQ120PS202505310025"

NOTE = """신정역(5호선)에서 걸어서 5분 거리인 신정4동 922번지 일대(법정동 신정동 927-32 일대)입니다. 2025-04-28 신속통합기획 후보지로 선정되고 2026-08-20 기획이 완료된 뒤, 2026-10-15 양천구 공고 제2026-1788호로 「신정4동 922번지 일대 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정(안)」 주민공람이 나왔습니다(공람 2026-10-15~11-16, 30일 이상, 양천구청 6층 도시계획과). 공람안 기준으로 구역면적 95,476㎡(공고문 표기 9만5,475.7㎡)에 지상 25층·용적률 267.9%로 2,177세대를 짓습니다. 조합원분양 1,434세대·일반분양 304세대·임대 439세대(임대의무 260·국민임대 115·기부채납임대 64)이고, 전용면적별로는 39㎡ 237세대·59㎡ 862세대·84㎡ 1,078세대로 짜였습니다. 토지등소유자는 1,540명(추정)이며 권리산정기준일은 2025-03-14입니다. 공람이 끝난 뒤 2026-11-19 서울시 도시계획과가 협의 회신을 보내 시 협의 단계로 넘어갔고, 구의회 의견청취·도시계획위원회 심의를 거쳐 정비구역 지정 고시로 이어집니다. 가까운 초등학교는 서울양동초(약 160m)이고 신정네거리역(2호선)·까치산역(5호선)도 도보 10분 안쪽입니다."""

AREA_NOTE = """정비구역 95,476㎡(양천구 공고 제2026-1788호 공람안, 공고문 표기 9만5,475.7㎡ / 서울시 서울플랜+ 고시 레코드 84,186㎡ → 11,290㎡ 확대) · 2,177세대(조합원 1,434·일반분양 304·임대 439) · 용적률 267.9% · 지상 25층 · 권리산정기준일 2025-03-14. 지도 경계는 서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계로 도형 면적이 85,218㎡여서 공람안보다 약 10,200㎡ 작습니다(2026-10 공람안에서 넓어진 구역 미반영)."""

BOUNDARY_NOTE = """서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계 — 2026-10-15 공람안 구역면적 95,476㎡ 대비 도형 85,218㎡(-10.7%). 공람안에서 구역이 넓어졌으므로 정비구역 지정 고시·지형도면이 나오면 경계를 다시 반영해야 합니다."""

NAME_NOTE = """공고문·서울시 결재문서상 구역명은 '신정4동 922번지 일대'(서울 열린데이터광장 표기 '신정4동 922 일대')이고, 시공사·주민·현장에서 쓰는 이름은 '신정역1구역'입니다(서울시 도시계획과 결재문서 2026-11-19, 재개발닷컴 구역 정보). 검색에서 두 표기 모두 걸리도록 별칭으로 함께 두었습니다."""

SOURCES = [
    {
        "label": "양천구 공고 제2026-1788호 — 신정4동 922번지 일대 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정(안) 공람공고(2026-10-15, 공람 10-15~11-16)",
        "url": "https://www.yangcheon.go.kr/site/yangcheon/ex/seol/seolContentDeailView.do?not_ancmt_mgt_no=48283",
    },
    {
        "label": "서울시 결재문서 도시계획과-14303 — 신정4동 922번지 일대 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정(안) 공람 안내 및 협의 회신(2026-11-19)",
        "url": "https://opengov.seoul.go.kr/sanction/37456829",
    },
    {
        "label": "토지이음 — 주민의견청취 공람: 신정4동 922번지 일대 정비구역 지정(안) 공람공고(공고일 2026-10-15, 양천구 도시계획과)",
        "url": "https://eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp?seq=5787",
    },
    {
        "label": "재개발닷컴 — 신정역1구역(신정4동 922번지 일대) 사업 정보·공급 계획(양천구 공고 제2026-1788호 기준)",
        "url": "https://jaegebal.com/gnotices/seoul-og-2026-533426?develop=1402&from=develop",
    },
    {
        "label": "위클리한국주택경제신문 — 신정4동 922번지, 재개발 정비구역 지정 목전…최고 25층 2,177세대(2026-10-20)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=68239",
    },
]

PROPS = {
    "stage": "정비구역지정(공람)",
    "area": 95476,
    "selectedAt": "2025-04-28",
    "alias": [
        "신정역1구역",
        "신정역1",
        "신정역1구역(신정4동 922 일대)",
        "신정4동 922 일대 주택정비형 재개발사업",
    ],
    "note": NOTE,
    "areaNote": AREA_NOTE,
    "boundaryNote": BOUNDARY_NOTE,
    "nameNote": NAME_NOTE,
    "sources": SOURCES,
    "asOf": "2026-11-19",
}

META_KEY = "sinjeong1Notice20261120"
META = {
    "asOf": "2026-11-20",
    "updates": 1,
    "note": (
        "신정역1구역(11000UQ120PS202505310025, 신정4동 922 일대) — 2026-10-15 양천구 공고 제2026-1788호 "
        "정비구역 지정(안) 공람(10-15~11-16)과 2026-11-19 서울시 도시계획과 협의 회신을 반영해 단계를 "
        "'기획완료'에서 '정비구역지정(공람)'으로 올리고 구역면적을 공람안 95,476㎡로 바꿨다. 검색 별칭에 "
        "'신정역1구역'·'신정역1'을 넣었다. 경계 도형은 종전 서울시 실경계(UQ120) 그대로이며 도형 면적 "
        "85,218㎡로 공람안보다 약 10,200㎡ 작다."
    ),
}


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    p = (feat or {}).get("properties", {})
    ok = (
        bool(feat)
        and p.get("stage") == PROPS["stage"]
        and abs((p.get("area") or 0) - PROPS["area"]) < 0.01
        and (p.get("alias") or [])[:2] == PROPS["alias"][:2]
        and p.get("selectedAt") == PROPS["selectedAt"]
        and len(p.get("sources") or []) >= len(SOURCES)
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson {p.get('name')} stage={p.get('stage')} area={p.get('area')} alias={(p.get('alias') or [])[:2]}")
    bad += 0 if ok else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None) or {}
    ok2 = (
        entry.get("stage") == PROPS["stage"]
        and abs((entry.get("area") or 0) - PROPS["area"]) < 0.01
        and (entry.get("alias") or [])[:2] == PROPS["alias"][:2]
    )
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones.json stage={entry.get('stage')} area={entry.get('area')} alias={(entry.get('alias') or [])[:2]}")
    bad += 0 if ok2 else 1

    ok3 = geo["metadata"].get(META_KEY) is not None
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata batch={META_KEY in geo['metadata']} count={geo['metadata'].get('count')}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    if not feat:
        print("[실패] geojson에 구역 없음:", ZONE_ID)
        return 1
    feat["properties"].update(PROPS)
    geo["metadata"][META_KEY] = META
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] {ZONE_ID} 갱신 — stage={PROPS['stage']} area={PROPS['area']} alias={PROPS['alias'][:2]}")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    if not entry:
        print("[실패] seoul-zones.json에 구역 없음:", ZONE_ID)
        return 1
    entry.update(PROPS)
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] {ZONE_ID} 갱신 — stage={PROPS['stage']} area={PROPS['area']}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
