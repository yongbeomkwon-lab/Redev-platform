#!/usr/bin/env python3
"""금호23구역 경계 다듬기 — 도면 구역선 윤곽을 필지선에 붙이고 정리 (2026-11-28)

build-geumho23-boundary-20261128.py 가 만든 tmp/geumho23-boundary.json 의 외곽선에
  1) 중복 꼭짓점 제거
  2) 변 위 1.2m 안의 연속지적도 필지 꼭짓점 끼워 넣기 (필지선에 맞닿게)
  3) 아주 짧은 변(0.3m 미만) 정리
를 적용해 tmp/geumho23-ring.json 에 최종 링을 쓴다. 도면 위 겹침 확인 그림도 만든다.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import LineString, Polygon

ROOT = Path(__file__).resolve().parent.parent
MAP = Path("/workspace/work_geumho23/map.jpeg")
PARCELS = ROOT / "scripts" / "data" / "parcels-geumho23-20261128.json"
SRC = ROOT / "tmp" / "geumho23-boundary.json"
FIT = ROOT / "tmp" / "geumho23-fit.json"
OUT = ROOT / "tmp"

LAT0 = 37.54820265
LNG0 = 127.02044812
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 111132.0


def to_m(p):
    return ((p[1] - LNG0) * KX, (p[0] - LAT0) * KY)


def to_ll(xy):
    x, y = xy
    return [round(LAT0 + y / KY, 7), round(LNG0 + x / KX, 7)]


def main(tol=1.2):
    src = json.loads(SRC.read_text(encoding="utf-8"))
    ring = [to_m(p) for p in src["ring"]]
    # 닫힌 링 → 열린 링
    if math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1]) < 0.05:
        ring = ring[:-1]
    # 1) 중복 제거
    ded = []
    for p in ring:
        if not ded or math.hypot(p[0] - ded[-1][0], p[1] - ded[-1][1]) > 0.15:
            ded.append(p)
    if math.hypot(ded[0][0] - ded[-1][0], ded[0][1] - ded[-1][1]) < 0.15:
        ded.pop()
    print(f"중복 제거 {len(ring)} → {len(ded)}")

    # 필지 꼭짓점 모으기
    parcels = json.loads(PARCELS.read_text(encoding="utf-8"))
    verts = []
    for p in parcels:
        r = p["rings"][0]
        la = sum(q[0] for q in r) / len(r)
        ln = sum(q[1] for q in r) / len(r)
        if abs(la - LAT0) > 0.0012 or abs(ln - LNG0) > 0.0018:
            continue
        for q in r:
            verts.append(to_m(q))
    V = np.array(verts)
    print("주변 필지 꼭짓점", len(V))

    # 2) 각 변에 필지 꼭짓점 끼워 넣기 + 꼭짓점 스냅
    out = []
    for i in range(len(ded)):
        a = np.array(ded[i])
        b = np.array(ded[(i + 1) % len(ded)])
        seg = b - a
        L = float(np.hypot(*seg))
        if L < 1e-6:
            continue
        u = seg / L
        inside = []
        for v in V:
            w = v - a
            t = float(w @ u)
            if 0.5 < t < L - 0.5:
                d = abs(float(w[0] * (-u[1]) + w[1] * u[0]))
                if d <= tol:
                    inside.append((t, float(v[0]), float(v[1])))
        inside.sort()
        # 시작점을 필지 꼭짓점으로 스냅
        d0 = np.hypot(V[:, 0] - a[0], V[:, 1] - a[1])
        p0 = (float(V[np.argmin(d0), 0]), float(V[np.argmin(d0), 1])) if d0.min() <= tol else (a[0], a[1])
        out.append(p0)
        for t, x, y in inside:
            if math.hypot(x - out[-1][0], y - out[-1][1]) > 0.15:
                out.append((x, y))
    # 3) 짧은 변 정리
    cleaned = []
    for p in out:
        if not cleaned or math.hypot(p[0] - cleaned[-1][0], p[1] - cleaned[-1][1]) > 0.3:
            cleaned.append(p)
    if math.hypot(cleaned[0][0] - cleaned[-1][0], cleaned[0][1] - cleaned[-1][1]) < 0.3:
        cleaned.pop()
    print(f"필지 꼭짓점 삽입 후 {len(ded)} → {len(cleaned)}")

    pg = Polygon(cleaned)
    print("유효", pg.is_valid, "면적", round(pg.area, 1), "구멍", len(pg.interiors))
    if not pg.is_valid:
        pg = pg.buffer(0)
        print("buffer(0) 후", pg.geom_type, round(pg.area, 1), "구멍", len(pg.interiors))
    if pg.geom_type == "MultiPolygon":
        pg = max(pg.geoms, key=lambda g: g.area)
    ring_m = list(pg.exterior.coords)[:-1]
    ll = [to_ll(p) for p in ring_m]

    # 품질: 링 길이 중 필지선 위(1.0m) 비율
    from scipy import ndimage as ndi
    fit = json.loads(FIT.read_text(encoding="utf-8"))
    mpp, rot, cx, cy = fit["mpp"], fit["rot"], fit["cx"], fit["cy"]
    im = Image.new("1", (1020, 674), 0)
    dr = ImageDraw.Draw(im)
    th = math.radians(rot)
    for p in parcels:
        pts = []
        for la, ln in p["rings"][0]:
            mx = (ln - LNG0) * KX / mpp
            my = -(la - LAT0) * KY / mpp
            pts.append((mx * math.cos(th) - my * math.sin(th) + cx, mx * math.sin(th) + my * math.cos(th) + cy))
        dr.line(pts, fill=1, width=1)
    lines = np.asarray(im, bool)
    D = ndi.distance_transform_edt(~lines)
    tot = on = 0.0
    for i in range(len(ring_m)):
        a = np.array(ring_m[i])
        b = np.array(ring_m[(i + 1) % len(ring_m)])
        L = float(np.hypot(*(b - a)))
        n = max(2, int(L / 0.5))
        s = 0
        for k in range(n + 1):
            x, y = a + (b - a) * (k / n)
            mx = x / mpp
            my = y / mpp
            px = mx * math.cos(th) + my * math.sin(th) + cx
            py = -mx * math.sin(th) + my * math.cos(th) + cy
            if 0 <= py < D.shape[0] and 0 <= px < D.shape[1] and D[int(py), int(px)] <= 1.0 / mpp:
                s += 1
        tot += L
        on += L * s / (n + 1)
    print(f"경계 길이 {tot:,.0f}m 중 필지선 위 {on:,.0f}m ({on / tot * 100:.1f}%)")

    (OUT / "geumho23-ring.json").write_text(
        json.dumps({"area_m2": round(pg.area, 1), "ring": ll, "ringPts": len(ll),
                    "on_parcel_pct": round(on / tot * 100, 1)}, ensure_ascii=False, indent=1),
        encoding="utf-8")

    s = 4
    vis = Image.open(MAP).convert("RGB")
    vis = vis.resize((vis.width * s, vis.height * s), Image.LANCZOS)
    d2 = ImageDraw.Draw(vis)
    pts = []
    for la, ln in ll:
        x, y = to_m((la, ln))
        pts.append(((x / mpp * math.cos(th) + y / mpp * math.sin(th) + cx) * s,
                    (-x / mpp * math.sin(th) + y / mpp * math.cos(th) + cy) * s))
    d2.line(pts + [pts[0]], fill=(0, 170, 0), width=2)
    vis.save(OUT / "geumho23-ring-check.png")
    print("저장", OUT / "geumho23-ring-check.png")


if __name__ == "__main__":
    main(float(__import__("sys").argv[1]) if len(__import__("sys").argv) > 1 else 1.2)
