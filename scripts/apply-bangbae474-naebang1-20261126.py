#!/usr/bin/env python3
"""방배동 474·내방1지구 — 임시 근사원(점선원) → 필지·도로 정합 다각형 교체 (2026-11-26)

## 왜
  두 구역은 구역계가 공개되지 않아 지도에 대표 지번 중심의 점선원(geom="근사원",
  97정점 원)으로만 표시돼 있었다. 대표(권용범) 요청으로 실제 필지·도로선을 따라간
  다각형으로 바꾼다.

## 무엇
  · 두 구역의 polygon 만 교체하고 geom="필지정합", boundaryApprox=true(공식 구역계 아님),
    areaShape(도형 실측 면적), center, boundaryNote, note 보강, sources 보강.
  · 좌표는 연속지적도(브이월드 LP_PA_CBND_BUBUN, 리디브 /api/parcel) 필지와
    OpenStreetMap 도로 중심선을 겹쳐 만든 필지 블록 경계를 그대로 옮겼다(정밀 측량값 아님).
  · 구역 데이터 이외에는 아무것도 바꾸지 않는다 — 직전 커밋(HEAD)과 구역 단위 비교.

실행: python3 scripts/apply-bangbae474-naebang1-20261126.py [--check]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "bangbae474-naebang1-20261126.json"
META_KEY = "bangbae474Naebang1_20261126"


def close_ring(ring):
    r = [list(p) for p in ring]
    if r[0] != r[-1]:
        r.append(list(r[0]))
    return r


def patch_zone(z: dict, spec: dict) -> dict:
    out = dict(z)
    out["polygon"] = close_ring(spec["ring"])
    out["geom"] = spec["geom"]
    out["boundaryApprox"] = True
    out["areaShape"] = spec["areaShape"]
    out["center"] = spec["center"]
    out["boundaryNote"] = spec["boundaryNote"]
    if spec.get("noteAppend"):
        base = out.get("note", "")
        if spec["noteAppend"] not in base:
            out["note"] = (base + " " + spec["noteAppend"]).strip()
    for s in spec.get("extraSources", []):
        src = out.setdefault("sources", [])
        if not any(x.get("url") == s["url"] for x in src):
            src.append(s)
    out["asOf"] = "2026-11-26"
    return out


def load():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    return data, zones, geo, meta


def prev_zones() -> dict:
    """직전 커밋(HEAD)의 구역 목록 — 다른 구역이 바뀌지 않았는지 비교용."""
    try:
        txt = subprocess.run(["git", "show", "HEAD:src/data/seoul-zones.json"],
                             cwd=ROOT, capture_output=True, text=True, check=True).stdout
        return {z["id"]: z for z in json.loads(txt)}
    except Exception as e:  # noqa: BLE001
        print("!! HEAD 비교 불가:", e)
        return {}


def check():
    data, zones, geo, meta = load()
    by_id = {z["id"]: z for z in zones}
    geo_by_id = {f["properties"]["id"]: f for f in geo["features"]}
    ok = True
    for zid, spec in data["zones"].items():
        z = by_id.get(zid)
        f = geo_by_id.get(zid)
        same = bool(z) and z.get("polygon") == close_ring(spec["ring"]) and z.get("geom") == "필지정합"
        gsame = bool(f) and f["geometry"]["coordinates"][0] == [[c[1], c[0]] for c in close_ring(spec["ring"])]
        print(("OK  " if same and gsame else "FAIL"), zid,
              "src" if same else "", "geo" if gsame else "",
              "geom=", z and z.get("geom"), "pts=", len(spec["ring"]))
        ok &= bool(same and gsame)
    print(("OK  " if META_KEY in meta else "FAIL"), "meta", META_KEY)
    ok &= META_KEY in meta
    print(("OK  " if geo["metadata"].get("count") == len(geo["features"]) else "FAIL"),
          "geojson count", geo["metadata"].get("count"), len(geo["features"]))
    return ok


def apply():
    data, zones, geo, meta = load()
    before = prev_zones()
    changed = []
    for i, z in enumerate(zones):
        spec = data["zones"].get(z["id"])
        if not spec:
            continue
        new = patch_zone(z, spec)
        if new != z:
            zones[i] = new
            changed.append(z["id"])
    if not changed:
        print("이미 반영됨 — 바꿀 것 없음")
    for feat in geo["features"]:
        spec = data["zones"].get(feat["properties"]["id"])
        if not spec:
            continue
        src = {z["id"]: z for z in zones}[feat["properties"]["id"]]
        feat["geometry"] = {"type": "Polygon",
                            "coordinates": [[[c[1], c[0]] for c in src["polygon"]]]}
        for k in ("geom", "boundaryApprox", "areaShape", "center", "boundaryNote", "note", "sources", "asOf"):
            if k in src:
                feat["properties"][k] = src[k]
    # 다른 구역이 바뀌지 않았는지
    if before:
        for z in zones:
            if z["id"] in data["zones"]:
                continue
            old = before.get(z["id"])
            if old and old != z:
                raise SystemExit(f"!! 다른 구역이 바뀌었습니다: {z['id']}")
        if len(zones) != len(before):
            raise SystemExit(f"!! 구역 수 변경 {len(before)} → {len(zones)}")
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    geo["metadata"]["count"] = len(geo["features"])
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    # meta
    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {k: data[k] for k in ("asOf", "note")}
    meta[META_KEY]["zones"] = {zid: {"geom": s["geom"], "areaShape": s["areaShape"]}
                               for zid, s in data["zones"].items()}
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("반영:", changed)


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    apply()
    sys.exit(0 if check() else 1)
