#!/usr/bin/env python3
"""송파동 117(1~5구역) — 대표가 직접 그린 5개 구역을 정식 공용 지도 데이터에 반영 (2026-11-25)

## 왜
  2026-11-23 대표(권용범)가 리디브 관리자 화면(?admin=1)에서 지도에 직접 그려
  `/api/custom-zones` 에 5개 초안으로 저장해 둔 송파동 117(1~5구역)을,
  일반 방문자가 보는 정식 구역 데이터(zones.geojson · seoul-zones.json · zones-meta.json)에 넣는다.
  (2026-11-24 밤 대표: "일반 공용 지도에도 올려 달라" → 이 작업)
  같은 자리에 있던 옛 추정 경계 6곳(송파117 부모 + 1~5구역, geom="참고도")은 2026-11-24
  대표 지시로 이미 데이터에서 빠졌다(커밋 ddbd32d). 그래서 이번에는 **새로 더한다**.

## 무엇
  · 좌표는 대표가 그린 ring 을 한 점도 고치지 않고 그대로 옮긴다.
    (scripts/data/songpa117-user-drawn-20261125.json — /api/custom-zones 스냅숏)
  · id 는 옛 5개 구역 id(songpa117-moa-1~5)를 그대로 다시 쓴다 — 딥링크(?zone=songpa117-moa-3)와
    검색 별칭이 끊기지 않게.
  · 4구역 초안 이름은 "(가)송파동 117(4구역)" 이었는데, 지도 표기는 형제 구역과 맞춰
    "송파동 117(4구역)" 으로 두고 초안 표기는 alias 로 남긴다(검색은 둘 다 걸린다).
    4구역 초안은 gu 가 비어 있어 "송파구" 로 채운다(나머지 4개와 같은 구역).
  · geom="직접작도", boundaryApprox=false — 고시·공고 도면을 옮긴 경계가 아니라
    지도에서 직접 그린 경계임을 상세창이 밝히게 한다.

## 원칙
  · 이 5곳 밖의 구역은 하나도 사라지거나 속성·도형이 바뀌면 안 된다 → 직전 커밋(HEAD)과
    구역 단위로 통째 비교하고, 다르면 실패로 본다.
  · 2,379 → 2,384곳.

실행: python3 scripts/apply-songpa117-user-drawn-20261125.py [--check]   (멱등)
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
DATA = ROOT / "scripts" / "data" / "songpa117-user-drawn-20261125.json"
META_KEY = "songpa117UserDrawn20261125"

EXPECTED_BEFORE = 2379
EXPECTED_AFTER = 2384
TOTAL_DRAWN = 98271  # 1~5구역 그리기 도구 계산값 합계

STAGE = "추진준비·구역계 검토(공식 공고 전)"
SID = "리디브 관리자 직접작도(2026-11-23) — 대표 작도 송파동 117 1~5구역"
ASOF = "2026-11-23"

SOURCES = [
    {
        "label": "송파구청 모아타운 알림방 — 송파구 모아타운 공고 목록(2026-11-23 확인, 송파동 117 관련 공고 없음)",
        "url": "https://www.songpa.go.kr/www/selectBbsNttList.do?bbsNo=382&key=5917",
    },
    {
        "label": "서울시 모아주택·모아타운 온라인 아카이브(동남권) — 송파구는 풍납동 483-10·거여동 555만 수록",
        "url": "https://news.seoul.go.kr/citybuild/moa-housing-town/archive/seoul-southeast",
    },
    {
        "label": "서울특별시 공고 제2026-3045호 — 모아통합기획 모아타운 후보지 선정 공모 변경공고(2026-11-04)",
        "url": "https://www.seoul.go.kr/news/news_notice.do?nttNo=469588",
    },
    {
        "label": "서울시 보도자료 — '모아통합기획' 후보지 공모 개시·2030년까지 100곳 선정(2026-10-12)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=467904",
    },
]

# 구역별 이웃 관계 — check() 가 실측으로 다시 확인한다
NOTE_TAIL = (
    " 1~5구역을 합친 면적은 그리기 도구 계산값 기준 약 98,271㎡로 모아타운 후보지 요건"
    "(전체 1만~10만㎡)에 들어가지만, 2026-11-23 기준 송파구 모아타운 알림방·서울시 모아주택·모아타운"
    " 아카이브·정비사업 정보몽땅 어디에도 이 일대(송파동 117번지 일원 / (가칭)송파1동 하단)의 후보지"
    " 선정·구역계 공개·동의서 번호부여 공고는 없어 '추진준비·구역계 검토' 단계로 표시합니다."
)
ALIAS_COMMON = [
    "(가칭)송파1동 하단 모아타운",
    "송파1동 하단",
    "송파동 117",
    "송파동 117번지 일원",
    "송파동 117 일대",
    "송파동 117 모아타운",
    "송파동 117 모아통합기획",
    "송파117",
]


def zone_note(n: int, extra: str = "") -> str:
    return (
        f"(가칭)송파1동 하단 모아타운(송파동 117번지 일원)의 {n}구역입니다. 지도 경계는 2026-11-23 "
        f"대표님이 리디브 관리자 화면(?admin=1)에서 지도에 직접 그린 다각형으로, 좌표를 한 점도 고치지 않고 "
        f"정식 지도에 그대로 옮겼습니다(직접작도, 정밀 측량값 아님)." + (f" {extra}" if extra else "") + NOTE_TAIL
    )


EXTRA_NOTE_4 = (
    "관리자 초안에 저장된 이름은 '(가)송파동 117(4구역)'이었고, 지도 표기는 형제 구역과 맞춰 "
    "'송파동 117(4구역)'으로 두었습니다(초안 표기는 검색 별칭으로 남겨 둠)."
)


def area_note(area: int, shape: float) -> str:
    pct = (shape - area) / area * 100
    return (
        f"표기 면적 {area:,}㎡(약 {area / 3.3058:,.0f}평)는 관리자 화면 그리기 도구가 계산한 값입니다"
        f"(고시·공고 면적 아님). 같은 좌표를 EPSG:5179 평면으로 다시 잰 면적은 {shape:,.0f}㎡"
        f"(표기 대비 {pct:+.1f}%)입니다. 공식 구역계가 공개되면 그 도면 값으로 대체해야 합니다."
    )


# ── 반영 목록 ────────────────────────────────────────────────────────────────
def build_jobs():
    snap = json.loads(DATA.read_text(encoding="utf-8"))["adminItems"]
    from pyproj import Transformer
    from shapely.geometry import Polygon
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    jobs = []
    for n, it in enumerate(snap, start=1):
        ring = [[float(a), float(b)] for a, b in it["ring"]]
        poly = Polygon([(lng, lat) for lat, lng in ring])
        shape = sh_transform(lambda x, y, z=None: fwd(x, y), poly).area
        lats = [p[0] for p in ring]
        lngs = [p[1] for p in ring]
        center = [round((min(lats) + max(lats)) / 2, 6), round((min(lngs) + max(lngs)) / 2, 6)]
        alias = [
            f"송파동 117({n}구역)",
            f"(가)송파동 117({n}구역)",
            f"송파동 117 {n}구역",
            f"송파동 117{n}구역",
            f"송파117 {n}구역",
            f"(가칭)송파1동 하단 모아타운 {n}구역",
            f"송파1동 하단 {n}구역",
            f"송파1동 하단 모아타운 {n}구역",
            f"송파동 모아타운 {n}구역",
            f"송파117 {n}",
        ] + ALIAS_COMMON
        jobs.append(
            {
                "draftId": it["draftId"],
                "id": f"songpa117-moa-{n}",
                "name": it["name"],
                "ring": ring,
                "area": int(it["areaSqm"]),
                "areaShape": round(shape, 1),
                "center": center,
                "alias": alias,
                "note": zone_note(n, EXTRA_NOTE_4 if n == 4 else ""),
                "areaNote": area_note(int(it["areaSqm"]), shape),
            }
        )
    return snap, jobs


META_ENTRY = {
    "asOf": ASOF,
    "zones": [f"songpa117-moa-{n}" for n in range(1, 6)],
    "note": (
        "송파동 117(1~5구역) 5곳을 대표가 관리자 화면에서 직접 그린 경계로 정식 반영(2,379 → 2,384곳, "
        "2026-11-25). 2026-11-24에 뺀 옛 추정 경계(참고도) 6곳을 대신하는 것으로, 좌표는 그린 그대로이고 "
        "geom='직접작도'·boundaryApprox=false. 1~5구역 합계 약 98,271㎡(그리기 도구 계산값)."
    ),
}

COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def _norm(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _feature(geo, zid):
    return next((f for f in geo["features"] if f["properties"].get("id") == zid), None)


def _head_features():
    raw = subprocess.run(
        ["git", "show", "HEAD:public/data/zones.geojson"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return {f["properties"]["id"]: f for f in json.loads(raw)["features"]}


def _measure(ring_lat_lng) -> float:
    from pyproj import Transformer
    from shapely.geometry import Polygon
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    poly = Polygon([(lng, lat) for lat, lng in ring_lat_lng])
    return sh_transform(lambda x, y, z=None: fwd(x, y), poly).area


def _shapely(geo_geom):
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    return sh_transform(lambda x, y, z=None: fwd(x, y), shape(geo_geom))


def _ring_of(feat):
    g = feat.get("geometry") or {}
    if g.get("type") == "MultiPolygon":
        ring = max((p[0] for p in g["coordinates"]), key=len)
    else:
        ring = (g.get("coordinates") or [[]])[0]
    pts = [[c[1], c[0]] for c in ring]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def check() -> int:
    bad = 0
    snap, jobs = build_jobs()
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))

    ids = [f["properties"]["id"] for f in geo["features"]]
    src_ids = [z.get("id") for z in src]
    print("    zones.geojson %d곳 · seoul-zones %d곳 (기대 %d곳)" % (len(ids), len(src), EXPECTED_AFTER))
    ok_count = len(ids) == EXPECTED_AFTER == len(src) == len(set(ids))
    print("[%s] 구역 수 %d/%d = %d (중복 id %d)" % ("OK" if ok_count else "FAIL", len(ids), len(src), EXPECTED_AFTER, len(ids) - len(set(ids))))
    bad += 0 if ok_count else 1
    print("[%s] geojson ↔ seoul-zones 구역 목록 %s" % ("OK" if set(ids) == set(src_ids) else "FAIL", "일치" if set(ids) == set(src_ids) else "불일치"))
    bad += 0 if set(ids) == set(src_ids) else 1

    # 기존 구역 무변경 — HEAD 와 구역 단위로 통째 비교
    head = _head_features()
    mine = {j["id"] for j in jobs}
    changed = []
    missing = []
    for zid, hf in head.items():
        if zid in mine:
            continue
        cf = _feature(geo, zid)
        if cf is None:
            missing.append(zid)
        elif _norm(cf) != _norm(hf):
            changed.append(zid)
    extra = [i for i in ids if i not in head and i not in mine]
    print("[%s] 기존 구역 변경 %d곳 · 사라짐 %d곳 · 새 구역(이번 5곳 밖) %d곳"
          % ("OK" if not changed and not missing and not extra else "FAIL", len(changed), len(missing), len(extra)))
    if changed:
        print("    바뀐 구역:", ", ".join(changed[:10]))
    if missing:
        print("    사라진 구역:", ", ".join(missing[:10]))
    if extra:
        print("    새 구역:", ", ".join(extra[:10]))
    bad += 0 if not changed and not missing and not extra else 1

    for j, draft in zip(jobs, snap):
        feat = _feature(geo, j["id"])
        entry = next((z for z in src if z.get("id") == j["id"]), None)
        ring = _ring_of(feat) if feat else []
        g = (feat or {}).get("geometry") or {}
        closed = g.get("type") == "Polygon" and g["coordinates"][0][0] == g["coordinates"][0][-1]
        same_ring = len(ring) == len(j["ring"]) and all(
            abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9 for a, b in zip(ring, j["ring"])
        )
        okd = bool(
            feat
            and closed
            and same_ring
            and feat["properties"].get("geom") == "직접작도"
            and feat["properties"].get("boundaryApprox") is False
            and feat["properties"].get("name") == j["name"]
            and feat["properties"].get("gu") == "송파구"
            and abs((feat["properties"].get("area") or 0) - j["area"]) < 0.01
            and entry is not None
            and len(entry.get("polygon") or []) == len(j["ring"])
            and not entry.get("parts")
            and not entry.get("holes")
        )
        print("[%s] %s · %s — 정점 %d(기대 %d) · area=%s · geom=%s · 계측 %s㎡ (그리기 도구 %s㎡)"
              % ("OK" if okd else "FAIL", j["id"], j["name"], len(ring), len(j["ring"]),
                 feat["properties"].get("area") if feat else None,
                 feat["properties"].get("geom") if feat else None,
                 format(_measure(j["ring"]), ",.1f"), format(j["area"], ",")))
        bad += 0 if okd else 1

    # 5개 간 겹침·간격
    print("    ── 5개 구역 사이 겹침·간격 ──")
    if all(_feature(geo, j["id"]) for j in jobs):
        for a in range(len(jobs)):
            for b in range(a + 1, len(jobs)):
                ga = _shapely(_feature(geo, jobs[a]["id"])["geometry"])
                gb = _shapely(_feature(geo, jobs[b]["id"])["geometry"])
                o = ga.intersection(gb).area
                print("    [%s] %d구역 ∩ %d구역 = %s㎡ · 간격 %s m"
                      % ("OK" if o < 0.01 else "참고", a + 1, b + 1, format(o, ",.1f"), format(ga.distance(gb), ",.1f")))
    else:
        print("    [건너뜀] 아직 반영 전 — 5개 구역이 데이터에 없습니다")

    # 기존 다른 구역과의 겹침(겹쳐 덮이면 지도에서 두 구역이 같이 보인다)
    print("    ── 기존 구역과 겹침(참고) ──")
    for j in jobs:
        if not _feature(geo, j["id"]):
            continue
        gj = _shapely(_feature(geo, j["id"])["geometry"])
        for f in geo["features"]:
            zid = f["properties"]["id"]
            if zid in mine or not f.get("geometry"):
                continue
            o = gj.intersection(_shapely(f["geometry"])).area
            if o > 50:
                print("    [주의] %s ∩ %s(%s) = %s㎡" % (j["id"], zid, f["properties"].get("name"), format(o, ",.1f")))

    ok_meta = META_KEY in meta and META_KEY in (geo.get("metadata") or {}) and geo["metadata"].get("count") == len(geo["features"])
    print("[%s] zones-meta %s · metadata.count=%s (features %d)"
          % ("OK" if ok_meta else "FAIL", META_KEY, (geo.get("metadata") or {}).get("count"), len(geo["features"])))
    bad += 0 if ok_meta else 1
    print("결과: %s (%d건 실패)" % ("통과" if bad == 0 else "실패", bad))
    return bad


def apply() -> int:
    snap, jobs = build_jobs()
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    before = len(src)
    by_id = {z.get("id"): i for i, z in enumerate(src)}

    for j, draft in zip(jobs, snap):
        entry = {
            "id": j["id"],
            "sid": SID,
            "name": j["name"],
            "alias": j["alias"],
            "type": "모아타운",
            "kind": "모아타운(모아통합기획)",
            "stage": STAGE,
            "gu": "송파구",
            "area": j["area"],
            "featured": False,
            "sourceId": SID,
            "geom": "직접작도",
            "boundaryApprox": False,
            "center": j["center"],
            "centerLabel": "대표 직접작도 구역계 중심",
            "areaShape": j["areaShape"],
            "note": j["note"],
            "areaNote": j["areaNote"],
            "boundaryNote": "아래 boundaryNote 는 apply() 에서 채운다",
            "sources": SOURCES,
            "asOf": ASOF,
            "polygon": [list(p) for p in j["ring"]],
        }
        if j["id"] in by_id:
            src[by_id[j["id"]]] = entry
            print("[갱신] %s — %s" % (j["id"], j["name"]))
        else:
            src.append(entry)
            print("[추가] %s — %s (정점 %d · %s㎡)" % (j["id"], j["name"], len(j["ring"]), format(j["area"], ",")))

    # 5개 구역의 이격·겹침을 실측해 boundaryNote 에 적는다
    geo_now = {j["id"]: _shapely_draft(j["ring"]) for j in jobs}
    for i, j in enumerate(jobs, start=1):
        others = []
        for k, k2 in enumerate(jobs, start=1):
            if k == i:
                continue
            o = geo_now[j["id"]].intersection(geo_now[k2["id"]]).area
            d = geo_now[j["id"]].distance(geo_now[k2["id"]])
            if o >= 0.01:
                others.append("%d구역과 %s㎡ 겹침" % (k, format(o, ",.1f")))
            else:
                others.append("%d구역과 %sm 간격" % (k, format(d, ",.1f")))
        entry = next(z for z in src if z.get("id") == j["id"])
        entry["boundaryNote"] = (
            "2026-11-23 대표님(권용범)이 리디브 지도 관리자 화면에서 브이월드 지적편집도·도로선을 보며 직접 그린 "
            "%d정점 경계입니다(geom 직접작도, 정밀 측량값 아님). 좌표는 그린 그대로이며 한 점도 보정하지 않았습니다. "
            "이웃 구역과는 %s. 1~4구역은 송파동 필지 블록을 나눠 그린 것이고, 5구역은 송파나루역 쪽 남단 블록입니다. "
            "공식 구역계가 공개되면 그 도면으로 대체해야 합니다."
            % (len(j["ring"]), ", ".join(others))
        )

    meta[META_KEY] = META_ENTRY
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("[저장] seoul-zones %d→%d곳" % (before, len(src)))

    print("[내보내기] npm run geojson")
    subprocess.run(["npm", "run", "geojson"], cwd=ROOT, check=True)
    print("[색인] node scripts/build-zone-index.mjs")
    subprocess.run(["node", "scripts/build-zone-index.mjs"], cwd=ROOT, check=True)
    return check()


def _shapely_draft(ring):
    from pyproj import Transformer
    from shapely.geometry import Polygon
    from shapely.ops import transform as sh_transform

    fwd = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True).transform
    poly = Polygon([(lng, lat) for lat, lng in ring])
    return sh_transform(lambda x, y, z=None: fwd(x, y), poly)


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
