#!/usr/bin/env python3
"""금호23 도면 정합 v4 — 초기값에서 미세 조정 (2026-11-28)

렌더한 필지선이 도면의 지적선 잉크(글자 제거)에 닿는 비율을 최대화한다.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
MAP = Path("/workspace/work_geumho23/map.jpeg")
PARCELS = ROOT / "scripts" / "data" / "parcels-geumho23-20261128.json"
OUT = ROOT / "tmp"

LAT0 = 37.54820265
LNG0 = 127.02044812
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 111132.0


def red_mask(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r > 80) & (r - g > 45) & (r - b > 35)


def cadastral_lines(a):
    dark = (a.max(axis=2) < 150) & ~red_mask(a)
    lab, n = ndi.label(dark, structure=np.ones((3, 3)))
    objs = ndi.find_objects(lab)
    keep = np.zeros(n + 1, bool)
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if max(h, w) >= 26:
            keep[i] = True
    return keep[lab]


def project(pts, params):
    mpp, rot, cx, cy = params
    th = math.radians(rot)
    lat = np.array([p[0] for p in pts])
    lng = np.array([p[1] for p in pts])
    mx = (lng - LNG0) * KX / mpp
    my = -(lat - LAT0) * KY / mpp
    return np.stack([mx * math.cos(th) - my * math.sin(th) + cx,
                     mx * math.sin(th) + my * math.cos(th) + cy], axis=1)


def render(parcels, params, shape, bbox=None):
    img = Image.new("1", (shape[1], shape[0]), 0)
    dr = ImageDraw.Draw(img)
    for p in parcels:
        r = p["rings"][0]
        lat = sum(q[0] for q in r) / len(r)
        lng = sum(q[1] for q in r) / len(r)
        if bbox and not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lng <= bbox[3]):
            continue
        xy = project(r, params)
        if xy[:, 0].max() < 0 or xy[:, 1].max() < 0 or xy[:, 0].min() > shape[1] or xy[:, 1].min() > shape[0]:
            continue
        dr.line([tuple(v) for v in xy], fill=1, width=1)
    return np.asarray(img, bool)


def score(ink_d, rend, tol=1):
    if rend.sum() == 0:
        return 0.0
    return float((rend & ink_d).sum()) / float(rend.sum())


def main():
    im = Image.open(MAP).convert("RGB")
    a = np.asarray(im).astype(int)
    lines = cadastral_lines(a)
    ink_d = ndi.binary_dilation(lines, np.ones((5, 5), bool))
    shape = lines.shape
    parcels = json.loads(PARCELS.read_text(encoding="utf-8"))
    bbox = (LAT0 - 0.0018, LNG0 - 0.0026, LAT0 + 0.0018, LNG0 + 0.0026)

    mpp, rot, cx, cy = (float(v) for v in sys.argv[1:5])
    best = (score(ink_d, render(parcels, (mpp, rot, cx, cy), shape, bbox)), (mpp, rot, cx, cy))
    print("시작", best)
    for stage in range(3):
        span = [0.010, 0.003, 0.001][stage]
        rspan = [0.6, 0.2, 0.06][stage]
        pspan = [8, 3, 1][stage]
        base = best[1]
        for dm in np.arange(-span, span + 1e-9, span / 2):
            for dr in np.arange(-rspan, rspan + 1e-9, rspan / 2):
                for dx in np.arange(-pspan, pspan + 1e-9, max(1, pspan / 2)):
                    for dy in np.arange(-pspan, pspan + 1e-9, max(1, pspan / 2)):
                        p = (base[0] + dm, base[1] + dr, base[2] + dx, base[3] + dy)
                        s = score(ink_d, render(parcels, p, shape, bbox))
                        if s > best[0]:
                            best = (s, p)
        print(f"stage{stage}", best)
    (OUT / "geumho23-fit.json").write_text(
        json.dumps({"mpp": best[1][0], "rot": best[1][1], "cx": best[1][2], "cy": best[1][3],
                    "hit": best[0], "lat0": LAT0, "lng0": LNG0}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
