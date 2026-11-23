#!/usr/bin/env python3
"""송파117 모아타운 6곳 삭제 (2026-11-24, 사용자 지시 "송파 117구역 모두 일단 삭제해줘")

지우는 구역 (2026-11-23 에 넣었던 참고도 6곳 — 그때 전체 2,440곳)
  songpa117-moa-1 · songpa117-moa-2 · songpa117-moa-3 · songpa117-moa-4 · songpa117-moa-5
  songpa117-moa   (1~5구역을 묶은 부모 구역)
→ 삭제 후 2,434곳 (2,440 - 6)

건드리는 파일
  · src/data/seoul-zones.json        — 원천에서 6곳 제거
  · src/data/zones-meta.json         — songpa117MoaFix20261123 항목 제거
  · public/data/zones.geojson        — node scripts/export-geojson.mjs --force 로 재생성(의도적 삭제)
  · public/data/zone-index.json      — node scripts/build-zone-index.mjs 로 재생성

원칙: 송파117 6곳 **밖의** 구역은 하나도 사라지거나 속성·도형이 바뀌면 안 된다.
  그래서 삭제 전 커밋(HEAD)의 geojson 을 기준으로
    ① 남은 2,434곳의 id 집합이 정확히 (HEAD id − 6곳) 인지
    ② 남은 구역의 properties·geometry 가 HEAD 와 완전히 같은지(바이트 단위 비교)
  를 검사하고, 재생성 과정에서 다른 구역의 properties 가 달라지면 HEAD 값으로 되돌린다
  (export-geojson 은 경계 있는 구역의 center 를 빼기도 한다 — 2026-11-24 커밋 432c1d7 이 그 복구분).

실행: python3 scripts/remove-songpa117-moa-20261124.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
INDEX = ROOT / "public" / "data" / "zone-index.json"
META_KEY = "songpa117MoaFix20261123"

REMOVE_IDS = [
    "songpa117-moa-1",
    "songpa117-moa-2",
    "songpa117-moa-3",
    "songpa117-moa-4",
    "songpa117-moa-5",
    "songpa117-moa",
]
EXPECTED_BEFORE = 2440
EXPECTED_AFTER = 2434


def _head_geojson() -> dict:
    raw = subprocess.run(
        ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return json.loads(raw)


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def check() -> int:
    bad = 0
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    feats = geo["features"]

    # ① 개수
    ok = len(src) == EXPECTED_AFTER == len(feats) == index.get("count") == len(index.get("zones", []))
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 — seoul-zones {len(src)} · geojson {len(feats)} · "
          f"zone-index {index.get('count')} (기대 {EXPECTED_AFTER})")
    bad += 0 if ok else 1

    # ② 삭제 대상이 어디에도 없음
    leftovers = []
    for label, ids in (
        ("seoul-zones", [z.get("id") for z in src]),
        ("geojson", [f["properties"].get("id") for f in feats]),
        ("zone-index", [z.get("id") for z in index.get("zones", [])]),
    ):
        left = [i for i in ids if isinstance(i, str) and i.startswith("songpa117")]
        if left:
            leftovers.append(f"{label}: {left}")
    if META_KEY in meta:
        leftovers.append(f"zones-meta: {META_KEY}")
    if META_KEY in (geo.get("metadata") or {}):
        leftovers.append(f"geojson.metadata: {META_KEY}")
    ok = not leftovers
    print(f"[{'OK' if ok else 'FAIL'}] 송파117 잔여 참조 {len(leftovers)}건" + ("" if ok else " — " + " / ".join(leftovers)))
    bad += 0 if ok else 1

    # ③ 나머지 2,434곳 = HEAD 의 2,440곳 − 6곳 (id 집합이 정확히 일치)
    head = _head_geojson()["features"]
    head_by_id = {f["properties"]["id"]: f for f in head}
    expect_ids = set(head_by_id) - set(REMOVE_IDS)
    got_ids = {f["properties"]["id"] for f in feats}
    missing = sorted(expect_ids - got_ids)
    extra = sorted(got_ids - expect_ids)
    ok = not missing and not extra
    print(f"[{'OK' if ok else 'FAIL'}] 직전 커밋(432c1d7) 대비 — 사라진 구역 {len(missing)}곳 · 늘어난 구역 {len(extra)}곳")
    if missing:
        print("    사라짐:", missing[:10])
    if extra:
        print("    늘어남:", extra[:10])
    bad += 0 if ok else 1

    # ④ 남은 구역의 properties·geometry 가 HEAD 와 완전히 같음
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
                d = [k for k in keys if _norm(f["properties"].get(k)) != _norm(old["properties"].get(k))]
                examples.append(f"{fid}.{d[:4]}")
        if _norm(f.get("geometry")) != _norm(old.get("geometry")):
            geom_diff += 1
            if len(examples) < 5:
                examples.append(f"{fid}.geometry")
    ok = prop_diff == 0 and geom_diff == 0
    print(f"[{'OK' if ok else 'FAIL'}] 송파117 밖 구역 속성 변경 {prop_diff}곳 · 도형 변경 {geom_diff}곳"
          + ("" if ok else " — " + ", ".join(examples)))
    bad += 0 if ok else 1

    # ⑤ 세 파일에 'songpa117' 문자열이 한 군데도 없음 (원천·geojson·색인)
    hits = []
    for p in (SOURCE, GEOJSON, INDEX, META):
        n = p.read_text(encoding="utf-8").count("songpa117")
        if n:
            hits.append(f"{p.name}: {n}")
    ok = not hits
    print(f"[{'OK' if ok else 'FAIL'}] 데이터 파일 내 'songpa117' 문자열 " + ("0건" if ok else " / ".join(hits)))
    bad += 0 if ok else 1

    # ⑥ metadata count
    ok = (geo.get("metadata") or {}).get("count") == EXPECTED_AFTER
    print(f"[{'OK' if ok else 'FAIL'}] geojson metadata.count = {(geo.get('metadata') or {}).get('count')}")
    bad += 0 if ok else 1
    return bad


def _restore_untouched(head_feats: dict) -> None:
    """송파117 밖 구역 properties 를 HEAD 값으로 되돌린다(도형이 달라졌으면 중단)."""
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    restored, geom_bad, unknown = 0, [], []
    for f in geo["features"]:
        fid = f["properties"]["id"]
        old = head_feats.get(fid)
        if old is None:
            unknown.append(fid)
            continue
        if _norm(f.get("geometry")) != _norm(old.get("geometry")):
            geom_bad.append(fid)
        if _norm(f["properties"]) != _norm(old["properties"]):
            f["properties"] = old["properties"]
            restored += 1
    if geom_bad:
        raise SystemExit(f"[중단] 남은 구역의 도형이 {len(geom_bad)}곳 바뀌었습니다: {geom_bad[:5]}")
    if unknown:
        raise SystemExit(f"[중단] 직전 커밋에 없던 구역 {len(unknown)}곳: {unknown[:5]}")
    if restored:
        GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[보존] 송파117 밖 구역 properties 되돌림 {restored}곳 · 도형 변경 0곳")


def apply() -> int:
    head_feats = {f["properties"]["id"]: f for f in _head_geojson()["features"]}
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))

    before = len(src)
    kept = [z for z in src if z.get("id") not in REMOVE_IDS]
    removed = [z.get("id") for z in src if z.get("id") in REMOVE_IDS]
    if before not in (EXPECTED_BEFORE, EXPECTED_AFTER):
        raise SystemExit(f"[중단] 예상 밖 구역 수 {before}곳 — 원천 상태를 먼저 확인하세요")
    print(f"[삭제] seoul-zones.json {before}곳 → {len(kept)}곳 · 지운 구역 {len(removed)}곳 {removed}")
    SOURCE.write_text(json.dumps(kept, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    if META_KEY in meta:
        meta.pop(META_KEY)
        META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[삭제] zones-meta.json — {META_KEY} 항목 제거")
    else:
        print(f"[참고] zones-meta.json 에 {META_KEY} 없음")

    print("[내보내기] node scripts/export-geojson.mjs --force")
    subprocess.run(["node", "scripts/export-geojson.mjs", "--force"], cwd=ROOT, check=True)
    _restore_untouched(head_feats)

    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    sys.exit(apply())
