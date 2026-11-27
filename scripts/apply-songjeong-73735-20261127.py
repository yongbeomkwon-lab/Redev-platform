#!/usr/bin/env python3
"""성동구 (가)송정동 73-735 신속통합기획 신규 등록 (2026-11-27)

성동구가 2026-11-17 「신속통합기획 주택재개발사업 후보지 신청을 위한 동의서 발급 사실 안내
(송정동 73-735번지 일대)」로 구역계를 공개하고 2026-11-24 동의양식번호(제1호)를 부여했다.
리디브에는 이 구역이 없어 새로 등록한다.

  · 면적 103,865.4㎡ · 토지등소유자 약 890명 · 노후도 85.86%
  · 2006년 정비구역 지정 → 2014년 해제 → 2021년 추진위 실패 → 2026년 재추진
  · 경계: 구역공개 안내문 구역계 도면을 확보하지 못해 우선 대표 지점(geom "미고시")으로 세우고,
    브이월드 점검이 끝나면 연속지적도 필지로 조립해 채운다.

실행: python3 scripts/apply-songjeong-73735-20261127.py [--check]
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "geojson.tmp"
META = ROOT / "src" / "data" / "zones-meta.json"
AS_OF = "2026-11-27"
META_KEY = "songjeong73735_20261127"

ZONE = {
    "id": "sd-songjeong-73-735",
    "name": "(가)송정동 73-735",
    "alias": [
        "송정동 73-735", "송정동 73-735번지 일대", "송정동 73-735번지 일원",
        "송정동 재개발", "(가)송정동 73-735구역", "송정동 신통기획",
    ],
    "type": "신통기획",
    "kind": "신속통합기획(재개발)",
    "stage": "연번부여(2026-11-24)",
    "gu": "성동구",
    "area": 103865.4,
    "featured": False,
    "geom": "미고시",
    "center": [37.550577, 127.066790],
    "centerLabel": "송정동 73-735번지 일대 — 성수동과 맞닿은 송정제방길 남측",
    "owners": 890,
    "deterioration": "85.86%",
    "stageDates": {"prep": "2026-11-24"},
    "datesAsOf": "2026-11-27",
    "note": (
        "성동구 송정동 73-735번지 일대 신속통합기획 주택재개발 후보지입니다. 성동구는 2026-11-17 "
        "「신속통합기획 주택재개발사업 후보지 신청을 위한 동의서 발급 사실 안내(송정동 73-735번지 일대)」로 "
        "추진주체가 제출한 구역계를 공개했고, 2026-11-24 동의양식번호(제1호)를 부여했습니다. "
        "사업 대상지 103,865.4㎡, 토지등소유자 약 890명, 노후도 85.86%로 신속통합기획 신청 기준(60%)을 "
        "넘습니다. 전체 건물 618동 가운데 반지하를 포함한 건물이 320동(52%)이고 6m 이상 도로에 접한 주택은 "
        "26%뿐인 전형적인 노후 저층 주거지입니다. 광나루로를 사이에 두고 성수동과 맞닿은 남송정동으로, "
        "중랑천·송정제방길 수변 입지를 갖습니다. 이 일대는 2006년 정비구역으로 지정됐다가 2014년 해제됐고, "
        "2021년 추진위도 주민 반대로 무산된 뒤 이번에 다시 추진하는 것입니다. 주민 동의서를 모아 서울시 "
        "후보지 신청으로 넘어가는 단계이며, 아직 후보지 선정·정비구역 지정 전이라 공식 구역계는 확정 전입니다."
    ),
    "areaNote": (
        "추진준비위·성동구 공개 기준 103,865.4㎡(약 31,419평)입니다. 신청인이 제출한 구역계라 "
        "후보지 추천 과정에서 일부 바뀔 수 있습니다."
    ),
    "sources": [
        {
            "label": "성동구 「신속통합기획 주택재개발사업 후보지 신청을 위한 동의서 발급 사실 안내(송정동 73-735번지 일대)」(2026-11-17, 구역공개 안내문)",
            "url": "https://jaegebal.com/gnotices/sd-etc-2026-532716",
        },
        {
            "label": "아시아경제 — 「강남도 아닌데 수십억 '턱턱'…연예인도 찜한 이 동네, 5년 만에 '들썩'」(2026-11-21) — 103,865.4㎡·토지등소유자 약 890명·노후도 85.86%",
            "url": "https://view.asiae.co.kr/article/2026112010514890953",
        },
        {
            "label": "도시팩트 — 「권은비 24억 건물 산 송정동, 재개발 '동의서 연번 부여' 확정…사업 첫발 뗐다」(2026-11-17)",
            "url": "https://cityfact.co.kr/news/235",
        },
    ],
    "sid": "성동구 동의서 번호부여 안내(2026-11-17) · 번호부여 2026-11-24",
    "asOf": AS_OF,
}


def apply():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    ids = {z["id"] for z in zones}
    if ZONE["id"] in ids:
        print("이미 있음 — 건너뜀")
        return
    zones.append(dict(ZONE))
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": "성동구 (가)송정동 73-735 신속통합기획 후보지 신규 등록(연번부여 2026-11-24, 103,865.4㎡) — 구역계는 필지 조립 전 점 표시",
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads((ROOT / "public" / "data" / "zones.geojson").read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    (ROOT / "public" / "data" / "zones.geojson").write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print("등록 완료:", ZONE["id"], "· 총", len(zones), "구역")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
