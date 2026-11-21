#!/usr/bin/env python3
"""첫 화면 「⚡ 최근 변동 구역」 목록 만들기 — public/data/recent-zones.json

무엇을 담나
  · `zones.geojson` 의 `asOf`(최근 반영일)가 있는 구역을 최신순으로 담는다.
  · asOf 가 없는 구역 중에서도 최근 작업으로 단계가 바뀐 곳(장위11·삼각맨션 등)은
    아래 CURATED 에 날짜와 한 줄 설명을 직접 적어 넣는다 — 화면에 "무엇이 바뀌었는지"가 보여야 한다.
  · 화면(ZoneExplorer)은 앞에서 6곳만 쓴다. 목록은 새 반영이 생길 때 이 스크립트를 다시 돌린다.

  python3 scripts/build-recent-zones.py
"""
import json
import os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES = os.path.join(ROOT, "public", "data", "zones.geojson")
OUT = os.path.join(ROOT, "public", "data", "recent-zones.json")

# asOf 가 없는 구역의 최근 변경 — 화면에 보일 한 줄과 날짜를 직접 적는다(근거: 해당 반영 커밋·공고)
CURATED = [
    {
        "name": "장위11-1구역",
        "asOf": "2026-11-21",
        "label": "사업시행인가",
        "note": "장위11 일대 가로주택·재개발 단계 정리(사업시행자 지정 반영)",
    },
    {
        "name": "삼각맨션",
        "asOf": "2026-11-18",
        "label": "정비구역 지정(2026-05-28)",
        "note": "한강로1가 231-23 일원 도시정비형 재개발 구역계 반영",
    },
]


def centroid(geom):
    if not geom:
        return None
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    xs, ys = [], []
    for p in polys:
        for x, y in p[0]:
            xs.append(x)
            ys.append(y)
    if not xs:
        return None
    return [round(sum(ys) / len(ys), 6), round(sum(xs) / len(xs), 6)]


def main():
    d = json.load(open(ZONES, encoding="utf-8"))
    by_name = {f["properties"]["name"]: f for f in d["features"]}
    rows = []
    seen = set()
    for f in d["features"]:
        p = f["properties"]
        asof = p.get("asOf")
        if not asof:
            continue
        rows.append(
            {
                "id": p["id"],
                "name": p["name"],
                "gu": p.get("gu"),
                "type": p.get("type"),
                "stage": p.get("stage"),
                "asOf": asof,
                "label": p.get("stage"),
                "note": (p.get("note") or "")[:120],
                "center": p.get("center") or centroid(f.get("geometry")),
            }
        )
        seen.add(p["name"])
    for c in CURATED:
        f = by_name.get(c["name"])
        if not f or c["name"] in seen:
            continue
        p = f["properties"]
        rows.append(
            {
                "id": p["id"],
                "name": p["name"],
                "gu": p.get("gu"),
                "type": p.get("type"),
                "stage": p.get("stage"),
                "asOf": c["asOf"],
                "label": c["label"],
                "note": c["note"],
                "center": p.get("center") or centroid(f.get("geometry")),
            }
        )
    rows.sort(key=lambda r: (r["asOf"], r["name"]), reverse=True)
    rows = [r for r in rows if r["center"]][:14]
    payload = {"generatedAt": date.today().isoformat(), "zones": rows}
    txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(txt)
    print(f"{os.path.relpath(OUT, ROOT)} · {len(rows)}곳 · {len(txt.encode()) / 1024:.0f}KB")
    for r in rows[:8]:
        print(" ", r["asOf"], r["name"], "|", r["label"])


if __name__ == "__main__":
    main()
