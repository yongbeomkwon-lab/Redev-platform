#!/usr/bin/env python3
"""zones.geojson 회귀 복구 — 2026-11-23 사고(geojson 전용 구역·보강 필드 소실) 되돌리기

무슨 일이 있었나
  · 0a379dc(2026-11-23 07:16, 제기동 1145-8 고시도면)와 e56a3c3(08:24, 신길동 113-5·90-31)가
    `npm run geojson`(scripts/export-geojson.mjs)으로 zones.geojson 을 다시 내보냈다.
  · 그 내보내기는 `src/data/seoul-zones.json` 만 보고 그리는데, 그 파일에는 최근 커밋들이
    geojson 에만 얹은 것이 빠져 있었다 → 구역 15곳이 통째로 사라지고, 경계·단계·설명·면적·
    badgeType·boundaryApprox 같은 보강 필드가 오래된 값으로 되돌아갔다.
    (예: 사당22구역·사당동 300 모아타운·신수13구역·장안동 118-16·성내동 431·응암동 101번지·
     제기동 1145-8 경계 소실, 대선제분1구역1지구 경매가 붙은 구역은 그대로였지만
     DDP 1·2·3구역·쌍문동 710 구역 자체가 지도에서 사라져 auction zoneId 가 주인을 잃었다.)

무엇을 되돌리나
  · `scripts/data/zones-restore-20261123.json` — 899fb7f(사고 직전 정상 상태)의 구역 값에
    두 커밋의 **의도된** 변경만 얹은 값:
      - 0a379dc: 제기동 1145-8 고시 지형도면 경계·단계
      - e56a3c3: 신길동 113-5·90-31 고시 구역계
      - b5d8f78: 대선제분일대1구역1지구 사업시행자 지정 철회 단계
  · 값이 84개 구역이고, 그중 19개 구역의 경계가 지도에 되살아난다.

하는 일
  1) 위 payload 를 `src/data/seoul-zones.json`(파이프라인 원천)에 반영한다 — 다음에 geojson 을
     다시 내보내도 값이 유지되게 하려면 원천까지 맞춰야 한다.
  2) zones.geojson 을 다시 쓴다 — `scripts/export-geojson.py`(또는 npm 이 있으면 `npm run geojson`).
     내보내기 스크립트에는 '지워지면 멈춤'
     검사를 넣어 두어 같은 사고가 조용히 반복되지는 않는다).
  3) 결과를 payload 와 대조해 확인한다.

실행
  python3 scripts/apply-zones-restore-20261123.py            # 반영 + 내보내기 + 확인
  python3 scripts/apply-zones-restore-20261123.py --check    # 확인만
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
PAYLOAD = ROOT / "scripts" / "data" / "zones-restore-20261123.json"

# src/data/seoul-zones.json 에 그대로 옮겨 적는 보강 필드 (export-geojson.mjs 의 EXTRA 와 같다)
EXTRA = [
    "alias", "selectedAt", "centerLabel", "locationMap", "note", "areaNote",
    "boundaryNote", "nameNote", "nameSources", "sources", "hiddenByDefault",
    "boundaryApprox", "badgeType", "asOf", "areaShape", "households", "rightsDate", "drawing",
]
BASE = ["name", "type", "kind", "stage", "gu", "area", "featured", "geom"]


def rings_of_geo(feature: dict):
    """GeoJSON 도형 → [[ [lat,lng], ... ]] (폐합점 제거, 위경도 순서 뒤집기)"""
    g = feature.get("geometry")
    if not g:
        return None
    rs = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
    out = []
    for r in rs:
        rr = list(r)
        if len(rr) > 1 and rr[0] == rr[-1]:
            rr = rr[:-1]
        out.append([[p[1], p[0]] for p in rr])
    return out


def same_rings(a, b) -> bool:
    if (a is None) != (b is None):
        return False
    if a is None:
        return True
    if len(a) != len(b) or any(len(x) != len(y) for x, y in zip(a, b)):
        return False
    return all(abs(p[0] - q[0]) < 1e-12 and abs(p[1] - q[1]) < 1e-12
               for r1, r2 in zip(a, b) for p, q in zip(r1, r2))


def write_source(payload: dict) -> int:
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    idx = {z["id"]: z for z in zones}
    created, updated = 0, 0
    for zid, entry in payload["entries"].items():
        props, rings = entry["props"], entry.get("rings")
        z = idx.get(zid)
        if z is None:
            z = {"id": zid}
            zones.append(z)
            idx[zid] = z
            created += 1
        else:
            updated += 1
        for key in BASE:
            if key in props:
                z[key] = props[key]
        z["sid"] = props.get("sourceId")
        for key in EXTRA:
            if key in props and props[key] not in (None, "", [], {}):
                z[key] = props[key]
            else:
                z.pop(key, None)
        if rings:
            z["polygon"] = rings[0]
            if len(rings) > 1:
                z["parts"] = rings[1:]
            else:
                z.pop("parts", None)
            z.pop("holes", None)
        else:
            z.pop("polygon", None)
            z.pop("parts", None)
            z["center"] = props.get("center")
    SOURCE.write_text(json.dumps(zones, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] seoul-zones.json — 새 구역 {created}곳, 갱신 {updated}곳 (전체 {len(zones)}곳)")
    return 0


def check(payload: dict) -> int:
    geo = {f["properties"]["id"]: f for f in json.loads(GEOJSON.read_text(encoding="utf-8"))["features"]}
    src = {z["id"]: z for z in json.loads(SOURCE.read_text(encoding="utf-8"))}
    bad = 0
    for zid, entry in payload["entries"].items():
        props, rings = entry["props"], entry.get("rings")
        f = geo.get(zid)
        if not f:
            print(f"[FAIL] geojson 에 구역 없음: {zid}")
            bad += 1
            continue
        for key, want in props.items():
            # 경계가 있는 구역의 center 는 내보내기가 쓰지 않는다(화면이 도형 bbox 로 계산)
            if key == "center" and rings:
                continue
            got = f["properties"].get(key)
            if got in (None, "", [], {}) and want in (None, "", [], {}):
                continue
            if got != want:
                bad += 1
                print(f"[FAIL] {zid} {key}: {str(got)[:60]!r} ≠ {str(want)[:60]!r}")
        if not same_rings(rings, rings_of_geo(f)):
            bad += 1
            print(f"[FAIL] {zid} 경계 도형이 payload 와 다릅니다")
        z = src.get(zid)
        if z is None:
            bad += 1
            print(f"[FAIL] seoul-zones.json 에 구역 없음: {zid}")
        else:
            src_rings = None
            if z.get("polygon"):
                src_rings = [z["polygon"]] + (z.get("parts") or [])
            if not same_rings(rings, src_rings):
                bad += 1
                print(f"[FAIL] {zid} seoul-zones.json 폴리곤이 payload 와 다릅니다")
    total = len(json.loads(GEOJSON.read_text(encoding="utf-8"))["features"])
    print(f"[{'OK' if bad == 0 else 'FAIL'}] geojson 구역 {total}곳 · payload {len(payload['entries'])}곳 대조 — 문제 {bad}건")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    payload = json.loads(PAYLOAD.read_text(encoding="utf-8"))
    if "--check" in sys.argv:
        sys.exit(check(payload))
    rc = write_source(payload)
    if rc:
        sys.exit(rc)
    # node/npm 이 없는 환경이 있어 파이썬 내보내기(같은 규칙)를 먼저 쓴다
    exporter = ROOT / "scripts" / "export-geojson.py"
    subprocess.run([sys.executable, str(exporter)], cwd=ROOT, check=True)
    sys.exit(check(payload))
