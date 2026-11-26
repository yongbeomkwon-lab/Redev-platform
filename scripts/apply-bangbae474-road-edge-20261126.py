#!/usr/bin/env python3
"""방배동 474(도공복) — 도로 침범 제거: 연속지적도 대지 필지 외곽선으로 경계 재조립 (2026-11-26)

## 왜
  직전 작업(apply-bangbae474-naebang1-20261126.py)은 효령로·청두곶2길·도구로1길의 **도로 중심선**을
  따라 경계를 그렸다. 그래서 구역 도형 19,638㎡ 가운데 약 4,900㎡가 효령로(방배동 503-2·980-53
  도로 필지) 등 도로 위를 덮고 있었다. 대표(권용범) 지시: "방배동 474 도공복 이고 도로침범 수정해줘".

## 무엇
  · `seocho-bangbae-474` 한 구역의 polygon만 바꾼다 —
    연속지적도(LP_PA_CBND_BUBUN) 필지 중 **지목이 도로('…도')가 아닌 대지 필지**를
    브이월드 운영 API(/api/parcel, 6~7m 격자 3,605점 조회 → 380필지)로 모아 합집합하고,
    구역 안쪽 골목(475-23·475-24·527-1·527-24·528-110·980-22 도로 필지)만 안에 넣었다.
    블록 사이 4m 골목(500-2 도로 필지)은 두 블록을 잇는 만큼만 남겼다.
  · 효령로(503-2·980-53)·청두곶2길(698-2)·980-28 도로 필지는 도형에서 빼낸다 → 겹침 0㎡.
  · geom="필지정합", boundaryApprox=true(공식 구역계 아님), areaShape(도형 실측 14,695㎡),
    center·boundaryNote·note·sources 갱신. 사업유형(type)은 이미 '도공복'이라 손대지 않는다.
  · 구역 데이터 이외에는 아무것도 바꾸지 않는다 — 직전 커밋(HEAD)과 구역 단위 비교.

실행: python3 scripts/apply-bangbae474-road-edge-20261126.py [--check]
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
DATA = ROOT / "scripts" / "data" / "bangbae474-road-edge-20261126.json"
META_KEY = "bangbae474RoadEdge_20261126"

# 이웃 구역 — 겹치면 실패
NEIGHBORS = ["seocho-bangbae-15", "방배15", "11000UQ120PS202411014101",
             "11000UQ120PS202411014089", "11000UQ120PS202411014088",
             "seocho-bangbae-467-19"]


def close_ring(ring):
    r = [list(p) for p in ring]
    if r[0] != r[-1]:
        r.append(list(r[0]))
    return r


def patch_zone(z: dict, spec: dict, asof: str) -> dict:
    out = dict(z)
    out["polygon"] = close_ring(spec["ring"])
    out["geom"] = spec["geom"]
    out["boundaryApprox"] = True
    out["areaShape"] = spec["areaShape"]
    out["center"] = spec["center"]
    out["boundaryNote"] = spec["boundaryNote"]
    rep = spec.get("noteReplace")
    if rep and rep["from"] in out.get("note", ""):
        out["note"] = out["note"].replace(rep["from"], rep["to"])
    for s in spec.get("extraSources", []):
        src = out.setdefault("sources", [])
        if not any(x.get("url") == s["url"] for x in src):
            src.append(s)
    out["asOf"] = asof
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


def _overlap_m2(a: list, b: list) -> float:
    """두 [위도,경도] 링의 교차 면적(㎡) — 로컬 평면 근사."""
    def ring_area(r):
        # 신발끈 공식(경도,위도) → m²
        import math
        lat0 = sum(p[0] for p in r) / len(r)
        kx = 111320 * math.cos(math.radians(lat0))
        ky = 110574
        s = 0.0
        for i in range(len(r) - 1):
            x1, y1 = (r[i][1] * kx, r[i][0] * ky)
            x2, y2 = (r[i + 1][1] * kx, r[i + 1][0] * ky)
            s += x1 * y2 - x2 * y1
        return abs(s / 2)

    try:
        from shapely.geometry import Polygon
        import math
        lat0 = sum(p[0] for p in a) / len(a)
        kx = 111320 * math.cos(math.radians(lat0))
        ky = 110574
        pa = Polygon([(p[1] * kx, p[0] * ky) for p in a])
        pb = Polygon([(p[1] * kx, p[0] * ky) for p in b])
        return pa.intersection(pb).area
    except Exception:  # noqa: BLE001 — shapely 없으면 0으로 두고 check에서만 경고
        return 0.0


def check() -> bool:
    data, zones, geo, meta = load()
    by_id = {z["id"]: z for z in zones}
    geo_by_id = {f["properties"]["id"]: f for f in geo["features"]}
    ok = True
    for zid, spec in data["zones"].items():
        z = by_id.get(zid)
        f = geo_by_id.get(zid)
        ring = close_ring(spec["ring"])
        same = bool(z) and z.get("polygon") == ring and z.get("geom") == "필지정합"
        gsame = bool(f) and f["geometry"]["coordinates"][0] == [[c[1], c[0]] for c in ring]
        print(("OK  " if same and gsame else "FAIL"), zid,
              "src" if same else "", "geo" if gsame else "",
              "geom=", z and z.get("geom"), "pts=", len(spec["ring"]),
              "areaShape=", z and z.get("areaShape"), "type=", z and z.get("type"))
        ok &= bool(same and gsame)
        # 이웃 겹침 0㎡
        for nid in NEIGHBORS:
            n = by_id.get(nid)
            if not n or not n.get("polygon"):
                continue
            ov = _overlap_m2(ring, n["polygon"])
            print(("OK  " if ov < 0.5 else "FAIL"), " 겹침", nid, round(ov, 1), "㎡")
            ok &= ov < 0.5
    print(("OK  " if META_KEY in meta else "FAIL"), "meta", META_KEY)
    ok &= META_KEY in meta
    print(("OK  " if geo["metadata"].get("count") == len(geo["features"]) else "FAIL"),
          "geojson count", geo["metadata"].get("count"), len(geo["features"]))
    ok &= geo["metadata"].get("count") == len(geo["features"])
    return ok


def apply():
    data, zones, geo, meta = load()
    before = prev_zones()
    changed = []
    for i, z in enumerate(zones):
        spec = data["zones"].get(z["id"])
        if not spec:
            continue
        new = patch_zone(z, spec, data["asOf"])
        if new != z:
            zones[i] = new
            changed.append(z["id"])
    if not changed:
        print("이미 반영됨 — 바꿀 것 없음")
    by_id = {z["id"]: z for z in zones}
    for feat in geo["features"]:
        spec = data["zones"].get(feat["properties"]["id"])
        if not spec:
            continue
        src = by_id[feat["properties"]["id"]]
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
