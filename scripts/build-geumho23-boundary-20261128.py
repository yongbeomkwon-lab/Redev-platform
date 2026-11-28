#!/usr/bin/env python3
"""금호23구역 — 공식 도면(2026-03-05 동의서 번호부여 공개문 1쪽) 구역선을 필지선에 정합해 경계 작성 (2026-11-28)

1) 도면 붉은 구역선을 닫아 안쪽 영역을 채운다.
2) 채운 영역의 윤곽(0.5 등고선)을 뽑아 도면 픽셀 좌표의 폴리곤으로 만든다.
3) 정합 파라미터로 위경도로 옮기고, 각 꼭짓점을 2.5m 안의 연속지적도 필지 꼭짓점으로 붙인다.
4) 결과를 tmp/geumho23-boundary.json 에 저장하고, 도면·필지선 위에 겹쳐 확인 그림을 만든다.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from shapely.geometry import Polygon
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
MAP = Path("/workspace/work_geumho23/map.jpeg")
PARCELS = ROOT / "scripts" / "data" / "parcels-geumho23-20261128.json"
FIT = ROOT / "tmp" / "geumho23-fit.json"
OUT = ROOT / "tmp"

LAT0 = 37.54820265
LNG0 = 127.02044812
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 111132.0


def red_mask(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r > 80) & (r - g > 45) & (r - b > 35)


def region(a, dil=3):
    red = red_mask(a)
    m = ndi.binary_closing(red, np.ones((9, 9), bool))
    m = ndi.binary_dilation(m, ndi.generate_binary_structure(2, 1), iterations=dil)
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    big = lab == (int(np.argmax(sizes)) + 1)
    big = ndi.binary_closing(big, np.ones((21, 21), bool))
    big = ndi.binary_fill_holes(big)
    if dil:
        big = ndi.binary_erosion(big, ndi.generate_binary_structure(2, 1), iterations=dil)
        big = ndi.binary_fill_holes(big)
    return big


def px_to_ll(x, y, mpp, rot):
    th = math.radians(rot)
    dx, dy = x, y
    mx = dx * math.cos(th) + dy * math.sin(th)
    my = -dx * math.sin(th) + dy * math.cos(th)
    mx *= mpp
    my *= mpp
    return (LAT0 - my / KY, LNG0 + mx / KX)


def ll_to_m(lat, lng):
    return ((lng - LNG0) * KX, (lat - LAT0) * KY)


def main():
    fit = json.loads(FIT.read_text(encoding="utf-8"))
    mpp, rot, cx, cy = fit["mpp"], fit["rot"], fit["cx"], fit["cy"]
    im = Image.open(MAP).convert("RGB")
    a = np.asarray(im).astype(int)

    for dil in (2, 3, 4):
        reg = region(a, dil)
        cs = measure.find_contours(reg.astype(float), 0.5)
        c = max(cs, key=len)
        poly_px = [(p[1], p[0]) for p in c]
        area = Polygon(poly_px).area * mpp * mpp
        print(f"dil={dil} 꼭짓점 {len(poly_px)} 면적 {area:,.1f}㎡")

    reg = region(a, 3)
    c = max(measure.find_contours(reg.astype(float), 0.5), key=len)
    ring_px = [(float(p[1]), float(p[0])) for p in c]
    if ring_px[0] != ring_px[-1]:
        ring_px.append(ring_px[0])
    ring_ll = [px_to_ll(x - cx, y - cy, mpp, rot) for x, y in ring_px]
    pg = Polygon([ll_to_m(*q) for q in ring_ll])
    if not pg.is_valid:
        pg = pg.buffer(0)
    pg = pg.simplify(0.7)
    if pg.geom_type == "MultiPolygon":
        pg = max(pg.geoms, key=lambda g: g.area)
    m_ring = list(pg.exterior.coords)
    print(f"단순화 후 면적 {pg.area:,.1f}㎡ · 꼭짓점 {len(m_ring)} · 구멍 {len(pg.interiors)}")

    # 필지 꼭짓점 스냅
    parcels = json.loads(PARCELS.read_text(encoding="utf-8"))
    verts = []
    for p in parcels:
        la = sum(q[0] for q in p["rings"][0]) / len(p["rings"][0])
        ln = sum(q[1] for q in p["rings"][0]) / len(p["rings"][0])
        if abs(la - LAT0) > 0.0022 or abs(ln - LNG0) > 0.0032:
            continue
        for q in p["rings"][0]:
            verts.append(ll_to_m(q[0], q[1]))
    V = np.array(verts)
    snapped = []
    moved = 0
    for x, y in m_ring:
        d = np.hypot(V[:, 0] - x, V[:, 1] - y)
        i = int(np.argmin(d))
        if d[i] <= 2.5:
            snapped.append((float(V[i, 0]), float(V[i, 1])))
            moved += 1
        else:
            snapped.append((x, y))
    print(f"필지 꼭짓점으로 붙인 점 {moved}/{len(m_ring)}")

    sp = Polygon(snapped)
    if not sp.is_valid:
        sp = sp.buffer(0)
    print(f"스냅 후 면적 {sp.area:,.1f}㎡ · 유효 {sp.is_valid} · 형태 {sp.geom_type}")
    if sp.geom_type == "MultiPolygon":
        sp = max(sp.geoms, key=lambda g: g.area)
    ring_out = [[round(LAT0 + y / KY, 7), round(LNG0 + x / KX, 7)] for x, y in list(sp.exterior.coords)]

    (OUT / "geumho23-boundary.json").write_text(json.dumps({
        "mpp": mpp, "rot": rot, "cx": cx, "cy": cy,
        "area_m2": round(sp.area, 1), "ring": ring_out,
        "holes": len(sp.interiors),
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    s = 3
    vis = im.resize((im.width * s, im.height * s), Image.LANCZOS)
    dr = ImageDraw.Draw(vis)
    pts = []
    for lat, lng in ring_out:
        x, y = ll_to_m(lat, lng)
        th = math.radians(rot)
        px = x / mpp * math.cos(th) + y / mpp * math.sin(th) + cx
        py = -x / mpp * math.sin(th) + y / mpp * math.cos(th) + cy
        pts.append((px * s, py * s))
    dr.line(pts, fill=(0, 170, 0), width=2)
    vis.save(OUT / "geumho23-boundary.png")
    print("저장", OUT / "geumho23-boundary.png")


if __name__ == "__main__":
    main()
