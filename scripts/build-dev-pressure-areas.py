#!/usr/bin/env python3
"""🔥 개발압력 **생활권 동심원** — 저층 주거지 안쪽에 중심을 잡은 추정 반경

무엇을 하나
  ① `public/data/dev-pressure-blocks.json` 의 블록 폴리곤(30년↑ 저층 건물이 골목으로 이어진 덩어리)을
     읽는다. 이 경계는 지도에 그리지 않고 **생활권 원을 놓을 수 있는 영역**으로만 쓴다.
  ② 블록 둘레의 **간선도로(OSM motorway·trunk·primary·secondary)** 를 받아
     `도로 반폭 + 앞쪽 상가·보도 여유(10m)` 만큼 부풀린 **회랑**으로 만든다.
     → 대로변 상가 첫 줄과 보도는 생활권에서 빠진다(사용자 지시: "대로변이 포함되면 좀 그래").
  ③ 블록을 살짝 닫아(골목 손가락 정리) 회랑을 뺀 영역에서 **최대 내접원**을 찾는다.
       r0 = min(블록 안쪽 경계까지, 대로 회랑 경계까지) 를 최대로 하는 반경
     · r0 < 42m 이면 대로에 붙은 얇은 띠이거나 너무 작다 — **생활권을 그리지 않고 뺀다**.
     · r0 > 110m 이면 110m 로 자른다(사용자 지시의 70~110m 규모).
  ④ 중심은 그 원의 내부점(polylabel) — 핀·점수 배지도 이 자리로 옮겨 대로변에서 떨어진다.

결과: `public/data/dev-pressure-areas.json`
  { id, score, grade, gu, dong, hjd, center:[lat,lng], radiusM, areaM2, pyeong,
    oldPct, bldCount, aptCount, apts, zones, station,
    road: { name, dist, clearM } }   ← clearM = 원 가장자리에서 대로 회랑까지 여유(≥0)

  ★ 참고용 추정 생활권이다. 고시된 구역계가 아니다.

  python3 scripts/build-dev-pressure-areas.py [--limit N] [--ids a,b] [--verbose] [--refresh]
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon
from shapely.ops import polylabel, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCKS = os.path.join(ROOT, "public", "data", "dev-pressure-blocks.json")
HOTSPOTS = os.path.join(ROOT, "public", "data", "dev-pressure.json")
OUT = os.path.join(ROOT, "public", "data", "dev-pressure-areas.json")
CACHE = os.path.join(ROOT, "tmp", "devpressure", "roads")

LAT0, LON0 = 37.55, 126.90
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 110540.0

# ── 생활권 원 규칙 ────────────────────────────────────────────────────────────
EDGE_M = 25.0        # 블록 외곽 손가락(1~2칸 폭 골목) 정리 — 닫기 반경
FRONT_M = 4.0        # 대로 회랑: 도로 반폭에 더하는 보도 여유
MIN_R = 24.0         # 이보다 작으면 생활권으로 보지 않는다(대로변 얇은 띠)
MAX_R = 110.0        # 사용자 지시의 70~110m 규모 상한
ROAD_HALF = {        # 도로 등급별 반폭(m) — 서울 기준 보수적 값
    "motorway": 15.0,
    "trunk": 13.0,
    "primary": 10.0,
    "secondary": 6.0,
    "tertiary": 6.0,
}
ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary"]
UA = "redev-platform/1.0 (dev-pressure living-area build; contact yongbeom.kwon@gmail.com)"


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def xy(lng: float, lat: float) -> tuple[float, float]:
    return (lng - LON0) * KX, (lat - LAT0) * KY


def lnglat(x: float, y: float) -> tuple[float, float]:
    return x / KX + LON0, y / KY + LAT0


# ── OSM 간선도로 ─────────────────────────────────────────────────────────────
def _osm_url(bbox: str) -> str:
    return f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"


def fetch_roads(block: dict, refresh: bool = False) -> bytes | None:
    """블록 주변 OSM 원본(XML). 캐시는 tmp/ (저장소에 넣지 않는다)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{block['id']}.xml.gz")
    if os.path.exists(path) and not refresh:
        return gzip.open(path, "rb").read()
    lats = [p[0] for p in block["polygon"]]
    lngs = [p[1] for p in block["polygon"]]
    pad = (MAX_R + 60.0) / 110000.0 * 1.35
    bbox = f"{min(lngs) - pad:.6f},{min(lats) - pad:.6f},{max(lngs) + pad:.6f},{max(lats) + pad:.6f}"
    req = urllib.request.Request(_osm_url(bbox), headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=90).read()
            with gzip.open(path, "wb") as f:
                f.write(raw)
            return raw
        except urllib.error.HTTPError as e:
            if e.code in (429, 509):
                wait = 30 * (attempt + 1)
                log(f"    · OSM 대역 초과({e.code}) — {wait}초 쉬고 다시")
                time.sleep(wait)
                continue
            log(f"    · OSM 오류 {e.code} — 이 블록은 대로 자료 없이 계산")
            return None
        except Exception as e:  # noqa: BLE001
            log(f"    · OSM 실패({e}) — {20 * (attempt + 1)}초 후 재시도")
            time.sleep(20 * (attempt + 1))
    return None


def parse_arterials(raw: bytes) -> list[dict]:
    """OSM XML → [{name, cls, line: LineString(m 단위)}]"""
    nodes: dict[str, tuple[float, float]] = {}
    ways: list[ET.Element] = []
    root = ET.fromstring(raw)
    for el in root:
        if el.tag == "node":
            nodes[el.get("id")] = (float(el.get("lon")), float(el.get("lat")))
        elif el.tag == "way":
            ways.append(el)
    out = []
    for w in ways:
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        cls = tags.get("highway")
        if cls not in ROAD_CLASSES:
            continue
        pts = []
        for nd in w.findall("nd"):
            p = nodes.get(nd.get("ref"))
            if p:
                pts.append(xy(p[0], p[1]))
        if len(pts) < 2:
            continue
        try:
            lanes = int(tags.get("lanes") or 0)
        except ValueError:
            lanes = 0
        out.append({"name": tags.get("name") or "", "cls": cls, "lanes": lanes, "line": LineString(pts)})
    return out


def road_width(way: dict) -> float:
    """도로 폭(m) — OSM `lanes` 태그가 있으면 차로수×3.2m+2m, 없으면 등급 기본 폭.
       등급 기본값보다 좁게 나오면 등급 기본값을 쓴다(작은 태그 오류로 대로를 좁게 보지 않게)."""
    base = ROAD_HALF[way["cls"]] * 2.0
    lanes = way.get("lanes") or 0
    if lanes > 0:
        return max(base, lanes * 3.2 + 2.0)
    return base


# ── 블록 기하 ────────────────────────────────────────────────────────────────
def block_polygon(block: dict) -> Polygon | MultiPolygon:
    p = Polygon([xy(q[1], q[0]) for q in block["polygon"]])
    for hole in block.get("holes") or []:
        p = p.difference(Polygon([xy(q[1], q[0]) for q in hole]))
    if not p.is_valid:
        p = p.buffer(0)
    return p


def max_inscribed_radius(geom, lo: float = 8.0, hi: float = 160.0) -> float:
    for _ in range(36):
        mid = (lo + hi) / 2
        if geom.buffer(-mid).is_empty:
            hi = mid
        else:
            lo = mid
    return lo


def largest_polygon(geom):
    if isinstance(geom, Polygon):
        return geom
    if isinstance(geom, MultiPolygon):
        return max(geom.geoms, key=lambda g: g.area)
    if hasattr(geom, "geoms"):
        polys = [g for g in geom.geoms if isinstance(g, Polygon)]
        if polys:
            return max(polys, key=lambda g: g.area)
    return None


def build_area(block: dict, roads: list[dict], verbose: bool = False) -> dict | None:
    poly = block_polygon(block)
    smooth = poly.buffer(EDGE_M).buffer(-EDGE_M)
    if smooth.is_empty:
        smooth = poly
    if isinstance(smooth, MultiPolygon):
        smooth = largest_polygon(smooth)

    corridors = []
    for w in roads:
        half = road_width(w) / 2.0 + FRONT_M
        corridors.append(w["line"].buffer(half, cap_style="flat", join_style="mitre"))
    available = smooth.difference(unary_union(corridors)) if corridors else smooth
    if available.is_empty:
        return None
    # 대로가 블록을 갈라 놓으면 조각이 여럿 생긴다 — 그중 「가장 큰 원이 들어가면서
    # 원래 블록 중심에서 멀지 않은」 조각을 고른다(면적만 보면 대로 건너 편 조각을 잡는다).
    pieces = [g for g in getattr(available, "geoms", [available]) if isinstance(g, Polygon) and g.area >= 2500]
    if not pieces:
        return None
    bc = poly.centroid
    best = None
    for piece in pieces:
        rr = max_inscribed_radius(piece)
        if rr < MIN_R:
            continue
        score = rr - 0.25 * piece.centroid.distance(bc)
        if best is None or score > best[0]:
            best = (score, rr, piece)
    if best is None:
        return None
    _, r0, avail = best

    r = min(r0, MAX_R)
    c = polylabel(avail.buffer(-r * 0.995), tolerance=0.25)
    # 원이 대로 회랑·블록 경계를 넘지 않도록 중심에서 경계까지 실제 거리로 한 번 더 자른다
    room = c.distance(avail.boundary)
    if room < r:
        r = max(room - 0.4, 0.0)
    if r < MIN_R:
        return None
    cx, cy = c.x, c.y

    # 가장 가까운 대로 — 카드에 "○○로 24m" 로 보여 준다
    nearest = None
    for w in roads:
        d = w["line"].distance(c)
        edge = d - road_width(w) / 2.0
        if nearest is None or edge < nearest["edge"]:
            nearest = {"name": w["name"], "cls": w["cls"], "edge": edge, "dist": d}

    lng, lat = lnglat(cx, cy)
    area = math.pi * r * r
    return {
        "id": block["id"],
        "score": block["score"],
        "grade": block["grade"],
        "gu": block["gu"],
        "dong": block["dong"],
        "hjd": block.get("hjd"),
        "center": [round(lat, 6), round(lng, 6)],
        "radiusM": int(round(r)),
        "areaM2": int(round(area)),
        "pyeong": round(area / 3.305785, 1),
        "oldPct": block["oldPct"],
        "bldCount": block["bldCount"],
        "aptCount": block["aptCount"],
        "apts": block["apts"],
        "zones": block["zones"],
        "station": block.get("station"),
        "road": (
            {
                "name": nearest["name"],
                "cls": nearest["cls"],
                "dist": int(round(nearest["dist"])),
                "clearM": int(round(max(0.0, nearest["edge"] - r))),
            }
            if nearest
            else None
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--ids", default="")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    blocks = json.load(open(BLOCKS, encoding="utf-8"))["blocks"]
    if args.ids:
        want = set(args.ids.split(","))
        blocks = [b for b in blocks if b["id"] in want]
    elif args.limit:
        blocks = blocks[args.offset : args.offset + args.limit]

    areas, dropped = [], []
    for i, b in enumerate(blocks, 1):
        raw = fetch_roads(b, refresh=args.refresh)
        roads = parse_arterials(raw) if raw else []
        a = build_area(b, roads, verbose=args.verbose)
        if a is None:
            dropped.append({"id": b["id"], "gu": b["gu"], "dong": b["dong"], "reason": "대로 회랑·블록 폭 기준 미달"})
            if args.verbose:
                log(f"[{i}/{len(blocks)}] {b['id']} {b['gu']} {b['dong']} — 제외")
        else:
            areas.append(a)
            if args.verbose:
                log(f"[{i}/{len(blocks)}] {b['id']} {b['gu']} {b['dong']} r={a['radiusM']}m road={a['road']}")
        if i < len(blocks) and not os.path.exists(os.path.join(CACHE, f"{b['id']}.xml.gz")):
            time.sleep(0.8)  # OSM API 예절 — 새로 받을 때만

    if args.limit or args.ids:
        print(json.dumps({"areas": areas, "dropped": dropped}, ensure_ascii=False, indent=1))
        return 0

    doc = {
        "generatedAt": time.strftime("%Y-%m-%d"),
        "method": {
            "source": "dev-pressure-blocks.json 저층 블록 + OSM 간선도로(motorway·trunk·primary·secondary, ODbL)",
            "edgeM": EDGE_M,
            "frontM": FRONT_M,
            "minR": MIN_R,
            "maxR": MAX_R,
            "note": "30년↑ 저층 건물 덩어리 안쪽에 중심을 두고, 대로 회랑(도로 반폭+10m)과 겹치지 않는 최대 내접원. 참고용 추정 생활권이며 고시 구역계가 아니다.",
        },
        "areas": areas,
        "excluded": dropped,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    log(f"→ {OUT} · areas {len(areas)} / 제외 {len(dropped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
