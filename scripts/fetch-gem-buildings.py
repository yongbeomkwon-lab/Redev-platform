#!/usr/bin/env python3
"""💎 원석 찾기 — 서울 전역 건물 좌표·연식 수집 (타일)

무엇을 하나
  · `/api/building-age`(배포된 라우트)를 0.005°(≈440×550m) 타일로 불러
    `tmp/gem/tiles/<tx>_<ty>.json.gz` 에 [[lng, lat, 외곽면적m², 사용승인연도|None], …] 로 저장한다.
  · 브이월드 WFS 는 이 작업 환경에서 직접 부를 수 없다(11-21 실측: HTTP/2 REFUSED_STREAM, HTTP/1.1 502).
    라우트가 건축물대장 연식 색인까지 덮어쓴 값을 주므로 지도 노후도와 같은 연도를 쓴다.
  · 1,000동 상한에 걸린 타일(`truncated`)은 3×3(0.00167° ≈ 150×184m)으로 쪼개 `tiles-fine/` 에 다시 받는다.

  python3 scripts/fetch-gem-buildings.py --limit 400      # 이어받기(있는 타일은 건너뛴다)
  python3 scripts/fetch-gem-buildings.py --fine           # 잘린 타일 3×3 재수집
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "tmp", "gem")
TILES = os.path.join(WORK, "tiles")
FINE = os.path.join(WORK, "tiles-fine")
SIG = os.path.join(WORK, "sig_raw.json")
BASE = "https://redev-platform-iota.vercel.app/api/building-age"
STEP = 0.005
X0, Y0 = 126.76, 37.42
SPLIT = 3


def seoul_polys():
    from shapely.geometry import shape
    from shapely.ops import unary_union

    d = json.load(open(SIG, encoding="utf-8"))
    parts = [shape(f["geometry"]) for f in d["features"] if f["properties"]["code"].startswith("11")]
    return unary_union(parts)


def ring_area_m2(ring):
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    pts = [(p[0] * kx, p[1] * ky) for p in ring]
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def centroid(ring):
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    pts = [(p[0] * kx, p[1] * ky) for p in ring]
    s = cx = cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        f = x1 * y2 - x2 * y1
        s += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(s) < 1e-9:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    s *= 0.5
    return cx / (6 * s) / kx, cy / (6 * s) / ky


def rows_of(d):
    out = []
    for b in d.get("buildings", []):
        rings = b.get("r") or []
        if not rings:
            continue
        flat = rings[0]
        if flat and isinstance(flat[0], (int, float)):
            ring = [[float(flat[i]), float(flat[i + 1])] for i in range(0, len(flat) - 1, 2)]
        else:
            ring = [[float(p[0]), float(p[1])] for p in flat]
        a = ring_area_m2(ring)
        if a < 4:
            continue
        c = centroid(ring)
        out.append([round(c[0], 5), round(c[1], 5), round(a), b.get("y")])
    return out


def get(url):
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.load(r)


def fetch_tile(tx, ty):
    path = os.path.join(TILES, f"{tx}_{ty}.json.gz")
    if os.path.exists(path):
        return "skip"
    x0 = X0 + tx * STEP
    y0 = Y0 + ty * STEP
    bbox = f"{x0:.4f},{y0:.4f},{x0 + STEP:.4f},{y0 + STEP:.4f}"
    for attempt in range(4):
        try:
            d = get(f"{BASE}?bbox={bbox}&tile={tx},{ty}")
            if not d.get("ok"):
                raise RuntimeError(str(d)[:160])
            rows = rows_of(d)
            with gzip.open(path, "wt", encoding="utf-8") as fh:
                json.dump({"tile": [tx, ty], "truncated": bool(d.get("truncated")), "rows": rows}, fh)
            return "ok" + ("(trunc)" if d.get("truncated") else "")
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                return f"fail:{e}"
            time.sleep(1.2 * (attempt + 1))
    return "fail"


def fetch_fine(tx, ty, sx, sy):
    path = os.path.join(FINE, f"{tx}_{ty}_{sx}_{sy}.json.gz")
    if os.path.exists(path):
        return "skip"
    sub = STEP / SPLIT
    x0 = X0 + tx * STEP + sx * sub
    y0 = Y0 + ty * STEP + sy * sub
    bbox = f"{x0:.5f},{y0:.5f},{x0 + sub:.5f},{y0 + sub:.5f}"
    for attempt in range(4):
        try:
            d = get(f"{BASE}?bbox={bbox}&tile={tx},{ty},{sx},{sy}")
            if not d.get("ok"):
                raise RuntimeError(str(d)[:160])
            rows = rows_of(d)
            with gzip.open(path, "wt", encoding="utf-8") as fh:
                json.dump({"tile": [tx, ty, sx, sy], "truncated": bool(d.get("truncated")), "rows": rows}, fh)
            return "ok"
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                return f"fail:{e}"
            time.sleep(1.2 * (attempt + 1))
    return "fail"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--fine", action="store_true", help="잘린 타일 3×3 재수집")
    a = ap.parse_args()
    os.makedirs(TILES, exist_ok=True)
    os.makedirs(FINE, exist_ok=True)

    if a.fine:
        todo = []
        for f in sorted(os.listdir(TILES)):
            if not f.endswith(".json.gz"):
                continue
            d = json.load(gzip.open(os.path.join(TILES, f), "rt"))
            if not d.get("truncated"):
                continue
            tx, ty = d["tile"]
            for sx in range(SPLIT):
                for sy in range(SPLIT):
                    if not os.path.exists(os.path.join(FINE, f"{tx}_{ty}_{sx}_{sy}.json.gz")):
                        todo.append((tx, ty, sx, sy))
        print(f"잘린 타일의 하위 타일 남은 것 {len(todo)}개", flush=True)
        fn = fetch_fine
    else:
        from shapely.geometry import box

        seoul = seoul_polys()
        todo = []
        for tx in range(0, 90):
            for ty in range(0, 60):
                x0 = X0 + tx * STEP
                y0 = Y0 + ty * STEP
                if not seoul.intersects(box(x0, y0, x0 + STEP, y0 + STEP)):
                    continue
                if os.path.exists(os.path.join(TILES, f"{tx}_{ty}.json.gz")):
                    continue
                todo.append((tx, ty))
        print(f"서울 경계와 겹치는 타일 · 남은 것 {len(todo)}개 (workers={a.workers})", flush=True)
        fn = fetch_tile

    if a.limit:
        todo = todo[: a.limit]
    done = 0
    stat = {}
    t0 = time.time()
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for res in ex.map(lambda t: fn(*t), todo):
            done += 1
            key = "fail" if res.startswith("fail") else res
            stat[key] = stat.get(key, 0) + 1
            if done % 100 == 0:
                print(f"  {done}/{len(todo)}  {time.time() - t0:.0f}s  {stat}", flush=True)
    print(f"완료 {done}개 {time.time() - t0:.0f}s {stat}", flush=True)
    n = len([f for f in os.listdir(TILES) if f.endswith(".json.gz")])
    nf = len([f for f in os.listdir(FINE) if f.endswith(".json.gz")])
    print(f"저장된 타일 {n}개 · 하위 타일 {nf}개")


if __name__ == "__main__":
    sys.exit(main())
