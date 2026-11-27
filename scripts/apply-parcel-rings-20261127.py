#!/usr/bin/env python3
"""연속지적도 필지 조립 결과를 구역에 반영 (2026-11-27 2단계 B)

  `tmp/rings-seongdong-20261127.json`(fetch-parcels-seongdong-20261127.py rings)을 읽어
  표에 적힌 구역에 경계·면적·근거를 넣는다. 아직 데이터에 없는 구역(서초동 1487)은 새로 만든다.

실행: python3 scripts/apply-parcel-rings-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
RINGS = ROOT / "tmp" / "rings-seongdong-20261127.json"
AS_OF = "2026-11-27"
META_KEY = "parcelRings_20261127"

VWORLD = {"label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계 조립", "url": "https://www.vworld.kr"}

# key → (구역 id, geom, 경계 설명 틀)
TABLE = {
    "eungbong-geumho-hyundai": (
        "sd-eungbong-geumho-hyundai", "필지정합",
        "응봉동 98번지 일대 금호현대아파트 단지 대지 필지를 연속지적도로 모아 만든 경계입니다. "
        "대표 필지 98번지에서 도로 필지를 건너지 않고 맞닿은 대지 필지 {n}개를 합집합했고, 도형 면적 "
        "{area:,}㎡입니다(보도된 사업부지 30,465㎡ 대비 {diff:+.1f}%). 정비구역 지정 전이라 공식 구역계가 "
        "없어 단지 필지 경계를 그대로 쓴 참고 경계입니다.",
    ),
    "majang-793-22": (
        "sd-majang-793-22", "필지정합",
        "마장동 793-22·793-23(미성빌라 가·나동) 일대 필지를 연속지적도로 모아 만든 경계입니다. 맞닿은 "
        "대지 필지 {n}개를 합집합했고 도형 면적 {area:,}㎡(공개 자료 7,497㎡ 대비 {diff:+.1f}%)입니다. "
        "사전검토 단계라 고시 구역계가 없어 사업지 필지 묶음을 그대로 쓴 참고 경계입니다.",
    ),
    "yongdap-1": (
        "sy-yongdap1", "필지정합",
        "용답동 50-14번지 일대(성동구 2026-10-20 구역계 공개)를 연속지적도 필지로 조립한 경계입니다. "
        "대표 필지 50-14에서 맞닿은 대지 필지 {n}개를 모았고, 도형 면적 {area:,}㎡는 공고 '약 4.7만㎡' "
        "대비 {diff:+.1f}%입니다. 성동구 공개 구역도 원문을 확보하지 못해 필지 합집합으로 그렸으므로, "
        "구역계 도면을 구하면 그 선으로 다시 맞춥니다.",
    ),
    "yongdap-2": (
        "yongdap-2", "필지정합",
        "용답동 15번지 일대(용답2구역)를 연속지적도 필지로 조립한 경계입니다. 대표 필지 15번지에서 "
        "맞닿은 대지 필지 {n}개를 모았고, 도형 면적 {area:,}㎡는 서울시고시 제2026-639호(96,210.8㎡) "
        "대비 {diff:+.1f}%입니다. 고시 지형도면(서울시보 제4194호)의 구역선과 대조해 쓰는 검토 경계입니다.",
    ),
    "haengdang-300-1": (
        "haengdang-300-1", "필지정합",
        "행당동 300-1번지 일대(행당8구역)를 연속지적도 필지로 조립한 경계입니다. 맞닿은 대지 필지 "
        "{n}개를 모았고, 도형 면적 {area:,}㎡는 공개 면적 66,276.1㎡ 대비 {diff:+.1f}%입니다. "
        "2026-05-28 성동구 행위제한·지형도면 고시가 있으나 도면 원문을 확보하지 못해 필지 합집합으로 "
        "그렸습니다.",
    ),
    "songjeong-73-735": (
        "sd-songjeong-73-735", "필지정합",
        "송정동 73-735번지 일대를 연속지적도 필지로 조립한 경계입니다. 대표 필지 73-735에서 맞닿은 "
        "필지 {n}개를 모았고, 도형 면적 {area:,}㎡는 추진준비위·성동구 공개 면적 103,865.4㎡ 대비 "
        "{diff:+.1f}%입니다. 신청인이 제출한 구역계라 후보지 추천 과정에서 바뀔 수 있습니다.",
    ),
    "jayang-548": (
        "jayang-548", "필지정합",
        "자양동 548번지 일대 지구단위계획구역(지역주택조합)을 연속지적도 필지로 조립한 경계입니다. "
        "맞닿은 필지 {n}개를 모았고, 도형 면적 {area:,}㎡는 광진구 공고 제2026-1399호의 구역면적 "
        "34,373.9㎡ 대비 {diff:+.1f}%입니다. 공고문에 결정도가 실려 있지 않아 사용자가 보낸 캡처의 "
        "구역계 모양을 기준으로 필지를 골랐습니다.",
    ),
    "sindang-13": (
        "rest17gu-jg-신당13", "필지정합",
        "신당동 236-67번지 일대(신당13구역)를 연속지적도 필지로 조립한 경계입니다. 맞닿은 필지 {n}개를 "
        "모았고, 도형 면적 {area:,}㎡는 중구 공고 면적 약 68,916㎡ 대비 {diff:+.1f}%입니다. 신당10구역 "
        "남측·다산로 이면 블록으로, 중구가 공개한 구역계 도면을 확보하지 못해 필지 합집합으로 그렸습니다.",
    ),
    "sindang-14": (
        "rest17gu-jg-신당14", "필지정합",
        "신당동 123-1번지 일대(신당14구역)를 연속지적도 필지로 조립한 경계입니다. 맞닿은 필지 {n}개를 "
        "모았고, 도형 면적 {area:,}㎡는 중구 공고 면적 약 34,121㎡ 대비 {diff:+.1f}%입니다. 중구 "
        "공개 도면을 확보하지 못해 필지 합집합으로 그렸습니다.",
    ),
    "sindang-hyundai": (
        "junggu-sindang-hyundai", "필지정합",
        "신당동 840번지 신당현대아파트 단지 필지를 연속지적도로 모아 만든 경계입니다. 단지 필지 "
        "{n}개를 합집합했고, 도형 면적 {area:,}㎡는 공개 단지 면적 44,338㎡ 대비 {diff:+.1f}%입니다. "
        "942세대 단지의 대지 경계를 그대로 쓴 경계입니다.",
    ),
    "bangbae-920-1": (
        "bangbae-920-1", "필지정합",
        "방배동 920-1번지 일대 모아타운을 연속지적도 필지로 조립한 경계입니다. 맞닿은 필지 {n}개를 "
        "모았고, 도형 면적 {area:,}㎡는 공개 면적 19,070.3㎡ 대비 {diff:+.1f}%입니다. 인접 방배동 858-1 "
        "블록과 겹치지 않게 920-1 블록 필지만 골랐습니다.",
    ),
    "seocho-1506-6": (
        "seocho-1506-6", "필지정합",
        "서초동 1506-6번지 일대 모아타운을 연속지적도 필지로 조립한 경계입니다. 맞닿은 필지 {n}개를 "
        "모았고, 도형 면적 {area:,}㎡는 공개 면적 46,697.4㎡ 대비 {diff:+.1f}%입니다.",
    ),
    "seocho-1487": (
        "seocho-1487", "필지정합",
        "서초동 1487번지 일대 모아타운(추진준비)을 연속지적도 필지로 조립한 경계입니다. 맞닿은 필지 "
        "{n}개를 모았고, 도형 면적 {area:,}㎡입니다. 추진준비 단계라 권리산정기준일·구역계가 아직 "
        "고시되지 않았습니다.",
    ),
    "samseong-84": (
        "gangnam4gu-samseong-84", "필지정합",
        "삼성동 84번지 일대 모아타운을 연속지적도 필지로 조립한 경계입니다. 맞닿은 필지 {n}개를 "
        "모았고, 도형 면적 {area:,}㎡는 공개 면적 34,802㎡ 대비 {diff:+.1f}%입니다.",
    ),
}

# 새로 만드는 구역
NEW = {
    "seocho-1487": {
        "id": "seocho-1487",
        "name": "(가)서초동 1487 모아타운",
        "alias": ["서초동 1487", "서초동 1487번지 일대", "(가)서초동 1487", "서초1487"],
        "type": "모아타운",
        "kind": "소규모주택정비 관리지역",
        "stage": "추진준비",
        "gu": "서초구",
        "area": 49300,
        "featured": False,
        "center": [37.482802, 127.006059],
        "centerLabel": "서초동 1487번지 일대",
        "note": (
            "서초동 1487번지 일대 모아타운 추진준비 구역입니다. 1~3구역 블록으로 이뤄져 있고, 아직 "
            "관리계획 수립·고시 전이라 권리산정기준일이 없습니다. 구역면적은 추진준비 도면 기준 약 "
            "49,206~49,361㎡입니다."
        ),
        "areaNote": "추진준비 도면 기준 약 49,206~49,361㎡ — 고시 전이라 확정 면적이 아닙니다.",
        "sources": [
            {"label": "서울시 모아타운 추진현황 · 서초구 공고(추진준비) — 서초동 1487번지 일대 1~3구역", "url": "https://cleanup.seoul.go.kr/cleanup/view/moaTown.do"},
            VWORLD,
        ],
        "sid": "서초구 모아타운 추진준비(2026-11-27 확인)",
        "asOf": AS_OF,
        "stageDates": {},
        "datesAsOf": "2026-11-27",
    }
}


def area_m2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        s += (ring[i][1] * kx) * (ring[i + 1][0] * ky) - (ring[i + 1][1] * kx) * (ring[i][0] * ky)
    return abs(s / 2)


def apply():
    rings = json.loads(RINGS.read_text(encoding="utf-8"))
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in zones}
    done, missing = [], []

    for key, (zid, geom, note) in TABLE.items():
        r = rings.get(key)
        if not r:
            missing.append(key)
            continue
        z = by_id.get(zid)
        if z is None and key in NEW:
            z = dict(NEW[key])
            zones.append(z)
            by_id[zid] = z
        if z is None:
            missing.append(f"{key}(레코드없음)")
            continue
        ring = r["ring"]
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        area = area_m2(ring)
        diff = (area - float(r["target"])) / float(r["target"]) * 100
        z["polygon"] = ring
        if r.get("parts"):
            z["parts"] = [p if p[0] == p[-1] else p + [p[0]] for p in r["parts"]]
        else:
            z.pop("parts", None)
        z["geom"] = geom
        z["boundaryApprox"] = True
        z["areaShape"] = round(area, 1)
        z["ringPts"] = len(ring)
        z["asOf"] = AS_OF
        z["boundaryNote"] = note.format(n=len(r["parcels"]), area=round(area), diff=diff)
        srcs = list(z.get("sources") or [])
        if not any("vworld" in (s.get("url") or "") for s in srcs):
            srcs.append(VWORLD)
        z["sources"] = srcs
        done.append((key, zid, area, float(r["target"]), diff, len(ring)))

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")
    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs", "--force"], [node, "scripts/build-zone-index.mjs"]):
        rr = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", rr.returncode)
        if rr.returncode != 0:
            print(rr.stdout[-1500:], rr.stderr[-1500:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": "연속지적도 필지 조립으로 채운 구역들(성동·광진·중구·서초·강남)",
        "zones": {zid: {"geom": geom, "areaShape": round(a, 1)} for _, zid, a, *_ in done},
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")

    for key, zid, a, t, diff, pts in done:
        print(f"{zid:34s} {a:11,.1f}㎡ / {t:11,.1f}㎡ ({diff:+.1f}%) · {pts}정점")
    if missing:
        print("조립 결과 없음:", ", ".join(missing))


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
