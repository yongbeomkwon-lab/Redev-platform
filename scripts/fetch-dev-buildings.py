#!/usr/bin/env python3
"""개발압력 분석용 서울 전역 건물 수집 — 배포된 `/api/building-age` 를 타일 단위로 호출

왜 배포된 라우트를 쓰나
  · 브이월드 WFS(`api.vworld.kr`)는 이 작업 환경에서 직접 부를 수 없다(HTTP/2 REFUSED_STREAM,
    HTTP/1.1 은 502 — 2026-11-21 실측). 같은 요청이 Vercel 함수에서는 정상 응답한다.
  · 라우트가 이미 건축물대장 연식 색인(`public/data/age-index`)으로 사용승인 연도를 덮어쓰므로,
    여기서 받는 연도는 지도 노후도 오버레이와 같은 값이다.

수집 단위·저장
  · 타일 0.005°(≈440×550m) — `/api/building-age` 의 bbox 상한과 같은 격자.
  · 타일마다 `tmp/devpressure/tiles/<tx>_<ty>.json.gz` 로 저장한다(재시작하면 있는 타일은 건너뛴다).
    내용: [[lng, lat, footprint_m2, year|null], …] — 중심점·외곽 면적·사용승인 연도.

  python3 scripts/fetch-dev-buildings.py            # 서울 전체(서울 경계와 겹치는 타일만)
  python3 scripts/fetch-dev-buildings.py --limit 50 # 시간 제한 실행(이어받기)
"""
import argparse
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "tmp", "devpressure")
TILES = os.path.join(WORK, "tiles")
SIG = os.path.join(WORK, "sig.geojson")  # 서울 시군구 경계(법정동 경계 저장소에서 받은 것)
BASE = "https://redev-platform-iota.vercel.app/api/building-age"
STEP = 0.005


def seoul_polys():
    data = json.load(open(SIG, encoding="utf-8"))
    boxes = []
    for f in data["features"]:
        if f["properties"].get("CTPRVN_CD") != "11":
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for p in polys:
            ring = p[0]
            xs = [pt[0] for pt in ring]
            ys = [pt[1] for pt in ring]
            boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def ring_area_m2(ring):
    """외곽 링(경위도) → 면적(m²). 위도 37.55 기준 등장방형 근사."""
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
    s = 0.0
    cx = 0.0
    cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        f = x1 * y2 - x2 * y1
        s += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(s) < 1e-9:  # 퇴화 폴리곤 — 꼭짓점 평균으로
        return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    s *= 0.5
    cx /= 6 * s
    cy /= 6 * s
    return (cx / kx, cy / ky)


def tile_path(tx, ty):
    return os.path.join(TILES, f"{tx}_{ty}.json.gz")


def fetch_tile(args):
    tx, ty = args
    path = tile_path(tx, ty)
    if os.path.exists(path):
        return "skip"
    x0 = 126.76 + tx * STEP
    y0 = 37.42 + ty * STEP
    bbox = f"{x0:.4f},{y0:.4f},{x0 + STEP:.4f},{y0 + STEP:.4f}"
    for attempt in range(4):
        try:
            u = f"{BASE}?bbox={bbox}&tile={tx},{ty}"
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
                # 라우트는 [lng,lat,lng,lat,…] 평면 배열로 내려준다
                if flat and isinstance(flat[0], (int, float)):
                    ring = [[float(flat[i]), float(flat[i + 1])] for i in range(0, len(flat) - 1, 2)]
                else:
                    ring = [[float(p[0]), float(p[1])] for p in flat]
                a = ring_area_m2(ring)
                if a < 4:
                    continue
                c = centroid(ring)
                rows.append([round(c[0], 5), round(c[1], 5), round(a), b.get("y")])
            with gzip.open(path, "wt", encoding="utf-8") as fh:
                json.dump({"tile": [tx, ty], "truncated": bool(d.get("truncated")), "rows": rows}, fh)
            return f"ok:{len(rows)}" + ("(trunc)" if d.get("truncated") else "")
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                return f"fail:{e}"
            time.sleep(1.5 * (attempt + 1))
    return "fail"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="이번 실행에서 처리할 최대 타일 수")
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    os.makedirs(TILES, exist_ok=True)
    boxes = seoul_polys()
    todo = []
    for tx in range(0, 87):
        x0 = 126.76 + tx * STEP
        for ty in range(0, 57):
            y0 = 37.42 + ty * STEP
            if not any(b[0] <= x0 + STEP and b[2] >= x0 and b[1] <= y0 + STEP and b[3] >= y0 for b in boxes):
                continue
            if os.path.exists(tile_path(tx, ty)):
                continue
            todo.append((tx, ty))
    if a.limit:
        todo = todo[: a.limit]
    print(f"남은 타일 {len(todo)}개 (workers={a.workers})", flush=True)
    done = 0
    stat = {}
    t0 = time.time()
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for res in ex.map(fetch_tile, todo):
            done += 1
            key = res.split(":")[0] if not res.startswith("fail") else "fail"
            stat[key] = stat.get(key, 0) + 1
            if done % 50 == 0:
                print(f"  {done}/{len(todo)}  {time.time() - t0:.0f}s  {stat}", flush=True)
    print(f"완료 {done}개 {time.time() - t0:.0f}s {stat}", flush=True)
    n = len([f for f in os.listdir(TILES) if f.endswith(".json.gz")])
    print(f"저장된 타일 총 {n}개")


if __name__ == "__main__":
    sys.exit(main())
