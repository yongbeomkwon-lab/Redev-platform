#!/usr/bin/env python3
"""🔥 개발압력 **가상 구역경계** — 미지정 노후 저층지가 묶였을 때의 '블록' 폴리곤 산출

무엇을 하나
  ① `public/data/dev-pressure.json` 상위 핫스팟을 고른다(기본: 상위 140곳 검토 → 80곳 채택).
  ② 핫스팟마다 주변의 **30년 이상 저층 건물**(외곽 250㎡ 이하, 아파트 동·단지 제외)을 10m 격자에 찍어
     '골목으로 이어진 도시 조직'을 만들고(닫힘 10m), 핫스팟에서 가까운 쪽부터 **목표 면적까지 자란다**.
     · 큰 도로·학교·공원은 건물이 없어 자라지 못한다 — 경계가 거기서 멈춘다.
     · 기존 정비구역(`zones.geojson`)·아파트 단지(OSM)는 나중에 빼서 겹침을 없앤다.
  ③ 잔가닥(1칸 폭 꼬리)은 열기(erosion→dilation)로 쳐내고, 외곽을 2~3m 단순화해 폴리곤으로 저장한다.
  ④ 지도 카드에 쓸 통계(면적·평·노후 비율·저층 동수·주변 아파트·주변 구역)를 함께 담는다.

결과: `public/data/dev-pressure-blocks.json`
  { id, areaM2, pyeong, oldPct, bldCount, aptCount, zones, center, polygon:[[lat,lng],…], holes:[[[lat,lng],…]] }

  ★ 이 경계는 **참고용 추정**이다. 고시된 구역계가 아니므로 지도에서도 점선으로만 그린다.

  python3 scripts/build-dev-pressure-blocks.py [--top 80] [--review 140] [--verbose] [--ids id1,id2]
"""
from __future__ import annotations

import argparse
import glob
import gzip
import heapq
import json
import math
import os
import sys
from collections import defaultdict

import numpy as np
import shapely
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from shapely.geometry import MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "tmp", "devpressure")
SRC = os.path.join(ROOT, "public", "data", "dev-pressure.json")
OUT = os.path.join(ROOT, "public", "data", "dev-pressure-blocks.json")

NOW_YEAR = 2026
OLD_YEAR = NOW_YEAR - 30      # 1996년 이전 사용승인 = 30년 이상
LOW_AREA = 250.0              # 저층 주택(단독·다세대·빌라) 외곽면적 상한
LAT0, LON0 = 37.55, 126.90    # 로컬 등장방형 투영 원점(서울 중심)
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 110540.0

CELL_M = 10.0        # 격자 한 변
GATHER_M = 460.0     # 핫스팟 둘레에서 건물을 모으는 반경
GROW_M = 380.0       # 핫스팟에서 이보다 멀리는 자라지 않는다
TARGET_M2 = 26000.0  # 목표 면적 — 2.6ha 남짓(시안 2.5만㎡와 같은 규모)
MIN_AREA = 5000.0    # 이보다 작으면 파편 — 버린다
MAX_AREA = 80000.0   # (안전 상한) 8ha
MIN_BLD = 30         # 경계 안 저층 건물 하한
MIN_OLD = 70         # 노후(30년↑) 비율 하한
MIN_SOLID = 0.40     # 면적 / 볼록껍질 면적 — 너무 길쭉하면 '블록'으로 보지 않는다
HOLE_MIN = 1500.0    # 이보다 큰 내부 구멍(학교·단지)은 남긴다


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def xy(lng: float, lat: float) -> tuple[float, float]:
    return (lng - LON0) * KX, (lat - LAT0) * KY


def lnglat(x: float, y: float) -> tuple[float, float]:
    return x / KX + LON0, y / KY + LAT0


# ── 입력 ──────────────────────────────────────────────────────────────────────
def load_buildings():
    """건물 (경도, 위도, 외곽면적, 사용승인연도).

    ⚠️ 1,000동 상한에 걸린 타일(`truncated`)은 건물 40% 가까이 빠져 있어 그대로 쓰면
       가상경계가 성기게 나온다(2026-11-22 확인). 그 타일은 `tiles-fine/` 의 3×3 하위 타일로
       대체한다(`scripts/fetch-dev-buildings-fine.py`).
    """
    files = sorted(glob.glob(os.path.join(WORK, "tiles", "*.json.gz")))
    if not files:
        raise SystemExit("건물 타일이 없습니다 — scripts/fetch-dev-buildings.py 를 먼저 돌리세요.")
    out = []
    fine_dirs = set()
    for f in files:
        d = json.load(gzip.open(f, "rt"))
        tx, ty = d["tile"]
        if d.get("truncated"):
            if glob.glob(os.path.join(WORK, "tiles-fine", f"{tx}_{ty}_*.json.gz")):
                fine_dirs.add((tx, ty))
                continue  # 하위 타일로 대체
        for lng, lat, area, year in d["rows"]:
            out.append((lng, lat, area, year))
    for f in sorted(glob.glob(os.path.join(WORK, "tiles-fine", "*.json.gz"))):
        d = json.load(gzip.open(f, "rt"))
        if tuple(d["tile"][:2]) not in fine_dirs:
            continue
        for lng, lat, area, year in d["rows"]:
            out.append((lng, lat, area, year))
    log(f"  · 잘린 타일 {len(fine_dirs)}개는 tiles-fine 로 대체")
    return out


def load_apt_polys(path):
    """build-dev-pressure.py 와 같은 규칙으로 OSM 아파트 동(footprint)·단지(landuse) 폴리곤."""
    import re

    d = json.load(open(path, encoding="utf-8"))
    polys = []
    for el in d["elements"]:
        t = el.get("tags") or {}
        name = (t.get("name") or "").strip()
        bld = t.get("building") == "apartments"
        n = name.replace(" ", "")
        landuse = (
            t.get("landuse") == "residential"
            and bool(n)
            and not re.search(r"연립|빌라|단독|다세대|주택단지|마을$", n)
            and (("아파트" in n) or ("APT" in n.upper()) or n.endswith("단지"))
        )
        if not (bld or landuse):
            continue
        geoms = []
        if el["type"] == "way":
            g = el.get("geometry")
            if g and len(g) >= 3:
                geoms.append(g)
        else:
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("geometry") and len(m["geometry"]) >= 3:
                    geoms.append(m["geometry"])
        for g in geoms:
            ring = [xy(p["lon"], p["lat"]) for p in g]
            poly = Polygon(ring)
            if poly.is_valid and poly.area > 30:
                polys.append((poly, name, bld))
    return polys


def load_zones():
    data = json.load(open(os.path.join(ROOT, "public", "data", "zones.geojson"), encoding="utf-8"))
    out = []
    for f in data["features"]:
        p = f["properties"]
        name = str(p.get("name") or "")
        stage = str(p.get("stage") or "")
        if any(k in stage or k in name for k in ("해제", "취소")):
            continue
        geom = f.get("geometry")
        if not geom:
            continue
        parts = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        rings = []
        for poly in parts:
            outer = [xy(pt[0], pt[1]) for pt in poly[0]]
            if len(outer) >= 3:
                pg = Polygon(outer)
                if pg.is_valid and pg.area > 20:
                    rings.append(pg)
        if not rings:
            continue
        out.append((unary_union(rings), p.get("id"), name, stage))
    return out


# ── 덩어리 자라기 → 폴리곤 ─────────────────────────────────────────────────────
def disk(r: float) -> np.ndarray:
    n = int(math.ceil(r))
    yy, xx = np.mgrid[-n : n + 1, -n : n + 1]
    return (xx * xx + yy * yy) <= r * r + 1e-9


def block_at(h, P, tree, zones, zone_tree, apts, apt_tree):
    """핫스팟 h 주변 저층 건물 조직을 목표 면적까지 자라게 해 폴리곤 하나를 만든다."""
    cx, cy = xy(h["lng"], h["lat"])
    center = Point(cx, cy)
    # 이미 정비구역 안이면 가상 경계를 그리지 않는다(실제 구역과 헷갈린다)
    jj = zone_tree.query(center, predicate="intersects")
    if len(jj) and any(zones[k][0].contains(center) for k in jj):
        return None, "구역 안 핀"

    idx = np.array(tree.query_ball_point([cx, cy], GATHER_M), dtype=int)
    n = int(2 * GATHER_M / CELL_M) + 1
    grid = np.zeros((n, n), bool)
    ii = ((P[idx, 0] - cx + GATHER_M) // CELL_M).astype(int)
    jj2 = ((P[idx, 1] - cy + GATHER_M) // CELL_M).astype(int)
    ok = (ii >= 0) & (ii < n) & (jj2 >= 0) & (jj2 < n)
    grid[jj2[ok], ii[ok]] = True
    fab = ndi.binary_closing(grid, structure=disk(1.0), border_value=0)  # 10m 틈(골목)까지 잇는다
    pi = int(GATHER_M // CELL_M)
    pj = int(GATHER_M // CELL_M)
    ys, xs = np.nonzero(fab)
    if not len(ys):
        return None, "건물 없음"
    dist = np.hypot((xs - pi) * CELL_M, (ys - pj) * CELL_M)
    seeds = [(int(ys[k]), int(xs[k])) for k in np.argsort(dist)[:8] if dist[k] <= 60]
    if not seeds:
        return None, "핀 둘레 건물 없음"

    vis = np.zeros_like(fab)
    heap = []
    for y0, x0 in seeds:
        if not vis[y0, x0]:
            vis[y0, x0] = True
            heapq.heappush(heap, (0.0, y0, x0))
    area = 0.0
    while heap:
        d, y0, x0 = heapq.heappop(heap)
        area += CELL_M * CELL_M
        if area >= TARGET_M2:
            break
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                y1, x1 = y0 + dy, x0 + dx
                if not (0 <= y1 < n and 0 <= x1 < n) or vis[y1, x1] or not fab[y1, x1]:
                    continue
                nd = math.hypot((x1 - pi) * CELL_M, (y1 - pj) * CELL_M)
                if nd > GROW_M:
                    continue
                vis[y1, x1] = True
                heapq.heappush(heap, (nd, y1, x1))
    # 꼬리 다듬기 — 끝이 한 칸뿐인 가닥을 두 번 쳐낸다(줄기 모양은 살리고 삐죽한 꼬리만 없앤다)
    pruned = vis.copy()
    onto = np.ones((3, 3), int)
    for _ in range(2):
        nb = ndi.convolve(pruned.astype(np.int16), onto, mode="constant", cval=0) - pruned
        pruned = pruned & (nb >= 2)
    if not pruned.any():
        pruned = vis
    lab, _ = ndi.label(pruned, structure=np.ones((3, 3)))
    if lab[pj, pi] == 0:
        cand = [(math.hypot((x - pi) * CELL_M, (y - pj) * CELL_M), lab[y, x]) for y, x in zip(*np.nonzero(lab))]
        if not cand:
            return None, "꼬리 정리 후 없음"
        L = min(cand)[1]
    else:
        L = lab[pj, pi]
    ys, xs = np.nonzero(lab == L)
    cells = unary_union(
        [
            box(cx - GATHER_M + x * CELL_M, cy - GATHER_M + y * CELL_M, cx - GATHER_M + (x + 1) * CELL_M, cy - GATHER_M + (y + 1) * CELL_M)
            for x, y in zip(xs, ys)
        ]
    )
    poly = cells.buffer(7, quad_segs=4).buffer(-7, quad_segs=4).simplify(2.0)
    if poly.geom_type != "Polygon" or poly.is_empty:
        geoms = list(getattr(poly, "geoms", []))
        if not geoms:
            return None, "폴리곤 아님"
        poly = max(geoms, key=lambda g: g.area)

    # 기존 정비구역·아파트 단지 빼기
    for k in zone_tree.query(poly, predicate="intersects"):
        poly = poly.difference(zones[k][0])
    for k in apt_tree.query(poly, predicate="intersects"):
        poly = poly.difference(apts[k][0])
    if poly.is_empty:
        return None, "구역·단지 차감 후 없음"
    geoms = list(poly.geoms) if poly.geom_type == "MultiPolygon" else [poly]
    geoms = [g for g in geoms if g.area > 900]
    if not geoms:
        return None, "차감 후 파편"
    inside = [g for g in geoms if g.contains(center)]
    poly = max(inside, key=lambda g: g.area) if inside else max(geoms, key=lambda g: g.area)
    big_holes = [r for r in poly.interiors if Polygon(r).area >= HOLE_MIN]
    poly = Polygon(poly.exterior, big_holes).simplify(2.5, preserve_topology=True)
    if poly.is_empty or poly.geom_type != "Polygon":
        return None, "정리 후 없음"
    return poly, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=80, help="최종 채택 블록 수")
    ap.add_argument("--review", type=int, default=140, help="검토할 상위 핫스팟 수")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--ids", help="쉼표로 구분한 핫스팟 id 만 시험 생성(디버그)")
    ap.add_argument("--out", help="출력 경로(기본 public/data/dev-pressure-blocks.json)")
    a = ap.parse_args()

    src = json.load(open(SRC, encoding="utf-8"))
    hotspots = src["hotspots"]
    log(f"핫스팟 {len(hotspots):,}곳 · 건물 타일 읽는 중…")
    buildings = load_buildings()
    log(f"건물 {len(buildings):,}동")

    apts = load_apt_polys(os.path.join(WORK, "osm-apt-seoul-geom.json"))
    apt_tree = shapely.STRtree([p[0] for p in apts])
    zones = load_zones()
    zone_tree = shapely.STRtree([z[0] for z in zones])
    log(f"OSM 아파트 폴리곤 {len(apts):,}개 · 정비구역 {len(zones):,}곳")

    # 후보 건물 = 저층(≤250㎡)·비아파트. 연식 미상(None)은 대부분 노후라 살린다
    pts = []
    years = []
    for lng, lat, area, year in buildings:
        if area > LOW_AREA:
            continue
        x, y = xy(lng, lat)
        p = Point(x, y)
        i = apt_tree.query(p, predicate="intersects")
        if len(i) and any(apts[k][0].contains(p) for k in i):
            continue
        pts.append((x, y))
        years.append(year)
    P = np.asarray(pts, dtype=float)
    Y = np.asarray([y or 0 for y in years], dtype=int)
    log(f"가상경계 후보 건물 {len(P):,}동(저층·비아파트)")
    tree = cKDTree(P)

    if a.ids:
        ids = set(a.ids.split(","))
        todo = [h for h in hotspots if h["id"] in ids]
    else:
        todo = [h for h in hotspots if not h.get("inZone")][: a.review]

    blocks = []
    rejected = defaultdict(int)
    for h in todo:
        poly, why = block_at(h, P, tree, zones, zone_tree, apts, apt_tree)
        if poly is None:
            rejected[why or "실패"] += 1
            continue
        area_m2 = poly.area
        if area_m2 < MIN_AREA:
            rejected["면적 작음"] += 1
            continue
        if area_m2 > MAX_AREA:
            rejected["면적 큼"] += 1
            continue
        hull_area = poly.convex_hull.area
        if hull_area > 0 and area_m2 / hull_area < MIN_SOLID:
            rejected["모양 길쭉"] += 1
            continue
        # 경계 안 저층 건물 통계
        b = poly.bounds
        kk = tree.query_ball_point([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], max(b[2] - b[0], b[3] - b[1]))
        kk = [k for k in kk if poly.contains(Point(P[k]))]
        if len(kk) < MIN_BLD:
            rejected["경계 안 건물 부족"] += 1
            continue
        yy = Y[kk]
        known = yy[yy > 0]
        old_pct = round(100 * float((known <= OLD_YEAR).sum()) / len(known)) if len(known) else 0
        if old_pct < MIN_OLD:
            rejected["노후 부족"] += 1
            continue

        rep = poly.representative_point()
        clng, clat = lnglat(rep.x, rep.y)

        def to_ring(coords) -> list[list[float]]:
            """로컬 m 좌표 → [위도, 경도] (앱의 구역 polygon 과 같은 순서)"""
            out_ring = []
            for x, y in coords:
                ln, la = lnglat(x, y)
                out_ring.append([round(la, 6), round(ln, 6)])
            return out_ring

        ring = to_ring(poly.exterior.coords[:-1])
        if len(ring) > 140:
            p2 = poly.simplify(4.0, preserve_topology=True)
            if p2.geom_type == "Polygon" and not p2.is_empty:
                poly = p2
                ring = to_ring(poly.exterior.coords[:-1])
        holes = []
        for r in poly.interiors:
            hr = to_ring(r.coords[:-1])
            if len(hr) >= 4:
                holes.append(hr)

        blocks.append(
            {
                "id": h["id"],
                "score": h["score"],
                "grade": h["grade"],
                "gu": h["gu"],
                "dong": h["dong"],
                "hjd": h.get("hjd"),
                "areaM2": int(round(area_m2)),
                "pyeong": round(area_m2 / 3.305785, 1),
                "oldPct": old_pct,
                "bldCount": len(kk),
                "aptCount": h.get("aptCount", 0),
                "apts": h.get("apts", []),
                "zones": h.get("zones", []),
                "station": h.get("station"),
                "center": [round(clat, 6), round(clng, 6)],
                "polygon": ring,
                "holes": holes,
            }
        )
        if a.verbose:
            log(
                f"  ✓ {h['id']} {h['gu']} {h['dong']} {h['score']:.1f}점 · {area_m2:,.0f}㎡"
                f" · 건물 {len(kk)}동 · 노후 {old_pct}%"
            )

    log(f"블록 {len(blocks)}개 생성 · 탈락 {dict(rejected)}")
    blocks.sort(key=lambda b: -b["score"])
    if not a.ids:
        per_dong = defaultdict(int)
        per_gu = defaultdict(int)
        picked = []
        for b in blocks:
            if len(picked) >= a.top:
                break
            dk = (b["gu"], b["dong"])
            if per_dong[dk] >= 2 or per_gu[b["gu"]] >= 8:
                continue
            per_dong[dk] += 1
            per_gu[b["gu"]] += 1
            picked.append(b)
        blocks = picked
        log(f"채택 {len(blocks)}곳 (동당 2·구당 8 상한)")

    payload = {
        "generatedAt": "2026-11-22",
        "method": {
            "source": "dev-pressure.json 상위 후보 + 브이월드 건물 + 건축물대장 연식 + OSM 아파트(ODbL) + 서울시 고시 구역",
            "oldYear": OLD_YEAR,
            "lowArea": LOW_AREA,
            "gridM": CELL_M,
            "targetM2": TARGET_M2,
            "minAreaM2": MIN_AREA,
            "maxAreaM2": MAX_AREA,
            "minBuildings": MIN_BLD,
            "minOldPct": MIN_OLD,
            "note": "30년 이상 저층 건물이 골목으로 이어진 덩어리를 따라 그린 참고용 추정 경계. 기존 정비구역·아파트 단지 안은 빼고 그렸으며, 고시된 구역계가 아니다.",
        },
        "blocks": blocks,
    }
    out = a.out or OUT
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    log(f"저장 {out} · {os.path.getsize(out) / 1024:.0f}KB · {len(blocks)}곳")
    return 0


if __name__ == "__main__":
    sys.exit(main())
