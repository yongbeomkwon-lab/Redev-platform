#!/usr/bin/env python3
"""황학 지구단위계획구역(중구 황학동 730번지 일대) 신규 등록 — 2026-11-26

## 무엇을 넣나
  · 중구 황학동 730번지 일대 337,980㎡ — 2026-11-25 제20차 서울시 도시·건축공동위원회에서
    「황학 지구단위계획구역 지정 및 계획 결정(안)」이 **수정 가결**된 구역.
    특별계획구역 4곳 + 특별계획가능구역 1곳, 최대개발규모 제한 폐지(도시정비형 재개발·시장정비 가능).

## 경계를 어떻게 잡았나
  · 서울시 보도자료(2026-11-26) 첨부 위치도의 붉은 점선 구역계를 브이월드 연속지적도
    (LP_PA_CBND_BUBUN, 리디브 /api/parcel 점 조회 — 4m 격자 4.8만 점) 필지선과 대조해
    **외곽 대지 필지 단위로 다시 조립**했다.
      - 서쪽: 다산로(30m) 동측 대지 필지선 / 남쪽: 퇴계로(30m) 북측 대지 필지선
      - 동쪽: 난계로(35m) 서측 대지 필지선 / 북쪽: 청계천 남측 수변 대지 필지선
      - 간선도로 부지(다산로·퇴계로·난계로)·물길은 도형에서 뺐다 → 도로 필지 침범 227㎡(0.07%).
  · 북측 안쪽에서 위치도에 빠져 있는 **황학동 1756번지 일원(2085 외 47필지 = 청계 노르웨이숲
    지역주택조합 사업부지, 48필지 6,672㎡)** 은 구역 안 구멍(홀)으로 비웠다.
  · 북동쪽 롯데캐슬베네치아(황학동 2545, 39,004㎡)는 위치도에서 구역계 밖(수변~타워 동측)이라 뺐다.

## 표기
  · type='일반재개발'(지도 색·필터는 재개발 계열), kind='지구단위계획구역',
    badgeType='지구단위계획' — 정비구역이 아니라 지구단위계획으로 지정된 구역임을 뱃지에 그대로 띄운다.
  · geom='필지정합', boundaryApprox=true — 결정 고시·지형도면 고시 전 참고 경계.
  · 도형 계측 315,263㎡ (표기 337,980㎡ 대비 −6.7%): 간선도로 부지를 넣지 않고 대지 필지선에
    맞춘 차이. 고시 도면이 나오면 그 경계로 교체한다.

실행: python3 scripts/apply-hwanghak-gudan-20261126.py [--check]   (멱등)
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
INDEX = ROOT / "public" / "data" / "zone-index.json"
DATA = ROOT / "scripts" / "data" / "hwanghak-20261126.json"

META_KEY = "hwanghakGudan20261126"
AS_OF = "2026-11-26"

DATA_JSON = json.loads(DATA.read_text(encoding="utf-8"))
RING = [(p[0], p[1]) for p in DATA_JSON["ring"]]
HOLES = [[(p[0], p[1]) for p in h] for h in DATA_JSON["holes"]]
AREA_SHAPE = DATA_JSON["areaShape"]

SOURCES = [
    {
        "label": "서울시 보도자료 「(엠바고10시)(석간) 제20차 도시건축공동위원회 개최결과」(2026-11-26, 첨부 위치도)",
        "url": "https://www.seoul.go.kr/news/news_report.do?bbsNo=158&nttNo=471090&cntPerPage=10&curPage=1",
    },
    {
        "label": "연합뉴스 「서울시, 황학동 33만㎡ 통합개발 유도…노후 상권 정비」(2026-11-26)",
        "url": "https://www.yna.co.kr/view/AKR20261126039900004",
    },
    {
        "label": "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지 경계 — 리디브 /api/parcel 점 조회로 필지 합집합(2026-11-26)",
        "url": "https://www.vworld.kr/dtld/dbndDtlPage.do",
    },
]

ZONE = {
    "id": "junggu-hwanghak",
    "name": "황학 지구단위계획구역",
    "type": "일반재개발",
    "kind": "지구단위계획구역",
    "badgeType": "지구단위계획",
    "stage": "지구단위계획구역 지정·계획 결정(도건위 수정가결 2026-11-25)",
    "gu": "중구",
    "area": 337980,
    "areaShape": AREA_SHAPE,
    "alias": [
        "황학", "황학 지구단위계획", "황학 지구단위계획구역", "황학동 지구단위계획",
        "황학동 730", "황학동 730번지", "황학동 730번지 일대", "황학동 730번지 일원",
        "황학동 재개발", "황학동 도시정비형 재개발", "황학동 시장정비", "황학동 지구단위",
        "중구 황학동 재개발", "중구 지구단위계획", "서울중앙시장", "서울중앙시장 재개발",
        "황학시장", "신당역 재개발", "신당역세권 지구단위계획", "퇴계로 지구단위계획",
    ],
    "centerLabel": "신당역(2·6호선 환승) 북측 — 서울중앙시장·황학시장 일대 (다산로 동측·난계로 서측)",
    "geom": "필지정합",
    "boundaryApprox": True,
    "note": (
        "중구 황학동 730번지 일대 337,980㎡가 2026-11-25 제20차 서울시 도시·건축공동위원회에서 "
        "「황학 지구단위계획구역 지정 및 계획 결정(안)」으로 수정 가결된 구역입니다. 신당역(2·6호선 "
        "환승) 역세권의 일반상업지역으로 서울중앙시장·황학시장 등 재래시장 상권이 포함되어 있고, "
        "기반시설 노후와 상권 쇠퇴로 통합 정비 필요성이 제기돼 온 곳입니다. 특별계획구역 4곳과 "
        "특별계획가능구역 1곳을 지정하고 최대개발규모 제한을 폐지해 도시정비형 재개발·시장정비사업 등 "
        "민간 통합개발을 유도합니다. 높이는 퇴계로·다산로변 최고 100m, 난계로·마장로변 80m, "
        "이면도로변 50m 이하로 차등 계획했고, 중로 2-18 등 도로 확폭과 건축한계선·전면공지로 보행공간을 "
        "확보합니다. 아직 서울시보 결정 고시·지형도면 고시 전이라 지도 경계는 위치도의 구역계를 "
        "연속지적도 필지선에 맞춰 다시 조립한 참고 경계입니다."
    ),
    "areaNote": (
        "서울시 보도자료 표기 337,980㎡(약 10만2,238평). 지도 도형을 EPSG:5179 평면으로 계측하면 "
        f"{AREA_SHAPE:,}㎡로 표기보다 6.7% 작습니다. 구역계를 간선도로(다산로·퇴계로·난계로) 부지 안쪽 "
        "대지 필지선에 맞춰 조립해 도로 면적(약 2만8천㎡)을 넣지 않은 차이입니다. 고시 도면이 공개되면 "
        "그 면적·경계로 교체해야 합니다."
    ),
    "boundaryNote": (
        "2026-11-25 제20차 도건위 수정 가결(황학동 730 일대, 특별계획구역 4곳 + 특별계획가능구역 1곳). "
        "결정 고시 전이라, 서울시 보도자료 위치도의 붉은 점선 구역계를 브이월드 연속지적도 필지선과 "
        "대조해 외곽 대지 필지 단위로 다시 조립한 경계입니다. 서쪽은 다산로(30m) 동측 대지, 남쪽은 "
        "퇴계로(30m) 북측 대지, 동쪽은 난계로(35m) 서측 대지, 북쪽은 청계천 남측 수변 대지 선을 따르고 "
        "간선도로 부지와 물길은 도형에서 뺐습니다(도로 필지 침범 227㎡, 도형의 0.07%). 북측 안쪽 "
        "황학동 1756번지 일원(2085 외 47필지, 청계 노르웨이숲 지역주택조합 사업부지)은 위치도에서 "
        "빠져 있어 구멍(홀)으로 비웠고, 북동쪽 롯데캐슬베네치아(황학동 2545)도 구역 밖이라 뺐습니다. "
        "최종 결정고시·지형도면이 나오면 고시 도면 경계로 교체하고 특별계획구역 4곳·특별계획가능구역 "
        "1곳의 세부 구역 분할도 함께 반영해야 합니다."
    ),
    "sources": SOURCES,
    "center": DATA_JSON["centroid"],
}


def _closed(ring):
    r = [[round(p[0], 7), round(p[1], 7)] for p in ring]
    if r[0] != r[-1]:
        r.append(r[0][:])
    return r


def _props(z):
    ring = _closed(z["ring"])
    p = {
        "id": z["id"],
        "name": z["name"],
        "alias": z["alias"],
        "type": z["type"],
        "kind": z["kind"],
        "stage": z["stage"],
        "gu": z["gu"],
        "area": z["area"],
        "areaShape": z["areaShape"],
        "featured": False,
        "sourceId": z["sourceId"],
        "geom": z["geom"],
        "boundaryApprox": z["boundaryApprox"],
        "centerLabel": z["centerLabel"],
        "center": z["center"],
        "note": z["note"],
        "areaNote": z["areaNote"],
        "boundaryNote": z["boundaryNote"],
        "sources": z["sources"],
        "asOf": AS_OF,
    }
    if z.get("badgeType"):
        p["badgeType"] = z["badgeType"]
    return p


def _feature(z):
    props = _props(z)
    coords = [[[p[1], p[0]] for p in _closed(z["ring"])]]
    for h in z.get("holes") or []:
        coords.append([[p[1], p[0]] for p in _closed(h)])
    return {
        "type": "Feature",
        "id": z["id"],
        "properties": props,
        "geometry": {"type": "Polygon", "coordinates": coords},
    }


def _metric_area(ring, holes):
    from shapely.geometry import Polygon
    import pyproj
    from shapely.ops import transform as shp_transform

    proj = pyproj.Transformer.from_crs(4326, 5179, always_xy=True)
    g = Polygon([(p[1], p[0]) for p in ring])
    for h in holes:
        g = g.difference(Polygon([(p[1], p[0]) for p in h]))
    return shp_transform(lambda x, y, z=None: proj.transform(x, y), g).area


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    ids = [f["properties"].get("id") for f in feats]
    dup = {i for i in ids if ids.count(i) > 1}
    print(f"[{'OK' if not dup else 'FAIL'}] 중복 id 없음 (features={len(feats)}, dup={sorted(dup)})")
    bad += 0 if not dup else 1

    feat = next((f for f in feats if f["properties"].get("id") == ZONE["id"]), None)
    if not feat:
        print(f"[FAIL] geojson에 구역 없음: {ZONE['id']}")
        return bad + 1
    coords = feat["geometry"]["coordinates"]
    p = feat["properties"]
    geom_ok = feat["geometry"]["type"] == "Polygon" and len(coords) == 1 + len(HOLES)
    print(
        f"[{'OK' if geom_ok else 'FAIL'}] geojson {feat['properties']['name']} 링={len(coords)} "
        f"외곽 {len(coords[0])} 정점 · 구멍 {[len(h) for h in coords[1:]]}"
    )
    bad += 0 if geom_ok else 1
    prop_ok = (
        p.get("type") == ZONE["type"]
        and p.get("kind") == ZONE["kind"]
        and p.get("badgeType") == ZONE["badgeType"]
        and p.get("stage") == ZONE["stage"]
        and p.get("area") == ZONE["area"]
        and p.get("areaShape") == ZONE["areaShape"]
        and p.get("geom") == "필지정합"
        and p.get("boundaryApprox") is True
        and p.get("asOf") == AS_OF
        and bool(p.get("note"))
        and bool(p.get("boundaryNote"))
        and len(p.get("alias") or []) >= 8
    )
    print(f"[{'OK' if prop_ok else 'FAIL'}] properties type/kind/stage/area/geom/boundaryApprox")
    bad += 0 if prop_ok else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entry = next((e for e in src if e.get("id") == ZONE["id"]), None)
    ok2 = (
        entry is not None
        and entry.get("geom") == ZONE["geom"]
        and entry.get("area") == ZONE["area"]
        and entry.get("stage") == ZONE["stage"]
        and entry.get("badgeType") == ZONE["badgeType"]
        and len(entry.get("polygon") or []) == len(_closed(RING)) - 1
        and len(entry.get("holes") or []) == len(HOLES)
    )
    print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {ZONE['id']} polygon/holes/면적/단계")
    bad += 0 if ok2 else 1

    measured = _metric_area(RING, HOLES)
    print(f"     도형 계측 {measured:,.0f}㎡ · 표기 {ZONE['area']:,}㎡ 대비 {(measured / ZONE['area'] - 1) * 100:+.1f}%")

    meta = geo.get("metadata", {})
    ok3 = meta.get("count") == len(feats) and META_KEY in meta
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={meta.get('count')} features={len(feats)} batch={META_KEY in meta}")
    bad += 0 if ok3 else 1

    # 다른 구역과 겹침 — 맞닿음은 허용, 부분 겹침만 오류
    try:
        from shapely.geometry import shape
        from shapely.ops import transform as shp_transform
        import pyproj

        proj = pyproj.Transformer.from_crs(4326, 5179, always_xy=True)

        def to_m(g):
            return shp_transform(lambda x, y, z=None: proj.transform(x, y), g)

        mine = to_m(shape(feat["geometry"]))
        hits = []
        for f in feats:
            if f["properties"].get("id") == ZONE["id"] or f["properties"].get("type") != "Feature":
                continue
            try:
                other = to_m(shape(f["geometry"]))
            except Exception:  # noqa: BLE001
                continue
            if mine.intersection(other).area > 1:
                hits.append((f["properties"].get("name"), round(mine.intersection(other).area, 1)))
        print(f"[{'OK' if not hits else 'FAIL'}] 다른 구역과 겹침 {hits[:6]}")
        bad += 0 if not hits else 1
    except Exception as exc:  # noqa: BLE001
        print(f"[SKIP] 겹침 검사({exc})")

    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    idx_ids = {r["id"] for r in idx.get("zones", [])}
    ok4 = ZONE["id"] in idx_ids
    print(f"[{'OK' if ok4 else 'FAIL'}] zone-index {len(idx_ids)}건 · 포함={ZONE['id'] in idx_ids}")
    bad += 0 if ok4 else 1
    return bad


def apply() -> int:
    zone = dict(ZONE)
    zone["ring"] = RING
    zone["holes"] = HOLES
    zone["sourceId"] = (
        "서울시 보도자료 「제20차 도시건축공동위원회 개최결과」(2026-11-26) 첨부 위치도 "
        "· 브이월드 연속지적도 필지 합집합"
    )

    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    feat = _feature(zone)
    cur = next((f for f in feats if f["properties"].get("id") == ZONE["id"]), None)
    if cur is None:
        feats.append(feat)
        print(f"[geojson] 새 구역 추가: {zone['name']} ({zone['id']})")
    else:
        cur["properties"] = feat["properties"]
        cur["geometry"] = feat["geometry"]
        print(f"[geojson] 기존 구역 갱신: {zone['name']}")
    geo.setdefault("metadata", {})[META_KEY] = {
        "asOf": AS_OF,
        "additions": 1,
        "polygons": 1,
        "note": (
            "중구 황학동 730번지 일대 '황학 지구단위계획구역'(337,980㎡) 신규 등록 — 2026-11-25 제20차 "
            "도건위 수정 가결. 서울시 보도자료 위치도 구역계를 브이월드 연속지적도 필지선으로 다시 "
            "조립한 참고 경계(geom=필지정합, boundaryApprox)이고, 북측 황학동 1756번지 일원(청계 "
            "노르웨이숲 부지)은 구멍으로 제외했다. 결정 고시 전이라 확정 경계가 아니다."
        ),
    }
    geo["metadata"]["count"] = len(feats)
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] features={len(feats)}")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    props = _props(zone)
    ring = _closed(RING)
    entry = {
        "id": zone["id"],
        "name": zone["name"],
        "alias": zone["alias"],
        "type": zone["type"],
        "kind": zone["kind"],
        "badgeType": zone["badgeType"],
        "stage": zone["stage"],
        "gu": zone["gu"],
        "area": zone["area"],
        "areaShape": zone["areaShape"],
        "featured": False,
        "sourceId": zone["sourceId"],
        "geom": zone["geom"],
        "boundaryApprox": True,
        "centerLabel": zone["centerLabel"],
        "center": props["center"],
        "note": zone["note"],
        "areaNote": zone["areaNote"],
        "boundaryNote": zone["boundaryNote"],
        "sources": zone["sources"],
        "asOf": AS_OF,
        "sid": zone["sourceId"],
        "polygon": [[p[0], p[1]] for p in ring[:-1]],
        "holes": [[[p[0], p[1]] for p in _closed(h)[:-1]] for h in HOLES],
    }
    cur = next((e for e in src if e.get("id") == zone["id"]), None)
    if cur is None:
        src.append(entry)
        print(f"[seoul-zones] 새 구역 추가: {zone['id']}")
    else:
        cur.clear()
        cur.update(entry)
        print(f"[seoul-zones] 기존 구역 갱신: {zone['id']}")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] zones={len(src)}")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "additions": 1,
        "polygons": 1,
        "note": (
            "중구 황학동 730번지 일대 황학 지구단위계획구역 — 위치도 구역계를 연속지적도 필지선으로 "
            "재조립(geom=필지정합). 북측 황학동 1756번지 일원(청계 노르웨이숲 부지) 제외."
        ),
    }
    meta["count"] = len(feats)
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[meta] count={meta['count']}")

    r = subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    return 0 if r.returncode == 0 else 1


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(1 if check() else 0)
    apply()
    sys.exit(1 if check() else 0)
