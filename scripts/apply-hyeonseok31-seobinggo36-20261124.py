#!/usr/bin/env python3
"""현석동 1-31(광흥창역세권)·서빙고동 36구역 — 경계 미고시(점)에서 공식 도면 경계로 교체 (2026-11-24)

## 왜
  두 구역은 그동안 `geom: "미고시"` + 대표 지점(점선원)이었다. 이번에 각각 공식 도면의 구역계를
  옮긴 폴리곤을 확보해 지도에 실제 경계로 그린다.
    · 광흥창역세권(현석동 1-31) — 마포구 고시 제2026-116호(2026-07-23) 「개발행위허가 제한 변경
      지형도면 고시」 첨부 지형도면의 변경 구역계(빨간 점선). 34정점, 고시 22,746.4㎡ / 도형 22,743㎡.
    · (가칭)서빙고동 36구역 — 용산구 「서빙고동 36번지 일대 주택재개발사업 추진을 위한 동의서
      번호부여 요청 구역 공개」(2025-01-10) 첨부 도면의 청색 구역계. 60정점(폐합 포함 61좌표),
      공고 26,236㎡ / 도형 26,732㎡(+1.9%).

## 무엇이 바뀌나
  · polygon · ringPts · areaShape · center · geom("고시도면"/"공고도면") · boundaryApprox false
  · boundaryNote·areaNote·note·sources·sid·drawing·asOf 를 문서에 맞춰 갱신
  · 현석동 note 의 "신수동 301-1 서쪽 약 110m" → 실측 최소거리 53.2m 로 정정(도형 기준 재측정)
  · 서빙고동 note 의 "한남5 재정비촉진구역 안에 들어 있다"는 문장은 도형으로 확인한 결과 사실이
    아니어서(한남5구역 경계에서 최소 48.8m 떨어짐, 겹침 0㎡) 새 note 로 대체하고, 겹치지 않는다는
    사실만 boundaryNote 에 남긴다. 도면의 "신청인이 제출한 구역계로 후보지 추천 시 일부 변경·조정될
    수 있음"도 boundaryNote 에 명시한다.
  · scripts/data/official-djm.json · official-sy.json(파이프라인 원본)의 같은 항목에도 폴리곤·경계
    근거·출처를 넣어, 나중에 보강 스크립트를 다시 돌려도 경계가 사라지지 않게 한다.
  ※ 표기면적(area)·단계·매물 연결·별칭은 그대로 둔다. 나머지 2,377곳은 건드리지 않는다.

실행: python3 scripts/apply-hyeonseok31-seobinggo36-20261124.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "hyeonseok31-seobinggo36-20261124.json"
DJM = ROOT / "scripts" / "data" / "official-djm.json"
SY = ROOT / "scripts" / "data" / "official-sy.json"
META_KEY = "hyeonseok31Seobinggo36"
EXPECTED_COUNT = 2379
IDS = ("mp-hyeonseok-1-31", "sy-seobinggo-36")
COMPACT = {"ensure_ascii": False, "separators": (",", ":")}

META_NOTE = (
    "현석동 1-31(광흥창역세권)은 마포구 고시 제2026-116호(2026-07-23) 지형도면의 변경 구역계"
    "(34정점, 고시 22,746.4㎡ / 도형 22,743㎡), 서빙고동 36구역은 용산구 2025-01-10 구역 공개 도면의"
    "구역계(60정점, 공고 26,236㎡ / 도형 26,732㎡)를 옮겨 경계 미고시(점)에서 폴리곤으로 교체했다."
    " 이웃 구역과 겹치는 면적은 두 곳 모두 0㎡다."
)


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _data():
    return json.loads(DATA.read_text(encoding="utf-8"))


def _entry(z: dict) -> dict:
    """데이터 문서의 항목 → seoul-zones.json 항목(기존 값 위에 덮어쓸 필드만)"""
    ring = z["ring"]
    if len(ring) < 3:
        raise SystemExit(f"[중단] {z['id']} 링 정점이 모자랍니다")
    return {
        "polygon": [[round(p[0], 6), round(p[1], 6)] for p in ring],
        "ringPts": len(ring),
        "areaShape": z["areaShape"],
        "geom": z["geom"],
        "boundaryApprox": z.get("boundaryApprox", False),
        "sid": z["sourceId"],
        "center": list(z["center"]),
        "centerLabel": "도면 구역계 중심",
        "asOf": "2026-11-24",
        "note": z["note"],
        "boundaryNote": z["boundaryNote"],
        "areaNote": z["areaNote"],
        "sources": z["sources"],
        "drawing": z["drawing"],
    }


def _feat(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _geo_key(f: dict) -> str:
    """비교용 정규화 — 경계가 있는 구역의 center 는 화면이 도형에서 다시 계산하므로 뺀다."""
    f = json.loads(json.dumps(f))
    if f.get("geometry"):
        (f.get("properties") or {}).pop("center", None)
    return _norm(f)


def _m2(geom) -> float:
    from shapely.geometry import shape

    g = shape(geom)
    import math

    lat0 = g.centroid.y
    mx = 111320 * math.cos(math.radians(lat0))
    my = 110574
    from shapely.affinity import scale

    return scale(g, xfact=mx, yfact=my, origin=(0, 0)).area


def _head(path: str):
    try:
        raw = subprocess.run(
            ["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[참고] HEAD:{path} 비교 불가 — {exc}")
        return None


def check() -> int:
    bad = 0
    doc = _data()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    by_src = {z.get("id"): z for z in src}

    ok = (
        len(src) == len(geo["features"]) == EXPECTED_COUNT
        and index.get("count") == EXPECTED_COUNT
        and (geo.get("metadata") or {}).get("count") == EXPECTED_COUNT
    )
    print(f"[{'OK' if ok else 'FAIL'}] 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")
    bad += 0 if ok else 1

    for z in doc["zones"]:
        zid = z["id"]
        want = _entry(z)
        zone = by_src.get(zid)
        f = _feat(geo, zid)
        print(f"— {zid}")
        ok = zone is not None and _norm(zone.get("polygon")) == _norm(want["polygon"])
        print(f"  [{'OK' if ok else 'FAIL'}] 도형 {len(want['polygon'])}정점 일치")
        bad += 0 if ok else 1

        g = (f or {}).get("geometry") or {}
        ring = (g.get("coordinates") or [[]])[0]
        body = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
        same = len(body) == len(want["polygon"]) and all(
            abs(a[0] - b[1]) < 1e-6 and abs(a[1] - b[0]) < 1e-6 for a, b in zip(body, want["polygon"])
        )
        print(f"  [{'OK' if same else 'FAIL'}] geojson 좌표 일치 ({len(body)}정점)")
        bad += 0 if same else 1

        props = (f or {}).get("properties") or {}
        ok = (
            props.get("geom") == want["geom"]
            and props.get("boundaryApprox") is False
            and props.get("area") == z["area"]
            and abs((props.get("areaShape") or 0) - z["areaShape"]) <= 1
            and bool(props.get("boundaryNote"))
            and bool(props.get("sources"))
        )
        print(f"  [{'OK' if ok else 'FAIL'}] 속성 — geom {props.get('geom')} · area {props.get('area')} · "
              f"areaShape {props.get('areaShape')} · boundaryNote {'있음' if props.get('boundaryNote') else '없음'} · "
              f"sources {len(props.get('sources') or [])}건")
        bad += 0 if ok else 1

        idx = next((x for x in index["zones"] if x.get("id") == zid), None)
        ok = bool(idx) and idx.get("name") == z["name"] and bool(idx.get("alias"))
        print(f"  [{'OK' if ok else 'FAIL'}] zone-index 색인 유지 ({idx.get('name') if idx else '없음'})")
        bad += 0 if ok else 1

    if "서빙고동 36" in (by_src.get("sy-seobinggo-36", {}).get("boundaryNote") or ""):
        ok = "신청인이 제출한 구역계" in by_src["sy-seobinggo-36"]["boundaryNote"]
        print(f"[{'OK' if ok else 'FAIL'}] 서빙고동 36 boundaryNote — 신청인 제출 구역계(변경·조정 가능) 명시")
        bad += 0 if ok else 1

    head = _head("src/data/seoul-zones.json")
    if head is not None:
        old_by = {x.get("id"): x for x in head}
        diff = [x["id"] for x in src if x["id"] not in IDS and _norm(x) != _norm(old_by.get(x["id"]))]
        print(f"[{'OK' if not diff else 'FAIL'}] 나머지 {len(src) - len(IDS)}곳 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1
    head_geo = _head("public/data/zones.geojson")
    if head_geo is not None:
        old_by = {x["properties"]["id"]: x for x in head_geo["features"]}
        diff = [x["properties"]["id"] for x in geo["features"]
                if x["properties"]["id"] not in IDS
                and _geo_key(x) != _geo_key(old_by.get(x["properties"]["id"], {}))]
        print(f"[{'OK' if not diff else 'FAIL'}] geojson 나머지 구역 — 변경 {len(diff)}곳"
              + ("" if not diff else f" {diff[:5]}"))
        bad += 0 if not diff else 1

    # 도형 면적·이웃 구역 겹침(계측)
    from shapely.geometry import shape

    for z in doc["zones"]:
        zid = z["id"]
        f = _feat(geo, zid)
        if not f or not f.get("geometry"):
            print(f"  [FAIL] {zid} 경계 없음")
            bad += 1
            continue
        a = _m2(f["geometry"])
        dev = (a - z["area"]) / z["area"] * 100
        ok = abs(dev) < 3
        print(f"  [{'OK' if ok else 'FAIL'}] {zid} 도형 면적 {a:,.0f}㎡ (표기 {z['area']:,.1f}㎡ 대비 {dev:+.1f}%)")
        bad += 0 if ok else 1
        g = shape(f["geometry"])
        ov = []
        for f2 in geo["features"]:
            if f2["properties"].get("id") == zid or not f2.get("geometry"):
                continue
            g2 = shape(f2["geometry"])
            if not g2.intersects(g):
                continue
            import math as _m

            mx = 111320 * _m.cos(_m.radians(g.centroid.y))
            inter = g.intersection(g2).area * mx * 110574
            if inter > 1:
                ov.append((round(inter, 1), f2["properties"].get("name")))
        print(f"  [{'OK' if not ov else 'FAIL'}] {zid} 이웃 구역 겹침 0㎡ (겹침: {ov[:3] if ov else '없음'})")
        bad += 0 if not ov else 1

    ok = META_KEY in meta and META_KEY in (geo.get("metadata") or {})
    print(f"[{'OK' if ok else 'FAIL'}] zones-meta·geojson metadata 에 {META_KEY}")
    bad += 0 if ok else 1

    ok = len(geo["features"]) == EXPECTED_COUNT
    print(f"  [{'OK' if ok else 'FAIL'}] geojson 구역 수 {len(geo['features'])}곳")
    bad += 0 if ok else 1

    print(f"[정리] 실패 {bad}항목")
    return bad


def apply() -> int:
    doc = _data()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if len(src) != EXPECTED_COUNT:
        raise SystemExit(f"[중단] 예상 밖 구역 수 {len(src)}곳 (기대 {EXPECTED_COUNT})")

    for z in doc["zones"]:
        zid = z["id"]
        old = next((x for x in src if x.get("id") == zid), None)
        if old is None:
            raise SystemExit(f"[중단] {zid} 없음")
        want = _entry(z)
        old.pop("holes", None)
        old.pop("parts", None)
        old.pop("dividers", None)
        old.update(want)
        print(f"[반영] seoul-zones.json {zid} — {len(want['polygon'])}정점 · 계측 {z['areaShape']:,}㎡ "
              f"(표기 {z['area']:,.1f}㎡) · geom {z['geom']}")
    SOURCE.write_text(json.dumps(src, **COMPACT), encoding="utf-8")

    meta[META_KEY] = {"asOf": "2026-11-24", "zones": list(IDS), "note": META_NOTE}
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[반영] zones-meta.json — {META_KEY}")

    _apply_pipeline(doc)
    print("\n다음: npm run geojson && node scripts/build-zone-index.mjs")
    return 0


def _apply_pipeline(doc):
    """파이프라인 원본(official-djm.json · official-sy.json)에 같은 경계·근거를 넣는다."""
    by_id = {z["id"]: z for z in doc["zones"]}

    djm = json.loads(DJM.read_text(encoding="utf-8"))
    sy = json.loads(SY.read_text(encoding="utf-8"))
    djm["sources"]["mapo-gosi-2026-116"] = {
        "label": "마포구 고시 제2026-116호 — 현석동 1-31번지 일대 개발행위허가 제한 변경 지형도면 고시(2026-07-23) 첨부 지형도면(구역계 22,746.4㎡)",
        "url": "https://urban.seoul.go.kr/UpisArchive/DATA/PM/pdf/11440TTC202608120013/%EA%B3%A0%EC%8B%9C%EB%AC%B8%28%ED%98%84%EC%84%9D%EB%8F%99%29.pdf",
    }
    djm["sources"]["mapo-notice-2026-1046"] = {
        "label": "마포구 공고 제2026-1046호 — 광흥창역세권(현석동 1-31일원) 정비구역 지정 및 정비계획 결정(안) 공람공고(2026-07-02, 공람 7.2~8.3)",
        "url": "https://www.mapo.go.kr/",
    }
    for it in djm.get("additions", []):
        if it.get("id") != "mp-hyeonseok-1-31":
            continue
        z = by_id["mp-hyeonseok-1-31"]
        it["sourceId"] = z["sourceId"]
        it["sources"] = ["mapo-gosi-2026-116", "seoul-gosi-2026-376", "mapo-notice-2026-1046"]
        it["boundary"] = z["boundary"]
        it["polygon"] = [z["ring"]]
        it["areaShape"] = z["areaShape"]
        it["center"] = z["center"]
        it["note"] = z["note"]
        it["boundaryNote"] = z["boundaryNote"]
        it["areaNote"] = z["areaNote"]
        it["drawing"] = z["drawing"]
        print("[반영] official-djm.json — mp-hyeonseok-1-31 폴리곤·출처")

    sy["sources"]["ys-notice-seobinggo36"] = {
        "label": "용산구 「서빙고동 36번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개」(2025-01-10, 재정비사업과 02-2199-6644) 첨부 도면",
        "url": "https://www.yongsan.go.kr/portal/bbs/B0000170/view.do?nttId=686839&menuNo=200848",
    }
    sy["sources"]["jaegebal-seobinggo36"] = {
        "label": "재개발닷컴 구역정보(구역면적 26,236㎡·토지등소유자 132명·유형별 토지면적)",
        "url": "https://jaegebal.com/develops/4181",
    }
    sy["sources"]["vw-lp-pa-cbnd"] = {
        "label": "브이월드 연속지적도 LP_PA_CBND_BUBUN (필지 경계, 플랫폼 /api/parcel 경유 16,796점 표본)",
    }
    sy["sources"]["galta-seobinggo36"] = {
        "label": "갈타맵 (가)서빙고동 36 구역 — 공고 도면 지적 정합 경계(경계면적 8,133.9평·구역 필지 107개, 2026-11 기준 교차검증)",
        "url": "https://map.galta.kr/z/MAN-7350ea9f79/%EC%84%9C%EB%B9%99%EA%B3%A0%EB%8F%99%2036%EB%B2%88%EC%A7%80%20%EC%9D%BC%EB%8C%80",
    }
    for it in sy.get("additions", []):
        if it.get("id") != "sy-seobinggo-36":
            continue
        z = by_id["sy-seobinggo-36"]
        it["sourceId"] = z["sourceId"]
        it["sources"] = ["ys-notice-seobinggo36", "jaegebal-seobinggo36", "vw-lp-pa-cbnd", "galta-seobinggo36"]
        it["boundary"] = z["boundary"]
        it["polygon"] = [z["ring"]]
        it["areaShape"] = z["areaShape"]
        it["center"] = z["center"]
        it["note"] = z["note"]
        it["boundaryNote"] = z["boundaryNote"]
        it["areaNote"] = z["areaNote"]
        it["drawing"] = z["drawing"]
        print("[반영] official-sy.json — sy-seobinggo-36 폴리곤·출처")

    DJM.write_text(json.dumps(djm, ensure_ascii=False, indent=1), encoding="utf-8")
    SY.write_text(json.dumps(sy, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    if "--check" in sys.argv:
        raise SystemExit(1 if check() else 0)
    apply()
