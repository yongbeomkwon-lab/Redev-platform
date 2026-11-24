#!/usr/bin/env python3
"""대치4동 4개 구역(915 모아타운 · 900 민도복 · 954 민도복(주거중심형) · 도곡초 인근 가상사업지)을
리디브 정식 지도 데이터에 반영 (2026-11-25)

## 왜
  대표(권용범)님이 보낸 「2. 대치동 재개발」 그래픽(attachments/2026-11-25/1000085569-…jpg)에
  파란 블록 4개로 표시된 대치4동 자리(915·900·954·도곡초 인근 가상사업지)를,
  일반 방문자가 보는 정식 구역 데이터(zones.geojson · seoul-zones.json · zones-meta.json)에 넣는다.
  (2026-11-25 아침 대표 승인 — "대치4동 4개 구역 반영 및 배포")

## 경계를 어떻게 만들었나
  그래픽의 파란 채움 블록을 색으로 분리해 윤곽을 뽑고, 삼성역·선릉역·한티역 표식으로
  이미지 ↔ 위경도를 맞춘 뒤, 브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지를 점 조회(7,800여 회)해
  블록 안에 들어오는 필지(겹침률 50% 이상, 대표 지번 필지는 20% 이상)를 합집합한 경계다.
  안쪽 구멍은 그 자리 필지를 다시 조회해 메웠고, 도로 한 폭 틈은 닫힘 연산으로 이었다.
  → geom="필지정합"(연속지적도 필지선에 맞춰 다시 조립), 가상사업지만 geom="가상경계".
  → 공식 구역계가 아니라 손그림 개략도에서 옮긴 참고 경계이므로 boundaryApprox=True(지도에 점선).
     그래픽 배경지도 자체가 비등방 왜곡(가로 4.1m/px·세로 2.7m/px)과 55~75m 밀림이 있어
     블록마다 국소 보정값을 따로 적용했고, 남은 오차는 가장자리 ±1필지(10~15m)다.

## 원칙
  · 이 4곳 밖의 구역은 하나도 사라지거나 속성·도형이 바뀌면 안 된다 → 직전 커밋(HEAD)과
    구역 단위로 통째 비교하고, 다르면 실패로 본다. (특히 2026-11-25 커밋 c2ea997 의
    송파동 117 1~5구역 5곳이 살아 있어야 한다)
  · 대치4동 4곳 사이 겹침 0㎡, 기존 구역과 겹침 0㎡를 실측으로 확인한다.
  · 2,384 → 2,388곳.

실행: python3 scripts/apply-daechi4-20261125.py [--check]   (--check 는 검사만)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
DATA = ROOT / "scripts" / "data" / "daechi4-20261125.json"
META_KEY = "daechi4_20261125"

EXPECTED_BEFORE = 2384
EXPECTED_AFTER = 2388

# 2026-11-25 c2ea997 에서 들어온 송파동 117 1~5구역 — 이 5곳은 반드시 남아 있어야 한다
SONGPA_IDS = [f"songpa117-moa-{n}" for n in range(1, 6)]

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _jobs():
    return json.loads(DATA.read_text(encoding="utf-8"))["zones"]


def _feature(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _head_features():
    raw = subprocess.run(
        ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return {f["properties"]["id"]: f for f in json.loads(raw)["features"]}


# ── 좌표계 도우미 ─────────────────────────────────────────────────────────────
def _fwd():
    from pyproj import Transformer

    return Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform


def _sh(geom):
    from shapely.ops import transform as sh_transform

    fwd = _fwd()
    return sh_transform(lambda x, y, z=None: fwd(x, y), geom)


def _poly_of(job):
    from shapely.geometry import Polygon

    outer = [(lng, lat) for lat, lng in job["polygon"]]
    holes = [[(lng, lat) for lat, lng in h] for h in job.get("holes") or []]
    return Polygon(outer, holes)


def _measure(job) -> float:
    return _sh(_poly_of(job)).area


def _shapely_feature(feat):
    """geojson feature → EPSG:5179 도형(구멍 포함)"""
    from shapely.geometry import Polygon, shape

    g = feat.get("geometry")
    if not g:
        return None
    return _sh(shape(g))


def _ring_of(feat):
    """geojson 외곽 링 → [[lat, lng], …] (폐합점 제거)"""
    g = feat.get("geometry") or {}
    if not g:
        return []
    rings = g["coordinates"] if g["type"] == "Polygon" else max(g["coordinates"], key=len)
    outer = rings[0] if g["type"] == "MultiPolygon" else g["coordinates"][0]
    pts = [[c[1], c[0]] for c in outer]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def _holes_of(feat):
    g = feat.get("geometry") or {}
    if g.get("type") != "Polygon":
        return []
    out = []
    for h in g["coordinates"][1:]:
        pts = [[c[1], c[0]] for c in h]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        out.append(pts)
    return out


def _same_ring(a, b, tol=1e-9) -> bool:
    return len(a) == len(b) and all(abs(x[0] - y[0]) < tol and abs(x[1] - y[1]) < tol for x, y in zip(a, b))


# ── 검사 ─────────────────────────────────────────────────────────────────────
def check() -> int:
    bad = 0
    jobs = _jobs()
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))

    ids = [f["properties"]["id"] for f in geo["features"]]
    src_ids = [z.get("id") for z in src]
    print("    zones.geojson %d곳 · seoul-zones %d곳 (기대 %d곳)" % (len(ids), len(src), EXPECTED_AFTER))
    ok_count = len(ids) == EXPECTED_AFTER == len(src) == len(set(ids))
    print("[%s] 구역 수 geojson %d · seoul-zones %d (기대 %d, 중복 id %d)"
          % ("OK" if ok_count else "FAIL", len(ids), len(src), EXPECTED_AFTER, len(ids) - len(set(ids))))
    bad += 0 if ok_count else 1
    same_set = set(ids) == set(src_ids)
    print("[%s] geojson ↔ seoul-zones 구역 목록 %s" % ("OK" if same_set else "FAIL", "일치" if same_set else "불일치"))
    bad += 0 if same_set else 1

    # 기존 구역 무변경 — HEAD 와 구역 단위로 통째 비교
    head = _head_features()
    mine = {j["id"] for j in jobs}
    changed, missing = [], []
    for zid, hf in head.items():
        if zid in mine:
            continue
        cf = _feature(geo, zid)
        if cf is None:
            missing.append(zid)
        elif _norm(cf) != _norm(hf):
            changed.append(zid)
    extra = [i for i in ids if i not in head and i not in mine]
    ok_keep = not changed and not missing and not extra
    print("[%s] 기존 구역 변경 %d곳 · 사라짐 %d곳 · 새 구역(이번 4곳 밖) %d곳"
          % ("OK" if ok_keep else "FAIL", len(changed), len(missing), len(extra)))
    if changed:
        print("    바뀐 구역:", ", ".join(changed[:10]))
    if missing:
        print("    사라진 구역:", ", ".join(missing[:10]))
    if extra:
        print("    새 구역:", ", ".join(extra[:10]))
    bad += 0 if ok_keep else 1

    # 송파동 117 5곳 — 직전 커밋에서 들어온 구역이 살아 있는지 따로 확인
    songpa_ok = all(_feature(geo, zid) is not None for zid in SONGPA_IDS)
    print("[%s] 송파동 117(1~5구역) 5곳 유지 — %s"
          % ("OK" if songpa_ok else "FAIL", "있음" if songpa_ok else "사라진 구역: "
             + ", ".join(z for z in SONGPA_IDS if _feature(geo, z) is None)))
    bad += 0 if songpa_ok else 1

    # 4개 구역 — 좌표·구멍·속성 그대로 들어갔는지
    for j in jobs:
        feat = _feature(geo, j["id"])
        entry = next((z for z in src if z.get("id") == j["id"]), None)
        ring = _ring_of(feat) if feat else []
        holes = _holes_of(feat) if feat else []
        g = (feat or {}).get("geometry") or {}
        closed = bool(g) and g["coordinates"][0][0] == g["coordinates"][0][-1]
        same_ring = _same_ring(ring, j["polygon"])
        same_holes = len(holes) == len(j.get("holes") or []) and all(
            _same_ring(a, b) for a, b in zip(holes, j.get("holes") or [])
        )
        p = (feat or {}).get("properties") or {}
        okd = bool(
            feat
            and closed
            and same_ring
            and same_holes
            and p.get("geom") == j["geom"]
            and p.get("boundaryApprox") is True
            and p.get("name") == j["name"]
            and p.get("type") == j["type"]
            and p.get("gu") == "강남구"
            and abs((p.get("area") or 0) - j["area"]) < 0.01
            and entry is not None
            and entry.get("type") == j["type"]
            and entry.get("kind") == j["kind"]
            and entry.get("stage") == j["stage"]
            and len(entry.get("polygon") or []) == len(j["polygon"])
            and len(entry.get("holes") or []) == len(j.get("holes") or [])
            and not entry.get("parts")
        )
        print("[%s] %s · %s — 정점 %d(기대 %d) · 구멍 %d · %s · geom=%s · 계측 %s㎡ (표기 %s㎡)"
              % ("OK" if okd else "FAIL", j["id"], j["name"], len(ring), len(j["polygon"]), len(holes),
                 p.get("type"), p.get("geom"), format(_measure(j), ",.1f"), format(j["area"], ",")))
        bad += 0 if okd else 1

    # 4곳 사이 겹침·간격
    print("    ── 4곳 사이 겹침·간격 ──")
    if all(_feature(geo, j["id"]) for j in jobs):
        for a in range(len(jobs)):
            for b in range(a + 1, len(jobs)):
                ga = _shapely_feature(_feature(geo, jobs[a]["id"]))
                gb = _shapely_feature(_feature(geo, jobs[b]["id"]))
                o = ga.intersection(gb).area
                d = ga.distance(gb)
                ok = o < 0.01
                print("    [%s] %s ∩ %s = %s㎡ · 간격 %s m"
                      % ("OK" if ok else "FAIL", jobs[a]["name"], jobs[b]["name"], format(o, ",.1f"), format(d, ",.1f")))
                bad += 0 if ok else 1
    else:
        print("    [건너뜀] 아직 반영 전")

    # 기존 구역과 겹침 — 0㎡ 여야 한다
    print("    ── 기존 구역과 겹침 ──")
    worst = []
    if all(_feature(geo, j["id"]) for j in jobs):
        others = [f for f in geo["features"] if f["properties"]["id"] not in mine and f.get("geometry")]
        for j in jobs:
            gj = _shapely_feature(_feature(geo, j["id"]))
            mx = (0.0, None)
            for f in others:
                o = gj.intersection(_shapely_feature(f)).area
                if o > mx[0]:
                    mx = (o, f["properties"].get("name"))
            print("    [%s] %s — 기존 2,384곳과 최대 겹침 %s㎡%s"
                  % ("OK" if mx[0] < 0.01 else "FAIL", j["name"], format(mx[0], ",.1f"),
                     "" if not mx[1] or mx[0] < 0.01 else " (%s)" % mx[1]))
            bad += 0 if mx[0] < 0.01 else 1
            worst.append(mx[0])
    else:
        print("    [건너뜀] 아직 반영 전")

    ok_meta = (
        META_KEY in meta
        and META_KEY in (geo.get("metadata") or {})
        and geo["metadata"].get("count") == len(geo["features"])
    )
    print("[%s] zones-meta %s · metadata.count=%s (features %d)"
          % ("OK" if ok_meta else "FAIL", META_KEY, (geo.get("metadata") or {}).get("count"), len(geo["features"])))
    bad += 0 if ok_meta else 1

    idx = json.loads((ROOT / "public" / "data" / "zone-index.json").read_text(encoding="utf-8"))
    idx_ids = {z["id"] for z in idx.get("zones", [])}
    ok_idx = idx.get("count") == len(geo["features"]) and mine <= idx_ids
    print("[%s] zone-index %s곳 (features %d) · 새 4곳 포함 %s"
          % ("OK" if ok_idx else "FAIL", idx.get("count"), len(geo["features"]), "예" if mine <= idx_ids else "아니오"))
    bad += 0 if ok_idx else 1

    print("결과: %s (%d건 실패)" % ("통과" if bad == 0 else "실패", bad))
    return bad


# ── 반영 ─────────────────────────────────────────────────────────────────────
def apply() -> int:
    jobs = _jobs()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    before = len(src)
    if before != EXPECTED_BEFORE:
        print("[중단] seoul-zones.json 이 %d곳입니다(기대 %d곳). 최신 main 을 먼저 받으세요." % (before, EXPECTED_BEFORE))
        return 1
    by_id = {z.get("id"): i for i, z in enumerate(src)}
    dupes = [j["id"] for j in jobs if j["id"] in by_id]
    if dupes:
        print("[중단] 이미 있는 구역 id:", ", ".join(dupes))
        return 1

    for j in jobs:
        entry = {
            "id": j["id"],
            "sid": j["sid"],
            "name": j["name"],
            "alias": j["alias"],
            "type": j["type"],
            "kind": j["kind"],
            "stage": j["stage"],
            "gu": j["gu"],
            "area": j["area"],
            "featured": False,
            "sourceId": j["sid"],
            "geom": j["geom"],
            "boundaryApprox": True,
            "center": j["center"],
            "centerLabel": "연속지적도 필지 합집합 구역 중심",
            "areaShape": j["areaShape"],
            "note": j["note"],
            "areaNote": j["areaNote"],
            "boundaryNote": j["boundaryNote"],
            "sources": j["sources"],
            "asOf": j["asOf"],
            "polygon": [list(p) for p in j["polygon"]],
        }
        if j.get("holes"):
            entry["holes"] = [[list(p) for p in h] for h in j["holes"]]
        src.append(entry)
        print("[추가] %s — %s (정점 %d · 구멍 %d · 표기 %s㎡ · 계측 %s㎡)"
              % (j["id"], j["name"], len(j["polygon"]), len(j.get("holes") or []),
                 format(j["area"], ","), format(j["areaShape"], ",.1f")))

    meta[META_KEY] = {
        "asOf": "2026-11-25",
        "zones": [j["id"] for j in jobs],
        "note": (
            "대치4동 4곳(915 모아타운·900 민도복·954 민도복(주거중심형)·도곡초 인근 가상사업지)을 대표 제공 "
            "그래픽 「2. 대치동 재개발」의 파란 블록을 연속지적도 필지로 옮긴 참고 경계로 정식 반영"
            "(2,384 → 2,388곳, 2026-11-25). 세 곳은 geom='필지정합', 가상사업지는 geom='가상경계'이며 "
            "모두 boundaryApprox=true(지도 점선)입니다. 공식 고시 구역계가 나오면 그 도면으로 대체해야 합니다."
        ),
    }

    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("[저장] seoul-zones %d→%d곳" % (before, len(src)))

    # npm run geojson 은 이 환경에서 조용히 실패한다(exit 1) → 같은 스크립트를 node 로 직접 돌린다
    print("[내보내기] node scripts/export-geojson.mjs")
    subprocess.run(["node", "scripts/export-geojson.mjs"], cwd=ROOT, check=True)
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
