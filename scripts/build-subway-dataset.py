#!/usr/bin/env python3
"""
수도권 지하철 노선·역 데이터셋 생성 (OpenStreetMap Overpass API → public/data/)

산출물
  · public/data/subway-lines.geojson    노선별 폴리라인 (공식 노선색, 단순화)
  · public/data/subway-stations.json    역 좌표 + 역명 + 소속 노선(환승역 다중)

원천
  · OpenStreetMap contributors (ODbL 1.0) — route=subway/train/light_rail 관계의
    선로 way 형상과 railway=station 역 노드.
  · 노선 색상은 서울교통공사·국가철도공단 표준 표기색을 사용한다(OSM colour 태그보다 우선).

사용
  python3 scripts/build-subway-dataset.py            # Overpass 조회 → 파일 생성
  python3 scripts/build-subway-dataset.py --cached    # tmp/subway 캐시만으로 재생성

전제: 인터넷 접속(overpass-api.de). 대용량 응답은 tmp/subway/ 에 캐시한다.
"""
from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data"
CACHE = ROOT / "tmp" / "subway"
CACHE.mkdir(parents=True, exist_ok=True)

# 서울 + 인접 수도권 (인천·김포·고양·의정부·남양주·하남·성남·광교·수원 일부)
BBOX = (37.20, 126.60, 37.80, 127.40)

ENDPOINT = "https://overpass-api.de/api/interpreter"

# 노선 정의 — 키: 앱 내부 id, name: 표기명, color: 공식 노선색
LINES = {
    "1":         {"name": "1호선",      "badge": "1",  "color": "#0052A4"},
    "2":         {"name": "2호선",      "badge": "2",  "color": "#00A84D"},
    "3":         {"name": "3호선",      "badge": "3",  "color": "#EF7C1C"},
    "4":         {"name": "4호선",      "badge": "4",  "color": "#00A5DE"},
    "5":         {"name": "5호선",      "badge": "5",  "color": "#996CAC"},
    "6":         {"name": "6호선",      "badge": "6",  "color": "#CD7C2F"},
    "7":         {"name": "7호선",      "badge": "7",  "color": "#747F00"},
    "8":         {"name": "8호선",      "badge": "8",  "color": "#E6186C"},
    "9":         {"name": "9호선",      "badge": "9",  "color": "#BDB092"},
    "sinbundang": {"name": "신분당선",    "badge": "신분당", "color": "#D4003B"},
    "silim":     {"name": "신림선",      "badge": "신림",  "color": "#6789CA"},
    "ui":        {"name": "우이신설선",   "badge": "우이",  "color": "#B7C452"},
    "gyeongui":  {"name": "경의중앙선",   "badge": "경의",  "color": "#77C4A3"},
    "suin":      {"name": "수인분당선",   "badge": "수인",  "color": "#F5A200"},
    "airport":   {"name": "공항철도",     "badge": "공항",  "color": "#0090D2"},
    "gtxa":      {"name": "GTX-A",      "badge": "A",   "color": "#9A6292"},
    "gyeongchun": {"name": "경춘선",     "badge": "경춘",  "color": "#0C8E72"},
    "gyeonggang": {"name": "경강선",     "badge": "경강",  "color": "#0054A6"},
    "seohae":    {"name": "서해선",      "badge": "서해",  "color": "#8FC31F"},
    "gimpo":     {"name": "김포골드라인", "badge": "김포",  "color": "#957326"},
}

# OSM route 관계의 ref 태그 → 내부 id
REF_MAP = {
    "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    "신분당": "sinbundang", "Silim": "silim", "W": "ui", "우이신설": "ui",
    "경의·중앙": "gyeongui", "경의중앙": "gyeongui", "수인·분당": "suin", "수인분당": "suin",
    "공항철도": "airport", "GTX-A": "gtxa",
    "경춘": "gyeongchun", "경강": "gyeonggang", "서해": "seohae",
    "김포 골드라인": "gimpo", "김포골드라인": "gimpo",
}

SIMPLIFY_TOL = 0.00007  # 위도/경도 도 단위 ≈ 7.8m — 지도 표시에 충분하고 파일이 가볍다


def overpass(query: str, cache_name: str, cached_only: bool) -> dict:
    path = CACHE / cache_name
    if path.exists():
        return json.loads(path.read_text())
    if cached_only:
        raise SystemExit(f"캐시 없음: {path}")
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for attempt in range(1, 7):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=body,
                headers={"User-Agent": "redev-platform/0.1 (subway dataset build)",
                         "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = r.read()
            data = json.loads(raw)
            path.write_bytes(raw)
            print(f"  ✓ {cache_name} ({len(raw) // 1024} KB)")
            return data
        except Exception as e:  # 429/504/연결 실패 → 지수 백오프 재시도
            last = e
            wait = 5 * 2 ** (attempt - 1)
            print(f"  … 실패({type(e).__name__}) {wait}s 후 재시도 [{attempt}/6]")
            time.sleep(wait)
    raise SystemExit(f"Overpass 조회 실패: {last}")


def bbox_clause() -> str:
    s, w, n, e = BBOX
    return f"({s},{w},{n},{e})"


def fetch_relations(cached_only: bool) -> dict:
    q = f"""[out:json][timeout:180];
(
  relation["route"~"^(subway|train|light_rail)$"]["ref"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out body;"""
    return overpass(q, "relations.json", cached_only)


def fetch_ways(ids: list[int], cached_only: bool) -> dict:
    path = CACHE / "ways.json"
    have: dict[int, list] = {}
    if path.exists():
        for e in json.loads(path.read_text())["elements"]:
            have[e["id"]] = e.get("geometry")
    # 청크 캐시도 함께 읽는다(--cached 재생성 경로)
    chunk_files = sorted(CACHE.glob("ways-[0-9][0-9][0-9].json"))
    for cf in chunk_files:
        for e in json.loads(cf.read_text())["elements"]:
            if e.get("geometry"):
                have[e["id"]] = e["geometry"]
    missing = [i for i in ids if i not in have]
    if missing and not cached_only:
        CH = 400
        start = len(chunk_files)
        for i in range(0, len(missing), CH):
            chunk = missing[i:i + CH]
            q = "[out:json][timeout:180];way(id:" + ",".join(str(x) for x in chunk) + ");out geom;"
            data = overpass_direct(q, f"ways-{start + i // CH:03d}.json")
            for e in data["elements"]:
                have[e["id"]] = e.get("geometry")
            print(f"  … way {i + len(chunk)}/{len(missing)}")
    return {k: v for k, v in have.items() if v}


def overpass_direct(query: str, cache_name: str) -> dict:
    """청크 단위 조회 — 캐시가 있으면 재사용."""
    path = CACHE / cache_name
    if path.exists():
        return json.loads(path.read_text())
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for attempt in range(1, 7):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=body,
                headers={"User-Agent": "redev-platform/0.1 (subway dataset build)",
                         "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=240) as r:
                raw = r.read()
            path.write_bytes(raw)
            return json.loads(raw)
        except Exception as e:
            last = e
            wait = 5 * 2 ** (attempt - 1)
            print(f"  … 실패({type(e).__name__}) {wait}s 후 재시도 [{attempt}/6]")
            time.sleep(wait)
    raise SystemExit(f"Overpass 조회 실패: {last}")


def fetch_stop_nodes(ids: list[int], cached_only: bool) -> dict[int, dict]:
    """정차역(stop) 노드의 이름·좌표 — 역 라벨은 이 노드에서 만든다.

    수도권 전철 route 관계의 `stop` 멤버는 `railway=station` 역 노드가 아니라
    승강장 정차 위치(stop_position) 노드인 경우가 대부분이라, 역명은 여기서 얻는다.
    """
    path = CACHE / "stop-nodes.json"
    have: dict[int, dict] = {}
    if path.exists():
        have = {n["id"]: n for n in json.loads(path.read_text())["elements"]}
    # 청크 캐시도 함께 읽는다(--cached 재생성 경로)
    for chunk_file in sorted(CACHE.glob("stop-nodes-*.json")):
        for n in json.loads(chunk_file.read_text())["elements"]:
            have[n["id"]] = n
    missing = [i for i in ids if i not in have]
    CH = 500
    for i in range(0, len(missing), CH):
        chunk = missing[i:i + CH]
        q = "[out:json][timeout:120];node(id:" + ",".join(str(x) for x in chunk) + ");out body;"
        if cached_only:
            break
        data = overpass_direct(q, f"stop-nodes-{i // CH:03d}.json")
        for n in data["elements"]:
            have[n["id"]] = n
        print(f"  … stop node {i + len(chunk)}/{len(missing)}")
    return have


# ── 기하 처리 ────────────────────────────────────────────────────────────────
def perp_dist(p, a, b) -> float:
    """점 p에서 선분 ab까지의 거리(도 단위 근사)."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(pts: list[list[float]], tol: float) -> list[list[float]]:
    """Douglas–Peucker (반복 구현). pts = [[lat, lng], ...]"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = perp_dist(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def r5(v: float) -> float:
    return round(v, 5)


def main() -> None:
    cached_only = "--cached" in sys.argv

    print("1) 노선 관계 조회")
    rels = fetch_relations(cached_only)

    line_ways: dict[str, set[int]] = {k: set() for k in LINES}
    stop_lines: dict[int, set[str]] = {}
    used_rels: dict[str, int] = {}
    for rel in rels["elements"]:
        if rel.get("type") != "relation":
            continue
        t = rel.get("tags", {})
        key = REF_MAP.get((t.get("ref") or "").strip())
        if key is None:
            continue
        used_rels[key] = used_rels.get(key, 0) + 1
        for m in rel.get("members", []):
            if m["type"] == "way":
                line_ways[key].add(m["ref"])
            elif m["type"] == "node" and m.get("role", "").startswith("stop"):
                stop_lines.setdefault(m["ref"], set()).add(key)

    print("2) 선로 형상 조회")
    all_ways = sorted({w for s in line_ways.values() for w in s})
    geoms = fetch_ways(all_ways, cached_only)
    print(f"  way {len(geoms)}/{len(all_ways)}개 형상 확보")

    print("3) 정차역 노드 조회")
    stop_nodes = fetch_stop_nodes(sorted(stop_lines), cached_only)
    print(f"  stop 노드 {len(stop_nodes)}/{len(stop_lines)}개 확보")

    # 노선별 폴리라인
    features = []
    total_pts = 0
    for key, meta in LINES.items():
        segs = []
        for wid in sorted(line_ways[key]):
            g = geoms.get(wid)
            if not g or len(g) < 2:
                continue
            pts = [[p["lat"], p["lon"]] for p in g if p and "lat" in p and "lon" in p]
            if len(pts) < 2:
                continue
            pts = simplify(pts, SIMPLIFY_TOL)
            pts = [[r5(a), r5(b)] for a, b in pts]
            # 중복 좌표 제거
            ded = [pts[0]]
            for p in pts[1:]:
                if p != ded[-1]:
                    ded.append(p)
            if len(ded) >= 2:
                segs.append([[p[1], p[0]] for p in ded])  # GeoJSON 은 [lng, lat]
        if not segs:
            print(f"  ! {meta['name']}: 형상 없음")
            continue
        total_pts += sum(len(s) for s in segs)
        features.append({
            "type": "Feature",
            "properties": {"id": key, "name": meta["name"], "badge": meta["badge"], "color": meta["color"]},
            "geometry": {"type": "MultiLineString", "coordinates": segs},
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines_path = OUT_DIR / "subway-lines.geojson"
    lines_path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                     ensure_ascii=False, separators=(",", ":")))

    # 역: stop 노드의 이름·좌표에서 만든다. 같은 이름·가까운 좌표는 한 역으로 병합한다.
    #      (노선별로 정차 위치 노드가 따로 있고, 방향별로도 따로 있어 중복이 많다)
    stations: list[dict] = []
    skipped_nameless = 0
    for nid, lines_here in stop_lines.items():
        n = stop_nodes.get(nid)
        if not n or n.get("lat") is None:
            continue
        t = n.get("tags", {})
        name = t.get("name:ko") or t.get("name")
        if not name:
            skipped_nameless += 1
            continue
        stations.append({"name": name, "lat": n["lat"], "lng": n["lon"], "lines": sorted(lines_here)})

    merged: list[dict] = []
    for s in sorted(stations, key=lambda x: (x["name"], x["lat"], x["lng"])):
        hit = None
        for m in merged:
            if m["name"] != s["name"]:
                continue
            if abs(m["lat"] - s["lat"]) < 0.004 and abs(m["lng"] - s["lng"]) < 0.005:  # ≈ 450m
                hit = m
                break
        if hit:
            hit["lines"] = sorted(set(hit["lines"]) | set(s["lines"]))
        else:
            merged.append(dict(s))

    # 괄호 부역명 제거 후 재병합:
    #   "서울대입구(관악구청)" ↔ "서울대입구", "왕십리(성동구청)" ↔ "왕십리" 처럼
    #   노선마다 stop 노드 이름이 달라 같은 역이 두 번 생기는 문제를 없앤다.
    def base_name(name: str) -> str:
        return name.split("(")[0].split("（")[0].strip()

    def close(a: dict, b: dict, lat_tol=0.004, lng_tol=0.005) -> bool:
        return abs(a["lat"] - b["lat"]) < lat_tol and abs(a["lng"] - b["lng"]) < lng_tol

    final: list[dict] = []
    for s in sorted(merged, key=lambda x: (base_name(x["name"]), len(x["name"]))):
        b = base_name(s["name"])
        hit = next((m for m in final if base_name(m["name"]) == b and close(m, s)), None)
        if hit:
            hit["lines"] = sorted(set(hit["lines"]) | set(s["lines"]))
            # 표기명은 괄호 없는 짧은 쪽
            if len(s["name"]) < len(hit["name"]):
                hit["name"] = s["name"]
        else:
            final.append({"name": s["name"], "lat": s["lat"], "lng": s["lng"], "lines": s["lines"]})

    # 이름이 달라도 180m 이내면 같은 역(예: 이수 ↔ 총신대입구) — 환승 노선을 합치고
    # 둘 중 긴 이름을 쓴다(짧은 쪽이 옛 이름·생략형인 경우가 많다: “삼양” ↔ “삼양사거리”).
    changed = True
    while changed:
        changed = False
        for i in range(len(final)):
            for j in range(i + 1, len(final)):
                if close(final[i], final[j], 0.0016, 0.0020):
                    a, c = final[i], final[j]
                    a["lines"] = sorted(set(a["lines"]) | set(c["lines"]))
                    if len(c["name"]) > len(a["name"]):
                        a["name"] = c["name"]
                    a["lat"], a["lng"] = c["lat"], c["lng"]
                    final.pop(j)
                    changed = True
                    break
            if changed:
                break

    merged = final

    out_stations = [
        {
            "name": s["name"],
            "lat": r5(s["lat"]),
            "lng": r5(s["lng"]),
            "lines": s["lines"],
            "transfer": len(s["lines"]) > 1,
        }
        for s in merged
    ]
    st_path = OUT_DIR / "subway-stations.json"
    st_path.write_text(json.dumps(out_stations, ensure_ascii=False, separators=(",", ":")))

    print(f"\n완료: 노선 {len(features)}개 / 점 {total_pts:,}개 / 역 {len(out_stations)}곳 "
          f"(환승역 {sum(1 for s in out_stations if s['transfer'])}곳, 이름 없는 stop {skipped_nameless}개 제외)")
    print(f"  {lines_path.relative_to(ROOT)} — {lines_path.stat().st_size // 1024} KB")
    print(f"  {st_path.relative_to(ROOT)} — {st_path.stat().st_size // 1024} KB")
    for key in LINES:
        n = sum(1 for s in out_stations if key in s["lines"])
        if n == 0:
            print(f"  ! {LINES[key]['name']}: 역 0개")


if __name__ == "__main__":
    main()
