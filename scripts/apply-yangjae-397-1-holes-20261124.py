#!/usr/bin/env python3
"""양재동 397-1 — 성당·공원·유치원 제척(구멍/홀) 반영 (2026-11-24)

## 왜
  2026-11-24 대표 지시:
    ① "397-1 성당 공원등 재개발닷컴보고 그 부분만 빼준다는거는?"
    ② "거기 공원 옆에 건물 1-2개도 빠지는 걸로 보이는데 이빨 빠진거처럼"
  재개발닷컴 구역 지도에서 397-1 안쪽 성당·공원 자리가 하얗게 비어 보이는 것과 같은 모양으로,
  **대표가 그린 바깥 테두리는 그대로 두고** 그 안의 시설만 구멍(GeoJSON inner ring)으로 뺀다.

## 무엇을 빼나 (scripts/data/yangjae-397-1-excluded-20261124.json)
  · church  양재동 396-2 + 396-10 (포이동성당 = 양재2동성당, 건축물 주용도 종교시설)
            396-2 1,419㎡ + 396-10 999㎡ → 합친 링 2,416㎡ (두 필지는 맞닿아 있다)
  · park    양재동 399 구룡어린이공원 1,651㎡ (구룡공원 공영주차장이 같은 필지, 논현로5길 29)
  · school  양재동 399-1 구룡유치원 2,200㎡ — 서초구 구역계 도면의 '존치구역(종교부지)' 자리
  필지 경계는 브이월드 연속지적도(LP_PA_CBND_BUBUN)에서 2026-11-24 실측한 링 그대로.

## 손보는 곳
  · holes — 위 3개 링([위도,경도]), GeoJSON inner ring 으로 나간다
  · areaShape — 바깥 면적에서 홀을 뺀 계측 면적(EPSG:5179)
  · areaNote / boundaryNote — 무엇을 왜 뺐는지, 필지 출처를 적는다
  ※ 바깥 테두리(polygon)·표기면적(area)·나머지 속성은 절대 바꾸지 않는다.

실행: python3 scripts/apply-yangjae-397-1-holes-20261124.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "yangjae-397-1-excluded-20261124.json"
META_KEY = "yangjae397Excluded20261124"
ZID = "yangjae-397-1"
EXPECTED_COUNT = 2379

AREA_NOTE = (
    "서초구 공고문은 구역면적을 '약 4.1만㎡'로만 안내하고, 재개발닷컴 집계값 41,005㎡를 표기 면적으로 두었습니다. "
    "지도 도형은 2026-11-24 대표가 지도에서 직접 그린 경계로, 계측 면적은 {shape}㎡(표기 대비 {pct}%)입니다. "
    "이 값은 구역 안에서 빼낸 성당·공원·유치원 3곳(합 {holes}㎡)을 제외한 면적입니다. "
    "공개된 구역계보다 사방 도로선까지 넓게 잡혀 있어 차이가 큰 편이므로, 후보지 추천·자치구 협의 도면과 "
    "대조한 뒤 확정값으로 대체해야 합니다."
)

BOUNDARY_NOTE = (
    "2026-11-24 리디브 지도 관리자 화면에서 대표가 직접 그린 8정점 경계입니다. 서초구 「구역계_공개_안내문」"
    "(2026-11-19) 도면을 기준으로 삼아 사방 도로선까지 채웠고, 사업예정구역 2곳과 종교부지(존치구역)를 모두 "
    "포함한 바깥 구역계입니다. 이웃 374·382(양재동 380) 구역과는 겹침 0㎡, 도로 폭 3~5m 간격으로 마주 봅니다. "
    "이 구역계는 신청인이 제출한 것으로 후보지 추천·자치구 협의 과정에서 조정될 수 있으며, 정밀 측량값이 아닙니다. "
    "이어 2026-11-24 대표 지시로 바깥 테두리는 그대로 둔 채 구역 안의 시설 3곳을 구멍(홀)으로 빼냈습니다 — "
    "① 양재동 396-2·396-10 양재2동(포이동)성당, 건축물 주용도 종교시설 4층(2,416㎡) "
    "② 양재동 399 구룡어린이공원, 구룡공원 공영주차장 포함(1,656㎡) "
    "③ 양재동 399-1 구룡유치원, 서초구 구역계 도면에 '존치구역(종교부지)'로 표시된 자리(2,200㎡). "
    "필지 경계는 브이월드 연속지적도(2026-11-24 조회)의 실측 링을 그대로 썼습니다."
)

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _rings():
    """제척 링 3개 — [[위도, 경도], …] (폐합점 없이 저장)"""
    data = json.loads(DATA.read_text(encoding="utf-8"))
    out = []
    for g in data["groups"]:
        ring = [list(p) for p in g["ring"]]
        if len(ring) < 3:
            raise SystemExit(f"[중단] {g['key']} 정점 {len(ring)}개 — 폴리곤이 아닙니다")
        if ring[0] == ring[-1]:
            ring = ring[:-1]
        out.append((g["key"], g["label"], ring))
    return out


def _projected():
    from pyproj import Transformer
    from shapely.geometry import Polygon
    import shapely

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    return Transformer, Polygon, shapely, fwd


def _measure(ring_lat_lng) -> float:
    Transformer, Polygon, shapely, fwd = _projected()
    poly = Polygon([(lng, lat) for lat, lng in ring_lat_lng])
    return shapely.transform(poly, lambda c: list(zip(*fwd.transform(c[:, 0], c[:, 1])))).area


def _geometry_after_holes(outer, holes) -> float:
    Transformer, Polygon, shapely, fwd = _projected()
    fp = lambda ring: Polygon([(lng, lat) for lat, lng in ring])
    poly = fp(outer)
    for h in holes:
        poly = poly.difference(fp(h))
    return shapely.transform(poly, lambda c: list(zip(*fwd.transform(c[:, 0], c[:, 1])))).area


def _entry():
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    hit = next((z for z in src if z.get("id") == ZID), None)
    if hit is None:
        raise SystemExit(f"[중단] {ZID} 가 seoul-zones.json 에 없습니다")
    groups = _rings()
    holes = [ring for _, _, ring in groups]
    outer = hit["polygon"]
    shape = _geometry_after_holes(outer, holes)
    hole_area = _measure(outer) - shape
    entry = dict(hit)
    entry["holes"] = holes
    entry["areaShape"] = int(round(shape))
    entry["asOf"] = "2026-11-24"
    entry["areaNote"] = AREA_NOTE.format(
        shape=format(int(round(shape)), ","), pct=f"{shape / hit['area'] * 100 - 100:+.1f}",
        holes=format(int(round(hole_area)), ","),
    )
    entry["boundaryNote"] = BOUNDARY_NOTE
    return entry, holes, shape, hole_area


def _head(path: str):
    try:
        raw = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _restore_centers() -> None:
    """내보내기는 경계 있는 구역의 center 속성을 빼기도 한다(커밋 432c1d7 이 복구한 문제).

    이번 작업과 무관한 구역의 center 가 사라지면 그 구역 데이터가 바뀐 것이므로 HEAD 값으로 되돌린다.
    """
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
    entry, holes, shape, hole_area = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))

    ok = (
        len(src) == len(geo["features"]) == EXPECTED_COUNT
        and index.get("count") == EXPECTED_COUNT
        and (geo.get("metadata") or {}).get("count") == EXPECTED_COUNT
    )
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    bad += 0 if ok else 1

    z = next((x for x in src if x.get("id") == ZID), None)
    f = _feat(geo, ZID)
    geo_holes = (((f or {}).get("geometry") or {}).get("coordinates") or [])[1:]
    # 내보내기는 링을 폐합한다(끝점 = 첫점) — 폐합점을 빼고 비교한다
    geo_holes_body = [g[:-1] if len(g) > 1 and g[0] == g[-1] else g for g in geo_holes]
    same_holes = len(geo_holes_body) == len(holes) and all(
        len(g) == len(h) and all(abs(a[1] - b[0]) < 1e-6 and abs(a[0] - b[1]) < 1e-6 for a, b in zip(g, h))
        for g, h in zip(geo_holes_body, holes)
    )
    ok = bool(
        z and f
        and len(z.get("holes") or []) == len(holes)
        and same_holes
        and f["geometry"]["type"] == "Polygon"
        and abs((z.get("areaShape") or 0) - round(shape)) <= 1
        and abs((f["properties"].get("areaShape") or 0) - round(shape)) <= 1
    )
    print(f"[{'OK' if ok else 'FAIL'}] {ZID} — 홀 {len(z.get('holes') or [])}개(기대 {len(holes)}) · "
          f"geojson inner ring {len(geo_holes)}개 · 계측 {format(shape, ',.0f')}㎡ · 제척 {format(hole_area, ',.0f')}㎡")
    bad += 0 if ok else 1

    # 바깥 테두리는 손대지 않았는가 — HEAD 와 좌표 비교
    head = _head("src/data/seoul-zones.json")
    if head is not None:
        hz = next((x for x in head if x.get("id") == ZID), None)
        ok = bool(hz) and _norm(hz.get("polygon")) == _norm(z.get("polygon"))
        print(f"[{'OK' if ok else 'FAIL'}] 바깥 테두리(polygon) — HEAD 와 동일 (정점 {len(z.get('polygon') or [])}개)")
        bad += 0 if ok else 1

    # 홀이 바깥 안에 있고 서로 겹치지 않는가
    Transformer, Polygon, shapely, fwd = _projected()
    outer = Polygon([(lng, lat) for lat, lng in z["polygon"]])
    ins = []
    for (key, label, ring) in _rings():
        hp = Polygon([(lng, lat) for lat, lng in ring])
        ins.append((key, hp))
    ok_in = all(hp.is_valid and hp.within(outer) for _, hp in ins)
    ok_ov = all(ins[i][1].intersection(ins[j][1]).area == 0 for i in range(len(ins)) for j in range(i + 1, len(ins)))
    print(f"[{'OK' if ok_in else 'FAIL'}] 홀 {len(ins)}개 모두 바깥 테두리 안 · 유효 도형")
    print(f"[{'OK' if ok_ov else 'FAIL'}] 홀끼리 겹침 없음")
    bad += (0 if ok_in else 1) + (0 if ok_ov else 1)

    # 다른 구역은 그대로
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old_by = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] != ZID and _norm(x) != _norm(old_by.get(x["properties"]["id"]))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(geo['features']) - 1}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1

    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY}")
    bad += 0 if ok else 1

    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    entry, holes, shape, hole_area = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if len(src) != EXPECTED_COUNT:
        raise SystemExit(f"[중단] 예상 밖 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    by_id = {z.get("id"): z for z in src}
    old = by_id.get(ZID)
    if old is None:
        raise SystemExit(f"[중단] {ZID} 없음")
    if _norm(old.get("polygon")) != _norm(entry["polygon"]):
        raise SystemExit("[중단] 저장 전후 바깥 테두리가 달라졌습니다 — 중단")
    old.clear()
    old.update(entry)
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")
    print(f"[반영] seoul-zones.json {ZID} — 홀 {len(holes)}개 · 계측 {format(shape, ',.0f')}㎡ "
          f"(제척 {format(hole_area, ',.0f')}㎡)")

    meta[META_KEY] = {
        "asOf": "2026-11-24",
        "zones": [ZID],
        "note": (
            "양재동 397-1 일대에서 성당·공원·유치원 3곳을 구역 안 구멍(홀)으로 제척. "
            "바깥 테두리는 대표 작도 그대로 두고, 필지는 브이월드 연속지적도 실측 링. "
            "396-2+396-10(성당) · 399(구룡어린이공원) · 399-1(구룡유치원)."
        ),
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
