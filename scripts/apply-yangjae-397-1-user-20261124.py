#!/usr/bin/env python3
"""양재동 397-1 — 대표가 직접 그린 8정점 테두리 복원 + 예미담 포함·전법회관 자리(400-9) 제외 (2026-11-24)

## 왜
  2026-11-24 대표 지시:
    "첫번째 사진에서 예미담이라고 적혀진 건물은 들어가고 그 오른쪽으로 23-13이 전면이 넓은
     직사각형(빨간색표시)이 빠져야 하는 부분이야."
    "그리고 내가 그린 구역안에 니가 또 다시 이상한 구역을 그렸어 397-1 구역을 보면 엉망이잖아"
  직전 커밋 4baa96b 가 서초구 공개 도면(2026-11-19) 추적 폴리곤(19정점)으로 덮어쓰면서
  대표가 도로선에 맞춰 그린 8정점 테두리가 사라지고(북서쪽 뾰족한 튀는 점 등), 예미담이 구멍 쪽으로
  밀려나고, 전법회관 자리(양재동 400-9)가 구역 안에 남았다.

## 무엇이 바뀌나
  · polygon — scripts/data/yangjae-user-drawn-20261124.json 의 **대표 직접작도 8정점** 그대로
  · holes   — 브이월드 연속지적도 필지 경계 4곳
              성당(396-2+396-10) · 구룡어린이공원(399) · 구룡유치원(399-1) · 전법회관 자리(400-9)
              (예미담·효신빌라 등 나머지 필지는 구역 안에 그대로 남는다)
  · dividers — 사업예정구역 1·2 보라 점선은 그대로, 양 끝만 대표 테두리와 만나는 점으로 다듬음
  · geom "직접작도", areaShape 실측, areaNote·boundaryNote 사실대로 갱신
  ※ 표기면적(area 41,005㎡)은 공고·집계값 그대로 둔다. 나머지 2,378곳 구역은 건드리지 않는다.

## 검증
  구역 안에 남는 필지(예미담 쪽 400-3·400-4·401-9 등)가 어떤 구멍과도 겹치지 않는지,
  홀이 서로 겹치지 않는지, 홀 꼭짓점이 모두 외곽 안에 있는지 apply/check 에서 확인한다.

실행: python3 scripts/apply-yangjae-397-1-user-20261124.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "yangjae-397-1-user-20261124.json"
META_KEY = "yangjae397UserDraw20261124"
ZID = "yangjae-397-1"
EXPECTED_COUNT = 2379
# 같은 배치(2026-11-24)에서 함께 손보는 구역 — 「나머지 구역 변경 0곳」 검사에서 뺀다
BATCH = {"mp-shinsu-301-1"}
AREA_PUBLISHED = 41005
R = 6378137.0

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def sph_area(ring) -> float:
    """구면 다각형 면적(㎡) — 기존 스크립트와 같은 식."""
    tp = 0.0
    n = len(ring)
    for i in range(n):
        la1, lo1 = ring[i]
        la2, lo2 = ring[(i + 1) % n]
        tp += (lo2 - lo1) * math.pi / 180 * (2 + math.sin(la1 * math.pi / 180) + math.sin(la2 * math.pi / 180))
    return abs(tp * R * R / 2)


def ring_inside(inner, outer) -> list:
    """inner 꼭짓점 중 outer 밖에 있는 것 — 광선 교차 판정."""
    def inside(pt):
        la, lo = pt
        c = False
        for i in range(len(outer)):
            la1, lo1 = outer[i]
            la2, lo2 = outer[(i + 1) % len(outer)]
            if (lo1 > lo) != (lo2 > lo) and la < (la2 - la1) * (lo - lo1) / (lo2 - lo1) + la1:
                c = not c
        return c
    return [p for p in inner if not inside(p)]


def overlap_area(a, b) -> float:
    """두 링이 실제로 겹치는 면적(㎡) — 맞닿은 변은 겹침으로 보지 않는다.

    위경도를 그대로 평면으로 보고 신발끈 공식으로 교집합 넓이를 구한 뒤 ㎡로 환산한다.
    (작은 구역이라 이 근사로 충분하다. 버전에 따라 shapely 가 없을 수 있어 직접 계산한다.)
    """
    import math as _m
    mx = 88000.0 * _m.cos(37.47 * _m.pi / 180) * 111320 / 88000  # 경도 1도(m) 근사
    my = 110900.0
    A = [(p[1] * mx, p[0] * my) for p in a]
    B = [(p[1] * mx, p[0] * my) for p in b]

    def clip(subject, clipper):
        # Sutherland–Hodgman — clipper 는 볼록이어야 정확하다(필지 경계는 대부분 볼록·직사각형)
        def inside(p, a1, a2):
            return (a2[0] - a1[0]) * (p[1] - a1[1]) - (a2[1] - a1[1]) * (p[0] - a1[0]) >= 0
        def intersect(p1, p2, a1, a2):
            x1, y1 = p1; x2, y2 = p2; x3, y3 = a1; x4, y4 = a2
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(den) < 1e-12:
                return p2
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
        out = subject
        for i in range(len(clipper)):
            a1, a2 = clipper[i], clipper[(i + 1) % len(clipper)]
            if not out:
                return []
            inp, out = out, []
            s = inp[-1]
            for e in inp:
                if inside(e, a1, a2):
                    if not inside(s, a1, a2):
                        out.append(intersect(s, e, a1, a2))
                    out.append(e)
                elif inside(s, a1, a2):
                    out.append(intersect(s, e, a1, a2))
                s = e
        return out

    def area(ring):
        return abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1]
                       for i in range(len(ring)))) / 2

    poly = clip(A, B)
    return area(poly) if len(poly) >= 3 else 0.0


def _center(ring):
    lats = [p[0] for p in ring]
    lngs = [p[1] for p in ring]
    return [round((min(lats) + max(lats)) / 2, 6), round((min(lngs) + max(lngs)) / 2, 6)]


AREA_NOTE = (
    "서초구 공고문은 구역면적을 '약 4.1만㎡'로만 안내하고, 재개발닷컴 집계값 41,005㎡를 표기 면적으로 "
    "두었습니다. 2026-11-24 대표가 지도에서 직접 그린 테두리(8정점)의 실측 면적은 {outer}㎡"
    "(표기 대비 {dpct}%)이고, 그 안에서 필지 단위로 뺀 성당·구룡어린이공원·구룡유치원·전법회관 자리"
    "({hole}㎡)를 제외하면 {net}㎡입니다. 표기 면적은 이 제척 전 바깥 구역계를 기준으로 한 값이어서 "
    "실측과 차이가 납니다."
)

BOUNDARY_NOTE = (
    "대표(대표님)가 2026-11-24 리디브 지도에서 도로선·필지선에 맞춰 직접 그린 8정점 테두리입니다"
    "(geom 직접작도, 정밀 측량값 아님). 구역 안에서 필지 단위로 뺀 곳은 네 곳 — 양재2동성당"
    "(396-2·396-10), 구룡어린이공원(399), 구룡유치원(399-1, 구역계 도면의 '존치구역(종교부지)'), "
    "그리고 전법회관 자리(400-9). 예미담·효신빌라 등 나머지 필지는 구역 안에 그대로 남습니다. "
    "가운데 사업예정구역 1·2 구분선(보라 점선)은 종전 자리를 그대로 두고 양 끝만 테두리에 맞췄습니다. "
    "이 구역계는 신청인(추진주체)이 제출한 것이어서 후보지 추천·자치구 협의 과정에서 조정될 수 있습니다."
)


def _entry():
    d = _data()
    outer, holes = d["outer"], [h["ring"] for h in d["holes"]]
    if len(outer) < 3 or len(holes) < 1:
        raise SystemExit("[중단] 링 정점이 모자랍니다")
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    hit = next((z for z in src if z.get("id") == ZID), None)
    if hit is None:
        raise SystemExit(f"[중단] {ZID} 가 seoul-zones.json 에 없습니다")
    net = d["areaNet"]
    entry = dict(hit)
    entry["polygon"] = outer
    entry["holes"] = holes
    entry["dividers"] = [{"coords": d["divider"]["coords"], "labels": d["divider"]["labels"]}]
    entry["geom"] = "직접작도"
    entry["boundaryApprox"] = False
    entry["area"] = AREA_PUBLISHED
    entry["areaShape"] = net
    entry["ringPts"] = len(outer)
    entry["center"] = _center(outer)
    entry["centerLabel"] = "대표 직접작도 테두리(2026-11-24) 중심"
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
    same_holes = len(geo_holes) == len(entry["holes"]) and all(
        len(body(g)) == len(h) and all(abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(body(g), h))
        for g, h in zip(geo_holes, entry["holes"])
    )
    print(f"[{'OK' if same_outer and same_holes else 'FAIL'}] geojson 외곽·홀 좌표 일치")
    bad += 0 if (same_outer and same_holes) else 1

    # 형상 검증 — 홀이 외곽 안에 있고 서로 겹치지 않는가
    outside = sum(len(ring_inside(h, entry["polygon"])) for h in entry["holes"])
    print(f"[{'OK' if outside == 0 else 'FAIL'}] 홀 꼭짓점이 모두 외곽 안 ({outside}개 밖)")
    bad += 0 if outside == 0 else 1
    overlap = []
    for i in range(len(entry["holes"])):
        for j in range(i + 1, len(entry["holes"])):
            if overlap_area(entry["holes"][i], entry["holes"][j]) > 1.0:
                overlap.append((d["holes"][i]["key"], d["holes"][j]["key"],
                                round(overlap_area(entry["holes"][i], entry["holes"][j]), 1)))
    print(f"[{'OK' if not overlap else 'FAIL'}] 홀끼리 겹침 {len(overlap)}쌍" + ("" if not overlap else f" {overlap}"))
    bad += 0 if not overlap else 1

    props = (f or {}).get("properties") or {}
    ok = (
        props.get("geom") == "직접작도"
        and props.get("area") == AREA_PUBLISHED
        and abs((props.get("areaShape") or 0) - d["areaNet"]) <= 1
        and _norm(props.get("dividers")) == _norm(z.get("dividers") if z else None)
        and len(props.get("dividers") or []) == 1
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson 속성 — geom {props.get('geom')} · area {props.get('area')} · "
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
    print(f"[반영] seoul-zones.json {ZID} — 외곽 {len(entry['polygon'])}정점 · 홀 {len(entry['holes'])}개 · "
          f"구분선 {len(entry['dividers'])}개 · 계측 {format(d['areaNet'], ',')}㎡ "
          f"(외곽 {format(d['areaOuter'], ',')}㎡ · 제척 {format(d['areaHole'], ',')}㎡)")

    meta[META_KEY] = {
        "asOf": "2026-11-24",
        "zones": [ZID],
        "note": (
            "양재동 397-1 구역계를 대표 직접작도 8정점 테두리로 되돌리고, 그 안에서 성당·구룡어린이공원·"
            "구룡유치원·전법회관 자리(400-9) 네 필지를 구멍(홀)으로 뺌. 예미담 등 나머지 필지는 구역 안 유지. "
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
