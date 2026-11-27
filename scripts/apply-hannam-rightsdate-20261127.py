#!/usr/bin/env python3
"""용산 한남뉴타운 5개 구역 권리산정기준일 반영 (2026-11-27)

  · 한남2·3·4·5구역: rightsDate 2006-10-19 (서울시 고시 제2006-357호 한남재정비촉진지구 지정 고시일)
    — 공유지분·토지분할 기준은 구 서울시 도시정비조례상 2003-12-30을 함께 본다(중개 실무).
  · 한남1구역(이태원동 730, 신통기획): rightsDate 2024-02-27.

실행: python3 scripts/apply-hannam-rightsdate-20261127.py [--check]
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META = ROOT / "src" / "data" / "zones-meta.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
AS_OF = "2026-11-27"
META_KEY = "hannamRightsDate_20261127"

NEWTOWN = {
    "11000UQ120PS202411014490": "한남2구역",
    "11000UQ120PS202407010654": "한남3구역",
    "11000UQ120PS202411014488": "한남4구역",
    "11000UQ120PS202407010638": "한남5구역",
}
HANNAN1 = "11000UQ120PS202505310032"

NOTE_NEWTOWN = (
    "권리산정기준일: 2006-10-19(서울시 고시 제2006-357호 한남재정비촉진지구 지정 고시일 — 신축·다세대 "
    "전환 기준). 단, 공유지분·토지분할 기준은 구 서울시 도시정비조례에 따라 2003-12-30을 적용합니다."
)
NOTE_HANNAN1 = (
    "권리산정기준일: 2024-02-27(서울시 고시 제2025-131호 정정). 신속통합기획 후보지·대상지 선정에 따른 "
    "권리산정기준일로, 이후 신축·분양·지분쪼개기 여부를 이 날짜로 따집니다."
)


def apply():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in zones}
    touched = []

    for zid, nm in NEWTOWN.items():
        z = by_id.get(zid)
        if not z:
            print("!! 없음", zid)
            continue
        z["rightsDate"] = "2006-10-19"
        if NOTE_NEWTOWN not in (z.get("note") or ""):
            z["note"] = ((z.get("note") or "").rstrip() + " " + NOTE_NEWTOWN).strip()
        z["asOf"] = AS_OF
        touched.append((zid, nm, "2006-10-19"))

    z = by_id.get(HANNAN1)
    if z:
        z["rightsDate"] = "2024-02-27"
        if NOTE_HANNAN1 not in (z.get("note") or ""):
            z["note"] = ((z.get("note") or "").rstrip() + " " + NOTE_HANNAN1).strip()
        z["asOf"] = AS_OF
        touched.append((HANNAN1, "한남1구역", "2024-02-27"))

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-1500:], r.stderr[-1500:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": "용산 한남뉴타운 1~5구역 권리산정기준일 반영(2·3·4·5구역 2006-10-19 / 한남1구역 2024-02-27)",
        "zones": {zid: {"rightsDate": d} for zid, _, d in touched},
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")

    for zid, nm, d in touched:
        print(f"  {nm:8s} {zid} rightsDate {d}")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
