#!/usr/bin/env python3
"""
흑석10구역(흑석동 204-104 일대, 동작구) — 정비구역지정 공람·신통기획 확정 반영 (2026-11-19)

· 대상: 11000UQ120PS202601310017 (흑석10, 신속통합기획, 대상지선정(추진중))
  → stage="정비구역지정(공람)", area=48,693.8㎡, note·areaNote·boundaryNote·sources 보강
· 근거:
  - 2026-10-29 서울시 보도자료 — 흑석동 204-104 일대 신속통합기획 확정
    (서울시 48,693㎡·최고 23층·817세대 내외, 2027년 상반기 정비구역 지정 목표)
  - 2026-11-12 동작구 공고 제2026-1856호 「흑석재정비촉진지구 흑석10재정비촉진구역 지정 및
    촉진계획 변경결정(안) 공람 공고」 — 공람 2026.11.12.~11.30.(19일간)
    구역면적 48,693.8㎡(기정 32,952.0㎡), 817세대(분양 661·임대 156), 용적률 250%,
    건폐율 40%(자연경관지구 60%), 최고 23층
· 경계: 기존 서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계 그대로 둔다(도형 45,689㎡).
  공람안 면적 48,693.8㎡와는 차이가 있어, 정비구역 지정 고시·지형도면이 나오면 다시 반영해야 한다.

실행: python3 scripts/apply-heukseok10-20261119.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
ZONE_ID = "11000UQ120PS202601310017"

NOTE = """흑석재정비촉진지구 안에서 2014년 7월 정비구역에서 해제됐던 흑석동 204-104번지 일대(고구동산 아래 구릉지)입니다. 2025-06-30 신속통합기획 후보지로 선정되고 2026-06-25 추진위원회 승인을 거쳐, 2026-10-29 서울시가 신속통합기획을 확정했습니다(서울시 48,693㎡·최고 23층·817세대 내외, 2027년 상반기 정비구역 지정 목표). 이어 2026-11-12 동작구 공고 제2026-1856호로 「흑석10재정비촉진구역 지정 및 촉진계획 변경결정(안)」 주민 공람이 나왔습니다(공람 2026-11-12~11-30, 19일간, 동작구 도시정비과). 공람안 기준 정비구역 48,693.8㎡(기정 32,952.0㎡에서 확대)에 817세대(분양 661·임대 156, 토지등소유자 345명)를 짓고, 용적률 250%·건폐율 40%(자연경관지구 60%)·최고 23층(평균 9.64층)입니다. 계획으로 흑석로를 12m에서 15m(3차로)로 넓히고 흑석로에서 동양중학교·본동공공재개발 사업지를 잇는 폭 14m 도로를 새로 내며, 최대 69m 고저차를 다단식 대지조성·옥외 엘리베이터·경사로로 풀어냅니다. 고구동산 능선 쪽 자연경관지구에는 6~8층 저층 주동을, 지형이 낮은 쪽에 최고 23층 주동을 배치하고 공원 방향으로 폭 20m 열린배치구간을 둡니다. 공람이 끝나면 구의회 의견청취·도시재정비위원회 심의를 거쳐 정비구역 지정 고시로 이어집니다."""

AREA_NOTE = """정비구역 48,693.8㎡(동작구 공고 제2026-1856호 공람안, 기정 32,952.0㎡ → 15,741.8㎡ 확대) · 817세대(분양 661·임대 156) · 용적률 250% · 건폐율 40%(자연경관지구 60%) · 최고 23층. 지도 경계는 서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계로 도형 면적이 45,689㎡여서 공람안보다 작습니다(2026-11 공람안에서 넓어진 구역 미반영)."""

BOUNDARY_NOTE = """서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계 — 2026-11-12 공람안 구역면적 48,693.8㎡ 대비 도형 45,689㎡(-6.2%). 공람안에서 구역이 넓어졌으므로 정비구역 지정 고시·지형도면이 나오면 경계를 다시 반영해야 합니다."""

SOURCES = [
    {
        "label": "서울시 보도자료 — 멈춰 섰던 흑석재촉지구 내 해제지역, 고구동산 품은 숲세권 주거단지로… 흑석동 204-104 일대 신속통합기획 확정(2026-10-29)",
        "url": "https://www.seoul.go.kr/news/news_report.do?bbsNo=158&nttNo=469123",
    },
    {
        "label": "동작구 공고 제2026-1856호 — 흑석재정비촉진지구 흑석10재정비촉진구역 지정 및 촉진계획 변경결정(안) 공람 공고(2026-11-12, 공람 11-12~11-30)",
        "url": "https://dongjak.eminwon.seoul.kr/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do?context=NTIS&jndinm=OfrNotAncmtEJB&method=selectOfrNotAncmt&methodnm=selectOfrNotAncmtRegst&not_ancmt_mgt_no=29917&subCheck=Y",
    },
    {
        "label": "동작구 — 흑석동 204-104 일대(가칭 흑석10구역) 정비구역 지정 관련 동의서 서식 안내(2026-11-12, 구역면적 48,693.8㎡)",
        "url": "https://jaegebal.com/gnotices/dj-etc-2026-532697",
    },
    {
        "label": "메트로신문 — '12년 전 정비구역 해제' 흑석10구역, 최고 23층 재개발 추진(2026-10-29)",
        "url": "https://www.metroseoul.co.kr/article/20261029500365",
    },
    {
        "label": "데일리하우징 — 흑석동 204-104 일대, 흑석재촉지구 해제지역 817세대 재개발 재추진…신속통합기획 확정(2026-10-29)",
        "url": "https://www.dailyhousing.kr/news/articleView.html?idxno=953",
    },
]

PROPS = {
    "stage": "정비구역지정(공람)",
    "area": 48693.8,
    "alias": [
        "흑석10구역",
        "(가칭)흑석10구역",
        "가칭 흑석10구역",
        "흑석동 204-104",
        "흑석동 204-104 일대",
        "흑석10재정비촉진구역",
        "흑석10",
    ],
    "note": NOTE,
    "areaNote": AREA_NOTE,
    "boundaryNote": BOUNDARY_NOTE,
    "sources": SOURCES,
    "asOf": "2026-11-19",
}

META_KEY = "heukseok10Update20261119"
META = {
    "asOf": "2026-11-19",
    "updates": 1,
    "note": (
        "흑석10(11000UQ120PS202601310017) — 2026-10-29 서울시 신속통합기획 확정, 2026-11-12 동작구 공고 "
        "제2026-1856호 정비구역 지정(안) 공람(11-12~11-30)을 반영해 단계를 '대상지선정(추진중)'에서 "
        "'정비구역지정(공람)'으로 올리고 구역면적을 공람안 48,693.8㎡로 바꿨다. 경계 도형은 종전 서울시 "
        "실경계(UQ120) 그대로이며 도형 면적 45,689㎡로 공람안보다 작다."
    ),
}


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    p = (feat or {}).get("properties", {})
    ok = bool(feat) and p.get("stage") == PROPS["stage"] and abs((p.get("area") or 0) - PROPS["area"]) < 0.01
    print(f"[{'OK' if ok else 'FAIL'}] geojson {p.get('name')} stage={p.get('stage')} area={p.get('area')}")
    bad += 0 if ok else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None) or {}
    ok2 = entry.get("stage") == PROPS["stage"] and abs((entry.get("area") or 0) - PROPS["area"]) < 0.01
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones.json stage={entry.get('stage')} area={entry.get('area')}")
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
    print(f"[geojson] {ZONE_ID} 갱신 — stage={PROPS['stage']} area={PROPS['area']}")

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
