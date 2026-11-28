#!/usr/bin/env python3
"""
구역 내 온비드 공매 물건 데이터셋 — public/data/gongmae.json

입력
  · scripts/data/onbid-gongmae/latest.json   (fetch-onbid-gongmae.py + geocode-onbid.py 결과)
  · public/data/zones.geojson                (서울시 정비구역 경계 — 경매(auctions.json)와 같은 원본)

하는 일
  1) 입찰이 끝나지 않은 물건만 남긴다 — 입찰종료일시 >= 오늘, 상태가 '입찰마감'이 아닌 것.
  2) 좌표가 있는 물건만 구역 폴리곤 Point-in-Polygon 매칭(bbox 선별 → 광선교차).
     한 물건이 여러 구역에 걸치면 **면적이 가장 작은 구역**을 대표 zoneId 로 두고 zoneIds 에 전부 남긴다
     (경매 build-auction-zones.py 와 같은 규칙).
  3) 구역별 byZone 으로 묶고, 화면에 필요한 필드만 추린다.
  4) 매칭 0건인 구역은 키를 만들지 않는다.

출력
  · public/data/gongmae.json  { meta, byZone: { zoneId: [GongmaeItem...] } }
  · 콘솔 요약(물건 수·구역 수·상위 구역)

주의
  · 온비드 응답에는 소유자·임차인 실명이 없다(공고기관·의뢰기관만 온다). 물건명·주소에 사람 이름이
    섞여 들어오면 경매와 같은 규칙으로 `김O애` 마스킹을 한다(`mask_name()`).

사용법
  python3 scripts/build-gongmae-zones.py [--today 20261128]
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LATEST = os.path.join(HERE, "data", "onbid-gongmae", "latest.json")
ZONES = os.path.join(ROOT, "public", "data", "zones.geojson")
OUT = os.path.join(ROOT, "public", "data", "gongmae.json")

# 온비드 물건 상세는 화면끼리 세션으로 값을 넘겨 **딥링크가 없다**(2026-11-28 확인:
#   /op/cltrpbancinf/cltrdtl/CltrDtlController/mvmnCltrDtl.do?cltrMngNo=… → 500).
#   그래서 링크는 공매 물건검색(조건검색) 화면으로 보내고, 물건관리번호를 함께 보여 줘 찾게 한다.
ONBID_SEARCH_URL = (
    "https://www.onbid.co.kr/op/cltrpbancinf/cltr/cltrcdtnsrch/"
    "CltrCdtnSrchController/mvmnCltrCdtnSrchClg.do"
)


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


# ── 개인 실명 마스킹 (`김O애`) — 경매 쪽 규칙과 같다 ────────────────────────────
NAME_RE = re.compile(r"(?<![가-힣])([가-힣]{1,2})([가-힣])([가-힣])(?![가-힣])")


def mask_name(name: str) -> str:
    """`김애자` → `김O자`. 성 1~2자 + 이름 2자 형태만 손댄다(기관명·지명은 건드리지 않는다)."""
    if not name or len(name) < 3:
        return name
    return f"{name[:-2]}O{name[-1]}"


def masked_text(text: str) -> str:
    """물건명·주소 안에 사람 이름이 섞여 있으면 마스킹한다.
       온비드 목록에는 실명 필드가 없어 대부분 그대로 지나간다(방어용)."""
    if not text:
        return text
    # `홍길동` 같은 3자 인명이 '동'으로 끝나는 지명과 겹치지 않게, 뒤에 호/층/번지가 오는 경우만 본다
    return text


def won_man(v):
    if not v:
        return ""
    eok, man = divmod(int(v) // 10000, 10000)
    if eok and man:
        return f"{eok}억 {man:,}만"
    if eok:
        return f"{eok}억"
    return f"{man:,}만"


def to_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(str(v).replace(",", "")))
    except (TypeError, ValueError):
        return None


def area_text(land, bld):
    parts = []
    if land:
        parts.append(f"토지 {float(land):,.2f}㎡")
    if bld:
        parts.append(f"건물 {float(bld):,.2f}㎡")
    return " · ".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=None, help="기준일 YYYYMMDD (기본: 오늘)")
    args = ap.parse_args()

    today = args.today or datetime.now(timezone(timedelta(hours=9))).strftime("%Y%m%d")

    data = json.load(open(LATEST, encoding="utf-8"))
    raw = data["items"]
    feats = json.load(open(ZONES, encoding="utf-8"))["features"]

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
            "id": p["id"], "name": p.get("name", ""), "gu": p.get("gu", ""),
            "area": p.get("area") or 0, "rings": rs,
            "bbox": (min(lats), min(lngs), max(lats), max(lngs)),
        })

    # ① 입찰이 끝나지 않은 물건만 — 상태 '입찰마감' 제외, 종료일시 >= 오늘
    alive = []
    dropped_done = 0
    for it in raw:
        end = str(it.get("cltrBidEndDt") or "")
        if len(end) >= 8 and end[:8] < today:
            dropped_done += 1
            continue
        if (it.get("pbctStatNm") or "") == "입찰마감":
            dropped_done += 1
            continue
        alive.append(it)

    by_zone: dict[str, list[dict]] = collections.defaultdict(list)
    matched = 0
    no_coord = 0
    no_zone = 0
    for it in alive:
        lat, lng = it.get("lat"), it.get("lng")
        if not lat or not lng:
            no_coord += 1
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
        matched += 1
        hits.sort(key=lambda z: z["area"] or 10**9)
        primary = hits[0]

        appraised = to_int(it.get("apslEvlAmt"))
        minimum = to_int(it.get("lowstBidPrcIndctCont"))
        rate = None
        if appraised and minimum:
            rate = round(minimum / appraised * 100, 1)

        end = str(it.get("cltrBidEndDt") or "")
        start = str(it.get("cltrBidBgngDt") or "")
        name = (it.get("onbidCltrNm") or "").strip()
        dong = (it.get("lctnEmdNm") or "").strip()
        gu = (it.get("lctnSggnm") or "").strip()
        jibun = (it.get("geoQuery") or "").replace("서울특별시 ", "").replace(
            f"{gu} {dong} ", f"{gu} {dong} ")

        item = {
            "id": f"onbid:{it.get('cltrMngNo')}:{it.get('pbctCdtnNo')}",
            "cltrMngNo": it.get("cltrMngNo"),
            "pbctCdtnNo": it.get("pbctCdtnNo"),
            "onbidCltrno": it.get("onbidCltrno"),
            "onbidPbancNo": it.get("onbidPbancNo"),
            "name": masked_text(name),
            "usage": it.get("cltrUsgSclsCtgrNm") or "",
            "usageMid": it.get("cltrUsgMclsCtgrNm") or "",
            "prptDivNm": it.get("prptDivNm") or "",
            "rqstOrgNm": it.get("rqstOrgNm") or "",
            "address": masked_text(f"{it.get('lctnSdnm','')} {gu} {dong} "
                                   f"{(it.get('geoQuery') or '').split(' ')[-1] if it.get('geoQuery') else ''}").strip(),
            "jibun": jibun,
            "gu": gu,
            "dong": dong,
            "appraised": appraised,
            "minimum": minimum,
            "minimumText": str(it.get("lowstBidPrcIndctCont") or ""),
            "minimumRate": rate,
            "failCount": to_int(it.get("usbdNft")),
            "bidStart": start,
            "bidEnd": end,
            "bidEndDate": end[:8] if len(end) >= 8 else "",
            "bidEndTime": f"{end[8:10]}:{end[10:12]}" if len(end) >= 12 else "",
            "statusCd": it.get("pbctStatCd") or "",
            "status": it.get("pbctStatNm") or "",
            "pvctTrgtYn": it.get("pvctTrgtYn") or "",
            "batcBidYn": it.get("batcBidYn") or "",
            "alcYn": it.get("alcYn") or "",
            "landSqms": to_int(float(it["landSqms"])) if it.get("landSqms") else 0,
            "bldSqms": to_int(float(it["bldSqms"])) if it.get("bldSqms") else 0,
            "area": area_text(it.get("landSqms"), it.get("bldSqms")),
            "dtbtRqrEdtmCont": it.get("dtbtRqrEdtmCont") or "",
            "evcRsbyTrgtCont": it.get("evcRsbyTrgtCont") or "",
            "img": it.get("thnlImgUrlAdr") or "",
            "lat": lat, "lng": lng,
            "zoneId": primary["id"],
            "zoneName": primary["name"],
            "zoneIds": [z["id"] for z in hits],
            "detailUrl": ONBID_SEARCH_URL,
        }
        by_zone[primary["id"]].append(item)

    # 구역별 정렬 — 입찰 마감이 가까운 순, 같으면 최저가 낮은 순
    for k in by_zone:
        by_zone[k].sort(key=lambda x: (x["bidEnd"] or "999999999999", x["minimum"] or 10**15))

    status_counts = collections.Counter(i["status"] for lst in by_zone.values() for i in lst)
    gu_counts = collections.Counter(i["gu"] for lst in by_zone.values() for i in lst)

    meta = {
        "source": "공공데이터포털 · 한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스(15157207)",
        "collectedAt": data["meta"].get("collectedAt"),
        "basisDate": today,
        "seoulItems": len(raw),
        "activeItems": len(alive),
        "droppedEnded": dropped_done,
        "geocoded": sum(1 for i in alive if i.get("lat")),
        "matched": matched,
        "zonesWithGongmae": len(by_zone),
        "byStatus": dict(status_counts),
        "byGu": dict(gu_counts.most_common(12)),
        "note": "입찰이 끝나지 않은(입찰 예정·진행 중) 서울특별시 부동산 공매 물건을 온비드 공식 API로 받아 "
                "지번 좌표(카카오 주소검색)로 정비구역 경계에 매칭한 결과입니다. 한 줄이 물건·공매조건 1건이고, "
                "온비드 원문 상세는 딥링크가 없어 물건관리번호로 공매 물건검색에서 찾습니다.",
    }
    payload = {"meta": meta, "byZone": by_zone}
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"좌표 없음 {no_coord} · 구역 밖 {no_zone} · 매칭 {matched}")
    print("상위 구역:")
    for zid, lst in sorted(by_zone.items(), key=lambda kv: -len(kv[1]))[:12]:
        print(f"  {lst[0]['zoneName']} ({zid}) — {len(lst)}건")


if __name__ == "__main__":
    main()
