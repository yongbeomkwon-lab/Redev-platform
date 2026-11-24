#!/usr/bin/env python3
"""양재동 397-1 — 서초구 공개 구역계 도면(2026-11-19) 그대로 반영 + 사업예정구역 1·2 점선 (2026-11-24)

## 왜
  2026-11-24 대표 지시:
    "이거하고 똑같이 해줘 점선도 표사해주고"
  내려받은 서초구 「구역계_공개_안내문」(2026-11-19) 1쪽 도면(downloads/양재동_397_1_공고도면.png)의
  빨간 실선과 **필지 단위까지 똑같이** 맞추고, 가운데 보라색 굵은 점선(사업예정구역 1·2 경계)을
  지도 위에 점선으로 함께 그린다.

## 무엇이 바뀌나
  · polygon — 도면 빨간 실선 외곽을 픽셀 단위로 따라 옮긴 19정점 링(직접작도 8정점 → 공고도면 추적)
  · holes   — 도면 안쪽 빨간 고리(성당 396-2·396-10 · 구룡어린이공원 399 · 존치구역 종교부지 399-1)
  · dividers — 도면 보라 점선을 따라 그은 선 + '사업예정구역 1·2' 이름표 자리
  · geom "공고도면", areaShape 실측, areaNote·boundaryNote 를 사실대로 갱신
  ※ 표기면적(area 41,005㎡)은 공고·집계값 그대로 둔다. 나머지 2,378곳 구역은 건드리지 않는다.

## 자료
  scripts/data/yangjae-397-1-official-20261124.json — 위 도면에서 뽑은 링·점선·이름표 좌표
    · 축척 0.413m/px(2.42px/m)·회전 -1.31°: 도면 지번 4점(394-10·395-10·396-2·398-3)으로 잡은
      값을 기존 추적 링 8점을 빨간 선 픽셀에 다시 맞춰(평균 오차 1.3px) 확정
    · 경계 정점은 0.6m·구멍은 0.5m 허용오차로 단순화, 1.6m 이하 튐만 정리

실행: python3 scripts/apply-yangjae-397-1-official-20261124.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "yangjae-397-1-official-20261124.json"
META_KEY = "yangjae397Official20261124"
ZID = "yangjae-397-1"
EXPECTED_COUNT = 2379
AREA_PUBLISHED = 41005

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def _center(ring):
    lats = [p[0] for p in ring]
    lngs = [p[1] for p in ring]
    return [round((min(lats) + max(lats)) / 2, 6), round((min(lngs) + max(lngs)) / 2, 6)]


AREA_NOTE = (
    "서초구 공고문은 구역면적을 '약 4.1만㎡'로만 안내하고, 재개발닷컴 집계값 41,005㎡를 표기 면적으로 "
    "두었습니다. 2026-11-24 서초구 공개 도면(2026-11-19)의 빨간 실선을 그대로 따라 옮긴 도형의 실측 "
    "면적은 {outer}㎡(표기 대비 {dpct}%)이고, 도면 안쪽 빨간 고리로 빠진 성당·공원·존치구역 "
    "({hole}㎡)을 제외하면 {net}㎡입니다. 표기 면적은 이 제척 전 바깥 구역계를 기준으로 한 값이어서 "
    "실측과 {dpct}% 차이가 납니다."
)

BOUNDARY_NOTE = (
    "서초구 「구역계_공개_안내문」(2026-11-19) 1쪽 도면의 빨간 실선을 필지 단위로 그대로 옮긴 경계입니다"
    "(2026-11-24 반영, 19정점). 북동쪽 393·393-1(완충녹지)과 390 쪽 끝, 남동쪽 402-14·402-17·402-18"
    "(양재대로변 완충녹지)은 도면대로 구역 밖이고, 가운데 성당(396-2·396-10)·구룡어린이공원(399)·"
    "존치구역 종교부지(399-1)는 도면의 안쪽 빨간 고리 그대로 구멍(홀)으로 뺐습니다. 앞서 2026-11-24 "
    "대표가 지도에서 직접 그린 사방 도로선 경계는 이 도면 경계로 대체했습니다. 도면에는 구역을 둘로 "
    "나누는 보라색 점선이 있어 같은 자리에 '사업예정구역 1·2' 구분선으로 함께 그렸습니다. "
    "이 구역계는 신청인(추진주체)이 제출한 것으로 후보지 추천·자치구 협의 과정에서 조정될 수 있고, "
    "정밀 측량값이 아닙니다."
)


def _entry():
    d = _data()
    outer, hole = d["outer"], d["hole"]
    if len(outer) < 3 or len(hole) < 3:
        raise SystemExit("[중단] 링 정점이 모자랍니다")
    net = d["areaNet"]
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    hit = next((z for z in src if z.get("id") == ZID), None)
    if hit is None:
        raise SystemExit(f"[중단] {ZID} 가 seoul-zones.json 에 없습니다")
    entry = dict(hit)
    entry["polygon"] = outer
    entry["holes"] = [hole]
    entry["dividers"] = [
        {
            "coords": d["divider"]["coords"],
            "labels": d["divider"]["labels"],
        }
    ]
    entry["geom"] = "공고도면"
    entry["boundaryApprox"] = False
    entry["area"] = AREA_PUBLISHED
    entry["areaShape"] = net
    entry["ringPts"] = len(outer)
    entry["center"] = _center(outer)
    entry["centerLabel"] = "서초구 공개 구역계 도면(2026-11-19) 중심"
    entry["asOf"] = "2026-11-24"
    entry["areaNote"] = AREA_NOTE.format(
        outer=format(d["areaOuter"], ","),
        hole=format(d["areaHole"], ","),
        net=format(net, ","),
        dpct=f"{d['areaOuter'] / AREA_PUBLISHED * 100 - 100:+.1f}",
    )
    entry["boundaryNote"] = BOUNDARY_NOTE
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
    """내보내기는 경계 있는 구역의 center 속성을 빼기도 한다(커밋 432c1d7 이 복구한 문제)."""
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

    ok = bool(z and f) and _norm(z.get("polygon")) == _norm(entry["polygon"]) and _norm(z.get("holes")) == _norm(entry["holes"])
    print(f"[{'OK' if ok else 'FAIL'}] {ZID} 도형(외곽 {len(entry['polygon'])}정점 · 홀 {len(entry['holes'])}개) 일치")
    bad += 0 if ok else 1

    geo_outer = (((f or {}).get("geometry") or {}).get("coordinates") or [[]])[0]
    geo_holes = (((f or {}).get("geometry") or {}).get("coordinates") or [])[1:]
    body = lambda ring: ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    same_outer = len(body(geo_outer)) == len(entry["polygon"]) and all(
        abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(body(geo_outer), entry["polygon"])
    )
    same_holes = (
        len(geo_holes) == 1
        and len(body(geo_holes[0])) == len(entry["holes"][0])
        and all(abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(body(geo_holes[0]), entry["holes"][0]))
    )
    print(f"[{'OK' if same_outer and same_holes else 'FAIL'}] geojson 외곽·홀 좌표 일치")
    bad += 0 if (same_outer and same_holes) else 1

    props = (f or {}).get("properties") or {}
    ok = (
        props.get("geom") == "공고도면"
        and props.get("area") == AREA_PUBLISHED
        and abs((props.get("areaShape") or 0) - d["areaNet"]) <= 1
        and _norm(props.get("dividers")) == _norm(z.get("dividers") if z else None)
        and len(props.get("dividers") or []) == 1
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson 속성 — geom 공고도면 · area {props.get('area')} · "
          f"areaShape {props.get('areaShape')} · dividers {len(props.get('dividers') or [])}개")
    bad += 0 if ok else 1

    div = (z or {}).get("dividers") or [{}]
    ok = (
        len(div[0].get("coords") or []) == 2
        and len(div[0].get("labels") or []) == 2
        and [x["text"] for x in div[0].get("labels", [])] == ["사업예정구역 1", "사업예정구역 2"]
    )
    print(f"[{'OK' if ok else 'FAIL'}] 구분선 좌표 2점 · 이름표 2개(사업예정구역 1·2)")
    bad += 0 if ok else 1

    # 다른 구역은 그대로인가
    head = _head("src/data/seoul-zones.json")
    if head is not None:
        old_by = {x.get("id"): x for x in head}
        diff = [x["id"] for x in src if x.get("id") != ZID and _norm(x) != _norm(old_by.get(x.get("id")))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(src) - 1}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old_by = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] != ZID and _norm(x) != _norm(old_by.get(x["properties"]["id"]))]
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
    print(f"[반영] seoul-zones.json {ZID} — 외곽 {len(entry['polygon'])}정점 · 홀 {len(entry['holes'])}개 · "
          f"구분선 {len(entry['dividers'])}개 · 계측 {format(d['areaNet'], ',')}㎡ "
          f"(외곽 {format(d['areaOuter'], ',')}㎡ · 제척 {format(d['areaHole'], ',')}㎡)")

    meta[META_KEY] = {
        "asOf": "2026-11-24",
        "zones": [ZID],
        "note": (
            "양재동 397-1 구역계를 서초구 공개 도면(2026-11-19) 빨간 실선 그대로(19정점)로 교체하고, "
            "도면 안쪽 빨간 고리를 성당·공원·존치구역 홀로, 보라 점선을 사업예정구역 1·2 구분선으로 넣음. "
            f"도형 실측 외곽 {format(d['areaOuter'], ',')}㎡ · 제척 {format(d['areaHole'], ',')}㎡ · "
            f"차감 {format(d['areaNet'], ',')}㎡."
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
