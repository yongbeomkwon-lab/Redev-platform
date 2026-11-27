#!/usr/bin/env python3
"""금호역 일대 4곳 — 사용자 참고 캡처(지적편집도)를 기준으로 필지 집합을 골라 경계를 만든다 (2026-11-27)

## 왜 이 방식인가
  사용자가 보낸 캡처에는 지주택 1458 · 신통 금호23 · 신통 금호21 · 금남시장 네 구역이 지적선 위에
  그려져 있다. 경쟁 서비스의 폴리곤 좌표를 그대로 옮기지 않고, **그림이 가리키는 필지 묶음**만
  읽어 우리 연속지적도 필지로 다시 조립한다(공고 도면 → 필지정합과 같은 방식).

## 단계
  1) 캡처에서 구역별 색 채움을 뽑아 마스크를 만든다(분홍=금호21·금호23, 주황=1458, 갈색=금남시장).
  2) 캡처를 필지선에 맞춰 정합한다 — 이미지의 검은 지적선까지 거리(거리변환)를 최소로 하는
     축척·회전·이동을 격자 탐색으로 찾는다(북쪽 고정, 축척 0.70~0.82 m/px).
  3) 필지 중심이 마스크 안에 들어오는 필지를 모아 합집합 → 구역 경계.

사용:
  python3 scripts/fit-geumho-reference-20261127.py fetch    # 필지 캐시(금호 일대)
  python3 scripts/fit-geumho-reference-20261127.py masks    # 마스크·정합 결과 확인
  python3 scripts/fit-geumho-reference-20261127.py build    # 구역별 필지 집합 → tmp/rings-geumho.json
"""
from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
REF = Path("/workspace/attachments/2026-11-27/1000085963-40cf37dcecae4105be7cbbe46af4e740.jpg")
CACHE = ROOT / "scripts" / "data" / "parcels-geumho-20261127.json"
OUT = ROOT / "tmp" / "rings-geumho-20261127.json"
MASKS = ROOT / "tmp" / "geumho-masks.json"

KEY = "339B86BB-6986-4CE3-9707-06F51C3B4788"
DOMAIN = "redev-platform-iota.vercel.app"
ENDPOINT = "https://api.vworld.kr/req/data"

# 참고 캡처 기준 좌표(금남소공원) — 정합의 출발값
LAT0, LNG0 = 37.54932316, 127.02176938
PX0, PY0 = 690.0, 285.0
M_PER_PX0 = 0.7532

# 구역별 목표(공개·고시 면적)
TARGETS = {
    "geumho21": {"label": "신통 금호21", "area": 75447},
    "geumho23": {"label": "신통 금호23", "area": 30706},
    "geumho1458": {"label": "지주택 금호동4가 1458", "area": 13103},
    "geumnam": {"label": "금남시장", "area": 4717.1},
}

BBOX = (37.5445, 127.0110, 37.5545, 127.0300)  # 남서·북동


def get(url):
    req = urllib.request.Request(
        url,
        headers={
            "accept": "application/json, text/plain, */*",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
            "referer": f"https://{DOMAIN}/",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
    if not body.strip().startswith("{"):
        raise RuntimeError("VWORLD_DOWN: " + body[:120].replace("\n", " "))
    return json.loads(body)


def fetch():
    minlat, minlng, maxlat, maxlng = BBOX
    out, page = {}, 1
    while True:
        q = {
            "service": "data",
            "request": "GetFeature",
            "data": "LP_PA_CBND_BUBUN",
            "key": KEY,
            "domain": DOMAIN,
            "geomFilter": f"BOX({minlng},{minlat},{maxlng},{maxlat})",
            "geometry": "true",
            "attribute": "true",
            "crs": "EPSG:4326",
            "format": "json",
            "size": "1000",
            "page": str(page),
        }
        d = get(ENDPOINT + "?" + urllib.parse.urlencode(q))
        resp = d.get("response", {})
        if resp.get("status") != "OK":
            raise RuntimeError(resp)
        res = resp.get("result", {}) or {}
        feats = (res.get("featureCollection") or {}).get("features", [])
        for f in feats:
            p = f.get("properties", {})
            g = f.get("geometry", {})
            rings = g.get("coordinates") or []
            if not rings:
                continue
            ring = rings[0]
            jibun = str(p.get("jibun") or "").strip()
            m = __import__("re").match(r"^(\d+(?:-\d+)?)\s*(.*)$", jibun)
            key = p.get("pnu") or jibun
            out[key] = {
                "jibun": jibun,
                "num": m.group(1) if m else jibun,
                "tail": (m.group(2).strip() if m else ""),
                "addr": str(p.get("addr") or ""),
                "pnu": str(p.get("pnu") or ""),
                "ring": [[pt[1], pt[0]] for pt in ring],
            }
        total = int((resp.get("record") or {}).get("total") or 0)
        print("page", page, "features", len(feats), "total", total)
        if not feats or page * 1000 >= total:
            break
        page += 1
        time.sleep(0.2)
    CACHE.write_text(json.dumps(list(out.values()), ensure_ascii=False), encoding="utf-8")
    print("저장", len(out), CACHE)


# ── 캡처 마스크 ──────────────────────────────────────────────────────────────
def build_masks():
    im = Image.open(REF).convert("RGB")
    a = np.asarray(im).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    pink = (r > 232) & (r - g > 6) & (r - g < 26) & (r - b > 6) & (r - b < 26) & (g > 208)
    pink = ndi.binary_closing(pink, np.ones((5, 5), bool))
    pink = ndi.binary_fill_holes(pink)
    lab, n = ndi.label(pink)
    sizes = ndi.sum(pink, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    comps = []
    for k in order[:6]:
        m = lab == k + 1
        ys, xs = np.nonzero(m)
        comps.append({"k": int(k + 1), "area": int(sizes[k]), "bbox": [int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())]})
    print("분홍 성분:", comps)
    return comps

# ── 정합(캡처 ↔ 필지선) ───────────────────────────────────────────────────────
def line_distance_field(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    dark = a.max(axis=2) < 150        # 지적선(검은 얇은 선)
    return ndi.distance_transform_edt(~dark)


def project(pts, params):
    """(lat,lng) 목록 → 캡처 픽셀. params: (m_per_px, rot_deg, dx, dy)"""
    mpp, rot, dx, dy = params
    th = math.radians(rot)
    out = []
    for lat, lng in pts:
        mx = (lng - LNG0) * 111320.0 * math.cos(math.radians(LAT0)) / mpp
        my = -(lat - LAT0) * 111132.0 / mpp
        x = mx * math.cos(th) - my * math.sin(th) + PX0 + dx
        y = mx * math.sin(th) + my * math.cos(th) + PY0 + dy
        out.append((x, y))
    return out


def refine(parcels, im, coarse=True):
    D = line_distance_field(im)
    pts = []
    for p in parcels[::3]:
        ring = p["ring"]
        for q in ring[::2]:
            pts.append((q[0], q[1]))
        if len(pts) > 4000:
            break
    pts = pts[:4000]
    best = (1e9, (M_PER_PX0, 0.0, 0.0, 0.0))
    scales = [0.735, 0.745, 0.7532, 0.762, 0.772] if coarse else [M_PER_PX0]
    rots = [-1.5, -0.75, 0.0, 0.75, 1.5] if coarse else [0.0]
    dxy = range(-24, 25, 6) if coarse else range(-3, 4, 1)
    for mpp in scales:
        for rot in rots:
            for dx in dxy:
                for dy in dxy:
                    xy = project(pts, (mpp, rot, dx, dy))
                    xs = np.array([p[0] for p in xy])
                    ys = np.array([p[1] for p in xy])
                    ok = (xs >= 0) & (xs < D.shape[1] - 1) & (ys >= 0) & (ys < D.shape[0] - 1)
                    if ok.sum() < len(xs) * 0.5:
                        continue
                    d = D[ys[ok].astype(int), xs[ok].astype(int)].mean()
                    if d < best[0]:
                        best = (d, (mpp, rot, dx, dy))
    return best


def build():
    parcels = json.loads(CACHE.read_text(encoding="utf-8"))
    im = Image.open(REF).convert("RGB")
    a = np.asarray(im).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    pink = (r > 232) & (r - g > 6) & (r - g < 26) & (r - b > 6) & (r - b < 26) & (g > 208)
    pink = ndi.binary_fill_holes(ndi.binary_closing(pink, np.ones((5, 5), bool)))
    lab, n = ndi.label(pink)
    sizes = ndi.sum(pink, lab, range(1, n + 1))
    order = list(np.argsort(sizes)[::-1])

    def comp_mask(rank):
        m = lab == (order[rank] + 1)
        return ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((9, 9), bool)))

    masks = {"geumho21": comp_mask(0), "geumho23": comp_mask(1), "geumho1458": comp_mask(2)}

    score, params = refine(parcels, im)
    print(f"정합: 축척 {params[0]:.4f} m/px · 회전 {params[1]:+.2f}° · 이동 ({params[2]:+.0f},{params[3]:+.0f})px · 필지선까지 평균 {score:.2f}px")
    score2, params = refine(parcels, im, coarse=False)
    print(f"미세: {params} 평균 {score2:.2f}px")

    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    out = {}
    for key, mask in masks.items():
        chosen = []
        for p in parcels:
            ring = p["ring"]
            lat = sum(q[0] for q in ring) / len(ring)
            lng = sum(q[1] for q in ring) / len(ring)
            x, y = project([(lat, lng)], params)[0]
            xi, yi = int(round(x)), int(round(y))
            if 0 <= yi < mask.shape[0] and 0 <= xi < mask.shape[1] and mask[yi, xi]:
                chosen.append(p)
        if not chosen:
            print(key, "필지 없음")
            continue
        lat0 = sum(sum(q[0] for q in p["ring"]) / len(p["ring"]) for p in chosen) / len(chosen)
        lng0 = sum(sum(q[1] for q in p["ring"]) / len(p["ring"]) for p in chosen) / len(chosen)
        kx = 111132.0 * math.cos(math.radians(lat0))
        ky = 111132.0
        polys = []
        for p in chosen:
            ring = p["ring"]
            if ring[0] != ring[-1]:
                ring = ring + [ring[0]]
            poly = Polygon([((q[1] - lng0) * kx, (q[0] - lat0) * ky) for q in ring])
            if not poly.is_valid:
                poly = poly.buffer(0)
            polys.append(poly)
        geom = unary_union(polys)
        if geom.geom_type == "MultiPolygon":
            comps = sorted(geom.geoms, key=lambda gg: -gg.area)
            keep = [gg for gg in comps if gg.area >= comps[0].area * 0.05]
            geom, parts = keep[0], keep[1:]
        else:
            parts = []
        ring = [[round(lat0 + y / ky, 7), round(lng0 + x / kx, 7)] for x, y in geom.exterior.coords]
        out[key] = {
            "label": TARGETS[key]["label"],
            "target": TARGETS[key]["area"],
            "areaShape": round(geom.area + sum(p.area for p in parts), 1),
            "parcels": sorted(p["num"] for p in chosen),
            "ring": ring,
            "parts": [[[round(lat0 + y / ky, 7), round(lng0 + x / kx, 7)] for x, y in gg.exterior.coords] for gg in parts],
        }
        print(f"{key}: 필지 {len(chosen)}개 · 도형 {out[key]['areaShape']:,.1f}㎡ / 목표 {TARGETS[key]['area']:,}㎡ "
              f"({(out[key]['areaShape'] - TARGETS[key]['area']) / TARGETS[key]['area'] * 100:+.1f}%)")
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("저장", OUT)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    try:
        if cmd == "fetch":
            fetch()
        elif cmd == "masks":
            build_masks()
        elif cmd == "build":
            build()
    except RuntimeError as e:
        print("!!", e)
        sys.exit(2)


if __name__ == "__main__":
    main()
