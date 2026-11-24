#!/usr/bin/env python3
"""양재동 374 · 382(양재동 380) · 397-1 — 대표가 직접 그린 경계로 3곳 정식 반영 (2026-11-24)

## 왜
  2026-11-24 대표 지시: "다 반영해줘".
    앞서(커밋 9170dae) 이 3곳을 데이터에서 빼 두었고, 대표가 관리자 화면(?admin=1)에서
    지도에 직접 그려 /api/custom-zones 에 3개 초안으로 남겨 두었다. 그 도형을 일반 방문자가
    보는 정식 구역 데이터에 그대로 넣는다. 초안(admin-…)은 배포·확인 뒤 DB에서 지운다.

## 무엇
  · 속성(이름·단계·구·사업유형·면적·설명·출처)은 삭제 직전 커밋(9170dae^)의 항목을 그대로 쓰고,
  · 도형만 대표가 그린 폴리곤으로 바꾼다. (scripts/data/yangjae-user-drawn-20261124.json)
  · 2,376 → 2,379곳.

  id 매핑 (초안 → 정식)
    admin-mwu03fqh-6f4nl  양재동 374      → 11000UQ120PS202503070074  양재동 374
    admin-mwu01lgl-7ofnr  양재동 380      → 11000UQ120PS202503070075  양재동 382   (+ alias '양재동 380')
    admin-mwu09p3s-dk8jl  양재동 397-1    → yangjae-397-1  양재동 397-1 일대(모아통합기획)

  손보는 곳
    · geom — 세 곳 모두 "직접작도"(지도에서 직접 그린 경계)로 바꾸고, boundaryNote 에
      어떤 도면을 참고했는지·어디를 어떻게 맞췄는지 적는다. (기존 '고시도면'/'공고도면' 라벨은
      그 도면에서 옮긴 **제 도형**을 가리키는 것이라, 대표 도형에 그대로 쓰면 사실과 달라진다)
    · areaShape — 대표 도형의 계측 면적(EPSG:5179). area(표기 면적)는 고시·공고 값을 그대로 둔다.
    · type — 397-1 은 대표가 고른 "모아타운통합기획"(kind 는 '모아타운(모아통합기획)' 유지).
      지도 필터 칩 '모아타운'이 ["모아타운","모아타운통합기획"] 둘 다 거르므로 필터에서 빠지지 않는다.

## 원칙
  · 이 3곳 밖의 구역은 하나도 사라지거나 속성·도형이 바뀌면 안 된다 → 직전 커밋(HEAD)과
    바이트 단위로 비교하고, 다르면 실패로 본다.
  · 대표가 그린 좌표는 [위도, 경도] 이고 폐합점이 없다 → GeoJSON [경도, 위도] 로 바꾸고
    첫 점 = 끝 점으로 닫는다.

실행: python3 scripts/apply-yangjae-user-drawn-20261124.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "yangjae-user-drawn-20261124.json"
META_KEY = "yangjaeUserDrawnFix20261124"

EXPECTED_BEFORE = 2376
EXPECTED_AFTER = 2379

IDS = ["11000UQ120PS202503070074", "11000UQ120PS202503070075", "yangjae-397-1"]

AREA_374 = (
    "표기 면적 33,816㎡는 서울특별시고시 제2025-476호(2025-08-28) 변경면적 45,953.2㎡(기정 65,070㎡)에서 "
    "2026-01-22 자문회의로 제척된 A3(369번지 일대, 약 12,137㎡)를 덜어낸 잔여 A2 값입니다. "
    "지도 도형은 2026-11-24 대표가 지도에서 직접 그린 경계로, 계측 면적은 {shape}㎡(표기 대비 {pct}%)입니다. "
    "관리계획(안) 고시로 구역계가 확정되면 그 값으로 대체해야 합니다."
)
BOUND_374 = (
    "2026-11-24 리디브 지도 관리자 화면에서 대표가 직접 그린 9정점 경계입니다. 서울특별시고시 제2025-476호 "
    "변경 관계도면(A2+A3)과 2026-07-09 서초구 「전문가 자문회의 결과에 따른 구역 제척 안내」를 참고해, "
    "고시 도면 스캔을 지도에 얹을 때 생긴 3~6m 정합 오차를 지적편집도 도로선에 맞춰 바로잡았습니다. "
    "A3(369번지 일대) 자리는 도로선을 따라 직각으로 잘랐습니다. 이웃 382(양재동 380)·397-1 구역과는 "
    "겹침 0㎡, 도로 폭 3~5m 간격으로 마주 봅니다. 정밀 측량값이 아니므로 관리계획 고시 도면과 대조가 필요합니다."
)

AREA_382 = (
    "표기 면적 36,683㎡는 서울특별시고시 제2025-476호(2025-08-28) 변경면적(기정 74,515㎡에서 B1·B2 제척 후 "
    "B3+B4)입니다. 지도 도형은 2026-11-24 대표가 지도에서 직접 그린 경계로, 계측 면적은 {shape}㎡"
    "(표기 대비 {pct}%)입니다. 관리계획(안) 수립 중이라 범위는 조정될 수 있습니다."
)
BOUND_382 = (
    "2026-11-24 리디브 지도 관리자 화면에서 대표가 직접 그린 6정점 경계입니다. 서울특별시고시 제2025-476호 "
    "변경 관계도면(B3+B4)을 참고했고, 도면을 옮길 때 남동쪽 양재대로 쪽으로 삐져나오던 부분을 약 22m 북서로 "
    "올려 도로 안쪽 블록선에 맞췄습니다. 이웃 374·397-1 구역과는 겹침 0㎡, 도로 폭 3~5m 간격으로 마주 봅니다. "
    "대표가 부르는 지번 '양재동 380'으로도 검색됩니다. 정밀 측량값이 아니므로 관리계획 고시 도면과 대조가 필요합니다."
)

AREA_397 = (
    "서초구 공고문은 구역면적을 '약 4.1만㎡'로만 안내하고, 재개발닷컴 집계값 41,005㎡를 표기 면적으로 두었습니다. "
    "지도 도형은 2026-11-24 대표가 지도에서 직접 그린 경계로, 계측 면적은 {shape}㎡(표기 대비 {pct}%)입니다. "
    "공개된 구역계보다 사방 도로선까지 넓게 잡혀 있어 차이가 큰 편이므로, 후보지 추천·자치구 협의 도면과 "
    "대조한 뒤 확정값으로 대체해야 합니다."
)
BOUND_397 = (
    "2026-11-24 리디브 지도 관리자 화면에서 대표가 직접 그린 8정점 경계입니다. 서초구 「구역계_공개_안내문」"
    "(2026-11-19) 도면을 기준으로 삼아 사방 도로선까지 채웠고, 사업예정구역 2곳과 종교부지(존치구역)를 모두 "
    "포함한 바깥 구역계입니다. 이웃 374·382(양재동 380) 구역과는 겹침 0㎡, 도로 폭 3~5m 간격으로 마주 봅니다. "
    "이 구역계는 신청인이 제출한 것으로 후보지 추천·자치구 협의 과정에서 조정될 수 있으며, 정밀 측량값이 아닙니다."
)

ALIAS_382 = ["양재동 380", "양재동 380번지", "양재 380"]

OVERRIDES = {
    "11000UQ120PS202503070074": {"geom": "직접작도", "areaNote": AREA_374, "boundaryNote": BOUND_374},
    "11000UQ120PS202503070075": {"geom": "직접작도", "areaNote": AREA_382, "boundaryNote": BOUND_382, "alias": ALIAS_382},
    "yangjae-397-1": {"geom": "직접작도", "areaNote": AREA_397, "boundaryNote": BOUND_397, "type": "모아타운통합기획"},
}

META_ENTRY = {
    "asOf": "2026-11-24",
    "zones": IDS,
    "note": (
        "양재동 374·382(양재동 380)·397-1 3곳을 대표가 지도에서 직접 그린 경계로 정식 반영(2,376 → 2,379곳). "
        "속성은 삭제 직전(2026-11-24) 값을 그대로 쓰고 도형만 교체했으며, 세 곳 모두 geom='직접작도'. "
        "397-1 사업유형은 '모아타운통합기획'(kind '모아타운(모아통합기획)'). 서로 겹침 0㎡·도로 폭 3~5m 간격."
    ),
}

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _measure(ring_lat_lng) -> float:
    """대표 도형의 계측 면적(㎡) — 데이터 전체와 같은 한국 좌표계(EPSG:5179)."""
    from pyproj import Transformer
    from shapely.geometry import Polygon
    import shapely

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    poly = Polygon([(lng, lat) for lat, lng in ring_lat_lng])
    return shapely.transform(poly, lambda c: list(zip(*fwd.transform(c[:, 0], c[:, 1])))).area


def _bbox_center(ring_lat_lng):
    lats = [p[0] for p in ring_lat_lng]
    lngs = [p[1] for p in ring_lat_lng]
    return [round((min(lats) + max(lats)) / 2, 6), round((min(lngs) + max(lngs)) / 2, 6)]


def _entries():
    """반영할 seoul-zones 항목 3개 — base(삭제 직전값) + overrides + 도형."""
    data = json.loads(DATA.read_text(encoding="utf-8"))
    out = []
    for z in data["zones"]:
        zid = z["id"]
        ring = [list(p) for p in z["ring"]]
        if len(ring) < 3:
            raise SystemExit(f"[중단] {zid} 정점이 {len(ring)}개 — 폴리곤이 아닙니다")
        shape = _measure(ring)
        entry = dict(z["base"])
        entry.update(OVERRIDES[zid])
        entry["polygon"] = ring
        entry["ringPts"] = len(ring)
        entry["areaShape"] = int(round(shape))
        entry["center"] = _bbox_center(ring)
        entry["asOf"] = data["asOf"]
        entry["areaNote"] = entry["areaNote"].format(shape=format(int(round(shape)), ","),
                                                    pct=f"{shape / entry['area'] * 100 - 100:+.1f}")
        entry.pop("parts", None)
        entry.pop("holes", None)
        out.append((zid, entry, ring))
    return out


def _head(path: str):
    try:
        raw = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _ring_of(feat):
    ring = (feat.get("geometry") or {}).get("coordinates") or [[]]
    pts = [[c[1], c[0]] for c in ring[0]]
    return pts


def _closed(feat) -> bool:
    ring = (feat.get("geometry") or {}).get("coordinates") or [[]]
    return bool(ring[0]) and ring[0][0] == ring[0][-1]


def _shapely(feat):
    from pyproj import Transformer
    from shapely.geometry import shape
    import shapely

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    return shapely.transform(shape(feat["geometry"]), lambda c: list(zip(*fwd.transform(c[:, 0], c[:, 1]))))


def _restore_centers() -> None:
    """내보내기는 경계 있는 구역의 center 속성을 빼기도 한다(커밋 432c1d7 이 복구한 문제).

    이번 작업과 무관한 구역의 center 가 사라지면 그 구역 데이터가 바뀐 것이므로 HEAD 값으로 되돌린다.
    """
    head = _head("public/data/zones.geojson")
    if head is None:
        return
    head_by = {f["properties"]["id"]: f for f in head["features"]}
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    restored = []
    for f in geo["features"]:
        fid = f["properties"]["id"]
        if fid in IDS:
            continue
        old = head_by.get(fid)
        if old is None:
            continue
        if "center" not in f["properties"] and "center" in old["properties"]:
            f["properties"]["center"] = old["properties"]["center"]
            restored.append(fid)
    if restored:
        GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[보존] 내보내기가 빼 버린 center 속성 되돌림 {len(restored)}곳 {restored[:6]}")


def check() -> int:
    bad = 0
    entries = {zid: (entry, ring) for zid, entry, ring in _entries()}
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    feats = geo["features"]

    # ① 개수 (세 파일 모두 2,379)
    ok = (
        len(src) == EXPECTED_AFTER == len(feats) == index.get("count") == len(index.get("zones", []))
        and (geo.get("metadata") or {}).get("count") == EXPECTED_AFTER
    )
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 — seoul-zones {len(src)} · geojson {len(feats)} · "
          f"zone-index {index.get('count')} · metadata.count {(geo.get('metadata') or {}).get('count')} (기대 {EXPECTED_AFTER})")
    bad += 0 if ok else 1

    # ② 3곳이 세 파일에 있고 도형·속성이 기대값과 같음
    for zid in IDS:
        entry, ring = entries[zid]
        feat = _feat(geo, zid)
        s = next((z for z in src if z.get("id") == zid), None)
        idx = next((z for z in index.get("zones", []) if z.get("id") == zid), None)
        got = _ring_of(feat) if feat else []
        got_body = got[:-1] if len(got) > 1 and got[0] == got[-1] else got
        same = len(got_body) == len(ring) and all(
            abs(a[0] - b[0]) < 1e-7 and abs(a[1] - b[1]) < 1e-7 for a, b in zip(got_body, ring)
        )
        okd = bool(
            feat and s and idx
            and feat["geometry"]["type"] == "Polygon"
            and _closed(feat)
            and same
            and s.get("ringPts") == len(ring)
            and len(s.get("polygon") or []) == len(ring)
            and s.get("geom") == entry["geom"] == feat["properties"].get("geom")
            and s.get("type") == entry["type"]
            and s.get("area") == entry["area"]
            and abs((s.get("areaShape") or 0) - entry["areaShape"]) <= 1
            and abs((feat["properties"].get("area") or 0) - entry["area"]) < 0.01
            and idx.get("type") == entry["type"]
            and idx.get("gu") == entry["gu"]
        )
        if zid == "11000UQ120PS202503070075":
            aliases = s.get("alias") or []
            okd = okd and "양재동 380" in aliases and "양재동 380" in (idx.get("alias") or [])
        print(f"[{'OK' if okd else 'FAIL'}] {zid} {entry['name']} — {len(got_body)}정점(기대 {len(ring)}) · "
              f"계측 {format(_measure(ring), ',.0f')}㎡ · 표기 {entry['area']:,}㎡ · geom={entry['geom']} · type={entry['type']}")
        bad += 0 if okd else 1

    # ③ 이 3곳 밖은 직전 커밋과 완전히 같아야 한다
    head = _head("public/data/zones.geojson")
    if head is not None:
        head_by = {f["properties"]["id"]: f for f in head["features"]}
        prop_diff = geom_diff = 0
        examples = []
        for f in feats:
            fid = f["properties"]["id"]
            if fid in IDS:
                continue
            old = head_by.get(fid)
            if old is None:
                prop_diff += 1
                examples.append(f"{fid}(신규)")
                continue
            if _norm(f["properties"]) != _norm(old["properties"]):
                prop_diff += 1
                keys = sorted(set(f["properties"]) | set(old["properties"]))
                examples.append(f"{fid}." + str([k for k in keys if _norm(f["properties"].get(k)) != _norm(old["properties"].get(k))][:3]))
            if _norm(f.get("geometry")) != _norm(old.get("geometry")):
                geom_diff += 1
                examples.append(f"{fid}.geometry")
        ok = prop_diff == 0 and geom_diff == 0
        print(f"[{'OK' if ok else 'FAIL'}] 나머지 {len(feats) - 3}곳 — 속성 변경 {prop_diff}곳 · 도형 변경 {geom_diff}곳"
              + ("" if ok else " — " + ", ".join(examples[:5])))
        bad += 0 if ok else 1

        # seoul-zones 도 같아야 한다
        head_src = _head("src/data/seoul-zones.json")
        if head_src is not None:
            hs = {z["id"]: z for z in head_src}
            ss = {z["id"]: z for z in src}
            diff = [i for i in hs if i not in IDS and _norm(hs[i]) != _norm(ss.get(i))]
            missing = [i for i in hs if i not in ss]
            ok = not diff and not missing
            print(f"[{'OK' if ok else 'FAIL'}] seoul-zones 나머지 — 변경 {len(diff)}곳 · 사라짐 {len(missing)}곳")
            bad += 0 if ok else 1

    # ④ 세 곳·이웃끼리 겹침
    pairs = [
        ("11000UQ120PS202503070074", "11000UQ120PS202503070075"),
        ("11000UQ120PS202503070074", "yangjae-397-1"),
        ("11000UQ120PS202503070075", "yangjae-397-1"),
        ("11000UQ120PS202503070074", "yangjae-370"),
        ("11000UQ120PS202503070075", "yangjae-370"),
        ("yangjae-397-1", "yangjae-370"),
        ("yangjae-397-1", "yangjae-360"),
    ]
    total_overlap = 0.0
    for a, b in pairs:
        fa, fb = _feat(geo, a), _feat(geo, b)
        if not fa or not fb or not fa.get("geometry") or not fb.get("geometry"):
            print(f"[건너뜀] {a} ∩ {b} — 도형 없음")
            continue
        ga, gb = _shapely(fa), _shapely(fb)
        o = ga.intersection(gb).area
        total_overlap += o
        print(f"[{'OK' if o < 1 else '주의'}] 겹침 {a} ∩ {b} = {format(o, ',.0f')}㎡ · 간격 {format(ga.distance(gb), ',.1f')}m")
    bad += 0 if total_overlap < 1 else 1

    # ⑤ metadata
    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY} 기록")
    bad += 0 if ok else 1

    # ⑥ 지도에 이름표가 뜨는 대표 구역 수 (참고)
    print(f"[참고] featured {sum(1 for f in feats if f['properties'].get('featured'))}곳 · "
          f"경계 없는 구역 {sum(1 for f in feats if not f.get('geometry'))}곳")
    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    before = len(src)
    if before not in (EXPECTED_BEFORE, EXPECTED_AFTER):
        raise SystemExit(f"[중단] 예상 밖 구역 수 {before}곳 — 원천 상태를 먼저 확인하세요")
    # 다른 구역을 건드리지 않기 위한 이름 확인
    for z in data["zones"]:
        hit = [s for s in src if s.get("id") == z["id"]]
        if hit and (hit[0].get("name") or "") != (z["base"].get("name") or ""):
            raise SystemExit(f"[중단] id {z['id']} 의 이름이 '{hit[0].get('name')}' — 기대 '{z['base'].get('name')}'")

    by_id = {s.get("id"): s for s in src}
    added = []
    for zid, entry, ring in _entries():
        if zid in by_id:
            by_id[zid].clear()
            by_id[zid].update(entry)
        else:
            src.append(entry)
            added.append(zid)
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")
    print(f"[반영] seoul-zones.json {before}곳 → {len(src)}곳 · 새로 넣음 {len(added)}곳 {added}")

    meta[META_KEY] = META_ENTRY
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[기록] zones-meta.json — {META_KEY}")

    print("[내보내기] node scripts/export-geojson.mjs")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    _restore_centers()
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
