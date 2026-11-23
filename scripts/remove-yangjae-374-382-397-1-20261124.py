#!/usr/bin/env python3
"""양재동 374 · 382 · 397-1 일대 3곳 삭제 (2026-11-24, 사용자 지시
"양재동 374, 382, 397-1 내가 직접 그릴테니 삭제해주고 지금 모습 기억하고 있다가 내가 그리고 나서 어떤 차이가 있는지 공부좀해")

지우는 구역 3곳
  · 11000UQ120PS202503070074  「양재동 374」  (서초구, 모아타운 / 대상지선정)
  · 11000UQ120PS202503070075  「양재동 382」  (서초구, 모아타운 / 대상지선정)
  · yangjae-397-1             「양재동 397-1 일대(모아통합기획)」(서초구, 모아타운 / 연번부여)
→ 삭제 후 2,430곳 (2,433 - 3)

그대로 두는 곳
  · yangjae-360(양재동 360) · yangjae-370(양재동 370) · yangjae-77(양재동 77) · yangjae2-5(양재5구역)
  · 나머지 2,427곳 — 속성·도형이 바이트 단위로 그대로여야 한다.

건드리는 파일
  · src/data/seoul-zones.json     — 원천에서 3곳 제거
  · public/data/zones.geojson     — feature 3개 제거 + metadata.count 2,430
                                    (재생성 없이 직접 제거: export-geojson --force 는 다른 구역 center 를 다시 계산한다)
  · public/data/zone-index.json   — node scripts/build-zone-index.mjs 로 재생성

실행: python3 scripts/remove-yangjae-374-382-397-1-20261124.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"

# id → 이름 (이름이 다르면 중단 — 다른 구역을 건드리지 않기 위한 안전장치)
REMOVE = {
    "11000UQ120PS202503070074": "양재동 374",
    "11000UQ120PS202503070075": "양재동 382",
    "yangjae-397-1": "양재동 397-1 일대(모아통합기획)",
}
REMOVE_IDS = list(REMOVE)
EXPECTED_BEFORE = 2433
EXPECTED_AFTER = 2430

# 그대로 남아야 하는 양재 인접 구역
KEEP_IDS = [
    "yangjae-360",
    "yangjae-370",
    "yangjae-77",
    "yangjae2-5",
]

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _head_geojson() -> dict:
    raw = subprocess.run(
        ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return json.loads(raw)


def check() -> int:
    bad = 0
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    feats = geo["features"]

    # ① 개수
    ok = len(src) == EXPECTED_AFTER == len(feats) == index.get("count") == len(index.get("zones", []))
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 — seoul-zones {len(src)} · geojson {len(feats)} · "
          f"zone-index {index.get('count')} (기대 {EXPECTED_AFTER})")
    bad += 0 if ok else 1

    # ② 삭제 대상이 어디에도 없음
    leftovers = []
    for rid in REMOVE_IDS:
        if any(z.get("id") == rid for z in src):
            leftovers.append(f"seoul-zones:{rid}")
        if any(f["properties"].get("id") == rid for f in feats):
            leftovers.append(f"geojson:{rid}")
        if any(z.get("id") == rid for z in index.get("zones", [])):
            leftovers.append(f"zone-index:{rid}")
    ok = not leftovers
    print(f"[{'OK' if ok else 'FAIL'}] 삭제 3곳 잔여 {len(leftovers)}건" + ("" if ok else " — " + ", ".join(leftovers)))
    bad += 0 if ok else 1

    # ③ 남은 구역 id 집합 = HEAD − 3곳
    head_by_id = {f["properties"]["id"]: f for f in _head_geojson()["features"]}
    expect_ids = set(head_by_id) - set(REMOVE_IDS)
    got_ids = {f["properties"]["id"] for f in feats}
    missing, extra = sorted(expect_ids - got_ids), sorted(got_ids - expect_ids)
    ok = not missing and not extra
    print(f"[{'OK' if ok else 'FAIL'}] 직전 커밋 대비 — 사라진 구역 {len(missing)}곳 · 늘어난 구역 {len(extra)}곳")
    if missing:
        print("    사라짐:", missing[:10])
    if extra:
        print("    늘어남:", extra[:10])
    bad += 0 if ok else 1

    # ④ 남은 구역 properties·geometry 완전 동일
    prop_diff, geom_diff, examples = 0, 0, []
    for f in feats:
        fid = f["properties"]["id"]
        old = head_by_id.get(fid)
        if old is None:
            continue
        if _norm(f["properties"]) != _norm(old["properties"]):
            prop_diff += 1
            if len(examples) < 5:
                keys = sorted(set(f["properties"]) | set(old["properties"]))
                examples.append(f"{fid}." + str([k for k in keys if _norm(f["properties"].get(k)) != _norm(old["properties"].get(k))][:4]))
        if _norm(f.get("geometry")) != _norm(old.get("geometry")):
            geom_diff += 1
            if len(examples) < 5:
                examples.append(f"{fid}.geometry")
    ok = prop_diff == 0 and geom_diff == 0
    print(f"[{'OK' if ok else 'FAIL'}] 나머지 구역 속성 변경 {prop_diff}곳 · 도형 변경 {geom_diff}곳"
          + ("" if ok else " — " + ", ".join(examples)))
    bad += 0 if ok else 1

    # ⑤ 양재 인접 구역이 그대로 있음
    gone = [i for i in KEEP_IDS if i not in got_ids]
    ok = not gone
    print(f"[{'OK' if ok else 'FAIL'}] 유지 구역 {len(KEEP_IDS)}곳 중 사라진 곳 {len(gone)}곳" + ("" if ok else " — " + ", ".join(gone)))
    bad += 0 if ok else 1

    # ⑥ 구역 데이터(원천·feature 속성·색인)에 삭제 id 0건
    #    geojson metadata·zones-meta 의 과거 작업 이력 메모는 기록이라 그대로 둔다.
    hits = []
    for rid in REMOVE_IDS:
        if rid in SOURCE.read_text(encoding="utf-8"):
            hits.append(f"seoul-zones.json:{rid}")
        if any(rid in json.dumps(f["properties"], ensure_ascii=False) for f in feats):
            hits.append(f"geojson feature 속성:{rid}")
        if rid in INDEX.read_text(encoding="utf-8"):
            hits.append(f"zone-index.json:{rid}")
    ok = not hits
    print(f"[{'OK' if ok else 'FAIL'}] 구역 데이터 내 삭제 id " + ("0건" if ok else " / ".join(hits)))
    bad += 0 if ok else 1

    # ⑦ metadata count
    ok = (geo.get("metadata") or {}).get("count") == EXPECTED_AFTER
    print(f"[{'OK' if ok else 'FAIL'}] geojson metadata.count = {(geo.get('metadata') or {}).get('count')}")
    bad += 0 if ok else 1
    return bad


def apply() -> int:
    head_feats = {f["properties"]["id"]: f for f in _head_geojson()["features"]}

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    n_src = len(src)
    if n_src not in (EXPECTED_BEFORE, EXPECTED_AFTER):
        raise SystemExit(f"[중단] 예상 밖 구역 수 {n_src}곳 — 원천 상태를 먼저 확인하세요")
    # 이름 확인 — 같은 id 라도 이름이 다르면 다른 곳을 지울 뻔한 것이므로 멈춘다
    for rid, name in REMOVE.items():
        hit = [z for z in src if z.get("id") == rid]
        if hit and (hit[0].get("name") or "").strip() != name:
            raise SystemExit(f"[중단] id {rid} 의 이름이 '{hit[0].get('name')}' — '{name}' 가 아닙니다")
    kept = [z for z in src if z.get("id") not in REMOVE]
    SOURCE.write_text(json.dumps(kept, **COMPACT), encoding="utf-8")
    print(f"[삭제] seoul-zones.json {n_src}곳 → {len(kept)}곳 (지움: {', '.join(REMOVE.values())})")

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    before = len(geo["features"])
    if before not in (EXPECTED_BEFORE, EXPECTED_AFTER):
        raise SystemExit(f"[중단] 예상 밖 feature 수 {before}곳")
    for rid, name in REMOVE.items():
        hits = [f for f in geo["features"] if f["properties"].get("id") == rid]
        if hits and (hits[0]["properties"].get("name") or "").strip() != name:
            raise SystemExit(f"[중단] geojson id {rid} 의 이름이 '{hits[0]['properties'].get('name')}'")
    geo["features"] = [f for f in geo["features"] if f["properties"].get("id") not in REMOVE]
    geo.setdefault("metadata", {})["count"] = len(geo["features"])

    # 남은 feature 는 HEAD 와 정확히 같아야 한다
    for f in geo["features"]:
        fid = f["properties"]["id"]
        old = head_feats.get(fid)
        if old is None or _norm(f["properties"]) != _norm(old["properties"]) or _norm(f.get("geometry")) != _norm(old.get("geometry")):
            raise SystemExit(f"[중단] {fid} 가 HEAD 와 달라졌습니다")
    GEOJSON.write_text(json.dumps(geo, **COMPACT), encoding="utf-8")
    print(f"[삭제] zones.geojson {before}곳 → {len(geo['features'])}곳 · metadata.count {geo['metadata']['count']}")

    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    sys.exit(apply())
