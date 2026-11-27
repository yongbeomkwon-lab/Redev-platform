#!/usr/bin/env python3
"""금호역 일대 4곳 경계 반영 (2026-11-27) — 사용자 참고 캡처 기준 필지정합

tmp/rings-geumho-20261127.json (fit-geumho-reference-20261127.py build 결과)을 읽어
  · 신통 금호21(11000UQ120PS202411014498) — 무수막길·금동어린이공원 포함, 남측 금남시장 블록 제외
  · 신통 금호23(sy-geumho23)
  · 지주택 금호동4가 1458(11000UQ120PS202505310983)
  · 금남시장(sd-geumnam-market) — 금호동3가 368 일대 시장 블록

겹침(금호21 ∩ 금남시장)이 남으면 금호21 도형에서 금남시장 도형을 빼서 0으로 만든다.

실행: python3 scripts/apply-geumho-boundaries-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
RINGS = ROOT / "tmp" / "rings-geumho-20261127.json"
AS_OF = "2026-11-27"
META_KEY = "geumho4Boundaries_20261127"

MAP = {
    "geumho21": "11000UQ120PS202411014498",
    "geumho23": "sy-geumho23",
    "geumho1458": "11000UQ120PS202505310983",
    "geumnam": "sd-geumnam-market",
}

NOTES = {
    "geumho21": (
        "금호동3가 1번지 일대 정비구역(75,447㎡)을 브이월드 연속지적도 필지로 조립한 경계입니다. "
        "무수막길·무수막3·5길 일대와 금동어린이공원을 포함하고, 남측에 붙은 금남시장정비구역 블록은 "
        "빼서 겹치지 않습니다. 사용자가 보낸 지적편집도 캡처의 구역선을 기준으로 필지를 골랐고, "
        "도형 면적 {area:,}㎡는 정비구역 면적 75,447㎡ 대비 {diff:+.1f}%입니다."
    ),
    "geumho23": (
        "독서당로·장터길·독서당로46길 사이 사다리꼴 블록입니다. 사용자가 보낸 캡처의 구역선을 기준으로 "
        "연속지적도 필지 {n}개를 모아 조립했고, 도형 면적 {area:,}㎡는 공개 면적 30,706㎡ 대비 {diff:+.1f}%입니다."
    ),
    "geumho1458": (
        "금호역 1·2번 출구 앞 장터1가길·동호로2길 사이 블록의 지역주택조합(지주택) 사업부지입니다. "
        "연속지적도 필지 {n}개를 합집합했고, 도형 면적 {area:,}㎡는 구역면적 13,103㎡ 대비 {diff:+.1f}%입니다."
    ),
    "geumnam": (
        "금호동3가 368번지 일대 금남시장정비구역(4,717.1㎡)입니다. 연속지적도 필지 {n}개를 모아 "
        "직사각형 시장 블록으로 조립했고, 도형 면적 {area:,}㎡는 고시 면적 대비 {diff:+.1f}%입니다."
    ),
}


def to_m(ring, lat0, lng0):
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    return [((p[1] - lng0) * kx, (p[0] - lat0) * ky) for p in ring]


def from_m(coords, lat0, lng0):
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    return [[round(lat0 + y / ky, 7), round(lng0 + x / kx, 7)] for x, y in coords]


def area_of(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        s += (ring[i][1] * kx) * (ring[i + 1][0] * ky) - (ring[i + 1][1] * kx) * (ring[i][0] * ky)
    return abs(s / 2)


def apply():
    rings = json.loads(RINGS.read_text(encoding="utf-8"))
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in zones}

    # 금호21에서 금남시장 블록 빼기
    g21 = rings.get("geumho21")
    gm = rings.get("geumnam")
    if g21 and gm:
        lat0 = sum(p[0] for p in g21["ring"]) / len(g21["ring"])
        lng0 = sum(p[1] for p in g21["ring"]) / len(g21["ring"])
        p21 = Polygon(to_m(g21["ring"], lat0, lng0))
        pm = Polygon(to_m(gm["ring"], lat0, lng0))
        if not p21.is_valid:
            p21 = p21.buffer(0)
        if not pm.is_valid:
            pm = pm.buffer(0)
        inter = p21.intersection(pm).area
        print(f"금호21 ∩ 금남시장 = {inter:,.1f}㎡")
        if inter > 1:
            cut = p21.difference(pm.buffer(0.15))
            if cut.geom_type == "MultiPolygon":
                cut = max(cut.geoms, key=lambda g: g.area)
            g21["ring"] = from_m(list(cut.exterior.coords), lat0, lng0)
            g21["parts"] = []
            print(f"  → 금호21에서 금남시장을 빼냄: {area_of(g21['ring']):,.1f}㎡")

    for key, zid in MAP.items():
        r = rings.get(key)
        z = by_id.get(zid)
        if not r or not z:
            print(f"!! {key}/{zid} 없음")
            continue
        ring = r["ring"]
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        area = area_of(ring)
        diff = (area - r["target"]) / r["target"] * 100
        z["polygon"] = ring
        if r.get("parts"):
            z["parts"] = [p if p[0] == p[-1] else p + [p[0]] for p in r["parts"]]
        else:
            z.pop("parts", None)
        z["geom"] = "필지정합"
        z["boundaryApprox"] = True
        z["areaShape"] = round(area, 1)
        z["ringPts"] = len(ring)
        z["asOf"] = AS_OF
        z["boundaryNote"] = NOTES[key].format(n=len(r["parcels"]), area=round(area), diff=diff)
        srcs = list(z.get("sources") or [])
        if not any("vworld" in (s.get("url") or "") for s in srcs):
            srcs.append({"label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계", "url": "https://www.vworld.kr"})
        z["sources"] = srcs
        print(f"{zid:38s} {area:10,.1f}㎡ / {r['target']:10,.1f}㎡ ({diff:+.1f}%) · {len(ring)}정점 · 필지 {len(r['parcels'])}개")

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs", "--force"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": (
            "금호역 일대 4곳(신통 금호21·금호23, 지주택 금호동4가 1458, 금남시장) 경계를 사용자 참고 "
            "캡처(지적편집도)의 구역선 기준으로 연속지적도 필지로 조립(필지정합). 금호21은 금남시장 블록 제외."
        ),
        "zones": {zid: {"geom": "필지정합"} for zid in MAP.values()},
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("완료")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
