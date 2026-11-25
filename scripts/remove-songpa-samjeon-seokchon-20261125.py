#!/usr/bin/env python3
"""
송파구 (가)삼전동1·2·3 / (가)석촌고분1·2 — 정식 데이터에서 삭제 (2026-11-25, 대표 요청)

  · 대표님이 캡처를 보내며 "빨간색 민간도심 전부 다 삭제해줘"라고 지시했고,
    곧 "내가 준 이미지"라며 **삭제 대상은 그 캡처에 나온 5곳뿐**이라고 정정했다.
    → 민간도심복합 19곳 중 이 5곳만 지운다.
    · 대치동 900·954 민도복, 중곡동 B4·B5·C3·C4, 반포1동 1·2, 내방1지구, 도선동 332,
      사당동 419, 증산역세권, 자양동 10, 방배동 952-2 는 **그대로 둔다.**
    · 도공복(도심공공주택복합, 47곳)은 민간도심복합이 아니라 손대지 않는다.

  · 지우기 전에 지운 내용 그대로를 backups/redev-removed-minkan-dosim-20261125.json 에 남긴다
    (zones.geojson feature · seoul-zones.json 항목 · zone-index.json 항목 ·
     recent-zones.json 항목 · zones-meta.json 반영 기록).
  · 손대는 파일
      public/data/zones.geojson      (지도·탐색기가 실제로 받는 데이터)
      src/data/seoul-zones.json      (같은 목록의 빌드용 사본)
      public/data/zone-index.json    (커뮤니티 구역 고르기 색인)
      public/data/recent-zones.json  (⚡ 최근 변동 구역 목록 — 없는 구역을 가리키지 않게)
      src/data/zones-meta.json       (반영 기록 블록만 제거)
  · 멱등 — 두 번 돌려도 결과가 같다. 이미 지운 상태면 아무 것도 바꾸지 않는다.

실행: python3 scripts/remove-songpa-samjeon-seokchon-20261125.py [--check]
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "public" / "data" / "zones.geojson"
SEOUL = ROOT / "src" / "data" / "seoul-zones.json"
INDEX = ROOT / "public" / "data" / "zone-index.json"
RECENT = ROOT / "public" / "data" / "recent-zones.json"
META = ROOT / "src" / "data" / "zones-meta.json"
BACKUP = ROOT.parent / "backups" / "redev-removed-minkan-dosim-20261125.json"

IDS = [
    "songpa-samjeon-1",
    "songpa-samjeon-2",
    "songpa-samjeon-3",
    "songpa-seokchongobun-1",
    "songpa-seokchongobun-2",
]
META_KEY = "songpaSamjeonSeokchonFix20261123"
CHECK = "--check" in sys.argv


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p, data, indent=None, ensure_ascii=False):
    """파일별 기존 서식 그대로 쓴다 — 지도 데이터는 한 줄(용량), zones-meta 는 indent=1."""
    if CHECK:
        return
    sep = (",", ":") if indent is None else None
    text = json.dumps(data, ensure_ascii=ensure_ascii, indent=indent, separators=sep)
    p.write_text(text + ("\n" if indent is not None else ""), encoding="utf-8")


def main():
    ids = set(IDS)

    geo = load(GEO)
    seoul = load(SEOUL)
    index = load(INDEX)
    recent = load(RECENT)
    meta = load(META)

    hit_feat = [f for f in geo["features"] if f["properties"].get("id") in ids]
    hit_seoul = [z for z in seoul if z.get("id") in ids]
    hit_index = [z for z in index["zones"] if z.get("id") in ids]
    hit_recent = [z for z in recent["zones"] if z.get("id") in ids]
    meta_block = meta.get(META_KEY)
    geo_meta_block = (geo.get("metadata") or {}).get(META_KEY)

    print(f"zones.geojson {len(hit_feat)}/{len(geo['features'])} · seoul-zones {len(hit_seoul)}/{len(seoul)} · "
          f"zone-index {len(hit_index)}/{len(index['zones'])} · recent {len(hit_recent)}/{len(recent['zones'])}")

    if not CHECK and (hit_feat or hit_seoul or hit_index or hit_recent or meta_block or geo_meta_block):
        BACKUP.parent.mkdir(parents=True, exist_ok=True)
        prev = load(BACKUP) if BACKUP.exists() else {}
        backup = {
            "meta": {
                "createdAt": prev.get("meta", {}).get("createdAt") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "reason": "대표 요청(2026-11-25) — 캡처에 나온 빨간 민간도심복합 5곳((가)삼전동1·2·3, (가)석촌고분1·2)을 정식 데이터에서 삭제. "
                          "나머지 민간도심복합 14곳과 도공복 47곳은 유지.",
                "ids": [z["properties"]["id"] for z in hit_feat] or prev.get("meta", {}).get("ids", []),
                "files": {
                    "zones.geojson": "features[] 항목",
                    "seoul-zones.json": "배열 항목",
                    "zone-index.json": "zones[] 항목",
                    "recent-zones.json": "zones[] 항목",
                    "zones-meta.json": f"'{META_KEY}' 블록",
                },
                "restore": "각 파일의 배열에 features·seoulZones·zoneIndex·recentZones 항목을 그대로 다시 넣고 "
                           "zones.geojson metadata.count 와 zone-index count 를 늘리면 원상복구된다. "
                           "(또는 scripts/apply-songpa-samjeon-seokchon-20261122.py 재실행)",
            },
            "features": prev.get("features") or hit_feat,
            "seoulZones": prev.get("seoulZones") or hit_seoul,
            "zoneIndex": prev.get("zoneIndex") or hit_index,
            "recentZones": prev.get("recentZones") or hit_recent,
            "zonesMetaBlock": prev.get("zonesMetaBlock") or ({META_KEY: meta_block} if meta_block else {}),
            "geojsonMetaBlock": prev.get("geojsonMetaBlock") or ({META_KEY: geo_meta_block} if geo_meta_block else {}),
        }
        dump(BACKUP, backup, indent=2)
        print(f"백업: {BACKUP.relative_to(ROOT.parent)}")

    if hit_feat:
        geo["features"] = [f for f in geo["features"] if f["properties"].get("id") not in ids]
        if isinstance(geo.get("metadata"), dict) and isinstance(geo["metadata"].get("count"), int):
            geo["metadata"]["count"] = len(geo["features"])
        dump(GEO, geo)
        print(f"[삭제] zones.geojson → {len(geo['features'])}곳")

    if hit_seoul:
        seoul = [z for z in seoul if z.get("id") not in ids]
        dump(SEOUL, seoul)
        print(f"[삭제] seoul-zones.json → {len(seoul)}곳")

    if hit_index:
        index["zones"] = [z for z in index["zones"] if z.get("id") not in ids]
        index["count"] = len(index["zones"])
        dump(INDEX, index)
        print(f"[삭제] zone-index.json → {len(index['zones'])}곳")

    if hit_recent:
        recent["zones"] = [z for z in recent["zones"] if z.get("id") not in ids]
        dump(RECENT, recent)
        print(f"[삭제] recent-zones.json → {len(recent['zones'])}곳")

    if meta_block:
        del meta[META_KEY]
        dump(META, meta, indent=1)
        print(f"[삭제] zones-meta.json — '{META_KEY}' 블록")

    if geo_meta_block:
        del geo["metadata"][META_KEY]
        dump(GEO, geo)
        print(f"[삭제] zones.geojson metadata — '{META_KEY}' 블록")

    if not (hit_feat or hit_seoul or hit_index or hit_recent or meta_block):
        print("이미 삭제된 상태 — 바꾼 것 없음")

    # 결과 확인 — 남은 민간도심복합 수
    left = {}
    for f in geo["features"]:
        t = f["properties"].get("type")
        if t in ("민간도심복합(성장거점형)", "민간도심복합(주거중심형)"):
            left[t] = left.get(t, 0) + 1
    print("남은 민간도심복합:", left, "· 도공복:", sum(1 for f in geo["features"] if f["properties"].get("type") == "도공복"))


if __name__ == "__main__":
    main()
