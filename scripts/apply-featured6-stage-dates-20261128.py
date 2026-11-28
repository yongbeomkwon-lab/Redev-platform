#!/usr/bin/env python3
"""리디브 — 대표 구역 6곳 「사업 진행단계」 카드용 단계별 날짜 보강 (2026-11-28)

대표 구역 6곳(신림1·반포주공1단지 3주구·노량진1·한남뉴타운·성수전략2·북아현 주공1차)의
서울시 레코드에 단계별 공식 날짜(stageDates)가 비어 있는 두 곳을 채운다.

  · 북아현1-1구역(서대문구 북아현동 1-954, 77,174㎡) — 정비사업 정보몽땅
    「북아현 1-1 재정비촉진구역 주택재개발 정비사업조합」 추진경과 원문 그대로
      추진위원회 승인 2005-03-19 · 정비구역(재정비촉진구역) 지정 2008-02-05(서울시 고시 제2008-38호)
      사업시행인가 2009-06-23 · 조합설립인가 2009-06-24(서대문구 고시 제2009-56호)
      관리처분계획인가 2011-06-29(서대문구 고시 제2011-41호) · 이주·철거 2011-08-12
      착공신고 2017-12-29 · 준공인가 2022-04-15(사용허가 2020-08-04)
  · 한남재정비촉진지구 — 재정비촉진지구 지정 고시 2006-10-19(서울특별시고시 제2006-357호).
    이 레코드의 rightsNote 에 이미 적혀 있는 값이다(지구 단위 레코드).

⚠️ public/data/zones.geojson · zone-index.json 은 **재생성하지 않는다**.
   그 두 파일은 다른 작업(경계·공매 등)의 결과물이라 손대지 말라는 지시가 있었고,
   export-geojson.mjs 는 JSON 전체를 다시 쓰기 때문에 그 사이 들어간 변경을 덮을 수 있다.
   → 화면은 src/data/featured-stage-dates.ts 의 같은 값(보강)을 얹어 읽으므로 지금 배포본에서도
     카드가 채워져 보인다. 다음에 `npm run geojson` 을 돌리면 정본과 배포본이 저절로 같아진다.

실행: python3 scripts/apply-featured6-stage-dates-20261128.py [--check]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
SUPPLEMENT = ROOT / "src" / "data" / "featured-stage-dates.ts"

AS_OF = "2026-11-23"  # 정보몽땅 추진경과 수집일

BUKAHYEON = {
    "committee": "2005-03-19",
    "district": "2008-02-05",
    "implement": "2009-06-23",
    "union": "2009-06-24",
    "disposition": "2011-06-29",
    "demolish": "2011-08-12",
    "construct": "2017-12-29",
    "complete": "2022-04-15",
}
HANNAM = {"district": "2006-10-19"}

TARGETS = {"bukahyeon": BUKAHYEON, "hannam": HANNAM}


def main() -> int:
    check = "--check" in sys.argv
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z.get("id"): z for z in zones}

    changes = []
    for zid, dates in TARGETS.items():
        z = by_id.get(zid)
        if not z:
            print(f"!! 대표 구역 레코드 없음: {zid}")
            return 1
        before = dict(z.get("stageDates") or {})
        merged = {**dates, **before}  # 이미 있는 값이 있으면 그 값을 둔다(공식 값 우선)
        added = {k: v for k, v in merged.items() if before.get(k) != v}
        if added:
            z["stageDates"] = merged
            z["datesAsOf"] = z.get("datesAsOf") or AS_OF
            changes.append((zid, z["name"], added))

    if not changes:
        print("이미 반영되어 있습니다 — 바꿀 것이 없습니다.")
        return 0

    for zid, name, added in changes:
        print(f"· {zid} {name}: " + ", ".join(f"{k}={v}" for k, v in sorted(added.items(), key=lambda kv: kv[1])))

    if check:
        print("(--check: 파일을 쓰지 않았습니다)")
        return 0

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {SOURCE.relative_to(ROOT)}")
    print(
        "public/data/zones.geojson·zone-index.json 은 재생성하지 않았습니다 — 화면은 "
        f"{SUPPLEMENT.relative_to(ROOT)} 의 보강값으로 읽습니다."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
