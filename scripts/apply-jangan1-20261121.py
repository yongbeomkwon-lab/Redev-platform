#!/usr/bin/env python3
"""
장안1구역(동대문구 장안동 134-15번지 일대) 정비구역 지정 반영
 + 정비구역 안에 99.9~100% 겹친 가칭 가로주택 3곳 기본 숨김

근거(공식 고시·공공 데이터):
  · 서울특별시고시 제2026-334호(2026-06-11) 장안1구역 주택정비형 재개발사업 정비계획 결정 및
    정비구역 지정, 지구단위계획(구역) 결정 및 지형도면 고시
    (시행: 2026년 제1차 도시계획위원회 수권분과위원회 2026-02-06 수정가결)
  · 서울특별시 동대문구 고시(2026-03-19) 조합설립추진위원회 승인 (승인 03-16, 동의율 55.7%)
  · 정비사업 정보몽땅 사업개요 — 진행단계 '추진위원회승인', 면적 67,951.8㎡, 토지등소유자 553명
  · 서울 열린데이터광장 OA-22712 도시계획사업 현황(2026-09-10) — 가로주택 3곳 '조합설립인가 추진중'

원칙:
  · 값은 고시문·정보몽땅에서 확인한 것만 적는다(추정은 추정이라고 밝힌다).
  · 경계(도형)는 손대지 않는다 — 서울시 의제처리구역(UQ120) 실경계 그대로.
  · 정비구역 안에 들어간 가로주택(126-1·132-1·134-1)은 데이터를 남긴 채 hiddenByDefault 로
    지도에서만 뺀다(검색·주소 판정에는 그대로 사용).
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용:
  python3 scripts/apply-jangan1-20261121.py
  python3 scripts/apply-jangan1-20261121.py --check   # 변경 없이 현재 값만 확인
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(ROOT, "public", "data", "zones.geojson")
ZONES_JSON = os.path.join(ROOT, "src", "data", "seoul-zones.json")

AS_OF = "2026-11-21"
MAIN_ID = "11000UQ120PS202411014521"

AREA = 67951.8

AREA_NOTE = (
    "서울시 고시 제2026-334호 67,951.8㎡ / UQ120 도형 68,504.9㎡(좌표 단순 환산) · "
    "1,754세대(임대 233·기부채납 임대 55 포함, 기존 1,426세대 → 328세대 증가) · "
    "지하 2층~지상 36층(107m) · 건폐율 50% 이하 · 정비계획용적률 263%(법적상한 300%) · "
    "추정비례율 108.66% · 토지등소유자 553명"
)

BOUNDARY_NOTE = (
    "서울시 도시계획사업(서울플랜+ 2026-09-10) 실경계(UQ120). 고시 구역면적 67,951.8㎡와 "
    "도형 면적 68,504.9㎡(단순 환산)가 0.8%(약 553㎡) 차이 나지만, 고시 정비구역 결정도(붙임)의 "
    "구역 형상과 일치해 경계는 그대로 씁니다."
)

NOTE = (
    "동대문구 장안동 134-15번지 일대 67,951.8㎡의 주택정비형 재개발(신속통합기획)입니다. "
    "2023-05-30 서울시 신속통합기획 연번부여 → 2024년 후보지 선정 → 2025년 6월 말 신속통합기획 확정"
    "(서울시 2025-07-02 발표) → 2025-08-28 정비계획 결정·정비구역 지정(안) 공람(2025-09-04 정정공고) "
    "→ 2026-02-06 서울시 도시계획위원회 수권분과위원회 수정가결 → 2026-03-19 동대문구 조합설립추진위원회 "
    "승인 고시(승인 2026-03-16, 위원장 김영기·감사 김미화·추진위원 60명, 승인 당시 동의율 55.7%) → "
    "2026-06-11 서울시 고시 제2026-334호로 정비계획 결정·정비구역 지정, 지구단위계획(구역) 결정 및 "
    "지형도면 고시 순으로 진행됐습니다. "
    "정비계획은 지하 2층~지상 36층(107m) 아파트 1,754세대(임대 233세대·기부채납 임대 55세대 포함, "
    "기존 1,426세대에서 328세대 증가)이고, 건폐율 50% 이하·정비계획용적률 263%(법적상한 300%)·"
    "추정비례율 108.66%입니다(총수입 1조4,403억3,070만9,000원·총비용 9,448억2,160만5,000원·"
    "종전자산총액 4,560억1,399만7,000원). 획지① 57,046.8㎡는 공동주택, 획지② 466.0㎡"
    "(장안동 293-16)는 종교시설이고, 소공원 2,163.8㎡(장안동 126-14)·문화공원 3,722.4㎡"
    "(장안동 291-8)를 새로 만듭니다. 철거 후 신축 334동(공동주택 333·종교 1)이며 토지등소유자는 553명입니다. "
    "진행 상황은 정비사업 정보몽땅 기준 '추진위원회승인' 단계로, 2026-07-11 주민총회(현장 140명·"
    "서면 230명)를 열어 정비사업전문관리업자·설계자 선정을 진행했고 추진위원회는 제5차 회의"
    "(2026-11-03)까지 열렸습니다. 다음 단계는 조합설립인가입니다."
)

ALIASES = [
    "장안동 134-15 일대",
    "장안동 134-15번지 일대",
    "장안동 134-15",
    "장안동134-15",
    "장안1",
    "장안1구역",
    "장안1구역 주택정비형 재개발사업",
    "장안1구역 재개발",
    "신속통합기획 장안1",
]

SOURCES = [
    {
        "label": "서울특별시고시 제2026-334호(2026-06-11) — 장안1구역 주택정비형 재개발사업 정비계획 결정 및 정비구역 지정, 지구단위계획(구역) 결정 및 지형도면 고시 원문",
        "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11000TTC202608050004/%EC%A0%95%EB%B9%84%EA%B3%84%ED%9A%8D%20%EB%B0%8F%20%EC%A0%95%EB%B9%84%EA%B5%AC%EC%97%AD%20%EA%B2%B0%EC%A0%95%20%EA%B3%A0%EC%8B%9C%EB%AC%B8%28%EC%84%9C%EC%9A%B8%EC%8B%9C%EC%A0%9C2026-334%ED%98%B8%29.pdf",
    },
    {
        "label": "정비사업 정보몽땅 — 장안1구역 주택정비형 재개발사업 사업개요(진행단계 추진위원회승인, 면적 67,951.8㎡, 토지등소유자 553명)",
        "url": "https://cleanup.seoul.go.kr/cafe/mastr-cleanup-bsnsSumry/execute.do?cafeId=230900001475e86&div=sumry&stepSeCode=103",
    },
    {
        "label": "동대문구 고시(2026-03-19) — 장안1구역 주택정비형 재개발사업 조합설립추진위원회 승인 고시",
        "url": "https://www.jbdoctor.com/docs/18972",
    },
    {
        "label": "위클리한국주택경제신문 — 장안1구역, 최고 36층 1,754세대로 재탄생(2026-06-12)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=63693",
    },
    {
        "label": "서울 열린데이터광장 OA-22712 서울시 도시계획사업 현황(서울플랜+) 2026-09-10 기준 — 구역 단계·연번부여",
        "url": "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do",
    },
]

# ── 정비구역 안에 들어간 가로주택 (포함률은 아래 containment_report 가 도형으로 직접 계산) ─────
HIDDEN_IDS = [
    "11000UQ120PS202505310425",  # (가칭) 장안동 126-1번지 일대 가로주택정비사업 (9,425㎡)
    "11000UQ120PS202505310426",  # (가칭) 장안동 132-1 가로주택정비사업 (9,018㎡)
    "11000UQ120PS202505310424",  # (가칭) 장안동 134-1 가로주택정비사업 (7,838㎡)
]

HIDDEN_SOURCES = [
    {
        "label": "서울특별시고시 제2026-334호(2026-06-11) — 장안1구역 정비계획 결정·정비구역 지정 및 지형도면 고시 원문",
        "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11000TTC202608050004/%EC%A0%95%EB%B9%84%EA%B3%84%ED%9A%8D%20%EB%B0%8F%20%EC%A0%95%EB%B9%84%EA%B5%AC%EC%97%AD%20%EA%B2%B0%EC%A0%95%20%EA%B3%A0%EC%8B%9C%EB%AC%B8%28%EC%84%9C%EC%9A%B8%EC%8B%9C%EC%A0%9C2026-334%ED%98%B8%29.pdf",
    },
    {
        "label": "서울 열린데이터광장 OA-22712 서울시 도시계획사업 현황(서울플랜+) 2026-09-10 기준 — 조합설립인가 추진중",
        "url": "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do",
    },
]


def hidden_note(name, area, share):
    return (
        f"가로주택정비사업(가칭, {area:,}㎡) 구역입니다. 도형의 {share}가 2026-06-11 서울시 고시 "
        "제2026-334호로 지정된 장안1구역 주택정비형 재개발 정비구역 안에 들어갑니다. "
        "서울시 도시계획사업 현황(2026-09-10)에는 '조합설립인가 추진중'으로 올라 있고, 조합설립인가·"
        "사업시행인가 고시에 이른 기록이 없어 아직 사업시행자를 갖추지 못한 초기 추진 단계입니다. "
        "장안1구역 정비계획(1,754세대)에 포함돼 같은 곳이 두 사업으로 겹쳐 보이므로, 지도에서는 "
        "장안1구역 한 구역으로 보이도록 기본 숨김 처리하고 검색·주소 판정에는 그대로 씁니다."
    )


METADATA_KEY = "jangan1_20261121"
METADATA = {
    "asOf": AS_OF,
    "zoneId": MAIN_ID,
    "name": "장안1구역",
    "stage": "추진위구성",
    "hidden": HIDDEN_IDS,
    "note": (
        "서울시 고시 제2026-334호(2026-06-11) 반영 — '장안동 134-15 일대'(신통기획·기획완료)를 "
        "'장안1구역' 추진위구성 단계로 올리고 67,951.8㎡·1,754세대·36층·용적률 263%(법적상한 300%)·"
        "추정비례율 108.66%·소유자 553명을 고시문으로 보강. 정비구역에 99.9~100% 포함된 가로주택 "
        "3곳은 데이터를 남긴 채 기본 숨김(장안1구역 한 구역으로 표시). 경계(도형)는 변경 없음."
    ),
}


def outer_ring(feat):
    """구역 외곽 링을 [[lng,lat], ...] 로 — properties.polygon(JSON) 또는 geometry(GeoJSON)"""
    props = feat["properties"]
    if props.get("polygon"):
        return [[p[0], p[1]] for p in props["polygon"]]
    geom = feat.get("geometry") or {}
    if not geom.get("coordinates"):
        return None
    coords = geom["coordinates"]
    ring = coords[0] if geom["type"] == "Polygon" else coords[0][0]
    return [[p[0], p[1]] for p in ring]


def ring_area_m2(ring):
    lat0 = sum(p[1] for p in ring) / len(ring)
    mx = 111320 * math.cos(math.radians(lat0))
    my = 110574
    pts = [(p[0] * mx, p[1] * my) for p in ring]
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def overlap_share(base_ring, ring):
    """shapely 있으면 면적 기준 포함률, 없으면 정점 포함률"""
    try:
        from shapely.geometry import Polygon

        b = Polygon(base_ring).buffer(0)
        g = Polygon(ring).buffer(0)
        return g.intersection(b).area / g.area
    except Exception:
        inside = 0
        for lng, lat in ring:
            if point_in_ring(lat, lng, [(p[1], p[0]) for p in base_ring]):
                inside += 1
        return inside / len(ring)


def point_in_ring(lat, lng, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (xi > lng) != (xj > lng):
            y = (yj - yi) * (lng - xi) / (xj - xi) + yi
            if lat < y:
                inside = not inside
        j = i
    return inside


def main():
    check_only = "--check" in sys.argv

    with open(GEOJSON, encoding="utf-8") as fp:
        fc = json.load(fp)
    with open(ZONES_JSON, encoding="utf-8") as fp:
        zones = json.load(fp)

    feats = {f["properties"].get("id"): f for f in fc["features"]}
    if MAIN_ID not in feats:
        raise SystemExit(f"zone not found: {MAIN_ID}")
    base = feats[MAIN_ID]
    base_ring = outer_ring(base)

    p = base["properties"]
    print(f"[before] {p.get('name')} | {p.get('stage')} | {p.get('type')} | area {p.get('area')}")
    print(f"  geom  : {len(base_ring) if base_ring else 0}pts, {ring_area_m2(base_ring):,.1f}㎡ (단순 환산)")

    if check_only:
        print(f"  stage → 추진위구성 ? {p.get('stage') == '추진위구성'}")
        print(f"  name  → 장안1구역 ? {p.get('name') == '장안1구역'}")
        for zid in HIDDEN_IDS:
            f = feats.get(zid)
            print(f"  {zid} hiddenByDefault={f['properties'].get('hiddenByDefault') if f else 'MISSING'}")
        return

    key_before = {k: json.dumps(p.get(k), ensure_ascii=False, sort_keys=True)
                  for k in ("name", "stage", "area", "areaNote", "boundaryNote", "note", "alias", "sources", "asOf")}

    # 1) 장안1구역 상향·보강
    p["name"] = "장안1구역"
    p["stage"] = "추진위구성"
    p["area"] = AREA
    p["areaNote"] = AREA_NOTE
    p["boundaryNote"] = BOUNDARY_NOTE
    p["note"] = NOTE
    p["sources"] = SOURCES
    p["asOf"] = AS_OF
    alias = list(p.get("alias") or [])
    for a in ALIASES:
        if a not in alias:
            alias.append(a)
    p["alias"] = alias

    key_after = {k: json.dumps(p.get(k), ensure_ascii=False, sort_keys=True) for k in key_before}
    changed_main = key_before != key_after

    # 2) 정비구역 안에 99.9~100% 겹치는 가로주택 3곳 기본 숨김
    for zid in HIDDEN_IDS:
        f = feats.get(zid)
        if f is None:
            print(f"[WARN] hidden target not found: {zid}")
            continue
        hp = f["properties"]
        ring = outer_ring(f)
        share = overlap_share(base_ring, ring) * 100
        share_txt = f"{share:.1f}%" if share < 99.99 else "100%"
        hp["hiddenByDefault"] = True
        hp["note"] = hidden_note(hp.get("name", ""), int(hp.get("area") or 0), share_txt)
        hp["sources"] = HIDDEN_SOURCES
        print(f"  hidden: {hp.get('name')} ({zid}) 포함률 {share_txt}")

    meta = fc.setdefault("metadata", {})
    meta[METADATA_KEY] = METADATA
    meta["count"] = len(fc["features"])

    with open(GEOJSON, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, separators=(",", ":"))

    # 3) 원천(src/data/seoul-zones.json)도 같은 값으로 — 나중에 geojson 을 다시 내보내도 유지
    by_id = {z.get("id"): z for z in zones}
    z = by_id.get(MAIN_ID)
    if z is None:
        print(f"[WARN] seoul-zones.json 에 {MAIN_ID} 없음")
    else:
        z["name"] = "장안1구역"
        z["stage"] = "추진위구성"
        z["area"] = AREA
        z["areaNote"] = AREA_NOTE
        z["boundaryNote"] = BOUNDARY_NOTE
        z["note"] = NOTE
        z["sources"] = SOURCES
        z["asOf"] = AS_OF
        za = list(z.get("alias") or [])
        for a in ALIASES:
            if a not in za:
                za.append(a)
        z["alias"] = za
    for zid in HIDDEN_IDS:
        zz = by_id.get(zid)
        if zz is None:
            continue
        f = feats.get(zid)
        share = overlap_share(base_ring, outer_ring(f)) * 100 if f else 100.0
        zz["hiddenByDefault"] = True
        zz["note"] = hidden_note(zz.get("name", ""), int(zz.get("area") or 0),
                                 f"{share:.1f}%" if share < 99.99 else "100%")
        zz["sources"] = HIDDEN_SOURCES

    with open(ZONES_JSON, "w", encoding="utf-8") as fp:
        json.dump(zones, fp, ensure_ascii=False, separators=(",", ":"))

    # 4) 결과
    print("[after] " + p["name"])
    print(f"  stage      : {p['stage']}")
    print(f"  area       : {p['area']}")
    print(f"  areaNote   : {p['areaNote']}")
    print(f"  alias      : {p['alias']}")
    print(f"  sources    : {len(p['sources'])}건")
    hidden_now = [f["properties"]["name"] for f in fc["features"] if f["properties"].get("hiddenByDefault")]
    print(f"  hiddenByDefault 총 {len(hidden_now)}곳: {hidden_now}")
    print("changed" if changed_main else "unchanged (already applied)")


if __name__ == "__main__":
    main()
