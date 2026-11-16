#!/usr/bin/env python3
"""
서울시 정비구역 경계 SHP → 앱 GeoJSON 변환 파이프라인 (2-소스 병합)

원천 ① 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 (OA-22712)
        파일: 532_UQ120_도시계획사업(서울플랜+)_YYYYMM.zip     → 사업유형·추진단계·고시면적 메타
원천 ② 서울 열린데이터광장 「서울시 의제처리구역 위치정보」 (OA-20957)
        파일: 570_UQ181_의제처리구역_YYYYMM.zip               → 정비구역 실경계(필지 경계를 따라가는 정밀 도형)
      두 소스 모두 좌표계 EPSG:5174 (Korean 1985 / Bessel, TM중부).

출력:
  src/data/zones-geo.json      대표(피처드) 구역 실경계 — 앱 상세·지도 하이라이트
  src/data/seoul-zones.json    배경 레이어 구역 실경계 (간략화)
  public/data/zones.geojson    위 구역을 GeoJSON(FeatureCollection)으로

병합 규칙:
  같은 구역이 두 소스에 있으면 **정점이 더 많은(필지 경계를 더 잘 따라가는) 도형**을 쓴다.
  → 성수전략정비구역 제2주택정비형 재개발정비구역은 UQ120이 10점(직선 위주)이지만
    UQ181은 125점으로 필지 경계를 그대로 따라간다. 이런 구역만 UQ181 도형으로 교체되고,
    UQ181에 없거나 더 거친 구역(신통기획 신규 대상지 등)은 UQ120 도형을 유지한다.

필요 패키지: pip install pyshp pyproj
사용: python3 scripts/import-seoul-zones.py <UQ120 shp 디렉터리> [<UQ181 shp 디렉터리>]
"""
import json, math, sys, os, difflib

import shapefile
from pyproj import CRS, Transformer

# ── 좌표계: EPSG:5174 (Korean 1985, Bessel) → WGS84 ──────────────────────────
# Korean 1985(Korean Datum) → WGS84 7-parameter (EPSG 공식 Bursa-Wolf)
SRC = CRS.from_proj4(
    "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 "
    "+ellps=bessel +units=m +no_defs "
    "+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43"
)
TR = Transformer.from_crs(SRC, CRS.from_epsg(4326), always_xy=True)

KIND = {
    "BZ101": "신속통합기획", "BZ102": "재개발(도시정비형)", "BZ103": "재개발(주택정비형)",
    "BZ104": "재건축(단독)", "BZ105": "재건축(공동)",
    "BZ107": "주거환경개선(관리형)", "BZ108": "주거환경개선(정비형)",
    "BZ201": "모아타운", "BZ202": "가로주택정비사업", "BZ203": "자율주택정비사업",
    "BZ204": "소규모재건축", "BZ205": "소규모재개발",
    "BZ301": "장기전세주택", "BZ302": "역세권활성화", "BZ303": "청년안심주택", "BZ306": "미리내집",
    "BZ401": "재정비촉진지구", "BZ402": "재정비촉진구역", "BZ403": "존치정비구역", "BZ404": "존치관리구역",
    "BZ501": "공공주택지구", "BZ502": "도심공공주택복합",
    "BZ601": "도시개발사업", "BZ602": "리모델링활성화구역", "BZ603": "시장정비사업",
    "BZ604": "도시재생활성화지역", "BZ606": "사전협상제",
}
# 앱 4분류로 매핑 (배경 레이어 색상)
TYPE = {
    "BZ101": "신통기획", "BZ102": "일반재개발", "BZ103": "일반재개발", "BZ104": "일반재개발",
    "BZ105": "일반재개발", "BZ402": "일반재개발",
    "BZ201": "모아타운", "BZ502": "도공복",
}
STAGE = {
    "PP0101": "대상지선정(추진중)", "PP0102": "대상지선정", "PP0103": "기획완료", "PP0104": "보류",
    "PP0201": "입안제안", "PP0202": "열람공고", "PP0203": "위원회심의", "PP0204": "구역지정",
    "PP0205": "추진위구성", "PP0206": "조합설립인가", "PP0207": "건축심의", "PP0208": "사업시행인가",
    "PP0209": "관리처분계획인가", "PP0210": "착공", "PP0211": "준공",
    "PP0301": "대상지선정", "PP0302": "정비계획수립", "PP0303": "위원회심의", "PP0304": "구역지정",
    "PP0305": "사업시행인가", "PP0306": "착공", "PP0307": "준공(일부)", "PP0308": "준공",
    "PP0403": "관리지역고시", "PP0406": "관리지역고시", "PP0402": "대상지선정",
    "PP0500": "조합설립인가 추진중", "PP0501": "조합설립인가", "PP0502": "건축심의",
    "PP0503": "사업시행인가", "PP0504": "착공", "PP0505": "준공",
    "PP0701": "조합설립추진중", "PP0702": "조합설립인가", "PP0703": "건축심의",
    "PP0704": "사업시행계획인가", "PP0705": "착공", "PP0706": "준공",
    "PP1001": "지구지정", "PP1002": "지구변경",
    "PP1101": "대상지선정", "PP1102": "촉진계획수립(변경)", "PP1105": "구역지정", "PP1107": "추진위구성",
    "PP1108": "조합설립인가", "PP1109": "건축심의", "PP1110": "사업시행인가",
    "PP1111": "관리처분계획인가", "PP1112": "착공", "PP1113": "준공",
    "PP1201": "예정지구지정", "PP1202": "후보지선정", "PP1203": "지구지정",
    "PP1205": "사업계획승인", "PP1206": "착공", "PP1207": "준공",
    "PP2101": "구역지정", "PP2102": "구역변경",
}
GU = {
    "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구", "11215": "광진구",
    "11230": "동대문구", "11260": "중랑구", "11290": "성북구", "11305": "강북구", "11320": "도봉구",
    "11350": "노원구", "11380": "은평구", "11410": "서대문구", "11440": "마포구", "11470": "양천구",
    "11500": "강서구", "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
    "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구", "11740": "강동구",
}

# ── 대표(피처드) 구역 ↔ 서울시 공식 레코드 매칭 ──────────────────────────────
# 앱의 구역 id → (UQ120 사업 레코드 PRESENT_SN, 고정밀 우선순위)
#   UQ181(의제처리구역)은 정비구역 실경계라 정점이 더 많다. 있으면 자동으로 이 도형을 쓴다.
#   (앱 표시명·유형·단계·면적 메타는 UQ120 레코드 값 유지)
FEATURED = {
    "sillim-1":   ("11000UQ120PS202407010537", 0.000004),  # 신림1구역 (재정비촉진구역·사업시행인가·223,201㎡)
    "banpo-1":    ("11000UQ120PS202411014218", 0.000004),  # 반포주공1단지(3주구) (재건축·착공·117,114㎡)
    # 노량진: 샘플 카드의 2,140세대·대단지 서사와 일치하는 '노량진1구역'(132,187㎡·관리처분계획인가)으로 정합.
    # (구 표기 '노량진 제2구역'의 서울시 레코드는 16,213㎡ 소구역이라 세대수와 맞지 않았다)
    "noryangjin": ("11000UQ120PS202407010595", 0.000004),  # 노량진1구역 (재정비촉진구역·관리처분계획인가·132,187㎡)
    "hannam":     ("11000UQ120PS202407010530", 0.000004),  # 한남재정비촉진지구=한남뉴타운 (재정비촉진지구·지구변경·948,390㎡)
    "seongsu":    ("11000UQ120PS202407010881", 0.000004),  # 성수전략정비지구2 (신속통합기획·기획완료·131,980㎡)
    "bukahyeon":  ("11000UQ120PS202407010570", 0.000004),  # 북아현1-1구역 (재정비촉진구역·준공·77,174㎡)
}

# 배경 레이어에 담을 사업유형 (존치·시장·재생·역세권 등은 제외)
BG_KINDS = {"BZ101", "BZ102", "BZ103", "BZ104", "BZ105", "BZ201", "BZ402", "BZ502"}
TARGET = 150
AS_OF = "2026-09-10"        # UQ120(서울플랜+) 기준일
AS_OF_DETAIL = "2026-09-11"  # UQ181(의제처리구역) 기준일
PER_GU_MAX = 9
PER_GU_MIN = 2

# 간략화 허용오차(도 단위, 위도 1e-5 ≈ 1.1m)
TOL_FEATURED = 0.000004     # ≈0.45m — 필지 경계의 꺾임을 그대로 남긴다
CAP_FEATURED = 900
TOL_BG = 0.000018           # ≈2.0m — 배경 레이어
CAP_BG = 120


def ring_of(shape):
    """SHP parts → 링 목록(면적 내림차순), 각 링은 WGS84 [(lng,lat),...]."""
    pts, parts = shape.points, list(shape.parts) + [len(shape.points)]
    rings = []
    for i in range(len(parts) - 1):
        seg = pts[parts[i]:parts[i + 1]]
        if len(seg) < 3:
            continue
        # 면적은 원본 TM 좌표(미터)에서 계산 → 링 비교/필터가 미터 단위
        a = abs(sum(seg[k][0] * seg[k - 1][1] - seg[k - 1][0] * seg[k][1]
                    for k in range(len(seg))) / 2)
        rings.append((a, [TR.transform(x, y) for x, y in seg]))
    rings.sort(key=lambda r: -r[0])
    return rings


def perp(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dp(pts, tol):
    """Douglas–Peucker (반복 구현)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        dmax, idx = 0, -1
        for i in range(s + 1, e):
            d = perp(pts[i], pts[s], pts[e])
            if d > dmax:
                dmax, idx = d, i
        if dmax > tol and idx > 0:
            keep[idx] = True
            stack.append((s, idx))
            stack.append((idx, e))
    return [p for p, k in zip(pts, keep) if k]


def simplify(ll, tol, cap=48, digits=5):
    ring = ll[:-1] if len(ll) > 1 and ll[0] == ll[-1] else ll
    out = dp(ring, tol)
    while len(out) > cap:
        tol *= 1.6
        out = dp(ring, tol)
    # [lat,lng] 반올림(5자리≈1.1m / 6자리≈0.11m) + 중복 제거
    res = []
    for lng, lat in out:
        p = [round(lat, digits), round(lng, digits)]
        if not res or res[-1] != p:
            res.append(p)
    if len(res) > 2 and res[0] == res[-1]:
        res.pop()
    return res


def norm_name(s):
    """구역명 비교용 정규화 — 사업 유형·꼬리말·기호 제거."""
    s = (s or "").replace(" ", "")
    for junk in ("주택정비형", "도시정비형", "주택재개발사업", "주택재건축정비사업", "정비사업",
                 "재개발정비구역", "재개발", "재건축", "정비구역", "(주)", "㈜"):
        s = s.replace(junk, "")
    s = s.replace("재정비촉진구역", "구역").replace("재정비촉진지구", "지구")
    return s


def name_sim(a, b):
    return difflib.SequenceMatcher(None, norm_name(a), norm_name(b)).ratio()


def load(path, with_meta=True):
    """SHP → 레코드 목록. sid 기준 중복은 최신/최대 면적 우선으로 합친다."""
    r = shapefile.Reader(path, encoding="cp949")
    out = []
    for sr in r.iterShapeRecords():
        d = sr.record.as_dict()
        if not sr.shape.points:
            continue
        rings = ring_of(sr.shape)
        if not rings:
            continue
        ll = rings[0][1]
        ring_total = sum(q[0] for q in rings)
        rec = {
            "sid": d.get("PRESENT_SN"),
            "name": (d.get("DGM_NM") or "").strip(),
            "sclass": d.get("SCLAS_CL"),
            "date": str(d.get("CREATE_DAT") or ""),
            "area": round(float(d.get("SHAPE_AREA") or d.get("DGM_AR") or 0)),
            "lat": sum(p[1] for p in ll) / len(ll),
            "lng": sum(p[0] for p in ll) / len(ll),
            "ll": ll,
            "ringPts": len(ll),
            "lls": [q[1] for q in rings if q[0] >= max(2000, 0.05 * ring_total)],
        }
        if with_meta:
            rec.update({
                "kind": KIND.get(rec["sclass"], rec["sclass"]),
                "type": TYPE.get(rec["sclass"], "일반재개발"),
                "bg": rec["sclass"] in BG_KINDS,
                "stage": STAGE.get(d.get("PROPEL_CD"), d.get("PROPEL_CD") or "-"),
                "gu": GU.get(d.get("SIGNGU_SE"), d.get("SIGNGU_SE")),
                "areaNotice": round(float(d.get("DGM_AR") or 0)),
            })
        out.append(rec)
    return out


def dedup_by_sid(recs, prefer_big=True):
    by = {}
    for x in recs:
        k = x["sid"]
        if k not in by:
            by[k] = x
        else:
            cur = by[k]
            better = (x["ringPts"], x["area"], x["date"]) > (cur["ringPts"], cur["area"], cur["date"]) if prefer_big \
                else x["date"] > cur["date"]
            if better:
                by[k] = x
    return list(by.values())


def dist_m(a, b):
    return math.hypot((a["lat"] - b["lat"]) * 111_000, (a["lng"] - b["lng"]) * 88_000)


def match_detail(zone, detail):
    """같은 구역의 UQ181(의제처리구역) 레코드 찾기 — 중심거리·면적비·이름 유사도."""
    best, best_score = None, -9
    for c in detail:
        d = dist_m(zone, c)
        if d > 150:
            continue
        if not zone["area"] or not c["area"]:
            continue
        ratio = c["area"] / zone["area"]
        if not (0.5 <= ratio <= 2.0):
            continue
        sim = name_sim(zone["name"], c["name"])
        score = sim * 3 - d / 60 - abs(math.log(ratio))
        if score > best_score:
            best, best_score = c, score
    # 이름이 전혀 닮지 않았고 도형 면적도 20% 이상 차이 나면 다른 구역으로 본다
    if best is None:
        return None
    if name_sim(zone["name"], best["name"]) < 0.25 and abs(best["area"] / zone["area"] - 1) > 0.2:
        return None
    return best


def complexity(ll, tol=TOL_BG):
    """공통 허용오차에서 남는 정점 수 = 도형이 실제로 담고 있는 굴곡의 양.
    (SHP마다 정점 밀도가 달라 단순 정점 수 비교는 의미가 없다 — 노량진1은 1m 간격으로
     조밀화돼 있어 원본 정점이 603개지만 형상은 43점이면 충분하다.)"""
    ring = ll[:-1] if len(ll) > 1 and ll[0] == ll[-1] else ll
    return len(dp(ring, tol))


def pick_geometry(zone, detail):
    """두 소스의 '실제 굴곡량'을 같은 허용오차에서 비교해 더 상세한 도형을 고른다."""
    m = match_detail(zone, detail) if detail else None
    if m:
        c_base, c_det = complexity(zone["ll"]), complexity(m["ll"])
        if c_det >= c_base + 5 and c_det >= c_base * 1.3:
            return {
                "lls": m["lls"],
                "source": f"UQ181:{m['sid']}",
                "sourceName": m["name"],
                "gain": f"굴곡 {c_base}→{c_det}점(2m기준)",
            }
    return {"lls": zone["lls"], "source": f"UQ120:{zone['sid']}", "sourceName": zone["name"], "gain": None}


def main():
    uq120_dir = sys.argv[1]
    uq181_dir = sys.argv[2] if len(sys.argv) > 2 else None
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    every20 = dedup_by_sid(load(uq120_dir, with_meta=True))
    by_id = {x["sid"]: x for x in every20}
    detail = dedup_by_sid(load(uq181_dir, with_meta=False)) if uq181_dir else []
    print(f"UQ120 {len(every20)}레코드 · UQ181 {len(detail)}레코드")

    # ── 배경 후보(사업유형 필터) + 중복(단계별 레코드) 제거 ──
    recs = [x for x in every20 if x["bg"]]
    recs.sort(key=lambda x: (-x["area"], x["date"]))
    kept = []
    for x in recs:
        if any(dist_m(x, k) < 45 and abs(x["area"] - k["area"]) < max(300, 0.4 * max(x["area"], 1))
               for k in kept):
            continue
        kept.append(x)
    print(f"배경 후보 {len(recs)} → 중복제거 {len(kept)}")

    featured_ids = {v[0] for v in FEATURED.values()}
    kept = [x for x in kept if x["sid"] not in featured_ids]

    # ── 구별 상한을 두고 면적순 선정 ──
    per_gu, sel = {}, []
    for x in sorted(kept, key=lambda x: -x["area"]):
        if len(sel) >= TARGET - len(FEATURED):
            break
        if per_gu.get(x["gu"], 0) >= PER_GU_MAX:
            continue
        per_gu[x["gu"]] = per_gu.get(x["gu"], 0) + 1
        sel.append(x)
    for gu in GU.values():
        while per_gu.get(gu, 0) < PER_GU_MIN:
            cand = next((x for x in kept if x["gu"] == gu and x not in sel), None)
            if not cand:
                break
            sel.append(cand); per_gu[gu] = per_gu.get(gu, 0) + 1
    print(f"배경 선정 {len(sel)}개 · 자치구 {len(per_gu)}곳")

    # ── 파일 쓰기 ──
    geo, bg = [], []
    print("\n[대표 구역]")
    for zid, (sid, tol) in FEATURED.items():
        if sid not in by_id:
            raise SystemExit(f"피처드 레코드 없음: {zid} {sid}")
        z = by_id[sid]
        g = pick_geometry(z, detail)
        polys = [simplify(ll, tol, cap=CAP_FEATURED, digits=6) for ll in g["lls"]]
        print(f"  {zid:11s} {z['name'][:28]:30s} {str(g['gain'] or '-'):22s} "
              f"사용 {g['source']} → 최종 {len(polys[0])}점")
        geo.append({
            "id": zid, "sourceId": z["sid"], "name": z["name"],
            "area": z["areaNotice"] or z["area"], "shapeArea": z["area"],
            "stage": z["stage"], "kind": z["kind"], "asOf": AS_OF,
            "center": [round(z["lat"], 6), round(z["lng"], 6)],
            "polygon": polys[0],
            **(({"parts": polys[1:]}) if len(polys) > 1 else {}),
            "geomSource": g["source"],
            "geomSourceName": g["sourceName"],
            "geomAsOf": AS_OF_DETAIL if g["source"].startswith("UQ181") else AS_OF,
        })
        bg.append({"id": zid, "name": z["name"], "type": z["type"], "gu": z["gu"],
                   "stage": z["stage"], "kind": z["kind"], "area": z["area"],
                   "center": [round(z["lat"], 6), round(z["lng"], 6)],
                   "polygon": polys[0],
                   **(({"parts": polys[1:]}) if len(polys) > 1 else {}), "featured": True})

    upgraded = 0
    for z in sel:
        g = pick_geometry(z, detail)
        if g["gain"]:
            upgraded += 1
        polys = [simplify(ll, TOL_BG, cap=CAP_BG, digits=5) for ll in g["lls"]]
        bg.append({"id": z["sid"], "name": z["name"], "type": z["type"], "gu": z["gu"],
                   "stage": z["stage"], "kind": z["kind"], "area": z["area"],
                   "center": [round(z["lat"], 6), round(z["lng"], 6)],
                   "polygon": polys[0],
                   **(({"parts": polys[1:]}) if len(polys) > 1 else {}), "featured": False,
                   "geomSource": g["source"]})
    print(f"\n[배경] UQ181 고정밀 도형으로 교체 {upgraded} / {len(sel)}곳")

    json.dump(geo, open(f"{root}/src/data/zones-geo.json", "w"), ensure_ascii=False, indent=1)
    json.dump(bg, open(f"{root}/src/data/seoul-zones.json", "w"), ensure_ascii=False, separators=(",", ":"))
    fc = {"type": "FeatureCollection", "features": []}
    for z in bg:
        rings = [z["polygon"]] + z.get("parts", [])
        closed = [[[p[1], p[0]] for p in ring] + [[ring[0][1], ring[0][0]]] for ring in rings]
        fc["features"].append({
            "type": "Feature", "id": z["id"],
            "properties": {k: z[k] for k in ("id", "name", "type", "gu", "stage", "kind", "area", "featured")},
            "geometry": ({"type": "MultiPolygon", "coordinates": [[r] for r in closed]}
                         if len(closed) > 1 else {"type": "Polygon", "coordinates": [closed[0]]}),
        })
    json.dump(fc, open(f"{root}/public/data/zones.geojson", "w"), ensure_ascii=False, separators=(",", ":"))

    print(f"zones-geo {len(geo)} · seoul-zones {len(bg)} · "
          f"geojson {os.path.getsize(f'{root}/public/data/zones.geojson')/1024:.0f}KB")


if __name__ == "__main__":
    main()
