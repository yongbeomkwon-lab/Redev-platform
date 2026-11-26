#!/usr/bin/env python3
"""한강로3가 65-100구역 — 미고시 점 → 공고 도면 구역계 폴리곤 반영 (2026-11-26)

## 왜
  리디브에 이 구역은 `geom: "미고시"` + 대표 지점(점)으로만 있었다. 용산구가 2026-10-28 공개한
  「한강로3가 65-100번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개」 첨부
  도면에 구역계(적색선)가 실려 있어, 그 선을 옮겨 지도에 실제 경계로 그린다.

## 경계를 어떻게 만들었나
  · 공고문 PDF(용산구 자료실, nttId=770995) 1쪽의 지적도 이미지(1152×843)에서 적색 구역계만
    색으로 분리하고, 같은 도면의 지적선 ↔ 브이월드 연속지적도(LP_PA_CBND_BUBUN, 플랫폼
    /api/parcel 점 조회 2,166회로 모은 필지 266개)를 대조해 0.344m/px·회전 0.006°·
    평행이동을 확정했다(필지선 표본의 86.8%가 1.5px=0.5m 이내, 동쪽 끝도 중앙값 1px).
  · 그 변환으로 적색선(두께 4.7px≈1.6m)의 중심선을 추적해 56정점 폴리곤을 만들었다.
    계측 면적 17,903㎡ — 공고 「약 1.8만㎡」·재개발닷컴 17,854㎡ 대비 +0.3%.
  · 남쪽 경계는 철도변 도로부지를 포함한다(필지 171개 합집합 14,871㎡와의 차이 3,173㎡가
    대부분 그 도로). 갈타맵이 현행 지적에 정합해 공개한 5,228.1평(17,283㎡)과는 도로 포함
    여부 때문에 3.6% 차이가 난다.

## 무엇이 바뀌나
  · polygon · ringPts · areaShape · center · geom("공고도면") · boundaryApprox(false)
  · stage(번호부여 2026-10-26) · alias 3개 추가 · note·boundaryNote·areaNote·sources·sid·asOf
  · scripts/data/official-sy.json 의 같은 항목에도 폴리곤·근거를 넣어, 나중에 보강 스크립트를
    다시 돌려도 경계가 사라지지 않게 한다.
  ※ 표기면적(area)·이름·사업유형은 그대로. 나머지 2,387곳은 건드리지 않는다.

실행: python3 scripts/apply-hangangro3-65-100-20261126.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "hangangro3-65-100-20261126.json"
SY = ROOT / "scripts" / "data" / "official-sy.json"
META_KEY = "hangangro3_65_100_20261126"
ZID = "sy-hangangro3-65-100"
EXPECTED_COUNT = 2388
IDS = (ZID,)
COMPACT = {"ensure_ascii": False, "separators": (",", ":")}

META_NOTE = (
    "한강로3가 65-100구역(용산구, 신속통합기획)은 미고시 점에서 2026-10-28 용산구 구역계 공개 도면의"
    " 적색 구역계를 0.344m/px로 지오레퍼런싱해 추적한 56정점 폴리곤(계측 17,903㎡, 공고 약 1.8만㎡)으로"
    " 교체했다. 남쪽으로 철도변 도로부지를 포함하며, 주변 정비구역과 겹침은 0㎡다."
)


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def _entry(z: dict) -> dict:
    ring = z["ring"]
    if len(ring) < 3:
        raise SystemExit("[중단] 링 정점이 모자랍니다")
    return {
        "polygon": [[round(p[0], 6), round(p[1], 6)] for p in ring],
        "ringPts": len(ring),
        "areaShape": z["areaShape"],
        "geom": z["geom"],
        "boundaryApprox": False,
        "sid": z["sid"],
        "center": list(z["center"]),
        "centerLabel": z["centerLabel"],
        "stage": z["stage"],
        "alias": z["alias"],
        "asOf": z["asOf"],
        "note": z["note"],
        "boundaryNote": z["boundaryNote"],
        "areaNote": z["areaNote"],
        "sources": z["sources"],
        "drawing": z["drawing"],
    }


def _m2(geom) -> float:
    """도형 면적 — EPSG:5179(한국 통합좌표계)로 투영해 잰다."""
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_transform

    T = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    return sh_transform(lambda x, y, z=None: T.transform(x, y), shape(geom)).area


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _geo_key(f: dict) -> str:
    f = json.loads(json.dumps(f))
    if f.get("geometry"):
        (f.get("properties") or {}).pop("center", None)
    return _norm(f)


def _head(path: str):
    try:
        raw = subprocess.run(
            ["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def check() -> int:
    bad = 0
    doc = _data()
    z = doc["zone"]
    want = _entry(z)
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    zone = next((x for x in src if x.get("id") == ZID), None)
    f = _feat(geo, ZID)

    ok = len(src) == len(geo["features"]) == EXPECTED_COUNT and index.get("count") == EXPECTED_COUNT
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    bad += 0 if ok else 1

    ok = zone is not None and _norm(zone.get("polygon")) == _norm(want["polygon"])
    print(f"  [{'OK' if ok else 'FAIL'}] seoul-zones 도형 {len(want['polygon'])}정점 일치")
    bad += 0 if ok else 1

    g = (f or {}).get("geometry") or {}
    ring = (g.get("coordinates") or [[]])[0]
    body = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    same = len(body) == len(want["polygon"]) and all(
        abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(body, want["polygon"])
    )
    print(f"  [{'OK' if same else 'FAIL'}] geojson 좌표 일치 ({len(body)}정점)")
    bad += 0 if same else 1

    props = (f or {}).get("properties") or {}
    ok = (
        props.get("geom") == "공고도면"
        and props.get("boundaryApprox") is False
        and props.get("area") == 17854
        and abs((props.get("areaShape") or 0) - z["areaShape"]) <= 1
        and bool(props.get("boundaryNote"))
        and len(props.get("sources") or []) >= 5
    )
    print(f"  [{'OK' if ok else 'FAIL'}] 속성 — geom {props.get('geom')} · area {props.get('area')} · "
          f"areaShape {props.get('areaShape')} · sources {len(props.get('sources') or [])}건")
    bad += 0 if ok else 1

    idx = next((x for x in index["zones"] if x.get("id") == ZID), None)
    ok = bool(idx) and idx.get("name") == z["name"] and "한강로3가 65-102" in (idx.get("alias") or [])
    print(f"  [{'OK' if ok else 'FAIL'}] zone-index 별칭 유지")
    bad += 0 if ok else 1

    if f and f.get("geometry"):
        a = _m2(f["geometry"])
        dev = (a - z["areaShape"]) / z["areaShape"] * 100
        ok = abs(a - z["areaShape"]) < 5
        print(f"  [{'OK' if ok else 'FAIL'}] 도형 면적 {a:,.0f}㎡ (areaShape {z['areaShape']:,}㎡, {dev:+.2f}%)")
        bad += 0 if ok else 1
        # 이웃 구역 겹침
        from pyproj import Transformer
        from shapely.geometry import shape
        from shapely.ops import transform as sh_transform

        T = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
        gz = sh_transform(lambda x, y, z=None: T.transform(x, y), shape(f["geometry"]))
        ov = []
        for f2 in geo["features"]:
            if f2["properties"].get("id") == ZID or not f2.get("geometry"):
                continue
            g2 = sh_transform(lambda x, y, z=None: T.transform(x, y), shape(f2["geometry"]))
            if g2.intersects(gz):
                inter = g2.intersection(gz).area
                if inter > 1:
                    ov.append((round(inter), f2["properties"].get("name")))
        print(f"  [{'OK' if not ov else 'FAIL'}] 이웃 구역 겹침 0㎡ (겹침: {ov[:3] if ov else '없음'})")
        bad += 0 if not ov else 1

    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY}")
    bad += 0 if ok else 1

    head = _head("src/data/seoul-zones.json")
    if head is not None:
        old = {x.get("id"): x for x in head}
        diff = [x["id"] for x in src if x["id"] not in IDS and _norm(x) != _norm(old.get(x["id"]))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(src) - len(IDS)}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] not in IDS and _geo_key(x) != _geo_key(old.get(x["properties"]["id"], {}))]
        print(f"[{'OK' if not diff else 'FAIL'}] geojson 나머지 구역 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1

    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    doc = _data()
    z = doc["zone"]
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if len(src) != EXPECTED_COUNT:
        raise SystemExit(f"[중단] 예상 밖 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    old = next((x for x in src if x.get("id") == ZID), None)
    if old is None:
        raise SystemExit(f"[중단] {ZID} 없음")

    want = _entry(z)
    for k in ("holes", "parts", "dividers"):
        old.pop(k, None)
    old.update(want)
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")
    print(f"[반영] seoul-zones.json {ZID} — {len(want['polygon'])}정점 · 계측 {z['areaShape']:,}㎡ "
          f"(표기 {z['area']:,}㎡) · geom {z['geom']}")

    meta[META_KEY] = {"asOf": "2026-11-26", "zones": [ZID], "note": META_NOTE}
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[반영] zones-meta.json — {META_KEY}")

    _apply_pipeline(z)
    print("\n다음: npm run geojson && node scripts/build-zone-index.mjs")
    return 0


def _apply_pipeline(z: dict) -> None:
    sy = json.loads(SY.read_text(encoding="utf-8"))
    sy["sources"]["ys-notice-hangang65"] = {
        "label": "용산구 자료실 「한강로3가 65-100번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개」"
                 "(2026-10-28, 재정비사업과 02-2199-6644) 첨부 도면 — 구역계(적색선)·동의양식번호 제39호(번호부여 2026-10-26)",
        "url": "https://www.yongsan.go.kr/portal/bbs/B0000170/view.do?nttId=770995&menuNo=200848",
    }
    extra = z.get("pipelineSources") or {}
    for key, src in extra.items():
        sy["sources"][key] = src
    for it in sy.get("additions", []):
        if it.get("id") != ZID:
            continue
        it["sourceId"] = z["sid"]
        it["sources"] = ["ys-notice-hangang65"] + list(extra.keys())
        it["polygon"] = [z["ring"]]
        it["areaShape"] = z["areaShape"]
        it["center"] = z["center"]
        it["geom"] = z["geom"]
        it["boundaryApprox"] = False
        it["note"] = z["note"]
        it["boundaryNote"] = z["boundaryNote"]
        it["areaNote"] = z["areaNote"]
        it["drawing"] = z["drawing"]
        it["alias"] = z["alias"]
        it["stage"] = z["stage"]
        it["asOf"] = z["asOf"]
        print("[반영] official-sy.json — sy-hangangro3-65-100 폴리곤·출처")
    SY.write_text(json.dumps(sy, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    if "--check" in sys.argv:
        raise SystemExit(1 if check() else 0)
    apply()
