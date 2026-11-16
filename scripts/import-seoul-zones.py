#!/usr/bin/env python3
"""
서울시 도시계획사업(서울플랜+) SHP → 앱 GeoJSON 변환 파이프라인

원천: 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 (OA-22712)
      파일: UQ120_도시계획사업(서울플랜+)_YYYYMM.zip  (CC-Zero, 상업적 이용 가능)
      좌표계: EPSG:5174 (Korean 1985 / Modified Korea Central Belt, Bessel 1841)

출력:
  src/data/zones-geo.json      대표(피처드) 구역 실경계 — 앱 상세·지도 하이라이트
  src/data/seoul-zones.json    배경 레이어 150개 구역 실경계 (간략화)
  public/data/zones.geojson    위 150개를 GeoJSON(FeatureCollection)으로

필요 패키지: pip install pyshp pyproj
사용: python3 scripts/import-seoul-zones.py <추출된 shp 디렉터리>
"""
import json, math, sys, os

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
# 앱의 구역 id → 서울시 데이터(PRESENT_SN). 구역 명칭이 같은(또는 그 구역을 지칭하는)
# 실제 고시 레코드를 매칭한다. 괄호 안은 고시 면적·단계.
FEATURED = {
    "sillim-1":   ("11000UQ120PS202407010537", 0.000004),  # 신림1구역 (재정비촉진구역·사업시행인가·223,201㎡)
    "banpo-1":    ("11000UQ120PS202411014218", 0.000004),  # 반포주공1단지(3주구) (재건축·착공·117,114㎡)
    "noryangjin": ("11000UQ120PS202407010607", 0.000004),  # 노량진2구역 (재정비촉진구역·착공·16,213㎡)
    "hannam":     ("11000UQ120PS202407010530", 0.000004),  # 한남재정비촉진지구=한남뉴타운 (재정비촉진지구·지구변경·948,390㎡)
    "seongsu":    ("11000UQ120PS202407010881", 0.000004),  # 성수전략정비지구2 (신속통합기획·기획완료·131,980㎡)
    "bukahyeon":  ("11000UQ120PS202407010570", 0.000004),  # 북아현1-1구역 (재정비촉진구역·준공·77,174㎡)
}

# 배경 레이어에 담을 사업유형 (존치·시장·재생·역세권 등은 제외)
BG_KINDS = {"BZ101", "BZ102", "BZ103", "BZ104", "BZ105", "BZ201", "BZ402", "BZ502"}
TARGET = 150
AS_OF = "2026-09-10"  # 서울시 데이터 기준일(파일 수정일)
PER_GU_MAX = 9
PER_GU_MIN = 2


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


def simplify(ll, tol, cap=48):
    ring = ll[:-1] if len(ll) > 1 and ll[0] == ll[-1] else ll
    out = dp(ring, tol)
    while len(out) > cap:
        tol *= 1.6
        out = dp(ring, tol)
    # [lat,lng] 5자리(≈1.1m) 반올림 + 중복 제거
    res = []
    for lng, lat in out:
        p = [round(lat, 5), round(lng, 5)]
        if not res or res[-1] != p:
            res.append(p)
    return res


def main():
    src = sys.argv[1]
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    r = shapefile.Reader(src, encoding="cp949")

    recs, every = [], {}
    for sr in r.iterShapeRecords():
        d = sr.record.as_dict()
        if not sr.shape.points:
            continue
        rings = ring_of(sr.shape)
        if not rings:
            continue
        ll = rings[0][1]
        ring_total = sum(r[0] for r in rings)
        rec = {
            "sid": d["PRESENT_SN"],
            "name": (d["DGM_NM"] or "").strip(),
            "kind": KIND.get(d["SCLAS_CL"], d["SCLAS_CL"]),
            "type": TYPE.get(d["SCLAS_CL"], "일반재개발"),
            "bg": d["SCLAS_CL"] in BG_KINDS,
            "stage": STAGE.get(d["PROPEL_CD"], d["PROPEL_CD"] or "-"),
            "gu": GU.get(d["SIGNGU_SE"], d["SIGNGU_SE"]),
            # 면적은 경계 도형의 실제 면적(SHAPE_AREA, ㎡) — 고시면적(DGM_AR)과 1% 내 일치,
            # 일부 레코드의 DGM_AR 단위 오류를 피한다.
            "area": round(float(d["SHAPE_AREA"] or d["DGM_AR"] or 0)),
            "areaNotice": round(float(d["DGM_AR"] or 0)),
            "date": str(d["CREATE_DAT"] or ""),
            "lat": sum(p[1] for p in ll) / len(ll),
            "lng": sum(p[0] for p in ll) / len(ll),
            "ll": ll,
            "lls": [r[1] for r in rings if r[0] >= max(2000, 0.05 * ring_total)],
        }
        every[rec["sid"]] = rec
        if rec["bg"]:
            recs.append(rec)
    by_id = every

    # ── 중복(같은 구역이 단계별로 여러 레코드) 제거 ──
    def dist(a, b):
        return math.hypot((a["lat"] - b["lat"]) * 111_000,
                          (a["lng"] - b["lng"]) * 88_000)
    recs.sort(key=lambda x: (-x["area"], x["date"]))
    kept = []
    for x in recs:
        if any(dist(x, k) < 45 and abs(x["area"] - k["area"]) < max(300, 0.4 * max(x["area"], 1))
               for k in kept):
            continue
        kept.append(x)
    print(f"원본 {len(recs)} → 중복제거 {len(kept)}")

    # ── 대표 구역 ──
    featured_ids = {v[0] for v in FEATURED.values()}
    kept = [x for x in kept if x["sid"] not in featured_ids]  # 배경에서 제외(중복 방지)

    # ── 구별 상한을 두고 면적순 선정 ──
    per_gu, sel = {}, []
    for x in sorted(kept, key=lambda x: -x["area"]):
        if len(sel) >= TARGET - len(FEATURED):
            break
        if per_gu.get(x["gu"], 0) >= PER_GU_MAX:
            continue
        per_gu[x["gu"]] = per_gu.get(x["gu"], 0) + 1
        sel.append(x)
    # 구별 최소 확보
    for gu in GU.values():
        while per_gu.get(gu, 0) < PER_GU_MIN:
            cand = next((x for x in kept if x["gu"] == gu and x not in sel), None)
            if not cand:
                break
            sel.append(cand); per_gu[gu] = per_gu.get(gu, 0) + 1
    print(f"배경 선정 {len(sel)}개 · 자치구 {len(per_gu)}곳")

    # ── 파일 쓰기 ──
    geo, bg = [], []
    for zid, (sid, tol) in FEATURED.items():
        if sid not in by_id:
            raise SystemExit(f"피처드 레코드 없음: {zid} {sid}")
        z = by_id[sid]
        polys = [simplify(ll, tol, cap=600) for ll in z["lls"]]
        geo.append({
            "id": zid, "sourceId": z["sid"], "name": z["name"],
            "area": z["areaNotice"] or z["area"], "shapeArea": z["area"],
            "stage": z["stage"], "kind": z["kind"], "asOf": AS_OF,
            "center": [round(z["lat"], 6), round(z["lng"], 6)],
            "polygon": polys[0],
            **(({"parts": polys[1:]}) if len(polys) > 1 else {}),
        })
        bg.append({"id": zid, "name": z["name"], "type": z["type"], "gu": z["gu"],
                   "stage": z["stage"], "kind": z["kind"], "area": z["area"],
                   "center": [round(z["lat"], 6), round(z["lng"], 6)],
                   "polygon": polys[0],
                   **(({"parts": polys[1:]}) if len(polys) > 1 else {}), "featured": True})

    for z in sel:
        polys = [simplify(ll, 0.000020, cap=40) for ll in z["lls"]]
        bg.append({"id": z["sid"], "name": z["name"], "type": z["type"], "gu": z["gu"],
                   "stage": z["stage"], "kind": z["kind"], "area": z["area"],
                   "center": [round(z["lat"], 6), round(z["lng"], 6)],
                   "polygon": polys[0],
                   **(({"parts": polys[1:]}) if len(polys) > 1 else {}), "featured": False})

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
                         if len(closed) > 1 else {"type": "Polygon", "coordinates": closed[0]}),
        })
    json.dump(fc, open(f"{root}/public/data/zones.geojson", "w"), ensure_ascii=False, separators=(",", ":"))

    print(f"zones-geo {len(geo)} · seoul-zones {len(bg)} · "
          f"geojson {os.path.getsize(f'{root}/public/data/zones.geojson')/1024:.0f}KB")


if __name__ == "__main__":
    main()
