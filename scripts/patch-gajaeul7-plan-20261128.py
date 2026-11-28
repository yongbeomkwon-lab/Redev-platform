#!/usr/bin/env python3
"""가재울7구역(11410UQ120PS202604010002) 최신 사업개요 반영 — 2026-11-28

정본 `src/data/seoul-zones.json` 과 배포본 `public/data/zones.geojson` 의 **같은 구역 레코드에만**
사업개요 필드를 넣는다. 다른 구역·경계·권리산정기준일은 건드리지 않고, 끝나면 그 사실을 검증해 찍는다.

값의 출처
  · 총 1,435세대(공공주택 199 포함) · 지하4~지상40층 13개동 — 서울시 보도자료
    「제13차 정비사업 통합심의위원회 개최결과」(2025-12-19)
  · 분양 1,236(조합원 ≈662 · 일반분양 ≈574) · 임대 199 — 정비사업 정보몽땅 사업개요·공급계획
  · 시공사 GS건설·한화 건설부문 컨소시엄, 시공자 선정 2024-11-03 — 정보몽땅 추진경과·보도
  · 사업시행인가 2026-05-29 / 고시 2026-06-09 — 서대문구 고시·보도
  · 2026-11-16 감정평가서 제출기한 재연장 기록 — 정보몽땅 최근공개자료
  · 조합원 분양신청 대행업체 입찰공고 2026-11-02(마감 11-16) — 나라장터
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZONE_ID = "11410UQ120PS202604010002"

PLAN = {
    "households": 1435,
    "householdsSale": 1236,
    "householdsRental": 199,
    "householdsMember": 662,
    "householdsGeneral": 574,
    "contractor": "GS건설·한화 건설부문 컨소시엄",
    "buildScale": "지하 4층~지상 40층, 13개동",
    "planNote": (
        "2026년 11월 감정평가 마무리(정보몽땅 11/16 감정평가서 제출기한 재연장 기록 확인), "
        "2026년 12월 중순 조합원 분양신청 예정 — 관리처분인가 준비 중. "
        "조합원 분양신청 대행업체 입찰공고는 11/2 공고·11/16 마감."
    ),
    "planAsOf": "2026-11-28",
    "planSource": (
        "서울시 통합심의 확정(2025-12-18) · 사업시행인가·고시(2026-05-29/06-09) · "
        "정비사업 정보몽땅 사업개요·최근공개자료(2026-11-16)"
    ),
    "note": (
        "가재울 재정비촉진지구의 마지막 사업장입니다. 2012-06-07 정비구역 지정 뒤 10년 넘게 "
        "추진되지 않다가 2025-12-18 통합심의 조건부 의결로 1,435세대(공공주택 199세대 포함) "
        "규모가 확정됐습니다."
    ),
}

SOURCES = [
    {
        "label": "서울시 보도자료 — 제13차 정비사업 통합심의위원회 개최결과(가재울7구역 1,435세대 확정, 2025-12-19)",
        "url": "https://www.seoul.go.kr/news/news_report.do?nttNo=448913",
    },
    {
        "label": "서대문구 공고 제2026-739호 — 가재울7구역 사업시행계획인가 공람공고(2026-05-06)",
        "url": "https://www.sdm.go.kr/news/notice/notice.do?mode=view&sdmBoardSeq=311501",
    },
    {
        "label": "서대문구 고시 제2026-63호 — 가재울7구역 사업시행계획인가 고시(2026-06-09)",
        "url": "",
    },
    {
        "label": "정비사업 정보몽땅 — 가재울7 사업개요·최근공개자료(감정평가서 제출기한 재연장, 2026-11-16)",
        "url": "https://cleanup.seoul.go.kr/service/opendata/othbcDocInput/RecentlscrOpen.do?cafeId=410900000078E64",
    },
    {
        "label": "가재울7 공고 제2026-120호 — 조합원 분양신청 대행업체 선정 입찰공고(2026-11-02)",
        "url": "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01804251&bidPbancOrd=000",
    },
]

# 이 필드들만 바꾼다. rights* 는 절대 건드리지 않는다.
PROTECTED = ("rightsDate", "rightsBasis", "rightsNote")


def ring_hash(rec: dict) -> str:
    geom = json.dumps([rec.get("polygon"), rec.get("parts"), rec.get("holes")], sort_keys=True)
    return hashlib.sha256(geom.encode()).hexdigest()[:16]


def apply(rec: dict) -> None:
    rec.update(PLAN)
    dates = dict(rec.get("stageDates") or {})
    dates["builder"] = "2024-11-03"  # 시공자 선정 — 정보몽땅 추진경과
    rec["stageDates"] = dates
    rec["datesAsOf"] = "2026-11-28"
    have = {s["url"] + "|" + s["label"] for s in rec.get("sources") or []}
    merged = list(rec.get("sources") or [])
    for s in SOURCES:
        if s["url"] + "|" + s["label"] not in have:
            merged.append(s)
    rec["sources"] = merged


def main() -> int:
    zones_path = ROOT / "src/data/seoul-zones.json"
    geo_path = ROOT / "public/data/zones.geojson"

    zones = json.loads(zones_path.read_text(encoding="utf-8"))
    target = next(z for z in zones if z.get("sid") == ZONE_ID or z.get("id") == ZONE_ID)
    before = {
        "rights": {k: target.get(k) for k in PROTECTED},
        "geom": ring_hash(target),
        "stageDates": dict(target.get("stageDates") or {}),
    }
    apply(target)
    zones_path.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    fc = json.loads(geo_path.read_text(encoding="utf-8"))
    feat = next(f for f in fc["features"] if f["properties"].get("id") == ZONE_ID)
    props = feat["properties"]
    geo_before = ring_hash(props)
    apply(props)
    geo_path.write_text(
        json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    # ── 검증 ────────────────────────────────────────────────────────────────
    ok = True
    checks = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and cond
        checks.append(f"{'OK  ' if cond else 'FAIL'} {name}{(' — ' + detail) if detail else ''}")

    z2 = json.loads(zones_path.read_text(encoding="utf-8"))
    t2 = next(z for z in z2 if z.get("sid") == ZONE_ID)
    g2 = json.loads(geo_path.read_text(encoding="utf-8"))
    f2 = next(f for f in g2["features"] if f["properties"].get("id") == ZONE_ID)

    check("JSON 구역 수 그대로", len(z2) == len(zones), f"{len(z2)}곳")
    check("geojson feature 수 그대로", len(g2["features"]) == len(fc["features"]), f"{len(g2['features'])}곳")
    check("권리산정기준일 유지", {k: t2.get(k) for k in PROTECTED} == before["rights"],
          json.dumps(before["rights"], ensure_ascii=False))
    check("경계 도형 유지(JSON)", ring_hash(t2) == before["geom"], before["geom"])
    check("경계 도형 유지(geojson)", ring_hash(f2["properties"]) == geo_before, geo_before)
    check("stageDates 기존 값 유지", all(t2["stageDates"].get(k) == v for k, v in before["stageDates"].items()),
          json.dumps(before["stageDates"], ensure_ascii=False))
    check("builder 2024-11-03", t2["stageDates"].get("builder") == "2024-11-03")
    check("현재 단계 사업시행인가", t2.get("stage") == "사업시행인가", t2.get("stage"))
    check("세대수 1+2=총", t2["householdsSale"] + t2["householdsRental"] == t2["households"],
          f"{t2['householdsSale']}+{t2['householdsRental']}={t2['households']}")
    check("조합원+일반=분양", t2["householdsMember"] + t2["householdsGeneral"] == t2["householdsSale"],
          f"{t2['householdsMember']}+{t2['householdsGeneral']}={t2['householdsSale']}")
    check("JSON·geojson 값 일치", all(f2["properties"].get(k) == t2.get(k) for k in PLAN),
          "사업개요 10개 필드")

    print("\n".join(checks))
    print("\n최종 레코드(JSON):")
    keys = ["name", "stage", "households", "householdsSale", "householdsRental",
            "householdsMember", "householdsGeneral", "contractor", "buildScale",
            "planNote", "planAsOf", "planSource", "note", "stageDates", "datesAsOf"]
    print(json.dumps({k: t2.get(k) for k in keys}, ensure_ascii=False, indent=1))
    print(f"\nsources {len(t2['sources'])}건")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
