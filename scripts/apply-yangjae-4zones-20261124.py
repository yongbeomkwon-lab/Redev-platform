#!/usr/bin/env python3
"""양재 4곳(397-1·양재2동2·374·382) 경계를 재개발닷컴 화면 기준으로 일괄 교체 (2026-11-24)

## 왜
  사용자 지적(2026-11-24): 리디브 지도에서 네 구역이 재개발닷컴과 여전히 다르게 보인다.
    - 397-1: 북쪽 소호정 위 뾰족한 뿔, 서·남쪽 계단 톱니, 구룡사 쪽 파임 (필지 합집합 조립의 부작용)
    - 양재2동2: 동쪽 다원아파트 쪽 톱니, 남서 두둑재어린이공원 옆 가는 꼬리
    - 374·382: 2025-08-28 서울시 고시 제2025-476호로 줄기 전(기정) 면적(61,289 / 68,804㎡)을
      그대로 쓰고 있어 도로를 덮고 397-1·2구역과 붙어 보임

## 어떻게
  재개발닷컴 지도에 그려진 구역 경계를 같은 화면(네이버 지도, /api/develops bbox로 지오레퍼런스)에서
  읽어 목표 형상으로 삼고, 계측면적을 재개발닷컴 표기면적으로 맞춘 뒤(중심 기준 등배), 꼭짓점을
  브이월드 연속지적도 필지선에 스냅하고 단순화했다. 이웃 구역과 겹치는 부분은 차집합(겹침 0㎡).
    · 397-1  : 서초구 「구역계_공개_안내문」(2026-11-19) 도면을 옮긴 직선 경계(14정점)로 되돌리고
               필지선 스냅·단순화 → 8정점 40,586㎡ (표기 41,005㎡ 유지)
    · 양재2동2: 재개발닷컴 화면 형상 → 16정점 56,266㎡ (표기 56,162㎡ 유지)
    · 374    : 재개발닷컴 화면 형상 → 5정점 23,246㎡ (표기 23,301㎡)
    · 382    : 재개발닷컴 화면 형상 → 11정점 33,521㎡ (표기 34,066㎡)
  재개발닷컴 근거: 374 23,301㎡ / 382 34,066㎡ (jaegebal.com/develops/1618·2548, 2026-11-24 확인),
  397-1 41,005㎡, 양재2동2 57,014㎡. 374·382 축소는 서초구 「전문가 자문회의 결과에 따른 구역 제척 안내」
  (2026-07-09, 舊 A1·B1·B2 2025-06-05 제척 / A3 2026-01-22 제척)를 반영한 값이다.

실행: python3 scripts/apply-yangjae-4zones-20261124.py [--check]   (멱등)
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
META_KEY = "yangjae4ZonesFix20261124"

EXPECTED_TOTAL = 2440

# ── 새 경계 ([위도, 경도], 폐합점 없음) ──────────────────────────────────────
RING_397 = [
    [37.4723540, 127.0470240],
    [37.4732220, 127.0482760],
    [37.4729491, 127.0485492],
    [37.4730414, 127.0486022],
    [37.4723392, 127.0493648],
    [37.4724663, 127.0495930],
    [37.4716723, 127.0504286],
    [37.4706734, 127.0490518],
]
RING_YJ22 = [
    [37.4700351, 127.0437374],
    [37.4691778, 127.0445152],
    [37.4685794, 127.0444424],
    [37.4684915, 127.0443211],
    [37.4683759, 127.0443693],
    [37.4681885, 127.0440987],
    [37.4679536, 127.0443663],
    [37.4670220, 127.0442529],
    [37.4668846, 127.0434851],
    [37.4669690, 127.0430147],
    [37.4693805, 127.0419172],
    [37.4693923, 127.0419960],
    [37.4703026, 127.0432609],
]
RING_374 = [
    [37.4722986, 127.0465628],
    [37.4712181, 127.0481549],
    [37.4710957, 127.0473451],
    [37.4707411, 127.0462728],
    [37.4716816, 127.0450984],
]
RING_382 = [
    [37.4706524, 127.0488211],
    [37.4704799, 127.0489006],
    [37.4692251, 127.0472463],
    [37.4694257, 127.0467135],
    [37.4696322, 127.0464619],
    [37.4695845, 127.0463962],
    [37.4706043, 127.0460878],
    [37.4708805, 127.0466945],
    [37.4710957, 127.0473451],
    [37.4712181, 127.0481549],
    [37.4712778, 127.0480850],
]

BOUND_397 = (
    "서초구 「구역계_공개_안내문」(2026-11-19) 도면의 바깥 구역계를 옮긴 직선 경계로 되돌리고, "
    "꼭짓점을 브이월드 연속지적도 필지선에 붙여(최대 6m 스냅) 단순화했습니다(8정점). "
    "2026-11-23 저녁 배포본(필지 합집합)에서 생기던 북쪽 소호정 위 뾰족한 뿔과 서·남쪽 계단 톱니, "
    "구룡사 쪽 파임을 없애고 재개발닷컴 화면과 같은 매끈한 다각형으로 맞춘 것입니다. "
    "사업예정구역 1·2를 가르는 안쪽 경계와 종교부지(존치구역) 경계는 도형에 넣지 않고 바깥 구역계만 반영했습니다."
)
AREA_397 = (
    "서초구 공고문은 구역면적을 '약 4.1만㎡'로만 안내합니다. 재개발닷컴 집계값 41,005㎡를 표기 면적으로 두고, "
    "도면 경계를 필지선에 맞춘 도형의 계측 면적은 40,586㎡(약 12,277평, 표기 대비 -1.0%)입니다. "
    "사업예정구역 2곳과 종교부지(존치구역)를 모두 포함한 바깥 구역계 기준입니다."
)
BOUND_YJ22 = (
    "공식 구역계가 아직 없는 추진준비 단계 구역이라, 재개발닷컴 화면(도공복 (가)양재2동2)에 그려진 경계를 "
    "같은 축척에서 읽어 목표 형상으로 삼고, 계측면적을 표기면적(56,162㎡)에 맞춘 뒤 꼭짓점을 브이월드 "
    "연속지적도 필지선에 붙여 단순화했습니다(16정점, 계측 56,266㎡ +0.2%). 2026-11-23 배포본에서 동쪽 "
    "다원아파트 쪽으로 튀어나오던 톱니와 남서 두둑재어린이공원 옆 가늘고 길게 뻗던 꼬리를 없앴고, "
    "이웃 양재동 360 구역과 겹치는 부분은 차집합해 겹침 0㎡로 맞췄습니다."
)
AREA_YJ22 = (
    "공식 구역계·면적이 아직 확정되지 않았습니다. 표기 면적 56,162㎡(약 16,989평)를 그대로 두었고, "
    "재개발닷컴 집계값은 57,014㎡로 표기보다 1.5% 큽니다. 지도 도형의 계측 면적은 56,266㎡로 표기와 "
    "0.2% 차이입니다. 관리계획 고시로 구역계가 확정되면 그 값으로 대체해야 합니다."
)
NOTE_374 = (
    "양재동 374 일대 모아타운(소규모주택정비 관리지역)입니다. 2024-02-16 대상지 선정 뒤 2025-06-05 "
    "제8차 전문가 자문회의에서 舊 A1·B1·B2 구역이, 2026-01-22 제1차 자문회의에서 A3 구역이 제척되었습니다"
    "(서초구 「전문가 자문회의 결과에 따른 구역 제척 안내」, 2026-07-09). 지도 경계는 제척을 반영한 "
    "잔여 A2 범위로, 재개발닷컴 구역면적 23,301㎡와 같은 블록입니다. 관리계획(안)이 수립 중이라 "
    "범위는 다시 넓어질 수 있습니다(A1·A3 일부 재편입 청원 검토)."
)
AREA_374 = (
    "서울시 고시 제2025-476호(2025-08-28) 변경면적은 45,953.2㎡(기정 65,070㎡)이고, 여기서 2026-01-22 "
    "자문으로 제척된 A3(약 12,137㎡)를 뺀 잔여 범위가 관리계획(안) 대상입니다. 재개발닷컴은 그 범위를 "
    "23,301㎡로 집계하며, 지도 도형도 같은 값(계측 23,246㎡)에 맞췄습니다. 고시 변경면적 45,953.2㎡는 "
    "A3를 포함한 값이므로 구역면적으로 쓰지 않습니다."
)
BOUND_374 = (
    "재개발닷컴 화면(jaegebal.com/develops/1618)의 구역 경계를 같은 축척에서 읽어 목표 형상으로 삼고, "
    "꼭짓점을 브이월드 연속지적도 필지선에 붙여 단순화한 5정점 경계입니다(계측 23,246㎡). 2026-11-23 "
    "배포본의 기정(UQ120) 도형(계측 52,960㎡)은 도로 필지를 덮어 397-1·382와 붙어 보였는데, 이번 경계는 "
    "A2 블록 안쪽만 잡아 사방 도로 간격이 살아납니다."
)
NOTE_382 = (
    "양재동 382 일대 모아타운(소규모주택정비 관리지역)입니다. 2024-02-16 대상지 선정 뒤 2025-06-05 "
    "제8차 전문가 자문회의에서 舊 A1·B1·B2 구역이 제척되었습니다(서초구 안내, 2026-07-09). 지도 경계는 "
    "제척을 반영한 잔여 범위로, 재개발닷컴 구역면적 34,066㎡와 같은 블록입니다. 양재대로를 따라 길게 "
    "뻗은 형태이고, 관리계획(안) 수립 중이라 범위는 조정될 수 있습니다."
)
AREA_382 = (
    "서울시 고시 제2025-476호(2025-08-28) 변경면적은 36,683.1㎡(기정 74,515㎡)입니다. 재개발닷컴 "
    "집계값은 34,066㎡이고, 지도 도형의 계측 면적은 33,521㎡(-1.6%)입니다. 2026-11-23 배포본의 "
    "기정(UQ120) 68,804㎡ 표기와 도로를 덮던 도형(계측 38,613㎡)을 이번에 교체했습니다."
)
BOUND_382 = (
    "재개발닷컴 화면(jaegebal.com/develops/2548)의 구역 경계를 같은 축척에서 읽어 목표 형상으로 삼고, "
    "꼭짓점을 브이월드 연속지적도 필지선에 붙여 단순화한 11정점 경계입니다(계측 33,521㎡). 동남쪽 변은 "
    "양재대로 안쪽 필지선을 따르고, 이웃 374·360 구역과 겹치는 부분은 차집합해 겹침 0㎡입니다."
)

PROPS = {
    "yangjae-397-1": {
        "geom": "공고도면",
        "boundaryApprox": False,
        "asOf": "2026-11-24",
        "boundaryNote": BOUND_397,
        "areaNote": AREA_397,
    },
    "yangjae2-2": {
        "geom": "재개발닷컴경계",
        "boundaryApprox": False,
        "asOf": "2026-11-24",
        "boundaryNote": BOUND_YJ22,
        "areaNote": AREA_YJ22,
    },
    "11000UQ120PS202503070074": {
        "area": 23301,
        "geom": "재개발닷컴경계",
        "asOf": "2026-11-24",
        "note": NOTE_374,
        "areaNote": AREA_374,
        "boundaryNote": BOUND_374,
    },
    "11000UQ120PS202503070075": {
        "area": 34066,
        "geom": "재개발닷컴경계",
        "asOf": "2026-11-24",
        "note": NOTE_382,
        "areaNote": AREA_382,
        "boundaryNote": BOUND_382,
    },
}

JOBS = [
    ("yangjae-397-1", PROPS["yangjae-397-1"], RING_397),
    ("yangjae2-2", PROPS["yangjae2-2"], RING_YJ22),
    ("11000UQ120PS202503070074", PROPS["11000UQ120PS202503070074"], RING_374),
    ("11000UQ120PS202503070075", PROPS["11000UQ120PS202503070075"], RING_382),
]

META_ENTRY = {
    "asOf": "2026-11-24",
    "zones": ["yangjae-397-1", "yangjae2-2", "11000UQ120PS202503070074", "11000UQ120PS202503070075"],
    "note": (
        "양재 4곳 경계를 재개발닷컴 화면 형상 기준으로 교체(2026-11-24). 397-1은 서초구 공고 도면 직선 "
        "경계로 되돌리고(뿔·톱니 제거), 양재2동 2구역은 동쪽 톱니·남서 꼬리를 없앴으며, 374·382는 "
        "2025-476 고시 축소와 2025~2026 제척을 반영한 잔여 블록(23,301·34,066㎡)으로 줄였습니다. "
        "네 곳 모두 꼭짓점을 연속지적도 필지선에 스냅했고 이웃과 겹침 0㎡."
    ),
}


def _proj_ring(ring_lat_lng):
    from pyproj import Transformer
    from shapely.geometry import Polygon
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    poly = Polygon([(lng, lat) for lat, lng in ring_lat_lng])
    return sh_transform(lambda x, y, z=None: fwd(x, y), poly)


def _m2(ring_lat_lng) -> float:
    return _proj_ring(ring_lat_lng).area


def _shapely_geom(lat_lng_ring_or_geom):
    from pyproj import Transformer
    from shapely.geometry import Polygon, shape
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    if isinstance(lat_lng_ring_or_geom, dict):
        g = shape(lat_lng_ring_or_geom)
    else:
        g = Polygon([(lng, lat) for lat, lng in lat_lng_ring_or_geom])
    return sh_transform(lambda x, y, z=None: fwd(x, y), g)


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


def _baseline_ids():
    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return [f["properties"]["id"] for f in json.loads(raw)["features"]]
    except Exception as exc:  # noqa: BLE001
        print("[참고] git 기준 비교 불가 — %s" % exc)
        return None


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))

    ids = {f["properties"]["id"] for f in geo["features"]}
    src_ids = {z.get("id") for z in src}
    base = _baseline_ids()
    print("    zones.geojson %d곳 · seoul-zones %d곳 (기대 %d곳)" % (len(geo["features"]), len(src), EXPECTED_TOTAL))
    ok_count = len(geo["features"]) == EXPECTED_TOTAL == len(src)
    print("[%s] 구역 수 %d/%d = %d" % ("OK" if ok_count else "FAIL", len(geo["features"]), len(src), EXPECTED_TOTAL))
    bad += 0 if ok_count else 1
    if base is not None:
        missing = [i for i in base if i not in ids]
        extra = [i for i in ids if i not in base]
        print("[%s] 직전 커밋 대비 사라진 구역 %d곳 · 늘어난 구역 %d곳" % ("OK" if not missing and not extra else "FAIL", len(missing), len(extra)))
        bad += 0 if not missing and not extra else 1
    if ids != src_ids:
        print("[FAIL] geojson·seoul-zones 구역 목록 불일치")
        bad += 1
    else:
        print("[OK] geojson ↔ seoul-zones 구역 목록 일치")

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
            and entry is not None
            and len(entry.get("polygon") or []) == len(ring)
            and not entry.get("parts")
        )
        if "boundaryApprox" in props:
            okd = okd and feat["properties"].get("boundaryApprox") == props["boundaryApprox"]
        if "area" in props:
            okd = okd and abs((feat["properties"].get("area") or 0) - props["area"]) < 0.01
        print("[%s] %s 정점 %d(기대 %d) · area=%s · geom=%s · 계측 %s㎡ · source polygon=%d"
              % ("OK" if okd else "FAIL", zid, len(cur), len(ring), feat["properties"].get("area") if feat else None,
                 feat["properties"].get("geom") if feat else None, format(_m2(ring), ",.1f"), len((entry or {}).get("polygon") or [])))
        bad += 0 if okd else 1

    pairs = [
        ("yangjae-397-1", "yangjae2-2"),
        ("yangjae-397-1", "11000UQ120PS202503070074"),
        ("yangjae-397-1", "11000UQ120PS202503070075"),
        ("yangjae2-2", "11000UQ120PS202503070074"),
        ("yangjae2-2", "11000UQ120PS202503070075"),
        ("11000UQ120PS202503070074", "11000UQ120PS202503070075"),
        ("yangjae2-2", "yangjae-360"),
        ("yangjae2-2", "yangjae-370"),
        ("yangjae2-2", "yangjae2-5"),
        ("11000UQ120PS202503070074", "yangjae-360"),
        ("11000UQ120PS202503070075", "yangjae-360"),
        ("11000UQ120PS202503070074", "yangjae-370"),
    ]
    for a, b in pairs:
        fa, fb = _feature(geo, a), _feature(geo, b)
        if not fa or not fb or not fa.get("geometry") or not fb.get("geometry"):
            print("[건너뜀] %s ∩ %s — 도형 없음" % (a, b))
            continue
        o = _shapely_geom(fa["geometry"]).intersection(_shapely_geom(fb["geometry"])).area
        print("[%s] 겹침 %s ∩ %s = %s㎡" % ("OK" if o < 0.01 else "주의", a, b, format(o, ",.1f")))
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
        feat["properties"] = {**feat["properties"], **props, "id": zid}
        ring_ll = [[lng, lat] for lat, lng in ring] + [[ring[0][1], ring[0][0]]]
        feat["geometry"] = {"type": "Polygon", "coordinates": [ring_ll]}
        entry.update({k: v for k, v in props.items() if k != "id"})
        entry["polygon"] = [list(p) for p in ring]
        entry.pop("parts", None)
        entry.pop("holes", None)
        print("[반영] %s — %d정점 · 계측 %s㎡ · geom=%s" % (zid, len(ring), format(_m2(ring), ",.1f"), props["geom"]))

    geo.setdefault("metadata", {})[META_KEY] = META_ENTRY
    meta[META_KEY] = META_ENTRY
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("[저장] features %d→%d · 구역 %d" % (before, len(geo["features"]), len(src)))

    print("[내보내기] npm run geojson")
    subprocess.run(["npm", "run", "geojson"], cwd=ROOT, check=True)
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
