#!/usr/bin/env python3
"""
가리봉2구역(가리봉동 87-177번지 일대) — 신통기획 유형 표기·세대수/사업개요 보강

  · 서울시 고시 제2025-128호(2025-03-13 정비구역 지정)·정비사업 정보몽땅·조합 시공자 입찰공고로 확인한 값만 적는다.
  · stage(조합설립인가)·area(41,515㎡)·경계(도형)는 손대지 않는다.
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용: python3 scripts/apply-garibong2-20261121.py
"""
import json
import os

ZONE_ID = "11000UQ120PS202505317005"
AS_OF = "2026-11-21"

AREA_NOTE = (
    "정비구역 41,515㎡(서울시 고시 제2025-128호) · 1,214세대(임대 283) · 지하 5층~지상 최고 39층·12개동 · "
    "용적률 273.7%(예정법적상한 347.15%)·건폐율 39.48% · 토지등소유자 382명 · 일반분양 549세대"
)

NOTE = (
    "구로구 가리봉동 87-177번지 일대 주택정비형 재개발사업입니다. 2003년 가리봉 재정비촉진지구(뉴타운)로 "
    "지정됐다가 2014년 해제되고 도시재생활성화구역으로 남아 있던 곳으로, 2021-12-29 신속통합기획 후보지로 "
    "선정돼 2023-06-22 가이드라인을 확정했습니다. 2024-09-11 도시계획위원회 수권분과위원회 심의(수정가결)를 "
    "거쳐 2025-03-13 서울시 고시 제2025-128호로 정비계획 결정·정비구역 지정(지형도면 고시)됐고, 2025-10-01 "
    "추진위원회 승인, 2026-05-28 조합설립인가를 받았습니다. 구역면적 41,515㎡에 지하 5층~지상 최고 39층 "
    "12개동 1,214세대(임대 283세대)를 짓습니다. G밸리(구로·가산디지털단지) 사이 배후 주거지라 준주거지역 "
    "16,582㎡·제3종일반주거지역 18,500㎡로 종상향했고, 7호선 지하 통과구간 상부에 폭 12m 공공보행통로와 "
    "보행육교를 내 구로·가산디지털단지를 잇습니다. 우마길 상인 재정착을 위한 공공임대상가, 공원 2개소, "
    "공공청사·공영주차장도 함께 짓습니다. 정비계획 용적률 273.7%·건폐율 39.48%, 사업성 보정계수 1.48이 "
    "적용됐고, 토지등소유자는 382명입니다. 시공사는 1차 입찰이 무응찰로 유찰돼 2026-10-19 2차 입찰공고"
    "(조합 공고 제2026-31호)를 냈습니다 — 공사비 예정가 5,312억8,900만원(3.3㎡당 850만원), 입찰보증금 200억원, "
    "2026-10-27 2차 현장설명회에는 롯데건설만 참석했고 입찰 마감은 2026-12-14 14시입니다."
)

ALIASES = [
    "가리봉2",
    "가리봉 2구역",
    "가리봉동 87-177",
    "가리봉동 87-177번지 일대",
    "가리봉2구역 주택정비형 재개발사업",
]

SOURCES = [
    {
        "label": "서울특별시 고시 제2025-128호 — 가리봉2구역 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정, 지구단위계획 결정 및 지형도면 고시(2025-03-13, 구역면적 41,515㎡)",
        "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11530NTC202501060007/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C_%EC%A0%9C2025-128%ED%98%B8_%EA%B3%A0%EC%8B%9C.pdf",
    },
    {
        "label": "정비사업 정보몽땅 — 가리봉2구역 주택정비형 재개발사업 사업개요(구역면적 41,515㎡·토지등소유자 382명·용적률 273.7%)",
        "url": "https://cleanup.seoul.go.kr/cafe/mastr-cleanup-bsnsSumry/execute.do?cafeId=530900001023H76&div=sumry&stepSeCode=103",
    },
    {
        "label": "서울시 보도자료 — 제9차 도시계획위원회 신속통합기획 정비사업 등 수권분과위원회 개최결과, 가리봉2구역 수정가결(2024-09-12)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=419184",
    },
    {
        "label": "가리봉2구역재개발정비사업조합 공고 제2026-31호 — 시공자 선정 (재)입찰 공고(2026-10-19, 입찰 마감 2026-12-14, 공사비 예정가 5,312억8,900만원)",
        "url": "https://marubiz.com/notices/32287",
    },
    {
        "label": "굿모닝경제 — 가리봉2 재개발 2차 현장설명회, 롯데건설만 참석…12월14일 재입찰 마감(2026-10-28)",
        "url": "https://www.goodkyung.com/news/articleView.html?idxno=292830",
    },
]

METADATA_KEY = "garibong2"
METADATA = {
    "asOf": AS_OF,
    "zoneId": ZONE_ID,
    "stage": "조합설립인가",
    "note": "신속통합기획 재개발 구역으로 유형 표기 정정(일반재개발→신통기획) + 1,214세대·39층 12개동·용적률 273.7%·조합설립인가(2026-05-28)·시공사 2차 입찰(2026-12-14 마감) 반영. 경계·면적·단계는 유지.",
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

    p = target["properties"]
    before = {k: p.get(k) for k in ("name", "type", "kind", "stage", "area", "geom", "alias", "note")}

    p["type"] = "신통기획"
    p["kind"] = "신속통합기획"
    p["areaNote"] = AREA_NOTE
    p["note"] = NOTE
    p["asOf"] = AS_OF
    p["sources"] = SOURCES
    alias = list(p.get("alias") or [])
    for a in ALIASES:
        if a not in alias:
            alias.append(a)
    p["alias"] = alias

    meta = fc.setdefault("metadata", {})
    meta[METADATA_KEY] = METADATA
    meta["count"] = len(fc["features"])

    changed = before != {k: p.get(k) for k in before}
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, separators=(",", ":"))

    print("[before]")
    for k, v in before.items():
        if isinstance(v, str) and len(v) > 60:
            v = v[:60] + "…"
        print(f"  {k}: {v}")
    print("[after]")
    for k in before:
        v = p.get(k)
        if isinstance(v, str) and len(v) > 60:
            v = v[:60] + "…"
        print(f"  {k}: {v}")
    print("changed" if changed else "unchanged (already applied)")


if __name__ == "__main__":
    main()
