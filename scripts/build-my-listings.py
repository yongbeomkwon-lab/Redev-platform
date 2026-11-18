#!/usr/bin/env python3
"""
내 매물(부동산포스 rfine.kr) 데이터셋 생성 — 2026-11-18 서울 63건

입력
  1) downloads/rfine_seoul_listings_2026-11-18.json  (부동산포스 수집 원본)
  2) scripts/data/rfine-geocode-2026-11-18.json      (카카오 지오코딩 좌표)
  3) public/data/zones.geojson                       (서울시 정비구역 경계)

출력
  · src/data/my-listings.json                  지도 핀·「내 매물만 보기」의 단일 원천
  · downloads/rfine_listings_db_payload.json   /api/listings POST 용 매물 본문(중복 1건 제외)

구역 매칭
  · 좌표 Point-in-Polygon → 구역 안이면 그 구역(여럿이면 매물 설명의 구역명이 일치하는 것 우선, 없으면 면적이 작은 쪽)
  · 폴리곤이 없는 후보지(사당21·능동A12 등)는 매물 설명의 구역명 + 대표지점 400m 이내일 때만 채택
  · 정비구역 밖 일반 매물(강남·서초 빌라 등)은 zoneId 없이 그대로 둔다 — 지도에는 구역 밖 핀으로 찍힌다
"""
import json, re, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "..", "downloads", "rfine_seoul_listings_2026-11-18.json")
GEO = os.path.join(ROOT, "scripts", "data", "rfine-geocode-2026-11-18.json")
ZONES = os.path.join(ROOT, "public", "data", "zones.geojson")
OUT_PINS = os.path.join(ROOT, "src", "data", "my-listings.json")
OUT_PAYLOAD = os.path.join(ROOT, "..", "..", "downloads", "rfine_listings_db_payload.json")

# 이미 검증 매물로 등록된 건 — DB에 중복 등록하지 않는다(src/data/verified-listings.json)
DUPLICATE = {"10991150": "v-sangdo23-dawon-404"}

raw = json.load(open(SRC, encoding="utf-8"))["listings"]
geo = json.load(open(GEO, encoding="utf-8"))["points"]
features = json.load(open(ZONES, encoding="utf-8"))["features"]


# ── 구역 기하 ───────────────────────────────────────────────────────────────
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


def dist_m(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


ZONES_L = []
for f in features:
    p = f["properties"]
    rs = rings_of(f.get("geometry"))
    if rs:
        pts = [pt for r in rs for pt in r]
        lats = [pt[1] for pt in pts]
        lngs = [pt[0] for pt in pts]
        ZONES_L.append({**p, "rings": rs, "bbox": (min(lats), min(lngs), max(lats), max(lngs)),
                        "center": ((min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2)})
    elif p.get("center"):
        ZONES_L.append({**p, "rings": [], "bbox": None, "center": tuple(p["center"])})


def norm(s):
    return re.sub(r"\s+", "", s or "")


def strip_g(s):
    return re.sub(r"구역$", "", norm(s))


def keys_of(z):
    ks = {norm(z["name"]), strip_g(z["name"])}
    for a in z.get("alias") or []:
        ks.add(norm(a))
        ks.add(strip_g(a))
    return ks


def resolve_hint(hint):
    h, hs = norm(hint), strip_g(hint)
    if h in ("모아타운추진구역", "모아타운"):
        return None
    for z in ZONES_L:
        if h in keys_of(z) or hs in keys_of(z):
            return z
    m = re.match(r"^창신(\d+)$", hs)
    if m:
        for z in ZONES_L:
            if norm(z["name"]).startswith("창신동" + m.group(1)):
                return z
    m = re.match(r"^능동A?(\d+)$", h)
    if m:
        for z in ZONES_L:
            if "A" + m.group(1) in (z.get("alias") or []):
                return z
    if hs.startswith("대청마을"):
        for z in ZONES_L:
            if "대청마을" in norm(z["name"]) and "북측" in norm(z["name"]):
                return z
    return None


HINT_RE = re.compile(r"([가-힣]{2,8}?)(\d{1,2})구역|([가-힣]{2,6})A(\d{1,2})|대청마을\s*북측구역|모아타운\s*추진구역")


def match_zone(l, lat, lng):
    inside = [z for z in ZONES_L if z["bbox"] and z["bbox"][0] <= lat <= z["bbox"][2] and z["bbox"][1] <= lng <= z["bbox"][3]
              and any(pip(lat, lng, r) for r in z["rings"])]
    hints = list(l.get("구역명_추정") or [])
    blob = " ".join(filter(None, [l.get("특징", ""), l.get("매물설명_정제", ""), " ".join(l.get("사업_문맥") or [])]))
    for m in HINT_RE.finditer(blob):
        if m.group(0) not in hints:
            hints.append(m.group(0))
    resolved = [(h, z) for h in hints for z in [resolve_hint(h)] if z]
    if inside:
        for _h, z in resolved:
            if any(z["id"] == iz["id"] for iz in inside):
                return z, "polygon+설명"
        return min(inside, key=lambda z: z.get("area") or 1e18), "polygon"
    if resolved:
        cands = sorted((dist_m((lat, lng), z["center"]), h, z) for h, z in resolved)
        if cands and cands[0][0] <= 400:
            return cands[0][2], f"설명+대표지점 {int(cands[0][0])}m"
    return None, ""


# ── 가격·면적 표기 ───────────────────────────────────────────────────────────
def won(v):
    if v is None:
        return ""
    v = int(round(v))
    eok, man = divmod(v, 10000)
    if eok and man:
        return f"{eok}억 {man:,}만원"
    if eok:
        return f"{eok}억원"
    return f"{man:,}만원"


def eok(v):
    if v is None:
        return ""
    return f"{v / 10000:.2f}".rstrip("0").rstrip(".") + "억"


def price_of(l):
    deal = l["거래유형"]
    if deal == "매매":
        v = l["매매가_만원"]
        return f"매 {eok(v)}", f"매매가 {won(v)}", v
    if deal == "전세":
        v = l["보증금_만원"]
        return f"전 {eok(v)}", f"전세 보증금 {won(v)}", v
    dep, rent = l["보증금_만원"], l["월세_만원"]
    return f"월 {eok(dep)}/{int(rent)}", f"보증금 {won(dep)} / 월세 {won(rent)}", dep


def area_label(l):
    e, p = l.get("전용면적_m2"), l.get("전용면적_평")
    if e is None:
        return ""
    return f"전 {e:g}㎡" + (f"·{p:g}평" if p else "")


def unit_label(l):
    parts = [l["거래유형"]]
    if l.get("전용면적_m2"):
        parts.append(f"전용 {l['전용면적_m2']:g}㎡")
    ho = re.search(r"제?(\d+)호", l.get("주소") or "")
    if ho:
        parts.append(f"{ho.group(1)}호")
    if l["거래유형"] == "월세" and l.get("월세_만원"):
        parts.append(f"월 {int(l['월세_만원'])}만")
    return " · ".join(parts)


def land_share(l):
    v = (l.get("대지지분") or "").strip()
    try:
        return float(v)
    except ValueError:
        return None


pins, payload, table = [], [], []
for l in raw:
    pid = l["매물번호"]
    g = geo[pid]
    lat, lng = g["lat"], g["lng"]
    zone, method = match_zone(l, lat, lng)
    plabel, ptext, base = price_of(l)
    gu, dong = l["시군구"], l["법정동"]
    out_name = f"{gu} {dong} (정비구역 밖)" if dong else f"{gu} (정비구역 밖)"

    pin = {
        "id": f"rfine-{pid}",
        "rfineNo": pid,
        "zoneId": zone["id"] if zone else None,
        "zoneName": zone["name"] if zone else None,
        "zoneMatch": method,
        "gu": gu,
        "dong": dong,
        "jibun": l.get("지번") or "",
        "address": l.get("주소") or "",
        "jibunAddress": l.get("소재지") or "",
        "buildingName": l.get("건물명") or "",
        "propertyType": l["매물유형"],
        "propertyDetail": l.get("매물유형상세") or "",
        "dealType": l["거래유형"],
        "priceLabel": plabel,
        "priceText": ptext,
        "salePrice": l.get("매매가_만원"),
        "deposit": l.get("보증금_만원"),
        "monthlyRent": l.get("월세_만원"),
        "areaLabel": area_label(l),
        "exclusiveAreaSqm": l.get("전용면적_m2"),
        "supplyAreaSqm": l.get("공급면적_m2"),
        "floor": l.get("해당층_총층") or "",
        "roomBath": l.get("방수_욕실수") or "",
        "feature": l.get("특징") or "",
        "approvalDate": l.get("사용승인일") or "",
        "expiresAt": l.get("만료일") or "",
        "detailUrl": l.get("상세URL") or "",
        "naverUrl": l.get("네이버URL") or "",
        "lat": lat,
        "lng": lng,
        "geoPrecision": g["precision"],
        "geoMatched": g["matched"],
        "duplicateOf": DUPLICATE.get(pid),
    }
    pins.append(pin)
    table.append((pid, gu, dong, l["매물유형"], l["거래유형"], plabel, zone["name"] if zone else "-", method, g["precision"]))

    if pid in DUPLICATE:
        continue
    feature = (l.get("특징") or "").strip()
    payload.append({
        "id": pin["id"],
        "zoneId": zone["id"] if zone else f"mylisting-{gu}",
        "zoneName": zone["name"] if zone else out_name,
        "gu": gu,
        "propertyType": l["매물유형"],
        "brokerName": "권용범",
        "brokerAgency": "이엑스피코리아부동산중개법인(주) 삼성동",
        "brokerPhone": "010-2758-5292",
        "unitType": unit_label(l),
        "salePrice": base,
        "deposit": 0,
        "exclusiveAreaSqm": l.get("전용면적_m2"),
        "landShareSqm": land_share(l),
        "verified": True,
        "note": f"[부동산포스 {pid} · {ptext}] {feature}"[:480],
        "createdAt": l.get("등록일"),
    })

pins.sort(key=lambda p: p["rfineNo"])
payload.sort(key=lambda p: p["id"])

json.dump({
    "metadata": {
        "title": "내 매물 — 부동산포스(rfine.kr) 서울 63건",
        "asOf": "2026-11-18",
        "count": len(pins),
        "owner": "권용범 (이엑스피코리아부동산중개법인(주))",
        "ownerPhone": "010-2758-5292",
        "source": "downloads/rfine_seoul_listings_2026-11-18.json",
        "geocoding": "카카오맵 JS Geocoder(지번→좌표) · 지번 없는 2건은 법정동 중심",
        "note": "지도 「내 매물만 보기」 핀의 단일 원천. 정비구역 밖 매물(강남·서초 빌라 등)도 zoneId 없이 포함한다. DB 등록분 62건 + 기존 검증 매물(상도23 다원씨앤아이 404호) 1건.",
    },
    "listings": pins,
}, open(OUT_PINS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(OUT_PINS, "a", encoding="utf-8").write("\n")

json.dump({
    "metadata": {
        "target": "POST /api/listings (Supabase public.listings)",
        "count": len(payload),
        "excluded": [{"rfineNo": k, "reason": f"이미 검증 매물로 등록됨({v})"} for k, v in DUPLICATE.items()],
        "note": "DB 스키마 변경 없이 기존 컬럼만 사용한다. 정비구역 밖 매물은 zoneId='mylisting-<구>'.",
    },
    "listings": payload,
}, open(OUT_PAYLOAD, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(OUT_PAYLOAD, "a", encoding="utf-8").write("\n")

print(f"pins {len(pins)} · db payload {len(payload)}")
for row in table:
    print(" | ".join(str(x) for x in row))
