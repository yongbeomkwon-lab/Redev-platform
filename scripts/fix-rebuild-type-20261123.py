#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# 사업유형 오분류 교정 — 재건축 단지가 '일반재개발'로 찍혀 있던 문제 (2026-11-23)
#
#   원인
#     scripts/import-seoul-zones.py 의 MAPTYPE 이 서울플랜+ 코드정의표의
#     BZ104(재건축 단독)·BZ105(재건축 공동)를 옛 6색 분류 '일반재개발'로 묶고 있었다.
#     구역 소분류(kind)에는 '재건축(공동)'이 그대로 남아 있었지만, 지도·뱃지·필터가 쓰는
#     type 이 '일반재개발'이라 화면에는 '재개발'로 표시됐다.
#     (강남구 압구정·은마·개포·대치 등 30곳, 서울 전체 199곳)
#
#   교정
#     1) kind 가 재건축(공동)·재건축(단독)·재건축(공동재건축)·재건축 인 구역 → type '재건축'
#     2) kind 가 공공재개발 인데 type 이 일반재개발 로 남은 구역 → type '공공재개발'
#        (같은 계열의 기본값(일반재개발) 누락 버그)
#     3) public/data/zones.geojson 과 그 파이프라인 원천 src/data/seoul-zones.json 을 함께 고친다
#
#   실행: python3 scripts/fix-rebuild-type-20261123.py
# ─────────────────────────────────────────────────────────────────────────────
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / "public" / "data" / "zones.geojson"
SRC = ROOT / "src" / "data" / "seoul-zones.json"

REBUILD_KINDS = {"재건축(공동)", "재건축(단독)", "재건축(공동재건축)", "재건축"}
PUBLIC_REDEV_KIND = "공공재개발"


def target_type(kind: str | None, cur: str | None) -> str | None:
    """소분류(kind)를 기준으로 옳은 지도 사업유형 — 고칠 게 없으면 None"""
    k = (kind or "").strip()
    if k in REBUILD_KINDS and cur != "재건축":
        return "재건축"
    if k == PUBLIC_REDEV_KIND and cur != "공공재개발":
        return "공공재개발"
    return None


def main() -> int:
    geo = json.loads(GEO.read_text(encoding="utf-8"))
    src = json.loads(SRC.read_text(encoding="utf-8"))

    changed = []   # (gu, name, before, after)
    by_gu = Counter()
    for f in geo.get("features", []):
        p = f.get("properties") or {}
        nxt = target_type(p.get("kind"), p.get("type"))
        if not nxt:
            continue
        changed.append((p.get("gu") or "", p.get("name") or "", p.get("type"), nxt))
        by_gu[(p.get("gu") or "", nxt)] += 1
        p["type"] = nxt

    src_changed = 0
    for z in src:
        # 파이프라인 원천은 cls 코드(BZ104·BZ105)가 확실하다 — 이름·kind 와 함께 본다
        kind = z.get("kind")
        if z.get("cls") in ("BZ104", "BZ105") and z.get("type") != "재건축":
            z["type"] = "재건축"
            src_changed += 1
            continue
        nxt = target_type(kind, z.get("type"))
        if nxt:
            z["type"] = nxt
            src_changed += 1

    meta = geo.setdefault("metadata", {})
    rebuild_n = sum(1 for c in changed if c[3] == "재건축")
    public_n = sum(1 for c in changed if c[3] == "공공재개발")
    if rebuild_n or public_n:
        meta["rebuildType"] = {
            "asOf": "2026-11-23",
            "rebuild": rebuild_n,
            "publicRedev": public_n,
            "note": "서울플랜+ 코드정의표의 재건축(단독 BZ104·공동 BZ105) 구역이 옛 6색 분류로 '일반재개발'에 묶여 지도에 '재개발'로 표시되던 것을 소분류(kind) 기준으로 '재건축'으로 바로잡았습니다(강남·서초·송파 등 서울 전체). kind 가 '공공재개발'인데 일반재개발로 남은 3곳도 함께 바로잡았습니다.",
        }

    GEO.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SRC.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"zones.geojson — {len(changed)}곳 교정 (재건축 {rebuild_n} · 공공재개발 {public_n})")
    print(f"seoul-zones.json — {src_changed}곳 교정")
    for (gu, t), n in sorted(by_gu.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {gu or '(구 미상)'} → {t} {n}곳")
    return 0


if __name__ == "__main__":
    sys.exit(main())
