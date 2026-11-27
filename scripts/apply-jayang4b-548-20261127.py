#!/usr/bin/env python3
"""리디브 — 광진구 자양4동B(자양동 858번지 일대) 경계 반영 + 지주택 자양동 548 등록 + 자양4동A 유형 정정 (2026-11-27)

## 무엇
  1) `rest17gu-jayang4b` — 그동안 geom "미고시"(대표 점)이던 자양4동B에 **실경계**를 넣는다.
     광진구 공고(2026-08-11) 첨부 「자양4동 858번지 일대 동의서 번호부여 요청 구역 공개」 도면의
     붉은 구역선을 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립했다.
       · 도면은 812×637px 저해상 스캔이라 면적(58,680.1㎡)으로 축척 0.9230 m/px 을 정하고,
         회전 9.8°·위치를 필지선 거리변환장 격자 탐색으로 잡았다(선 위 6m 간격 표본 평균 오차 2.16m).
       · 같은 변환으로 도면의 **지적선 전체**를 브이월드 필지선 위에 겹쳐 확인 — 필지 하나하나가
         겹쳐 그려져 정합이 맞음을 확인했다(임시 파일 warp_check.png).
       · 구역선을 필지 꼭짓점에 스냅하고 변 위의 필지 꼭짓점을 끼워 넣어 도형 면적 58,364.3㎡
         (공고의 99.5%). 둘레 도로 필지는 도형에서 뺐다.
       · 서쪽 자양1의4구역 가로주택정비사업과 겹치는 면적은 0㎡.
  2) `jayang-548` 신규 — 광진구 공고 제2026-1399호(2026-11-05, 서울시보 제4191호) 「자양동 548번지 일대
     지구단위계획구역 지정 및 지구단위계획 결정(안) 열람공고」. 지역주택조합(지주택) 구역,
     면적 34,373.9㎡. 결정도는 구청 열람도서에만 있어 확보하지 못했으므로 geom "미고시"(대표 점)로 등록.
  3) `11000UQ120PS202601310048`(자양4동A구역) — 신속통합기획 후보지로 선정돼 정비구역 지정된 구역인데
     유형이 '일반재개발'로 남아 있어 type 신통기획·kind 신속통합기획(재개발)로 바로잡는다.

실행: python3 scripts/apply-jayang4b-548-20261127.py [--check]
"""
from __future__ import annotations

import json
import subprocess
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "jayang4b-20261127.json"

ZONE_ID = "rest17gu-jayang4b"
NEW_ID = "jayang-548"
A_TYPE_ID = "11000UQ120PS202601310048"
META_KEY = "jayang4b548_20261127"
AS_OF = "2026-11-27"

NOTE_4B = (
    "광진구가 2026-08-11 자양동 858번지 일대에 동의서 번호를 부여하며 구역계를 공개한 신속통합기획 신청 구역입니다"
    "(58,680.1㎡). 공고문에 적힌 대로 이 구역계는 신청인이 제출한 것이고, 광진구가 시에 후보지로 추천하는 과정에서 "
    "일부 변경·조정될 수 있습니다. 남쪽으로 지주택 자양동 548(지구단위계획구역 지정 열람)과 맞닿고, 서쪽으로 "
    "자양1의4구역 가로주택정비사업(가로 자양4)이 있습니다. 자양4동A구역(자양동 57-90번지 일대, 구역지정)과는 "
    "별개 구역입니다."
)
AREA_NOTE_4B = (
    "공고 면적 58,680.1㎡(약 17,751평) — 광진구 공고(2026-08-11) 구역계 표 기준. 지도 도형 면적은 58,364.3㎡로 "
    "공고의 99.5%이며, 차이는 신청인 구역선이 도로 필지를 밟고 지나가는 자리를 도로 쪽에서 잘라냈기 때문입니다."
)
BOUNDARY_NOTE_4B = (
    "광진구 공고(2026-08-11) 첨부 「자양4동 858번지 일대 동의서 번호부여 요청 구역 공개」 도면의 붉은 구역선을 "
    "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지선에 맞춰 조립한 경계입니다. 저해상(812×637px) 스캔이라 축척을 "
    "공고 면적(58,680.1㎡)으로 정하고(0.923 m/px), 도면 회전 9.8°와 위치를 필지선에 맞춰 잡았습니다(구역선 위 "
    "6m 간격 표본의 필지선까지 평균 거리 2.2m). 같은 변환으로 도면의 지적선 전체를 브이월드 필지선 위에 겹쳐 "
    "필지가 하나하나 맞는 것을 확인한 뒤, 구역선을 필지 꼭짓점에 붙이고 변 위의 필지 꼭짓점을 끼워 넣었습니다. "
    "둘레 도로(뚝섬로·능동로 일대) 필지는 도형에서 빼 도로를 덮지 않습니다. 서쪽 자양1의4구역 가로주택정비사업과 "
    "겹치는 면적은 0㎡입니다. 후보지 추천·구역계 고시 전이라 실제 경계는 달라질 수 있습니다."
)
SOURCES_4B = [
    {
        "label": "광진구 공고(2026-08-11) 「신속통합기획 후보지 신청 동의양식 번호 부여 알림(자양4동 858번지 일대)」",
        "url": "https://www.gwangjin.go.kr/portal/bbs/B0000001/view.do?nttId=6620384&menuNo=200190",
    },
    {
        "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계·지목(도로 필지 구분)",
        "url": "https://www.vworld.kr",
    },
]

NOTE_548 = (
    "자양동 548번지 일대 공동주택 건립을 위한 지구단위계획구역입니다. 리버시티자양지역주택조합이 추진하는 "
    "지역주택조합 사업으로, 광진구가 2026-11-05 공고 제2026-1399호로 지구단위계획구역 지정 및 지구단위계획 "
    "결정(안) 열람공고를 냈고 열람기간은 2026-11-05~11-19였습니다(서울시보 제4191호). 2021-08-26 공고 "
    "제2021-895호 열람공고에 이은 두 번째 열람공고로, 아직 구역 지정 고시 전입니다. 공고에 적힌 구역면적은 "
    "34,373.9㎡이고 위치는 자양동 548번지 일대(공고상 주소 자양동 553-401)입니다."
)
AREA_NOTE_548 = (
    "공고 면적 34,373.9㎡(약 10,398평) — 광진구 공고 제2026-1399호 지구단위계획구역 결정조서(증) 기준. "
    "결정 전 열람안이라 결정 과정에서 바뀔 수 있습니다."
)
BOUNDARY_NOTE_548 = (
    "공고문에는 구역면적과 위치만 실려 있고 결정도는 광진구청 열람도서(도시계획과)에만 비치되어 있어 도면을 "
    "확보하지 못했습니다. 그래서 지도에는 공고에 적힌 위치(자양동 553-401)를 대표 지점으로만 표시하고 경계는 "
    "그리지 않았습니다. 구역 지정 고시와 지형도면이 나오면 연속지적도 필지선에 맞춰 경계를 넣겠습니다."
)
SOURCES_548 = [
    {
        "label": "광진구 공고 제2026-1399호 「광진구 자양동 548번지 일대 지구단위계획구역 지정 및 지구단위계획 결정(안) 열람공고」(2026-11-05, 서울시보 제4191호)",
        "url": "https://news.seoul.go.kr/citybuild/archives/543946",
    },
    {
        "label": "토지이음 — 주민의견청취 공람(2026-11-05~2026-11-19)",
        "url": "https://www.eum.go.kr/web/cp/hr/hrPeopleHearDet.jsp?seq=5969",
    },
]


def build_4b(z, spec):
    out = dict(z)
    out["name"] = "자양4동B"
    out["alias"] = ["자양동 858", "자양동858", "(가칭)자양동 858번지 일대", "자양동 858번지 일대",
                    "자양4동B", "자양4B", "자양4동 B구역"]
    out["type"] = "신통기획"
    out["kind"] = "신속통합기획"
    out["stage"] = "연번부여(2026-08-11)"
    out["gu"] = "광진구"
    out["area"] = 58680.1
    out["areaShape"] = spec["areaShape"]
    out["geom"] = "필지정합"
    out["boundaryApprox"] = True
    out["center"] = spec["center"]
    out["centerLabel"] = "자양동 858번지 일대 — 뚝섬로 동측·능동로 서측"
    out["selectedAt"] = "2026-08-11"
    out["note"] = NOTE_4B
    out["areaNote"] = AREA_NOTE_4B
    out["boundaryNote"] = BOUNDARY_NOTE_4B
    out["sources"] = SOURCES_4B
    out["drawing"] = "downloads/구역도면_동부5구/6620384_구역공개_자양4동_858.pdf"
    out["sid"] = "광진구 공고(2026-08-11) 첨부 도면 · 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 대조"
    out["asOf"] = AS_OF
    out["polygon"] = [list(p) for p in spec["ring"]]
    return out


NEW_548 = {
    "id": NEW_ID,
    "name": "자양동 548",
    "alias": ["자양동548", "자양동 548번지 일대", "지주택 자양동 548", "리버시티자양", "리버시티 자양",
              "자양동 553-401", "자양548"],
    "type": "지주택",
    "kind": "지역주택조합(지구단위계획구역)",
    "stage": "구역지정(공람)",
    "gu": "광진구",
    "area": 34373.9,
    "featured": False,
    "geom": "미고시",
    "center": [37.537046, 127.067097],
    "centerLabel": "공고 위치 자양동 553-401 — 능동로9길·뚝섬로31가길 사이",
    "selectedAt": "2026-11-05",
    "note": NOTE_548,
    "areaNote": AREA_NOTE_548,
    "boundaryNote": BOUNDARY_NOTE_548,
    "sources": SOURCES_548,
    "sid": "광진구 공고 제2026-1399호(2026-11-05, 서울시보 제4191호) · 토지이음 주민의견청취 공람",
    "asOf": AS_OF,
}


def load():
    return (
        json.loads(DATA.read_text(encoding="utf-8")),
        json.loads(SOURCE.read_text(encoding="utf-8")),
        json.loads(GEOJSON.read_text(encoding="utf-8")),
        json.loads(INDEX.read_text(encoding="utf-8")),
        json.loads(META.read_text(encoding="utf-8")),
    )


def check() -> bool:
    spec, zones, geo, index, meta = load()
    by_id = {z["id"]: z for z in zones}
    ok = True
    z = by_id.get(ZONE_ID)
    ring = [list(p) for p in spec["ring"]]
    same = bool(z) and z.get("polygon") == ring and z.get("geom") == "필지정합"
    print(("OK  " if same else "FAIL"), f"{ZONE_ID} polygon·geom 필지정합", "pts=", len(ring))
    ok &= same
    z5 = by_id.get(NEW_ID)
    print(("OK  " if z5 and z5.get("type") == "지주택" and z5.get("area") == 34373.9 else "FAIL"),
          "jayang-548 등록", z5 and (z5.get("type"), z5.get("area"), z5.get("geom")))
    ok &= bool(z5 and z5.get("type") == "지주택" and z5.get("area") == 34373.9)
    za = by_id.get(A_TYPE_ID)
    print(("OK  " if za and za.get("type") == "신통기획" else "FAIL"), "자양4동A 유형", za and za.get("type"))
    ok &= bool(za and za.get("type") == "신통기획")
    for zid in (ZONE_ID, NEW_ID):
        f = next((ft for ft in geo["features"] if ft["properties"]["id"] == zid), None)
        print(("OK  " if f else "FAIL"), "geojson feature", zid)
        ok &= bool(f)
    print(("OK  " if geo["metadata"].get("count") == len(geo["features"]) else "FAIL"),
          "geojson count", geo["metadata"].get("count"), len(geo["features"]))
    ok &= geo["metadata"].get("count") == len(geo["features"])
    print(("OK  " if index["count"] == len(index["zones"]) else "FAIL"), "zone-index count", index["count"])
    ok &= index["count"] == len(index["zones"])
    print(("OK  " if META_KEY in meta else "FAIL"), "zones-meta", META_KEY)
    ok &= META_KEY in meta
    return ok


def apply():
    spec, zones, geo, index, meta = load()
    by_id = {z["id"]: z for z in zones}
    if ZONE_ID not in by_id:
        raise SystemExit(f"!! {ZONE_ID} 가 없습니다")
    if NEW_ID in by_id:
        raise SystemExit(f"!! {NEW_ID} 가 이미 있습니다")
    before_count = len(zones)
    before_others = {z["id"]: json.dumps(z, ensure_ascii=False, sort_keys=True)
                     for z in zones if z["id"] not in (ZONE_ID, A_TYPE_ID)}

    for i, z in enumerate(zones):
        if z["id"] == ZONE_ID:
            zones[i] = build_4b(z, spec)
        elif z["id"] == A_TYPE_ID:
            z = dict(z)
            z["type"] = "신통기획"
            z["kind"] = "신속통합기획(재개발)"
            note = z.get("note") or ""
            extra = ("신속통합기획 2차 공모 자양4동통합구역으로 선정돼 2026-01-31 구역지정된 구역이라 "
                     "사업유형을 신통기획으로 바로잡았습니다(2026-11-27).")
            if extra not in note:
                z["note"] = (note + " " + extra).strip()
            z["typeNote"] = extra
            zones[i] = z

    # 신규 구역은 광진구 구역들 뒤(같은 구)에 넣는다
    pos = max(i for i, z in enumerate(zones) if z.get("gu") == "광진구")
    zones.insert(pos + 1, dict(NEW_548))

    after_others = {z["id"]: json.dumps(z, ensure_ascii=False, sort_keys=True)
                    for z in zones if z["id"] not in (ZONE_ID, A_TYPE_ID, NEW_ID)}
    if before_others != after_others:
        changed = [k for k in before_others if before_others.get(k) != after_others.get(k)]
        raise SystemExit(f"!! 다른 구역이 바뀌었습니다: {changed[:5]}")
    if len(zones) != before_count + 1:
        raise SystemExit(f"!! 구역 수 {before_count} → {len(zones)}")
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-2000:])
            print(r.stderr[-2000:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": ("자양4동B(자양동 858) 공고 도면을 연속지적도 필지로 조립(필지정합) · 지주택 자양동 548 등록(대표 점) · "
                 "자양4동A 유형 신통기획 정정"),
        "zones": {
            ZONE_ID: {"geom": "필지정합", "areaShape": spec["areaShape"]},
            NEW_ID: {"geom": "미고시", "area": 34373.9},
            A_TYPE_ID: {"type": "신통기획", "kind": "신속통합기획(재개발)"},
        },
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("반영 완료:", ZONE_ID, NEW_ID, A_TYPE_ID)


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    apply()
    sys.exit(0 if check() else 1)
