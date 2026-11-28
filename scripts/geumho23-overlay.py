#!/usr/bin/env python3
"""금호23 공식 도면 오버레이 확인용 (2026-11-28)

  python3 scripts/geumho23-overlay.py mpp rot cx cy [out.png] [scale] [labels]
cx, cy = (37.54820265, 127.02044812) 기준점의 도면 픽셀 위치
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MAP = Path("/workspace/work_geumho23/map.jpeg")
PARCELS = ROOT / "scripts" / "data" / "parcels-geumho23-20261128.json"
OUT = ROOT / "tmp"

LAT0 = 37.54820265
LNG0 = 127.02044812
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 111132.0


def project(pts, mpp, rot, cx, cy):
    th = math.radians(rot)
    out = []
    for lat, lng in pts:
        mx = (lng - LNG0) * KX / mpp
        my = -(lat - LAT0) * KY / mpp
        out.append((mx * math.cos(th) - my * math.sin(th) + cx, mx * math.sin(th) + my * math.cos(th) + cy))
    return out


def draw(mpp, rot, cx, cy, name="ov.png", scale=2, labels=False, box=None, only=None, color=(0, 110, 255)):
    im = Image.open(MAP).convert("RGB")
    parcels = json.loads(PARCELS.read_text(encoding="utf-8"))
    if box:
        im = im.crop(box)
        cx, cy = cx - box[0], cy - box[1]
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    font = ImageFont.truetype("/workspace/fonts/NanumGothic-Regular.ttf", max(8, int(9 * scale)))
    for p in parcels:
        if only and p["jibun"] not in only:
            continue
        xy = project(p["rings"][0], mpp, rot, cx, cy)
        xy = [(x * scale, y * scale) for x, y in xy]
        if max(x for x, y in xy) < 0 or max(y for x, y in xy) < 0 or min(x for x, y in xy) > im.width or min(y for x, y in xy) > im.height:
            continue
        dr.line(xy, fill=color, width=1)
        if labels:
            mx = sum(x for x, y in xy) / len(xy)
            my = sum(y for x, y in xy) / len(xy)
            dr.text((mx, my), p["jibun"], fill=(0, 80, 200), anchor="mm", font=font)
    p = OUT / name
    im.save(p)
    print("저장", p)


if __name__ == "__main__":
    mpp, rot, cx, cy = (float(v) for v in sys.argv[1:5])
    name = sys.argv[5] if len(sys.argv) > 5 else "ov.png"
    scale = float(sys.argv[6]) if len(sys.argv) > 6 else 2
    labels = len(sys.argv) > 7 and sys.argv[7] == "1"
    draw(mpp, rot, cx, cy, name, scale, labels)
