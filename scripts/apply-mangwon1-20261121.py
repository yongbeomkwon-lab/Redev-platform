#!/usr/bin/env python3
"""
망원1구역(망원동 416-53번지 일대) 정비구역 지정(안) 공람 반영
 — 마포구 공고 제2026-1826호(2026-11-19) 공람공고 내용을 zones.geojson 에 얹는다.

원칙:
  · 값은 공식 공고(도시공간포털 열람공고·토지이음)와 서울시 보도자료·언론 보도로 확인한 것만 적는다.
  · 경계(도형)는 손대지 않는다 — 서울플랜+ UQ120 실경계(2026-09-10)를 그대로 두고,
    공람안 구역면적과의 차이를 boundaryNote 에 적는다(없는 경계를 지어내지 않는다).
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용:
  python3 scripts/apply-mangwon1-20261121.py
"""
import json
import os

ZONE_ID = "11000UQ120PS202407010945"
AS_OF = "2026-11-21"

AREA = 68878.7
AREA_NOTE = (
    "정비구역 68,878.7㎡(마포구 공고 제2026-1826호 공람안) · 1,548세대(임대 238) · "
    "지하 2층~지상 최고 29층·18개동 · 용적률 250%(법적상한, 계획 249.88%) · 건폐율 18.5% · "
    "추정비례율 103.23%"
)

BOUNDARY_NOTE = (
    "서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계 — 공람안 구역면적 68,878.7㎡ 대비 도형 78,600㎡"
    "(+12.4%). 공람안은 포은로(망리단길) 상가 밀집 구간을 구역에서 뺀 것으로 보여(서울시 보도자료 "
    "‘대상지에 포함되지 않은 동측 포은로 상권’), 지도 경계 동측은 실제 정비구역보다 넓게 보일 수 있다. "
    "정비구역 지정 고시·지형도면이 나오면 경계를 다시 반영해야 한다."
)

NOTE = (
    "망원동 416-53번지 일대 주택정비형 재개발사업(신속통합기획)입니다. 2021~2022년 민간재개발 후보지 "
    "공모에서 잇따라 탈락한 뒤 2023-11-22 신속통합기획 후보지로 조건부 선정됐고(망리단길·망원시장 상권 "
    "반대), 2025-12-16 재자문에서 조건부 동의, 2026-10-07 가이드라인 통보, 2026-10-22 추정분담금 검증을 "
    "거쳐 2026-11-19 마포구 공고 제2026-1826호로 정비계획 수립 및 정비구역 지정(안) 주민공람이 나왔습니다"
    "(공람 2026-11-19~2026-12-03, 의견서는 마포구청 주택과(02-3153-9335)에 서면·온라인 제출). "
    "공람안 기준 정비구역 68,878.7㎡에 지하 2층~지상 최고 29층 18개동 1,548세대(임대 238세대)를 짓고, "
    "전용면적별로 39㎡ 147·49㎡ 147·59㎡ 679·84㎡ 521·110㎡ 54세대입니다. 제2종일반주거지역(7층 이하) "
    "57,456.8㎡를 층수 제한 없는 제2종일반주거지역으로 올려 용적률 250%(법적상한, 계획 249.88%)·건폐율 "
    "18.5%를 적용했습니다. 단지 남측에 약 4,800㎡ 소공원과 그 아래 약 140면 공영주차장을 두고, "
    "망원로 4길 등 주변도로를 15~18m로 넓히며 망원역~망원시장~한강을 잇는 공공보행통로를 냅니다. "
    "사업성은 빠듯합니다 — 토지등소유자가 1,177명인데 현재 구역 내 거주 1,789세대보다 241세대 적은 "
    "1,548세대가 공급되고, 일반분양은 133세대(분양주택의 12.8%)뿐입니다. 사업성 보정계수도 0.97로 "
    "용적률 완화를 받지 못했습니다. 추정비례율 103.23%(총수입 1조8,786.9억·총지출 9,514.5억, 공사비 "
    "3.3㎡당 900만원 기준)이고, 조합원 분양가 추정액은 39㎡ 7억3,300만·59㎡ 11억9,600만·84㎡ 15억800만·"
    "110㎡ 17억7,700만원입니다(종전자산 4억원 소유자가 84㎡를 받으면 분담금 약 10억9,500만원). "
    "공사비가 10% 오르고 분양가가 10% 내리면 비례율은 74.34%까지 낮아집니다. 목표연도는 2033년이며, "
    "공람이 끝나면 구의회 의견청취·도시계획위원회 심의를 거쳐 정비구역 지정 고시로 이어집니다."
)

ALIASES = [
    "망원1구역",
    "망원1 구역",
    "망원동 416-53",
    "망원동 416-53번지 일대",
    "망원동416-53",
    "망원1 신속통합기획",
    "망원동 416-53 일대 주택정비형 재개발사업",
]

SOURCES = [
    {
        "label": "마포구 공고 제2026-1826호 — 망원동 416-53번지 일대 주택정비형 재개발사업 정비계획 수립 및 정비구역 지정(안) 공람공고(2026-11-19, 공람 11-19~12-03)",
        "url": "https://urban.seoul.go.kr/view/html/PMNU4010200001?announceCode=11440ANN202611180001",
    },
    {
        "label": "토지이음 주민의견청취 공람 — 마포구 공고 제2026-1826호(청취기간 2026-11-19~12-03)",
        "url": "https://www.eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp?chrgorg=&enddt=&gosino=&mobile_yn=&pageNo=&selSggCd=&select2=&select_3=&seq=6131&startdt=",
    },
    {
        "label": "서울시 보도자료 — 망원동 416-53 신통기획 확정, 골목상권과 어우러진 생활밀착 주거단지 조성(2026-10-01)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=467450",
    },
    {
        "label": "도시팩트 — 망리단길 갈등 넘은 망원1구역, 정비구역 지정 공람… '사업성' 숙제 남았다(2026-11-20)",
        "url": "https://cityfact.co.kr/news/252",
    },
    {
        "label": "위클리한국주택경제신문 — 망원동 416-53번지 일대, 최고 29층 1,548세대로 재개발(2026-11-20)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=69797",
    },
]

METADATA_KEY = "mangwon1"
METADATA = {
    "asOf": AS_OF,
    "zoneId": ZONE_ID,
    "stage": "정비구역지정(공람)",
    "note": "마포구 공고 제2026-1826호(2026-11-19) 공람안 반영 — 단계 상향·면적/세대수/별칭/설명 보강. 경계(도형)는 서울플랜+ 실경계 유지.",
}


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "public", "data", "zones.geojson")
    with open(path, encoding="utf-8") as fp:
        fc = json.load(fp)

    target = None
    for f in fc["features"]:
        if f["properties"].get("id") == ZONE_ID:
            target = f
            break
    if target is None:
        raise SystemExit(f"zone not found: {ZONE_ID}")

    before = dict(target["properties"])
    p = target["properties"]

    p["stage"] = "정비구역지정(공람)"
    p["area"] = AREA
    p["areaNote"] = AREA_NOTE
    p["boundaryNote"] = BOUNDARY_NOTE
    p["note"] = NOTE
    p["asOf"] = AS_OF
    p["sources"] = SOURCES
    # 기존 별칭이 있으면 살리고 새 별칭만 덧붙인다(중복 제거·순서 유지)
    alias = list(p.get("alias") or [])
    for a in ALIASES:
        if a not in alias:
            alias.append(a)
    p["alias"] = alias

    meta = fc.setdefault("metadata", {})
    meta[METADATA_KEY] = METADATA
    meta["count"] = len(fc["features"])

    changed = before != p
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, separators=(",", ":"))

    print("[before]")
    for k in ("name", "stage", "area", "alias", "areaNote", "note", "boundaryNote", "asOf"):
        v = before.get(k)
        if isinstance(v, str) and len(v) > 60:
            v = v[:60] + "…"
        print(f"  {k}: {v}")
    print("[after]")
    for k in ("name", "stage", "area", "alias", "areaNote", "note", "boundaryNote", "asOf"):
        v = p.get(k)
        if isinstance(v, str) and len(v) > 60:
            v = v[:60] + "…"
        print(f"  {k}: {v}")
    print("changed" if changed else "unchanged (already applied)")


if __name__ == "__main__":
    main()
