#!/usr/bin/env python3
"""서울 UQ120 원본 SHP에서 성동·광진 9곳 중 공식 도형이 있는 구역을 뽑는다 (2026-11-27)

  우리 파이프라인(import-seoul-zones.py)이 BZ602(리모델링활성화구역)·BZ603(시장정비사업)을
  지도 대상에서 빼 두어서, **금남시장(BZ603)** 과 **응봉대림1차(BZ602)** 가 데이터에 없었다.
  원본 SHP에는 두 구역의 공식 구역계가 들어 있어(금남시장 4,717㎡·응봉대림1차 46,394㎡)
  이번에 공식 도형 그대로 등록한다. 금호21(111정점)·금호동4가 1458(87정점)·군자동 349-8(51정점)도
  원본 정점 수 그대로 다시 뽑아 우리 데이터의 단순화본(31·15·31정점)을 교체한다.

출력: scripts/data/official-seongdong-20261127.json
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from pyproj import CRS, Transformer

ROOT = Path(__file__).resolve().parent.parent
SHP_DIR = Path("/workspace/tmp/seoul_zip/532_UQ120_도시계획사업(서울플랜+)_202609/shp파일")
OUT = ROOT / "scripts" / "data" / "official-seongdong-20261127.json"

SRC = CRS.from_proj4(
    "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 "
    "+ellps=bessel +units=m +no_defs "
    "+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43"
)
TR = Transformer.from_crs(SRC, CRS.from_epsg(4326), always_xy=True)

TARGETS = {
    "11000UQ120PS202505311220": "geumnam",          # 금남시장 (BZ603 시장정비)
    "11000UQ120PS202505311188": "eungbong-daerim1",  # 응봉대림1차아파트 (BZ602 리모델링활성화구역)
    "11000UQ120PS202411014498": "geumho21",          # 금호21구역
    "11000UQ120PS202505310983": "geumho1458",        # 금호동4가 1458
    "11000UQ120PS202505310679": "gunja349-8",        # 군자동 350-18(=349-8)
}


def read_dbf(path):
    data = path.read_bytes()
    nrec = int.from_bytes(data[4:8], "little")
    hlen = int.from_bytes(data[8:10], "little")
    rlen = int.from_bytes(data[10:12], "little")
    fields, off = [], 32
    while data[off] != 0x0D:
        name = data[off:off + 11].split(b"\x00")[0].decode("cp949", "replace")
        flen = data[off + 16]
        fields.append((name, flen))
        off += 32
    recs = []
    for i in range(nrec):
        pos = hlen + i * rlen + 1
        rec = {}
        for name, flen in fields:
            rec[name] = data[pos:pos + flen].decode("cp949", "replace").strip()
            pos += flen
        recs.append(rec)
    return recs


def read_shp(path):
    import struct
    data = path.read_bytes()
    pos, out = 100, []
    while pos < len(data):
        num, length = struct.unpack(">ii", data[pos:pos + 8])
        body = data[pos + 8: pos + 8 + length * 2]
        pos += 8 + length * 2
        stype = struct.unpack("<i", body[:4])[0]
        if stype == 0:
            out.append(None)
            continue
        numparts, numpoints = struct.unpack("<ii", body[36:44])
        parts = struct.unpack(f"<{numparts}i", body[44:44 + 4 * numparts])
        off = 44 + 4 * numparts
        pts = struct.unpack(f"<{numpoints * 2}d", body[off: off + 16 * numpoints])
        rings = []
        for pi in range(numparts):
            s = parts[pi]
            e = parts[pi + 1] if pi + 1 < numparts else numpoints
            rings.append([[pts[2 * j], pts[2 * j + 1]] for j in range(s, e)])
        out.append(rings)
    return out


def area_m2(ring):
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        s += (ring[i][0] * kx) * (ring[i + 1][1] * ky) - (ring[i + 1][0] * kx) * (ring[i][1] * ky)
    return abs(s / 2)


def main():
    recs = read_dbf(SHP_DIR / "UPIS_C_UQ120.dbf")
    geoms = read_shp(SHP_DIR / "UPIS_C_UQ120.shp")
    out = {}
    for i, rec in enumerate(recs):
        sn = rec.get("PRESENT_SN")
        if sn not in TARGETS:
            continue
        rings = geoms[i]
        if not rings:
            continue
        # 투영(m) → 경위도
        ll = []
        for ring in rings:  # 구멍(inner ring)은 방향으로 구분 — 일단 모두 담고 나중에 정리
            conv = [list(TR.transform(x, y)) for x, y in ring]
            ll.append(conv)
        outer = max(ll, key=lambda r: abs(area_m2(r)))
        if outer[0] != outer[-1]:
            outer = outer + [outer[0]]
        key = TARGETS[sn]
        out[key] = {
            "sourceId": sn,
            "name": rec.get("DGM_NM"),
            "cls": rec.get("ATRB_SE"),
            "areaNotice": float(rec.get("DGM_AR") or 0),
            "shapeArea": float(rec.get("SHAPE_AREA") or 0),
            "stageCode": rec.get("PROPEL_CD"),
            "ring": [[round(p[1], 7), round(p[0], 7)] for p in outer],
            "parts": [
                [[round(p[1], 7), round(p[0], 7)] for p in r]
                for r in ll if r is not outer and len(r) > 3
            ],
            "extraRings": len(ll) - 1,
        }
        print(f"{key:18s} {rec.get('DGM_NM'):28s} {rec.get('ATRB_SE')} 면적 {rec.get('DGM_AR'):>10} "
              f"shape {float(rec.get('SHAPE_AREA')):>10,.1f} 정점 {len(outer)} 링 {len(ll)}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("저장", OUT)


if __name__ == "__main__":
    main()
