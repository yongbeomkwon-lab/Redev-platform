#!/usr/bin/env python3
"""
용두동 39번지 일대 3개 구역(용두3·가칭 용두7·가칭 용두8) 확인·보강
 — zones.geojson 의 세 레코드를 공식 자료로 확인한 값으로 맞춘다.

확인한 공식 자료:
  · 용두3구역(용두동 39-361번지 일대)
      - 동대문구 고시 제2026-75호(2026-04-30) 조합설립추진위원회 승인 고시
      - 동대문구 고시 제2026-153호(2026-10-15) 정비계획 변경(경미) 결정·정비구역 지정·
        지구단위계획(구역) 결정·지형도면 고시 → 명칭 '용두3구역', 면적 23,792.93㎡
      - 정비사업 정보몽땅 사업장(진행단계 추진위원회승인)
  · 가칭 용두7구역(용두동 39번지 일대)
      - 서울시 공고 제2026-3156호(2026-11-19) 토지거래허가구역 지정(75,729㎡, 2026-11-24~2028-01-28)
        → 동대문구 공고 제2026-1787호(2026-11-20)
      - 서울시 고시 제2026-651호(2026-11-19) 주택등 건축물의 분양받을 권리의 산정 기준일 고시
      - 재개발닷컴 고시 아카이브로 확인한 위 고시 원문
  · 가칭 용두8구역((가)용두동39-24, 용두동 39-24번지 일대)
      - 동대문구 「구역 공개(용두동 39-24번지 일대)」(2025-06-20, 동의양식 2025-1호) hwpx 원문
      - 동대문구 고시 제2025-209호(2025-12-04) 개발행위허가 제한지역 지정 및 지형도면 고시
        → 토지이음 고시정보(seq=626042) 첨부 고시문·지형도면(1:1,500) 직접 확인
        → 제한지역 면적 26,485.80㎡, 지형도면 표제 '용두8 역세권'

원칙:
  · 값은 위 공식 자료로 확인한 것만 적고, 민간 사이트 집계는 '추정/집계'로 밝힌다.
  · 경계(도형)는 지어내지 않는다 — 용두8은 좌표가 있는 공식 도면이 없어 geom="미고시"(점선 원) 유지.
    용두3은 서울플랜+ UQ120 실경계 그대로 둔다(고시 면적과 사실상 일치).
  · 같은 값을 다시 넣어도 결과가 같다(멱등). 용두7 설명은 기존 문장을 살리고
    표식(⑆) 뒤의 보강 문단만 새로 쓴다.

사용:
  python3 scripts/apply-yongdu-3-7-8-20261121.py
"""
import json
import os

AS_OF = "2026-11-21"

# ── 용두3구역 ────────────────────────────────────────────────────────────────
Y3_ID = "11230UQ120PS202605210001"
Y3_NAME = "용두3구역"
Y3_STAGE = "추진위구성"
Y3_AREA_NOTE = (
    "정비구역 23,792.93㎡(동대문구 고시 제2026-153호 2026-10-15 · 서울시 고시 제2026-161호 2026-03-26) / "
    "리디브 서울플랜+ 고시면적 23,793㎡"
)
Y3_BOUNDARY_NOTE = (
    "서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계. 고시 구역면적 23,792.93㎡와 도형 면적 23,793㎡가 "
    "사실상 일치해 경계를 그대로 씁니다."
)
Y3_NOTE = (
    "용두동 39-361번지 일대 주택정비형 재개발사업(신속통합기획)으로, 2026-10-15 동대문구 고시 제2026-153호로 "
    "명칭이 '용두3구역'으로 바뀌었습니다. 2022-12-29 서울시 신속통합기획 2차 후보지 선정 → 2024-12-26 정비계획 "
    "공람(2025-09-11·2026-01-22 재공람) → 2025-08-25 기획완료 → 2026-03-26 서울시 고시 제2026-161호로 정비구역 지정"
    "(23,792.93㎡) → 2026-04-30 동대문구 고시 제2026-75호로 조합설립추진위원회 승인(위원장 김상국, 감사 1·추진위원 "
    "42명, 승인 당시 동의율 64.88%) 순으로 진행됐고, 지금은 추진위 단계입니다(정비사업 정보몽땅 진행단계 "
    "'추진위원회승인'). 2026-10-15 고시에는 정비계획 경미변경과 지구단위계획(구역) 결정·지형도면이 함께 반영됐고, "
    "최고 42층 아파트 695세대(기존 406세대에서 289세대 증가), 법적상한용적률 299.98%, 추정비례율 95.78%"
    "(총수입 5,680억8,264만6,000원·총지출 3,645억5,663만9,693원)로 정리됐습니다. 권리자 분양가 추정액은 전용 "
    "39㎡ 5억4,473만5,000원·59㎡ 8억8,241만2,000원·84㎡ 10억303만1,000원입니다. 토지등소유자는 추진위 승인 고시 "
    "기준 373명(추정 349명)이고, 추진위는 2026년 8월 말~9월 초 주민총회를 열어 조합설립 동의서 징구에 들어가 "
    "2027년 상반기 조합설립을 목표로 한다고 밝혔습니다. 일대에서 유일하게 아파트만 짓는 구역입니다."
)
Y3_ALIASES = [
    "용두3",
    "용두3구역",
    "용두3 구역",
    "용두동 39-361",
    "용두동 39-361번지",
    "용두동 39-361번지 일대",
    "용두동39-361",
    "용두동 39-361 일대 주택정비형 재개발사업",
]
Y3_SOURCES = [
    {
        "label": "동대문구 고시 제2026-75호 — 용두동 39-361번지 일대 주택정비형 재개발사업 조합설립추진위원회 승인 고시(2026-04-30)",
        "url": "https://jaegebal.com/gnotices/ddm-gs-2026-75",
    },
    {
        "label": "동대문구 고시 제2026-153호 — 정비계획 변경(경미한 사항) 결정 및 정비구역 지정, 지구단위계획(구역) 결정 및 지형도면 고시(2026-10-15)",
        "url": "https://jaegebal.com/gnotices/ddm-gs-2026-153",
    },
    {
        "label": "위클리한국주택경제신문 — 용두동 39-361번지, 용두3구역으로 명칭 변경…최고 42층 695세대(2026-10-20)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=68247",
    },
    {
        "label": "하우징타임즈 — 동대문 용두3구역 추진위 승인(위원장 김상국, 토지등소유자 373명)(2026-05-01)",
        "url": "https://www.housingtimes.co.kr/news/articleView.html?idxno=2034",
    },
    {
        "label": "정비사업 정보몽땅 — 용두동 39-361번지 일대 주택정비형 재개발사업(진행단계 추진위원회승인)",
        "url": "https://cleanup.seoul.go.kr/cleanup/bsnssttus/lscrMainIndx.do",
    },
]

# ── 가칭 용두7구역 ───────────────────────────────────────────────────────────
Y7_ID = "rest17gu-ddm-용두동-39"
Y7_MARK = "⑆ 2026-11 보강 —"
Y7_ADD_NOTE = (
    Y7_MARK + " 서울시 도시계획위원회 수권분과위원회가 2026-11-13 신속통합기획 후보지 6곳의 토지거래허가구역 "
    "지정안을 의결했고, 이어 서울시는 2026-11-19 "
    "공고 제2026-3156호로 용두동 39 일대 75,729㎡를 토지거래허가구역으로 지정·공고했고(지정기간 "
    "2026-11-24~2028-01-28, 동대문구 공고 제2026-1787호 2026-11-20), 같은 날 고시 제2026-651호로 분양받을 "
    "권리의 산정 기준일(권리산정기준일 2026-10-08)을 고시했습니다. 후보지 신청 당시 주민 동의율은 71.80%"
    "(반대 7.02%, 2026-10-08 기준)였고, 토지등소유자는 835명 규모로 추정됩니다. 구역면적은 서울시 토지거래허가구역 "
    "공고 75,729㎡·재개발닷컴 집계 75,728㎡로 리디브가 쓰는 75,408㎡와 300㎡ 남짓 차이가 있습니다."
)
Y7_ALIASES = ["용두동 39번지", "용두동39", "용두7 구역"]
Y7_SOURCES_ADD = [
    {
        "label": "동대문구 공고 제2026-1787호 — 토지거래허가구역 지정 공고(용두동 39 일대, 2026-11-20~12-04)",
        "url": "https://www.ddm.go.kr/www/selectEminwonWebView.do?key=3291&notAncmtMgtNo=23006",
    },
    {
        "label": "한국경제 — 신통기획 재개발 후보지 6곳 토지거래허가구역 지정(용두동 39 75,729㎡, 2026-11-15)",
        "url": "https://www.hankyung.com/article/202611146671i",
    },
    {
        "label": "하우징타임즈 — 용두7구역 신통기획 후보지 신청, 주민 71.8% 동의(2026-10-13)",
        "url": "https://www.housingtimes.co.kr/news/articleView.html?idxno=2574",
    },
    {
        "label": "서울시 고시 제2026-651호 — 주택등 건축물의 분양받을 권리의 산정 기준일 고시(서울시보 제4194호, 2026-11-19)",
        "url": "https://event.seoul.go.kr/seoulsibo/detailview.do?cn_seq=Mjc2NzI%3D&tr_code=snews",
    },
]

# ── 가칭 용두8구역 ───────────────────────────────────────────────────────────
Y8_ID = "rest17gu-ddm-용두동-39-24-역세시프"
Y8_NAME = "용두8역세권"
Y8_STAGE = "번호부여(2025-06-20)"
Y8_AREA = 26485.8
Y8_AREA_NOTE = (
    "개발행위허가 제한지역 26,485.80㎡(동대문구 고시 제2025-209호 2025-12-04) / "
    "재개발닷컴 자체 집계 26,260㎡ / 2025-06-20 구역공개 때는 면적 미기재(지번 일대만 표기)"
)
Y8_NOTE = (
    "용두동 39-24번지 일대 역세권 장기전세주택 도시정비형 재개발사업입니다. 동대문구 고시 제2025-209호 "
    "지형도면 표제가 '용두8 역세권'이라 가칭 용두8구역으로 통합니다. 2025-06-20 동대문구가 동의서 "
    "번호부여·구역공개(동의양식 2025-1호, 추진주체 고재덕)를 하면서 사업이 공개됐고(당시 토지등소유자 208명), "
    "2025-10-30 개발행위허가 제한(안) 주민의견청취 열람공고를 거쳐 2025-12-04 고시 제2025-209호로 "
    "개발행위허가 제한지역이 지정됐습니다(제한기간은 고시일로부터 3년, 정비구역 지정 고시가 나면 종료). "
    "2026-11 현재 정비구역 지정 전(연번부여) 단계이며, 사전검토 뒤 2년 안에 정비계획 입안이 이뤄지지 않으면 "
    "사업대상지에서 빠질 수 있습니다(입안권자가 인정하면 2년 범위에서 1회 연장). 「역세권 장기전세주택 건립 "
    "운영기준(2025-01-24 시행)」에 따라 장기전세주택을 포함해 짓는 도시정비형 재개발사업이고, "
    "재개발닷컴 집계(2026-11)로는 구역 안 252세대(공동주택 178·단독 74), 노후도 83.1%, 평균 대지지분 106㎡입니다. "
    "2026-11-18 동대문구 보도자료에서도 용두7구역과 함께 '역세권 장기전세주택 사업을 추진 중'인 구역으로 "
    "소개됐습니다."
)
Y8_BOUNDARY_NOTE = (
    "구역계는 동대문구 고시 제2025-209호 지형도면(1:1,500 지적도, 2025-12-04)에 있으나 좌표가 없는 참고용 "
    "도면(고시문에 '측량 및 그 밖의 용도로 사용할 수 없습니다')이라 지도에는 경계 대신 대표 지점(39-353 일대)에 "
    "점선 원으로 표시합니다. 지형도면에서 확인한 구역 안 지번은 39-15(SC제일은행 용두동 합숙소, 고산자로30길 29)"
    "·39-24·39-353·39-446(용두아파트, 1974년 34세대)·39-1038·39-1039 등이며, 39-15와 "
    "39-446이 모두 구역 안입니다. 반대로 용두동 20번지 일대(20-3 대명빌라 등)는 구역 밖으로 공공재개발 "
    "용두1-6구역입니다. 정비구역 지정 고시로 좌표가 공개되면 그 값으로 경계를 그립니다."
)
Y8_ALIASES = [
    "가칭 용두8구역",
    "용두8구역",
    "용두8",
    "용두8 구역",
    "용두역 역세권",
    "용두동 39-24",
    "용두동39-24",
    "용두동 39-353",
    "역세권 장기전세",
    "용두동 39-24번지 일대 역세권 장기전세주택 도시정비형 재개발사업",
]
Y8_SOURCES = [
    {
        "label": "동대문구 「용두동 역세권 장기전세주택 동의서 번호부여 및 구역공개(용두동 39-24번지 일대)」(2025-06-20, 동의양식 2025-1호)",
        "url": "https://www.ddm.go.kr/www/selectBbsNttView.do?bbsNo=38&key=904&nttNo=168703",
    },
    {
        "label": "동대문구 고시 제2025-209호 — 개발행위허가 제한지역 지정 및 지형도면 고시(2025-12-04, 제한지역 26,485.80㎡)",
        "url": "https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=626042",
    },
    {
        "label": "동대문구 공고 제2025-1480호 — 개발행위허가의 제한(안) 주민의견청취 열람공고(2025-10-30~11-14)",
        "url": "https://jaegebal.com/gnotices/ddm-gg-2025-1480",
    },
    {
        "label": "서울시티 — 용두동 39번지 일대 신속통합기획 후보지 선정…용두3·용두8구역 등과 연계(2026-11-18)",
        "url": "https://www.seoulcity.co.kr/news/articleView.html?idxno=551481",
    },
]

METADATA_KEY = "yongdu378"
METADATA = {
    "asOf": AS_OF,
    "zones": [Y3_ID, Y7_ID, Y8_ID],
    "note": (
        "용두동 39번지 일대 3개 구역 확인·보강(2026-11-21) — 용두3구역은 명칭·단계(추진위구성)·연혁·세대수, "
        "가칭 용두7구역은 토지거래허가구역 지정·권리산정기준일, 가칭 용두8구역은 사업명(용두8 역세권)·면적"
        "(26,485.80㎡)·지번 범위·별칭 보강. 경계 도형은 손대지 않음(용두8은 좌표 있는 공식 도면이 없어 점 표시 유지)."
    ),
}


def _merge_alias(props, extra):
    alias = list(props.get("alias") or [])
    for a in extra:
        if a not in alias and a != props.get("name"):
            alias.append(a)
    props["alias"] = alias


def _force_alias(props, extra):
    """이름과 같은 표기라도 별칭 목록에 남긴다(검색·표시에서 이름과 별칭을 함께 본다)."""
    alias = list(props.get("alias") or [])
    for a in extra:
        if a not in alias:
            alias.append(a)
    props["alias"] = alias


def _merge_sources(props, extra):
    src = list(props.get("sources") or [])
    for s in extra:
        if not any(x.get("url") == s["url"] for x in src):
            src.append(s)
    props["sources"] = src


def _append_note(props, marker, block):
    """기존 설명을 살리고 표식 뒤 보강 문단만 새로 쓴다(멱등)."""
    cur = props.get("note") or ""
    i = cur.find(marker)
    base = cur[:i].rstrip() if i >= 0 else cur.rstrip()
    props["note"] = (base + " " + block).strip() if base else block


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "public", "data", "zones.geojson")
    with open(path, encoding="utf-8") as fp:
        fc = json.load(fp)

    by_id = {f["properties"].get("id"): f for f in fc["features"]}
    for zid in (Y3_ID, Y7_ID, Y8_ID):
        if zid not in by_id:
            raise SystemExit(f"zone not found: {zid}")

    before = {zid: dict(by_id[zid]["properties"]) for zid in (Y3_ID, Y7_ID, Y8_ID)}

    # 1) 용두3구역 — 명칭·단계 상향, 연혁·세대수·별칭 보강
    p = by_id[Y3_ID]["properties"]
    p["name"] = Y3_NAME
    p["stage"] = Y3_STAGE
    p["selectedAt"] = "2022-12-29"
    p["areaNote"] = Y3_AREA_NOTE
    p["boundaryNote"] = Y3_BOUNDARY_NOTE
    p["note"] = Y3_NOTE
    p["asOf"] = AS_OF
    _force_alias(p, Y3_ALIASES)
    _merge_sources(p, Y3_SOURCES)

    # 2) 가칭 용두7구역 — 기존 설명 유지 + 11월 지정·고시 보강
    p = by_id[Y7_ID]["properties"]
    p["selectedAt"] = "2026-11-13"
    p["asOf"] = AS_OF
    _append_note(p, Y7_MARK, Y7_ADD_NOTE)
    area_note = p.get("areaNote") or ""
    add_area = "서울시 토지거래허가구역 공고 75,729㎡(2026-11-19)"
    if "75,729" not in area_note:
        p["areaNote"] = (area_note + " / " + add_area).strip(" /") if area_note else add_area
    _merge_alias(p, Y7_ALIASES)
    _merge_sources(p, Y7_SOURCES_ADD)

    # 3) 가칭 용두8구역 — 이름·면적·별칭·지번 범위 보강 (경계는 미고시 유지)
    p = by_id[Y8_ID]["properties"]
    p["name"] = Y8_NAME
    p["stage"] = Y8_STAGE
    p["area"] = Y8_AREA
    p["areaNote"] = Y8_AREA_NOTE
    p["boundaryNote"] = Y8_BOUNDARY_NOTE
    p["note"] = Y8_NOTE
    p["geom"] = "미고시"
    p["sourceId"] = "동대문구 고시 제2025-209호"
    p["asOf"] = AS_OF
    _merge_alias(p, Y8_ALIASES)
    _merge_sources(p, Y8_SOURCES)

    meta = fc.setdefault("metadata", {})
    meta[METADATA_KEY] = METADATA
    meta["count"] = len(fc["features"])

    changed = any(before[zid] != by_id[zid]["properties"] for zid in before)
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, separators=(",", ":"))

    for zid in (Y3_ID, Y7_ID, Y8_ID):
        a, b = before[zid], by_id[zid]["properties"]
        print(f"=== {zid}")
        for k in ("name", "stage", "area", "selectedAt", "alias"):
            print(f"  [before] {k}: {a.get(k)}")
            print(f"  [after ] {k}: {b.get(k)}")
        print(f"  note: {len(a.get('note') or '')}자 → {len(b.get('note') or '')}자")
        print(f"  sources: {len(a.get('sources') or [])}건 → {len(b.get('sources') or [])}건")
    print("changed" if changed else "unchanged (already applied)")


if __name__ == "__main__":
    main()
