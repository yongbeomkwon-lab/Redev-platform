#!/usr/bin/env python3
"""tmp/rings-20261128.json 조립 결과를 OSM 타일 위에 그려 확인 (2026-11-28)

  python3 scripts/render-rings-preview.py out_dir zid1 zid2 …
  → out_dir/{zid}.png (구역 폴리곤 + 중심 십자)
"""
from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RINGS = ROOT / "tmp" / "rings-20261128.json"
CACHE = ROOT / "tmp" / "osm-tiles"
SIZE = 420


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


def render(zid: str, r: dict, out: Path, z: int = 16):
    rings = [r["ring"]] + (r.get("parts") or [])
    lats = [p[0] for ring in rings for p in ring]
    lngs = [p[1] for ring in rings for p in ring]
    lat_c = (min(lats) + max(lats)) / 2
    lng_c = (min(lngs) + max(lngs)) / 2
    xc, yc = deg2num(lat_c, lng_c, z)
    tw = SIZE / 256
    tx0, ty0 = int(xc - tw / 2), int(yc - tw / 2)
    n = int(tw) + 1
    W = H = n * 256
    canvas = Image.new("RGB", (W, H), "white")
    for tx in range(tx0, tx0 + n):
        for ty in range(ty0, ty0 + n):
            try:
                canvas.paste(fetch_tile(z, tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
            except Exception:
                pass

    def px(lat, lng):
        x, y = deg2num(lat, lng, z)
        return ((x - tx0) * 256, (y - ty0) * 256)

    d = ImageDraw.Draw(canvas, "RGBA")
    for ring in rings:
        pts = [px(la, ln) for la, ln in ring]
        d.polygon(pts, fill=(220, 0, 60, 70), outline=(200, 0, 40, 255))
        d.line(pts + [pts[0]], fill=(160, 0, 30, 255), width=3)
    cx, cy = px(lat_c, lng_c)
    d.line([(cx - 10, cy), (cx + 10, cy)], fill=(0, 0, 255, 255), width=2)
    d.line([(cx, cy - 10), (cx, cy + 10)], fill=(0, 0, 255, 255), width=2)
    try:
        font = ImageFont.truetype("/workspace/fonts/NotoSansKR-Bold.otf", 20)
    except Exception:
        font = ImageFont.load_default()
    label = f"{zid} {r['areaShape']:,.0f}㎡ / {r['target']:,.0f}㎡"
    d.rectangle([0, 0, W, 30], fill=(255, 255, 255, 220))
    d.text((6, 4), label, fill=(0, 0, 0), font=font)
    canvas = canvas.resize((int(W * 0.72), int(H * 0.72)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    return out


def main():
    out_dir = Path(sys.argv[1])
    ids = sys.argv[2:]
    rings = json.loads(RINGS.read_text(encoding="utf-8"))
    for zid in ids:
        r = rings.get(zid)
        if not r:
            print("없음:", zid)
            continue
        print(render(zid, r, out_dir / f"{zid}.png"))


if __name__ == "__main__":
    main()
