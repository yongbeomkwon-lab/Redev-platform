#!/usr/bin/env python3
"""광흥창역세권(신수동 301-1) 구역계 — 전체를 서쪽 8m·북쪽 3m 옮겨 필지·도로선에 맞춤 (2026-11-24)

## 왜
  2026-11-24 대표 지적:
    "신수동 301-1 구역계가 이상해 전체적으로 왼쪽으로 이동해야 할 거 같아. 특히 오른쪽 부분에 보면
     도로를 넘어서 어떤 건물들의 일부만 경계에 포함된 걸로 보여"
  기존 경계는 마포구 고지형도면 경계를 지번 7점으로 정합한 값(잔차 약 7m)이라, 동쪽·북쪽에서
  필지와 도로를 비스듬히 가로지르고 있었다.

## 어떻게 정했나
  브이월드 연속지적도(라이브 /api/parcel, 2026-11-24 · 242필지 스캔)를 기준으로
  경계 표본점(2m 간격)이 필지선에 닿는 거리를 이동량별로 재어 가장 잘 맞는 값을 골랐다.
    · 이동 전        평균 2.10m · 1.5m 이내 58% · 경계가 가로지르는 필지 31곳
    · 서 8m·북 3m    평균 0.51m · 1.5m 이내 98% · 3m 이내 100% · 가로지르는 필지 9곳  ← 채택
    · 서 10m·북 3m   평균 1.06m · 1.5m 이내 72%
    · 서 15m         평균 2.23m (더 밀면 다시 어긋난다)
  모양(77정점)은 그대로 두고 **평행 이동만** 했으므로 면적·형태는 변하지 않는다.

## 무엇이 바뀌나
  · polygon 77정점을 서 8m(-0.0000906° 경도)·북 3m(+0.0000271° 위도) 평행 이동
  · center — 이동한 링의 경계 상자 중심으로 갱신(이전 신수동 296-8 지번 중심은 그대로 note 에 남김)
  · boundaryNote — 이동 사실과 근거를 덧붙임. 표기면적 15,734.9㎡·단계·출처는 그대로
  ※ 측량값이 아니라 지적도 정합값이다(boundaryApprox 는 false 유지 — 고시 경계를 옮긴 것이 아니라
     고시 경계를 지적도에 맞춘 보정임을 note 로 밝힌다). 나머지 2,378곳 구역은 건드리지 않는다.

실행: python3 scripts/apply-shinsu-301-1-shift-20261124.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "shinsu-301-1-shift-20261124.json"
META_KEY = "shinsu301Shift20261124"
ZID = "mp-shinsu-301-1"
EXPECTED_COUNT = 2379
# 같은 배치(2026-11-24)에서 함께 손보는 구역 — 「나머지 구역 변경 0곳」 검사에서 뺀다
BATCH = {"yangjae-397-1"}
R = 6378137.0
COMPACT = {"ensure_ascii": False, "separators": (",", ":")}

SHIFT_NOTE = (
    " 2026-11-24 대표 지적(오른쪽이 도로를 넘어 건물 일부만 경계에 걸린다)에 따라 구역계 전체를 "
    "서쪽 8m·북쪽 3m 평행 이동해 브이월드 연속지적도 필지선에 맞췄습니다(이동 전 평균 오차 2.10m → "
    "0.51m, 1.5m 이내 58% → 98%, 경계가 가로지르는 필지 31곳 → 9곳). 모양과 면적은 그대로이고, "
    "고시 경계를 지적도에 맞춘 보정값이라 정밀 측량값은 아닙니다."
)


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def sph_area(ring) -> float:
    tp = 0.0
    n = len(ring)
    for i in range(n):
        la1, lo1 = ring[i]
        la2, lo2 = ring[(i + 1) % n]
        tp += (lo2 - lo1) * math.pi / 180 * (2 + math.sin(la1 * math.pi / 180) + math.sin(la2 * math.pi / 180))
    return abs(tp * R * R / 2)


def _entry():
    d = _data()
    ring = d["ring"]
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    hit = next((z for z in src if z.get("id") == ZID), None)
    if hit is None:
        raise SystemExit(f"[중단] {ZID} 가 seoul-zones.json 에 없습니다")
    entry = dict(hit)
    entry["polygon"] = ring
    entry["center"] = d["center"]
    entry["centerLabel"] = "지적도 정합 보정 중심(2026-11-24 서 8m·북 3m 이동)"
    entry["areaShape"] = d["areaShape"]
    entry["ringPts"] = len(ring)
    entry["asOf"] = "2026-11-24"
    base = (hit.get("boundaryNote") or "").replace(SHIFT_NOTE, "")
    entry["boundaryNote"] = base.strip() + SHIFT_NOTE
    return entry, d


def _head(path: str):
    try:
        raw = subprocess.run(
            ["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _restore_centers() -> None:
    head = _head("public/data/zones.geojson")
    if head is None:
        return
    head_by = {f["properties"]["id"]: f for f in head["features"]}
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    restored = []
    for f in geo["features"]:
        fid = f["properties"]["id"]
        if fid == ZID:
            continue
        old = head_by.get(fid)
        if old is None:
            continue
        if "center" not in f["properties"] and "center" in old["properties"]:
            f["properties"]["center"] = old["properties"]["center"]
            restored.append(fid)
    if restored:
        GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[보존] 내보내기가 빼 버린 center 속성 되돌림 {len(restored)}곳 {restored[:6]}")


def check() -> int:
    bad = 0
    entry, d = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    z = next((x for x in src if x.get("id") == ZID), None)
    f = _feat(geo, ZID)

    ok = (
        len(src) == len(geo["features"]) == EXPECTED_COUNT
        and index.get("count") == EXPECTED_COUNT
        and (geo.get("metadata") or {}).get("count") == EXPECTED_COUNT
    )
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    bad += 0 if ok else 1

    ok = bool(z and f) and _norm(z.get("polygon")) == _norm(entry["polygon"])
    print(f"[{'OK' if ok else 'FAIL'}] {ZID} 도형({len(entry['polygon'])}정점) 일치")
    bad += 0 if ok else 1

    # 평행 이동만 했는가 — 모든 변의 방향·길이가 그대로인지
    old = next((x for x in (_head("src/data/seoul-zones.json") or []) if x.get("id") == ZID), None)
    ring = entry["polygon"]
    if old:
        o = old["polygon"]
        same_shape = len(o) == len(ring) and all(
            abs((ring[i][0] - ring[0][0]) - (o[i][0] - o[0][0])) < 2e-6
            and abs((ring[i][1] - ring[0][1]) - (o[i][1] - o[0][1])) < 2e-6
            for i in range(len(ring))
        )
        dlat = (ring[0][0] - o[0][0]) * 110900
        dlng = (ring[0][1] - o[0][1]) * 88277
        print(f"[{'OK' if same_shape else 'FAIL'}] 모양 유지(평행 이동만) — 서 {dlng:+.1f}m · 북 {dlat:+.1f}m")
        bad += 0 if same_shape else 1
        a_old, a_new = sph_area(o), sph_area(ring)
        print(f"[{'OK' if abs(a_old - a_new) < 1 else 'FAIL'}] 면적 유지 {a_old:,.1f}㎡ → {a_new:,.1f}㎡")
        bad += 0 if abs(a_old - a_new) < 1 else 1

    # 경계가 있는 구역의 center 는 내보내기에서 빠진다(화면이 도형 bbox 로 다시 계산) — 있을 때만 대조
    props = (f or {}).get("properties") or {}
    ctr = props.get("center")
    ok = (
        props.get("area") == 15734.9
        and abs((props.get("areaShape") or 0) - d["areaShape"]) <= 1
        and (ctr is None or abs(ctr[0] - d["center"][0]) < 1e-6)
        and (props.get("centerLabel") or "").startswith("지적도 정합 보정 중심")
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson 속성 — area {props.get('area')} · areaShape {props.get('areaShape')} · "
          f"center {ctr}")
    bad += 0 if ok else 1

    # 이웃 구역과 겹침 0
    try:
        from shapely.geometry import Polygon  # type: ignore
        SX, SY = 88277.0, 110900.0
        P = Polygon([(p[1] * SX, p[0] * SY) for p in entry["polygon"]])
        worst = []
        for w in src:
            if w.get("id") == ZID or not w.get("polygon"):
                continue
            c = w.get("center")
            if not c or abs(c[0] - d["center"][0]) > 0.004 or abs(c[1] - d["center"][1]) > 0.005:
                continue
            try:
                inter = P.intersection(Polygon([(p[1] * SX, p[0] * SY) for p in w["polygon"]])).area
            except Exception:  # noqa: BLE001
                continue
            if inter > 0.5:
                worst.append((w["id"], round(inter, 1)))
        print(f"[{'OK' if not worst else 'FAIL'}] 이웃 구역 겹침 0㎡" + ("" if not worst else f" {worst}"))
        bad += 0 if not worst else 1
    except ImportError:
        print("[참고] shapely 없음 — 겹침 검사 건너뜀")

    head = _head("src/data/seoul-zones.json")
    if head is not None:
        old_by = {x.get("id"): x for x in head}
        diff = [x["id"] for x in src
                if x.get("id") != ZID and x.get("id") not in BATCH and _norm(x) != _norm(old_by.get(x.get("id")))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(src) - 1}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old_by = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] != ZID and x["properties"]["id"] not in BATCH
                and _norm(x) != _norm(old_by.get(x["properties"]["id"]))]
        print(f"[{'OK' if not diff else 'FAIL'}] geojson 나머지 구역 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1

    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY}")
    bad += 0 if ok else 1

    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    entry, d = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if len(src) != EXPECTED_COUNT:
        raise SystemExit(f"[중단] 예상 밖 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    old = next((z for z in src if z.get("id") == ZID), None)
    if old is None:
        raise SystemExit(f"[중단] {ZID} 없음")
    old.clear()
    old.update(entry)
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")
    print(f"[반영] seoul-zones.json {ZID} — {len(entry['polygon'])}정점 평행 이동 "
          f"(서 {d['shift']['eastWestM']:+.0f}m · 북 {d['shift']['northSouthM']:+.0f}m) · 계측 {d['areaShape']:,.1f}㎡")

    meta[META_KEY] = {
        "asOf": "2026-11-24",
        "zones": [ZID],
        "note": d["reason"],
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[기록] zones-meta.json — {META_KEY}")

    print("[내보내기] node scripts/export-geojson.mjs")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    _restore_centers()
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
