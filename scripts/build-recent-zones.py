#!/usr/bin/env python3
"""첫 화면 「⚡ 최근 변동 구역」 목록 만들기 — public/data/recent-zones.json

무엇을 담나
  · `zones.geojson` 의 `asOf`(최근 반영일)가 있는 구역을 최신순으로 담는다.
  · asOf 가 없는 구역 중에서도 최근 작업으로 단계가 바뀐 곳(장위11·삼각맨션 등)은
    아래 CURATED 에 날짜와 한 줄 설명을 직접 적어 넣는다 — 화면에 "무엇이 바뀌었는지"가 보여야 한다.
  · 화면(ZoneExplorer)은 앞에서 6곳만 쓴다. 목록은 새 반영이 생길 때 이 스크립트를 다시 돌린다.

  python3 scripts/build-recent-zones.py
"""
import json
import os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES = os.path.join(ROOT, "public", "data", "zones.geojson")
OUT = os.path.join(ROOT, "public", "data", "recent-zones.json")

# asOf 가 없는 구역의 최근 변경 — 화면에 보일 한 줄과 날짜를 직접 적는다(근거: 해당 반영 커밋·공고)
CURATED = [
    {
        "name": "장위11-1구역",
        "asOf": "2026-11-21",
        "label": "사업시행인가",
        "note": "장위11 일대 가로주택·재개발 단계 정리(사업시행자 지정 반영)",
    },
    {
        "name": "삼각맨션",
        "asOf": "2026-11-18",
        "label": "정비구역 지정(2026-05-28)",
        "note": "한강로1가 231-23 일원 도시정비형 재개발 구역계 반영",
    },
    # 2026-11-22 08:30 모니터링 승인 3건 — 고시일은 asOf(데이터 기준일)로 두고, 목록에는 반영일·한 줄 설명을 보인다
    {
        "name": "신풍역 일대",
        "asOf": "2026-11-22",
        "label": "추진위구성(2026-11-19 고시)",
        "note": "신길동 3922번지 일대 — 영등포구 고시 제2026-193호로 조합설립추진위원회 승인(34,850.1㎡·최고 35층·990세대 내외)",
    },
    {
        "name": "삼선3마을",
        "asOf": "2026-11-22",
        "label": "기획완료(2026-11-11 확정)",
        "note": "삼선동1가 277 일대 — 서울시 신속통합기획 확정(최고 18층·870세대 내외·용적률 192%)",
    },
    {
        "name": "대림역세권",
        "asOf": "2026-11-22",
        "label": "구역지정(2026-11-19 고시)",
        "note": "서울시 고시 제2026-648호 정비구역 지정·지형도면 고시(18,340.4㎡·628세대·추정비례율 96.82%)",
    },
    # 2026-11-22 사당동 300 모아타운 — 사업 단계 변화가 아니라 '구역계 도면 반영'이라 한 줄을 직접 적는다
    {
        "name": "사당동 300 모아타운",
        "asOf": "2026-11-22",
        "label": "구역계 도면 반영(2024-06-21 공고)",
        "note": "사당동 300번지 일대 — 동작구 구역 공개 도면의 구역계를 다각형으로 반영(계측 39,541㎡·대상지 선정 2024-11-15)",
    },
    # 2026-11-22 도선동 332 일대 — 공개 구역계가 없는 추진준비 구역이라 연속지적도 지번선으로 경계를 만듦
    {
        "name": "(가)도선동 332 민간도심복합",
        "asOf": "2026-11-22",
        "label": "신규 등록(가상경계)",
        "note": "도선동 332·314·333-1·홍익동 346 일대 — 민간도심복합(주거중심형) 추진준비, 무학로·마장로·왕십리로26길·무학로2길 필지선 경계(계측 57,726㎡·공고 58,713.7㎡)",
    },
    # 2026-11-22 사당동 77-24 일대(사당19구역) — 구역계 도면 반영
    {
        "name": "사당동 77-24 일대",
        "asOf": "2026-11-22",
        "label": "구역계 도면 반영(2025-05-27 공고)",
        "note": "사당19구역 — 동작구 구역 공개 도면의 구역계를 다각형으로 반영(계측 25,191㎡·후보지 선정 2026-05-06)",
    },
    # 2026-11-22 미고시 1차 보강 — 서울시보 고시 지형도면 구역계 반영
    {
        "name": "아현1구역",
        "asOf": "2026-11-22",
        "label": "정비구역 지정·고시(2026-05-28)",
        "note": "아현동 699 일대 — 고시 제2026-304호 지형도면 구역계 반영(106,012.9㎡·공공재개발·계측 +1.1%)",
    },
    {
        "name": "응암동 101번지",
        "asOf": "2026-11-22",
        "label": "구역계 도면 반영(2026-03-26 고시)",
        "note": "은평구 응암동 101 일대 — 고시 제2026-157호 지형도면 구역계 반영(38,758㎡·계측 +1.2%)",
    },
    {
        "name": "녹번동 125-1 (불광역세권 장기전세)",
        "asOf": "2026-11-22",
        "label": "정비구역 지정·고시(2026-11-19)",
        "note": "불광역세권(녹번동) — 고시 제2026-643호로 지정(129,600.8㎡)·도면 축척 불일치로 경계는 미반영",
    },
    # 2026-11-22 송파구 삼전동·석촌고분 민간도심복합(주거중심형) 5곳 — 고시 구역계가 없어 가상경계로 신규 등록
    {
        "name": "(가)삼전동1",
        "asOf": "2026-11-22",
        "label": "추진준비(민도복·삼전동 64-1 1구역)",
        "note": "삼전동 64-1 일대 3개 구역 중 1구역 — 필지·도로 경계 기준 가상경계 61,203㎡ 반영(공개 60,199㎡·대신자산신탁 예비신탁사)",
    },
    {
        "name": "(가)삼전동2",
        "asOf": "2026-11-22",
        "label": "추진준비(민도복·삼전동 64-1 2구역)",
        "note": "삼전동 64-1 일대 3개 구역 중 2구역 — 가상경계 59,948㎡ 반영(공개 59,028㎡·삼전근린공원·삼전초 제외)",
    },
    {
        "name": "(가)삼전동3",
        "asOf": "2026-11-22",
        "label": "추진준비(민도복·삼전동 64-1 3구역)",
        "note": "삼전동 64-1 일대 3개 구역 중 3구역 — 가상경계 58,181㎡ 반영(공개 59,602㎡·백제고분로 접도)",
    },
    {
        "name": "(가)석촌고분1",
        "asOf": "2026-11-22",
        "label": "추진준비(민도복·석촌동 232 1구역)",
        "note": "석촌동 232 일대 1·2구역 중 1구역 — 가상경계 37,601㎡ 반영(공개 38,073㎡·한국투자부동산신탁 MOU)",
    },
    {
        "name": "(가)석촌고분2",
        "asOf": "2026-11-22",
        "label": "추진준비(민도복·석촌동 232 2구역)",
        "note": "석촌동 232 일대 1·2구역 중 2구역 — 가상경계 45,631㎡ 반영(공개 45,449㎡·합계 2,884세대)",
    },
]


def centroid(geom):
    if not geom:
        return None
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    xs, ys = [], []
    for p in polys:
        for x, y in p[0]:
            xs.append(x)
            ys.append(y)
    if not xs:
        return None
    return [round(sum(ys) / len(ys), 6), round(sum(xs) / len(xs), 6)]


def main():
    d = json.load(open(ZONES, encoding="utf-8"))
    by_name = {f["properties"]["name"]: f for f in d["features"]}
    rows = []
    seen = set()
    for f in d["features"]:
        p = f["properties"]
        asof = p.get("asOf")
        if not asof:
            continue
        rows.append(
            {
                "id": p["id"],
                "name": p["name"],
                "gu": p.get("gu"),
                "type": p.get("type"),
                "stage": p.get("stage"),
                "asOf": asof,
                "label": p.get("stage"),
                "note": (p.get("note") or "")[:120],
                "center": p.get("center") or centroid(f.get("geometry")),
            }
        )
        seen.add(p["name"])
    for c in CURATED:
        f = by_name.get(c["name"])
        if not f:
            continue
        p = f["properties"]
        if c["name"] in seen:
            # asOf 가 있어 이미 자동으로 들어온 구역 — 반영일·한 줄 설명만 사람이 적은 값으로 바꾼다
            for r in rows:
                if r["name"] == c["name"]:
                    r["asOf"] = c["asOf"]
                    r["label"] = c["label"]
                    r["note"] = c["note"]
            continue
        rows.append(
            {
                "id": p["id"],
                "name": p["name"],
                "gu": p.get("gu"),
                "type": p.get("type"),
                "stage": p.get("stage"),
                "asOf": c["asOf"],
                "label": c["label"],
                "note": c["note"],
                "center": p.get("center") or centroid(f.get("geometry")),
            }
        )
    # 같은 날짜(데이터 기준일) 안에서는 사람이 적은 CURATED(무엇이 바뀌었는지 한 줄로 남긴 구역)를 앞에 두고,
    # CURATED 안에서도 뒤에 적은(= 최근에 추가한) 항목이 먼저 오도록 순서를 쓴다.
    cur_order = {c["name"]: i for i, c in enumerate(CURATED)}
    rows.sort(
        key=lambda r: (
            r["asOf"],
            r["name"] in cur_order,
            cur_order.get(r["name"], -1),
            r["name"],
        ),
        reverse=True,
    )
    rows = [r for r in rows if r["center"]][:20]
    payload = {"generatedAt": date.today().isoformat(), "zones": rows}
    txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(txt)
    print(f"{os.path.relpath(OUT, ROOT)} · {len(rows)}곳 · {len(txt.encode()) / 1024:.0f}KB")
    for r in rows[:8]:
        print(" ", r["asOf"], r["name"], "|", r["label"])


if __name__ == "__main__":
    main()
