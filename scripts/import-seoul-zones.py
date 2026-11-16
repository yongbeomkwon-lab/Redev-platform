#!/usr/bin/env python3
"""
서울시 정비구역 **전수(全數)** 경계 SHP → 앱 GeoJSON 파이프라인 (2-소스 병합)

원천 ① 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 (OA-22712)
        파일: 532_UQ120_도시계획사업(서울플랜+)_YYYYMM.zip  → 사업유형·추진단계·고시면적 메타 + 경계
원천 ② 서울 열린데이터광장 「서울시 의제처리구역 위치정보」 (OA-20957)
        파일: 570_UQ181_의제처리구역_YYYYMM.zip            → 정비구역 실경계(필지 경계를 따라가는 정밀 도형)
      두 소스 모두 좌표계 EPSG:5174 (Korean 1985 / Bessel, TM중부).

출력:
  src/data/zones-geo.json      대표(피처드) 구역 고정밀 실경계 — 앱 상세·지도 하이라이트
  src/data/seoul-zones.json    서울시 전체 정비구역 목록(간략화 경계 포함)
  public/data/zones.geojson    위 전체를 GeoJSON(FeatureCollection)으로 — 지도가 클라이언트에서 fetch

포함 범위 (정비사업 본연):
  신속통합기획(BZ101) · 재개발 도시/주택정비형(BZ102/BZ103) · 재건축 단독/공동(BZ104/BZ105)
  · 주거환경개선(BZ107/BZ108) · 모아타운(BZ201) · 가로주택정비(BZ202) · 자율주택정비(BZ203)
  · 소규모재건축/재개발(BZ204/BZ205) · 재정비촉진구역(BZ402) · 도심공공주택복합(BZ502)
제외: 재정비촉진지구(BZ401, 여러 구역을 감싸는 상위 지구)·존치구역·역세권사업(장기전세·청소년안심·
  역세권활성화·미리내집)·도시개발·리모델링·시장정비·도시재생활성화지역(BZ604 — 동 경계 수준의
  넓은 면적이라 정비구역으로 오해됨)·사전협상제.

중복 제거:
  같은 구역이 여러 레코드로 등록돼 있다(신통기획 후보지 + 실제 사업구역, 재정비촉진구역 + 재개발,
  ‘성수전략2’ + ‘성수전략정비지구2’, ‘목동4단지’ 재건축 + 신통기획 등). 이름을 정규화해 같고
  중심이 250m 이내면 한 구역으로 합치고, **추진단계가 가장 앞선 레코드**의 유형·단계·면적을 쓴다.

병합 규칙(도형):
  같은 구역이 두 소스에 있으면 **굴곡이 더 많은(필지 경계를 더 잘 따라가는) 도형**을 쓴다.
  → 성수전략정비구역 제2주택정비형(성수전략2)은 UQ120이 10점 직선이지만 UQ181은 125점으로
    필지 경계를 그대로 따라간다. 이런 구역만 UQ181 도형으로 교체되고, UQ181에 없거나 더 거친
    구역(신통기획 신규 대상지 등)은 UQ120 도형을 유지한다.

필요 패키지: pip install pyshp pyproj
사용: python3 scripts/import-seoul-zones.py <UQ120 shp 디렉터리> [<UQ181 shp 디렉터리>]
"""
import difflib
import json
import math
import os
import sys

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

# ── 코드정의표(서울플랜+코드정의표(대민용).xlsx) ────────────────────────────────
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
# 지도 색상 6분류
MAPTYPE = {
    "BZ101": "신통기획",
    "BZ102": "일반재개발", "BZ103": "일반재개발", "BZ104": "일반재개발", "BZ105": "일반재개발",
    "BZ107": "일반재개발", "BZ108": "일반재개발", "BZ402": "일반재개발", "BZ401": "일반재개발",
    "BZ201": "모아타운", "BZ502": "도공복",
    "BZ202": "가로주택",
    "BZ203": "소규모", "BZ204": "소규모", "BZ205": "소규모",
}
# 지도에 올릴 소분류 (전수)
INCLUDE = {
    "BZ101", "BZ102", "BZ103", "BZ104", "BZ105", "BZ107", "BZ108",
    "BZ201", "BZ202", "BZ203", "BZ204", "BZ205", "BZ402", "BZ502",
}
# 같은 구역이 여러 레코드일 때 어느 레코드의 메타를 쓸지 — 정비구역 본연일수록 높게
SPEC = {
    "BZ402": 9, "BZ102": 8, "BZ103": 8, "BZ107": 8, "BZ108": 8,
    "BZ104": 7, "BZ105": 7, "BZ502": 6,
    "BZ201": 5, "BZ202": 4, "BZ204": 4, "BZ205": 4, "BZ203": 3,
    "BZ101": 2, "BZ401": 1,
}
STAGE = {
    "PP0101": "대상지선정(추진중)", "PP0102": "대상지선정", "PP0103": "기획완료", "PP0104": "보류",
    "PP0201": "입안제안", "PP0202": "열람공고", "PP0203": "위원회심의", "PP0204": "구역지정",
    "PP0205": "추진위구성", "PP0206": "조합설립인가", "PP0207": "건축심의", "PP0208": "사업시행인가",
    "PP0209": "관리처분계획인가", "PP0210": "착공", "PP0211": "준공",
    "PP0301": "대상지선정", "PP0302": "정비계획수립", "PP0303": "위원회심의", "PP0304": "구역지정",
    "PP0305": "사업시행인가", "PP0306": "착공", "PP0307": "준공(일부)", "PP0308": "준공",
    "PP0401": "수립범위 자문", "PP0402": "대상지선정", "PP0403": "관리지역고시", "PP0404": "사전자문",
    "PP0405": "위원회심의", "PP0406": "관리지역고시",
    "PP0500": "조합설립인가 추진중", "PP0501": "조합설립인가", "PP0502": "건축심의",
    "PP0503": "사업시행인가", "PP0504": "착공", "PP0505": "준공",
    "PP0601": "주민합의체 구성", "PP0602": "건축심의", "PP0603": "사업시행인가",
    "PP0604": "착공", "PP0605": "준공",
    "PP0701": "조합설립추진중", "PP0702": "조합설립인가", "PP0703": "건축심의",
    "PP0704": "사업시행계획인가", "PP0705": "착공", "PP0706": "준공",
    "PP0801": "대상지선정", "PP0802": "사전검토", "PP0803": "입안제안", "PP0804": "열람공고",
    "PP0805": "위원회심의", "PP0806": "구역지정", "PP0807": "건축심의", "PP0808": "사업계획승인",
    "PP0809": "착공", "PP0810": "준공",
    "PP0901": "대상지선정", "PP0902": "통심위 사전자문", "PP0903": "입안제안", "PP0904": "열람공고",
    "PP0905": "위원회심의", "PP0906": "구역지정", "PP0907": "건축심의", "PP0908": "사업계획승인",
    "PP0909": "건축허가", "PP0910": "착공", "PP0911": "사용승인", "PP0912": "입주",
    "PP1001": "지구지정", "PP1002": "지구변경",
    "PP1101": "대상지선정", "PP1102": "촉진계획수립(변경)", "PP1103": "열람공고", "PP1104": "위원회심의",
    "PP1105": "구역지정", "PP1107": "추진위구성", "PP1108": "조합설립인가", "PP1109": "건축심의",
    "PP1110": "사업시행인가", "PP1111": "관리처분계획인가", "PP1112": "착공", "PP1113": "준공",
    "PP1201": "예정지구지정", "PP1202": "후보지선정", "PP1203": "지구지정", "PP1204": "설계공모완료",
    "PP1205": "사업계획승인", "PP1206": "착공", "PP1207": "준공", "PP1208": "입주중",
    "PP1209": "후보지철회",
    "PP1301": "입안제안", "PP1302": "열람공고", "PP1303": "위원회심의", "PP1304": "구역지정",
    "PP1305": "실시계획인가", "PP1306": "준공",
    "PP1401": "조합설립인가", "PP1402": "1차 안전진단", "PP1403": "건축심의",
    "PP1404": "리모델링허가승인", "PP1405": "2차 안전진단", "PP1406": "착공", "PP1407": "준공",
    "PP1501": "추진계획수립중", "PP1502": "추진계획승인", "PP1503": "조합설립인가",
    "PP1504": "사업시행계획인가", "PP1505": "관리처분계획인가", "PP1506": "착공", "PP1507": "준공",
    "PP1601": "대상지선정", "PP1602": "활성화계획수립", "PP1603": "마중물사업(추진중)", "PP1604": "사업완료",
    "PP1801": "대상지선정", "PP1802": "통심위 사전자문", "PP1803": "입안제안", "PP1804": "열람공고",
    "PP1805": "위원회심의", "PP1806": "구역지정", "PP1807": "건축심의/통합심의", "PP1808": "사업계획승인",
    "PP1809": "착공", "PP1810": "준공",
    "PP1901": "입주자 모집공고 완료", "PP1902": "입주자 모집공고 완료",
    "PP2001": "입안제안", "PP2002": "열람공고", "PP2003": "위원회심의", "PP2004": "구역지정",
    "PP2005": "지구계획승인(변경)", "PP2006": "착공", "PP2007": "준공",
    "PP2101": "구역지정", "PP2102": "구역변경",
    "PP2201": "대상지 선정", "PP2202": "제안서접수", "PP2203": "협상조정협의회 운영", "PP2204": "협상완료",
    "PP2205": "입안절차 진행", "PP2206": "도시건축공동위 심의", "PP2207": "결정고시", "PP2208": "인허가 절차",
    "PP2209": "착공", "PP2210": "준공",
}
GU = {
    "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구", "11215": "광진구",
    "11230": "동대문구", "11260": "중랑구", "11290": "성북구", "11305": "강북구", "11320": "도봉구",
    "11350": "노원구", "11380": "은평구", "11410": "서대문구", "11440": "마포구", "11470": "양천구",
    "11500": "강서구", "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
    "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구", "11740": "강동구",
}

# ── 대표(피처드) 구역 ↔ 서울시 공식 레코드 매칭 ──────────────────────────────
# 앱의 구역 id → UQ120 사업 레코드 PRESENT_SN, 간략화 허용오차
#   UQ181(의제처리구역)은 정비구역 실경계라 굴곡이 더 많다. 있으면 자동으로 이 도형을 쓴다.
#   (앱 표시명·유형·단계·면적 메타는 UQ120 레코드 값 유지)
FEATURED = {
    "sillim-1":   ("11000UQ120PS202407010537", 0.000004),  # 신림1구역 (재정비촉진구역·사업시행인가·223,201㎡)
    "banpo-1":    ("11000UQ120PS202411014218", 0.000004),  # 반포주공1단지(3주구) (재건축·착공·117,114㎡)
    # 노량진: 샘플 카드의 2,140세대·대단지 서사와 일치하는 '노량진1구역'(132,187㎡·관리처분계획인가)으로 정합.
    "noryangjin": ("11000UQ120PS202407010595", 0.000004),  # 노량진1구역 (재정비촉진구역·관리처분계획인가·132,187㎡)
    "hannam":     ("11000UQ120PS202407010530", 0.000004),  # 한남재정비촉진지구=한남뉴타운 (재정비촉진지구·지구변경·948,390㎡)
    "seongsu":    ("11000UQ120PS202407010881", 0.000004),  # 성수전략정비지구2 (신속통합기획·기획완료·131,980㎡)
    "bukahyeon":  ("11000UQ120PS202407010570", 0.000004),  # 북아현1-1구역 (재정비촉진구역·준공·77,174㎡)
}

AS_OF = "2026-09-10"        # UQ120(서울플랜+) 기준일
AS_OF_DETAIL = "2026-09-11"  # UQ181(의제처리구역) 기준일

# 간략화 허용오차(도 단위, 위도 1e-5 ≈ 1.11m)
TOL_FEATURED = 0.000004     # ≈0.45m — 필지 경계의 꺾임을 그대로 남긴다
CAP_FEATURED = 900
TOL_BG = 0.000012           # ≈1.3m — 두 도형의 '굴곡량' 비교 기준(공통)
TOL_CITY = 0.000025         # ≈2.8m — 전국 지도용 간략화
CAP_CITY = 260              # 링 하나의 최대 점수(과도한 조밀화 방지)


# ── 도형 유틸 ────────────────────────────────────────────────────────────────
def ring_of(shape):
    """SHP parts → 링 목록(면적 내림차순), 각 링은 WGS84 [(lng,lat),...] + 원본 면적(㎡)."""
    pts, parts = shape.points, list(shape.parts) + [len(shape.points)]
    rings = []
    for i in range(len(parts) - 1):
        seg = pts[parts[i]:parts[i + 1]]
        if len(seg) < 3:
            continue
        a = abs(sum(seg[k][0] * seg[k - 1][1] - seg[k - 1][0] * seg[k][1]
                    for k in range(len(seg))) / 2)
        rings.append((a, [TR.transform(x, y) for x, y in seg]))
    rings.sort(key=lambda r: -r[0])
    return rings


def perp(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
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
    # 아주 작은 구역(수백 ㎡)은 간략화하면 형태가 사라진다 → 원본 링 유지
    if len(out) < 3:
        out = ring

    def round_ring(pts, d):
        res = []
        for lng, lat in pts:
            p = [round(lat, d), round(lng, d)]
            if not res or res[-1] != p:
                res.append(p)
        if len(res) > 2 and res[0] == res[-1]:
            res.pop()
        return res

    # [lat,lng] 반올림(5자리≈1.1m / 6자리≈0.11m); 반올림으로 뭉개지면 정밀도를 올린다
    res = round_ring(out, digits)
    if len(res) < 3:
        res = round_ring(out, 6)
    return res


def complexity(ll, tol=TOL_BG):
    """공통 허용오차에서 남는 정점 수 = 도형이 실제로 담고 있는 굴곡의 양.
    (SHP마다 정점 밀도가 달라 단순 정점 수 비교는 의미가 없다 — 노량진1은 1m 간격으로
     조밀화돼 있어 원본 정점이 603개지만 형상은 43점이면 충분하다.)"""
    ring = ll[:-1] if len(ll) > 1 and ll[0] == ll[-1] else ll
    return len(dp(ring, tol))


# ── 이름·중복 정리 ───────────────────────────────────────────────────────────
JUNK = ("주택정비형", "도시정비형", "주택재개발사업", "주택재건축정비사업", "재개발정비구역",
        "정비구역", "정비지구", "정비사업", "재개발", "재건축", "가로주택", "소규모",
        "(주)", "㈜", "일대", "일원", "번지")


def norm_name(s):
    """구역명 비교용 정규화 — 사업 유형·꼬리말·기호 제거."""
    s = (s or "").replace(" ", "")
    for junk in JUNK:
        s = s.replace(junk, "")
    return s.strip("()[]{}·-,")


def name_sim(a, b):
    return difflib.SequenceMatcher(None, norm_name(a), norm_name(b)).ratio()


def stage_label(code):
    return STAGE.get(code) or (code or "-")


PROGRESS_KEY = [
    ("준공", 90), ("입주", 88), ("사용승인", 86), ("착공", 80),
    ("관리처분", 70), ("사업시행", 60), ("사업계획승인", 58), ("건축심의", 55), ("건축허가", 54),
    ("조합설립인가", 45), ("조합설립추진", 40), ("조합설립인가 추진중", 38), ("추진위", 35),
    ("구역지정", 25), ("구역변경", 24), ("지구지정", 22), ("지구변경", 21),
]


def progress(label):
    for key, score in PROGRESS_KEY:
        if key in label:
            return score
    return 10


def shp_path(path):
    """디렉터리를 받으면 그 안의 .shp 하나를 찾고, .shp 경로면 그대로 쓴다."""
    if os.path.isdir(path):
        shps = sorted(f for f in os.listdir(path) if f.lower().endswith(".shp"))
        if not shps:
            raise SystemExit(f"shp 파일이 없습니다: {path}")
        return os.path.join(path, shps[0])
    return path


def load(path, with_meta=True):
    """SHP → 레코드 목록."""
    r = shapefile.Reader(shp_path(path), encoding="cp949")
    out = []
    for sr in r.iterShapeRecords():
        d = sr.record.as_dict()
        if not sr.shape.points:
            continue
        rings = ring_of(sr.shape)
        if not rings:
            continue
        total = sum(q[0] for q in rings)
        main = rings[0]
        area_notice = float(d.get("DGM_AR") or 0)
        sclass = (d.get("SCLAS_CL") or "").strip()
        stage = stage_label(d.get("PROPEL_CD"))
        rec = {
            "sid": d.get("PRESENT_SN"),
            "name": (d.get("DGM_NM") or "").strip(),
            "cls": sclass,
            "guCode": d.get("SIGNGU_SE"),
            "gu": GU.get(d.get("SIGNGU_SE"), d.get("SIGNGU_SE") or ""),
            "date": str(d.get("CREATE_DAT") or ""),
            "areaNotice": round(area_notice),
            "area": round(area_notice) if area_notice > 0 else round(float(d.get("SHAPE_AREA") or total)),
            "areaShape": round(total),
            "lat": sum(p[1] for p in main[1]) / len(main[1]),
            "lng": sum(p[0] for p in main[1]) / len(main[1]),
            "ll": main[1],
            # 주 링은 항상 유지 + 전체의 3% 이상이면서 300㎡ 이상인 부속 링만 남긴다
            "lls": [rings[0][1]] + [q[1] for q in rings[1:] if q[0] >= max(300, 0.03 * total)],
            "ringPts": len(main[1]),
        }
        if with_meta:
            rec.update({
                "kind": KIND.get(sclass, sclass or "기타"),
                "type": MAPTYPE.get(sclass, "일반재개발"),
                "stage": stage,
                "stageCode": d.get("PROPEL_CD") or "",
                "spec": SPEC.get(sclass, 0),
                "prog": progress(stage),
            })
        out.append(rec)
    return out


def dedup_by_sid(recs):
    by = {}
    for x in recs:
        k = x["sid"]
        if k not in by or (x["ringPts"], x["area"]) > (by[k]["ringPts"], by[k]["area"]):
            by[k] = x
    return list(by.values())


def dist_m(a, b):
    return math.hypot((a["lat"] - b["lat"]) * 111_000, (a["lng"] - b["lng"]) * 88_000)


def merge_same_zone(recs):
    """같은 구역의 여러 레코드(신통기획 후보지/재개발/재건축/재정비촉진구역)를 하나로 합친다.
    조건: 정규화 이름이 같고 중심거리 250m 이내. 또는 도형이 사실상 동일(중심 12m·면적 2%)."""
    ordered = sorted(recs, key=lambda x: (-x["prog"], -x["spec"], -x["ringPts"], -x["area"]))
    clusters = []
    for x in ordered:
        nx = norm_name(x["name"])
        hit = None
        for c in clusters:
            rep = c[0]
            d = dist_m(x, rep)
            if d > 400:
                continue
            same_name = nx != "" and nx == norm_name(rep["name"])
            same_shape = d < 12 and abs(x["areaShape"] - rep["areaShape"]) <= max(50, 0.02 * rep["areaShape"])
            if (d <= 250 and same_name) or same_shape:
                hit = c
                break
        if hit is None:
            clusters.append([x])
        else:
            hit.append(x)
    merged = []
    for c in clusters:
        rep = c[0]
        # 표시 이름: 같은 구역으로 묶인 이름 중 가장 서술적인(긴) 것
        name = max((m["name"] for m in c), key=lambda s: (len(s), s))
        rep = dict(rep)
        rep["name"] = name
        # 고시면적(DGM_AR)이 비어 있는 레코드만 같은 구역의 다른 레코드 값으로 채운다
        if not rep["areaNotice"]:
            notice = max((m["areaNotice"] for m in c), default=0)
            if notice:
                rep["area"] = notice
        rep["alts"] = sorted({m["sid"] for m in c})
        merged.append(rep)
    return merged


def match_detail(zone, detail, index):
    """같은 구역의 UQ181(의제처리구역) 레코드 찾기 — 중심거리·면적비·이름 유사도."""
    best, best_score = None, -9
    for c in index.near(zone["lat"], zone["lng"], 200):
        d = dist_m(zone, c)
        if d > 200:
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
    if best is None:
        return None
    if name_sim(zone["name"], best["name"]) < 0.25 and abs(best["area"] / zone["area"] - 1) > 0.2:
        return None
    return best


class Grid:
    """위경도 0.01° 격자 인덱스 — 후보 레코드만 비교하기 위한 것."""

    def __init__(self, recs):
        self.cells = {}
        self.recs = recs
        for r in recs:
            self.cells.setdefault(self.key(r["lat"], r["lng"]), []).append(r)

    @staticmethod
    def key(lat, lng):
        return (round(lat, 2), round(lng, 2))

    def near(self, lat, lng, radius_m):
        # 200m ≈ 위도 0.0018°, 경도 0.0023° → 인접 격자(±1)만 보면 충분
        out = []
        for dlat in (-0.01, 0, 0.01):
            for dlng in (-0.01, 0, 0.01):
                out.extend(self.cells.get(self.key(lat + dlat, lng + dlng), ()))
        return out


def pick_geometry(zone, detail, index):
    """두 소스의 '실제 굴곡량'을 같은 허용오차에서 비교해 더 상세한 도형을 고른다."""
    m = match_detail(zone, detail, index) if detail else None
    if m:
        c_base, c_det = complexity(zone["ll"]), complexity(m["ll"])
        if c_det >= c_base + 5 and c_det >= c_base * 1.3:
            return {
                "lls": m["lls"],
                "source": "UQ181",
                "sourceId": m["sid"],
                "sourceName": m["name"],
                "asOf": AS_OF_DETAIL,
                "gain": f"굴곡 {c_base}→{c_det}점(1.3m 기준)",
            }
    return {"lls": zone["lls"], "source": "UQ120", "sourceId": zone["sid"],
            "sourceName": zone["name"], "asOf": AS_OF, "gain": None}


def main():
    uq120_dir = sys.argv[1]
    uq181_dir = sys.argv[2] if len(sys.argv) > 2 else None
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    every20 = dedup_by_sid(load(uq120_dir, with_meta=True))
    by_id = {x["sid"]: x for x in every20}
    detail = dedup_by_sid(load(uq181_dir, with_meta=False)) if uq181_dir else []
    index = Grid(detail)
    print(f"UQ120 {len(every20)}레코드 · UQ181 {len(detail)}레코드")

    # ── 전수 후보: 정비사업 소분류 + 대표 구역 ──────────────────────────────
    featured_sids = {v[0] for v in FEATURED.values()}
    cand = [x for x in every20 if x["cls"] in INCLUDE or x["sid"] in featured_sids]
    print(f"정비사업 레코드 {len(cand)} → 중복 구역 병합 ", end="")
    zones = merge_same_zone(cand)
    print(f"{len(zones)}개 구역")

    # 병합 결과에 대표 구역 id를 붙인다
    feat_by_sid = {sid: zid for zid, (sid, _) in FEATURED.items()}
    for z in zones:
        z["featureId"] = next((feat_by_sid[s] for s in z["alts"] if s in feat_by_sid), None)
        z["featured"] = z["featureId"] is not None
        z["id"] = z["featureId"] or z["sid"]

    # ── GeoJSON/JSON 생성 ──────────────────────────────────────────────────
    features, featured_json = [], []
    upgraded = 0
    zones.sort(key=lambda x: (not x["featured"], x["gu"], x["name"]))
    for z in zones:
        g = pick_geometry(z, detail, index)
        tol, cap, digits = (TOL_FEATURED, CAP_FEATURED, 6) if z["featured"] else (TOL_CITY, CAP_CITY, 5)
        polys = [simplify(ll, tol, cap=cap, digits=digits) for ll in g["lls"]]
        polys = [p for p in polys if len(p) >= 3]
        if not polys:
            continue
        if g["source"] == "UQ181" and not z["featured"]:
            upgraded += 1
        z["geom"] = g["source"]
        z["asOf"] = AS_OF
        center = [round(sum(p[0] for p in polys[0]) / len(polys[0]), 6),
                  round(sum(p[1] for p in polys[0]) / len(polys[0]), 6)]
        z["polygon"] = polys[0]
        z["center"] = center
        if len(polys) > 1:
            z["parts"] = polys[1:]
        rings_ll = [[[[lng, lat] for lat, lng in (ring + [ring[0]] if ring[0] != ring[-1] else ring)]]
                    for ring in polys]
        geom = ({"type": "MultiPolygon", "coordinates": rings_ll} if len(polys) > 1
                else {"type": "Polygon", "coordinates": rings_ll[0]})

        features.append({
            "type": "Feature",
            "id": z["id"],
            "properties": {
                "id": z["id"],
                "name": z["name"],
                "type": z["type"],
                "kind": z["kind"],
                "stage": z["stage"],
                "gu": z["gu"],
                "area": z["area"],
                "featured": z["featured"],
                "sourceId": z["sid"],
                "geom": g["source"],
            },
            "geometry": geom,
        })

        if z["featured"]:
            featured_json.append({
                "id": z["id"], "sourceId": z["sid"], "name": z["name"],
                "area": z["area"], "shapeArea": z["areaShape"],
                "stage": z["stage"], "kind": z["kind"], "asOf": AS_OF,
                "center": center,
                "polygon": polys[0],
                **({"parts": polys[1:]} if len(polys) > 1 else {}),
                "geomSource": f"{g['source']}:{g['sourceId']}",
                "geomSourceName": g["sourceName"],
                "geomAsOf": g["asOf"],
            })

    json.dump(featured_json, open(f"{root}/src/data/zones-geo.json", "w"), ensure_ascii=False, indent=1)
    meta = {
        "source": "서울 열린데이터광장 OA-22712 서울시 도시계획사업 현황(서울플랜+)",
        "sourceDetail": "OA-20957 서울시 의제처리구역 위치정보(UQ181)",
        "asOf": AS_OF, "asOfDetail": AS_OF_DETAIL, "count": len(features),
    }
    fc = {
        "type": "FeatureCollection",
        "metadata": meta,
        "features": features,
    }
    # ── 공식 명칭·신규 후보지 보강 (지번 이름 → 공식 구역명, UQ120 미수록 2026 후보지) ──
    #    원천: 서울시 고시·정비사업 정보몽땅·자치구 공개자료 (scripts/data/official-supplement.json)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from official_supplement import apply_supplement  # noqa: E402
    seoul_list = [{k: v for k, v in z.items() if k not in ("ll", "lls", "lat", "lng", "alts")} for z in zones]
    supp_stats = apply_supplement(fc, seoul_list, meta)
    print(f"  공식 명칭 {supp_stats['renamed']}건 · 신규 후보지 {supp_stats['added']}건 보강")
    json.dump(meta, open(f"{root}/src/data/zones-meta.json", "w"), ensure_ascii=False, indent=1)
    json.dump(seoul_list, open(f"{root}/src/data/seoul-zones.json", "w"), ensure_ascii=False, separators=(",", ":"))
    out = f"{root}/public/data/zones.geojson"
    json.dump(fc, open(out, "w"), ensure_ascii=False, separators=(",", ":"))

    # ── 리포트 ────────────────────────────────────────────────────────────
    from collections import Counter
    ctype = Counter(f["properties"]["type"] for f in features)
    cgu = Counter(f["properties"]["gu"] for f in features)
    print(f"\n총 {len(features)}개 구역 · GeoJSON {os.path.getsize(out)/1024:.0f}KB")
    print("  유형:", ", ".join(f"{k} {v}" for k, v in ctype.most_common()))
    print(f"  경계를 UQ181 정밀 도형으로 교체: {upgraded}곳")
    print("  자치구:", ", ".join(f"{k} {v}" for k, v in sorted(cgu.items(), key=lambda x: -x[1])))
    print("  대표 구역:", ", ".join(f"{z['id']}({z['name']},{len(z['polygon'])}점)" for z in featured_json))
    missing = [zid for zid in FEATURED if zid not in {z["id"] for z in featured_json}]
    if missing:
        raise SystemExit(f"대표 구역 누락: {missing}")


if __name__ == "__main__":
    main()
