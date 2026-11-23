#!/usr/bin/env python3
"""
구역 내 법원경매 물건 데이터셋 — public/data/auctions.json

입력
  · scripts/data/court-auction/latest.json  (fetch-court-auctions.py + geocode-auctions.py 결과)
  · public/data/zones.geojson               (서울시 정비구역 2,424곳 경계)

하는 일
  1) 좌표가 있는 물건만 대상으로 구역 폴리곤 Point-in-Polygon 매칭(bbox 선별 → 광선교차).
  2) 한 물건이 여러 구역에 걸치면 **면적이 가장 작은 구역**을 대표 zoneId로 두고, 걸친 구역 전부를 zoneIds에 남긴다.
  3) 구역별로 묶어 `byZone` 에 담고, 화면에 필요한 필드만 추려 쓴다.
     줄 하나 = 매각 목적물(필지·호실) 하나다. 일괄매각은 한 물건번호 아래 목적물이 여러 줄로
     실리므로, 화면의 건수는 **사건+물건번호**(lib/auctions.ts `countAuctionSales`)로 묶어 센다
     (대선제분 24줄·모아타운 17줄 → 각 1건, 호실마다 사건이 다른 쌍문동 507-1은 132건 그대로).
  4) 매칭 0건인 구역은 키를 만들지 않는다(패널이 섹션을 그리지 않는다).
  5) 쓴 뒤 scripts/verify-auction-zones.py 의 검사를 그대로 한 번 더 돌려, 결과가 zoneId 폴리곤
     밖이거나 주인 잃은 구역에 붙은 줄이 있으면 그 자리에서 고친다(--no-verify 로 끈다).
     경계를 다시 그리거나 구역을 넣은 뒤에는 반드시 `python3 scripts/verify-auction-zones.py --fix`
     를 따로 돌린다 — auctions.json 은 만들 때의 폴리곤 스냅샷이라, 그 뒤 경계가 바뀌면
     좌표는 그대로인데 배지만 엉뚱한 구역에 붙는다(2026-11-23).

출력
  · public/data/auctions.json
  · 콘솔 요약(구역 수·물건 수·상위 구역)

사용법
  python3 scripts/build-auction-zones.py [--no-verify]
"""
from __future__ import annotations

import argparse
import collections
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LATEST = os.path.join(HERE, "data", "court-auction", "latest.json")
ZONES = os.path.join(ROOT, "public", "data", "zones.geojson")
OUT = os.path.join(ROOT, "public", "data", "auctions.json")

# 대법원 법원경매정보 — 사건 조회 화면(PGJ159M00).
#   · 사건상세 화면(PGJ15BM01)은 사건번호 파라미터를 URL로 받지 않는다(화면 간 데이터를 메모리로 넘긴다).
#     직접 링크하면 빈 화면 + '부모 객체를 찾을 수 없습니다' 오류창만 뜨는 것을 2026-11-22 브라우저로 확인했다.
#   · 그래서 카드에는 법원·연도·타경·번호를 그대로 찍어 주고, 링크는 사건검색 화면으로 보낸다.
COURT_URL = "https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml"


def rings_of(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
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


def case_parts(case_no: str) -> dict:
    """2023타경104875 → {year, part, serial}"""
    import re as _re
    m = _re.match(r"(\d{4})([가-힣]{2})(\d+)", case_no or "")
    if not m:
        return {"caseYear": "", "casePart": "", "caseSerial": ""}
    return {"caseYear": m.group(1), "casePart": m.group(2), "caseSerial": m.group(3)}


def won_text(v):
    return v


def money(v: int | None) -> str:
    if not v:
        return ""
    eok, man = divmod(v // 10000, 10000)
    if eok and man:
        return f"{eok}억 {man:,}만"
    if eok:
        return f"{eok}억"
    return f"{man:,}만"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-rate", type=float, default=0, help="최저가율 하한(%) 필터 — 기본 없음")
    ap.add_argument("--no-verify", action="store_true", help="쓴 뒤 구역 매핑 재검사(verify-auction-zones)를 건너뛴다")
    args = ap.parse_args()

    data = json.load(open(LATEST, encoding="utf-8"))
    items = data["items"]
    feats = json.load(open(ZONES, encoding="utf-8"))["features"]

    # 법원별 물건 수 — 화면 캡션·보고에 그대로 쓴다(서부지법이 빠졌는지 바로 보이게)
    court_counts: dict[str, dict] = {}
    for it in items:
        c = it.get("court") or it.get("courtCode") or "?"
        court_counts.setdefault(c, {"name": c, "count": 0})
        court_counts[c]["count"] += 1

    zones = []
    for f in feats:
        p = f["properties"]
        rs = rings_of(f.get("geometry"))
        if not rs:
            continue
        pts = [pt for r in rs for pt in r]
        lats = [pt[1] for pt in pts]
        lngs = [pt[0] for pt in pts]
        zones.append({
            "id": p["id"], "name": p.get("name", ""), "type": p.get("type", ""),
            "stage": p.get("stage", ""), "gu": p.get("gu", ""),
            "area": p.get("area") or 0,
            "rings": rs,
            "bbox": (min(lats), min(lngs), max(lats), max(lngs)),
        })

    by_zone: dict[str, list[dict]] = collections.defaultdict(list)
    matched_items = 0
    no_zone = 0
    for it in items:
        lat, lng = it.get("lat"), it.get("lng")
        if not lat or not lng:
            continue
        hits = []
        for z in zones:
            mnx, mxx, mny, mxy = z["bbox"][1], z["bbox"][3], z["bbox"][0], z["bbox"][2]
            if not (mny <= lat <= mxy and mnx <= lng <= mxx):
                continue
            if any(pip(lat, lng, r) for r in z["rings"]):
                hits.append(z)
        if not hits:
            no_zone += 1
            continue
        matched_items += 1
        hits.sort(key=lambda z: z["area"] or 10**9)
        primary = hits[0]
        item = {
            "id": it["id"],
            "court": it["court"],
            "courtCode": it["courtCode"],
            "caseNo": it["caseNo"],
            "caseNoPrint": it["caseNoPrint"],
            "itemNo": it["itemNo"],
            "objectNo": it["objectNo"],
            "usage": it["usage"],
            "address": it["address"],
            "jibun": " ".join(x for x in (it.get("gu"), it.get("dong"), it.get("lotno")) if x),
            "building": it.get("building") or "",
            "appraised": it.get("appraised"),
            "minimum": it.get("minimum"),
            "minimumRate": it.get("minimumRate"),
            "failCount": it.get("failCount"),
            "saleDate": it.get("saleDate"),
            "saleTime": it.get("saleTime") or "",
            "salePlace": it.get("salePlace") or "",
            "decisionDate": it.get("decisionDate") or "",
            "courtDept": it.get("courtDept") or "",
            "courtTel": it.get("courtTel") or "",
            "area": it.get("area") or "",
            "landCategory": it.get("landCategory") or "",
            "note": it.get("note") or "",
            "lat": lat, "lng": lng,
            "zoneId": primary["id"],
            "zoneName": primary["name"],
            "zoneIds": [z["id"] for z in hits],
            **case_parts(it["caseNo"]),
            "detailUrl": COURT_URL,
        }
        if args.min_rate and (item["minimumRate"] or 0) < args.min_rate:
            continue
        by_zone[primary["id"]].append(item)

    # 구역별 정렬 — 매각기일이 가까운 순, 같으면 최저가 낮은 순
    for k in by_zone:
        by_zone[k].sort(key=lambda x: (x["saleDate"] or "99999999", x["minimum"] or 10**15))

    meta = {
        "source": "대법원 법원경매정보(courtauction.go.kr) 부동산 물건검색",
        "collectedAt": data["meta"].get("collectedAt"),
        "saleDateFrom": data["meta"].get("saleDateFrom"),
        "saleDateTo": data["meta"].get("saleDateTo"),
        "courts": data["meta"].get("courts"),
        "courtsItems": court_counts,
        "seoulItems": sum(1 for i in items if i.get("sido") == "서울특별시"),
        "geocoded": sum(1 for i in items if i.get("lat")),
        "matched": matched_items,
        "zonesWithAuctions": len(by_zone),
        "note": "매각기일이 앞으로 약 2달(2026-11-23 ~ 2027-01-28)인 진행 중 물건을 대법원 법원경매정보에서 받아 "
                "지번 좌표로 구역 경계와 매칭한 결과입니다. "
                "지번 좌표는 카카오 주소검색 기준이고, 목록 한 줄은 매각 목적물(필지·호실) 하나입니다 — "
                "일괄매각은 한 물건번호 아래 목적물이 여러 줄로 실리므로 화면에서는 사건+물건번호로 묶어 1건으로 셉니다.",
    }
    payload = {"meta": meta, "byZone": by_zone}
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print("상위 구역:")
    for zid, lst in sorted(by_zone.items(), key=lambda kv: -len(kv[1]))[:10]:
        print(f"  {lst[0]['zoneName']} ({zid}) — {len(lst)}건")

    if not args.no_verify:
        _verify_after_build()


def _verify_after_build() -> None:
    """방금 쓴 auctions.json 을 zones.geojson 과 다시 대조한다(같은 검사 로직 재사용)."""
    import importlib.util

    path = os.path.join(HERE, "verify-auction-zones.py")
    spec = importlib.util.spec_from_file_location("verify_auction_zones", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    data = json.load(open(OUT, encoding="utf-8"))
    zones = mod.load_zones()
    r = mod.audit(data, zones, 10.0)
    if r["remapped"] or r["dropped"] or r["duplicates"]:
        print("[검사] 매핑이 어긋난 줄을 고칩니다 — 재매핑 "
              f"{len(r['remapped'])} · 해제 {len(r['dropped'])} · 중복 {len(r['duplicates'])}")
        for d in r["dropped"]:
            print(f"    · {d['zoneName']} — {d['caseNo']} {d['address']} ({d['reason']})")
        data["meta"]["matched"] = r["kept"]
        data["meta"]["zonesWithAuctions"] = len(r["byZone"])
        data["byZone"] = r["byZone"]
        json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    if r["orphans"]:
        print(f"[검사] ⚠️ zones.geojson 에 없는 구역에 붙은 줄 {len(r['orphans'])}개 — 구역 데이터를 확인하세요")
    print(f"[검사] 구역 폴리곤 대조 OK — 줄 {r['kept']:,}, 구역 {len(r['byZone'])}곳")


if __name__ == "__main__":
    main()
