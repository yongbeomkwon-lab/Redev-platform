#!/usr/bin/env python3
"""필지 조립 — 목표 면적에 맞춰 필지를 모아 구역 경계를 만든다 (2026-11-28)

브이월드는 해외 IP를 막아 이 셸에서 직접 못 부른다. 배포된 리디브 함수(서울 리전)의
`/api/parcels-box` 프록시로 필지를 받아 조립한다.

  python3 scripts/assemble-rings-20261128.py fetch [zid…]   # 필지 캐시
  python3 scripts/assemble-rings-20261128.py rings [zid…]   # 조립 → tmp/rings-20261128.json

조립 방식 세 가지
  parcel  : 대표 필지에서 골목(폭 max_road_width 이하)만 건너며 한 필지씩 가까운 순서로 더한다.
  block   : 골목으로 이어진 대지 묶음을 블록으로 보고, 가까운 블록부터 통째로 더한다.
  compact : 도로를 경계로 쓰지 않고 가까운 대지 필지만 채운다(공식 구역계가 없고 큰길 하나
            건너 같은 구역이 이어지는 곳의 마지막 수단).
`_pick` 이 셋을 폭 14~45m 로 바꿔 가며 목표 면적 ±8%에 가장 가까운(폭이 좁은) 결과를 고른다.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "data" / "parcels-20261128b.json"
OUT = ROOT / "tmp" / "rings-20261128.json"
BASE = "https://redev-platform-iota.vercel.app/api/parcels-box"

ZONES: dict[str, dict] = {
    # ── 성동·광진 ────────────────────────────────────────────────────────────
    "geumho23": dict(zid="sy-geumho23", label="금호23구역", dong="금호동4가",
                     center=(37.548178, 127.020991), radius=420, seeds=["1109"],
                     target=30706, max_road_area=6000),
    "geumho-hyundai": dict(zid="sd-eungbong-geumho-hyundai", label="금호현대아파트(응봉동 98)",
                           dong="응봉동", center=(37.551047, 127.030954), radius=300,
                           seeds=["98"], target=30465),
    "majang-793-22": dict(zid="sd-majang-793-22", label="마장동 793-22 장기전세",
                          dong="마장동", center=(37.56484, 127.042606), radius=300,
                          seeds=["793-22", "793-23"], target=7497),
    "yongdap-1": dict(zid="sy-yongdap1", label="(가)용답1구역", dong="용답동",
                      center=(37.56319, 127.051973), radius=500, seeds=["50-14"],
                      target=47000),
    "yongdap-2": dict(zid="yongdap-2", label="용답2구역", dong="용답동",
                      center=(37.563156, 127.055426), radius=520, seeds=["15"],
                      target=96210.8),
    "jayang4b": dict(zid="rest17gu-jayang4b", label="자양4동B", dong="자양동",
                     center=(37.539281, 127.064516), radius=420, seeds=["858"],
                     target=58680.1),
    "jayang-548": dict(zid="jayang-548", label="지주택 자양동 548", dong="자양동",
                       center=(37.537463, 127.067968), radius=340, seeds=["548"],
                       target=34373.9),
    "songjeong-73-735": dict(zid="sd-songjeong-73-735", label="(가)송정동 73-735",
                             dong="송정동", center=(37.550577, 127.06679), radius=520,
                             seeds=["73-735"], target=103865.4),
    "haengdang-300-1": dict(zid="haengdang-300-1", label="행당동 300-1(행당8구역)",
                            dong="행당동", center=(37.560035, 127.030948), radius=480,
                            seeds=["300-1"], target=66276.1),
    # ── 중구 ────────────────────────────────────────────────────────────────
    "sindang-13": dict(zid="rest17gu-jg-신당13", label="신당13구역", dong="신당동",
                       center=(37.562299, 127.012736), radius=420, seeds=["236-67"],
                       target=68916),
    "sindang-14": dict(zid="rest17gu-jg-신당14", label="신당14구역", dong="신당동",
                       center=(37.563875, 127.018754), radius=420, seeds=["123-1"],
                       target=34121),
    "sindang-hyundai": dict(zid="junggu-sindang-hyundai", label="신당현대 재건축",
                            dong="신당동", center=(37.559948, 127.021659), radius=300,
                            seeds=["840"], target=44338),
    "sindang-403-20": dict(zid="junggu-sindang-403-20", label="신당동 403-20 장기전세",
                           dong="신당동", center=(37.560586, 127.01247), radius=260,
                           seeds=["403-20"], target=4928.5),
    "ddp-1": dict(zid="junggu-ddp-123#1", label="DDP 1구역(을지로6가 1-1)", dong="을지로6가",
                  center=(37.56839, 127.004911), radius=520, seeds=["1-1"], target=177003),
    "ddp-2": dict(zid="junggu-ddp-123#2", label="DDP 2구역(신당동 773)", dong="신당동",
                  center=(37.568823, 127.010563), radius=420, seeds=["773"], target=48203),
    "ddp-3": dict(zid="junggu-ddp-123#3", label="DDP 3구역(을지로 299)", dong="을지로",
                  center=(37.565872, 127.011443), radius=460, seeds=["299"], target=118689),
    # ── 서초·강남·동작·강동 ──────────────────────────────────────────────────
    "bangbae-920-1": dict(zid="bangbae-920-1", label="방배동 920-1 모아타운", dong="방배동",
                          center=(37.483074, 126.992794), radius=320, seeds=["920-1"],
                          target=19070.3),
    "seocho-1506-6": dict(zid="seocho-1506-6", label="서초동 1506-6 모아타운", dong="서초동",
                          center=(37.488043, 127.005783), radius=420, seeds=["1506-6"],
                          target=46697.4),
    "seocho-1487": dict(zid="seocho-1487", label="(가)서초동 1487 모아타운", dong="서초동",
                        center=(37.482802, 127.006059), radius=420, seeds=["1487", "1487-1"],
                        target=49300),
    "samseong-84": dict(zid="gangnam4gu-samseong-84", label="삼성동 84 모아타운", dong="삼성동",
                        center=(37.518737, 127.060994), radius=360, seeds=["84"], target=34802),
    "dongjak-102-8": dict(zid="dongjak-102-8", label="동작동 102-8 모아타운(사당20구역)",
                          dong="동작동", center=(37.49672, 126.981385), radius=340,
                          seeds=["102-8"], target=21211),
    "sangil-300": dict(zid="rest17gu-gd-상일동-300", label="(가)상일동 300", dong="상일동",
                       center=(37.547698, 127.171608), radius=460, seeds=["300"], target=59956),
    "myeongil-100": dict(zid="rest17gu-myeongil-100", label="(가)명일동 100", dong="명일동",
                         center=(37.54856, 127.154396), radius=400, seeds=["100"], target=42210),
    # ── 광진 중곡동 7곳 (중심점 = 사용자가 보낸 지도 핀) ────────────────────────
    "junggok-b4": dict(zid="gwangjin-junggok-b4", label="중곡동 B4 민간도심복합",
                       dong="중곡동", center=(37.5621, 127.0799), radius=380, seeds=[],
                       target=67206),
    "junggok-b5": dict(zid="gwangjin-junggok-b5", label="중곡동 B5 민간도심복합",
                       dong="중곡동", center=(37.5598, 127.0803), radius=340, seeds=[],
                       target=40948),
    "junggok-c3": dict(zid="gwangjin-junggok-c3", label="중곡동 C3 민간도심복합",
                       dong="중곡동", center=(37.5612, 127.0829), radius=360, seeds=[],
                       target=59830),
    "junggok-c4": dict(zid="gwangjin-junggok-c4", label="중곡동 C4 민간도심복합",
                       dong="중곡동", center=(37.56, 127.0814), radius=320, seeds=[],
                       target=33702),
    "junggok-37-17": dict(zid="rest17gu-junggok-37-17", label="중곡동 37-17(C2,D1)",
                          dong="중곡동", center=(37.56191, 127.0852), radius=360,
                          seeds=["37-17"], target=54246),
    "junggok-d2": dict(zid="rest17gu-junggok-d2", label="(가)중곡동 D2", dong="중곡동",
                       center=(37.558182, 127.0855257), radius=420, seeds=[], target=87175.92),
    "junggok-d4": dict(zid="rest17gu-junggok-d4", label="(가)중곡동 D4", dong="중곡동",
                       center=(37.5573768, 127.0875864), radius=400, seeds=[], target=56462),
    "junggok-e6f2": dict(zid="rest17gu-junggok-e6f2", label="(가)중곡동 E6,F2", dong="중곡동",
                         center=(37.5584908, 127.0915095), radius=480, seeds=[], target=93566),
}


dlat = lambda m: m / 111132.0
dlng = lambda m, lat: m / (111132.0 * math.cos(math.radians(lat)))


def get(params: dict) -> dict:
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read().decode("utf-8", "replace")
    d = json.loads(body)
    if not d.get("ok"):
        raise RuntimeError(f"proxy error: {d}")
    return d


def fetch_box(minlat, minlng, maxlat, maxlng, page=1, size=1000) -> dict:
    return get({
        "minlat": f"{minlat:.6f}", "minlng": f"{minlng:.6f}",
        "maxlat": f"{maxlat:.6f}", "maxlng": f"{maxlng:.6f}",
        "page": str(page), "size": str(size),
    })


def cmd_fetch(only=None):
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    for zid, z in ZONES.items():
        if only and zid not in only:
            continue
        if cache.get(zid):
            print(f"{zid}: 캐시 있음 {len(cache[zid])}개 — 건너뜀", flush=True)
            continue
        lat, lng = z["center"]
        r = z["radius"]
        box = (lat - dlat(r), lng - dlng(r, lat), lat + dlat(r), lng + dlng(r, lat))
        got, page = [], 1
        while True:
            d = fetch_box(*box, page=page)
            minlat, minlng, maxlat, maxlng = box
            for p in d.get("parcels") or []:
                rings = p.get("rings") or []
                if not rings:
                    continue
                ring = rings[0]
                clat = sum(pt[0] for pt in ring) / len(ring)
                clng = sum(pt[1] for pt in ring) / len(ring)
                if not (minlat <= clat <= maxlat and minlng <= clng <= maxlng):
                    continue
                raw = str(p.get("jibun") or "").strip()
                m = re.match(r"^(\d+(?:-\d+)?)\s*(.*)$", raw)
                got.append({
                    "jibun": raw,
                    "num": m.group(1) if m else raw,
                    "tail": (m.group(2).strip() if m else "") or str(p.get("jimok") or "").strip(),
                    "addr": str(p.get("addr") or "").strip(),
                    "pnu": str(p.get("pnu") or "").strip(),
                    "ring": [[pt[0], pt[1]] for pt in ring],
                })
            total = int(d.get("total") or 0)
            if not d.get("count") or page * int(d.get("size") or 1000) >= total:
                break
            page += 1
            time.sleep(0.2)
        uniq = {}
        for p in got:
            uniq[p["pnu"] or f'{p["addr"]}|{p["jibun"]}'] = p
        cache[zid] = list(uniq.values())
        print(f"{zid}: 필지 {len(cache[zid])}개", flush=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.2)
    print("저장:", CACHE)


def local_proj(lat0: float, lng0: float):
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    return lambda ring: [((p[1] - lng0) * kx, (p[0] - lat0) * ky) for p in ring]


def _build_polys(parcels: list[dict]) -> dict:
    from shapely.geometry import Polygon

    polys = {}
    for p in parcels:
        ring = p["ring"]
        if len(ring) < 4:
            continue
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        poly = Polygon([(pt[1], pt[0]) for pt in ring])  # (경도, 위도) 순서로 도 평면에
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or poly.geom_type != "Polygon":
            continue
        polys[p["pnu"] or p["jibun"]] = (p, poly)
    return polys


def _neighbours(polys: dict, dist: float = 0.00002) -> dict:
    """2m 이내로 맞닿은 필지 쌍 (STRtree) — 좌표가 도(degree) 단위라 0.00002°≈2m."""
    from shapely import STRtree

    keys = list(polys)
    tree = STRtree([polys[k][1] for k in keys])
    nb = {k: [] for k in keys}
    for i, k in enumerate(keys):
        for j in tree.query(polys[k][1], predicate="dwithin", distance=dist):
            j = int(j)
            if j != i:
                nb[k].append(keys[j])
    return nb


def _area(poly) -> float:
    """도 단위 폴리곤 면적 → ㎡ (중심 위도 기준)."""
    lat0 = poly.centroid.y
    return poly.area * (111132.0 ** 2) * math.cos(math.radians(lat0))


def _finish(zid: str, polys: dict, chosen: set, seeds: list, target: float, z: dict) -> dict:
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    geom = unary_union([polys[k][1] for k in chosen])
    if geom.geom_type == "GeometryCollection":
        geom = unary_union([g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
    parts_geom = []
    if geom.geom_type == "MultiPolygon":
        comps = sorted(geom.geoms, key=lambda g: -g.area)
        keep = [g for g in comps if g.area >= comps[0].area * 0.08]
        geom = keep[0]
        parts_geom = keep[1:]
    elif geom.geom_type != "Polygon":
        geom = geom.buffer(0)

    ring = [[round(y, 7), round(x, 7)] for x, y in geom.exterior.coords]
    parts = [[[round(y, 7), round(x, 7)] for x, y in g.exterior.coords] for g in parts_geom]
    holes = []
    for h in getattr(geom, "interiors", []):
        hp = Polygon(h)
        if poly_area_m2(hp) >= 100:  # 필지 사이 미세 틈은 구멍으로 남기지 않는다
            holes.append([[round(y, 7), round(x, 7)] for x, y in hp.exterior.coords])

    total = _area(geom) + sum(_area(g) for g in parts_geom)
    return {
        "zid": zid,
        "areaShape": round(total, 1),
        "target": target,
        "seeds": sorted(polys[k][0]["num"] for k in seeds),
        "parcels": sorted(polys[k][0]["num"] for k in chosen),
        "ring": ring,
        "parts": parts,
        "holes": holes,
    }


def _pick_seeds(polys: dict, z: dict) -> list:
    from shapely.geometry import Point

    lat0, lng0 = z["center"]
    center = Point(lng0, lat0)
    addr = lambda p: (p["addr"] or "") + " " + p["jibun"]
    seeds = [k for k, (p, _) in polys.items()
             if p["num"] in (z.get("seeds") or []) and (not z.get("dong") or z["dong"] in addr(p))]
    if not seeds:
        seeds = [k for k, (_, poly) in polys.items() if poly.buffer(0.00002).contains(center)]
    if not seeds:
        raise RuntimeError("씨앗 없음(지번·중심점 모두 실패)")
    return seeds


def _grow_parcel(polys: dict, seeds: list, z: dict) -> list:
    """한 필지씩, 가까운 순서로 더한다. 골목(폭 max_road_width 이하)만 건넌다."""
    nb = _neighbours(polys)
    keys = list(polys)

    def is_road(k):
        return (polys[k][0]["tail"] or "").startswith("도")

    def width(k):
        poly = polys[k][1]
        return 2.0 * poly.area / max(poly.length, 1e-6)

    max_road_width = float(z.get("max_road_width", 14.0))
    big = float(z.get("max_parcel_area", 25000.0))
    passable = {}
    for k in keys:
        if k in seeds:
            passable[k] = True
        elif is_road(k):
            passable[k] = width(k) <= max_road_width
        else:
            passable[k] = poly_area_m2(polys[k][1]) <= big

    target = float(z["target"])
    scx = sum(polys[k][1].centroid.x for k in seeds) / len(seeds)
    scy = sum(polys[k][1].centroid.y for k in seeds) / len(seeds)

    chosen = set(seeds)
    area = sum(poly_area_m2(polys[k][1]) for k in chosen)
    best = (abs(area - target), set(chosen))
    frontier = list(seeds)
    for _ in range(int(z.get("max_ring", 60))):
        layer, seen = [], set(chosen)
        for k in frontier:
            for m in nb[k]:
                if m in seen or not passable[m]:
                    continue
                seen.add(m)
                layer.append(m)
        if not layer:
            break
        layer.sort(key=lambda k: (polys[k][1].centroid.x - scx) ** 2 + (polys[k][1].centroid.y - scy) ** 2)
        for m in layer:
            chosen.add(m)
            area += poly_area_m2(polys[m][1])
            diff = abs(area - target)
            if diff < best[0]:
                best = (diff, set(chosen))
            if area >= target * 1.02:
                break
        if area >= target * 1.02:
            break
        frontier = layer
    return best[1]


def _grow_block(polys: dict, seeds: list, z: dict) -> list:
    """골목으로 이어진 대지 묶음을 블록으로 보고, 가까운 블록부터 통째로 더한다."""
    from shapely.geometry import Point

    keys = list(polys)

    def is_road(k):
        return (polys[k][0]["tail"] or "").startswith("도")

    def width(k):
        poly = polys[k][1]
        return 2.0 * poly.area / max(poly.length, 1e-6)

    max_road_width = float(z.get("max_road_width", 14.0))
    max_conn_area = float(z.get("max_conn_area", 2500.0))
    # 골목이라도 길게 이어진 도로 필지(면적 큼)는 두 블록을 이어 주는 연결고리로 쓰지 않는다
    conn = {k: (not is_road(k)) or (width(k) <= max_road_width and poly_area_m2(polys[k][1]) <= max_conn_area)
            for k in keys}

    parent = {k: k for k in keys}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    nb = _neighbours(polys)
    for k, ms in nb.items():
        if not conn[k]:
            continue
        for m in ms:
            if conn[m]:
                union(k, m)

    groups: dict[str, list[str]] = {}
    for k in keys:
        groups.setdefault(find(k), []).append(k)
    geo = {r: [polys[k][1] for k in ks] for r, ks in groups.items()}
    area = {r: sum(poly_area_m2(g) for g in gs) for r, gs in geo.items()}

    lat0, lng0 = z["center"]
    seed_pt = Point(lng0, lat0)
    seed_blocks = {find(k) for k in seeds}
    target = float(z["target"])
    cand = sorted(((min(g.distance(seed_pt) for g in geo[r]), r) for r in geo if r not in seed_blocks))

    chosen_blocks = set(seed_blocks)
    total = sum(area[r] for r in chosen_blocks)
    best = (abs(total - target), set(chosen_blocks))
    for _d, r in cand:
        chosen_blocks.add(r)
        total += area[r]
        if abs(total - target) < best[0]:
            best = (abs(total - target), set(chosen_blocks))
        if total >= target * 1.02:
            break

    chosen = set()
    for r in best[1]:
        chosen |= set(groups[r])
    return chosen


def _grow_compact(polys: dict, seeds: list, z: dict) -> list:
    """도로를 경계로 쓰지 않고 가까운 대지 필지만 채운다(공식 구역계가 없을 때)."""
    from shapely.geometry import Point

    lat0, lng0 = z["center"]
    center = Point(lng0, lat0)
    big = float(z.get("max_parcel_area", 25000.0))
    target = float(z["target"])
    cand = []
    for k, (p, poly) in polys.items():
        if k in seeds or (p["tail"] or "").startswith("도"):
            continue
        if poly_area_m2(poly) > big or poly.distance(center) > 0.0035:  # 400m
            continue
        cand.append((poly.distance(center), k))
    cand.sort()

    chosen = set(seeds)
    area = sum(poly_area_m2(polys[k][1]) for k in chosen)
    best = (abs(area - target), set(chosen))
    for _d, k in cand:
        chosen.add(k)
        area += poly_area_m2(polys[k][1])
        if abs(area - target) < best[0]:
            best = (abs(area - target), set(chosen))
        if area >= target * 1.02:
            break
    return best[1]


def poly_area_m2(poly) -> float:
    return poly.area * (111132.0 ** 2) * math.cos(math.radians(poly.centroid.y))


def _assemble(zid: str, parcels: list[dict], z: dict, mode: str = "parcel") -> dict:
    polys = _build_polys(parcels)
    seeds = _pick_seeds(polys, z)
    if mode == "block":
        chosen = _grow_block(polys, seeds, z)
    elif mode == "compact":
        chosen = _grow_compact(polys, seeds, z)
    else:
        chosen = _grow_parcel(polys, seeds, z)
    return _finish(zid, polys, chosen, seeds, float(z["target"]), z)


def _pick(zid: str, parcels: list[dict], z: dict) -> dict:
    """가장 좁은 도로폭으로 목표 ±8%에 드는 조립을 고른다. 없으면 면적 차이가 가장 작은 것."""
    target = float(z["target"])
    cands = []
    for mode, widths in (("parcel", (14, 20, 26, 34, 45)), ("block", (14, 20, 26, 34)), ("compact", (99,))):
        for w in widths:
            zz = dict(z)
            zz["max_road_width"] = w
            try:
                r = _assemble(zid, parcels, zz, mode=mode)
            except Exception:
                continue
            d = abs(r["areaShape"] - target) / target if target else 0.0
            r["mode"] = mode
            r["maxRoadWidth"] = w
            cands.append((d, w, mode, r))
    if not cands:
        raise RuntimeError("조립 실패")
    # 필지선을 따라가는 parcel/block 결과를 우선하고(±12%), 그것으로 목표에 못 미치면
    # 도로를 무시하는 compact 를 쓴다.
    good = [c for c in cands if c[0] <= 0.12 and c[2] != "compact"]
    if not good:
        good = [c for c in cands if c[0] <= 0.08]
    pool = good or cands
    pool.sort(key=lambda c: (c[1], c[0]))
    return pool[0][3]


def cmd_rings(only=None):
    cache = json.loads(CACHE.read_text(encoding="utf-8"))
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for zid, z in ZONES.items():
        if only and zid not in only:
            continue
        parcels = cache.get(zid) or []
        if not parcels:
            print(f"{zid}: 캐시 없음", flush=True)
            continue
        try:
            r = _pick(zid, parcels, z)
        except Exception as e:
            print(f"{zid}: 조립 실패 — {e}", flush=True)
            continue
        out[zid] = r
        d = (r["areaShape"] - r["target"]) / r["target"] * 100 if r["target"] else 0.0
        print(f"{zid:18s} {r['areaShape']:10,.1f} / {r['target']:10,.1f} ({d:+6.1f}%) "
              f"{r['mode']}/w{r['maxRoadWidth']} 필지 {len(r['parcels']):3d} 정점 {len(r['ring'])} "
              f"구멍 {len(r.get('holes') or [])}", flush=True)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("저장:", OUT)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "rings"
    only = set(sys.argv[2:]) or None
    if cmd == "fetch":
        cmd_fetch(only)
    elif cmd == "rings":
        cmd_rings(only)
