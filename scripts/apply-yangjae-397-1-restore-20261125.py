#!/usr/bin/env python3
"""양재동 397-1 — 대표 원본 외곽(53,949㎡) 복원 + 제척 3곳 + 사업예정구역 1·2 점선 (2026-11-25)

## 왜
  2026-11-24 커밋 249b455 가 "대표 직접작도 8정점"이라며 되돌린 테두리가 실제 대표 원본이 아니라
  안쪽으로 줄어든 8정점(40,688㎡)이었다. 대표가 a1f209a 에서 직접 그린 원본은 8정점 53,948㎡
  (tmp/user_drawn_custom_zones.json 의 admin-mwu09p3s-dk8jl '양재동 397-1' ring 과 같은 값)이다.
  2026-11-25 대표 지시: "내가 그린 구역계에 성당 공원 그리거 건물하나만 빠지는거야"
  → 제척(구멍)은 성당·구룡어린이공원·전법회관 건물 세 곳만. 구룡유치원(399-1, 구룡사)은 구역 안 포함.

## 무엇이 바뀌나
  · polygon — a1f209a 의 대표 직접작도 8정점 그대로(실측 53,949㎡)
  · holes   — 3곳: 성당(396-2+396-10) · 구룡어린이공원(399) · 전법회관 건물(400-9)
              구룡유치원(399-1) 홀은 제거하고 구역 안에 포함
  · dividers — 사업예정구역 1·2 보라 점선은 종전 방향 그대로, 양 끝만 새 외곽 테두리와의 교점
  · areaShell 은 외곽−제척(49,322㎡), areaNote·boundaryNote 사실대로 갱신
  ※ 표기면적(area 41,005㎡)은 공고·집계값 그대로. 나머지 2,378곳은 건드리지 않는다.

## 검증
  홀 3곳이 모두 외곽 안에 있고 서로 겹치지 않는지, 구분선 양 끝이 새 외곽 테두리 위에 있는지,
  구분선이 외곽 밖으로 나가지 않는지, 이웃 구역과 겹치지 않는지, 나머지 구역 변경 0건인지 확인한다.

실행: python3 scripts/apply-yangjae-397-1-restore-20261125.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "yangjae-397-1-restore-20261125.json"
META_KEY = "yangjae397Restore20261125"
ZID = "yangjae-397-1"
EXPECTED_COUNT = 2379
NEIGHBOURS = ["11000UQ120PS202503070074", "11000UQ120PS202503070075"]  # 양재동 374 · 382
AREA_PUBLISHED = 41005
R = 6378137.0
M_PER_DEG_LAT = 111132.0

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


def _xy(p):
    """위경도 → 미터(구역 크기라 평면 근사로 충분)."""
    return (p[1] * M_PER_DEG_LAT * math.cos(math.radians(37.471)), p[0] * M_PER_DEG_LAT)


def seg_dist_m(pt, a, b) -> float:
    px, py = _xy(pt)
    ax, ay = _xy(a)
    bx, by = _xy(b)
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def boundary_dist_m(pt, ring) -> float:
    return min(seg_dist_m(pt, ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring)))


def overlap_area(a, b) -> float:
    """두 링이 실제로 겹치는 면적(㎡) — 맞닿은 변은 겹침으로 보지 않는다."""
    mx = M_PER_DEG_LAT * math.cos(math.radians(37.471))
    my = M_PER_DEG_LAT
    A = [(p[1] * mx, p[0] * my) for p in a]
    B = [(p[1] * mx, p[0] * my) for p in b]

    def clip(subject, clipper):
        def inside(p, a1, a2):
            return (a2[0] - a1[0]) * (p[1] - a1[1]) - (a2[1] - a1[1]) * (p[0] - a1[0]) >= 0

        def intersect(p1, p2, a1, a2):
            x1, y1 = p1
            x2, y2 = p2
            x3, y3 = a1
            x4, y4 = a2
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
    "(표기 대비 {dpct}%)이고, 그 안에서 필지 단위로 뺀 성당·구룡어린이공원·전법회관 자리"
    "({hole}㎡)를 제외하면 {net}㎡입니다. 표기 면적은 이 제척 전 바깥 구역계를 기준으로 한 값이어서 "
    "실측과 차이가 납니다."
)

BOUNDARY_NOTE = (
    "대표님(권용범)이 2026-11-24 리디브 지도에서 도로선·필지선에 맞춰 직접 그린 8정점 테두리입니다"
    "(geom 직접작도, 정밀 측량값 아님). 2026-11-25 복원 — 249b455 에서 안쪽으로 줄어든 테두리"
    "(40,688㎡)를 걷어내고 대표 원본(실측 53,949㎡)으로 되돌렸습니다. 구역 안에서 필지 단위로 뺀 곳은 "
    "세 곳 — 양재2동성당(396-2·396-10), 구룡어린이공원(399), 전법회관 건물 자리(400-9)이고, "
    "구룡유치원(399-1, 구룡사)은 구역 안에 포함됩니다(2026-11-25 대표 지시). 예미담·효신빌라 등 "
    "나머지 필지도 그대로 구역 안입니다. 가운데 사업예정구역 1·2 구분선(보라 점선)은 종전 방향 그대로 "
    "두고 양 끝을 새 테두리와의 교점으로 다시 계산했습니다. 이 구역계는 신청인(추진주체)이 제출한 "
    "것이어서 후보지 추천·자치구 협의 과정에서 조정될 수 있습니다."
)


def _entry():
    d = _data()
    outer, holes = d["outer"], [h["ring"] for h in d["holes"]]
    if len(outer) < 3 or len(holes) != 3:
        raise SystemExit("[중단] 링 정점·구멍 수가 예상과 다릅니다")
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
    entry["asOf"] = "2026-11-25"
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


def _body(ring):
    return ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring


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
    same_outer = len(_body(geo_outer)) == len(entry["polygon"]) and all(
        abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(_body(geo_outer), entry["polygon"])
    )
    same_holes = len(geo_holes) == len(entry["holes"]) and all(
        len(_body(g)) == len(h) and all(abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(_body(g), h))
        for g, h in zip(geo_holes, entry["holes"])
    )
    print(f"[{'OK' if same_outer and same_holes else 'FAIL'}] geojson 외곽·홀 좌표 일치")
    bad += 0 if (same_outer and same_holes) else 1

    # 외곽이 a1f209a 원본과 같은가 — 좌표 그대로 비교
    want = [[37.4724083, 127.0467935], [37.470459, 127.0490461], [37.4715981, 127.0507312], [37.4725401, 127.049754],
            [37.4723555, 127.0494882], [37.4731397, 127.0486691], [37.4730542, 127.0485616], [37.4733471, 127.0482396]]
    ok = _norm(entry["polygon"]) == _norm(want)
    print(f"[{'OK' if ok else 'FAIL'}] 외곽 8정점이 a1f209a 대표 원본과 동일")
    bad += 0 if ok else 1

    # 형상 검증 — 홀이 외곽 안에 있고 서로 겹치지 않는가
    outside = sum(len(ring_inside(h, entry["polygon"])) for h in entry["holes"])
    print(f"[{'OK' if outside == 0 else 'FAIL'}] 홀 꼭짓점이 모두 외곽 안 ({outside}개 밖)")
    bad += 0 if outside == 0 else 1
    overlap = []
    for i in range(len(entry["holes"])):
        for j in range(i + 1, len(entry["holes"])):
            a = overlap_area(entry["holes"][i], entry["holes"][j])
            if a > 1.0:
                overlap.append((d["holes"][i]["key"], d["holes"][j]["key"], round(a, 1)))
    print(f"[{'OK' if not overlap else 'FAIL'}] 홀끼리 겹침 {len(overlap)}쌍" + ("" if not overlap else f" {overlap}"))
    bad += 0 if not overlap else 1

    keys = [h["key"] for h in d["holes"]]
    ok = keys == ["church", "park", "temple"]
    print(f"[{'OK' if ok else 'FAIL'}] 제척 3곳 = {keys} (구룡유치원 홀 없음)")
    bad += 0 if ok else 1

    # 구분선 — 양 끝이 새 외곽 테두리 위, 선 전체가 외곽 안
    coords = [tuple(p) for p in d["divider"]["coords"]]
    ends = [boundary_dist_m(p, entry["polygon"]) for p in coords]
    ok = all(x <= 1.0 for x in ends)
    print(f"[{'OK' if ok else 'FAIL'}] 구분선 양 끝 ↔ 외곽 테두리 거리 {[round(x, 2) for x in ends]}m")
    bad += 0 if ok else 1
    # 중간점 20개가 모두 외곽 안(밖으로 새지 않음)
    mids = [(coords[0][0] + (coords[1][0] - coords[0][0]) * k / 20,
             coords[0][1] + (coords[1][1] - coords[0][1]) * k / 20) for k in range(21)]
    out_mids = ring_inside(mids, entry["polygon"])
    print(f"[{'OK' if not out_mids else 'FAIL'}] 구분선이 외곽 밖으로 나간 점 {len(out_mids)}개")
    bad += 0 if not out_mids else 1
    # 이름표가 외곽 안·홀 밖
    lab_bad = [lb["text"] for lb in d["divider"]["labels"]
               if ring_inside([tuple(lb["at"])], entry["polygon"])
               or any(not ring_inside([tuple(lb["at"])], h) for h in entry["holes"])]
    print(f"[{'OK' if not lab_bad else 'FAIL'}] 구분선 이름표 자리(외곽 안·홀 밖) — 문제 {lab_bad}")
    bad += 0 if not lab_bad else 1

    # 이웃(374·382)과 겹치지 않는가
    n_over = []
    for nid in NEIGHBOURS:
        nf = _feat(geo, nid)
        if not nf or not nf.get("geometry"):
            continue
        g0 = nf["geometry"]["coordinates"]
        rings = [g0[0]] if nf["geometry"]["type"] == "Polygon" else [p[0] for p in g0]
        for r in rings:
            ring = [[p[1], p[0]] for p in _body(r)]
            a = overlap_area(entry["polygon"], ring)
            if a > 1.0:
                n_over.append((nid, round(a, 1)))
    print(f"[{'OK' if not n_over else 'FAIL'}] 이웃 374·382 겹침 {len(n_over)}곳" + ("" if not n_over else f" {n_over}"))
    bad += 0 if not n_over else 1

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
        "asOf": "2026-11-25",
        "zones": [ZID],
        "note": (
            "양재동 397-1 구역계를 249b455 에서 줄어든 테두리(40,688㎡)에서 대표 직접작도 원본 8정점"
            f"(실측 {format(d['areaOuter'], ',')}㎡)으로 복원. 제척은 성당·구룡어린이공원·전법회관 건물 "
            f"세 곳({format(d['areaHole'], ',')}㎡)만 두고 구룡유치원(399-1)은 구역 안 포함. "
            f"사업예정구역 1·2 점선 양 끝은 새 외곽 테두리 교점으로 재계산. 차감 {format(d['areaNet'], ',')}㎡."
        ),
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[기록] zones-meta.json — {META_KEY}")

    print("[내보내기] node scripts/export-geojson.mjs")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
