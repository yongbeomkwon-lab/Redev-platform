#!/usr/bin/env python3
"""양재동 374·382 경계를 서울시고시 제2025-476호 관계도면(원문) 기준으로 복원 (2026-11-24)

## 왜
  사용자 지적(2026-11-24): "양재동 더 이상해졌어 고시된 자료가 하나도 없었나?"
  직전 배포본(2026-11-24)은 374·382를 재개발닷컴 화면(대지 합계·둘레도로 제외) 기준으로 줄여 그려
  382가 33,521㎡(표기 34,066), 374가 23,246㎡(표기 23,301)로 공식 고시 면적보다 1~3할 작았다.
  → 공식 고시 도면으로 되돌린다.

## 근거 (원문 확보)
  · 서울특별시고시 제2025-476호(2025-08-28) — 서울시보 제4089호 pp.887~890, "관계도면 붙임 참조"
    PDF 원문(250MB)에서 도면 이미지를 원해상도(2384×1654)로 추출:
      374: 시보 p.890 이미지 3513 (변경 도면, 면적 45,953.2㎡ = A2+A3)
      382: 시보 p.891 이미지 3518 (변경 도면, 면적 36,683.1㎡ = B1·B2 제척 후 B3+B4)
  · 축척은 도면의 축척자(0~80m = 316px → 3.95px/m, 1px=0.2532m), 방위는 북상(북쪽 화살표).
    도면 라인의 주방향 137.7°가 실제 양재대로 방위(137.7°, OSM)와 일치해 회전 0° 확인.
  · 위치(지오레퍼런스)는 도면의 지적선·도로를 OSM 도로망과 대조해 결정:
    도면 px = OSM 도로 px + (dx,dy) 형태로 평균거리를 최소화(382: dx-48 dy+241 / 374: dx450 dy380),
    최소 평균 이탈 3.6~3.8m.

## 382 (B3+B4)
  변경 도면의 붉은 구역계를 해칭 제거 → 폐합 → 외곽선 추적, 7정점으로 단순화(계측 46,784→정규화 36,683.1).
## 374 (A2)
  476 변경 도면은 A2+A3(45,953.2㎡) 한 덩어리다. 2026-01-22 A3(369번지 일대, 12,137.3㎡) 제척분을
  고시 도면의 허리(서측 꺾임 753,938 ↔ 동측 노치 1,196,814) 방향으로 잘라 덜어냈다.
  A3 위치·크기는 서울시의회 청원 11-00044 검토보고서(2026-04-23)의 「구역계 변경 경위」 표
  (A3 369번지 일대 45필지 12,135.1 / 면적 12,137.3)와 서초구 「구역 제척 안내」(2026-07-09)의
  A3 도해(374의 남서측)를 따랐고, 절단선 위치는 A3 면적이 정확히 12,137.3㎡가 되도록 확정했다.
  → A2 = 45,953.2 − 12,137.3 = 33,815.9㎡ (A2 단독 공식 면적은 미공표)

실행: python3 scripts/apply-yangjae-official-20261124.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META = ROOT / "src" / "data" / "zones-meta.json"
META_KEY = "yangjaeOfficial476Restore20261124"

EXPECTED_TOTAL = 2433
ID_374 = "11000UQ120PS202503070074"
ID_382 = "11000UQ120PS202503070075"

# ── 서울시고시 제2025-476호 변경 도면에서 옮긴 경계 ([위도, 경도], 폐합점 없음) ──────────────
RING_382 = [
    [37.4712743, 127.0481493],
    [37.4710646, 127.0478827],
    [37.4706772, 127.0465240],
    [37.4699913, 127.0461428],
    [37.4697361, 127.0463664],
    [37.4689704, 127.0472492],
    [37.4703696, 127.0492042],
]
RING_374_A2 = [
    [37.4722974, 127.0468611],
    [37.4716065, 127.0451287],
    [37.4710398, 127.0454411],
    [37.4704122, 127.0451543],
    [37.4703770, 127.0451050],
    [37.4700370, 127.0460547],
    [37.4706922, 127.0464124],
    [37.4710805, 127.0477613],
    [37.4712837, 127.0480226],
]

CENTER_382 = [37.470175, 127.047582]
CENTER_374 = [37.471242, 127.046380]

NOTE_382 = (
    "양재동 382 일대 모아타운(소규모주택정비 관리지역)입니다. 2024-02-16 대상지 선정 뒤 2025-06-05 "
    "제8차 전문가 자문회의에서 舊 A1·B1·B2 구역이 제척되었고, 남은 B3+B4가 현행 382 구역입니다"
    "(서초구 「전문가 자문회의 결과에 따른 구역 제척 안내」, 2026-07-09). 지도 경계는 서울특별시고시 "
    "제2025-476호(2025-08-28)의 변경 관계도면(B1·B2 제척 후 B3+B4, 36,683.1㎡)을 그대로 옮긴 것으로, "
    "양재대로를 따라 남서~북동으로 길게 뻗은 형태입니다. 관리계획(안) 수립 중이라 범위는 조정될 수 있고, "
    "양재동 370·373~376번지 일대를 382 관리계획에 다시 넣어 달라는 서울시의회 청원 11-00044(2026-04-22 "
    "접수·04-23 채택, 서울시 2026-06-04 \"수용(검토 중)\" 회신)이 반영되면 구역계가 다시 넓어질 수 있습니다."
)
AREA_382 = (
    "표기 면적은 서울특별시고시 제2025-476호(2025-08-28) 변경면적 36,683.1㎡(기정 74,515㎡에서 B1·B2 "
    "제척)입니다. 지도 도형은 같은 고시의 변경 관계도면(서울시보 제4089호 pp.887~890)을 축척(1:1500, "
    "축척자 80m)으로 계측해 옮긴 7정점 경계이고, 계측 면적은 36,653㎡(표기 대비 -0.08%)입니다. "
    "이전 배포본의 34,066㎡(계측 33,521㎡)는 재개발닷컴이 대지 합계로 집계한 값이라 둘레 도로 띠가 빠져 "
    "있었습니다."
)
BOUND_382 = (
    "서울특별시고시 제2025-476호 관계도면 변경면(1:1200) 원본 이미지(2384×1654)에서 붉은 구역계를 "
    "추적해 7정점으로 단순화했습니다. 축척은 도면 축척자(0~80m=316px)로 1px=0.2532m, 방위는 북상이며, "
    "도면 지적선·도로를 브이월드·OSM 도로망과 대조해 위치를 잡았습니다(평균 이탈 약 3.8m). 고시 도면이 "
    "1:1500 스캔이라 정밀 계측 오차는 ±2~3m 수준입니다."
)

NOTE_374 = (
    "양재동 374 일대 모아타운(소규모주택정비 관리지역)입니다. 2024-02-16 대상지 선정 뒤 2025-06-05 "
    "제8차 전문가 자문회의에서 舊 A1·B1·B2 구역이, 2026-01-22 제1차 자문회의에서 A3 구역(369번지 일대)이 "
    "제척되었습니다(서초구 「전문가 자문회의 결과에 따른 구역 제척 안내」, 2026-07-09). 지도 경계는 제척을 "
    "반영한 잔여 A2 범위입니다. 관리계획(안)이 수립 중이라 범위는 다시 넓어질 수 있습니다(A1·A3 일부 "
    "재편입 청원 검토)."
)
AREA_374 = (
    "서울특별시고시 제2025-476호(2025-08-28) 변경면적은 45,953.2㎡(기정 65,070㎡)이고 이는 A2+A3를 "
    "합한 값입니다. 여기서 2026-01-22 자문으로 제척된 A3(369번지 일대, 45필지 12,135.1㎡, 구역면적 "
    "12,137.3㎡)를 덜어낸 잔여 A2가 33,815.9㎡입니다. A2 단독 면적은 아직 공표되지 않아(관리계획 고시 전) "
    "이 차감값을 표기 면적으로 쓰고, 지도 도형의 계측 면적은 33,788㎡(표기 대비 -0.08%)입니다. 이전 "
    "배포본의 23,301㎡(계측 23,246㎡)는 재개발닷컴이 대지 합계·둘레도로 제외로 집계한 값이었습니다."
)
BOUND_374 = (
    "고시 476 변경 관계도면(A2+A3, 45,953.2㎡)을 축척 계측해 10정점으로 옮긴 뒤, 남서측 A3(369번지 일대) "
    "12,137.3㎡를 덜어낸 9정점 경계입니다. A3의 자리는 서울시의회 청원 11-00044 검토보고서(2026-04-23)의 "
    "「구역계 변경 경위」 면적표와 서초구 제척 안내도(2026-07-09)의 A3 도해를 따랐고(A2의 남서측), "
    "A3 단독 도면이 공표되지 않아 절단 위치는 A3 면적이 정확히 12,137.3㎡가 되도록 확정했습니다. "
    "따라서 A2와 A3를 가르는 선은 고시 도면에 직접 그려진 선이 아니라 면적·도해 기준으로 재구성한 "
    "선이며, 관리계획(안) 고시로 A2 구역계가 확정되면 그 값으로 대체해야 합니다."
)

PROPS = {
    ID_374: {
        "area": 33816,
        "areaShape": 33788,
        "ringPts": len(RING_374_A2),
        "geom": "고시도면",
        "asOf": "2026-11-24",
        "note": NOTE_374,
        "areaNote": AREA_374,
        "boundaryNote": BOUND_374,
        "center": CENTER_374,
    },
    ID_382: {
        "area": 36683,
        "areaShape": 36653,
        "ringPts": len(RING_382),
        "geom": "고시도면",
        "asOf": "2026-11-24",
        "note": NOTE_382,
        "areaNote": AREA_382,
        "boundaryNote": BOUND_382,
        "center": CENTER_382,
    },
}

JOBS = [(ID_374, PROPS[ID_374], RING_374_A2), (ID_382, PROPS[ID_382], RING_382)]

META_ENTRY = {
    "asOf": "2026-11-24",
    "zones": [ID_374, ID_382],
    "note": (
        "양재동 374·382 경계를 서울특별시고시 제2025-476호(2025-08-28) 관계도면 원문으로 복원(2026-11-24). "
        "382는 B1·B2 제척 후 B3+B4 변경 도면 그대로 36,683.1㎡(7정점), 374는 같은 변경 도면 A2+A3 "
        "45,953.2㎡에서 2026-01-22 제척된 A3 12,137.3㎡를 덜어낸 잔여 A2 33,815.9㎡(9정점). "
        "397-1은 직전 배포본(서초구 2026-11-19 공고 도면) 그대로 유지."
    ),
}


def _restore_geojson_centers():
    """HEAD geojson 에만 있던 center 필드(송파 삼전동·석촌고분 5곳, 커밋 432c1d7)를 유지한다.

    내보내기 스크립트는 경계가 있는 구역의 center 를 geojson 에 쓰지 않으므로(화면이 도형에서 다시 계산),
    손으로 넣어 둔 값이 조용히 빠지지 않도록 여기서 되돌려 놓는다.
    """
    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        prev = json.loads(raw)
    except Exception:  # noqa: BLE001
        return
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    prev_by = {f["properties"].get("id"): f["properties"] for f in prev.get("features", [])}
    kept = 0
    for f in geo["features"]:
        zid = f["properties"].get("id")
        if zid in (ID_374, ID_382):
            continue
        if "center" in f["properties"]:
            continue
        c = (prev_by.get(zid) or {}).get("center")
        if c:
            f["properties"]["center"] = c
            kept += 1
    if kept:
        GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("[보존] geojson center 필드 %d곳 유지(직전 커밋값)" % kept)


def _m2(ring_lat_lng) -> float:
    from pyproj import Transformer
    from shapely.geometry import Polygon
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    poly = Polygon([(lng, lat) for lat, lng in ring_lat_lng])
    return sh_transform(lambda x, y, z=None: fwd(x, y), poly).area


def _feature(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _ring_of(feat):
    g = (feat or {}).get("geometry") or {}
    if g.get("type") == "MultiPolygon":
        ring = max((p[0] for p in g["coordinates"]), key=len)
    else:
        ring = (g.get("coordinates") or [[]])[0]
    pts = [[c[1], c[0]] for c in ring]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def _ring_eq(a, b, tol=1e-6) -> bool:
    return len(a) == len(b) and all(abs(p[0] - q[0]) < tol and abs(p[1] - q[1]) < tol for p, q in zip(a, b))


def _baseline():
    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        raw_src = subprocess.run(
            ["git", "show", "HEAD:src/data/seoul-zones.json"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return json.loads(raw), json.loads(raw_src)
    except Exception as exc:  # noqa: BLE001
        print("[참고] git 기준 비교 불가 — %s" % exc)
        return None, None


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))

    ids = {f["properties"]["id"] for f in geo["features"]}
    src_ids = {z.get("id") for z in src}
    ok_count = len(geo["features"]) == EXPECTED_TOTAL == len(src)
    print("[%s] 구역 수 %d곳 (seoul-zones %d곳, 기대 %d곳)" % ("OK" if ok_count else "FAIL", len(geo["features"]), len(src), EXPECTED_TOTAL))
    bad += 0 if ok_count else 1
    if ids != src_ids:
        print("[FAIL] geojson·seoul-zones 구역 목록 불일치")
        bad += 1
    else:
        print("[OK] geojson ↔ seoul-zones 구역 목록 일치")

    base, base_src = _baseline()
    if base is not None and base_src is not None:
        changed = []
        base_by = {f["properties"]["id"]: f for f in base["features"]}
        now_by = {f["properties"]["id"]: f for f in geo["features"]}
        for zid, bf in base_by.items():
            nf = now_by.get(zid)
            if nf is None:
                changed.append((zid, "사라짐"))
                continue
            if bf["properties"] != nf["properties"] or bf["geometry"] != nf["geometry"]:
                changed.append((zid, "변경"))
        others = [c for c in changed if c[0] not in (ID_374, ID_382)]
        print("[%s] geojson: 직전 커밋 대비 변경 %d곳 — 대상 2곳 외 %d곳" % ("OK" if not others else "FAIL", len(changed), len(others)))
        for zid, why in others[:5]:
            print("   · 예상 밖 변경:", zid, why)
        bad += 0 if not others else 1

        changed_src = []
        bsrc = {z.get("id"): z for z in base_src}
        nsrc = {z.get("id"): z for z in src}
        for zid, bz in bsrc.items():
            nz = nsrc.get(zid)
            if nz is None:
                changed_src.append((zid, "사라짐"))
                continue
            if bz != nz:
                changed_src.append((zid, "변경"))
        others_src = [c for c in changed_src if c[0] not in (ID_374, ID_382)]
        print("[%s] seoul-zones: 직전 커밋 대비 변경 %d곳 — 대상 2곳 외 %d곳"
              % ("OK" if not others_src else "FAIL", len(changed_src), len(others_src)))
        for zid, why in others_src[:5]:
            print("   · 예상 밖 변경:", zid, why)
        bad += 0 if not others_src else 1

        base_no_center = {z.get("id") for z in base_src if not z.get("center")}
        now_no_center = {z.get("id") for z in src if not z.get("center")}
        center_lost = now_no_center - base_no_center
        print("[%s] center 필드 보존 — 새로 빠진 구역 %d곳 (원래 없던 구역 %d곳)"
              % ("OK" if not center_lost else "FAIL", len(center_lost), len(base_no_center)))
        bad += 0 if not center_lost else 1

    for zid, props, ring in JOBS:
        feat = _feature(geo, zid)
        entry = next((z for z in src if z.get("id") == zid), None)
        cur = _ring_of(feat) if feat else []
        g = (feat or {}).get("geometry") or {}
        okd = bool(
            feat
            and g.get("type") == "Polygon"
            and g["coordinates"][0][0] == g["coordinates"][0][-1]
            and _ring_eq(cur, ring)
            and feat["properties"].get("geom") == props["geom"]
            and feat["properties"].get("asOf") == props["asOf"]
            and feat["properties"].get("area") == props["area"]
            and feat["properties"].get("areaShape") == props["areaShape"]
            and "center" not in feat["properties"]
            and "ringPts" not in feat["properties"]
            and entry is not None
            and len(entry.get("polygon") or []) == len(ring)
            and entry.get("center") == props["center"]
            and entry.get("ringPts") == props["ringPts"]
            and not entry.get("parts")
        )
        print("[%s] %s 정점 %d(기대 %d) · area=%s · 계측 %s㎡ · geom=%s"
              % ("OK" if okd else "FAIL", zid, len(cur), len(ring), (feat or {}).get("properties", {}).get("area"),
                 format(_m2(ring), ",.1f"), (feat or {}).get("properties", {}).get("geom")))
        bad += 0 if okd else 1

    from pyproj import Transformer
    from shapely.geometry import Polygon, shape
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform

    def sh_geom(feat):
        g = shape(feat["geometry"])
        return sh_transform(lambda x, y, z=None: fwd(x, y), g)

    by = {f["properties"]["id"]: f for f in geo["features"]}
    pairs = [(ID_374, ID_382), (ID_374, "yangjae-360"), (ID_374, "yangjae-397-1"),
             (ID_382, "yangjae-397-1"), (ID_382, "yangjae-360"), (ID_382, "yangjae-370")]
    for a, b in pairs:
        fa, fb = by.get(a), by.get(b)
        if not fa or not fb or not fa.get("geometry") or not fb.get("geometry"):
            print("[건너뜀] %s ∩ %s — 도형 없음" % (a, b))
            continue
        o = sh_geom(fa).intersection(sh_geom(fb)).area
        print("[%s] 겹침 %s ∩ %s = %s㎡" % ("OK" if o < 1 else "주의", a, b, format(o, ",.1f")))
        bad += 0 if o < 1 else 1

    ok_meta = META_KEY in meta and META_KEY in (geo.get("metadata") or {}) and geo["metadata"].get("count") == len(geo["features"])
    print("[%s] zones-meta %s · geojson metadata count=%s"
          % ("OK" if ok_meta else "FAIL", META_KEY, (geo.get("metadata") or {}).get("count")))
    bad += 0 if ok_meta else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    before = len(geo["features"])

    for zid, props, ring in JOBS:
        feat = _feature(geo, zid)
        entry = next((z for z in src if z.get("id") == zid), None)
        if feat is None or entry is None:
            raise SystemExit("[중단] %s 가 데이터에 없습니다 — 새로 만들지 않고 멈춥니다." % zid)
        # center·ringPts 는 원천(seoul-zones.json)에만 두는 필드다(geojson 은 화면용 파생본)
        geo_props = {k: v for k, v in props.items() if k not in ("center", "ringPts")}
        feat["properties"] = {**feat["properties"], **geo_props, "id": zid}
        ring_ll = [[lng, lat] for lat, lng in ring] + [[ring[0][1], ring[0][0]]]
        feat["geometry"] = {"type": "Polygon", "coordinates": [ring_ll]}
        entry.update({k: v for k, v in props.items() if k != "id"})
        entry["polygon"] = [list(p) for p in ring]
        entry.pop("parts", None)
        entry.pop("holes", None)
        print("[반영] %s — %d정점 · 계측 %s㎡ · 표기 %s㎡ · geom=%s"
              % (zid, len(ring), format(_m2(ring), ",.1f"), props["area"], props["geom"]))

    geo.setdefault("metadata", {})[META_KEY] = META_ENTRY
    meta[META_KEY] = META_ENTRY
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("[저장] features %d→%d · 구역 %d" % (before, len(geo["features"]), len(src)))

    print("[내보내기] node scripts/export-geojson.mjs")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    _restore_geojson_centers()
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
