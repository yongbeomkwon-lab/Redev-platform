#!/usr/bin/env python3
"""2026-11-27 — 리디브 「사당17구역」 사업유형·진행단계 정정 (동작구 조합설립인가 반영)

## 반영 근거
  · 2026-08-21 동작구가 사당17구역(사당동 63-1번지 일대) 주택정비형 재개발사업 **조합설립인가**
    (연합뉴스 2026-08-26 · 디벨로퍼뉴스 2026-08-21 · 동작구 보도자료).
  · 토지등소유자 402명 중 325명 동의(80.8%)로 2026-07-27 인가 신청 → 2026-08-21 인가.
  · 2024-10-21 신속통합기획 후보지 선정 → 2025-12-24 도계위 수정가결 → 2026-01-22 서울시 고시
    제2026-47호 정비구역 지정(44,072.7㎡) → 2026-01-07 추진위 승인 → 2026-08-21 조합설립인가.
  · 정비사업 정보몽땅 「우리동네 정비사업 사업 진행단계」도 조합설립인가 26.08.21 로 표기.

## 고치는 값
  · type  일반재개발 → **신통기획** (서울시 원천 데이터의 BZ103 '재개발(주택정비형)' 분류만 남아 있었음)
  · stage 추진위구성 → **정비구역 지정(2026-01-22)·조합설립인가(2026-08-21)**
    (사다리에 두 사건 날짜를 함께 세우기 위해 표기 두 개를 붙였다 — 기존 구역과 같은 방식)
  · stageCode PP0206 · prog 45 · spec 8 (조합설립인가 구역 공통값)
  · selectedAt 2024-10-21, 동의율·사업 개요(토지등소유자 402·기존 394세대·계획 856세대),
    note·areaNote·sources, 별칭 보강
  · 원천 재수입(import-seoul-zones.py) 때 되돌아가지 않도록
    scripts/data/official-updates.json(단계·분류 정정)과
    scripts/data/official-supplement.json(별칭·선정일·nameNote)에도 같은 값

실행: python3 scripts/apply-sadang17-union-20261127.py [--check]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZONES = ROOT / "src" / "data" / "seoul-zones.json"
UPDATES = ROOT / "scripts" / "data" / "official-updates.json"
SUPPLEMENT = ROOT / "scripts" / "data" / "official-supplement.json"

ZID = "11590UQ120PS202605210002"
NAME = "사당17구역"

STAGE = "정비구역 지정(2026-01-22)·조합설립인가(2026-08-21)"
ALIAS = [
    "사당동 63-1",
    "사당동 63-1번지 일대",
    "사당17",
    "사당17구역 주택정비형 재개발사업",
]
NAME_NOTE = (
    "신속통합기획 후보지 선정(2024-10-21) → 정비구역 지정 고시(2026-01-22, 서울시 고시 제2026-47호) "
    "→ 조합설립인가(2026-08-21). 대표지번 사당동 63-1."
)

NOTE = (
    "동작구 사당동 63-1번지 일대 주택정비형 재개발사업입니다. 2024-10-21 신속통합기획 재개발 후보지로 "
    "선정되고 2025-08 신속통합기획 가이드라인을 확정했습니다. 2025-12-24 서울시 도시계획위원회 제14차 "
    "수권분과위원회에서 정비계획안이 수정가결돼 2026-01-22 서울시 고시 제2026-47호로 정비구역 지정"
    "(44,072.7㎡)과 지구단위계획·지형도면이 고시됐습니다. 추진위원회는 2025-12 설립을 신청해 2026-01-07 "
    "승인받았고, 토지등소유자 402명 중 325명(80.8%)이 동의한 조합설립인가 신청서가 2026-07-27 접수돼 "
    "2026-08-21 동작구가 인가했습니다 — 후보지 선정 22개월, 정비구역 지정 7개월 만으로 신속통합기획 도입 "
    "이후 가장 빠른 사례입니다. 정비계획은 제1종 일반주거지역을 제2종으로 종상향해 상한용적률 238.25%"
    "(법적상한 250%)를 확보하고 최고 23층 856세대(분양 715·임대 141세대)를 짓는 내용입니다. "
    "현충근린공원 산자락 구릉지라 구역 안 고저차가 최대 30m이고 반지하주택 비율이 83%였던 곳으로, "
    "데크를 활용한 입체 보행로로 지형을 넘습니다. 2026-04 주민총회에서 설계자 정림건축·정비사업전문관리업자 "
    "빛세움을 선정하고 박상동 조합장을 비롯한 집행부를 구성했습니다. 동작구는 2034년 하반기 준공을 목표로 "
    "사업시행인가 등 남은 절차를 추진합니다."
)

AREA_NOTE = (
    "정비구역 44,072.7㎡(서울시 고시 제2026-47호) · 최고 23층 856세대(분양 715·임대 141세대) · "
    "상한용적률 238.25%(법적상한 250%)·건폐율 60% 이하 · 추정 비례율 108.72% · 토지등소유자 402명 · "
    "기존 394세대 · 준공 목표 2034년 하반기"
)

SOURCES = [
    {
        "label": (
            "서울특별시 고시 제2026-47호 — 사당17구역 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정, "
            "지구단위계획(구역) 결정 및 지형도면 고시(2026-01-22, 정비구역 44,072.7㎡·상한용적률 238.25%·"
            "856세대)"
        ),
        "url": "https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=631892",
    },
    {
        "label": (
            "연합뉴스 — 동작구, 사당17구역 재개발 조합설립 인가…856세대 아파트단지로"
            "(2026-08-26, 2034년 하반기 준공 목표)"
        ),
        "url": "https://www.yna.co.kr/view/AKR20260826065100004",
    },
    {
        "label": (
            "디벨로퍼뉴스 — 사당17구역, 신통기획 후보지 선정 22개월 만에 조합설립인가 완료"
            "(2026-08-21, 토지등소유자 402명 중 325명 동의 80.8%·후보지 선정 2024-10-21·추진위 승인 2026-01-07)"
        ),
        "url": "https://www.dpnews.co.kr/news/articleView.html?idxno=2282",
    },
    {
        "label": (
            "정비사업 정보몽땅 — 사당17구역 주택정비형 재개발사업 사업개요·사업 진행단계"
            "(추진위원회 승인 2026-01-07 · 조합설립인가 2026-08-21)"
        ),
        "url": "https://cleanup.seoul.go.kr/assc/scrin-bbs/execute.do?cafeId=590900001422F96",
    },
]

# official-updates.json 안에서 쓸 출처 키
UPDATE_SOURCE_KEYS = [
    "sadang17-gosi-2026-47",
    "sadang17-yna-2026-08-26",
    "sadang17-dpnews-2026-08-21",
    "sadang17-cleanup",
]


def patch_zone(zones: list[dict]) -> dict:
    zone = next((z for z in zones if z.get("id") == ZID), None)
    if zone is None:
        raise SystemExit(f"{ZID} 를 찾지 못했습니다")
    before = {k: zone.get(k) for k in ("type", "stage", "stageCode", "prog", "spec")}
    zone["type"] = "신통기획"
    zone["stage"] = STAGE
    zone["stageCode"] = "PP0206"
    zone["spec"] = 8
    zone["prog"] = 45
    zone["selectedAt"] = "2024-10-21"
    zone["asOf"] = "2026-11-27"
    zone["alias"] = ALIAS
    zone["nameNote"] = NAME_NOTE
    zone["note"] = NOTE
    zone["areaNote"] = AREA_NOTE
    zone["sources"] = SOURCES
    zone["owners"] = 402
    zone["householdsNow"] = 394
    zone["householdsPlan"] = 856
    zone["consentRate"] = 80.8
    zone["consentDate"] = "2026-07-27"
    zone["consentNote"] = (
        "토지등소유자 402명 중 325명(80.8%) 동의로 2026-07-27 조합설립인가 신청 → 동작구 2026-08-21 인가"
    )
    return {"before": before, "after": {k: zone.get(k) for k in ("type", "stage", "stageCode", "prog", "spec")}}


def patch_updates(doc: dict) -> bool:
    srcs = doc.setdefault("sources", {})
    for key, src in zip(UPDATE_SOURCE_KEYS, SOURCES):
        srcs[key] = src
    entry = {
        "id": ZID,
        "name": NAME,
        "set": {"type": "신통기획", "stage": STAGE},
        "note": NOTE,
        "areaNote": AREA_NOTE,
        "nameNote": NAME_NOTE,
        "sources": UPDATE_SOURCE_KEYS,
    }
    ups = doc.setdefault("updates", [])
    for i, u in enumerate(ups):
        if u.get("id") == ZID:
            ups[i] = entry
            return False
    ups.append(entry)
    return True


def patch_supplement(doc: dict) -> bool:
    srcs = doc.setdefault("sources", {})
    for key, src in zip(UPDATE_SOURCE_KEYS, SOURCES):
        srcs[key] = src
    renames = doc.setdefault("renames", [])
    for r in renames:
        if r.get("gu") == "동작구" and r.get("from") == NAME:
            r["selectedAt"] = "2024-10-21"
            r["alias"] = ALIAS
            r["note"] = NAME_NOTE
            r["sources"] = ["cleanup-selected"] + UPDATE_SOURCE_KEYS
            return False
    raise SystemExit("official-supplement.json 의 사당17구역 rename 항목을 찾지 못했습니다")


def main() -> int:
    check = "--check" in sys.argv
    zones = json.loads(ZONES.read_text(encoding="utf-8"))
    report = patch_zone(zones)
    upd = json.loads(UPDATES.read_text(encoding="utf-8"))
    added_upd = patch_updates(upd)
    supp = json.loads(SUPPLEMENT.read_text(encoding="utf-8"))
    changed_supp = patch_supplement(supp)

    print(f"구역 {len(zones)}곳 중 {NAME}({ZID})")
    print(f"  type  {report['before']['type']} → {report['after']['type']}")
    print(f"  stage {report['before']['stage']} → {report['after']['stage']}")
    print(f"  stageCode {report['before']['stageCode']} → {report['after']['stageCode']} · prog {report['after']['prog']}")
    print(f"  official-updates: {'추가' if added_upd else '갱신'}")
    print(f"  official-supplement: {'갱신' if changed_supp else '같은 값(변경 없음)'}")

    if check:
        return 0
    ZONES.write_text(json.dumps(zones, ensure_ascii=False, indent=None, separators=(", ", ": ")) + "\n", encoding="utf-8")
    UPDATES.write_text(json.dumps(upd, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SUPPLEMENT.write_text(json.dumps(supp, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("저장 완료 — 이어서 node scripts/export-geojson.mjs && node scripts/build-zone-index.mjs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
