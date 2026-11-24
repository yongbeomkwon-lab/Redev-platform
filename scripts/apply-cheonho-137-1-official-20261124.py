#!/usr/bin/env python3
"""천호동 137-1 — 서울시 고시 지형도면(제2026-639호, 2026-11-19)의 빨간 점선 구역계를 그대로 반영 (2026-11-24)

## 왜
  사용자 지시(2026-11-24): "신통 천호동 137-1 구역경계 찾아서 그려줘"
  그동안 이 구역은 `geom: "미고시"` + 대표 지점(점선원)이었다. 2025-08-21 강동구 동의서 번호부여
  공개에는 도면이 없었고(안내문 PDF만), 2026-11-18 확보했다던 스캔본도 해상도·회전 때문에
  정합이 안 됐다. 이번에 **서울특별시고시 제2026-639호(2026-11-19) 건축허가 등 제한 지형도면**
  (서울시보 제4194호 82쪽, 천호동 137-1 도면은 인쇄면 89쪽)에 축척 1:1,500 도면이 실린 것을
  찾아 그 빨간 점선을 필지 단위로 옮겼다.

## 어떻게 옮겼나
  · 도면을 4배(≈5.4px/mm)로 렌더한 뒤, 지적선을 브이월드 연속지적도 필지 783개(강동구 천호동
    일대, `/api/parcel` 로 수집)와 대조해 축척(2.65655 px/m)·회전(-0.93°)·원점을 맞췄다.
    필지 정점·변 중점의 지적선까지 거리 중앙값 0.54m.
  · 빨간 점선(끊긴 대시)을 닫은 뒤 바깥 테두리를 따라 링을 뽑고 1.0m 허용오차로 단순화 → 89정점.
    실측 면적 52,552㎡ (고시 제한면적 52,552㎡와 일치).
  · 주변 구역(천호동 113-2 모아타운·천호3-1·천호3-2·천호동 84·98·110·221 등)과 겹침 0㎡ 확인.

## 무엇이 바뀌나
  · polygon(89정점) · ringPts · areaShape · geom "공고도면" · center(도형 bbox 중심)
  · boundaryNote·areaNote·note·sources·drawing·asOf 를 사실대로 갱신
  · scripts/data/official-rest17gu.json(파이프라인 원본)도 같은 값으로 맞춘다
  ※ 표기면적(area 52,552㎡)·단계·매물 연결은 그대로 둔다. 나머지 2,378곳은 건드리지 않는다.

실행: python3 scripts/apply-cheonho-137-1-official-20261124.py [--check]   (멱등)
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
META = ROOT / "src" / "data" / "zones-meta.json"
REST17 = ROOT / "scripts" / "data" / "official-rest17gu.json"
DATA = ROOT / "scripts" / "data" / "cheonho-137-1-official-20261124.json"
META_KEY = "cheonho137Official20261124"
ZID = "rest17gu-cheonho-137-1"
EXPECTED_COUNT = 2379
AREA_PUBLISHED = 52552

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}

SIBO_URL = "https://event.seoul.go.kr/seoulsibo/detailview.do?cn_seq=Mjc2NzI%3D&tr_code=snews"
GONGO_URL = "https://www.gangdong.go.kr/web/newportal/bbs/b_111/151026"

SOURCES = [
    {
        "label": "서울특별시고시 제2026-639호 「건축허가 등 제한 지형도면 고시」(2026-11-19) — 서울시보 제4194호 82쪽, 천호동 137-1 일대 도면 89쪽",
        "url": SIBO_URL,
    },
    {
        "label": "강동구 주택도시개발공지 「천호동 137-1번지 일대 신속통합기획 주택재개발사업 후보지 추천 여부 검토를 위한 동의서 번호 부여 내용 및 구역 공개」(2025-08-21)",
        "url": GONGO_URL,
    },
]

BOUNDARY_NOTE = (
    "서울특별시고시 제2026-639호(2026-11-19) 건축허가 등 제한 지형도면(서울시보 제4194호 82쪽, "
    "천호동 137-1 일대 도면은 인쇄면 89쪽·축척 1:1,500)의 빨간 점선 구역계를 필지 단위로 그대로 옮긴 "
    "경계입니다(89정점, 2026-11-24 반영). 같은 도면의 지적선을 브이월드 연속지적도 필지 783개와 "
    "대조해 축척·회전을 잡았고(지적선까지 거리 중앙값 0.54m), 실측 면적은 52,552㎡로 고시 제한면적 "
    "52,552㎡와 같습니다. 인접 구역(천호동 113-2 모아타운·천호3-1·천호3-2·천호동 84·98·110·221 등)과 "
    "겹치는 면적은 0㎡입니다. 이 구역계는 후보지 신청인(추진주체)이 제출한 것으로 신속통합기획·"
    "정비계획 수립과 정비구역 지정 과정에서 조정될 수 있습니다."
)

AREA_NOTE = (
    "고시 제한면적 52,552㎡(서울특별시고시 제2026-639호, ’26년 제4차 신통기획 후보지 상정구역)와 "
    "도면의 구역계를 옮긴 도형 면적 52,552㎡가 일치합니다."
)

NOTE_ADD = (
    " 이후 2026-11-13 제4차 신속통합기획 주택재개발 후보지 선정위원회에서 후보지로 선정됐고, "
    "2026-11-19 서울특별시고시 제2026-639호로 건축허가 등 제한 지형도면이 고시되면서 구역계 도면이 "
    "공개됐습니다. 지도 경계는 그 도면의 빨간 점선을 그대로 옮긴 것입니다."
)


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def _center(ring):
    lats = [p[0] for p in ring]
    lngs = [p[1] for p in ring]
    return [round((min(lats) + max(lats)) / 2, 6), round((min(lngs) + max(lngs)) / 2, 6)]


def _entry():
    d = _data()
    ring = d["ring"]
    if len(ring) < 3:
        raise SystemExit("[중단] 링 정점이 모자랍니다")
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    hit = next((z for z in src if z.get("id") == ZID), None)
    if hit is None:
        raise SystemExit(f"[중단] {ZID} 가 seoul-zones.json 에 없습니다")
    entry = dict(hit)
    base_note = hit.get("note", "").split(" 이후 2026-11-13")[0]
    entry["polygon"] = ring
    entry.pop("holes", None)
    entry.pop("parts", None)
    entry.pop("dividers", None)
    entry["geom"] = "공고도면"
    entry["boundaryApprox"] = False
    entry["area"] = AREA_PUBLISHED
    entry["areaShape"] = round(d["areaShape"])
    entry["ringPts"] = len(ring)
    entry["center"] = _center(ring)
    entry["asOf"] = "2026-11-19"
    entry["note"] = base_note + NOTE_ADD
    entry["areaNote"] = AREA_NOTE
    entry["boundaryNote"] = BOUNDARY_NOTE
    entry["sources"] = SOURCES
    entry["drawing"] = "downloads/천호동_137_1_공고도면.png"
    return entry, d


def _head(path: str):
    try:
        raw = subprocess.run(
            ["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def check() -> int:
    bad = 0
    entry, d = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    z = next((x for x in src if x.get("id") == ZID), None)
    f = _feat(geo, ZID)

    ok = (
        len(src) == len(geo["features"]) == EXPECTED_COUNT
        and index.get("count") == EXPECTED_COUNT
        and (geo.get("metadata") or {}).get("count") == EXPECTED_COUNT
    )
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    bad += 0 if ok else 1

    ok = bool(z) and _norm(z.get("polygon")) == _norm(entry["polygon"])
    print(f"[{'OK' if ok else 'FAIL'}] {ZID} 도형(외곽 {len(entry['polygon'])}정점) 일치")
    bad += 0 if ok else 1

    geo_ring = (((f or {}).get("geometry") or {}).get("coordinates") or [[]])[0]
    body = geo_ring[:-1] if len(geo_ring) > 1 and geo_ring[0] == geo_ring[-1] else geo_ring
    same = len(body) == len(entry["polygon"]) and all(
        abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(body, entry["polygon"])
    )
    print(f"[{'OK' if same else 'FAIL'}] geojson 좌표 일치 ({len(body)}정점)")
    bad += 0 if same else 1

    props = (f or {}).get("properties") or {}
    ok = (
        props.get("geom") == "공고도면"
        and props.get("area") == AREA_PUBLISHED
        and abs((props.get("areaShape") or 0) - d["areaShape"]) <= 1
        and isinstance(props.get("sources"), list)
        and all(isinstance(s, dict) and s.get("url") for s in props.get("sources") or [])
    )
    print(f"[{'OK' if ok else 'FAIL'}] geojson 속성 — geom {props.get('geom')} · area {props.get('area')} · "
          f"areaShape {props.get('areaShape')} · sources {len(props.get('sources') or [])}건")
    bad += 0 if ok else 1

    idx = next((x for x in index["zones"] if x.get("id") == ZID), None)
    ok = bool(idx) and idx.get("name") == "천호동 137-1" and "천호동 137-1" in (idx.get("alias") or [])
    print(f"[{'OK' if ok else 'FAIL'}] zone-index 색인 유지 (이름·별칭)")
    bad += 0 if ok else 1

    head = _head("src/data/seoul-zones.json")
    if head is not None:
        old_by = {x.get("id"): x for x in head}
        diff = [x["id"] for x in src if x.get("id") != ZID and _norm(x) != _norm(old_by.get(x.get("id")))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(src) - 1}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old_by = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] != ZID and _norm(x) != _norm(old_by.get(x["properties"]["id"]))]
        print(f"[{'OK' if not diff else 'FAIL'}] geojson 나머지 구역 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1

    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY}")
    bad += 0 if ok else 1

    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    entry, d = _entry()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if len(src) != EXPECTED_COUNT:
        raise SystemExit(f"[중단] 예상 밖 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    old = next((z for z in src if z.get("id") == ZID), None)
    if old is None:
        raise SystemExit(f"[중단] {ZID} 없음")
    old.clear()
    old.update(entry)
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")
    print(f"[반영] seoul-zones.json {ZID} — {len(entry['polygon'])}정점 · 계측 {d['areaShape']:,.0f}㎡ "
          f"(고시 {AREA_PUBLISHED:,}㎡)")

    meta[META_KEY] = {
        "asOf": "2026-11-19",
        "zones": [ZID],
        "note": (
            "천호동 137-1 구역계를 서울특별시고시 제2026-639호(2026-11-19) 지형도면의 빨간 점선 "
            f"그대로(89정점)로 넣음 — 실측 {d['areaShape']:,.0f}㎡, 고시 제한면적 {AREA_PUBLISHED:,}㎡."
        ),
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[반영] zones-meta.json — {META_KEY}")

    # 파이프라인 원본(official-rest17gu.json)도 같은 값으로
    if REST17.exists():
        doc = json.loads(REST17.read_text(encoding="utf-8"))
        doc.setdefault("sources", {})["seoul-gs-2026-639"] = (
            "서울특별시고시 제2026-639호 「건축허가 등 제한 지형도면 고시」(2026-11-19) — "
            f"서울시보 제4194호 82쪽, 천호동 137-1 도면 89쪽 {SIBO_URL}"
        )
        for item in doc.get("additions", []):
            if item.get("id") != ZID:
                continue
            item["polygon"] = [entry["polygon"]]
            item["boundary"] = "공고도면"
            item["center"] = entry["center"]
            item["boundaryNote"] = entry["boundaryNote"]
            item["areaNote"] = entry["areaNote"]
            item["note"] = entry["note"]
            item["drawing"] = entry["drawing"]
            keys = [k for k in (item.get("sources") or []) if k != "seoul-gs-2026-639"]
            item["sources"] = ["seoul-gs-2026-639", *keys]
        doc["asOf"] = "2026-11-19"
        REST17.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        print("[반영] scripts/data/official-rest17gu.json — 같은 구역계·출처")

    print("\n다음: npm run geojson && node scripts/build-zone-index.mjs")
    return 0


if __name__ == "__main__":
    if "--check" in sys.argv:
        raise SystemExit(1 if check() else 0)
    apply()
