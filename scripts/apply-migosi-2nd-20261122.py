#!/usr/bin/env python3
"""
리디브 미고시 2차 보강 — 2026-11-22

A. 구역계 폴리곤 반영 (2곳)
 · 신수13구역(마포, mp-shinsu-250) : 마포구 「구역 공개(신수동 250번지 일대, 제8호)」 2025-06-26 도면의
   구역계를 리디브 지적편집도 캡처에 특징점 정합(정합점 733, RMS 0.75px, 회전 0.01°)해 111정점으로 옮겼다.
   계측 44,818㎡ = 서울특별시고시 제2025-734호 제한면적 44,718㎡ 대비 +0.22%.
   서울시 고시 관계도면(지형도면)의 구역계와 형태 일치 확인. 신청인 제출안 → boundaryApprox true.
 · 성내동 431(강동, rest17gu-seongnae-431) : 강동구 주택도시개발공지(2026-09-04) 구역 공개 도면의
   구역계를 정합(정합점 152, RMS 2.07px, 회전 +1.3°)해 33정점으로 옮겼다. 계측 29,716㎡.
   공고문에 면적 표기가 없어 계측값을 area 에 넣고 areaNote 에 밝힌다. 신청인 제출안 → boundaryApprox true.

B. 데이터 결함·표기 정정 (4건)
 · 구로동 792-3 일대 → 구로동 792-33 일대 (서울특별시고시 제2026-103호 표기, 제한면적 58,472.7㎡ 일치)
 · 광흥창역세권(현석동 1-31) ↔ 광흥창역세권(신수동 301-1) 구분 문장 보완(양쪽)
 · 정릉동 16-179·신길동 90-31 note 문장 6회 중복 → 1회로 정리

실행: python3 scripts/apply-migosi-2nd-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
DATA = ROOT / "scripts" / "data" / "migosi-2nd-batch-20261122.json"
META_KEY = "migosi2ndBatch20261122"

B = json.loads(DATA.read_text(encoding="utf-8"))["zones"]
SH = B["mp-shinsu-250"]
SN = B["rest17gu-seongnae-431"]

SRC_SHINS = {
    "label": "마포구 「신속통합기획 주택재개발사업 후보지 신청 동의서 번호 부여 처리 공개(마포구 신수동 250번지 일대, 제8호)」(2025-06-26) — 구역계 도면",
    "url": "https://cleanup.seoul.go.kr/cleanup/bbs/vscr.do?bbs.bbsSn=3023&bbsClCode=1000&nttSn=161227",
}
SRC_SHINS_SIBO = {
    "label": "서울특별시고시 제2025-734호 「건축허가등 제한 지형도면 고시」(2025-12-26, 서울시보 제4114호) — 마포구 신수동 250 일대 제한면적 44,718㎡, 관계도면(제42쪽)에 구역계",
    "url": "https://www.seoul.go.kr/func/snews/data/CN_MST/seoulsibo_20251226131847_53209.pdf",
}
SRC_SEONGNAE = {
    "label": "강동구 주택도시개발공지(2026-09-04) 「성내동 431번지 일대 신속통합기획 주택재개발사업 후보지 추천 여부 검토를 위한 동의서 번호부여 구역 공개」",
    "url": "https://www.gangdong.go.kr/web/newportal/bbs/b_111/157466",
}
SRC_GURO_GOSI = {
    "label": "서울특별시고시 제2026-103호 「건축허가등 제한 지형도면 고시」(2026-02-26, 서울시보 제4129호) — 구로구 구로동 792-33 일대 제한면적 58,472.7㎡",
    "url": "https://www.seoul.go.kr/func/snews/data/CN_MST/seoulsibo_20260227133418_23907.pdf",
}
SRC_GURO_RIGHT = {
    "label": "서울특별시고시 제2026-104호 「주택등 건축물의 분양받을 권리의 산정 기준일 고시」(2026-02-26) — 구로동 792-33 일대 58,472.7㎡, 권리산정기준일 2026-01-26",
    "url": "https://www.seoul.go.kr/func/snews/data/CN_MST/seoulsibo_20260227133418_23907.pdf",
}

NOTE_SHINS = (
    "마포구 신수동 250번지 일대 신속통합기획 주택재개발사업 후보지입니다. 2025-06-26 마포구가 동의서 번호부여 "
    "(제8호) 구역 공개로 신청인 제출 구역계를 공개했고, 2025-12-16 서울시 후보지로 조건부 선정됐습니다(동의율 74%). "
    "2025-12-26 서울시보 제4114호 서울특별시고시 제2025-734호로 건축허가등 제한 지형도면이 고시됐고 제한면적은 "
    "44,718㎡입니다. 지도 경계는 구역 공개(제8호) 도면의 붉은 구역계를 옮긴 것이며, 같은 고시 관계도면(지형도면)의 "
    "구역계와 형태가 일치합니다. 신청인이 제출한 구역계이므로 후보지 추천·정비구역 지정 시 일부 변경될 수 있습니다."
)
AREA_NOTE_SHINS = (
    "고시(서울특별시고시 제2025-734호) 건축허가등 제한면적 44,718㎡. 도면 구역계를 선 두께만큼 보정해 옮긴 "
    "다각형의 계측 면적은 44,818㎡로 고시 면적 대비 +0.22%입니다."
)
BOUND_NOTE_SHINS = (
    "마포구 「구역 공개(신수동 250번지 일대, 제8호)」(2025-06-26) 1쪽 구역계 도면의 붉은 선을 옮겼습니다. "
    "도면을 리디브 지적편집도(카카오, 축척 0.5m/px) 캡처에 특징점 정합(SIFT+RANSAC)해 위치를 잡았고 — "
    "정합점 733개, 잔차 RMS 0.75px(약 0.4m), 회전 0.01° — 경계가 필지선·도로와 일치합니다. 선 두께(약 10px)의 "
    "절반을 보정해 중심선 111정점으로 만들었습니다. 신청인 제출 구역계(후보지 추천 시 변경 가능)입니다."
)

NOTE_SEONGNAE = (
    "강동구가 2026-09-04 성내동 431번지 일대에 동의서 번호를 부여하고 구역계를 공개했습니다. 후보지 추천 전 "
    "단계입니다. 지도 경계는 그 공개 도면(신청인 제출 구역계)의 붉은 점선을 옮긴 것이며 계측 면적은 29,716㎡입니다."
)
AREA_NOTE_SEONGNAE = (
    "공고문에 면적 표기가 없어 구역계 도면을 계측한 값(29,716㎡)을 넣었습니다. 지적편집도 캡처 대비 정합 "
    "RMS 2.07px(약 1.0m)입니다."
)
BOUND_NOTE_SEONGNAE = (
    "강동구 주택도시개발공지(2026-09-04) 구역 공개 도면(신청인 제출 구역계, 후보지 추천 시 조정 가능)의 붉은 "
    "점선 구역계를 옮겼습니다. 리디브 지적편집도 캡처에 특징점 정합(정합점 152개, 잔차 RMS 2.07px≈1.0m, "
    "회전 +1.3°)했고 33정점이며, 경계는 성내동 431·432·433·426·437 일대 도로·필지선을 따라갑니다."
)

ZONES = [
    {
        "id": "mp-shinsu-250",
        "name": "신수13구역",
        "alias": ["신수동 250", "신수동 250번지 일대", "신수동 250-36", "신수13", "신수13구역"],
        "type": "신통기획",
        "kind": "신속통합기획(재개발)",
        "stage": "건축허가등 제한(2025-12-26)",
        "gu": "마포구",
        "area": 44718,
        "featured": False,
        "geom": "공고도면",
        "boundaryApprox": True,
        "sourceId": "마포구 구역 공개(제8호, 2025-06-26) + 서울특별시고시 제2025-734호 지형도면",
        "centerLabel": "도면 구역계 중심",
        "selectedAt": "2025-12-16",
        "asOf": "2026-11-22",
        "note": NOTE_SHINS,
        "areaNote": AREA_NOTE_SHINS,
        "boundaryNote": BOUND_NOTE_SHINS,
        "sources": [SRC_SHINS, SRC_SHINS_SIBO],
        "ring": "mp-shinsu-250",
    },
    {
        "id": "rest17gu-seongnae-431",
        "name": "성내동 431",
        "alias": ["성내동 431", "성내동431", "성내동 431번지 일대"],
        "type": "신통기획",
        "kind": "신속통합기획",
        "stage": "동의서 번호부여(2026-09-04)",
        "gu": "강동구",
        "area": 29716,
        "featured": False,
        "geom": "공고도면",
        "boundaryApprox": True,
        "sourceId": "강동구 구역 공개(2026-09-04) 구역계 도면",
        "selectedAt": "2026-09-04",
        "asOf": "2026-11-22",
        "note": NOTE_SEONGNAE,
        "areaNote": AREA_NOTE_SEONGNAE,
        "boundaryNote": BOUND_NOTE_SEONGNAE,
        "sources": [SRC_SEONGNAE],
        "ring": "rest17gu-seongnae-431",
    },
]

NOTE_GURO = (
    "구로구 구로동 792-33번지 일대 신속통합기획 주택재개발 후보지입니다. 2026-02-23 재개발 후보지 선정위원회에서 "
    "선정돼 2026-02-26 서울시보 제4129호 서울특별시고시 제2026-103호로 건축허가등 제한 지형도면이 고시됐습니다"
    "(제한면적 58,472.7㎡). 같은 호 고시 제2026-104호로 권리산정기준일은 2026-01-26(자치구 추천일)입니다. "
    "종전 표기 ‘구로동 792-3’은 서울시 신통기획 아카이브·고시 표기 ‘구로동 792-33’과 다른 필지(약 60m 떨어짐)여서 "
    "고시 표기로 명칭을 정정했습니다. 아직 구역계는 공개되지 않았습니다."
)

NOTE_HYEON = (
    "광흥창역세권(현석동 1-31 일원) 장기전세주택 도시정비형 재개발사업입니다. 마포구가 2026-07-02 공고 제2026-1046호로 "
    "정비구역 지정 및 정비계획 결정(안) 공람을 시작했습니다(공람 2026.7.2~8.3). 구역면적 22,746.4㎡, 토지이용계획은 "
    "정비기반시설 5,272.4㎡(도로 3,152.4·공원 2,120.0)와 획지 17,474.0㎡입니다. 이름이 같은 ‘광흥창역세권(신수동 301-1 "
    "일원)’(2026-10-22 정비구역 지정 고시, 15,734.9㎡)과는 서로 다른 사업으로, 이 구역은 그 구역계 서쪽으로 약 110m "
    "떨어져 있고 경계가 겹치지 않습니다."
)

NOTE_SHINSU301 = (
    "광흥창역세권(신수동 301-1 일원) 장기전세주택 도시정비형 재개발사업입니다. 2026-10-14 서울시 공문(공공주택과-12417)으로 "
    "정비구역 지정 및 정비계획 결정·지형도면 고시가 통보됐고, 서울시 고시 제2026-590호(2026-10-22)로 고시됐습니다. "
    "정비구역 15,734.9㎡이며 2026-11 현재 일부 주민이 비대위를 준비하는 등 갈등 요인이 있습니다. 이름이 같은 "
    "‘광흥창역세권(현석동 1-31 일원)’은 공람 단계의 별개 구역으로 이 구역 서쪽 약 110m에 있습니다."
)


def dedupe_note(text: str) -> str:
    """같은 문장이 반복 저장된 note 를 1회로 줄인다."""
    parts = [p.strip() for p in text.split(". ")]
    seen, out = set(), []
    for p in parts:
        key = p.rstrip(".")
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return ". ".join(out) + "."


def props_of(z: dict) -> dict:
    p = {k: v for k, v in z.items() if k not in ("id", "ring")}
    return p


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for z in ZONES:
        zid, ring = z["id"], B[z["ring"]]["ring"]
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        e = next((x for x in src if x.get("id") == zid), None)
        if feat is None or e is None:
            print(f"[FAIL] 없음 {zid}")
            bad += 1
            continue
        pr = feat["properties"]
        n = len(feat["geometry"]["coordinates"][0]) - 1 if feat.get("geometry") else 0
        ok = (pr.get("geom") == z["geom"] and pr.get("boundaryApprox") is True
              and abs((pr.get("area") or 0) - z["area"]) < 0.6 and n == len(ring)
              and pr.get("note") == z["note"] and len(e.get("polygon") or []) == len(ring))
        print(f"[{'OK' if ok else 'FAIL'}] {zid}: geom={pr.get('geom')} approx={pr.get('boundaryApprox')} "
              f"area={pr.get('area')} ring={n}")
        bad += 0 if ok else 1
    # 결함 정리 확인
    for zid, n_exp in (("jeongneung-16-179", 1), ("singil-90-31", 1)):
        f = next(f for f in geo["features"] if f["properties"]["id"] == zid)
        cnt = f["properties"]["note"].count("2025-12-26 고시에서 건축허가 제한면적이")
        print(f"[{'OK' if cnt == n_exp else 'FAIL'}] {zid}: 문장 {cnt}회")
        bad += 0 if cnt == n_exp else 1
    g = next(f for f in geo["features"] if f["properties"]["id"] == "guro-792-3")
    print(f"[{'OK' if g['properties']['name'] == '구로동 792-33 일대' else 'FAIL'}] guro-792-3 name="
          f"{g['properties']['name']}")
    h = next(f for f in geo["features"] if f["properties"]["id"] == "mp-hyeonseok-1-31")
    print(f"[{'OK' if '신수동 301-1' in h['properties']['note'] else 'FAIL'}] mp-hyeonseok-1-31 구분 문장")
    print(f"[{'OK' if META_KEY in geo['metadata'] else 'FAIL'}] metadata {META_KEY}")
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    feats = {f["properties"]["id"]: f for f in geo["features"]}
    entries = {x.get("id"): x for x in src}

    for z in ZONES:
        zid = z["id"]
        ring = B[z["ring"]]["ring"]
        cent = B[z["ring"]]["centroid"]
        feat, entry = feats[zid], entries[zid]
        p = props_of(z)
        p["center"] = [round(cent[0], 6), round(cent[1], 6)]
        p["polygon"] = [[lat, lon] for lon, lat in ring]
        old = dict(feat["properties"])
        alias = list(dict.fromkeys((old.get("alias") or []) + (p.get("alias") or [])))
        merged = {**old, **p, "alias": alias}
        feat["properties"] = merged
        coords = [[lon, lat] for lon, lat in ring]
        coords.append(coords[0])
        feat["geometry"] = {"type": "Polygon", "coordinates": [coords]}
        entry.update({k: v for k, v in p.items()})
        entry["alias"] = alias
        entry["sid"] = p.get("sourceId") or entry.get("sid")
        entry["sourceId"] = p.get("sourceId") or entry.get("sourceId")
        print(f"[반영] {zid} — {len(ring)}정점, area={p['area']}, geom={p['geom']}")

    # 구로동 792-33 명칭 정정
    g = feats["guro-792-3"]
    gp = g["properties"]
    gp["name"] = "구로동 792-33 일대"
    gp["alias"] = list(dict.fromkeys((gp.get("alias") or []) + ["구로동 792-33", "구로 792-33", "구로동792-33"]))
    gp["note"] = NOTE_GURO
    gp["areaNote"] = ("서울특별시고시 제2026-103호 제한면적 58,472.7㎡(데이터 면적과 일치). "
                      "고시 제2026-104호 권리산정기준일 2026-01-26.")
    gp["centerLabel"] = "고시 표기 대표 지번 구로동 792-33"
    gp["center"] = [37.4862273, 126.8887891]
    gp["asOf"] = "2026-11-22"
    gp["stage"] = "후보지 선정(2026-02-23 선정위원회)"
    olds = gp.get("sources") or []
    gp["sources"] = [s for s in olds if isinstance(s, dict)] + [SRC_GURO_GOSI, SRC_GURO_RIGHT]
    ge = entries.get("guro-792-3")
    if ge:
        ge.update({"name": gp["name"], "alias": gp["alias"], "note": gp["note"], "areaNote": gp["areaNote"],
                   "stage": gp["stage"], "center": gp["center"], "centerLabel": gp["centerLabel"]})
    print("[반영] guro-792-3 → 구로동 792-33 일대 (명칭·별칭·출처 정정)")

    # 광흥창역세권 두 구역 구분
    h = feats["mp-hyeonseok-1-31"]
    h["properties"]["note"] = NOTE_HYEON
    h["properties"]["alias"] = list(dict.fromkeys((h["properties"].get("alias") or []) +
                                                 ["광흥창역세권(현석동)", "광흥창 현석동"]))
    h["properties"]["asOf"] = "2026-11-22"
    he = entries.get("mp-hyeonseok-1-31")
    if he:
        he["note"] = NOTE_HYEON
    s301 = feats.get("mp-shinsu-301-1")
    if s301:
        s301["properties"]["note"] = NOTE_SHINSU301
        se = entries.get("mp-shinsu-301-1")
        if se:
            se["note"] = NOTE_SHINSU301
    print("[반영] 광흥창역세권(현석동 1-31) ↔ (신수동 301-1) 구분 문장")

    # note 문장 중복 정리
    for zid in ("jeongneung-16-179", "singil-90-31"):
        f = feats[zid]
        before = f["properties"]["note"]
        after = dedupe_note(before)
        f["properties"]["note"] = after
        e = entries.get(zid)
        if e:
            e["note"] = after
        print(f"[반영] {zid} note {len(before)}자 → {len(after)}자")

    geo["metadata"][META_KEY] = {
        "asOf": "2026-11-22",
        "zones": 2,
        "note": ("구역계가 공개된 후보지 중 정합이 확인된 2곳(성내동 431)과 마포 신수13구역의 구역계를 도면에서 "
                 "옮겨 반영했다(신수13 계측 +0.22%, 성내동 431 계측 29,716㎡). 구로동 792-3→792-33 명칭 정정, "
                 "광흥창역세권 두 구역 구분, note 중복 2건 정리를 함께 담았다."),
    }
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
