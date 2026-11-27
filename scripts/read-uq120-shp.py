#!/usr/bin/env python3
"""서울 UQ120(서울플랜+ 도시계획사업) 원본 SHP에서 구역 도형·속성 뽑기 (2026-11-27)

  우리 데이터(seoul-zones.json)의 UQ120 도형은 가져올 때 단순화된 것이라, 원본 SHP의 정점을
  그대로 읽어 면적·정점 수를 비교한다.

  사용: python3 scripts/read-uq120-shp.py "금호21" [더 볼 이름들…]
"""
from __future__ import annotations

import math
import struct
import sys
from pathlib import Path

SHP = Path("/workspace/tmp/seoul_zip/532_UQ120_도시계획사업(서울플랜+)_202609/shp파일/UPIS_C_UQ120.shp")
DBF = SHP.with_suffix(".dbf")


def read_dbf(path):
    data = path.read_bytes()
    nrec = struct.unpack("<I", data[4:8])[0]
    hlen = struct.unpack("<H", data[8:10])[0]
    rlen = struct.unpack("<H", data[10:12])[0]
    fields = []
    off = 32
    while data[off] != 0x0D:
        name = data[off:off + 11].split(b"\x00")[0].decode("cp949", "replace")
        ftype = chr(data[off + 11])
        flen = data[off + 16]
        fields.append((name, ftype, flen))
        off += 32
    recs = []
    for i in range(nrec):
        base = hlen + i * rlen
        rec = {}
        pos = base + 1
        for name, ftype, flen in fields:
            raw = data[pos:pos + flen]
            pos += flen
            rec[name] = raw.decode("cp949", "replace").strip()
        recs.append(rec)
    return recs


def read_shp(path):
    data = path.read_bytes()
    pos = 100
    out = []
    while pos < len(data):
        num, length = struct.unpack(">ii", data[pos:pos + 8])
        body = data[pos + 8: pos + 8 + length * 2]
        pos += 8 + length * 2
        if len(body) < 4:
            continue
        stype = struct.unpack("<i", body[:4])[0]
        if stype == 0:
            out.append(None)
            continue
        numparts, numpoints = struct.unpack("<ii", body[36:44])
        parts = struct.unpack(f"<{numparts}i", body[44:44 + 4 * numparts])
        pts_off = 44 + 4 * numparts
        pts = struct.unpack(f"<{numpoints * 2}d", body[pts_off: pts_off + 16 * numpoints])
        rings = []
        for pi in range(numparts):
            start = parts[pi]
            end = parts[pi + 1] if pi + 1 < numparts else numpoints
            rings.append([(pts[2 * j], pts[2 * j + 1]) for j in range(start, end)])
        out.append(rings)
    return out


def area_m2(ring):
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0] * kx, ring[i][1] * ky
        x2, y2 = ring[i + 1][0] * kx, ring[i + 1][1] * ky
        s += x1 * y2 - x2 * y1
    return abs(s / 2)


def main():
    names = sys.argv[1:] or ["금호21"]
    recs = read_dbf(DBF)
    geoms = read_shp(SHP)
    print("레코드", len(recs), "도형", len(geoms))
    print("필드:", list(recs[0].keys())[:12])
    for i, rec in enumerate(recs):
        label = " ".join(str(v) for v in rec.values())
        if any(n in label for n in names):
            g = geoms[i]
            if not g:
                print(f"[{i}] {label[:60]} — 도형 없음")
                continue
            outer = max(g, key=lambda r: abs(area_m2(r)))
            print(f"[{i}] {{k: v for k, v in rec.items() if v}}")
            print(f"     rings={len(g)} outer pts={len(outer)} area={area_m2(outer):,.1f}㎡")
            print(f"     keys: {rec}")


if __name__ == "__main__":
    main()
