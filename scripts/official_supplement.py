#!/usr/bin/env python3
"""
공식 명칭·신규 후보지 보강 (scripts/data/official-supplement.json 적용)

서울 열린데이터광장 「도시계획사업 현황(서울플랜+/UQ120)」은 반기 갱신이라
  · 같은 구역이 지번 이름으로만 실리거나(예: 사당동 419-1 = 사당15구역),
  · 갱신 사이에 선정된 신속통합기획 후보지가 통째로 빠진다(예: 사당21구역).
이 모듈은 서울시 고시·정비사업 정보몽땅·자치구 공개자료로 확인한 공식 이름(별칭)과
미수록 후보지를 GeoJSON·seoul-zones.json에 얹는다.

원칙:
  · 공식 GIS 도형(경계)이 확인되지 않은 후보지는 **도형을 만들지 않는다**. 대표 지점만 두고
    `geom: "미고시"`로 표시해 지도에 점으로 그린다(가짜 폴리곤 금지).
  · 이미 적용된 항목은 건너뛰므로 여러 번 실행해도 결과가 같다(멱등).

사용:
  python3 scripts/apply-official-supplement.py     # 현재 산출물에 적용
  (scripts/import-seoul-zones.py 가 끝에서 같은 함수를 부른다)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUPPLEMENT_PATH = os.path.join(HERE, "data", "official-supplement.json")
# 「리디브 누락 비교리스트 ① 선정·고시 80곳」 재검증 결과 — 공식 자료로 확인한 신규 구역·별칭
OFFICIAL80_PATH = os.path.join(HERE, "data", "official-80.json")
# 「동작·마포 추진준비 구역 20곳」 — 구청 공고·서울시 고시 도면으로 확인한 구역·경계
DJM_PATH = os.path.join(HERE, "data", "official-djm.json")
# 「성동·용산 추진준비 구역 37곳」 — 구청·서울시 공고·고시로 확인한 구역·경계
SY_PATH = os.path.join(HERE, "data", "official-sy.json")


def load_supplement(path=SUPPLEMENT_PATH):
    with open(path, encoding="utf-8") as fp:
        return json.load(fp)


def load_official80(path=OFFICIAL80_PATH):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fp:
        return json.load(fp)


def load_djm(path=DJM_PATH):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fp:
        return json.load(fp)


def load_sy(path=SY_PATH):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fp:
        return json.load(fp)


def _source_labels(supp, keys):
    src = supp.get("sources", {})
    labels = []
    for k in keys or []:
        s = src.get(k)
        if s:
            labels.append(s)
    return labels


def apply_supplement(fc, seoul_zones, meta=None, supp=None):
    """GeoJSON FeatureCollection과 seoul-zones 목록에 보강 내용을 적용한다(제자리 수정).

    fc          : {"type": "FeatureCollection", "metadata": {...}, "features": [...]}
    seoul_zones : src/data/seoul-zones.json 의 리스트
    meta        : zones-meta.json 딕셔너리(없으면 fc["metadata"] 사용)
    반환        : {"renamed": n, "added": n, "skipped": n}
    """
    supp = supp or load_supplement()
    if meta is None:
        meta = fc.setdefault("metadata", {})
    features = fc.setdefault("features", [])
    by_id = {z.get("id"): z for z in seoul_zones}
    stats = {"renamed": 0, "added": 0, "skipped": 0}

    # ── 1) 공식 구역명·별칭 ──────────────────────────────────────────────────
    for r in supp.get("renames", []):
        alias = r.get("alias") or []
        sources = _source_labels(supp, r.get("sources"))
        for f in features:
            p = f.get("properties") or {}
            if p.get("gu") != r["gu"] or p.get("name") != r["from"]:
                continue
            p["name"] = r["name"]
            if alias:
                p["alias"] = list(alias)
            if r.get("selectedAt"):
                p["selectedAt"] = r["selectedAt"]
            if r.get("note"):
                p["nameNote"] = r["note"]
            if sources:
                p["nameSources"] = sources
            z = by_id.get(p.get("id"))
            if z is not None:
                z["name"] = p["name"]
                if alias:
                    z["alias"] = list(alias)
                if r.get("selectedAt"):
                    z["selectedAt"] = r["selectedAt"]
                if r.get("note"):
                    z["nameNote"] = r["note"]
                if sources:
                    z["nameSources"] = sources
            stats["renamed"] += 1

    # ── 2) 미수록 후보지 (경계 미고시 → 대표 지점만) ─────────────────────────
    by_feature_id = {f.get("id"): f for f in features}
    for a in supp.get("additions", []):
        sources = _source_labels(supp, a.get("sources"))
        base = {
            "id": a["id"],
            "name": a["name"],
            "alias": list(a.get("alias") or []),
            "type": a.get("type", "신통기획"),
            "kind": a.get("kind", "신속통합기획(후보지)"),
            "stage": a.get("stage", "후보지선정"),
            "gu": a["gu"],
            "area": a["area"],
            "featured": False,
            "sourceId": a.get("sourceId") or "서울시 고시 제2026-266호",
            "geom": a.get("boundary", "미고시"),
        }
        props = dict(base)
        props["center"] = list(a["center"])
        for key in ("selectedAt", "centerLabel", "locationMap", "note", "areaNote"):
            if a.get(key):
                props[key] = a[key]
        if sources:
            props["sources"] = sources

        zone = dict(base)
        zone.pop("sourceId", None)   # seoul-zones.json 은 sid 를 쓴다
        zone["sid"] = base["sourceId"]
        zone["center"] = list(a["center"])
        zone["asOf"] = supp.get("asOf")
        if sources:
            zone["sources"] = sources   # export-geojson.mjs 재내보내기도 같은 출처를 싣도록
        for key in ("selectedAt", "centerLabel", "locationMap", "note", "areaNote"):
            if a.get(key):
                zone[key] = a[key]

        existing_feat = by_feature_id.get(a["id"])
        if existing_feat is not None:
            # 이미 있는 항목은 속성만 갱신(멱등 upsert) — 좌표·문구를 고칠 때 쓰인다
            existing_feat["properties"] = props
            if existing_feat.get("geometry") is not None and a.get("boundary", "미고시") == "미고시":
                existing_feat["geometry"] = None
            if a["id"] in by_id:
                by_id[a["id"]].update(zone)
                by_id[a["id"]].pop("sourceId", None)
            else:
                seoul_zones.append(zone)
            stats["skipped"] += 1
            continue

        features.append({
            "type": "Feature",
            "id": a["id"],
            "properties": props,
            "geometry": None,   # 구역계 미고시 — 도형을 지어내지 않는다
        })
        seoul_zones.append(zone)
        by_feature_id[a["id"]] = features[-1]
        by_id[a["id"]] = zone
        stats["added"] += 1

    # ── 3) 「누락 80곳」 재검증 결과(별칭·신규 구역) ─────────────────────────
    stats80 = apply_official80(fc, seoul_zones)

    # ── 4) 동작·마포 추진준비 구역 20곳 (공고 도면 7곳 폴리곤 + 10곳 점 + 별칭 3곳) ──
    stats_djm = apply_djm(fc, seoul_zones)

    # ── 5) 성동·용산 추진준비 구역 37곳 (공식 경계 1곳 폴리곤 + 19곳 점 + 별칭 1곳) ──
    stats_sy = apply_sy(fc, seoul_zones)

    meta["count"] = len(features)
    # meta 에는 이번 실행에서 바뀐 수가 아니라 **보강 파일이 담고 있는 범위**를 적는다
    # (같은 파일을 다시 돌려도 값이 흔들리지 않게).
    meta["supplement"] = {
        "asOf": supp.get("asOf"),
        "renames": len(supp.get("renames", [])),
        "additions": len(supp.get("additions", [])),
        "note": "서울시 고시·정비사업 정보몽땅·자치구 공개자료로 확인한 공식 구역명(별칭)과 미수록 후보지 보강",
    }
    if stats80:
        meta["official80"] = {
            "asOf": stats80["asOf"],
            "aliases": stats80["aliases"],
            "additions": stats80["additions"],
            "points": stats80["points"],
            "polygons": stats80["polygons"],
            "note": "누락 비교리스트 ① 선정·고시 80곳을 기존 데이터와 재검증 — 이미 있던 구역은 별칭, 실제 누락분은 공식 위치도 기반 대표 지점(경계 미고시)으로 반영",
        }
        stats["added80"] = stats80["_new"]
        stats["aliased80"] = stats80["_aliased"]
    if stats_djm:
        meta["dongjakMapo"] = {
            "asOf": stats_djm["asOf"],
            "additions": stats_djm["additions"],
            "polygons": stats_djm["polygons"],
            "points": stats_djm["points"],
            "aliases": stats_djm["aliases"],
            "note": "동작·마포 추진준비(가칭) 구역 20곳 — 구청 공고·서울시 고시 도면에서 필지 경계를 따라 옮긴 7곳은 폴리곤, 도면을 확보하지 못한 10곳은 대표 지점(경계 미고시)으로 반영하고 기존 구역과 같은 3곳은 별칭으로 보강",
        }
        stats["addedDjm"] = stats_djm["_new"]
        stats["aliasedDjm"] = stats_djm["_aliased"]
    if stats_sy:
        meta["seongdongYongsan"] = {
            "asOf": stats_sy["asOf"],
            "additions": stats_sy["additions"],
            "polygons": stats_sy["polygons"],
            "points": stats_sy["points"],
            "aliases": stats_sy["aliases"],
            "note": "성동·용산 추진준비(가칭) 구역 20곳 — 서울시 의제처리구역(UQ181) 실경계로 면적 검증(고시 대비 0.74%)을 통과한 숙대입구역세권 1곳만 폴리곤, 나머지 19곳은 구역계가 확정되지 않아 대표 지점(경계 미고시)으로 반영하고 기존 구역과 같은 1곳은 별칭으로 보강",
        }
        stats["addedSy"] = stats_sy["_new"]
        stats["aliasedSy"] = stats_sy["_aliased"]
    return stats


def apply_sy(fc, seoul_zones):
    """성동·용산 추진준비 구역 37곳 적용(멱등).

    · 구역계가 공표된 곳은 **폴리곤**으로 넣고 geom="UQ181"(서울시 의제처리구역 실경계).
      (민간 서비스 폴리곤은 쓰지 않는다 — 구청·서울시 공고·고시·서울 열린데이터광장만 근거로 한다)
    · 구역계가 확정되지 않은 곳은 대표 지점만 두고 geom="미고시" — 지도에 점선원으로 그린다.
    · 이미 있는 구역(용답동 122-8 = (가칭)용답동 122-2)은 새로 그리지 않고 별칭만 붙인다.
    """
    doc = load_sy()
    if not doc:
        return None
    srcs = doc.get("sources", {})
    features = fc.setdefault("features", [])
    by_feature_id = {f.get("id"): f for f in features}
    by_id = {z.get("id"): z for z in seoul_zones}
    stats = {"asOf": doc.get("asOf"),
             "additions": len(doc.get("additions", [])),
             "polygons": sum(1 for a in doc.get("additions", []) if a.get("polygon")),
             "points": sum(1 for a in doc.get("additions", []) if not a.get("polygon")),
             "aliases": len(doc.get("aliases", [])),
             "_new": 0, "_aliased": 0}

    for a in doc.get("aliases", []):
        f = by_feature_id.get(a["id"])
        z = by_id.get(a["id"])
        if f is None and z is None:
            continue
        extra = list(a.get("alias") or [])
        sources = [srcs[k] for k in (a.get("sources") or []) if k in srcs]
        for target in (f.get("properties", {}) if f else None, z):
            if target is None:
                continue
            cur = list(target.get("alias") or [])
            for name in extra:
                if name not in cur:
                    cur.append(name)
            if cur:
                target["alias"] = cur
            if a.get("note"):
                target["nameNote"] = a["note"]
            if sources:
                target["nameSources"] = sources
        stats["_aliased"] += 1

    for a in doc.get("additions", []):
        sources = [srcs[k] for k in (a.get("sources") or []) if k in srcs]
        geom_kind = a.get("boundary") or ("UQ181" if a.get("polygon") else "미고시")
        props = {
            "id": a["id"],
            "name": a["name"],
            "alias": list(a.get("alias") or []),
            "type": a.get("type", "신통기획"),
            "kind": a.get("kind", "재개발"),
            "stage": a.get("stage", ""),
            "gu": a["gu"],
            "area": a.get("area", 0),
            "featured": False,
            "sourceId": a.get("sourceId") or doc.get("asOf"),
            "geom": geom_kind,
            "center": list(a["center"]),
        }
        for key in ("selectedAt", "centerLabel", "locationMap", "note", "areaNote", "boundaryNote"):
            if a.get(key):
                props[key] = a[key]
        if sources:
            props["sources"] = sources

        geometry = None
        rings = a.get("polygon")
        if rings:
            if rings and isinstance(rings[0][0], (int, float)):
                rings = [rings]
            out_rings = []
            for ring in rings:
                coords = [[lng, lat] for lat, lng in ring]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                out_rings.append(coords)
            geometry = ({"type": "Polygon", "coordinates": [out_rings[0]]}
                        if len(out_rings) == 1 else
                        {"type": "MultiPolygon", "coordinates": [[r] for r in out_rings]})

        existing = by_feature_id.get(a["id"])
        if existing is not None:
            existing["properties"] = props
            existing["geometry"] = geometry
            zone = by_id.get(a["id"])
            if zone is not None:
                zone.update({k: v for k, v in props.items() if k != "sourceId"})
                zone["sid"] = props["sourceId"]
                zone["asOf"] = doc.get("asOf")
                if rings:
                    zone["polygon"] = [list(p) for p in rings[0]]
                    if len(rings) > 1:
                        zone["parts"] = [list(p) for p in rings[1:]]
        else:
            features.append({"type": "Feature", "id": a["id"], "properties": props, "geometry": geometry})
            by_feature_id[a["id"]] = features[-1]
            zone = {k: v for k, v in props.items() if k != "sourceId"}
            zone["sid"] = props["sourceId"]
            zone["asOf"] = doc.get("asOf")
            if rings:
                zone["polygon"] = [list(p) for p in rings[0]]
                if len(rings) > 1:
                    zone["parts"] = [list(p) for p in rings[1:]]
            seoul_zones.append(zone)
            by_id[a["id"]] = zone

        stats["_new"] += 1

    return stats


def apply_djm(fc, seoul_zones):
    """동작·마포 추진준비 구역 20곳 적용(멱등).

    · 공고 원문 도면(지적도·위치도)에서 경계를 옮긴 7곳은 **폴리곤**으로 넣고 geom="공고도면".
      (민간 서비스 폴리곤은 쓰지 않는다 — 구청·서울시 공고 도면만 근거로 한다)
    · 도면을 확보하지 못한 10곳은 대표 지점만 두고 geom="미고시" — 지도에 점선원으로 그린다.
    · 이미 있는 구역(사당동 235-53·신대방동 364-190·신대방동 498-9)은 새로 그리지 않고
      공식 이름(남성역세권·보라매역세권·신대방동 498-24)을 별칭으로 붙인다.
    """
    doc = load_djm()
    if not doc:
        return None
    srcs = doc.get("sources", {})
    features = fc.setdefault("features", [])
    by_feature_id = {f.get("id"): f for f in features}
    by_id = {z.get("id"): z for z in seoul_zones}
    stats = {"asOf": doc.get("asOf"),
             "additions": len(doc.get("additions", [])),
             "polygons": sum(1 for a in doc.get("additions", []) if a.get("polygon")),
             "points": sum(1 for a in doc.get("additions", []) if not a.get("polygon")),
             "aliases": len(doc.get("aliases", [])),
             "_new": 0, "_aliased": 0}

    for a in doc.get("aliases", []):
        f = by_feature_id.get(a["id"])
        z = by_id.get(a["id"])
        if f is None and z is None:
            continue
        extra = list(a.get("alias") or [])
        sources = [srcs[k] for k in (a.get("sources") or []) if k in srcs]
        for target in (f.get("properties", {}) if f else None, z):
            if target is None:
                continue
            cur = list(target.get("alias") or [])
            for name in extra:
                if name not in cur:
                    cur.append(name)
            if cur:
                target["alias"] = cur
            if a.get("note"):
                target["nameNote"] = a["note"]
            if sources:
                target["nameSources"] = sources
        stats["_aliased"] += 1

    for a in doc.get("additions", []):
        sources = [srcs[k] for k in (a.get("sources") or []) if k in srcs]
        geom_kind = a.get("boundary") or ("공고도면" if a.get("polygon") else "미고시")
        props = {
            "id": a["id"],
            "name": a["name"],
            "alias": list(a.get("alias") or []),
            "type": a.get("type", "신통기획"),
            "kind": a.get("kind", "재개발"),
            "stage": a.get("stage", ""),
            "gu": a["gu"],
            "area": a.get("area", 0),
            "featured": False,
            "sourceId": a.get("sourceId") or doc.get("asOf"),
            "geom": geom_kind,
            "center": list(a["center"]),
        }
        for key in ("selectedAt", "centerLabel", "locationMap", "note", "areaNote", "boundaryNote"):
            if a.get(key):
                props[key] = a[key]
        if sources:
            props["sources"] = sources

        geometry = None
        rings = a.get("polygon")
        if rings:
            if rings and isinstance(rings[0][0], (int, float)):
                rings = [rings]
            out_rings = []
            for ring in rings:
                coords = [[lng, lat] for lat, lng in ring]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                out_rings.append(coords)
            geometry = ({"type": "Polygon", "coordinates": [out_rings[0]]}
                        if len(out_rings) == 1 else
                        {"type": "MultiPolygon", "coordinates": [[r] for r in out_rings]})

        existing = by_feature_id.get(a["id"])
        if existing is not None:
            existing["properties"] = props
            existing["geometry"] = geometry
            zone = by_id.get(a["id"])
            if zone is not None:
                zone.update({k: v for k, v in props.items() if k != "sourceId"})
                zone["sid"] = props["sourceId"]
                zone["asOf"] = doc.get("asOf")
                if rings:
                    zone["polygon"] = [list(p) for p in rings[0]]
                    if len(rings) > 1:
                        zone["parts"] = [list(p) for p in rings[1:]]
        else:
            features.append({"type": "Feature", "id": a["id"], "properties": props, "geometry": geometry})
            by_feature_id[a["id"]] = features[-1]
            zone = {k: v for k, v in props.items() if k != "sourceId"}
            zone["sid"] = props["sourceId"]
            zone["asOf"] = doc.get("asOf")
            if rings:
                zone["polygon"] = [list(p) for p in rings[0]]
                if len(rings) > 1:
                    zone["parts"] = [list(p) for p in rings[1:]]
            seoul_zones.append(zone)
            by_id[a["id"]] = zone

        stats["_new"] += 1

    return stats


def apply_official80(fc, seoul_zones):
    """「누락 80곳」 재검증 결과 적용 — 별칭 보강 + 실제 누락 구역 추가(멱등).

    · 이미 있는 구역(id 일치)은 표시명·도형을 건드리지 않고 alias/메모만 덧붙인다.
    · 신규 구역은 공식 대표 지점만 두고(geom 미고시) 점으로 그린다. 공식 경계 도형(UQ181)이
      확인된 2곳만 폴리곤을 쓴다 — 없는 경계를 만들지 않는다.
    """
    doc = load_official80()
    if not doc:
        return None
    srcs = doc.get("sources", {})
    features = fc.setdefault("features", [])
    by_feature_id = {f.get("id"): f for f in features}
    by_id = {z.get("id"): z for z in seoul_zones}
    # meta 에는 이번 실행에서 바뀐 수가 아니라 **보강 파일이 담고 있는 범위**를 적는다(멱등)
    stats = {"asOf": doc.get("asOf"),
             "aliases": len(doc.get("aliases", [])),
             "additions": len(doc.get("additions", [])),
             "points": sum(1 for a in doc.get("additions", []) if not a.get("polygon")),
             "polygons": sum(1 for a in doc.get("additions", []) if a.get("polygon")),
             "_new": 0, "_aliased": 0}

    # 별칭 보강(기존 구역)
    for a in doc.get("aliases", []):
        f = by_feature_id.get(a["id"])
        z = by_id.get(a["id"])
        if f is None and z is None:
            continue
        extra = list(a.get("alias") or [])
        sources = [srcs[k] for k in (a.get("sources") or []) if k in srcs]
        for target in (f.get("properties", {}) if f else None, z):
            if target is None:
                continue
            cur = list(target.get("alias") or [])
            for name in extra:
                if name not in cur:
                    cur.append(name)
            if cur:
                target["alias"] = cur
            if a.get("note"):
                target["nameNote"] = a["note"]
            if sources:
                target["nameSources"] = sources
        stats["_aliased"] += 1

    # 신규 구역
    for a in doc.get("additions", []):
        if a["id"] in by_feature_id:
            continue
        sources = [srcs[k] for k in (a.get("sources") or []) if k in srcs]
        center = a.get("center")
        props = {
            "id": a["id"],
            "name": a["name"],
            "alias": list(a.get("alias") or []),
            "type": a.get("type", "신통기획"),
            "kind": a.get("kind", "신속통합기획"),
            "stage": a.get("stage", "후보지선정"),
            "gu": a["gu"],
            "area": a["area"],
            "featured": False,
            "sourceId": a.get("sourceId") or "서울시·국토부 공식자료 재검증(2026-11-17)",
            "geom": "UQ181" if a.get("polygon") else "미고시",
        }
        if center:
            props["center"] = list(center)
        for key in ("selectedAt", "centerLabel", "locationMap", "note", "areaNote"):
            if a.get(key):
                props[key] = a[key]
        if sources:
            props["sources"] = sources

        geometry = None
        if a.get("polygon"):
            rings = a["polygon"]
            if rings and isinstance(rings[0][0], (int, float)):
                rings = [rings]          # 단일 링([lat,lng] 목록)도 받아 준다
            out_rings = []
            for ring in rings:
                coords = [[lng, lat] for lat, lng in ring]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                out_rings.append(coords)
            geometry = ({"type": "Polygon", "coordinates": [out_rings[0]]}
                        if len(out_rings) == 1 else
                        {"type": "MultiPolygon", "coordinates": [[r] for r in out_rings]})

        features.append({"type": "Feature", "id": a["id"], "properties": props, "geometry": geometry})
        by_feature_id[a["id"]] = features[-1]

        zone = {k: v for k, v in props.items() if k not in ("sourceId",)}
        zone["sid"] = props["sourceId"]
        zone["asOf"] = doc.get("asOf")
        if a.get("polygon"):
            rings = a["polygon"]
            if rings and isinstance(rings[0][0], (int, float)):
                rings = [rings]
            zone["polygon"] = [list(p) for p in rings[0]]
            if len(rings) > 1:
                zone["parts"] = [list(p) for p in rings[1:]]
        seoul_zones.append(zone)
        by_id[a["id"]] = zone
        stats["_new"] += 1

    return stats


def main():
    root = os.path.abspath(os.path.join(HERE, ".."))
    geojson_path = os.path.join(root, "public", "data", "zones.geojson")
    zones_path = os.path.join(root, "src", "data", "seoul-zones.json")
    meta_path = os.path.join(root, "src", "data", "zones-meta.json")

    with open(geojson_path, encoding="utf-8") as fp:
        fc = json.load(fp)
    with open(zones_path, encoding="utf-8") as fp:
        seoul_zones = json.load(fp)
    meta = fc.setdefault("metadata", {})
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as fp:
            meta = json.load(fp)

    stats = apply_supplement(fc, seoul_zones, meta)

    with open(geojson_path, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, separators=(",", ":"))
    with open(zones_path, "w", encoding="utf-8") as fp:
        json.dump(seoul_zones, fp, ensure_ascii=False, separators=(",", ":"))
    with open(meta_path, "w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)

    print(f"공식 명칭 적용 {stats['renamed']}건 · 신규 후보지 {stats['added']}건 추가 "
          f"(이미 있음 {stats['skipped']}건) · 총 {len(fc['features'])}개 구역")
    return 0


if __name__ == "__main__":
    sys.exit(main())
