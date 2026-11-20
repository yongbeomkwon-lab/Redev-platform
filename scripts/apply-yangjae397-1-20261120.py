#!/usr/bin/env python3
"""
양재동 397-1번지 일대 모아통합기획 후보지(서초구) — 구역계 신규 반영 (2026-11-20)

· 원천: 서초구 「구역계_공개_안내문」(2026-11-19, 모아타운 게시판 글번호 15) 1쪽 구역계 도면.
  행정기관 부여 동의양식번호 '제1호'(2026-11-19) — 서울시 모아통합기획 도입 후 첫 연번부여.
  구역은 사업예정구역 2곳 + 가운데 종교부지(존치구역). 권리산정기준일 2025-12-15(기지정).
· 정합: 도면에 축척·방위 표시가 없어 지번 라벨 4점(394-10·395-10·396-2·398-3)을 카카오 지번 좌표와
  대조해 2.37px/m·회전 1.35°, 잔차 2.3m로 정합(이웃 필지 경계와 공개 구역면적 41,005㎡를 함께 만족하는 값). 경계 오차 ±5~10m 수준.
· 계측: 13정점, 40,610㎡ (재개발닷컴·정비닥터 집계 41,005㎡ 대비 -1.0%)

대상: 신규 구역 yangjae-397-1
실행: python3 scripts/apply-yangjae397-1-20261120.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
ZONE_ID = "yangjae-397-1"

NOTE = (
    "서울시가 2026년 도입한 모아통합기획(모아타운에 공공 계획지원을 결합, 착공까지 약 6년→4년 6개월)의 첫 "
    "동의서 번호부여 사례입니다. 서초구가 2026-11-19 (가칭)추진주체(윤경식) 요청으로 구역계를 공개하고 "
    "동의양식 번호 '제1호'를 부여했습니다. 구역은 사업예정구역 2곳과 가운데 종교부지(존치구역)로 구성되며, "
    "2025년 SH 참여 모아타운 공모 신청으로 주택 등 건축물의 분양받을 권리 산정 기준일이 2025-12-15로 이미 "
    "지정돼 있습니다(이 날짜 이후 지분을 쪼개 취득하면 분양 대상에서 제외될 수 있음). 후보지 요건은 면적 "
    "2만~10만㎡·노후도 50% 이상(2026-10-22 서울시 공고 제2026-3045호로 면적 하한이 1만㎡로 변경)이고, "
    "사업예정구역별로 토지등소유자 60%·토지면적 1/2 이상 동의가 필요합니다. 반대율이 토지등소유자 25% 또는 "
    "토지면적 1/3 이상이면 후보지에서 제외됩니다. 이 구역계는 신청인이 제출한 것으로 후보지 추천·자치구 협의 "
    "과정에서 진입도로 확보 등을 위해 조정될 수 있습니다."
)

AREA_NOTE = (
    "서초구 공고문에는 구역면적 표기가 없고 '약 4.1만㎡'로만 안내됩니다. 재개발닷컴·정비닥터 집계값은 "
    "41,005㎡(정비닥터 4.32만㎡ 표기도 있음)입니다. 도면 구역계를 옮긴 다각형의 계측 면적은 40,610㎡로 "
    "집계값 대비 -1.0%이며, 사업예정구역 2곳과 종교부지(존치구역)를 모두 포함한 바깥 구역계 기준입니다."
)

BOUNDARY_NOTE = (
    "서초구 「구역계_공개_안내문」(2026-11-19) 1쪽 구역계 도면의 빨간 실선 바깥 경계를 픽셀 단위로 옮겼습니다. "
    "도면에는 축척 막대와 방위 표시가 없어(지적편집도 캡처 위에 그린 도면), 도면 지번 라벨 4점"
    "(양재동 394-10·395-10·396-2·398-3)을 카카오 지번 좌표와 대조해 2.37px/m·회전 1.35°, 잔차 2.3m로 "
    "정합했습니다. 경계 오차는 ±5m 수준입니다. 사업예정구역 1·2를 가르는 안쪽 경계와 종교부지(존치구역) 경계는 "
    "도형에 넣지 않고 바깥 구역계만 반영했습니다."
)

SOURCES = [
    {
        "label": "서초구 모아타운 게시판 — 양재동 397-1번지 일대 모아통합기획 후보지 공모를 위한 동의서 번호부여 요청 구역 공개(2026-11-19, 첨부 구역계_공개_안내문.pdf)",
        "url": "https://www.seocho.go.kr/site/seocho/ex/bbs/View.do?pageIndex=1&pageUnit=10&cbIdx=467&bcIdx=412753",
    },
    {
        "label": "도시팩트 — 서울 '1호' 모아통합기획 연번 나왔다… 서초 양재동 397-1 일대, 동의서 징구 착수(2026-11-19)",
        "url": "https://cityfact.co.kr/news/248",
    },
    {
        "label": "재개발닷컴 — 서초구 양재동 397-1번지 일대 모아통합기획 후보지 공모 동의서 번호부여 요청 구역 공개(2026-11-19)",
        "url": "https://jaegebal.com/gnotices/sc-etc-2026-533170",
    },
]

PROPS = {
    "name": "양재동 397-1 일대(모아통합기획)",
    "alias": [
        "양재동 397-1",
        "양재동 397-1번지",
        "양재동 397-1번지 일대",
        "모아통합기획 1호",
        "모아통합기획 제1호",
        "양재동 397-1 모아타운",
        "서초 모아통합기획 1호",
    ],
    "type": "모아타운",
    "kind": "모아타운(모아통합기획)",
    "stage": "연번부여(2026-11-19, 모아통합기획 제1호)",
    "gu": "서초구",
    "area": 41005,
    "featured": False,
    "sourceId": "서초구 구역계 공개(2026-11-19) — 구역계_공개_안내문",
    "geom": "공고도면",
    "boundaryApprox": False,
    "center": [37.471962, 127.048729],
    "centerLabel": "서초구 공개 구역계 도면 중심",
    "note": NOTE,
    "areaNote": AREA_NOTE,
    "boundaryNote": BOUNDARY_NOTE,
    "sources": SOURCES,
    "selectedAt": "2026-11-19",
    "rightsDate": "2025-12-15",
    "asOf": "2026-11-20",
}

META_KEY = "yangjae3971Moa20261120"
META = {
    "asOf": "2026-11-20",
    "additions": 1,
    "polygons": 1,
    "points": 0,
    "note": (
        "양재동 397-1번지 일대 모아통합기획 후보지(서초구) 신규 반영 — 모아통합기획 동의서 번호부여 제1호(2026-11-19). "
        "서초구 공개 구역계 도면의 빨간 실선 바깥 경계를 옮긴 폴리곤(13정점, 계측 40,610㎡, 집계 41,005㎡). "
        "권리산정기준일 2025-12-15. 사업예정구역 2곳 + 종교부지(존치구역) 구조이며 도형은 바깥 구역계만."
    ),
}

POLYGON_LATLNG = [
    [37.472354, 127.047024], [37.470665, 127.049039], [37.471672, 127.050429], [37.472474, 127.049585],
    [37.472338, 127.049408], [37.472333, 127.049382], [37.472346, 127.049347], [37.472374, 127.049329],
    [37.472982, 127.048668], [37.473008, 127.048637], [37.472976, 127.048590], [37.472979, 127.048545],
    [37.473222, 127.048276]
]


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    if not feat:
        print("[실패] geojson에 구역 없음:", ZONE_ID)
        return 1
    geom = feat.get("geometry") or {}
    ok = (
        geom.get("type") == "Polygon"
        and len(geom["coordinates"][0]) == len(POLYGON_LATLNG) + 1
        and feat["properties"].get("geom") == PROPS["geom"]
        and feat["properties"].get("stage") == PROPS["stage"]
        and abs((feat["properties"].get("area") or 0) - PROPS["area"]) < 0.01
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson {feat['properties'].get('name')} "
          f"geometry={geom.get('type')} geom={feat['properties'].get('geom')} "
          f"stage={feat['properties'].get('stage')} area={feat['properties'].get('area')} "
          f"verts={len(geom.get('coordinates', [[[]]])[0])}")
    bad += 0 if ok else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    ok2 = bool(entry) and len(entry.get("polygon") or []) == len(POLYGON_LATLNG) and entry.get("geom") == PROPS["geom"]
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones.json polygon={len(entry.get('polygon') or []) if entry else 0} "
          f"geom={entry.get('geom') if entry else None}")
    bad += 0 if ok2 else 1

    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} "
          f"features={len(geo['features'])} batch={META_KEY in geo['metadata']}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    ring = [[lng, lat] for lat, lng in POLYGON_LATLNG]
    ring.append(ring[0])

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feat = next((f for f in geo["features"] if f["properties"].get("id") == ZONE_ID), None)
    if feat is None:
        feat = {"type": "Feature", "id": ZONE_ID, "properties": {}, "geometry": None}
        geo["features"].append(feat)
        print("[geojson] 새 feature 추가:", ZONE_ID)
    else:
        print("[geojson] 기존 feature 갱신:", ZONE_ID)
    feat["properties"] = {"id": ZONE_ID, **PROPS}
    feat["geometry"] = {"type": "Polygon", "coordinates": [ring]}
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] {ZONE_ID} — {len(ring) - 1}정점, features={len(geo['features'])}")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((z for z in src if z.get("id") == ZONE_ID), None)
    if entry is None:
        entry = {"id": ZONE_ID, "sid": PROPS["sourceId"]}
        src.append(entry)
        print("[seoul-zones] 새 구역 추가:", ZONE_ID)
    else:
        print("[seoul-zones] 기존 구역 갱신:", ZONE_ID)
    entry.update(PROPS)
    entry["sid"] = PROPS["sourceId"]
    entry["polygon"] = POLYGON_LATLNG
    entry.pop("parts", None)
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] {ZONE_ID} — {len(POLYGON_LATLNG)}정점, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
