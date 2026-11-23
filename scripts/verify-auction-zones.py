#!/usr/bin/env python3
"""구역 경매 매핑 전수 검사 — public/data/auctions.json × public/data/zones.geojson

왜 필요한가
  · auctions.json 의 zoneId 는 만들 때(scripts/build-auction-zones.py) 그 시점의 zones.geojson
    폴리곤으로 계산한 스냅샷이다. 그 뒤 구역 경계를 다시 그리거나 구역을 새로 넣으면,
    물건 좌표는 그대로인데 폴리곤이 바뀌어 **엉뚱한 구역에 경매 배지가 붙거나**(2026-11-23
    양재2동 2구역 324-1) **구역 자체가 지도에서 사라져 배지가 주인을 잃는다**
    (같은 날 DDP 1·2·3구역·쌍문동 710 — seoul-zones.json 만 보고 geojson 을 다시 내보낸 사고).
  · 그래서 경계·구역을 손댄 뒤에는 이 검사를 돌린다.

검사 규칙
  1) 구역 폴리곤(point-in-polygon, 구멍 링 제외) 안에 있으면 정상.
  2) 밖인데 다른 구역 안이면 → 면적이 가장 작은 구역으로 **재매핑**.
  3) 밖이고 어느 구역에도 없으면 → 경계에서 tol m 이내면 지번 좌표 오차로 보고 유지(표시만),
     그보다 멀면 **매핑 해제**(목록에서 뺀다 — 화면은 '구역 안'만 보여 주므로).
  4) zoneId 가 zones.geojson 에 없는 구역(주인 잃은 배지)은 고칠 수 없으니 보고만 한다.
  5) 같은 물건 줄이 두 번 실린 경우(같은 id) 한 줄만 남긴다.

사용
  python3 scripts/verify-auction-zones.py            # 검사만(바꾸지 않음)
  python3 scripts/verify-auction-zones.py --fix      # 고쳐서 auctions.json 다시 쓰기
  python3 scripts/verify-auction-zones.py --fix --tol 15
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import os
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AUCTIONS = os.path.join(ROOT, "public", "data", "auctions.json")
ZONES = os.path.join(ROOT, "public", "data", "zones.geojson")
KST = timezone(timedelta(hours=9))


def rings_of(geom):
    """GeoJSON 도형 → [(외곽링, [구멍링…])]  (링은 [lng,lat])"""
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [(geom["coordinates"][0], geom["coordinates"][1:])]
    if geom["type"] == "MultiPolygon":
        return [(p[0], p[1:]) for p in geom["coordinates"]]
    return []


def pip(lat, lng, ring):
    inside, n = False, len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-18) + xi):
            inside = not inside
        j = i
    return inside


def load_zones():
    feats = json.load(open(ZONES, encoding="utf-8"))["features"]
    zones = {}
    for f in feats:
        p = f["properties"]
        parts = rings_of(f.get("geometry"))
        if not parts:
            continue
        pts = [pt for outer, _ in parts for pt in outer]
        lats = [pt[1] for pt in pts]
        lngs = [pt[0] for pt in pts]
        zones[p["id"]] = {
            "id": p["id"],
            "name": p.get("name", ""),
            "area": p.get("area") or 10 ** 12,
            "geom": p.get("geom", ""),
            "parts": parts,
            "bbox": (min(lats), min(lngs), max(lats), max(lngs)),
        }
    return zones


def contains(zone, lat, lng):
    for outer, holes in zone["parts"]:
        if pip(lat, lng, outer) and not any(pip(lat, lng, h) for h in holes):
            return True
    return False


def distance_out(zone, lat, lng):
    """폴리곤 밖 점에서 경계까지 거리(m). 안이면 0."""
    lat0 = math.radians(lat)
    best = float("inf")

    def xy(p):
        return ((p[0] - lng) * 111320 * math.cos(lat0), (p[1] - lat) * 110574)

    for outer, _ in zone["parts"]:
        for i in range(len(outer)):
            ax, ay = xy(outer[i])
            bx, by = xy(outer[(i + 1) % len(outer)])
            vx, vy = bx - ax, by - ay
            wx, wy = -ax, -ay
            L = vx * vx + vy * vy
            t = max(0.0, min(1.0, (wx * vx + wy * vy) / L)) if L else 0.0
            best = min(best, math.hypot(wx - t * vx, wy - t * vy))
    return best


def audit(data, zones, tol):
    kept, buffered, remapped, dropped, orphans = 0, [], [], [], []
    seen = set()
    by_zone = collections.defaultdict(list)
    for zid, items in data["byZone"].items():
        for it in items:
            if it["id"] in seen:
                dropped.append({"caseNo": it["caseNo"], "address": it["address"], "zoneId": zid,
                                "zoneName": it.get("zoneName"), "reason": "같은 물건이 두 번 실림"})
                continue
            seen.add(it["id"])
            lat, lng = it.get("lat"), it.get("lng")
            if lat is None or lng is None:
                dropped.append({"caseNo": it["caseNo"], "address": it["address"], "zoneId": zid,
                                "zoneName": it.get("zoneName"), "reason": "좌표 없음"})
                continue
            z = zones.get(zid)
            if z is None:
                orphans.append({"zoneId": zid, "zoneName": it.get("zoneName"), "caseNo": it["caseNo"],
                                "address": it["address"]})
                by_zone[zid].append(it)  # 고칠 수 없으니 그대로 둔다(보고만)
                kept += 1
                continue
            if contains(z, lat, lng):
                it["zoneName"] = z["name"]
                by_zone[zid].append(it)
                kept += 1
                continue
            hits = [o for oid, o in zones.items()
                    if oid != zid
                    and o["bbox"][0] - 1e-3 <= lat <= o["bbox"][2] + 1e-3
                    and o["bbox"][1] - 1e-3 <= lng <= o["bbox"][3] + 1e-3
                    and contains(o, lat, lng)]
            if hits:
                hits.sort(key=lambda o: o["area"])
                target = hits[0]
                remapped.append({"caseNo": it["caseNo"], "address": it["address"],
                                 "from": z["name"], "to": target["name"], "zoneId": target["id"]})
                it["zoneId"] = target["id"]
                it["zoneName"] = target["name"]
                it["zoneIds"] = [o["id"] for o in hits]
                by_zone[target["id"]].append(it)
                kept += 1
                continue
            d = distance_out(z, lat, lng)
            if d <= tol:
                buffered.append({"caseNo": it["caseNo"], "address": it["address"], "zoneName": z["name"],
                                 "distanceM": round(d, 1)})
                by_zone[zid].append(it)
                kept += 1
                continue
            dropped.append({"caseNo": it["caseNo"], "address": it["address"], "zoneId": zid,
                            "zoneName": z["name"], "reason": f"구역 밖 {d:.0f}m (경계 {z['geom']})"})

    for zid in list(by_zone):
        by_zone[zid].sort(key=lambda x: (x.get("saleDate") or "99999999", x.get("minimum") or 10 ** 15))
    return dict(kept=kept, buffered=buffered, remapped=remapped, dropped=[d for d in dropped if d.get("reason") != "같은 물건이 두 번 실림"],
                duplicates=[d for d in dropped if d.get("reason") == "같은 물건이 두 번 실림"],
                orphans=orphans, byZone=dict(by_zone))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true", help="결과를 auctions.json 에 쓴다")
    ap.add_argument("--tol", type=float, default=10.0, help="경계 밖 허용 오차(m), 기본 10m")
    args = ap.parse_args()

    data = json.load(open(AUCTIONS, encoding="utf-8"))
    zones = load_zones()
    before = sum(len(v) for v in data["byZone"].values())
    r = audit(data, zones, args.tol)
    print(f"구역 {len(zones):,}곳 · 경매 줄 {before:,}줄 → 유지 {r['kept']:,}줄 "
          f"(구역 {len(r['byZone'])}곳)")
    if r["buffered"]:
        print(f"  경계 밖 {args.tol:.0f}m 이내라 유지: {len(r['buffered'])}줄")
        for b in r["buffered"]:
            print(f"    · {b['zoneName']} — {b['address']} ({b['distanceM']}m)")
    if r["remapped"]:
        print(f"  다른 구역으로 재매핑: {len(r['remapped'])}줄")
        for m in r["remapped"]:
            print(f"    · {m['address']} — {m['from']} → {m['to']}")
    if r["duplicates"]:
        print(f"  같은 물건 중복 줄 제거: {len(r['duplicates'])}줄")
    if r["dropped"]:
        print(f"  매핑 해제: {len(r['dropped'])}줄")
        for d in r["dropped"]:
            print(f"    · {d['zoneName']} — {d['caseNo']} {d['address']} ({d['reason']})")
    if r["orphans"]:
        print(f"  ⚠️ zones.geojson 에 없는 구역에 붙은 줄: {len(r['orphans'])}줄 "
              f"(구역 데이터가 사라졌을 수 있습니다)")
        for o in r["orphans"]:
            print(f"    · {o['zoneId']} {o['zoneName']} — {o['caseNo']} {o['address']}")

    if not args.fix:
        print("  (검사만 — 바꾸려면 --fix)")
        return 0

    meta = data.get("meta", {})
    meta["matched"] = r["kept"]
    meta["zonesWithAuctions"] = len(r["byZone"])
    meta["audit"] = {
        "checkedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "toleranceM": args.tol,
        "rows": r["kept"],
        "zones": len(r["byZone"]),
        "remapped": r["remapped"],
        "dropped": r["dropped"],
        "buffered": r["buffered"],
        "orphanZones": r["orphans"],
        "note": "모든 줄의 좌표가 zoneId 폴리곤 안에 있는지 다시 계산한 결과입니다. "
                "구역 경계를 고친 뒤에는 scripts/verify-auction-zones.py --fix 로 다시 맞춥니다.",
    }
    data["meta"] = meta
    data["byZone"] = r["byZone"]
    json.dump(data, open(AUCTIONS, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"[저장] {os.path.relpath(AUCTIONS, ROOT)} — 줄 {r['kept']:,}, 구역 {len(r['byZone'])}곳")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
