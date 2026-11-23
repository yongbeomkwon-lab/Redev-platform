#!/usr/bin/env python3
"""구역 폴리곤 → GeoJSON 내보내기 (scripts/export-geojson.mjs 와 같은 일을 하는 파이썬판)

왜 두 벌인가
  · 작업 환경에 node/npm 이 없는 경우가 있어(2026-11-23) 같은 규칙을 파이썬으로도 둔다.
  · 두 스크립트는 **같은 필드 목록·같은 도형 변환·같은 안전 검사**를 써야 한다.
    (한쪽만 고치면 다시 데이터가 어긋난다 — 필드를 바꿀 때 두 파일을 함께 고칠 것)

원천: src/data/seoul-zones.json ([lat,lng] 폴리곤) + src/data/zones-meta.json
출력: public/data/zones.geojson (표준 [lng,lat], Polygon/MultiPolygon, 폐합점 포함)

안전 검사(2026-11-23 사고 뒤 추가)
  · 기존 zones.geojson 과 비교해 **사라지는 구역이나 필드가 있으면 쓰지 않고 멈춘다**.
    정말 지우려면 --force.

사용
  python3 scripts/export-geojson.py            # 생성(사라지는 것이 있으면 중단)
  python3 scripts/export-geojson.py --force    # 강제로 쓴다
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META = ROOT / "src" / "data" / "zones-meta.json"
OUT = ROOT / "public" / "data" / "zones.geojson"

# export-geojson.mjs 의 EXTRA 와 같아야 한다
EXTRA = [
    "alias", "selectedAt", "centerLabel", "locationMap", "note", "areaNote",
    "boundaryNote", "nameNote", "nameSources", "sources", "hiddenByDefault",
    "boundaryApprox", "badgeType", "asOf", "areaShape", "households", "rightsDate", "drawing",
]

# 예전 내보내기가 남긴 찌꺼기 필드 — 비교에서 뺀다
LEGACY = {"polygon", "sid"}


def js_num(v):
    """JSON.stringify 와 같은 숫자 표기 — 정수값 float 은 소수점 없이 쓴다"""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def to_ring(ring):
    # 폐합점은 한 번만 — 원천 폴리곤에 이미 폐합점이 있는 경우가 있다(중복 정점 방지)
    closed = list(ring) if ring[0] == ring[-1] else list(ring) + [ring[0]]
    return [[js_num(p[1]), js_num(p[0])] for p in closed]


def build():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    features = []
    for z in zones:
        props = {
            "id": z.get("id"),
            "name": z.get("name"),
            "type": z.get("type"),
            "kind": z.get("kind"),
            "stage": z.get("stage"),
            "gu": z.get("gu"),
            "area": js_num(z.get("area")),
            "featured": bool(z.get("featured")),
            "sourceId": z.get("sid"),
            "geom": z.get("geom") or "UQ120",
        }
        for key in EXTRA:
            if z.get(key) is not None:
                props[key] = z[key]
        if not z.get("polygon"):
            props["center"] = z.get("center")
            features.append({"type": "Feature", "id": z.get("id"), "properties": props, "geometry": None})
            continue
        rings = [to_ring(z["polygon"])] + [to_ring(p) for p in (z.get("parts") or [])]
        geometry = (
            {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
            if len(rings) > 1
            else {"type": "Polygon", "coordinates": [rings[0]]}
        )
        features.append({"type": "Feature", "id": z.get("id"), "properties": props, "geometry": geometry})
    meta["count"] = len(features)
    return {"type": "FeatureCollection", "metadata": meta, "features": features}


def is_empty(v):
    return v is None or v == "" or (isinstance(v, (list, dict)) and len(v) == 0)


def guard(new: dict, force: bool) -> int:
    if force or not OUT.exists():
        return 0
    prev = json.loads(OUT.read_text(encoding="utf-8"))
    nxt = {f["properties"]["id"]: f for f in new["features"]}
    dropped = [f["properties"]["id"] for f in prev.get("features", []) if f["properties"]["id"] not in nxt]
    lost = []
    for p in prev.get("features", []):
        f = nxt.get(p["properties"]["id"])
        if not f:
            continue
        for k, v in p["properties"].items():
            if k in LEGACY:
                continue
            # 경계가 있는 구역의 center 는 화면이 도형에서 다시 계산한다(bbox 중심) — 빠져도 무방
            if k == "center" and (p.get("geometry") or f.get("geometry")):
                continue
            if not is_empty(v) and is_empty(f["properties"].get(k)):
                lost.append(f"{p['properties']['id']}.{k}")
        if p.get("geometry") and not f.get("geometry"):
            lost.append(f"{p['properties']['id']}.geometry")
    if dropped or lost:
        print(
            f"[중단] 이 내보내기로 사라지는 구역 {len(dropped)}곳 · 필드 {len(lost)}개가 있습니다. "
            "seoul-zones.json 이 오래된 상태일 수 있습니다.",
            file=sys.stderr,
        )
        if dropped:
            print("  사라질 구역: " + ", ".join(dropped[:20]) + (" …" if len(dropped) > 20 else ""), file=sys.stderr)
        if lost:
            print("  사라질 필드: " + ", ".join(lost[:20]) + (" …" if len(lost) > 20 else ""), file=sys.stderr)
        print("  정말 지우려면 --force 로 다시 실행하세요. (파일은 쓰지 않았습니다)", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    force = "--force" in sys.argv
    new = build()
    if guard(new, force):
        return 1
    OUT.write_text(json.dumps(new, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote public/data/zones.geojson ({len(new['features'])} features)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
