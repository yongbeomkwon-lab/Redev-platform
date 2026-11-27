#!/usr/bin/env python3
"""연속지적도 필지 조회 → 구역 경계 조립 (2026-11-27 성동·광진 9곳 2단계)

## 무엇
  브이월드 2D 데이터 API(LP_PA_CBND_BUBUN)로 구역 주변 필지를 받아, 대표 지번 필지에서
  **도로 필지를 건너지 않고 맞닿은 대지 필지를 모아** 구역 경계(필지 합집합 외곽선)를 만든다.
  · 2026-11-27 18:00~24:00 브이월드 전체 점검으로 API가 302(점검안내)를 돌려주면 이 스크립트는
    "VWORLD_DOWN" 을 남기고 멈춘다 — 점검 뒤 다시 실행한다.

## 쓰는 법
  python3 scripts/fetch-parcels-seongdong-20261127.py fetch   # 필지 캐시(scripts/data/parcels-seongdong-20261127.json)
  python3 scripts/fetch-parcels-seongdong-20261127.py rings   # 캐시로 구역 경계 조립 → tmp/rings-seongdong-20261127.json
  python3 scripts/fetch-parcels-seongdong-20261127.py report  # 조립 결과 면적·정점 수 표
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "data" / "parcels-seongdong-20261127.json"
OUT = ROOT / "tmp" / "rings-seongdong-20261127.json"

KEY = "339B86BB-6986-4CE3-9707-06F51C3B4788"
DOMAIN = "redev-platform-iota.vercel.app"
ENDPOINT = "https://api.vworld.kr/req/data"

# 구역별 조회 상자(중심·반경 m)·대표 지번·목표 면적(공개·고시 면적)·조립 손잡이
#   max_ring  : 대표 필지에서 맞닿은 필지를 몇 겹까지 넓힐지
#   include   : 반드시 넣을 지번(도로 건너편 필지·블록 안 도로 등)
#   exclude   : 빼야 할 지번
ZONES = {
    "gunja-349-8": {
        "label": "군자동 349-8번지 일원 가로주택정비사업",
        "dong": "군자동",
        "center": (37.551357, 127.069910),
        "radius": 220,
        "target": 8713,
        "seeds": ["349-8"],
        "max_ring": 3,
    },
    "geumho-1458": {
        "label": "금호동4가 1458(금호역라비체)",
        "dong": "금호동4가",
        "center": (37.548140, 127.017024),
        "radius": 240,
        "target": 13103,
        "seeds": ["1458"],
        "max_ring": 4,
    },
    "geumnam-market": {
        "label": "금남시장정비구역(금호동3가 368)",
        "dong": "금호동3가",
        "center": (37.548453, 127.022714),
        "radius": 180,
        "target": 4717.1,
        "seeds": ["368"],
        "max_ring": 3,
    },
    "eungbong-geumho-hyundai": {
        "label": "금호현대아파트(응봉동 98)",
        "dong": "응봉동",
        "center": (37.551046, 127.030953),
        "radius": 280,
        "target": 30465,
        "seeds": ["98"],
        "max_ring": 4,
    },
    "eungbong-daerim1": {
        "label": "응봉대림1차아파트(응봉동 100)",
        "dong": "응봉동",
        "center": (37.551932, 127.033262),
        "radius": 320,
        "target": 46000,
        "seeds": ["100"],
        "max_ring": 4,
    },
    "majang-793-22": {
        "label": "마장동 793-22 장기전세",
        "dong": "마장동",
        "center": (37.564854, 127.042547),
        "radius": 220,
        "target": 7497,
        "seeds": ["793-22", "793-23"],
        "max_ring": 3,
    },
    "yongdap-1": {
        "label": "(가)용답1구역(용답동 50-14 일대)",
        "dong": "용답동",
        "center": (37.563180, 127.052002),
        "radius": 420,
        "target": 47000,
        "seeds": ["50-14"],
        "max_ring": 5,
    },
    "yongdap-2": {
        "label": "용답2구역(용답동 15 일대)",
        "dong": "용답동",
        "center": (37.563156, 127.055426),
        "radius": 500,
        "target": 95889.5,
        "seeds": ["15"],
        "max_ring": 7,
    },
}

dLat = lambda m: m / 111132.0
dLng = lambda m, lat: m / (111132.0 * math.cos(math.radians(lat)))


# ── 브이월드 조회 ─────────────────────────────────────────────────────────────
def get(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "accept": "application/json, text/plain, */*",
            "accept-language": "ko-KR,ko;q=0.9",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
            "referer": f"https://{DOMAIN}/",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
    if not body.strip().startswith("{"):
        raise RuntimeError("VWORLD_DOWN: " + body[:160].replace("\n", " "))
    return json.loads(body)


def fetch_box(minlat, minlng, maxlat, maxlng, page=1, size=1000) -> dict:
    q = {
        "service": "data",
        "request": "GetFeature",
        "data": "LP_PA_CBND_BUBUN",
        "key": KEY,
        "domain": DOMAIN,
        "geomFilter": f"BOX({minlng},{minlat},{maxlat},{maxlng})",
        "geometry": "true",
        "attribute": "true",
        "crs": "EPSG:4326",
        "format": "json",
        "size": str(size),
        "page": str(page),
    }
    return get(ENDPOINT + "?" + urllib.parse.urlencode(q))


def collect(features, box):
    minlat, minlng, maxlat, maxlng = box
    for f in features:
        p = f.get("properties", {}) or {}
        g = f.get("geometry", {}) or {}
        rings = g.get("coordinates") or []
        if not rings or not rings[0]:
            continue
        ring = rings[0]
        lat = sum(pt[1] for pt in ring) / len(ring)
        lng = sum(pt[0] for pt in ring) / len(ring)
        if not (minlat <= lat <= maxlat and minlng <= lng <= maxlng):
            continue
        raw = str(p.get("jibun") or "").strip()
        m = re.match(r"^(\d+(?:-\d+)?)\s*(.*)$", raw)
        num = m.group(1) if m else raw
        tail = (m.group(2).strip() if m else "") or str(p.get("jimok") or "").strip()
        yield {
            "jibun": raw,
            "num": num,
            "tail": tail,          # 지목 문자(도=도로, 대=대지, 임=임야 …)
            "addr": str(p.get("addr") or "").strip(),
            "pnu": str(p.get("pnu") or "").strip(),
            "ring": [[pt[1], pt[0]] for pt in ring],  # [lat, lng]
        }


def cmd_fetch():
    allp = {}
    for zid, z in ZONES.items():
        lat, lng = z["center"]
        r = z["radius"]
        box = (lat - dLat(r), lng - dLng(r, lat), lat + dLat(r), lng + dLng(r, lat))
        got, page = [], 1
        while True:
            d = fetch_box(*box, page=page)
            resp = d.get("response", {})
            if resp.get("status") != "OK":
                raise RuntimeError(f"{zid}: {resp.get('status')} {resp.get('error', {})}")
            result = resp.get("result", {}) or {}
            feats = (result.get("featureCollection") or {}).get("features", [])
            got.extend(collect(feats, box))
            total = int((resp.get("record") or {}).get("total") or 0)
            if not feats or (page * 1000) >= total:
                break
            page += 1
            time.sleep(0.2)
        uniq = {}
        for p in got:
            uniq[p["pnu"] or f'{p["addr"]}|{p["jibun"]}'] = p
        allp[zid] = list(uniq.values())
        print(f"{zid}: 필지 {len(allp[zid])}개 (반경 {r}m)")
        time.sleep(0.3)
    CACHE.write_text(json.dumps(allp, ensure_ascii=False), encoding="utf-8")
    print("저장:", CACHE)


# ── 조립 ─────────────────────────────────────────────────────────────────────
def local_proj(lat0, lng0):
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0

    def f(ring):
        return [((p[1] - lng0) * kx, (p[0] - lat0) * ky) for p in ring]

    return f


def assemble(zid: str, parcels: list[dict], z: dict):
    """대표 지번에서 맞닿은 필지를 넓혀 가며 구역 경계를 만든다.

    · 이웃 판정: 두 필지 경계가 1m 이내로 맞닿거나(연속지적도는 변을 공유한다) 겹치면 이웃.
    · 도로 필지: 폭이 `max_road_width`(기본 9m) 이하인 골목만 지나갈 수 있다 — 큰길은 경계로 쓴다.
      (구역계는 블록 안 골목을 포함하는 경우가 많고, 큰길을 건너면 다른 블록이 된다.)
    · 한 겹씩 넓힌 뒤 누적 면적을 목표 면적과 비교해 멈춘다.
    """
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    lat0, lng0 = z["center"]
    proj = local_proj(lat0, lng0)

    polys = {}
    for p in parcels:
        ring = p["ring"]
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        if len(ring) < 4:
            continue
        poly = Polygon(proj(ring))
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        polys[p["pnu"] or p["jibun"]] = (p, poly)

    addr = lambda p: (p["addr"] or "") + " " + p["jibun"]
    seeds = [
        k for k, (p, _) in polys.items()
        if p["num"] in z["seeds"] and (not z.get("dong") or z["dong"] in addr(p))
    ]
    if not seeds:
        raise RuntimeError(f"{zid}: 대표 지번 필지를 찾지 못했습니다 (seeds={z['seeds']})")

    keys = list(polys)

    def is_road(k):
        return (polys[k][0]["tail"] or "").startswith("도")

    def road_width(k):
        """도로 필지의 폭 추정 — 2A/P (길쭉한 띠는 길이×2가 둘레를 지배해 폭이 남는다)"""
        poly = polys[k][1]
        try:
            return 2.0 * poly.area / max(poly.length, 1e-6)
        except Exception:
            return 999.0

    max_road_area = float(z.get("max_road_area", 2500.0))

    def passable_road(k):
        poly = polys[k][1]
        return poly.area <= max_road_area and road_width(k) <= 12.0

    passable = {k: (not is_road(k)) or passable_road(k) for k in keys}

    # 이웃 그래프 — 1m 이내로 맞닿은 필지
    nb: dict[str, list[str]] = {k: [] for k in keys}
    for i, a in enumerate(keys):
        pa = polys[a][1]
        for b in keys[i + 1:]:
            pb = polys[b][1]
            if pa.distance(pb) > 1.0:
                continue
            nb[a].append(b)
            nb[b].append(a)

    ring_of = {k: 0 for k in seeds}
    chosen = set(seeds)
    steps = []
    area = unary_union([polys[k][1] for k in chosen]).area
    steps.append((0, len(chosen), round(area, 1)))
    target = float(z["target"])
    tol = float(z.get("tol", 0.03))

    frontier = [k for k in seeds if passable[k]]
    best = (abs(area - target), set(chosen))
    # 도로만 있는 씨앗에서도 넘어갈 수 있게 한 번 더
    frontier = list(seeds)
    for depth in range(1, int(z["max_ring"]) + 1):
        nxt = []
        for k in frontier:
            for m in nb[k]:
                if m in ring_of or not passable[m]:
                    continue
                ring_of[m] = depth
                nxt.append(m)
        if not nxt:
            break
        chosen |= set(nxt)
        area = unary_union([polys[k][1] for k in chosen]).area
        steps.append((depth, len(chosen), round(area, 1)))
        if abs(area - target) <= abs(best[0]):
            best = (abs(area - target), set(chosen))
        if area >= target * (1 + tol):
            break
        frontier = nxt

    incl = set(z.get("include") or [])
    for k in keys:
        if polys[k][0]["num"] in incl:
            chosen.add(k)
    excl = set(z.get("exclude") or [])
    chosen = {k for k in chosen if polys[k][0]["num"] not in excl}

    geom = unary_union([polys[k][1] for k in chosen])
    parts_geom = []
    if geom.geom_type == "MultiPolygon":
        comps = sorted(geom.geoms, key=lambda g: -g.area)
        # 5% 미만 조각은 버린다(경계 정리 잔여물)
        keep = [g for g in comps if g.area >= comps[0].area * 0.05]
        geom = keep[0]
        parts_geom = keep[1:]

    lat_scale = 111132.0
    lng_scale = 111132.0 * math.cos(math.radians(lat0))
    to_ring = lambda g: [
        [round(lat0 + y / lat_scale, 7), round(lng0 + x / lng_scale, 7)] for x, y in g.exterior.coords
    ]
    ring = to_ring(geom)
    parts = [to_ring(g) for g in parts_geom]
    total = geom.area + sum(g.area for g in parts_geom)
    return {
        "zid": zid,
        "label": z["label"],
        "target": target,
        "areaShape": round(total, 1),
        "seeds": [polys[k][0]["num"] for k in seeds],
        "parcels": sorted(polys[k][0]["num"] for k in chosen),
        "steps": steps,
        "ring": ring,
        "parts": parts,
    }


def cmd_rings():
    cache = json.loads(CACHE.read_text(encoding="utf-8"))
    out = {}
    for zid, z in ZONES.items():
        parcels = cache.get(zid) or []
        if not parcels:
            print(f"{zid}: 캐시 없음 — fetch 먼저")
            continue
        try:
            r = assemble(zid, parcels, z)
        except Exception as e:
            print(f"{zid}: 조립 실패 — {e}")
            continue
        out[zid] = r
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("저장:", OUT)
    cmd_report(out)


def cmd_report(out=None):
    if out is None:
        out = json.loads(OUT.read_text(encoding="utf-8"))
    for zid, r in out.items():
        d = (r["areaShape"] - r["target"]) / r["target"] * 100
        print(f"— {zid} ({r['label']})")
        print(f"   도형 {r['areaShape']:,.1f}㎡ / 목표 {r['target']:,.1f}㎡ → {d:+.1f}%  필지 {len(r['parcels'])}개 · 정점 {len(r['ring'])}")
        print(f"   씨앗 {r['seeds']} / 겹 확장 {[(s[0], s[1], round(s[2])) for s in r['steps']]}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    try:
        if cmd == "fetch":
            cmd_fetch()
        elif cmd == "rings":
            cmd_rings()
        elif cmd == "report":
            cmd_report()
    except RuntimeError as e:
        print("!!", e)
        sys.exit(2)
