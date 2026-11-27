#!/usr/bin/env python3
"""구역 경계를 OSM 타일 위에 그려 확인하는 도구 (2026-11-27 성동·광진 작업)

사용:
  python3 scripts/render-zones-osm.py out.png 37.545 127.012 37.553 127.028 z17 zone1 zone2 …
  (zone id 를 비우면 이 작업 대상 4곳+전체 9곳을 그린다)
"""
from __future__ import annotations

import io
import json
import math
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ZONES = ROOT / "src" / "data" / "seoul-zones.json"
CACHE = ROOT / "tmp" / "osm-tiles"
COLORS = {
    "11000UQ120PS202505310983": ((0, 120, 255), "지주택 금호동4가 1458"),
    "sy-geumho23": ((230, 0, 0), "신통 금호23"),
    "11000UQ120PS202411014498": ((200, 0, 120), "신통 금호21"),
    "sd-geumnam-market": ((0, 150, 60), "금남시장"),
}


def deg2num(lat, lng, z):
    n = 2**z
    x = (lng + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def fetch_tile(z, x, y):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{z}_{x}_{y}.png"
    if not f.exists():
        url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        req = urllib.request.Request(url, headers={"User-Agent": "redev-platform/1.0 (zone check)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            f.write_bytes(r.read())
    return Image.open(f).convert("RGB")


def main():
    out = sys.argv[1]
    lat1, lng1, lat2, lng2 = map(float, sys.argv[2:6])
    z = int(sys.argv[6].lstrip("z"))
    ids = sys.argv[7:] or list(COLORS)

    zones = {z_["id"]: z_ for z_ in json.loads(ZONES.read_text(encoding="utf-8"))}
    x0, y0 = deg2num(lat2, lng1, z)
    x1, y1 = deg2num(lat1, lng2, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    canvas = Image.new("RGB", (W, H), "white")
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            canvas.paste(fetch_tile(z, tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))

    def to_px(lat, lng):
        fx, fy = deg2num(lat, lng, z)
        return (fx - tx0) * 256, (fy - ty0) * 256

    draw = ImageDraw.Draw(canvas, "RGBA")
    for zid in ids:
        z_ = zones.get(zid)
        if not z_:
            print("없는 구역:", zid)
            continue
        color, label = COLORS.get(zid, ((120, 0, 255), z_["name"]))
        poly = z_.get("polygon") or []
        if not poly:
            cx, cy = to_px(*(z_["center"]))
            draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=color + (230,), outline=(0, 0, 0))
            draw.text((cx + 8, cy - 6), f"{label} (점)", fill=(0, 0, 0))
            continue
        pts = [to_px(p[0], p[1]) for p in poly]
        draw.polygon(pts, fill=color + (60,), outline=color + (255,))
        for i in range(len(pts) - 1):
            draw.line([pts[i], pts[i + 1]], fill=color + (255,), width=3)
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        draw.text((cx, cy), label, fill=(0, 0, 0))
    canvas.save(out)
    print("저장", out, canvas.size)


if __name__ == "__main__":
    main()
