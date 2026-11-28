#!/usr/bin/env python3
"""금호23구역 — 2026-03-05 성동구 공개문 1쪽 구역계 기준으로 경계 교체 (2026-11-28)

tmp/geumho23-ring.json 의 링(도면 구역선을 필지선에 정합한 113정점)으로
sy-geumho23 한 구역만 갱신하고 zones.geojson·zone-index 를 다시 만든다.

실행: python3 scripts/apply-geumho23-official-20261128.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
RING = ROOT / "tmp" / "geumho23-ring.json"
ZONE_ID = "sy-geumho23"
AS_OF = "2026-11-28"
META_KEY = "geumho23Official20261128"

BOUNDARY_NOTE = (
    "성동구 「주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개(금호동4가 1109번지 일대)」"
    "(2026-03-05, 동의서 번호부여) 1쪽 지적도의 붉은 구역계를 그대로 옮겼습니다. "
    "1,020×674 도면에서 구역선을 뽑아 축척 0.421 m/px로 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 "
    "정합했고(필지선 겹침 95.6%), 꼭짓점 43곳을 필지 꼭짓점에 붙이고 변 위의 필지 꼭짓점을 끼워 넣었습니다. "
    "구역선과의 편차는 95%가 1m 안(최대 6m)이고 외곽선 1개·구멍 0개·자기교차 없음입니다. "
    "북쪽 1286-1도, 동쪽 1094-1도·1075-1도 너머 금남시장 쪽, 남쪽 1048도·1044-1도·1028-1도 너머, "
    "서쪽 1402-2·1403·1386 바깥 필지는 뺐습니다. 후보지 신청 전이라 확정 고시 전 경계입니다."
)

AREA_NOTE = (
    "공고 면적 30,706㎡(약 9,289평) — 서울특별시 공고 제2026-456호 표 기준(2026-02-12 해제 당시 구역계). "
    "2026-03-05 성동구 공개문 1쪽 구역계로 다시 조립한 지도 도형 면적은 {area:,}㎡로 공고 면적의 {pct:.1f}%입니다"
    "(구역선이 필지·도로 경계를 따라가면서 생기는 차이)."
)

NOTE_TAIL = (
    "지도 경계는 2026-03-05 성동구 「동의서 번호부여 요청 구역 공개」 1쪽 구역계를 브이월드 연속지적도 "
    "필지선에 맞춰 필지 단위로 다시 조립한 검토 경계이며, 실제 구역계는 신청인이 제출한 안으로 후보지 추천 "
    "과정에서 바뀔 수 있습니다."
)


def main():
    r = json.loads(RING.read_text(encoding="utf-8"))
    ring = r["ring"]
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    z = next((x for x in zones if x["id"] == ZONE_ID), None)
    if z is None:
        raise SystemExit("구역 없음: " + ZONE_ID)

    poly = Polygon([(p[1], p[0]) for p in ring])
    if not poly.is_valid or poly.geom_type != "Polygon" or len(poly.interiors):
        raise SystemExit(f"도형 이상: valid={poly.is_valid} type={poly.geom_type} holes={len(poly.interiors)}")

    # 미터 단위 면적
    import math

    KX = 111320.0 * math.cos(math.radians(37.5482))
    KY = 111132.0
    pm = Polygon([((p[1] - 127.02044812) * KX, (p[0] - 37.54820265) * KY) for p in ring])
    area = pm.area
    lats = [p[0] for p in ring]
    lngs = [p[1] for p in ring]

    old_area = z.get("areaShape")
    z["polygon"] = ring
    z.pop("parts", None)
    z.pop("holes", None)
    z["geom"] = "필지정합"
    z["boundaryApprox"] = True
    z["areaShape"] = round(area, 1)
    z["ringPts"] = len(ring)
    z["asOf"] = AS_OF
    z["center"] = [round((min(lats) + max(lats)) / 2, 7), round((min(lngs) + max(lngs)) / 2, 7)]
    pct = area / z["area"] * 100
    z["areaNote"] = AREA_NOTE.format(area=round(area), pct=pct)
    z["boundaryNote"] = BOUNDARY_NOTE
    note = z.get("note") or ""
    if NOTE_TAIL not in note:
        cut = note.split("지도 경계는")[0].rstrip()
        z["note"] = cut + " " + NOTE_TAIL
    srcs = list(z.get("sources") or [])
    label = (
        "성동구 「주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개(금호동4가 1109번지 일대)」"
        "(2026-03-05) — 1쪽 구역계 도면"
    )
    if not any("구역 공개" in (s.get("label") or "") for s in srcs):
        srcs.insert(0, {
            "label": label,
            "url": "https://www.sd.go.kr/main/selectBbsNttList.do?bbsNo=184&key=3715&integrDeptCode=30301590000",
        })
    z["sources"] = srcs

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    print(f"{ZONE_ID}: 도형 면적 {area:,.1f}㎡ (이전 {old_area:,.1f}㎡) · 정점 {len(ring)} · 공고 면적 대비 {pct:.1f}%")
    print("center", z["center"])

    node = shutil.which("node") or "/workspace/tools/node-v22.14.0-linux-x64/bin/node"
    for cmd in ([node, "scripts/export-geojson.mjs"], [node, "scripts/build-zone-index.mjs"]):
        res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", res.returncode)
        if res.returncode != 0:
            print(res.stdout[-1500:], res.stderr[-1500:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": (
            "금호23구역(sy-geumho23) 경계를 2026-03-05 성동구 「동의서 번호부여 요청 구역 공개」 1쪽 구역계로 "
            "교체했다. 이전 도형(서울시 공고 제2026-456호 지형도면에서 옮긴 것)은 실제 구역보다 약 70~110m "
            "북동으로 어긋나 있었다. 새 도형은 도면 축척 0.421 m/px로 정합하고 필지 꼭짓점에 붙였다."
        ),
        "zones": {ZONE_ID: {"geom": "필지정합", "areaShape": round(area, 1), "ringPts": len(ring)}},
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("완료")


if __name__ == "__main__":
    sys.exit(main())
