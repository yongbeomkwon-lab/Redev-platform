#!/usr/bin/env python3
"""
전농15구역(동대문구 전농동 152-65)·홍제동 9-81 일대(서대문구) — 정비구역지정 공람 단계 반영 (2026-11-21)

반영 내용
  ① 11000UQ120PS202407010950 전농동 152-65 (전농15구역)
     · stage  대상지선정(추진중) → 정비구역지정(공람)
     · area   71,738㎡ → 72,594.2㎡ (공람안)
     · 별칭 전농15구역·전농15 등 / note·areaNote·boundaryNote·sources·selectedAt 보강
     · 근거: 동대문구 공고 제2026-1670호(2026-11-12, 공람 2026-11-12~12-14),
             서울시 보도자료(2026-09-02 전농동 152-65 신통기획 확정), 디벨로퍼뉴스(2026-11-19)
  ② 11000UQ120PS202502050006 홍제동 9-81 일대
     · stage  대상지선정(추진중) → 정비구역지정(공람)
     · area   119,734㎡ → 134,565.1㎡ (공람안)
     · 별칭 홍제9-81 등 / note·areaNote·boundaryNote·sources·selectedAt 보강
     · 근거: 서대문구 공고 제2026-1443호(2026-10-14, 공람 2026-10-14~11-13),
             서울시 신속통합기획 가이드라인(2026.9. 홍제동 9-81 일대), 위클리한국주택경제(2026-10-20)

원칙
  · 값은 구청 공고문·서울시 보도자료·가이드라인으로 확인한 것만 적는다.
  · 경계(도형)는 손대지 않는다 — 서울시 도시계획사업(서울플랜+ 2026-09-10) UQ120 실경계 그대로.
    공람안 면적과 도형 면적 차이는 boundaryNote 에 적는다.
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용
  python3 scripts/apply-jeonnong15-hongje981-20261121.py           # 반영
  python3 scripts/apply-jeonnong15-hongje981-20261121.py --check   # 확인
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
AS_OF = "2026-11-21"

# ── ① 전농15구역 ─────────────────────────────────────────────────────────────
JEONNONG_ID = "11000UQ120PS202407010950"

JEONNONG_NOTE = """동대문구 전농동 152-65번지 일대(서울시립대 서쪽, 청량리역·회기역 생활권) 주택정비형 재개발사업입니다. 2023-11-23 제6차 신속통합기획 민간재개발 후보지로 조건부 선정됐고(다가구·원룸 소유자 반대로 동대문구가 후보지 철회를 요청했으나 서울시가 반려, 2024-07 구청장 주재 주민 토론회로 절차 재개), 2024-12 정비계획 용역 착수, 2025-08-27 후보지 선정위원회 조건부 동의, 주민의견조사 찬성 55.7%·반대 19.1%를 거쳐 2026-09-02 신속통합기획이 확정됐습니다. 이어 2026-11-12 동대문구 공고 제2026-1670호로 「정비구역 지정 및 정비계획(안)」 주민공람이 나왔습니다(공람 2026-11-12~12-14, 30일 이상, 동대문구청 주거정비과). 공람안은 정비구역 72,594.2㎡에 용적률 299.90%를 적용해 지하 3층~지상 최고 35층 21개동 1,804세대(임대 497세대 — 의무공공임대 245·기부채납임대 166·국민주택임대 86)를 짓는 계획입니다. 제1·2종일반주거지역 중심 저층주거지를 제3종일반주거지역 75.5%로 종상향하고 소형주택 공급 인센티브와 사업성보정계수 1.87로 허용용적률 246.74%를 확보한 뒤, 공공임대 기부채납과 법적상한용적률 완화로 299.90%를 계획했습니다. 추정비례율 103.86%(총수입 1조6,962억원·총지출 1조937억원·종전자산 5,800억원), 토지등소유자 914명(추정)입니다. 정비계획에는 전농로 신호교차로·가감속차로와 버스베이, 전농로34길·38길 양방통행 확폭, 동측 폭 12m 우회도로, 전농로·제기로변 소공원 2개소, 북측 공원 하부 공영주차장, 경로당·어린이집·파출소 재배치가 담겼습니다. 대상지의 25.7%(약 18,658㎡)가 국·공유지(옛 청량리역 철도관사 부지)이고 30년 이상 노후 건축물이 70.2%, 최대 약 22m 구릉지 단차가 있습니다. 공람이 끝나면 구의회 의견청취와 서울시 도시계획위원회 심의를 거쳐 정비구역 지정 고시로 이어집니다."""

JEONNONG_AREA_NOTE = """정비구역 72,594.2㎡(동대문구 공고 제2026-1670호 공람안, 종전 서울시 레코드 71,738㎡) · 1,804세대(임대 497) · 지하 3층~지상 최고 35층 21개동 · 용적률 299.90%(허용 246.74%) · 추정비례율 103.86%"""

JEONNONG_BOUNDARY_NOTE = """서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계(UQ120) — 2026-11 공람안 구역면적 72,594.2㎡ 대비 도형 68,352㎡(-5.8%). 공람안에서 넓어진 구역계는 도형에 아직 반영되지 않았으므로, 정비구역 지정 고시·지형도면이 나오면 경계를 다시 맞춰야 합니다."""

JEONNONG_ALIASES = [
    "전농15구역",
    "전농15",
    "전농 15구역",
    "전농동 152-65 일대",
    "전농동152-65",
    "동대문구 전농동 152-65 일대",
    "전농15 재개발",
]

JEONNONG_SOURCES = [
    {
        "label": "동대문구 공고 제2026-1670호 — 전농동 152-65번지 일대 정비구역 지정 및 정비계획(안) 입안을 위한 공람공고(2026-11-12, 공람 2026-11-12~12-14)",
        "url": "https://www.ddm.go.kr/www/selectEminwonWebView.do?key=3291&notAncmtMgtNo=22867",
    },
    {
        "label": "서울시 보도자료 — 지역과 대학을 잇는 열린 주거단지 조성, 전농동 152-65 신통기획 확정(2026-09-02, 최고 35층·약 1,800세대)",
        "url": "https://www.seoul.go.kr/news/news_report.do?bbsNo=158&nttNo=465151",
    },
    {
        "label": "디벨로퍼뉴스 — 전농15구역, 주민 반대 뚫고 1804세대 재개발 시동…'조건부 신통기획' 정면돌파(2026-11-19, 면적 72,594.2㎡·용적률 299.90%·21개동·임대 497세대)",
        "url": "https://www.dpnews.co.kr/news/articleView.html?idxno=2803",
    },
    {
        "label": "위클리한국주택경제 — 전농동 152-65번지 일대, 추정비례율 103.86%로 추산(2026-11-16, 1,804세대·임대 497세대=의무공공임대 245·기부채납 166·국민주택 86)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=69516",
    },
    {
        "label": "서울시 보도자료 — 서울시, 신속통합 6차 민간재개발 후보지 3곳 선정(2023-11-23, 전농동 152-65 일대 조건부 선정)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=400768",
    },
]

JEONNONG = {
    "stage": "정비구역지정(공람)",
    "area": 72594.2,
    "selectedAt": "2023-11-23",
    "note": JEONNONG_NOTE,
    "areaNote": JEONNONG_AREA_NOTE,
    "boundaryNote": JEONNONG_BOUNDARY_NOTE,
    "alias": JEONNONG_ALIASES,
    "sources": JEONNONG_SOURCES,
    "asOf": AS_OF,
}

# ── ② 홍제동 9-81 일대 ──────────────────────────────────────────────────────
HONGJE_ID = "11000UQ120PS202502050006"

HONGJE_NOTE = """서대문구 홍제동 9-81번지 일대(인왕산 자락·세검정로변, 홍제천 위쪽) 주택정비형 재개발사업입니다. 사업성이 없어 여러 차례 무산됐던 개미마을·문화마을·옛 홍제4구역 3개 마을을 하나의 구역으로 묶은 통합 재개발로, 2024-10-21 재개발 후보지로 조건부 선정되고 2025-12-11 건축기획용역에 착수해 주민 소통 9차례·원팀회의 9차례·전문가 자문 4차례를 거쳐 2026-09-23 신속통합기획이 확정됐습니다. 가이드라인은 제1·2종(7층 이하 포함) 일반주거지역을 제3종일반주거지역으로 올리고 용적률 275.6%, 최고 30층(세검정로변 170m·그 외 140m) 규모로 계획했습니다. 이어 2026-10-14 서대문구 공고 제2026-1443호로 「정비구역 지정 및 정비계획(안)」 주민공람이 나왔습니다(공람 2026-10-14~11-13, 서대문구청 도심개발과). 공고문 기준 정비구역 134,565.1㎡, 2,521세대(임대 358세대)로, 기존 1,305세대에서 1,216세대가 늘어납니다. 법적상한용적률 275.6%, 최고 30층이며 추정비례율은 107.17%(총수입 1조8,776억5,985만원·총지출 1조4,076억1,429만원·종전자산 4,386억602만원, 3.3㎡당 일반분양가 3,100만원·공사비 950만원 기준)로 추산됐습니다. 계획에는 최대 105m 고저차를 살린 절·성토 최소화와 단차 아래 주민공동시설, 내부순환로 하부 공공부지 편입과 세검정로3길 교차로·하부도로 확폭을 통한 진출입 개선, 인왕산 자락 훼손지 약 3만㎡의 공원 회복, 폭 20m 통경축 2곳, 홍제천·학교·역으로 이어지는 생활동선이 담겼습니다. 공람이 끝나 의견청취와 도시계획위원회 심의를 거쳐 정비구역 지정 고시가 남아 있습니다."""

HONGJE_AREA_NOTE = """정비구역 134,565.1㎡(서대문구 공고 제2026-1443호 공람안, 종전 서울시 레코드 119,734㎡) · 2,521세대(임대 358) · 최고 30층(세검정로변 170m·그 외 140m) · 법적상한용적률 275.6% · 추정비례율 107.17%"""

HONGJE_BOUNDARY_NOTE = """서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계(UQ120) — 공람안 구역면적 134,565.1㎡ 대비 도형 129,764㎡(-3.6%). 2026-06 구역계 확대(내부순환로 하부 공공부지 편입 등)분이 도형에 반영되지 않았으므로, 정비구역 지정 고시·지형도면이 나오면 경계를 다시 맞춰야 합니다."""

HONGJE_ALIASES = [
    "홍제9-81",
    "홍제 9-81",
    "홍제9-81구역",
    "홍제동 9-81",
    "홍제동9-81",
    "홍제동 9-81 일대",
    "홍제동 9의81",
    "홍제동 9의81 일대",
    "서대문구 홍제동 9-81 일대",
]

HONGJE_SOURCES = [
    {
        "label": "서대문구 공고 제2026-1443호 — 홍제동 9-81번지 일대 주택정비형 재개발사업 정비구역 지정 및 정비계획(안)에 대한 공람 공고(2026-10-14, 공람 2026-10-14~11-13)",
        "url": "https://www.sdm.go.kr/news/notice/notice.do?mode=view&sdmBoardSeq=315889",
    },
    {
        "label": "서울시 신속통합기획 온라인 아카이브 — 홍제동 9-81 일대 재개발 가이드라인(2026.9., 구역면적 134,565.1㎡·용적률 275.6%·최고 30층·2,520세대 내외)",
        "url": "https://news.seoul.go.kr/citybuild/archives/542414",
    },
    {
        "label": "서울시 보도자료 — 홍제동 9-81일대 신속통합기획 확정…3개 마을 통합 2,520여 세대 숲세권 단지로(2026-09-23)",
        "url": "https://news.seoul.go.kr/citybuild/archives/542429",
    },
    {
        "label": "위클리한국주택경제 — 홍제동 9-81번지, 재개발 추정비례율 107.17%로 추산(2026-10-20, 2,521세대·임대 358세대·면적 134,565.1㎡)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=68245",
    },
]

HONGJE = {
    "stage": "정비구역지정(공람)",
    "area": 134565.1,
    "selectedAt": "2024-10-21",
    "note": HONGJE_NOTE,
    "areaNote": HONGJE_AREA_NOTE,
    "boundaryNote": HONGJE_BOUNDARY_NOTE,
    "alias": HONGJE_ALIASES,
    "sources": HONGJE_SOURCES,
    "asOf": AS_OF,
}

TARGETS = {JEONNONG_ID: JEONNONG, HONGJE_ID: HONGJE}

META_KEY = "jeonnong15Hongje981Notice20261121"
META = {
    "asOf": AS_OF,
    "zones": [JEONNONG_ID, HONGJE_ID],
    "stage": "정비구역지정(공람)",
    "note": (
        "동대문구 전농동 152-65(전농15구역, 공고 제2026-1670호 공람 11-12~12-14)와 서대문구 홍제동 9-81 일대"
        "(공고 제2026-1443호 공람 10-14~11-13)를 '대상지선정(추진중)'에서 '정비구역지정(공람)'으로 올리고 "
        "공람안 기준 구역면적·세대수·용적률·층수와 출처를 보강했다. 경계 도형은 서울시 도시계획사업(2026-09-10) "
        "실경계 그대로이며 두 곳 모두 공람안 면적이 도형보다 크다(boundaryNote 참고)."
    ),
}


def props_for(zid: str) -> dict:
    p = dict(TARGETS[zid])
    p["alias"] = list(TARGETS[zid]["alias"])
    p["sources"] = [dict(s) for s in TARGETS[zid]["sources"]]
    return p


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {f["properties"].get("id"): f for f in geo["features"]}
    src_by_id = {z.get("id"): z for z in src}
    for zid, want in TARGETS.items():
        for name, obj, getter in (
            ("geojson", by_id.get(zid), lambda o: o["properties"] if o else {}),
            ("seoul-zones", src_by_id.get(zid), lambda o: o or {}),
        ):
            p = getter(obj)
            ok_stage = p.get("stage") == want["stage"]
            ok_area = abs(float(p.get("area") or 0) - want["area"]) < 0.01
            ok_alias = all(a in (p.get("alias") or []) for a in want["alias"])
            ok_note = p.get("note") == want["note"] and p.get("boundaryNote") == want["boundaryNote"]
            ok = ok_stage and ok_area and ok_alias and ok_note
            print(
                f"[{'OK' if ok else 'FAIL'}] {name} {zid} stage={p.get('stage')} "
                f"area={p.get('area')} alias={len(p.get('alias') or [])} note={'y' if ok_note else 'n'}"
            )
            bad += 0 if ok else 1
    ok_meta = geo.get("metadata", {}).get(META_KEY) is not None
    print(f"[{'OK' if ok_meta else 'FAIL'}] metadata batch={META_KEY}")
    bad += 0 if ok_meta else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    by_id = {f["properties"].get("id"): f for f in geo["features"]}
    for zid, want in TARGETS.items():
        feat = by_id.get(zid)
        if feat is None:
            print("[실패] geojson에 구역 없음:", zid)
            return 1
        p = feat["properties"]
        before = {k: p.get(k) for k in ("stage", "area", "alias", "selectedAt", "note", "boundaryNote")}
        p.update(props_for(zid))
        # merge alias (기존 별칭 유지 + 새 별칭 추가) — 같은 값을 다시 넣어도 순서가 같다
        merged = []
        for a in list(TARGETS[zid]["alias"]) + list(before.get("alias") or []):
            if a not in merged:
                merged.append(a)
        p["alias"] = merged
        after = {k: p.get(k) for k in before}
        print(f"[geojson] {p.get('name')} ({zid}) — {before.get('stage')} → {p['stage']}, "
              f"area {before.get('area')} → {p['area']}, alias {len(merged)}개, "
              f"{'changed' if before != after else 'unchanged'}")

    geo.setdefault("metadata", {})[META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    src_by_id = {z.get("id"): z for z in src}
    for zid, want in TARGETS.items():
        entry = src_by_id.get(zid)
        if entry is None:
            print("[실패] seoul-zones.json에 구역 없음:", zid)
            return 1
        before = {k: entry.get(k) for k in ("stage", "area", "alias", "selectedAt", "note", "boundaryNote")}
        entry.update(props_for(zid))
        merged = []
        for a in list(TARGETS[zid]["alias"]) + list(before.get("alias") or []):
            if a not in merged:
                merged.append(a)
        entry["alias"] = merged
        after = {k: entry.get(k) for k in before}
        print(f"[seoul-zones] {entry.get('name')} ({zid}) — {before.get('stage')} → {entry['stage']}, "
              f"area {before.get('area')} → {entry['area']}, {'changed' if before != after else 'unchanged'}")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
