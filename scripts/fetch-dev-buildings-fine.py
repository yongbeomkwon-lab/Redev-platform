#!/usr/bin/env python3
"""개발압력 건물 타일 중 **잘린 타일**(1,000동 상한)을 잘게 쪼개 다시 받는다.

`scripts/fetch-dev-buildings.py` 는 타일 0.005°(≈440×550m)를 한 번에 받는다.
빌라촌처럼 건물이 촘촘한 타일은 `/api/building-age` 의 1,000동 상한에 걸려
(`truncated: true`) 건물 40% 가까이 빠진다 — 그런데 «🔥 개발압력» 상위 핫스팟이
바로 그런 동네에 몰려 있어 가상 구역경계가 성기게 나온다(2026-11-22 확인).

그래서 잘린 타일만 3×3(0.00167° ≈ 150×184m)으로 쪼개 `tiles-fine/` 에 저장한다.
`build-dev-pressure-blocks.py` 는 이 폴더가 있으면 **잘린 타일 대신** 이것을 읽는다.

  python3 scripts/fetch-dev-buildings-fine.py [--workers 6] [--limit 0]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import glob
import gzip
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "tmp", "devpressure")
TILES = os.path.join(WORK, "tiles")
FINE = os.path.join(WORK, "tiles-fine")
BASE = "https://redev-platform-iota.vercel.app/api/building-age"
STEP = 0.005
SPLIT = 3


def ring_area_m2(ring, lat0):
    import math

    if len(ring) < 3:
        return 0.0
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    pts = [(p[0] * kx, p[1] * ky) for p in ring]
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def centroid(ring, lat0):
    import math

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


def fetch_one(args):
    tx, ty, sx, sy = args
    path = os.path.join(FINE, f"{tx}_{ty}_{sx}_{sy}.json.gz")
    if os.path.exists(path):
        return "skip"
    sub = STEP / SPLIT
    x0 = 126.76 + tx * STEP + sx * sub
    y0 = 37.42 + ty * STEP + sy * sub
    bbox = f"{x0:.5f},{y0:.5f},{x0 + sub:.5f},{y0 + sub:.5f}"
    for attempt in range(4):
        try:
            u = f"{BASE}?bbox={bbox}&tile={tx},{ty}-{sx}{sy}"
            with urllib.request.urlopen(u, timeout=90) as r:
                d = json.load(r)
            if not d.get("ok"):
                raise RuntimeError(str(d)[:200])
            rows = []
            for b in d.get("buildings", []):
                rings = b.get("r") or []
                if not rings:
                    continue
                flat = rings[0]
                if flat and isinstance(flat[0], (int, float)):
                    ring = [[float(flat[i]), float(flat[i + 1])] for i in range(0, len(flat) - 1, 2)]
                else:
                    ring = [[float(p[0]), float(p[1])] for p in flat]
                lat0 = sum(p[1] for p in ring) / len(ring)
                a = ring_area_m2(ring, lat0)
                if a < 4:
                    continue
                c = centroid(ring, lat0)
                rows.append([round(c[0], 5), round(c[1], 5), round(a), b.get("y")])
            with gzip.open(path, "wt", encoding="utf-8") as fh:
                json.dump({"tile": [tx, ty, sx, sy], "truncated": bool(d.get("truncated")), "rows": rows}, fh)
            return f"ok:{len(rows)}" + ("(trunc)" if d.get("truncated") else "")
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                return f"fail:{e}"
            time.sleep(1.5 * (attempt + 1))
    return "fail"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    os.makedirs(FINE, exist_ok=True)
    todo = []
    trunc = []
    for f in sorted(glob.glob(os.path.join(TILES, "*.json.gz"))):
        d = json.load(gzip.open(f, "rt"))
        if not d.get("truncated"):
            continue
        tx, ty = d["tile"]
        trunc.append((tx, ty))
        for sx in range(SPLIT):
            for sy in range(SPLIT):
                todo.append((tx, ty, sx, sy))
    print(f"잘린 타일 {len(trunc)}개 → 하위 타일 {len(todo)}개", flush=True)
    if a.limit:
        todo = todo[: a.limit]
    stat = {}
    t0 = time.time()
    done = 0
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for res in ex.map(fetch_one, todo):
            done += 1
            key = "fail" if res.startswith("fail") else ("trunc" if "trunc" in res else "ok")
            stat[key] = stat.get(key, 0) + 1
    print(f"완료 {done}개 {time.time() - t0:.0f}s {stat}")
    print(f"저장 {len(glob.glob(os.path.join(FINE, '*.json.gz')))}개")


if __name__ == "__main__":
    sys.exit(main())
