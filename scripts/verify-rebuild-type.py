#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# 사업유형 검증 — 재건축 구역이 '재개발'로 표시되지 않는지 데이터로 확인한다
#
#   실행: python3 scripts/verify-rebuild-type.py
#   통과 기준
#     1) 소분류(kind)가 재건축(단독·공동)인 구역은 모두 사업유형 '재건축'
#     2) 강남구에 사업유형 '일반재개발'로 남은 재건축 단지 0곳
#     3) 강남구 대표 재건축 단지가 목록에 '재건축'으로 있다
#     4) 커뮤니티 색인(zone-index.json)도 같은 사업유형을 쓴다
# ─────────────────────────────────────────────────────────────────────────────
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / "public" / "data" / "zones.geojson"
IDX = ROOT / "public" / "data" / "zone-index.json"

# 강남구 대표 재건축 단지 — 이름 일부로 확인한다
GANGNAM_SAMPLES = [
    "은마아파트",
    "압구정아파트지구특별계획구역1",
    "압구정아파트지구특별계획구역3",
    "개포주공5단지",
    "개포주공6,7단지",
    "대치 미도",
    "도곡개포한신",
    "청담삼익아파트",
]


def main() -> int:
    geo = json.loads(GEO.read_text(encoding="utf-8"))
    idx = json.loads(IDX.read_text(encoding="utf-8"))
    feats = [f["properties"] for f in geo["features"]]
    idx_by_id = {z["id"]: z for z in idx["zones"]}

    fails: list[str] = []

    rebuild_kind = [p for p in feats if (p.get("kind") or "").startswith("재건축")]
    wrong = [p for p in rebuild_kind if p.get("type") != "재건축"]
    if wrong:
        fails.append(f"소분류 재건축인데 사업유형이 재건축이 아닌 구역 {len(wrong)}곳: "
                     + ", ".join(f"{p['gu']} {p['name']}({p['type']})" for p in wrong[:8]))

    gangnam = [p for p in feats if p.get("gu") == "강남구"]
    gn_rebuild = [p for p in gangnam if p.get("type") == "재건축"]
    gn_left = [p for p in gangnam if p.get("type") == "일반재개발"]
    if gn_left:
        fails.append("강남구에 '재개발'로 남은 구역: "
                     + ", ".join(p["name"] for p in gn_left))

    names = {p["name"]: p.get("type") for p in gangnam}
    missing = [n for n in GANGNAM_SAMPLES if names.get(n) != "재건축"]
    if missing:
        fails.append("강남구 대표 재건축 단지 확인 실패: " + ", ".join(missing))

    idx_mismatch = [
        p["name"] for p in rebuild_kind
        if p.get("id") in idx_by_id and idx_by_id[p["id"]]["type"] != p["type"]
    ]
    if idx_mismatch:
        fails.append("zone-index.json 사업유형 불일치: " + ", ".join(idx_mismatch[:8]))

    print(f"서울 전체 — 재건축 {sum(1 for p in feats if p.get('type') == '재건축')}곳 / "
          f"일반재개발 {sum(1 for p in feats if p.get('type') == '일반재개발')}곳")
    print(f"강남구 — 재건축 {len(gn_rebuild)}곳 / 일반재개발 {len(gn_left)}곳")
    by_gu = Counter(p["gu"] for p in feats if p.get("type") == "재건축")
    print("재건축 구역이 있는 구:", ", ".join(f"{g} {n}" for g, n in by_gu.most_common()))

    if fails:
        print("\n❌ 실패")
        for f in fails:
            print("  ·", f)
        return 1
    print("\n✅ 통과 — 재건축 구역이 모두 '재건축'으로 표시됩니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
