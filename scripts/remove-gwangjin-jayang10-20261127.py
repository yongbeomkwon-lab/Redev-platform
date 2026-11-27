#!/usr/bin/env python3
"""광진구 민간도심복합 '자양동 10번지 일원'(gwangjin-jayang10) 삭제 (2026-11-27)

사용자 결정: `자양동 10번지 일원`(민간도심복합 성장거점형·추진준비)은 리디브에서 완전히 빼고
`자양동 17-1 일원`만 남긴다. (자양4동B 북단이 이 구역 안까지 올라가 겹치던 문제도 함께 정리)

실행: python3 scripts/remove-gwangjin-jayang10-20261127.py [--check]
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
ZID = "gwangjin-jayang10"
META_KEY = "removeJayang10_20261127"


def apply():
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    before = len(zones)
    kept = [z for z in zones if z["id"] != ZID]
    if len(kept) == before:
        print("없음 — 이미 삭제됨")
        return
    SOURCE.write_text(json.dumps(kept, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs", "--force"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": "2026-11-27",
        "note": "사용자 결정으로 민간도심복합 '자양동 10번지 일원'(gwangjin-jayang10)을 삭제 — 자양동 17-1 일원만 유지",
        "removed": [ZID],
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print(f"구역 {before} → {len(kept)} (삭제: {ZID})")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
