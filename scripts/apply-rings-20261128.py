#!/usr/bin/env python3
"""연속지적도 필지 조립 결과를 구역에 반영 (2026-11-28 28곳)

  입력: tmp/rings-20261128.json (assemble-rings-20261128.py rings)
  반영: src/data/seoul-zones.json → public/data/zones.geojson → public/data/zone-index.json

  실행: python3 scripts/apply-rings-20261128.py [--check]
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
RINGS = ROOT / "tmp" / "rings-20261128.json"
AS_OF = "2026-11-28"
META_KEY = "parcelRings_20261128"

VWORLD = {"label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) — 필지 경계 조립", "url": "https://www.vworld.kr"}

# rings 키 → (구역 id, 경계 설명, 비고)
TABLE: dict[str, tuple[str, str, str]] = {
    "geumho-hyundai": (
        "sd-eungbong-geumho-hyundai",
        "응봉동 98 금호현대아파트 단지 대지 필지를 연속지적도로 그대로 쓴 경계입니다. 도형 면적 {area:,}㎡는 공개 단지면적 30,465㎡ 대비 {diff:+.1f}%입니다.",
        "단지 대지 경계(공식 구역계 아님)",
    ),
    "majang-793-22": (
        "sd-majang-793-22",
        "마장동 793-22·793-23(미성빌라) 일대 필지 {n}개를 연속지적도로 모은 경계입니다. 도형 면적 {area:,}㎡(공개 7,497㎡ 대비 {diff:+.1f}%). 사전검토 단계라 고시 구역계가 없습니다.",
        "사업지 필지 묶음",
    ),
    "yongdap-1": (
        "sy-yongdap1",
        "용답동 50-14 일대(성동구 2026-10-20 구역계 공개)를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공고 '약 4.7만㎡' 대비 {diff:+.1f}%입니다. 공개 구역도 원문을 확보하지 못해 필지 합집합으로 그렸으므로 구역계 도면을 구하면 다시 맞춥니다.",
        "공개 구역도 미확보 — 필지 합집합",
    ),
    "yongdap-2": (
        "yongdap-2",
        "용답동 15 일대(용답2구역) 필지 {n}개를 연속지적도로 조립한 경계입니다. 도형 면적 {area:,}㎡는 서울시고시 제2026-639호 96,210.8㎡ 대비 {diff:+.1f}%입니다.",
        "고시 면적 기준 필지 조립",
    ),
    "jayang4b": (
        "rest17gu-jayang4b",
        "자양동 858번지 일대(자양4동B)를 연속지적도 필지 {n}개로 다시 조립한 경계입니다. 북쪽은 아차산로29길·동일로18길 대각 골목 아래 필지만 남겨 자양동 10번지 일원과 겹치지 않게 했습니다. 도형 면적 {area:,}㎡는 공개 58,680.1㎡ 대비 {diff:+.1f}%입니다.",
        "북단을 골목 아래로 정리",
    ),
    "jayang-548": (
        "jayang-548",
        "자양동 548번지 일대 지구단위계획구역(지역주택조합)을 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 광진구 공고 제2026-1399호 34,373.9㎡ 대비 {diff:+.1f}%입니다.",
        "공고 면적 기준 필지 조립",
    ),
    "songjeong-73-735": (
        "sd-songjeong-73-735",
        "송정동 73-735번지 일대를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 추진준비위·성동구 공개 103,865.4㎡ 대비 {diff:+.1f}%입니다.",
        "신청 구역계 기준 필지 조립",
    ),
    "haengdang-300-1": (
        "haengdang-300-1",
        "행당동 300-1번지 일대(행당8구역)를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공개 66,276.1㎡ 대비 {diff:+.1f}%입니다.",
        "2026-05-28 지형도면 기준 면적에 맞춘 필지 조립",
    ),
    "sindang-13": (
        "rest17gu-jg-신당13",
        "신당동 236-67번지 일대(신당13구역)를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 중구 공고 약 68,916㎡ 대비 {diff:+.1f}%입니다. 신당10구역 남측·다산로 이면 블록입니다.",
        "중구 공개 도면 미확보 — 필지 합집합",
    ),
    "sindang-14": (
        "rest17gu-jg-신당14",
        "신당동 123-1번지 일대(신당14구역)를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 중구 공고 약 34,121㎡ 대비 {diff:+.1f}%입니다.",
        "중구 공개 도면 미확보 — 필지 합집합",
    ),
    "sindang-hyundai": (
        "junggu-sindang-hyundai",
        "신당동 840 신당현대아파트 단지 필지를 연속지적도로 그대로 쓴 경계입니다. 도형 면적 {area:,}㎡는 공개 단지면적 44,338㎡ 대비 {diff:+.1f}%입니다(942세대).",
        "단지 대지 경계(공식 구역계 아님)",
    ),
    "sindang-403-20": (
        "junggu-sindang-403-20",
        "신당동 403-20번지 일대(장기전세주택) 필지 {n}개를 연속지적도로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공개 정비구역 면적 4,928.5㎡ 대비 {diff:+.1f}%입니다.",
        "정비계획 공람 단계 — 필지 합집합",
    ),
    "bangbae-920-1": (
        "bangbae-920-1",
        "방배동 920-1번지 일대 모아타운을 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공개 19,070.3㎡ 대비 {diff:+.1f}%입니다. 인접 방배동 858-1 블록과 겹치지 않게 920-1 블록 필지만 골랐습니다.",
        "모아타운 후보지 — 필지 합집합",
    ),
    "seocho-1506-6": (
        "seocho-1506-6",
        "서초동 1506-6번지 일대 모아타운을 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공개 46,697.4㎡ 대비 {diff:+.1f}%입니다.",
        "모아타운 — 필지 합집합",
    ),
    "seocho-1487": (
        "seocho-1487",
        "서초동 1487번지 일대 모아타운(추진준비)을 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡입니다. 추진준비 단계라 권리산정기준일·구역계가 아직 고시되지 않았습니다.",
        "추진준비 — 필지 합집합",
    ),
    "samseong-84": (
        "gangnam4gu-samseong-84",
        "삼성동 84번지 일대 모아타운을 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공개 34,802㎡ 대비 {diff:+.1f}%입니다.",
        "모아타운 — 필지 합집합",
    ),
    "dongjak-102-8": (
        "dongjak-102-8",
        "동작동 102-8번지 일대 모아타운(사당20구역)을 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 공개 21,211㎡ 대비 {diff:+.1f}%입니다.",
        "모아타운 — 필지 합집합",
    ),
    "sangil-300": (
        "rest17gu-gd-상일동-300",
        "(가)상일동 300번지 일대를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 강동구 공개 약 59,956㎡ 대비 {diff:+.1f}%입니다.",
        "신통기획 후보지 — 필지 합집합",
    ),
    "myeongil-100": (
        "rest17gu-myeongil-100",
        "(가)명일동 100번지 일대를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡는 강동구 공개 약 42,210㎡ 대비 {diff:+.1f}%입니다.",
        "신통기획 후보지 — 필지 합집합",
    ),
    "junggok-b4": ("gwangjin-junggok-b4", "중곡동 B4 민간도심복합 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공모 지침 67,206㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
    "junggok-b5": ("gwangjin-junggok-b5", "중곡동 B5 민간도심복합 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공모 지침 40,948㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
    "junggok-c3": ("gwangjin-junggok-c3", "중곡동 C3 민간도심복합 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공모 지침 59,830㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
    "junggok-c4": ("gwangjin-junggok-c4", "중곡동 C4 민간도심복합 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공모 지침 33,702㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
    "junggok-37-17": ("rest17gu-junggok-37-17", "중곡동 37-17번지 일대(C2,D1)를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공개 54,246㎡ 대비 {diff:+.1f}%).", "신통기획 후보지 — 필지 합집합"),
    "junggok-d2": ("rest17gu-junggok-d2", "(가)중곡동 D2 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공개 87,175.9㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
    "junggok-d4": ("rest17gu-junggok-d4", "(가)중곡동 D4 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공개 56,462㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
    "junggok-e6f2": ("rest17gu-junggok-e6f2", "(가)중곡동 E6,F2 후보지를 연속지적도 필지 {n}개로 조립한 경계입니다. 도형 면적 {area:,}㎡(공개 93,566㎡ 대비 {diff:+.1f}%).", "민간도심복합 후보지 — 필지 합집합"),
}

DDP = ("junggu-ddp-123", "DDP 1구역", "DDP 2구역", "DDP 3구역")

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
            {"label": "서울시 모아타운 추진현황 · 서초구 공고(추진준비) — 서초동 1487번지 일대 1~3구역",
             "url": "https://cleanup.seoul.go.kr/cleanup/view/moaTown.do"},
            VWORLD,
        ],
        "sid": "서초구 모아타운 추진준비(2026-11-28 확인)",
        "asOf": AS_OF,
        "stageDates": {},
        "datesAsOf": "2026-11-28",
    }
}


def _url(x):
    return x if isinstance(x, str) else (x or {}).get("url") or ""


def area_m2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        s += (ring[i][1] * kx) * (ring[i + 1][0] * ky) - (ring[i + 1][1] * kx) * (ring[i][0] * ky)
    return abs(s / 2)


def main():
    rings = json.loads(RINGS.read_text(encoding="utf-8"))
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in zones}
    done, missing = [], []

    for key, (zid, note, remark) in TABLE.items():
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
        area = float(r["areaShape"])
        target = float(r["target"]) if r.get("target") else float(z.get("area") or 0)
        diff = (area - target) / target * 100 if target else 0.0
        if diff < -0.05:
            z["boundaryApprox"] = True
        z["polygon"] = ring
        if r.get("parts"):
            z["parts"] = [p if p[0] == p[-1] else p + [p[0]] for p in r["parts"]]
        else:
            z.pop("parts", None)
        if r.get("holes"):
            z["holes"] = [h if h[0] == h[-1] else h + [h[0]] for h in r["holes"]]
        else:
            z.pop("holes", None)
        z["geom"] = "필지정합"
        z["areaShape"] = round(area, 1)
        z["ringPts"] = len(ring)
        z["asOf"] = AS_OF
        z["boundaryNote"] = note.format(n=len(r["parcels"]), area=round(area), diff=diff)
        srcs = list(z.get("sources") or [])
        if not any("vworld" in (_url(x)) for x in srcs):
            srcs.append(VWORLD)
        z["sources"] = srcs
        done.append((key, zid, area, target, diff, len(ring)))

    # ── DDP 1·2·3구역: 블록 3개를 한 레코드로(가장 큰 블록이 대표, 나머지는 parts)
    ddp = by_id.get(DDP[0])
    blocks = [rings.get(f"ddp-{i}") for i in (1, 2, 3)]
    if ddp and all(blocks):
        order = sorted(range(3), key=lambda i: -blocks[i]["areaShape"])
        main_b = blocks[order[0]]
        ring = main_b["ring"] + ([main_b["ring"][0]] if main_b["ring"][0] != main_b["ring"][-1] else [])
        ddp["polygon"] = ring
        ddp["parts"] = [b["ring"] + ([b["ring"][0]] if b["ring"][0] != b["ring"][-1] else [])
                        for b in blocks[1:]] if False else [
            blocks[i]["ring"] + ([blocks[i]["ring"][0]] if blocks[i]["ring"][0] != blocks[i]["ring"][-1] else [])
            for i in order[1:]
        ]
        ddp["holes"] = [h if h[0] == h[-1] else h + [h[0]] for h in (main_b.get("holes") or [])]
        total = sum(b["areaShape"] for b in blocks)
        ddp["geom"] = "필지정합"
        ddp["areaShape"] = round(total, 1)
        ddp["ringPts"] = len(ring)
        ddp["asOf"] = AS_OF
        ddp["boundaryApprox"] = True
        ddp["boundaryNote"] = (
            f"DDP 1·2·3구역을 구역별로 연속지적도 필지로 조립한 경계입니다. "
            f"DDP1 {blocks[0]['areaShape']:,.0f}㎡(공람자료 177,003㎡) · DDP2 {blocks[1]['areaShape']:,.0f}㎡(48,203㎡) · "
            f"DDP3 {blocks[2]['areaShape']:,.0f}㎡(118,689㎡), 합계 {total:,.0f}㎡. "
            f"정비구역 지정(안) 재공람(중구 공고 제2026-1186호, 2026-11-18~12-18) 단계라 확정 구역계가 아닙니다."
        )
        srcs = list(ddp.get("sources") or [])
        if not any("vworld" in (_url(x)) for x in srcs):
            srcs.append(VWORLD)
        ddp["sources"] = srcs
        done.append(("ddp-1/2/3", DDP[0], total, 366950, (total - 366950) / 366950 * 100, len(ring)))

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
        "note": "연속지적도 필지 조립으로 채운 구역들(성동·광진·중구·서초·강남·동작·강동)",
        "zones": {zid: {"areaShape": round(a, 1)} for _, zid, a, *_ in done},
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
    main()
