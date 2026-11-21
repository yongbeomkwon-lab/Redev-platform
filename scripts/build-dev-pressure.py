#!/usr/bin/env python3
"""서울 전역 「🔥 개발압력」 점수 산출 — 미지정 저층 주거지가 어디로 조여 오는가

무엇을 하나
  1) 서울을 150m 격자로 나누고, 격자마다 네 가지 신호로 0~100 점을 매긴다.
     ① 정비구역 포위도 — 반경 600m 안의 활성 정비구역 수·사방(4분면) 포위 비율
     ② 아파트 포위도   — 반경 500m 안 아파트 동 밀집도 × 그 칸의 저층 비율
     ③ 노후·저층 밀집 — 3×3 칸(≈450m)의 30년 이상 비율·저층 비율·밀집도
     ④ 역세권 보너스   — 지하철역 600m 이내
  2) 점수가 높은 칸을 인접 연결해 **핫스팟 클러스터**로 묶고, 대표 칸과 근거 문구를 만든다.
  3) `public/data/dev-pressure.json` 으로 저장한다(지도 오버레이가 읽는 파일).

  ★ 아파트 제외(2026-11-22): ③과 핀 자리는 **아파트 동·단지를 뺀 저층 건물**만 센다.
     격자 중심에 그냥 핀을 찍으면 사당우성2단지 같은 대단지 아파트 위에 핀이 꽂히고,
     30년 넘은 아파트 동이 '노후 건물'로 잡혀 단지 자체가 핫스팟이 됐다. 그래서
       · OSM 아파트 동(footprint)·단지(landuse) 폴리곤 안의 건물은 아파트로 분류해 빼고,
       · 핀은 그 칸 안 **비아파트 저층 건물들이 가장 촘촘한 덩어리**의 한가운데 건물로 옮기며(스냅),
       · 옮긴 자리가 여전히 아파트 단지·동 내부이거나 반경 110m 가 아파트로만 차 있으면 핫스팟에서 뺀다.

입력
  · tmp/devpressure/tiles/*.json.gz — `scripts/fetch-dev-buildings.py` 가 모은 건물(중심·외곽면적·연도)
  · tmp/devpressure/emd.geojson     — 법정동 경계(없으면 내려받는다, 출처: 국가공간정보포털 경계 가공본)
  · tmp/devpressure/osm-apt-seoul.json       — OSM 아파트 표점(이름·중심, 없으면 내려받는다, ODbL © OpenStreetMap)
  · tmp/devpressure/osm-apt-seoul-geom.json  — OSM 아파트 동·단지 폴리곤(없으면 내려받는다, ODbL © OpenStreetMap)
  · public/data/zones.geojson, public/data/subway-stations.json

  python3 scripts/build-dev-pressure.py [--verbose] [--cells-out tmp/devpressure/cells.json]
"""
from __future__ import annotations

import argparse
import glob
import gzip
import json
import math
import os
import re
import sys
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "tmp", "devpressure")
OUT = os.path.join(ROOT, "public", "data", "dev-pressure.json")
EMD_URL = "https://raw.githubusercontent.com/KnellBalm/kr-admin-geojson/main/emd.geojson"
OSM_URL = None  # Overpass 는 쿼리를 POST 해야 해서 아래 함수에서 직접 만든다

NOW_YEAR = 2026
OLD_YEAR = NOW_YEAR - 30          # 1996년 이전 사용승인 = 30년 이상
LOW_AREA = 250.0                  # 외곽면적 250㎡ 이하 = 저층 주택(단독·다세대·빌라)로 본다
CELL_M = 150.0                    # 격자 한 변
LAT0, LON0 = 37.40, 126.74
DLAT = CELL_M / 110540.0
DLNG = CELL_M / (111320.0 * math.cos(math.radians(37.55)))

ZONE_R = 600.0                    # 정비구역 포위 반경
APT_R = 500.0                     # 아파트 포위 반경
STATION_R = 600.0                 # 역세권 반경
BUCKET_M = 250.0                  # 공간 버킷(질의 속도)

SNAP_M = 75.0                     # 핀 스냅 — 한 덩어리로 볼 반경(칸 안 저층 건물 무리)
APT_NEAR_R = 110.0                # 핀 둘레가 '아파트 단지 중심'인지 보는 반경
APT_ONLY = 0.62                   # 그 반경 건물 중 아파트 비율이 이보다 높으면 핫스팟 제외
DENS_REF = 220.0                  # 3×3 칸(≈450m)의 30년↑ 저층 건물 수 상한(밀집도 100% 기준)

# 점수 가중치 — 합 1.0
W_SIEGE, W_OLD, W_APT, W_STATION = 0.45, 0.25, 0.20, 0.10


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def ensure_inputs():
    os.makedirs(WORK, exist_ok=True)
    emd = os.path.join(WORK, "emd.geojson")
    if not os.path.exists(emd):
        log("법정동 경계 내려받는 중…")
        req = urllib.request.Request(EMD_URL, headers={"user-agent": "redev-devpressure/0.1"})
        with urllib.request.urlopen(req, timeout=180) as r, open(emd, "wb") as f:
            f.write(r.read())
    osm = os.path.join(WORK, "osm-apt-seoul.json")
    if not os.path.exists(osm):
        log("OSM 아파트 내려받는 중…")
        q = """[out:json][timeout:240];
        (way["landuse"="residential"]["name"](37.42,126.76,37.71,127.19);
         relation["landuse"="residential"]["name"](37.42,126.76,37.71,127.19);
         way["building"="apartments"]["name"](37.42,126.76,37.71,127.19););
        out tags center;"""
        req = urllib.request.Request(
            "https://overpass-api.de/api/interpreter",
            data=q.encode(),
            headers={"user-agent": "redev-devpressure/0.1"},
        )
        with urllib.request.urlopen(req, timeout=280) as r, open(osm, "wb") as f:
            f.write(r.read())
    geom = os.path.join(WORK, "osm-apt-seoul-geom.json")
    if not os.path.exists(geom):
        log("OSM 아파트 폴리곤(동·단지) 내려받는 중… 40MB 안팎이라 1~2분 걸립니다")
        q = """[out:json][timeout:300];
        (way["landuse"="residential"]["name"](37.42,126.76,37.71,127.19);
         relation["landuse"="residential"]["name"](37.42,126.76,37.71,127.19);
         way["building"="apartments"](37.42,126.76,37.71,127.19););
        out geom;"""
        req = urllib.request.Request(
            "https://overpass-api.de/api/interpreter",
            data=q.encode(),
            headers={"user-agent": "redev-devpressure/0.1"},
        )
        with urllib.request.urlopen(req, timeout=300) as r, open(geom, "wb") as f:
            f.write(r.read())
    return emd, osm, geom


# ── 투영·기하 ────────────────────────────────────────────────────────────────
def meters(lat: float) -> tuple[float, float]:
    return 111320.0 * math.cos(math.radians(lat)), 110540.0


def ring_metrics(flat):
    """[lng,lat,lng,lat,…] → (면적 m², 중심 lng, 중심 lat)"""
    pts = [(flat[i], flat[i + 1]) for i in range(0, len(flat) - 1, 2)]
    if len(pts) < 3:
        return 0.0, None, None
    lat0 = sum(p[1] for p in pts) / len(pts)
    kx, ky = meters(lat0)
    xy = [(p[0] * kx, p[1] * ky) for p in pts]
    s = 0.0
    cx = cy = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        f = x1 * y2 - x2 * y1
        s += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(s) < 1e-9:
        return 0.0, pts[0][0], pts[0][1]
    s *= 0.5
    return abs(s), cx / (6 * s) / kx, cy / (6 * s) / ky


def sector_of(dx: float, dy: float) -> int:
    """동쪽=0 부터 시계방향 45° 섹터(8방위). dx·dy 는 경위도 차이(경도는 좁아도 방위는 근사로 충분)."""
    brg = (math.degrees(math.atan2(dx * 0.79, dy)) + 360) % 360
    return int((brg + 22.5) % 360 // 45)


def _apt_name_ok(name: str) -> bool:
    """'201동'·'아파트' 같은 이름은 단지명이 아니다 — 카드에 쓰지 않는다."""
    n = name.strip()
    if len(n) < 2:
        return False
    if n.replace(" ", "").isdigit():
        return False
    if re.fullmatch(r"\d+\s*동", n):
        return False
    if n in {"아파트", "공동주택", "주상복합"}:
        return False
    if any(k in n for k in ("빌딩", "오피스텔", "상가", "근린", "공장", "창고", "경로당", "교회", "성당", "학교", "주차장", "관리사무소", "어린이집")):
        return False
    if re.fullmatch(r"[가-힣A-Za-z]?\d*\s*동", n):  # '나동'·'C동'·'101동'
        return False
    return True


def bkey(lng: float, lat: float) -> tuple[int, int]:
    kx, ky = 111320.0 * math.cos(math.radians(lat)), 110540.0
    return int(lng * kx / BUCKET_M), int(lat * ky / BUCKET_M)


class PointIndex:
    """버킷 기반 점 인덱스 — 반경 질의용."""

    def __init__(self, flat_lat):
        self.kx, self.ky = 111320.0 * math.cos(math.radians(flat_lat)), 110540.0
        self.b = defaultdict(list)

    def add(self, lng, lat, item=None):
        self.b[bkey(lng, lat)].append((lng, lat, item))

    def near(self, lng, lat, radius):
        bx, by = bkey(lng, lat)
        span = int(radius / BUCKET_M) + 1
        out = []
        for ix in range(bx - span, bx + span + 1):
            for iy in range(by - span, by + span + 1):
                for x, y, item in self.b.get((ix, iy), ()):
                    d = math.hypot((x - lng) * self.kx, (y - lat) * self.ky)
                    if d <= radius:
                        out.append((d, x, y, item))
        out.sort(key=lambda t: t[0])
        return out


# ── 아파트 판정 — OSM 폴리곤(동·단지) ────────────────────────────────────────
def _ring_bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def point_in_ring(lng, lat, ring) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-18) + xi:
            inside = not inside
        j = i
    return inside


def _is_apt_landuse(name: str) -> bool:
    """landuse=residential 중 '아파트 단지'인 것만 — 연립주택단지·유엔빌리지·구룡마을은 저층 주거지라 뺀다."""
    n = name.replace(" ", "")
    if not n or re.search(r"연립|빌라|단독|다세대|주택단지|마을$", n):
        return False
    return ("아파트" in n) or ("APT" in n.upper()) or n.endswith("단지")


def load_apt_polys(path):
    """OSM `out geom` 결과 → 아파트 동(footprint)·단지(landuse) 폴리곤 목록"""
    d = json.load(open(path, encoding="utf-8"))
    polys = []
    for el in d["elements"]:
        t = el.get("tags") or {}
        name = (t.get("name") or "").strip()
        bld = t.get("building") == "apartments"
        landuse = t.get("landuse") == "residential" and _is_apt_landuse(name)
        if not (bld or landuse):
            continue
        geoms = []
        if el["type"] == "way":
            g = el.get("geometry")
            if g and len(g) >= 3:
                geoms.append(g)
        else:
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("geometry") and len(m["geometry"]) >= 3:
                    geoms.append(m["geometry"])
        for g in geoms:
            ring = [(p["lon"], p["lat"]) for p in g]
            polys.append({"name": name, "bld": bld, "landuse": landuse, "ring": ring, "bbox": _ring_bbox(ring)})
    log(
        f"OSM 아파트 폴리곤 {len(polys):,}개 — 동 {sum(1 for p in polys if p['bld']):,}"
        f"·단지 {sum(1 for p in polys if p['landuse']):,}"
    )
    return polys


class AptMask:
    """아파트 동·단지 내부 판정 — 0.002°(≈220m) 버킷으로 후보만 검사한다."""

    B = 0.002

    def __init__(self, polys):
        self.polys = polys
        self.g = defaultdict(list)
        for idx, p in enumerate(polys):
            b = p["bbox"]
            for ix in range(int(b[0] / self.B), int(b[2] / self.B) + 1):
                for iy in range(int(b[1] / self.B), int(b[3] / self.B) + 1):
                    self.g[(ix, iy)].append(idx)

    def cover(self, lng, lat) -> bool:
        for idx in self.g.get((int(lng / self.B), int(lat / self.B)), ()):
            p = self.polys[idx]
            b = p["bbox"]
            if b[0] <= lng <= b[2] and b[1] <= lat <= b[3] and point_in_ring(lng, lat, p["ring"]):
                return True
        return False


# ── 입력 로드 ────────────────────────────────────────────────────────────────
def load_buildings():
    files = sorted(glob.glob(os.path.join(WORK, "tiles", "*.json.gz")))
    if not files:
        raise SystemExit("건물 타일이 없습니다 — scripts/fetch-dev-buildings.py 를 먼저 돌리세요.")
    bs = []
    trunc = 0
    for f in files:
        d = json.load(gzip.open(f, "rt"))
        trunc += 1 if d.get("truncated") else 0
        for lng, lat, area, year in d["rows"]:
            bs.append((lng, lat, area, year))
    log(f"건물 {len(bs):,}동 · 타일 {len(files):,}개(잘린 타일 {trunc})")
    return bs


def load_zones():
    data = json.load(open(os.path.join(ROOT, "public", "data", "zones.geojson"), encoding="utf-8"))
    out = []
    for f in data["features"]:
        p = f["properties"]
        stage = str(p.get("stage") or "")
        typ = str(p.get("type") or "")
        name = str(p.get("name") or "")
        if any(k in stage or k in typ or k in name for k in ("해제", "취소")):
            continue  # 해제·취소 구역은 압력이 아니다
        if stage.startswith("준공") or "사용승인" in stage or stage.startswith("입주"):
            w = 0.5  # 이미 지어진 곳 — 둘러싼 아파트로서 약하게 센다
        else:
            w = 1.0
        geom = f.get("geometry")
        if not geom:
            continue
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        cxs, cys, area, ring0 = [], [], 0, None
        for poly in polys:
            a, cx, cy = ring_metrics([v for pt in poly[0] for v in pt])
            area += a
            if cx is not None:
                cxs.append(cx)
                cys.append(cy)
            ring0 = ring0 or poly[0]
        if not cxs:
            continue
        out.append(
            {
                "id": p.get("id"),
                "name": name,
                "gu": p.get("gu"),
                "type": typ,
                "stage": stage,
                "weight": w,
                "lng": sum(cxs) / len(cxs),
                "lat": sum(cys) / len(cys),
                "area": area,
                "r_eq": math.sqrt(max(area, 1.0) / math.pi),
                "ring": ring0,
                "pts": ring0[:: max(1, len(ring0) // 36)][:40],
            }
        )
    log(f"정비구역 {len(out):,}곳(해제·취소 제외)")
    return out


def load_osm_apts(path):
    d = json.load(open(path, encoding="utf-8"))
    pts = []
    for el in d["elements"]:
        t = el.get("tags") or {}
        name = (t.get("name") or "").strip()
        c = el.get("center") or {}
        if not name or "lon" not in c:
            continue
        is_bld = t.get("building") == "apartments"
        pts.append(
            {
                "lng": float(c["lon"]),
                "lat": float(c["lat"]),
                "name": name,
                "building": is_bld,
                "landuse": t.get("landuse") == "residential",
                "flats": t.get("building:levels"),
            }
        )
    log(f"OSM 아파트 표점 {len(pts):,}개(건물 {sum(1 for p in pts if p['building']):,}·단지 {sum(1 for p in pts if p['landuse']):,})")
    return pts


def load_dongs(path):
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for f in d["features"]:
        p = f["properties"]
        if p.get("CTPRVN_CD") != "11":
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            ring = poly[0]
            xs = [v[0] for v in ring]
            ys = [v[1] for v in ring]
            out.append(
                {
                    "dong": p.get("EMD_KOR_NM"),
                    "gu": p.get("SGG_NM"),
                    "hjd": p.get("HJD_NM"),
                    "ring": ring,
                    "bbox": (min(xs), min(ys), max(xs), max(ys)),
                }
            )
    log(f"법정동 경계 {len(out):,}개 조각")
    return out


def dong_at(lng, lat, dongs):
    for d in dongs:
        b = d["bbox"]
        if b[0] <= lng <= b[2] and b[1] <= lat <= b[3] and point_in_ring(lng, lat, d["ring"]):
            return d["gu"], d["dong"], d["hjd"]
    return None, None, None


# ── 핀 자리 잡기 ─────────────────────────────────────────────────────────────
def snap_pin(pts, mask):
    """칸 안 비아파트 저층 건물 중 **가장 촘촘한 덩어리**의 한가운데 건물로 핀을 옮긴다.

    pts: [(lng, lat, year)] — 이 칸의 비아파트 저층(≤250㎡) 건물
    덩어리 점수는 30년↑ 건물에 무게를 더 준다(연식 미상 0.6·신축 0.35).
    옮긴 자리가 아파트 동·단지 안이면 그 덩어리는 버리고 다음 덩어리를 본다.
    """
    if not pts:
        return None
    kx, ky = meters(37.55)
    sub = defaultdict(list)  # 50m 씨앗 버킷
    for lng, lat, year in pts:
        sub[(int(lng * kx / 50.0), int(lat * ky / 50.0))].append((lng, lat, year))

    def weight_of(years):
        """30년↑ 건물에 무게를 더 준다 — 연식 미상 0.6·최근 10년 0.35."""
        w = 0.0
        for year in years:
            w += 1.0 if (not year or year <= OLD_YEAR) else 0.6 if year <= OLD_YEAR + 10 else 0.35
        return w

    def cluster(seed):
        """씨앗 버킷 둘레 75m 안 건물들"""
        sx, sy = seed
        out = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for lng, lat, year in sub.get((sx + dx, sy + dy), ()):
                    cx, cy = (sx + dx + 0.5) * 50.0, (sy + dy + 0.5) * 50.0
                    if math.hypot(lng * kx - cx, lat * ky - cy) <= SNAP_M:
                        out.append((lng, lat, year))
        return out

    ranked = sorted(((weight_of([y for _, _, y in cluster(s)]), s) for s in sub), key=lambda t: -t[0])
    for w, seed in ranked:
        if w < 3.0:
            break
        cl = cluster(seed)
        if len(cl) < 3:
            continue
        cx = sum(p[0] for p in cl) / len(cl)
        cy = sum(p[1] for p in cl) / len(cl)
        # 덩어리 중심에서 가장 가까운 실제 건물에 핀을 세운다(허공에 뜨지 않게)
        pin = min(cl, key=lambda p: math.hypot((p[0] - cx) * kx, (p[1] - cy) * ky))
        if mask.cover(pin[0], pin[1]):
            continue  # 아직 아파트 단지·동 안 — 다음 덩어리
        return pin[0], pin[1], len(cl), w
    return None


# ── 메인 ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--cells-out", help="후보 칸 전체를 이 경로에 덤프(검증용)")
    args = ap.parse_args()
    emd_path, osm_path, geom_path = ensure_inputs()
    buildings = load_buildings()
    zones = load_zones()
    apts = load_osm_apts(osm_path)
    mask = AptMask(load_apt_polys(geom_path))
    dongs = load_dongs(emd_path)
    stations = json.load(open(os.path.join(ROOT, "public", "data", "subway-stations.json"), encoding="utf-8"))

    # 격자 집계 — 건물은 아파트(OSM 동·단지 내부)와 비아파트로 나눠 센다
    cells = defaultdict(
        lambda: {
            "n": 0, "low": 0, "known": 0, "old": 0,
            "nv": 0, "lowv": 0, "knownv": 0, "oldv": 0, "oldlowv": 0,
            "pts": [],
        }
    )
    bld_idx = PointIndex(37.55)  # 핀 둘레가 아파트뿐인지 확인용 (item=1 이면 아파트)
    for lng, lat, area, year in buildings:
        is_apt = mask.cover(lng, lat)
        ci = (int((lng - LON0) / DLNG), int((lat - LAT0) / DLAT))
        c = cells[ci]
        c["n"] += 1
        low = area <= LOW_AREA
        if low:
            c["low"] += 1
        if year:
            c["known"] += 1
            if year <= OLD_YEAR:
                c["old"] += 1
        if not is_apt:
            c["nv"] += 1
            if low:
                c["lowv"] += 1
                c["pts"].append((lng, lat, year))
            if year:
                c["knownv"] += 1
                if year <= OLD_YEAR:
                    c["oldv"] += 1
                    if low:
                        c["oldlowv"] += 1
        bld_idx.add(lng, lat, 1 if is_apt else 0)
    log(f"격자 {len(cells):,}칸에 건물 배정 · 아파트 제외 저층 건물 {sum(c['lowv'] for c in cells.values()):,}동")

    # 아파트·역·구역 인덱스
    apt_idx = PointIndex(37.55)
    for p in apts:
        apt_idx.add(p["lng"], p["lat"], p)
    st_idx = PointIndex(37.55)
    for s in stations:
        st_idx.add(s["lng"], s["lat"], s)
    zone_idx = PointIndex(37.55)  # 구역 경계 표본점 — 경계까지의 실제 거리·방위를 쓴다
    for z in zones:
        for pt in z["pts"]:
            zone_idx.add(pt[0], pt[1], z)

    # 3×3 이웃 집계 — 비아파트 건물만
    def ring_stat(i, j):
        n = known = old = low = oldlow = 0
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                c = cells.get((i + di, j + dj))
                if not c:
                    continue
                n += c["nv"]
                known += c["knownv"]
                old += c["oldv"]
                low += c["lowv"]
                oldlow += c["oldlowv"]
        return n, known, old, low, oldlow

    scored = []
    for (i, j), c in cells.items():
        # 비아파트 저층 건물이 실제로 모여 있는 칸만 후보 — 아파트 단지 한가운데 칸은 여기서 걸러진다
        if c["nv"] < 8 or c["knownv"] < 6:
            continue
        low_share = c["lowv"] / c["nv"]
        if low_share < 0.45:  # 저층 주거지가 아니다(상업·아파트 단지 내부 등)
            continue
        clng = LON0 + (i + 0.5) * DLNG
        clat = LAT0 + (j + 0.5) * DLAT
        # 서울 밖(경기·인천) 배제 — 법정동 경계로 확인
        gu, dong, hjd = dong_at(clng, clat, dongs)
        if gu is None:
            continue

        # 핀 자리 — 이 칸의 비아파트 저층 건물 덩어리 중심으로 옮긴다(아파트 위에 꽂히지 않게)
        snap = snap_pin(c["pts"], mask)
        if snap is None:
            continue
        lng, lat, cluster_n, _ = snap
        # 옮긴 자리 둘레가 사실상 아파트 단지뿐이면 핫스팟이 아니다
        near = bld_idx.near(lng, lat, APT_NEAR_R)
        if near:
            apt_n = sum(1 for _, _, _, is_apt in near if is_apt)
            if apt_n / len(near) >= APT_ONLY and cluster_n < 12:
                continue
        pgu, pdong, phjd = dong_at(lng, lat, dongs)
        if pgu is not None:
            gu, dong, hjd = pgu, pdong, phjd

        # ① 포위도 — 사방 8방위가 "정비구역" 또는 "아파트"로 막혀 있는가
        #    (가까울수록 강하고, 8방위 평균이 곧 둘러싸인 정도)
        apt_near = apt_idx.near(clng, clat, APT_R)
        zone_sector = [0.0] * 8
        apt_sector = [0.0] * 8
        inside = None
        zlist = []
        nearest = {}  # 구역 id → (경계 거리, 그 표본점 좌표, 구역)
        for d, x, y, z in zone_idx.near(clng, clat, ZONE_R):
            prev = nearest.get(z["id"])
            if prev is None or d < prev[0]:
                nearest[z["id"]] = (d, x, y, z)
        for zb, x, y, z in nearest.values():
            if point_in_ring(clng, clat, z["ring"]):
                inside = z  # 이 칸을 감싼 구역 — 포위 계산에서는 뺀다
                continue
            k = sector_of(x - clng, y - clat)
            zone_sector[k] = max(zone_sector[k], z["weight"] * (1 - zb / ZONE_R) ** 1.3)
            zlist.append((zb, z, k))
        apt_cnt = 0
        apt_names = []
        seen_names = set()
        for d, x, y, p in apt_near:
            is_bld = p["building"]
            if is_bld:
                apt_cnt += 1
            if not (is_bld or p["landuse"]):
                continue
            k = sector_of(x - clng, y - clat)
            if is_bld:
                apt_sector[k] += 1.0 / (1.0 + d / 250.0)
            if p["name"] and not seen_names.__contains__(p["name"]):
                seen_names.add(p["name"])
                if _apt_name_ok(p["name"]):
                    apt_names.append({"name": p["name"], "dist": int(round(d))})
        apt_sector = [min(1.0, v / 2.5) for v in apt_sector]
        zs_mean = sum(max(zone_sector[2 * q], zone_sector[2 * q + 1]) for q in range(4)) / 4.0
        as_mean = sum(max(apt_sector[2 * q], apt_sector[2 * q + 1]) for q in range(4)) / 4.0
        sect = [max(zone_sector[k], apt_sector[k] * 0.92) for k in range(8)]
        # 사방(4분면)마다 그 분면에서 가장 강한 방위를 본다 — 대단지 하나가 두 방위에 걸쳐 있어도
        #   '그 쪽은 막혀 있다'로 세기 위해서다(8방위 평균만 쓰면 과소평가된다).
        quad4 = [max(sect[2 * q], sect[2 * q + 1]) for q in range(4)]
        siege = sum(quad4) / 4.0
        quads = {k // 2 for k, v in enumerate(sect) if v >= 0.35}
        s1 = 100 * siege

        # 아파트 이름은 가까운 순으로 정리(동 번호만 있는 이름은 걸러 둔다)
        apt_names.sort(key=lambda a: a["dist"])
        apt_names = apt_names[:4]

        # ③ 노후·저층 — 아파트 동을 빼고, 30년↑ 저층 건물이 실제로 얼마나 촘촘한지까지 본다
        n3, known3, old3, low3, oldlow3 = ring_stat(i, j)
        old_share = old3 / known3 if known3 else 0.0
        low_share3 = low3 / n3 if n3 else 0.0
        dens = min(1.0, oldlow3 / DENS_REF)
        s2 = 100 * (0.60 * old_share + 0.25 * low_share3 + 0.15 * dens)
        if old_share >= 0.6:
            s2 = min(100.0, s2 * 1.08)

        # ④ 아파트 밀집도
        s3 = 100 * min(1.0, apt_cnt / 45.0)

        # ⑤ 역세권
        st_near = st_idx.near(clng, clat, STATION_R)
        s4 = 100 * (1 - st_near[0][0] / STATION_R) if st_near else 0.0

        score = W_SIEGE * s1 + W_OLD * s2 + W_APT * s3 + W_STATION * s4
        if inside:
            score *= 0.95  # 이미 지정된 구역 안 — '미지정' 후보보다 조금 낮춘다

        scored.append(
            {
                "i": i,
                "j": j,
                "lng": lng,
                "lat": lat,
                "cellLng": clng,
                "cellLat": clat,
                "snapM": int(round(math.hypot((lng - clng) * 88000, (lat - clat) * 110540))),
                "gu": gu,
                "dong": dong,
                "hjd": hjd,
                "score": score,
                "s1": s1,
                "s2": s2,
                "s3": s3,
                "s4": s4,
                "oldPct": round(100 * old_share),
                "lowPct": round(100 * low_share),
                "apt": apt_cnt,
                "apts": apt_names,
                "zones": [(zb, z) for zb, z, _ in zlist],
                "quads": len(quads),
                "sectors": sum(1 for v in sect if v >= 0.35),
                "zs": zs_mean,
                "as_": as_mean,
                "inside": inside,
                "station": st_near[0][3] if st_near else None,
                "stationDist": int(round(st_near[0][0])) if st_near else None,
                "n": c["n"],
                "nv": c["nv"],
            }
        )
    scored.sort(key=lambda s: -s["score"])
    log(f"후보 칸 {len(scored):,}개 · 최고 {scored[0]['score']:.1f} · 60점 이상 {sum(1 for s in scored if s['score'] >= 60):,}")

    if args.cells_out:
        slim = [
            {
                "lat": round(s["lat"], 5),
                "lng": round(s["lng"], 5),
                "cellLat": round(s["cellLat"], 5),
                "cellLng": round(s["cellLng"], 5),
                "snapM": s["snapM"],
                "dong": s["dong"],
                "gu": s["gu"],
                "score": round(s["score"], 1),
                "s1": round(s["s1"], 1),
                "s2": round(s["s2"], 1),
                "s3": round(s["s3"], 1),
                "s4": round(s["s4"], 1),
                "nz": len(s["zones"]),
                "apt": s["apt"],
                "oldPct": s["oldPct"],
                "lowPct": s["lowPct"],
                "n": s["n"],
                "nv": s["nv"],
                "inside": s["inside"]["name"] if s["inside"] else None,
            }
            for s in scored
        ]
        json.dump(slim, open(args.cells_out, "w", encoding="utf-8"), ensure_ascii=False)
        log(f"칸 덤프 {args.cells_out}")

    if args.verbose:
        for s in scored[:15]:
            log(
                f"  {s['score']:5.1f} {s['gu']} {s['dong']} ({s['lat']:.5f},{s['lng']:.5f}) "
                f"구역{len(s['zones'])}·사방{s['quads']}·아파트{s['apt']}·노후{s['oldPct']}%·저층{s['lowPct']}%·이동{s['snapM']}m"
                + (f" [구역내:{s['inside']['name']}]" if s["inside"] else "")
            )

    # ── 핫스팟 추출 ──────────────────────────────────────────────────────────
    #  · 구별 상한(24곳)을 두고, 구마다 점수 순으로 **280m 최소 간격**을 지키며 고른다.
    #    전역 상위만 뽑으면 마포·동대문 같은 구가 목록을 다 차지해 관악·용산처럼 구역이 적은
    #    구의 핫스팟이 사라진다(2026-11-21 실측: 관악구 4곳). 상담 무대가 구 단위라 구별 균형이 필요하다.
    #  · 연결 성분으로 묶으면 서울 저층 주거지가 하나로 이어져 상위 몇 개만 남는다.
    SEP_M = 280.0
    TH = 66.0
    PER_GU = 24
    by_gu = defaultdict(list)
    for s in scored:
        if s["score"] >= TH:
            by_gu[s["gu"]].append(s)
    picked = []
    for gu, lst in by_gu.items():
        chosen = []
        for s in lst:  # 이미 점수 내림차순
            if len(chosen) >= PER_GU:
                break
            if all(
                math.hypot((s["lng"] - h["lng"]) * 88000, (s["lat"] - h["lat"]) * 110540) >= SEP_M for h in chosen
            ):
                chosen.append(s)
        picked.extend(chosen)
    log(f"핫스팟 {len(picked)}곳(구별 최대 {PER_GU}곳, 간격 {SEP_M:.0f}m, 임계 {TH}점)")

    by_ij = {(s["i"], s["j"]): s for s in scored}

    def local_density(peak):
        n = 0
        r = 2  # 칸 단위(≈300m)
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                c = by_ij.get((peak["i"] + dx, peak["j"] + dy))
                if c and c["score"] >= peak["score"] * 0.75:
                    n += 1
        return n

    hotspots = []
    for best in picked:
        score = best["score"]
        grade = "최상" if score >= 90 else "높음" if score >= 81 else "보통"
        z400 = [t for t in best["zones"] if t[0] <= 400]
        zones_out = [
            {"id": z["id"], "name": z["name"], "stage": z["stage"], "dist": int(round(d))}
            for d, z in sorted(best["zones"], key=lambda t: t[0])[:3]
        ]
        # 포위를 만든 쪽이 무엇인지로 유형을 나눈다(둘 다면 둘 다)
        zs, as_ = best["zs"], best["as_"]
        types = []
        tot_siege = zs + as_ + 1e-6
        if zs >= 0.45 and zs / tot_siege >= 0.38:
            types.append("정비구역 포위형")
        if as_ >= 0.5 and as_ / tot_siege >= 0.38:
            types.append("아파트 포위형")
        if not types:
            types.append("노후 밀집형")
        bits = []
        if best["zones"]:
            bits.append(f"주변 600m 정비구역 {len(best['zones'])}곳(400m 내 {len(z400)}곳)·사방 {best['sectors']}/8 포위")
        if best["apt"]:
            bits.append(
                f"500m 내 아파트 {best['apt']}동" + (f"({best['apts'][0]['name']} 등)" if best["apts"] else "")
            )
        bits.append(f"노후 {best['oldPct']}%·저층 {best['lowPct']}%")
        if best["station"]:
            bits.append(f"{best['station']['name']}역 {best['stationDist']}m")
        hjd = best.get("hjd")
        hotspots.append(
            {
                "id": f"dp-{best['i']}-{best['j']}",
                "lat": round(best["lat"], 6),
                "lng": round(best["lng"], 6),
                "gu": best["gu"],
                "dong": best["dong"],
                "hjd": hjd if hjd and hjd != best["dong"] else None,
                "score": round(score, 1),
                "grade": grade,
                "types": types,
                "oldPct": best["oldPct"],
                "lowPct": best["lowPct"],
                "aptCount": best["apt"],
                "apts": [a["name"] for a in best["apts"][:2]],
                "zones": zones_out,
                "station": (
                    {"name": best["station"]["name"], "lines": best["station"]["lines"], "dist": best["stationDist"]}
                    if best["station"]
                    else None
                ),
                "inZone": best["inside"]["name"] if best["inside"] else None,
                "density": local_density(best),
                "reason": " · ".join(bits),
            }
        )
    hotspots.sort(key=lambda h: -h["score"])
    log(f"핫스팟 {len(hotspots)}곳 확정 · 점수 {hotspots[0]['score']}~{hotspots[-1]['score']}")

    payload = {
        "generatedAt": "2026-11-22",
        "method": {
            "grid": int(CELL_M),
            "oldYear": OLD_YEAR,
            "lowArea": LOW_AREA,
            "weights": {"siege": W_SIEGE, "old": W_OLD, "apt": W_APT, "station": W_STATION},
            "note": "건물: 브이월드 GIS건물통합정보+건축물대장 연식 / 아파트: OpenStreetMap(ODbL) / 구역: 서울시 고시 경계 / 노후·저층은 아파트 동·단지를 뺀 저층 건물 기준",
        },
        "hotspots": hotspots,
    }
    txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(txt)
    log(f"저장 {os.path.relpath(OUT, ROOT)} · {len(txt.encode()) / 1024:.0f}KB · 상위3: " +
        " / ".join(f"{h['gu']} {h['dong']} {h['score']}" for h in hotspots[:3]))


if __name__ == "__main__":
    main()
