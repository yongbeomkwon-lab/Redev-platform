#!/usr/bin/env python3
"""
장위11(돌곶이·상월곡역세권 장기전세주택) 사업시행자 지정 반영 + 안쪽 가로주택 정리
 — 2026-11-05 서울특별시 성북구 고시 제2026-160호(대신자산신탁 지정개발자 지정,
   조합설립추진위원회 구성승인 취소)와 2026-05-14 서울시 고시 제2026-267호(정비구역 지정)를
   zones.geojson / seoul-zones.json 에 얹는다.

원칙:
  · 값은 공식 고시문(성북구청 고시공고·서울시 고시)과 서울시 보도자료로 확인한 것만 적는다.
  · 경계(도형)는 손대지 않는다 — 서울시 의제처리구역(UQ181) 실경계 그대로.
  · 정비구역 안에 완전·대부분 들어간 가로주택(상월곡1·2, 장위11-5·11)은 사업시행구역 지정·
    조합설립인가 고시가 없어(서울플랜+ 2026-09-10 연번부여, 성북구 추진현황에 없음) 별도 사업으로
    보이지 않게 hiddenByDefault 로 지도에서만 뺀다. 데이터는 남겨 검색·주소 판정에 쓴다.
  · 같은 값을 다시 넣어도 결과가 같다(멱등).

사용:
  python3 scripts/apply-jangwi11-20261121.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON = os.path.join(ROOT, "public", "data", "zones.geojson")
ZONES_JSON = os.path.join(ROOT, "src", "data", "seoul-zones.json")

AS_OF = "2026-11-21"
MAIN_ID = "jangwi-11-yeoksegwon"

AREA = 94411.1
AREA_NOTE = (
    "서울시 고시 제2026-267호 94,411.1㎡ / UQ181 도형 94,410.8㎡ · "
    "2,617세대(장기전세 565·임대 224) · 지하 4층~지상 45층 23개동 · 사업기간 2026-11~2034-11"
)

NOTE = (
    "성북구 장위동 66-300번지 일대 94,411.1㎡의 도시정비형 재개발(역세권 장기전세주택)입니다. "
    "옛 장위11구역이 2017-03-30 장위재정비촉진지구에서 해제됐다가 2026-05-14 서울시 고시 제2026-267호로 "
    "정비계획 결정·정비구역 지정됐고(지하 4층~지상 45층 23개동, 2,617세대 — 장기전세 565·임대 224), "
    "2026-11-05 성북구 고시 제2026-160호로 대신자산신탁 주식회사가 지정개발자(사업시행자)로 지정됐습니다. "
    "같은 고시로 도시정비법 제27조제5항에 따라 2026-01-07 승인된 조합설립추진위원회 구성승인은 "
    "2026-11-06자로 취소된 것으로 봅니다. 사업기간은 2026년 11월~2034년 11월(준공 예정 2034-11), "
    "토지등소유자 804명, 추정비례율 103.68%, 계획용적률 406.3%(법적상한 410.3%)입니다. "
    "추진위는 2026년 12월 초 전체회의로 정비사업 위원회를 구성하고 2027년 상반기까지 시공자 선정과 "
    "통합심의를 마치겠다고 밝혔습니다(2026-10 보도 기준). 경계는 서울시 의제처리구역(UQ181) 실경계입니다."
)

ALIASES = [
    "돌곶이·상월곡역세권",
    "장위11 재개발",
    "장위11구역 장기전세",
    "대신자산신탁",
]

SOURCES = [
    {
        "label": "성북구청 고시공고 — 서울특별시 성북구 고시 제2026-160호(2026-11-05) 돌곶이·상월곡역세권 장기전세주택 도시정비형 재개발사업(장위11) 사업시행자 지정 및 조합설립추진위원회 구성승인 취소 고시",
        "url": "https://www.sb.go.kr/www/selectEminwonView.do?key=6920&notAncmtMgtNo=45071&notAncmtSeCode=",
    },
    {
        "label": "서울시 고시 제2026-267호(2026-05-14) 정비계획 결정·정비구역 지정 및 지형도면 고시 원문",
        "url": "https://jaegebal.com/gnotices/seoul-gs-2026-267",
    },
    {
        "label": "서울 열린데이터광장 OA-20957 — 서울시 의제처리구역 위치정보(UQ181, 정비구역 실경계)",
        "url": "https://data.seoul.go.kr/dataList/OA-20957/S/1/datasetView.do",
    },
    {
        "label": "토지이음 고시정보 — 서울특별시 고시 원문 검색",
        "url": "https://www.eum.go.kr/web/gs/gv/gvGosiList.jsp",
    },
]

# ── 정비구역 안에 들어간 가로주택 ────────────────────────────────────────────
#   inside_pct 는 이 스크립트가 도형으로 직접 계산해 출력한다(아래 containment_report).
HIDDEN = {
    "11000UQ120PS202505310721": {
        "name": "상월곡1구역",
        "note": (
            "가로주택정비사업 연번부여(조합설립인가 추진중) 단계에 머문 구역입니다. "
            "도형 전체가 2026-05-14 서울시 고시 제2026-267호로 지정된 돌곶이·상월곡역세권(장위11) "
            "정비구역 안에 들어갑니다. 서울시 도시계획사업 현황(2026-09-10)에도 연번부여로 남아 있고 "
            "성북구 가로주택정비사업 추진현황(조합설립인가 이상)에 없어, 별도 가로주택 사업으로 "
            "진행되지 않습니다. 지도에서는 장위11 한 구역으로 보이도록 기본 숨김 처리하고 "
            "검색·주소 판정에는 그대로 씁니다."
        ),
    },
    "11000UQ120PS202505310723": {
        "name": "상월곡 2구역",
        "note": (
            "가로주택정비사업 연번부여(조합설립인가 추진중) 단계에 머문 구역입니다. "
            "도형 전체가 2026-05-14 서울시 고시 제2026-267호로 지정된 돌곶이·상월곡역세권(장위11) "
            "정비구역 안에 들어갑니다. 서울시 도시계획사업 현황(2026-09-10)에도 연번부여로 남아 있고 "
            "성북구 가로주택정비사업 추진현황(조합설립인가 이상)에 없어, 별도 가로주택 사업으로 "
            "진행되지 않습니다. 지도에서는 장위11 한 구역으로 보이도록 기본 숨김 처리하고 "
            "검색·주소 판정에는 그대로 씁니다."
        ),
    },
    "11000UQ120PS202505310735": {
        "name": "장위11-5구역",
        "note": (
            "가로주택정비사업 연번부여(조합설립인가 추진중) 단계에 머문 구역입니다. "
            "도형 전체가 2026-05-14 서울시 고시 제2026-267호로 지정된 돌곶이·상월곡역세권(장위11) "
            "정비구역 안에 들어갑니다. 서울시 도시계획사업 현황(2026-09-10)에도 연번부여로 남아 있고 "
            "성북구 가로주택정비사업 추진현황(조합설립인가 이상)에 없어, 별도 가로주택 사업으로 "
            "진행되지 않습니다. 지도에서는 장위11 한 구역으로 보이도록 기본 숨김 처리하고 "
            "검색·주소 판정에는 그대로 씁니다."
        ),
    },
    "11000UQ120PS202505310737": {
        "name": "장위11-11구역",
        "note": (
            "가로주택정비사업 연번부여(조합설립인가 추진중) 단계에 머문 구역입니다. 도형의 약 70%"
            "(면적 환산 약 6,300㎡)가 2026-05-14 서울시 고시 제2026-267호로 지정된 "
            "돌곶이·상월곡역세권(장위11) 정비구역 안에 들어가고 나머지는 구역 밖에 남습니다. "
            "서울시 도시계획사업 현황(2026-09-10)에도 연번부여로 남아 있고 성북구 "
            "가로주택정비사업 추진현황(조합설립인가 이상)에 없어, 별도 가로주택 사업으로 "
            "진행되지 않습니다. 지도에서는 장위11 한 구역으로 보이도록 기본 숨김 처리하고 "
            "검색·주소 판정에는 그대로 씁니다."
        ),
    },
}

HIDDEN_SOURCES = [
    {
        "label": "서울시 고시 제2026-267호(2026-05-14) 정비계획 결정·정비구역 지정 및 지형도면 고시 원문",
        "url": "https://jaegebal.com/gnotices/seoul-gs-2026-267",
    },
    {
        "label": "성북구청 가로주택정비사업 추진현황 — 조합설립인가 이상 사업 목록(상월곡1·2, 장위11-5·11 없음)",
        "url": "https://www.sb.go.kr/www/contents.do?key=6461",
    },
    {
        "label": "서울 열린데이터광장 OA-22712 서울시 도시계획사업 현황(서울플랜+) 2026-09-10 기준 — 연번부여",
        "url": "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do",
    },
]

METADATA_KEY = "jangwi11"
METADATA = {
    "asOf": AS_OF,
    "zoneId": MAIN_ID,
    "stage": "사업시행자지정",
    "hidden": sorted(HIDDEN.keys()),
    "note": (
        "성북구 고시 제2026-160호(2026-11-05) 반영 — 장위11을 사업시행자지정(대신자산신탁) 단계로 올리고 "
        "2,617세대·사업기간·출처를 보강. 정비구역에 완전·대부분 포함된 가로주택 4곳은 데이터를 남긴 채 "
        "기본 숨김(장위11 한 구역으로 표시). 경계(도형)는 변경 없음."
    ),
}


def point_in_ring(lat, lng, ring):
    """ray casting — ring 은 [[lat,lng], ...]"""
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


def outer_ring(feat):
    """구역 외곽 링을 [[lat,lng], ...] 로 — properties.polygon(JSON) 또는 geometry(GeoJSON)"""
    props = feat["properties"]
    if props.get("polygon"):
        return props["polygon"]
    geom = feat.get("geometry") or {}
    if not geom.get("coordinates"):
        return None
    coords = geom["coordinates"]
    ring = coords[0] if geom["type"] == "Polygon" else coords[0][0]
    return [(lat, lng) for lng, lat in ring]


def containment_report(base_feat, feat):
    ring = outer_ring(base_feat)
    pts = outer_ring(feat)
    if not ring or not pts:
        return 0, 0
    hit = sum(1 for lat, lng in pts if point_in_ring(lat, lng, ring))
    return hit, len(pts)


def main():
    with open(GEOJSON, encoding="utf-8") as fp:
        fc = json.load(fp)
    with open(ZONES_JSON, encoding="utf-8") as fp:
        zones = json.load(fp)

    feats = {f["properties"].get("id"): f for f in fc["features"]}
    if MAIN_ID not in feats:
        raise SystemExit(f"zone not found: {MAIN_ID}")
    base = feats[MAIN_ID]

    changed_any = False

    # 1) 장위11 본구역 단계·제원 업데이트
    p = base["properties"]
    before = {k: p.get(k) for k in ("stage", "area", "areaNote", "note", "alias", "sources")}
    p["stage"] = "사업시행자지정"
    p["area"] = AREA
    p["areaNote"] = AREA_NOTE
    p["note"] = NOTE
    p["sources"] = SOURCES
    alias = list(p.get("alias") or [])
    for a in ALIASES:
        if a not in alias:
            alias.append(a)
    p["alias"] = alias
    changed_any |= before != {k: p.get(k) for k in before}

    # 2) 정비구역에 흡수된 가로주택 기본 숨김
    for zid, spec in HIDDEN.items():
        f = feats.get(zid)
        if f is None:
            print(f"[WARN] hidden target not found: {zid} ({spec['name']})")
            continue
        hp = f["properties"]
        rep = containment_report(base, f)
        hp["hiddenByDefault"] = True
        hp["note"] = spec["note"]
        hp["sources"] = HIDDEN_SOURCES
        print(f"  hidden: {spec['name']} ({zid}) inside-points={rep[0]}/{rep[1] if rep else '-'}")

    # metadata
    meta = fc.setdefault("metadata", {})
    meta[METADATA_KEY] = METADATA
    meta["count"] = len(fc["features"])

    with open(GEOJSON, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, separators=(",", ":"))

    # 3) 원천(src/data/seoul-zones.json)도 같은 값으로 맞춘다 — 나중에 geojson 을 다시 내보내도 유지
    by_id = {z.get("id"): z for z in zones}
    z = by_id.get(MAIN_ID)
    if z is None:
        print(f"[WARN] seoul-zones.json 에 {MAIN_ID} 없음")
    else:
        z["stage"] = "사업시행자지정"
        z["area"] = AREA
        z["areaNote"] = AREA_NOTE
        z["note"] = NOTE
        z["sources"] = SOURCES
        za = list(z.get("alias") or [])
        for a in ALIASES:
            if a not in za:
                za.append(a)
        z["alias"] = za
        z["asOf"] = AS_OF
    for zid, spec in HIDDEN.items():
        zz = by_id.get(zid)
        if zz is None:
            continue
        zz["hiddenByDefault"] = True
        zz["note"] = spec["note"]
        zz["sources"] = HIDDEN_SOURCES

    with open(ZONES_JSON, "w", encoding="utf-8") as fp:
        json.dump(zones, fp, ensure_ascii=False, separators=(",", ":"))

    # 4) 결과 출력
    print("[after] " + p["name"])
    print(f"  stage      : {p['stage']}")
    print(f"  area       : {p['area']}")
    print(f"  areaNote   : {p['areaNote']}")
    print(f"  alias      : {p['alias']}")
    print(f"  sources    : {len(p['sources'])}건")
    print(f"  note       : {p['note'][:90]}…")
    hidden_now = [f["properties"]["name"] for f in fc["features"] if f["properties"].get("hiddenByDefault")]
    print(f"  hiddenByDefault 총 {len(hidden_now)}곳: {hidden_now}")
    print("changed" if changed_any else "unchanged (already applied)")


if __name__ == "__main__":
    main()
