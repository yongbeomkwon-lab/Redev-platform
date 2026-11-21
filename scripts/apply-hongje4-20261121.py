#!/usr/bin/env python3
"""
홍제4(11410UQ120PS202605210002) — '옛 홍제4구역'과의 관계 확인 결과 반영 (2026-11-21)

확인 결론
  · 홍제4(서울시 레코드 11410UQ120PS202605210002, 구역면적 28,044.4㎡)는
    서대문구 홍제동 267-1번지 일대(도로명 세무서10길 27-1 일원)에 2025-12-26
    서울시 고시 제2025-766호로 새로 지정된 살아 있는 구역이다.
      - 2023-09-21 신속통합기획 후보지 선정 → 2025-08-18 기획완료
      - 2025-12-19 추진위 승인(서대문구 고시 제2025-179호) → 2025-12-26 정비구역 지정
      - 2026-11 기준 조합설립 동의서 징구 중(정보몽땅 동의서 접수현황 2026-09-04,
        국·공유지 동의 확인 촉구 결재문서 2026-11-02)
  · 서울시가 2026-09-22 발표한 홍제동 9-81 일대 통합 신속통합기획에 들어간
    '옛 홍제4구역'은 재개발예정구역에서 해제된 뒤 통합구역에 편입된 옛 구역으로,
    이 홍제4구역과 이름만 같고 다른 곳이다.
      - 서울시 보도자료: "개미마을·문화마을·옛 홍제4구역 … 옛 홍제4구역 역시
        재개발예정구역에서 해제" → 옛 홍제4구역은 9-81 통합구역(134,565.1㎡) 안
      - 홍제4구역 도형(UQ120, 28,179㎡)은 9-81 도형과 겹치는 면적이 0㎡이고,
        9-81 공람안 면적 134,565.1㎡는 옛 레코드 119,734㎡에서 14,831㎡만 늘어
        28,044.4㎡짜리 홍제4구역을 새로 품을 수 없다.
  ⇒ 숨김(hiddenByDefault) 대상이 아니다. 대신 두 구역이 헷갈리지 않도록
    홍제4에 명칭·지번·면적·경과·출처를 채우고, 홍제동 9-81 일대 설명에
    '옛 홍제4구역'이 이 구역과 다른 곳이라는 문장을 넣는다.

원칙
  · 값은 서울시·서대문구 고시, 서울시 보도자료, 정비사업 정보몽땅, 언론 보도로 확인한 것만 적는다.
  · 경계(도형)와 추진단계(stage)는 서울시 도시계획사업 레코드 그대로 둔다.
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용
  python3 scripts/apply-hongje4-20261121.py           # 반영
  python3 scripts/apply-hongje4-20261121.py --check   # 확인
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
AS_OF = "2026-11-21"

# ── ① 홍제4구역(홍제동 267-1번지 일대) ────────────────────────────────────────
HONGJE4_ID = "11410UQ120PS202605210002"

HONGJE4_NAME = "홍제4구역"

HONGJE4_NOTE = (
    "서대문구 홍제동 267-1번지 일대(도로명 세무서10길 27-1 일원, 인왕산 자락 구릉지) "
    "28,044.4㎡의 신속통합기획 주택정비형 재개발사업입니다. 2021년 신속통합기획 후보지 신청에서 "
    "탈락했다가 2023-07 다시 신청해 2023-09-21 후보지로 선정됐고(토지등소유자 353명 중 263명 동의, "
    "동의율 74.5%), 2025-08-18 기획이 완료됐습니다. 2025-12-05 서울시 도시계획위원회 신속통합기획 "
    "수권분과위원회가 정비계획(안)을 수정가결하며 정비구역 명칭을 '홍제4구역'으로 확정했고, "
    "2025-12-19 조합설립추진위원회 승인(서대문구 고시 제2025-179호, 2025-12-24)과 2025-12-26 "
    "정비계획 결정·정비구역 지정(서울시 고시 제2025-766호, 지구단위계획 포함)이 이어졌습니다. "
    "계획은 최고 28층 877세대(임대 185세대)로, 단지 중앙부를 타워형으로 배치해 폭 15m 이상 통경축을 "
    "확보하고 외곽을 낮춘 텐트형 스카이라인을 적용해 인왕산 조망과 주변 15~20층 아파트와의 조화를 함께 "
    "노립니다. 용도지역은 제2종에서 제3종일반주거지역으로 올리고 2030 도시·주거환경정비기본계획의 "
    "사업성 보정계수를 적용해 용적률이 16.2% 높아졌으며, 세무서길을 폭 10~12m에서 15m로 넓히고 "
    "2차로를 3차로로 확장합니다. 노후 건축물 88.2%, 폭 4m 미만 도로 66.1%, 반지하 주택 76.4%의 "
    "취약지였습니다. 2026-01-29~2027-01-28 토지거래허가구역으로 재지정됐고, 2026-11 기준 추진위가 "
    "조합설립 동의서를 징구하며 조합설립인가를 준비하고 있습니다(서울시가 밝힌 목표는 2028년 "
    "사업시행인가·2031년 착공)."
)

HONGJE4_NAME_NOTE = (
    "정비구역 명칭은 서울시 고시 제2025-766호·서대문구 고시 제2025-179호의 「홍제4 주택정비형 재개발 "
    "정비구역(홍제4구역)」입니다. 2026-09 서울시가 확정한 홍제동 9-81 일대 통합 신속통합기획에 들어간 "
    "'옛 홍제4구역'은 재개발예정구역에서 해제된 뒤 통합구역에 편입된 다른 곳으로, 이 구역(홍제동 "
    "267-1번지 일대)과는 이름만 같습니다."
)

HONGJE4_AREA_NOTE = (
    "정비구역 28,044.4㎡(서울시 고시 제2025-766호) — 도로 619.9㎡(2.2%)·택지 27,424.5㎡(97.8%) · "
    "877세대(임대 185) · 최고 28층 · 용도지역 제2종→제3종(용적률 16.2% 상향)"
)

HONGJE4_BOUNDARY_NOTE = (
    "서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계(UQ120) — 고시 구역면적 28,044.4㎡ 대비 "
    "도형 28,179㎡(+0.5%)로 고시 지형도면과 사실상 일치합니다."
)

HONGJE4_ALIASES = [
    "홍제4",
    "홍제4구역",
    "홍제 4구역",
    "홍제4구역 재개발",
    "홍제동 267-1",
    "홍제동 267-1번지",
    "홍제동 267-1 일대",
    "홍제동267-1",
    "서대문구 홍제동 267-1 일대",
    "세무서10길 27-1",
    "세무서10길27-1",
]

HONGJE4_SOURCES = [
    {
        "label": "서울시 고시 제2025-766호(2025-12-26) — 홍제4구역 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정(28,044.4㎡), 지구단위계획구역 결정 및 지형도면 고시",
        "url": "https://jaegebal.com/gnotices/seoul-gs-2025-766",
    },
    {
        "label": "토지이음 고시정보 — 서울특별시 고시 제2025-766호 원문(고시일 2025-12-26, 담당 서울시 주거정비과)",
        "url": "https://eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=636947",
    },
    {
        "label": "서대문구 고시 제2025-179호(2025-12-24) — 홍제동 267-1번지 일대 주택정비형 재개발사업 조합설립추진위원회 승인 고시(승인 2025-12-19)",
        "url": "https://jaegebal.com/gnotices/sdm-gs-2025-179",
    },
    {
        "label": "서울시 보도자료(2025-12-07) — 홍제4구역(홍제동 267-1번지 일대), 인왕산 품은 877세대 친환경 단지로 재탄생(877세대·임대 185·최고 28층·통경축 15m·2종→3종·용적률 16.2%↑·목표 2028 사업시행인가·2031 착공)",
        "url": "https://jaegebal.com/gnotices/seoul-press-2025-133878",
    },
    {
        "label": "아유경제(2025-12-08) — 홍제4구역 재개발, 인왕산 품은 지상 28층 아파트 877가구(대상지 서대문구 세무서10길 27-1(홍제동) 일원 2만8,044㎡)",
        "url": "http://www.areyou.co.kr/news/articleView.html?idxno=91799",
    },
    {
        "label": "서울시 보도자료(2025-12-11) — 토지거래허가구역 재지정(홍제동 267-1 일대, 2026-01-29~2027-01-28)",
        "url": "https://jaegebal.com/gnotices/seoul-press-2025-133863",
    },
    {
        "label": "정비사업 정보몽땅 — 홍제4 주택정비형 재개발 정비구역(추진단계 조합설립추진위원회 승인 25.12.19, 다음 단계 조합설립인가)",
        "url": "https://cleanup.seoul.go.kr/assc/scrin-bbs/execute.do?cafeId=410900001349G53",
    },
    {
        "label": "재개발닷컴 진행현황 — 홍제4구역(대상지선정 2023.09.21·기획완료 2025.08.18·추진위승인 2025.12.19·구역지정 2025.12.26, 2026-11 기준 조합설립인가 진행 중)",
        "url": "https://jaegebal.com/develops/1234",
    },
]

HONGJE4 = {
    "name": HONGJE4_NAME,
    "area": 28044.4,
    "selectedAt": "2023-09-21",
    "note": HONGJE4_NOTE,
    "nameNote": HONGJE4_NAME_NOTE,
    "areaNote": HONGJE4_AREA_NOTE,
    "boundaryNote": HONGJE4_BOUNDARY_NOTE,
    "alias": HONGJE4_ALIASES,
    "sources": HONGJE4_SOURCES,
    "asOf": AS_OF,
}

# ── ② 홍제동 9-81 일대 — '옛 홍제4구역'이 홍제4구역과 다른 곳임을 밝힌다 ──────────
HONGJE981_ID = "11000UQ120PS202502050006"

HONGJE981_NOTE = (
    "서대문구 홍제동 9-81번지 일대(인왕산 자락·세검정로변, 홍제천 위쪽) 주택정비형 재개발사업입니다. "
    "사업성이 없어 여러 차례 무산됐던 개미마을·문화마을·옛 홍제4구역 3개 마을을 하나의 구역으로 묶은 "
    "통합 재개발입니다. 여기서 말하는 옛 홍제4구역은 재개발예정구역에서 해제된 뒤 이 통합구역에 편입된 "
    "옛 구역이며, 지도에 따로 표시된 홍제4구역(홍제동 267-1번지 일대, 28,044.4㎡, 877세대)과는 다른 "
    "곳입니다. 2024-10-21 재개발 후보지로 조건부 선정되고 2025-12-11 건축기획용역에 착수해 주민 소통 9차례·"
    "원팀회의 9차례·전문가 자문 4차례를 거쳐 2026-09-23 신속통합기획이 확정됐습니다. 가이드라인은 "
    "제1·2종(7층 이하 포함) 일반주거지역을 제3종일반주거지역으로 올리고 용적률 275.6%, 최고 30층"
    "(세검정로변 170m·그 외 140m) 규모로 계획했습니다. 이어 2026-10-14 서대문구 공고 제2026-1443호로 "
    "「정비구역 지정 및 정비계획(안)」 주민공람이 나왔습니다(공람 2026-10-14~11-13, 서대문구청 "
    "도심개발과). 공고문 기준 정비구역 134,565.1㎡, 2,521세대(임대 358세대)로, 기존 1,305세대에서 "
    "1,216세대가 늘어납니다. 법적상한용적률 275.6%, 최고 30층이며 추정비례율은 107.17%(총수입 "
    "1조8,776억5,985만원·총지출 1조4,076억1,429만원·종전자산 4,386억602만원, 3.3㎡당 일반분양가 "
    "3,100만원·공사비 950만원 기준)로 추산됐습니다. 계획에는 최대 105m 고저차를 살린 절·성토 최소화와 "
    "단차 아래 주민공동시설, 내부순환로 하부 공공부지 편입과 세검정로3길 교차로·하부도로 확폭을 통한 "
    "진출입 개선, 인왕산 자락 훼손지 약 3만㎡의 공원 회복, 폭 20m 통경축 2곳, 홍제천·학교·역으로 "
    "이어지는 생활동선이 담겼습니다. 공람이 끝나 의견청취와 도시계획위원회 심의를 거쳐 정비구역 지정 "
    "고시가 남아 있습니다."
)

HONGJE981_ALIASES_ADD = ["개미마을", "문화마을", "문화타운"]

HONGJE981 = {
    "note": HONGJE981_NOTE,
    "aliasAdd": HONGJE981_ALIASES_ADD,
}

META_KEY = "hongje4Relation20261121"
META = {
    "asOf": AS_OF,
    "zones": [HONGJE4_ID, HONGJE981_ID],
    "note": (
        "서대문구 홍제4(11410UQ120PS202605210002)는 홍제동 267-1번지 일대 28,044.4㎡로 2025-12-26 "
        "서울시 고시 제2025-766호에 지정된 별도 추진 구역으로 확인돼 숨기지 않고 명칭·지번·면적·경과·"
        "출처를 채웠다. 홍제동 9-81 일대 통합구역에 들어간 '옛 홍제4구역'은 재개발예정구역에서 해제된 "
        "뒤 편입된 다른 곳이며(도형 겹침 0㎡), 두 구역이 헷갈리지 않도록 9-81 설명에 명시했다. "
        "경계 도형과 추진단계는 서울시 레코드 그대로."
    ),
}


def props_for_hongje4() -> dict:
    p = dict(HONGJE4)
    p["alias"] = list(HONGJE4["alias"])
    p["sources"] = [dict(s) for s in HONGJE4["sources"]]
    return p


def _merge_alias(first: list[str], rest: list[str]) -> list[str]:
    merged: list[str] = []
    for a in list(first) + list(rest):
        if a and a not in merged:
            merged.append(a)
    return merged


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    by_id = {f["properties"].get("id"): f for f in geo["features"]}
    feat = by_id.get(HONGJE4_ID)
    if feat is None:
        print("[실패] geojson에 홍제4가 없습니다:", HONGJE4_ID)
        return 1
    p = feat["properties"]
    before = {k: p.get(k) for k in ("name", "area", "alias", "selectedAt", "note", "nameNote")}
    base_alias = list(p.get("alias") or [])
    p.update(props_for_hongje4())
    p["area"] = HONGJE4["area"]
    p["alias"] = _merge_alias(HONGJE4["alias"], base_alias)
    after = {k: p.get(k) for k in before}
    print(
        f"[geojson] {before.get('name')} → {p['name']} ({HONGJE4_ID}) · area {before.get('area')} → "
        f"{p['area']} · alias {len(p['alias'])}개 · {'changed' if before != after else 'unchanged'}"
    )

    feat981 = by_id.get(HONGJE981_ID)
    if feat981 is None:
        print("[실패] geojson에 홍제동 9-81 일대가 없습니다:", HONGJE981_ID)
        return 1
    q = feat981["properties"]
    b981 = (q.get("note"), list(q.get("alias") or []))
    q["note"] = HONGJE981["note"]
    q["alias"] = _merge_alias(list(q.get("alias") or []), HONGJE981["aliasAdd"])
    a981 = (q.get("note"), list(q.get("alias") or []))
    print(
        f"[geojson] {q.get('name')} ({HONGJE981_ID}) · note {'changed' if b981[0] != a981[0] else 'unchanged'}"
        f" · alias {len(b981[1])} → {len(a981[1])}"
    )

    geo.setdefault("metadata", {})[META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("[saved]", GEOJSON.relative_to(ROOT))

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    sby = {z.get("id"): z for z in src}
    s4 = sby.get(HONGJE4_ID)
    s981 = sby.get(HONGJE981_ID)
    if s4 is None or s981 is None:
        print("[실패] seoul-zones.json에 대상 구역이 없습니다")
        return 1
    b = {k: s4.get(k) for k in ("name", "area", "alias", "selectedAt", "note", "nameNote")}
    base = list(s4.get("alias") or [])
    for k, v in props_for_hongje4().items():
        s4[k] = v
    s4["area"] = HONGJE4["area"]
    s4["alias"] = _merge_alias(HONGJE4["alias"], base)
    a = {k: s4.get(k) for k in b}
    print(f"[seoul-zones] {b.get('name')} → {s4['name']} · area {b.get('area')} → {s4['area']} · "
          f"{'changed' if b != a else 'unchanged'}")
    b2 = s981.get("note")
    s981["note"] = HONGJE981["note"]
    s981["alias"] = _merge_alias(list(s981.get("alias") or []), HONGJE981["aliasAdd"])
    print(f"[seoul-zones] {s981.get('name')} · note {'changed' if b2 != s981['note'] else 'unchanged'}")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("[saved]", SOURCE.relative_to(ROOT))
    return 0


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {f["properties"].get("id"): f["properties"] for f in geo["features"]}
    sby = {z.get("id"): z for z in src}
    want4 = props_for_hongje4()
    for name, obj in (("geojson", by_id.get(HONGJE4_ID)), ("seoul-zones", sby.get(HONGJE4_ID))):
        p = obj or {}
        ok = (
            p.get("name") == want4["name"]
            and abs(float(p.get("area") or 0) - want4["area"]) < 0.01
            and p.get("note") == want4["note"]
            and p.get("nameNote") == want4["nameNote"]
            and p.get("boundaryNote") == want4["boundaryNote"]
            and p.get("selectedAt") == want4["selectedAt"]
            and all(a in (p.get("alias") or []) for a in want4["alias"])
            and len(p.get("sources") or []) == len(want4["sources"])
            and p.get("hiddenByDefault") in (None, False)
        )
        print(f"[{'OK' if ok else 'FAIL'}] {name} {HONGJE4_ID} name={p.get('name')} area={p.get('area')} "
              f"alias={len(p.get('alias') or [])} sources={len(p.get('sources') or [])}")
        bad += 0 if ok else 1
    for name, obj in (("geojson", by_id.get(HONGJE981_ID)), ("seoul-zones", sby.get(HONGJE981_ID))):
        p = obj or {}
        ok = p.get("note") == HONGJE981_NOTE and all(a in (p.get("alias") or []) for a in HONGJE981_ALIASES_ADD)
        print(f"[{'OK' if ok else 'FAIL'}] {name} {HONGJE981_ID} note={'y' if p.get('note') == HONGJE981_NOTE else 'n'} "
              f"alias={len(p.get('alias') or [])}")
        bad += 0 if ok else 1
    ok_meta = geo.get("metadata", {}).get(META_KEY) is not None
    print(f"[{'OK' if ok_meta else 'FAIL'}] metadata batch={META_KEY}")
    bad += 0 if ok_meta else 1
    return bad


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(1 if check() else 0)
    rc = apply()
    if rc:
        sys.exit(rc)
    print()
    sys.exit(1 if check() else 0)
