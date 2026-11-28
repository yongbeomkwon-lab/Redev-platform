#!/usr/bin/env python3
"""공급 전망(supply-forecast.json)의 가재울7구역 세대수 보정 — 2026-11-28

종전 값 1,621세대(분양 1,426 + 임대 195)는 **임대를 두 번 센 값**이다.
사업시행인가 고시의 1,426세대에는 임대 195세대가 이미 포함돼 있고,
서울시 통합심의로 확정된 규모는 1,435세대(분양 1,236 = 조합원 ≈662 + 일반 ≈574, 임대 199)다.

그래서 이 구역 행만 1,435(분양 1,236·임대 199)로 바꾸고,
그 구역이 들어 있는 2032년 합계(서대문구·전체)에서 차액 186세대를 덜어 낸다.
2026~2031년 합계(district.total)에는 이 구역이 없어 건드리지 않는다.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "public/data/supply-forecast.json"
ZONE_ID = "11410UQ120PS202604010002"
NEW = {
    "households": 1435,
    "sale": 1236,
    "rental": 199,
    "source": "정비사업 정보몽땅 사업개요·서울시 통합심의 확정(2025-12-18) 1,435세대",
}


def main() -> int:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    district = next(d for d in data["districts"] if d["gu"] == "서대문구")
    rows = district["beyondZones"]["y2032"]
    row = next(r for r in rows if r["id"] == ZONE_ID)
    delta = NEW["households"] - row["households"]
    print("before:", json.dumps(row, ensure_ascii=False))
    row.update(NEW)

    district["beyond"]["y2032"] += delta
    data["meta"]["beyond"]["y2032"] += delta
    assert district["beyond"]["y2032"] == sum(z["households"] for z in rows), "서대문구 2032 합계 불일치"
    assert data["meta"]["beyond"]["y2032"] == sum(
        d["beyond"]["y2032"] for d in data["districts"]
    ), "전체 2032 합계 불일치"
    assert data["meta"]["totalHouseholds"] == sum(d["total"] for d in data["districts"])
    assert data["meta"]["siteCount"] == sum(d.get("zoneCount", 0) for d in data["districts"])

    PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("after :", json.dumps(row, ensure_ascii=False))
    print(f"delta {delta:+d} · 서대문구 2032 {district['beyond']['y2032']:,} · 전체 2032 {data['meta']['beyond']['y2032']:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
