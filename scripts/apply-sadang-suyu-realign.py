#!/usr/bin/env python3
"""2026-11-18 (2차) — 사용자 지적 4건 중 확정분 반영.

1) (가칭)사당동 419 일대 민간도심복합 (dj-sadang-419-mdb)
   · 사용자가 보낸 「사업지 현황 분석」의 빨간 구역계(IMG_0235)를 그대로 옮겨 다시 그렸다.
     - IMG_0236(카카오 화면)을 카카오 POI 8곳 좌표로 지오레퍼런싱(RMS ≈5m)한 뒤,
       IMG_0235의 구역계 윤곽을 4개 지물(북쪽 꼭대기·이자카야 잔잔 남측·다이소 남측·이용재자동차서비스 북동)로
       정합(RMS 1.6m). 그 도형 면적 56,583㎡ = 자료 표기 "총 검토범위 56,477.0㎡"(0.2% 차).
     - 북서쪽 변은 **사당15구역(서울시 UQ120 실경계) 남동쪽 경계 정점으로 치환** → 겹침 0㎡, 틈 0m(공유 352m).
   · 기존 도형(35,688.1㎡)은 자료 안쪽을 세로선으로 임의 절단한 근사치여서 사당15구역과 20~90m 떨어졌다.
2) 강북 수유동 310-15 — 점선원(근사원)을 서울시고시 제2025-734호 지형도면의 구역계 다각형으로 교체.

사용: python3 scripts/apply-sadang-suyu-realign.py [--check]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "public" / "data" / "zones.geojson"
MLAT = 110540.0
MLNG = 111320.0 * math.cos(math.radians(37.478))


def ring_area_m2(ring):
    pts = [[(x - 126.977) * MLNG, (y - 37.478) * MLAT] for x, y in ring]
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def main() -> int:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    by = {f["properties"]["id"]: f for f in data["features"]}

    # ── 1) 사당동 419 ────────────────────────────────────────────
    sad = json.loads((ROOT / "scripts" / "data" / "official-sadang-419.json").read_text(encoding="utf-8"))
    f = by["dj-sadang-419-mdb"]
    ring = [[round(x, 6), round(y, 6)] for x, y in sad["ring"]]
    f["geometry"] = {"type": "Polygon", "coordinates": [ring]}
    p = f["properties"]
    p["area"] = 56477
    p["geom"] = "가상경계"
    p["center"] = [round(sum(y for _, y in ring) / len(ring), 6), round(sum(x for x, _ in ring) / len(ring), 6)]
    p["centerLabel"] = "사당로·남부순환로 사이 사당동 419 일대(사당역 서북쪽)"
    p["areaNote"] = (
        f"총 검토범위 56,477.0㎡(자료 표기) / 사업대상지 35,688.1㎡(약 10,796평, 자료 표기) — "
        f"지도 도형은 자료의 구역계(총 검토범위)를 따라 그려 실측 {ring_area_m2(ring):,.0f}㎡"
    )
    p["boundaryNote"] = (
        "사용자가 보낸 「사업지 현황 분석」 2장의 구역계를 옮긴 경계입니다. 카카오 지도 화면(IMG_0236)을 "
        "지물 8곳(산빛교회·삼성할인마트·정안사·다인공방·이자카야 잔잔·명객양꼬치·최윤정치과·황금종교회)의 "
        "카카오 좌표로 먼저 정합(잔차 약 5m)하고, 사업지 현황 분석의 구역계 윤곽을 4개 지물로 다시 "
        "정합(잔차 1.6m)했습니다. 북서쪽 변은 사당15구역(서울시 실경계) 남동쪽 경계와 정확히 붙도록 "
        "그 경계선으로 치환해 겹침 0㎡·틈 0m입니다. 자료 표기 사업대상지 35,688.1㎡는 이 구역계 안쪽 "
        "핵심부 면적입니다(리디브 지도는 자료의 구역계 전체를 그립니다). 공식 고시 전 단계여서 실제 "
        "구역계와는 ±10m 안팎 차이가 있을 수 있습니다."
    )
    p["note"] = (
        "사당역 서북쪽 사당동 419 일대(사당로·남부순환로 사이)에서 추진 중인 (가칭)민간도심복합개발사업입니다. "
        "제공 자료는 서울특별시 「도심 복합개발 지원에 관한 조례」(2026.1.5.) 준용 검토를 전제로 사업대상지 "
        "35,688.1㎡와 역세권 경계(350m·500m)를 표시하고 있습니다. 인접한 사당동 419-1 일대는 사당15구역"
        "(신속통합기획, 대상지 선정 추진중)으로 이미 따로 추진되고 있어 두 사업의 경계·추진 주체를 함께 "
        "확인해야 합니다. 고시된 구역계가 없는 추진준비 단계입니다."
    )
    print(f"[사당419] 도형 재정합 — {ring_area_m2(ring):,.0f}㎡ (표기 56,477㎡), 정점 {len(ring)}")

    # ── 2) 수유동 310-15 ─────────────────────────────────────────
    suyu = json.loads((ROOT / "scripts" / "data" / "official-suyu-310-15.json").read_text(encoding="utf-8"))
    f = by["gangbuk-suyu-310-15"]
    ring = [[round(x, 6), round(y, 6)] for x, y in suyu["ring"]]
    f["geometry"] = {"type": "Polygon", "coordinates": [ring]}
    p = f["properties"]
    p["area"] = 15944
    p["geom"] = "고시도면"
    p["boundaryApprox"] = False
    p["areaNote"] = "건축허가 제한면적 15,944㎡ — 서울특별시고시 제2025-734호(2025-12-26)"
    p["boundaryNote"] = (
        "서울시보 제4114호 41쪽 「강북구 수유동 310-15 일대」 지형도면의 구역계를 그대로 옮겼습니다. "
        "지번 6곳(310-6·348-8·340-9 등)의 카카오 지번 좌표로 정합(잔차 약 3m)했고, 도형 면적이 "
        "고시면적 15,944㎡와 일치합니다(면적 기준 배율 보정). 고시 도면은 인쇄 축척(1/1,000)과 달리 "
        "축소·회전돼 삽입돼 있어 배율은 고시면적으로 확정했습니다."
    )
    print(f"[수유동310-15] 근사원 → 고시 지형도면 다각형 {ring_area_m2(ring):,.0f}㎡, 정점 {len(ring)}")


    # ── 3) 광흥창역세권(신수동 301-1) — 점선원 → 고시 지형도면 다각형 ──
    gw = json.loads((ROOT / "scripts" / "data" / "official-gwangheungchang-301-1.json").read_text(encoding="utf-8"))
    f = by["mp-shinsu-301-1"]
    ring = [[round(x, 6), round(y, 6)] for x, y in gw["ring"]]
    f["geometry"] = {"type": "Polygon", "coordinates": [ring]}
    p = f["properties"]
    p["area"] = 15734.9
    p["geom"] = "고시도면"
    p["boundaryApprox"] = False
    p["boundaryNote"] = (
        "마포구 고시 제2025-125호(2025-07-08) 「개발행위허가 제한 및 지형도면 고시」 2쪽 지형도면의 "
        "개발행위허가 제한지역 구역계를 그대로 옮겼습니다. 지번 7곳(신수동 304·306·305-1·361-1·358 등)의 "
        "카카오 지번 좌표로 정합(잔차 약 7m)했고, 도형 면적은 고시면적 15,734.9㎡에 맞췄습니다. "
        "2026-10-22 서울시 고시 제2026-590호로 정비구역 지정·지형도면이 고시됐고, 지정면적도 15,734.9㎡로 같습니다."
    )
    print(f"[광흥창301-1] 점선원 → 고시 지형도면 다각형 {ring_area_m2(ring):,.0f}㎡, 정점 {len(ring)}")

    if "--check" in sys.argv:
        return 0
    data["metadata"]["sadang419Realign"] = {
        "asOf": "2026-11-18",
        "note": "사당동 419 — 자료의 구역계(총 검토범위 56,477.0㎡)로 재정합, 사당15구역 경계와 접합(겹침 0·틈 0). "
                "수유동 310-15·광흥창역세권(신수동 301-1) — 고시 지형도면 다각형으로 교체(점선원 제거).",
    }
    data["metadata"]["count"] = len(data["features"])
    PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("[완료] zones.geojson 반영")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
