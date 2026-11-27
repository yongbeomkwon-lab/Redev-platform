#!/usr/bin/env python3
"""리디브 — 성동·광진 9곳 2단계: 경계(연속지적도 필지정합) 반영 (2026-11-27)

`tmp/rings-seongdong-20261127.json`(fetch-parcels-seongdong-20261127.py rings 결과)을 읽어
  · 금남시장 · 금호현대 · 응봉대림1차 · 마장동 793-22 · 용답1 · 용답2 의 경계를 채우고
  · 군자동 349-8 / 350-18 중복 등록을 하나로 합친다.

군자동은 필지 조립 대신 서울시 UQ120 공식 도형(이미 8,713㎡ 구역을 감싸고 있음)을 그대로 쓴다 —
서울시 데이터가 350-18 이름으로 같은 구역을 들고 있어, 349-8 이름·별칭으로 합친다.

실행: python3 scripts/apply-seongdong-boundaries-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
RINGS = ROOT / "tmp" / "rings-seongdong-20261127.json"
AS_OF = "2026-11-27"
META_KEY = "seongdongGwangjinBoundaries_20261127"

VWORLD = {
    "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계 조립",
    "url": "https://www.vworld.kr",
}

# 조립 결과를 어느 레코드에 넣을지 + 경계 설명 문구
TARGETS = {
    "geumnam-market": {
        "id": "sd-geumnam-market",
        "geom": "필지정합",
        "note": (
            "서울특별시고시 제2025-252호의 금남시장정비구역(금호동3가 368번지 일대 4,717.1㎡)을 "
            "브이월드 연속지적도 필지로 조립한 경계입니다. 금호동3가 368번지(시장 부지)에서 맞닿은 "
            "필지를 넓혀 {n}개 필지를 모았고, 도형 면적 {area:,}㎡는 고시 4,717.1㎡와 {diff:+.1f}% "
            "차이입니다. 고시 지형도면의 결정도는 확보하지 못해 필지 합집합으로 그렸으므로, 도면 원문을 "
            "구하면 그 선으로 다시 맞춥니다."
        ),
    },
    "eungbong-geumho-hyundai": {
        "id": "sd-eungbong-geumho-hyundai",
        "geom": "필지정합",
        "note": (
            "응봉동 98번지 일대 금호현대아파트 단지 대지 필지를 연속지적도로 모아 만든 경계입니다. "
            "대표 필지 98번지에서 도로 필지를 건너지 않고 맞닿은 대지 필지 {n}개를 합집합했고, "
            "도형 면적 {area:,}㎡입니다(보도된 사업부지 30,465㎡ 대비 {diff:+.1f}%). 정비구역 지정 전이라 "
            "공식 구역계가 없어, 단지 필지 경계를 그대로 쓴 참고 경계입니다."
        ),
    },
    "eungbong-daerim1": {
        "id": "sd-eungbong-daerim1",
        "geom": "필지정합",
        "note": (
            "응봉동 100번지 일대 응봉대림1차아파트 단지 대지 필지를 연속지적도로 모아 만든 경계입니다. "
            "대표 필지 100번지에서 맞닿은 대지 필지 {n}개를 합집합했고, 도형 면적 {area:,}㎡입니다"
            "(공개 자료의 구역면적 약 4.6만㎡ 대비 {diff:+.1f}%). 정비구역 지정 전이라 공식 구역계가 없어, "
            "단지 필지 경계를 그대로 쓴 참고 경계입니다."
        ),
    },
    "majang-793-22": {
        "id": "sd-majang-793-22",
        "geom": "필지정합",
        "note": (
            "마장동 793-22·793-23(미성빌라 가·나동) 일대 필지를 연속지적도로 모아 만든 경계입니다. "
            "맞닿은 대지 필지 {n}개를 합집합했고 도형 면적 {area:,}㎡(공개 자료 7,497㎡ 대비 {diff:+.1f}%)입니다. "
            "사전검토 단계라 고시 구역계가 없어, 사업지 필지 묶음을 그대로 쓴 참고 경계입니다."
        ),
    },
    "yongdap-1": {
        "id": "sy-yongdap1",
        "geom": "필지정합",
        "note": (
            "용답동 50-14번지 일대(성동구 2026-10-20 구역계 공개)를 연속지적도 필지로 조립한 경계입니다. "
            "대표 필지 50-14에서 도로 필지를 건너지 않고 맞닿은 대지 필지 {n}개를 모았고, 도형 면적 "
            "{area:,}㎡는 공고 '약 4.7만㎡' 대비 {diff:+.1f}%입니다. 성동구가 공개한 구역도 원문을 확보하지 "
            "못해 필지 합집합으로 그렸으므로, 구역계 도면을 구하면 그 선으로 다시 맞춥니다."
        ),
    },
    "yongdap-2": {
        "id": "yongdap-2",
        "geom": "필지정합",
        "note": (
            "용답동 15번지 일대(용답2구역)를 연속지적도 필지로 조립한 경계입니다. 대표 필지 15번지에서 "
            "맞닿은 대지 필지 {n}개를 모았고, 도형 면적 {area:,}㎡는 서울시고시 제2026-639호 "
            "(96,210.8㎡) 대비 {diff:+.1f}%입니다. 서울시가 고시한 건축허가 제한 지형도면의 구역선을 "
            "필지선에 맞춰 옮긴 것이 아니라, 후보지 구역 안 필지를 모아 만든 필지정합 경계입니다."
        ),
    },
}


def area_m2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][1] * kx, ring[i][0] * ky
        x2, y2 = ring[i + 1][1] * kx, ring[i + 1][0] * ky
        s += x1 * y2 - x2 * y1
    return abs(s / 2)


def merge_gunja(zones):
    """군자동 349-8(서울플랜+ 준비 목록)과 350-18(서울시 UQ120 도형)은 같은 8,713㎡ 구역 —
    공식 도형이 있는 350-18 레코드로 합치고 이름을 공고·통칭(349-8)으로 바꾼다."""
    keep = next(z for z in zones if z["id"] == "11000UQ120PS202505310679")
    dup = [z for z in zones if z["id"] == "rest17gu-gj-군자동-349-8번지-일원-가로주택정비사업"]
    keep["name"] = "군자동 349-8번지 일원 가로주택정비사업"
    keep["alias"] = [
        "군자동 349-8",
        "군자동 349-8번지 일대",
        "군자동 349-8번지 일원",
        "군자동 350-18",
        "군자동 350-18번지 일원 가로주택정비사업",
        "군자동 349-8번지 일원 가로주택정비사업",
    ]
    keep["nameNote"] = (
        "서울시 도시계획사업(서울플랜+) 데이터에는 이 구역이 '군자동 350-18번지 일원 가로주택정비사업'으로 "
        "올라 있고, 광진구 공고·민간 구역지도는 '군자동 349-8번지 일원 가로주택정비사업'으로 부릅니다. "
        "구역면적 8,713㎡·도형이 같은 한 구역이라 두 표기를 한 레코드로 합쳤습니다(2026-11-27)."
    )
    keep["households"] = 304
    keep["stageDates"] = {**(keep.get("stageDates") or {}), "prep": "2025-07-08"}
    keep["datesAsOf"] = "2026-11-27"
    keep["asOf"] = AS_OF
    keep["note"] = (
        "광진구 군자동 349-8번지 일원(군자동 350-18 포함) 가로주택정비사업입니다. 서울시 데이터 기준 "
        "조합설립인가 추진중 단계이고, 서울플랜+ 사업현황에는 2025-07-08 연번부여·8,713㎡·계획 304세대"
        "(분양 243·임대 61)로 잡혀 있습니다. 3종일반주거지역 100%, 30년 이상 노후도 약 93%입니다. "
        "지도 경계는 서울시 의제처리구역(UQ120) 공식 도형을 그대로 썼습니다(도형 9,206㎡ = 고시 면적의 "
        "105.7%). 같은 구역이 서울시 데이터(350-18)와 서울플랜+ 준비 목록(349-8)에 나뉘어 두 번 "
        "등록돼 있던 것을 이번에 하나로 합쳤습니다."
    )
    keep["areaNote"] = (
        "구역면적 8,713㎡ — 서울시 도시계획사업(서울플랜+) 사업현황 기준. 계획 304세대(분양 243·임대 61)."
    )
    keep["sources"] = [
        {
            "label": "서울 열린데이터광장 — 서울시 도시계획사업 현황(서울플랜+) 「군자동 349-8번지 일원 가로주택정비사업」(연번부여 2025-07-08, 8,713㎡, 304세대)",
            "url": "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do",
        },
        {
            "label": "서울시 의제처리구역 위치정보(UQ181) · 도시계획사업 구역 도형(UQ120) — 같은 구역의 공식 경계",
            "url": "https://data.seoul.go.kr/dataList/OA-20957/S/1/datasetView.do",
        },
        VWORLD,
    ]
    removed = 0
    for z in dup:
        zones.remove(z)
        removed += 1
    print(f"군자동 합치기: 349-8 별칭 → {keep['id']} (중복 레코드 {removed}개 삭제)")
    return removed


def apply():
    rings = json.loads(RINGS.read_text(encoding="utf-8"))
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    before_count = len(zones)

    merge_gunja(zones)

    applied = []
    for key, spec in TARGETS.items():
        r = rings.get(key)
        if not r:
            print(f"!! {key} 조립 결과 없음 — 건너뜀")
            continue
        z = next((x for x in zones if x["id"] == spec["id"]), None)
        if z is None:
            print(f"!! 레코드 없음: {spec['id']}")
            continue
        ring = r["ring"]
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        area = area_m2(ring)
        target = float(r["target"])
        diff = (area - target) / target * 100
        z["polygon"] = ring
        if r.get("parts"):
            z["parts"] = [p if p[0] == p[-1] else p + [p[0]] for p in r["parts"]]
        else:
            z.pop("parts", None)
        z["geom"] = spec["geom"]
        z["boundaryApprox"] = True
        z["areaShape"] = round(area, 1)
        z["ringPts"] = len(ring)
        z["asOf"] = AS_OF
        z["boundaryNote"] = spec["note"].format(n=len(r["parcels"]), area=round(area), diff=diff)
        srcs = list(z.get("sources") or [])
        if not any("vworld" in (s.get("url") or "") for s in srcs):
            srcs.append(VWORLD)
        z["sources"] = srcs
        applied.append((key, spec["id"], area, target, len(ring), len(r["parcels"])))

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs", "--force"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-3000:])
            print(r.stderr[-3000:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": (
            "성동·광진 9곳 2단계 — 금남시장·금호현대·응봉대림1차·마장동 793-22·용답1·용답2 경계를 "
            "연속지적도 필지정합으로 채우고, 같은 구역이 두 번 등록돼 있던 군자동 349-8(서울플랜+)/"
            "350-18(서울시 UQ120)을 하나로 합침"
        ),
        "zones": {
            spec["id"]: {"geom": spec["geom"]} for spec in TARGETS.values()
        }
        | {"11000UQ120PS202505310679": {"name": "군자동 349-8번지 일원 가로주택정비사업", "merged": "rest17gu-gj-군자동-349-8번지-일원-가로주택정비사업"}},
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")

    print(f"구역 {before_count} → {len(zones)}")
    for key, zid, area, target, pts, npc in applied:
        print(f"  {zid:38s} {area:10,.1f}㎡ / {target:10,.1f}㎡ ({(area-target)/target*100:+.1f}%) · {pts}정점 · 필지 {npc}개")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
