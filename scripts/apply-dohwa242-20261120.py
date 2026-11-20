#!/usr/bin/env python3
"""
도화동 242 일대(마포역세권 장기전세주택, dohwa-242) — 공고 도면 구역계 반영 (2026-11-20)

· 원천: 서울특별시 마포구 공고 제2026-1787호(2026-11-12) 「마포역세권(도화동) 장기전세주택
  도시정비형 재개발사업 개발행위허가 제한 주민 열람공고」 첨부 2쪽 「개발행위허가 제한구역 지역도」
  (SCALE 1:1,500, 지적선 표시)의 빨간 쇄선 구역계. 공고 면적 35,880.8㎡, 열람기간 2026-11-12~11-27.
· 정합: 축척 막대 90m=474px(5.267px/m) + 도면 지번 라벨 30점 ↔ 카카오 지번 좌표 적합
  (가로 5.203px/m·세로 5.002px/m — 래스터 세로 4% 압축, 회전 0.5°, 잔차 중앙값 2.8m)
· 계측: 95정점, 35,572㎡ (공고 35,880.8㎡ 대비 -0.9%)
· 겹침: 도화우성(UQ120 일반화 도형)과 601.7㎡ — 일반화 오차로 보고 도면대로 둔다.

대상: 기존 구역 dohwa-242 (geom "미고시" → "공고도면", 점선원 → 실제 경계 다각형)
실행: python3 scripts/apply-dohwa242-20261120.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
ZONE_ID = "dohwa-242"

NOTE = (
    "역세권 장기전세주택 도시정비형 재개발사업(마포역세권·도화동) 구역입니다. 마포구가 2026-11-12 "
    "공고 제2026-1787호로 「개발행위허가 제한 주민 열람공고」를 내면서 같은 날 구역계 도면을 공개했고, "
    "열람기간은 2026-11-12~2026-11-27, 제한기간은 고시일로부터 3년(정비구역·정비계획 결정 고시 시 해제)입니다. "
    "아직 정비구역 지정·구역계 고시 전이라 이 도형은 공고문 첨부 「개발행위허가 제한구역 지역도」(1:1,500)의 "
    "빨간 쇄선을 옮긴 것입니다."
)

AREA_NOTE = (
    "공고문 표의 제한지역 면적 35,880.8㎡(도화동 242 일대, 역세권 마포역세권(도화동)). "
    "도면 구역계를 옮긴 다각형의 계측 면적은 35,572㎡로 공고 면적 대비 -0.9%입니다."
)

BOUNDARY_NOTE = (
    "마포구 공고 제2026-1787호 첨부 지역도(1:1,500)의 빨간 쇄선을 픽셀 단위로 추출했습니다. "
    "축척 막대 90m=474px로 5.267px/m를 확인했고, 도면 지번 라벨 30점(도화동 340·342·344·339·325·322·317·"
    "329·331·216-3·222·220·231-13·231-12·231-4·235-2 등)을 카카오 지번 좌표와 대조한 적합"
    "(가로 5.203px/m·세로 5.002px/m, 회전 0.5°, 잔차 중앙값 2.8m)으로 북쪽을 고정했습니다. "
    "선폭 중심선 기준 12px 안쪽 보정 후 95정점이며 경계 오차는 ±4m 수준입니다. "
    "도면이 도화우성(서울시 UQ120 일반화 도형)과 601.7㎡ 겹치는데, 일반화 도형 오차로 보아 임의로 자르지 않고 "
    "도면 그대로 두었습니다."
)

SOURCES = [
    {
        "label": "서울특별시 마포구 공고 제2026-1787호 — 마포역세권(도화동) 장기전세주택 도시정비형 재개발사업 개발행위허가 제한 주민 열람공고(2026-11-12, 첨부 개발행위허가 제한구역 지역도)",
        "url": "https://jaegebal.com/gnotices/mp-gg-2026-1787",
    },
    {
        "label": "토지이음 고시정보 — 서울특별시 고시 원문 검색",
        "url": "https://www.eum.go.kr/web/gs/gv/gvGosiList.jsp",
    },
]

PROPS = {
    "name": "마포역세권 장기전세주택(도화동 242)",
    "alias": ["도화동 242", "마포역세권", "마포역세권 장기전세주택", "도화동 242 일대", "마포역세권(도화동)"],
    "type": "장기전세",
    "kind": "장기전세주택",
    "stage": "행위제한(열람공고 2026-11-12~11-27)",
    "gu": "마포구",
    "area": 35880.8,
    "featured": False,
    "sourceId": "마포구 공고 제2026-1787호(2026-11-12)",
    "geom": "공고도면",
    "boundaryApprox": False,
    "center": [37.538911, 126.948503],
    "centerLabel": "공고 도면 구역계 중심",
    "note": NOTE,
    "areaNote": AREA_NOTE,
    "boundaryNote": BOUNDARY_NOTE,
    "sources": SOURCES,
    "asOf": "2026-11-20",
}

META_KEY = "dohwa242Official20261120"
META = {
    "asOf": "2026-11-20",
    "updated": 1,
    "polygons": 1,
    "note": (
        "도화동 242(마포역세권 장기전세주택) — 마포구 공고 제2026-1787호 첨부 지역도(1:1,500)의 빨간 쇄선을 "
        "옮겨 geom='미고시'(점선원)에서 실제 경계 다각형으로 바꿨습니다. 공고 면적 35,880.8㎡, 도형 계측 35,572㎡(-0.9%). "
        "도화우성(UQ120 일반화)과 601.7㎡ 겹침은 일반화 오차로 보고 도면대로 두었습니다."
    ),
}

POLYGON_LATLNG = [
    [37.538581, 126.947588], [37.538554, 126.947691], [37.538302, 126.947856], [37.538276, 126.947838], [37.538267, 126.947745], [37.538253, 126.947731],
    [37.538124, 126.947752], [37.537997, 126.947674], [37.537946, 126.947759], [37.537887, 126.94778], [37.537828, 126.947691], [37.537826, 126.947663],
    [37.537783, 126.94763], [37.537764, 126.947641], [37.537746, 126.94763], [37.537679, 126.947696], [37.537678, 126.947716], [37.537757, 126.947812],
    [37.537775, 126.947858], [37.537758, 126.947896], [37.537723, 126.9479], [37.537715, 126.947942], [37.537743, 126.948113], [37.537777, 126.948198],
    [37.537653, 126.948341], [37.537616, 126.948581], [37.537563, 126.948651], [37.537585, 126.949093], [37.537616, 126.949119], [37.537658, 126.949108],
    [37.537698, 126.949028], [37.537755, 126.949021], [37.537948, 126.949062], [37.538236, 126.949072], [37.538301, 126.949054], [37.538601, 126.949084],
    [37.538649, 126.949135], [37.538732, 126.949279], [37.538847, 126.949308], [37.538949, 126.949428], [37.539116, 126.949428], [37.539148, 126.949481],
    [37.539209, 126.949662], [37.539237, 126.949707], [37.539273, 126.949713], [37.539363, 126.94961], [37.539371, 126.949579], [37.539435, 126.949536],
    [37.53953, 126.94934], [37.539584, 126.949308], [37.539727, 126.94913], [37.539877, 126.949008], [37.540249, 126.948797], [37.540355, 126.948755],
    [37.540361, 126.94873], [37.540305, 126.948566], [37.540294, 126.948558], [37.540167, 126.948615], [37.54014, 126.948586], [37.540157, 126.948536],
    [37.540229, 126.948501], [37.540236, 126.948483], [37.540207, 126.948371], [37.540223, 126.948315], [37.540195, 126.94823], [37.540125, 126.948215],
    [37.540082, 126.94816], [37.540079, 126.948118], [37.540112, 126.94808], [37.540101, 126.948033], [37.540071, 126.947988], [37.540033, 126.948002],
    [37.540006, 126.947971], [37.540028, 126.947873], [37.540072, 126.947814], [37.540024, 126.947704], [37.53999, 126.947698], [37.539948, 126.947766],
    [37.53987, 126.947846], [37.53985, 126.947843], [37.539797, 126.947782], [37.539764, 126.947802], [37.539664, 126.94796], [37.539639, 126.947969],
    [37.53962, 126.947956], [37.539585, 126.947865], [37.53934, 126.947928], [37.539296, 126.947919], [37.539281, 126.947891], [37.53929, 126.947813],
    [37.539278, 126.947798], [37.539168, 126.947784], [37.539155, 126.947762], [37.539159, 126.947683], [37.539119, 126.947632]
]


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    if not feat:
        print("[실패] geojson에 구역 없음:", ZONE_ID)
        return 1
    geom = feat.get("geometry") or {}
    ok = (
        geom.get("type") == "Polygon"
        and len(geom["coordinates"][0]) == len(POLYGON_LATLNG) + 1
        and feat["properties"].get("geom") == PROPS["geom"]
        and abs((feat["properties"].get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson {feat['properties'].get('name')} "
          f"geometry={geom.get('type')} geom={feat['properties'].get('geom')} "
          f"area={feat['properties'].get('area')} verts={len(geom.get('coordinates', [[[]]])[0])}")
    bad += 0 if ok else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    ok2 = bool(entry) and len(entry.get("polygon") or []) == len(POLYGON_LATLNG) and entry.get("geom") == PROPS["geom"]
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones.json polygon={len(entry.get('polygon') or []) if entry else 0} "
          f"geom={entry.get('geom') if entry else None}")
    bad += 0 if ok2 else 1

    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} "
          f"features={len(geo['features'])} batch={META_KEY in geo['metadata']}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    ring = [[lng, lat] for lat, lng in POLYGON_LATLNG]
    ring.append(ring[0])

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    if feat is None:
        feat = {"type": "Feature", "id": ZONE_ID, "properties": {}, "geometry": None}
        geo["features"].append(feat)
        print("[geojson] 새 feature 추가:", ZONE_ID)
    else:
        print("[geojson] 기존 feature 갱신(점선원 → 다각형):", ZONE_ID)
    feat["properties"] = {"id": ZONE_ID, **PROPS}
    feat["geometry"] = {"type": "Polygon", "coordinates": [ring]}
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] {ZONE_ID} — {len(ring) - 1}정점, features={len(geo['features'])}")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    if entry is None:
        entry = {"id": ZONE_ID, "sid": PROPS["sourceId"]}
        src.append(entry)
        print("[seoul-zones] 새 구역 추가:", ZONE_ID)
    else:
        print("[seoul-zones] 기존 구역 갱신:", ZONE_ID)
    entry.update(PROPS)
    entry["sid"] = PROPS["sourceId"]
    entry["polygon"] = POLYGON_LATLNG
    entry.pop("parts", None)
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] {ZONE_ID} — {len(POLYGON_LATLNG)}정점, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
