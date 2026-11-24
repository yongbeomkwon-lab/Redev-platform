#!/usr/bin/env python3
"""자율주택정비사업 **500㎡ 미만** 54곳 삭제 (2026-11-24, 사용자 지시)

사용자가 「양재동 400-11」(자율주택정비사업 238㎡ = 72평)을 보며
  “재개발이 아니라 그냥 빌라 업자가 신축하는거 아니야?” → “없애”
라고 지시했다. 같은 성격(빌라 한 동 신축 규모)의 자율주택정비사업을 함께 정리한다.

지우는 조건(둘 다 만족)
  · kind == "자율주택정비사업"
  · area < 500 (㎡)
  → 54곳 (양재동 400-11 238㎡ · 양재동 280-4 264㎡ 포함)

그대로 두는 곳
  · 자율주택정비사업 500㎡ 이상 22곳
  · 다른 사업유형 전부(가로주택정비사업 725곳 등) — 속성·도형이 바이트 단위로 그대로여야 한다.
  · 삭제 대상이 아닌 나머지 구역 전체.

건드리는 파일
  · src/data/seoul-zones.json     — 원천에서 54곳 제거
  · public/data/zones.geojson     — feature 54개 제거 + metadata.count
                                    (재생성 없이 직접 제거: export-geojson --force 는 다른 구역 center 를 다시 계산한다)
  · public/data/zone-index.json   — node scripts/build-zone-index.mjs 로 재생성

지운 데이터 백업
  · ../../backups/redev-removed-small-jayu-20261124.json (워크스페이스 backups/, 저장소 밖)
    — 삭제 직전에 원본 레코드·feature 를 그대로 담는다. 되돌리려면 이 파일로 복원하거나
      `git revert` 로 이 커밋을 되돌린다.

실행: python3 scripts/remove-small-jayu-20261124.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
INDEX = ROOT / "public" / "data" / "zone-index.json"
BACKUP = ROOT.parent / "backups" / "redev-removed-small-jayu-20261124.json"

KIND = "자율주택정비사업"
MAX_AREA = 500  # 이 값 미만을 지운다
EXPECTED_REMOVE = 54
EXPECTED_BEFORE = 2430
EXPECTED_AFTER = EXPECTED_BEFORE - EXPECTED_REMOVE  # 2376
# 자율주택정비사업 500㎡ 이상 — 지우지 않고 그대로 남아야 한다
EXPECTED_JAYU_KEEP = 22
# 비교 기준 커밋 — 삭제 직전 상태(2,430곳). HEAD 는 이미 지운 뒤라 기준으로 쓰지 않는다.
BASELINE = "9170dae"

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def is_target(z: dict) -> bool:
    return z.get("kind") == KIND and (z.get("area") or 0) < MAX_AREA


def _node() -> str:
    """node 실행 파일 — PATH 에 없으면 워크스페이스에 내려받아 둔 로컬 node 를 쓴다."""
    exe = shutil.which("node")
    if exe:
        return exe
    local = ROOT.parent / ".tools" / "node-v22.14.0-linux-x64" / "bin" / "node"
    return str(local) if local.exists() else "node"


def _build_index() -> None:
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run([_node(), "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)


def _head_geojson() -> dict:
    """삭제 직전 기준(BASELINE 커밋)의 zones.geojson — 헤드가 아니라 고정 기준을 본다."""
    raw = subprocess.run(
        ["git", "show", f"{BASELINE}:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return json.loads(raw)


def _ids_in_head_that_should_stay() -> set[str]:
    """HEAD 기준, 지우면 안 되는 구역 id — 다른 유형 전체 + 자율주택 500㎡ 이상."""
    head = _head_geojson()
    return {
        f["properties"]["id"]
        for f in head["features"]
        if not (f["properties"].get("kind") == KIND and (f["properties"].get("area") or 0) < MAX_AREA)
    }


def check() -> int:
    bad = 0
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    feats = geo["features"]

    # ① 개수
    ok = len(src) == EXPECTED_AFTER == len(feats) == index.get("count") == len(index.get("zones", []))
    print(
        f"[{'OK' if ok else 'FAIL'}] 구역 수 — seoul-zones {len(src)} · geojson {len(feats)} · "
        f"zone-index {index.get('count')} (기대 {EXPECTED_AFTER})"
    )
    bad += 0 if ok else 1

    # ② 500㎡ 미만 자율주택정비사업 0곳
    left_src = [z["id"] for z in src if is_target(z)]
    left_geo = [f["properties"]["id"] for f in feats if f["properties"].get("kind") == KIND and (f["properties"].get("area") or 0) < MAX_AREA]
    left_idx = [z["id"] for z in index.get("zones", []) if z["id"] in set(left_src) | set(left_geo)]
    ok = not left_src and not left_geo and not left_idx
    print(f"[{'OK' if ok else 'FAIL'}] 500㎡ 미만 자율주택정비사업 잔여 — 원천 {len(left_src)} · geojson {len(left_geo)} · 색인 {len(left_idx)}")
    bad += 0 if ok else 1

    # ③ 자율주택정비사업 500㎡ 이상은 그대로
    keep_src = [z for z in src if z.get("kind") == KIND]
    keep_geo = [f for f in feats if f["properties"].get("kind") == KIND]
    ok = len(keep_src) == EXPECTED_JAYU_KEEP == len(keep_geo) and all((z.get("area") or 0) >= MAX_AREA for z in keep_src)
    print(f"[{'OK' if ok else 'FAIL'}] 자율주택정비사업 500㎡ 이상 유지 — 원천 {len(keep_src)} · geojson {len(keep_geo)} (기대 {EXPECTED_JAYU_KEEP})")
    bad += 0 if ok else 1

    # ④ 남은 feature 는 HEAD 와 속성·도형이 정확히 같아야 한다
    head_by_id = {f["properties"]["id"]: f for f in _head_geojson()["features"]}
    should_stay = _ids_in_head_that_should_stay()
    got_ids = {f["properties"]["id"] for f in feats}
    missing = sorted(should_stay - got_ids)
    extra = sorted(got_ids - set(head_by_id))
    ok = not missing and not extra
    print(f"[{'OK' if ok else 'FAIL'}] 지우면 안 되는 구역 중 사라진 곳 {len(missing)} · 새로 생긴 곳 {len(extra)}")
    if missing:
        print("    사라짐:", missing[:10])
    if extra:
        print("    늘어남:", extra[:10])
    bad += 0 if ok else 1

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
                examples.append(
                    f"{fid}." + str([k for k in keys if _norm(f["properties"].get(k)) != _norm(old["properties"].get(k))][:4])
                )
        if _norm(f.get("geometry")) != _norm(old.get("geometry")):
            geom_diff += 1
            if len(examples) < 5:
                examples.append(f"{fid}.geometry")
    ok = prop_diff == 0 and geom_diff == 0
    print(f"[{'OK' if ok else 'FAIL'}] 나머지 구역 속성 변경 {prop_diff}곳 · 도형 변경 {geom_diff}곳" + ("" if ok else " — " + ", ".join(examples)))
    bad += 0 if ok else 1

    # ⑤ metadata count
    ok = (geo.get("metadata") or {}).get("count") == EXPECTED_AFTER
    print(f"[{'OK' if ok else 'FAIL'}] geojson metadata.count = {(geo.get('metadata') or {}).get('count')}")
    bad += 0 if ok else 1

    # ⑥ 사업유형별 개수 — 자율주택정비사업만 54줄고 나머지는 HEAD 와 같아야 한다
    from collections import Counter

    head_kinds = Counter(f["properties"].get("kind") for f in _head_geojson()["features"])
    now_kinds = Counter(f["properties"].get("kind") for f in feats)
    diffs = {k: (head_kinds[k], now_kinds.get(k, 0)) for k in head_kinds if head_kinds[k] != now_kinds.get(k, 0)}
    ok = diffs == {KIND: (EXPECTED_JAYU_KEEP + EXPECTED_REMOVE, EXPECTED_JAYU_KEEP)}
    print(f"[{'OK' if ok else 'FAIL'}] 사업유형별 변화 — {diffs}")
    bad += 0 if ok else 1
    return bad


def apply() -> int:
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    n_src = len(src)
    if n_src not in (EXPECTED_BEFORE, EXPECTED_AFTER):
        raise SystemExit(f"[중단] 예상 밖 구역 수 {n_src}곳 — 원천 상태를 먼저 확인하세요")

    targets = [z for z in src if is_target(z)]
    if len(targets) not in (0, EXPECTED_REMOVE):
        raise SystemExit(f"[중단] 500㎡ 미만 자율주택정비사업이 {len(targets)}곳 — 기대 54곳과 다릅니다(조건을 다시 확인하세요)")
    for z in targets:
        if not (z.get("kind") == KIND and 0 < (z.get("area") or 0) < MAX_AREA):
            raise SystemExit(f"[중단] {z.get('id')} 가 삭제 조건에 맞지 않습니다: kind={z.get('kind')} area={z.get('area')}")
    remove_ids = {z["id"] for z in targets}

    if remove_ids:
        # ── 백업 (저장소 밖 워크스페이스 backups/) ──────────────────────────────
        geo_target_feats = [f for f in geo["features"] if f["properties"].get("id") in remove_ids]
        BACKUP.parent.mkdir(parents=True, exist_ok=True)
        BACKUP.write_text(
            json.dumps(
                {
                    "createdAt": datetime.now(timezone.utc).astimezone().isoformat(),
                    "reason": "자율주택정비사업 500㎡ 미만 54곳 삭제 (2026-11-24 사용자 지시 · 양재동 400-11 238㎡ 포함)",
                    "condition": {"kind": KIND, "area": f"< {MAX_AREA}"},
                    "count": len(targets),
                    "zones": targets,
                    "features": geo_target_feats,
                    "metadata": geo.get("metadata"),
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
        print(f"[백업] {len(targets)}곳 → {BACKUP}")

        kept = [z for z in src if z["id"] not in remove_ids]
        SOURCE.write_text(json.dumps(kept, **COMPACT), encoding="utf-8")
        print(f"[삭제] seoul-zones.json {n_src}곳 → {len(kept)}곳")

        head_by_id = {f["properties"]["id"]: f for f in _head_geojson()["features"]}
        before = len(geo["features"])
        geo["features"] = [f for f in geo["features"] if f["properties"].get("id") not in remove_ids]
        geo.setdefault("metadata", {})["count"] = len(geo["features"])
        # 남은 feature 가 HEAD 와 달라졌으면 되돌린다
        for f in geo["features"]:
            fid = f["properties"]["id"]
            old = head_by_id.get(fid)
            if old is None or _norm(f["properties"]) != _norm(old["properties"]) or _norm(f.get("geometry")) != _norm(old.get("geometry")):
                raise SystemExit(f"[중단] {fid} 가 HEAD 와 달라졌습니다")
        GEOJSON.write_text(json.dumps(geo, **COMPACT), encoding="utf-8")
        print(f"[삭제] zones.geojson {before}곳 → {len(geo['features'])}곳 · metadata.count {geo['metadata']['count']}")

        print("[색인] node scripts/build-zone-index.mjs")
        _build_index()
    else:
        print("[건너뜀] 지울 구역이 없습니다(이미 반영됨) — 색인만 다시 만듭니다")
        _build_index()
    return check()


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    sys.exit(apply())
