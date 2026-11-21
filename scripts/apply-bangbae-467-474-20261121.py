#!/usr/bin/env python3
"""
서초구 방배2동 이수초 인근 추진준비 재개발 2곳 신규 등록 (2026-11-21)

① 방배동 467-19번지 일대 (seocho-bangbae-467-19) — 신속통합기획(모아타운 병행 검토)
   · 2026-08-10 사업시행자(신탁사) 선정 입찰공고, 2026-08-21 방주교회 비전홀 주민설명회
     (추진준비위원회·㈜오엔랜드이십일·㈜코람코자산신탁, 노후도 신통 61% vs 모아타운 70%)
   · 서초구청 연번(동의서 번호) 부여 전 → 공식 구역계·면적 미공개
② (가칭) 방배동 474 일대 (seocho-bangbae-474) — 도심공공주택복합(도공복) 추진준비
   · 구역면적 22,316㎡, 토지등소유자 약 202명, 노후도 86.1%(56/65)
   · 2026-05-08 서초구 재건축사업과 결재문서 「도심 공공주택복합사업 공모 참가 신청서
     추가 제출(방배동 980번지 일대)」(비공개) → 국토부 후보지 선정 전

## 경계를 지어내지 않는다
   두 구역 모두 고시된 구역계가 없어 기존 미고시 구역과 같은 규격(geom="근사원",
   boundaryApprox=true)의 **위치 참고용 점선원**으로만 표시한다.
     · 중심 = 카카오 지번 지오코딩 좌표
         - 467-19: 서울 서초구 방배동 467-19 (방배천로6길 38-1) 37.4792098, 126.9848833
         - 474   : 대표 지번 방배동 475-28 (효령로 23-8)           37.4780290, 126.9871852
                   (서초구 결재문서의 구역 위치 표기. 방배동 474번지는 필지로 존재하지 않아
                    같은 일대의 대표 지번으로 잡았고, 474-1·474-2·475-13·528·980-24 등
                    구역 내 확인 지번 6곳의 무게중심 37.47808, 126.98699와 17m 차이)
     · 반경 = 면적을 원으로 환산(sqrt(면적/π)) — 474는 공개 면적 22,316㎡ → 84m,
              467-19는 면적 미공개라 기존 미고시 구역과 같은 80m(약 20,106㎡) 임시 반경
   점선원은 인접 정비구역(방배15·방배13)의 서울시 일반화 도형(UQ120)과 일부 겹칠 수 있고,
   그 사실을 boundaryNote 에 적는다. 재개발닷컴 등 타 사이트의 폴리곤은 쓰지 않았다.

실행: python3 scripts/apply-bangbae-467-474-20261121.py [--check]   (멱등 — 2회 실행 결과 동일)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"

META_KEY = "bangbae467474_20261121"

M_LAT = 110_540.0
M_LNG = 111_320.0 * math.cos(math.radians(37.478))


def circle_ring(lat: float, lng: float, radius_m: float, points: int = 96):
    """대표 지번 중심의 위치 참고용 원 — [lng, lat] 링(폐합)."""
    ring = []
    for i in range(points):
        t = 2 * math.pi * i / points
        ring.append(
            [
                round(lng + radius_m * math.cos(t) / M_LNG, 7),
                round(lat + radius_m * math.sin(t) / M_LAT, 7),
            ]
        )
    ring.append(ring[0][:])
    return ring


def circle_area(radius_m: float) -> float:
    return math.pi * radius_m * radius_m


# ── ① 방배동 467-19번지 일대 ─────────────────────────────────────────────────
Z1_ID = "seocho-bangbae-467-19"
Z1_CENTER = [37.4792097802745, 126.984883316208]  # 방배동 467-19 (방배천로6길 38-1)
Z1_RADIUS = 80.0
Z1_AREA = round(circle_area(Z1_RADIUS))
Z1_AREA_NOTE = (
    "공식 구역면적 미공개 — 위치 확인용 점선원(반경 80m, 약 20,106㎡)의 면적"
)
Z1_NOTE = (
    "서초구 방배2동, 서울이수초 바로 북쪽 방배동 467-19번지 일대입니다. 정식 후보지 선정 전 "
    "추진준비 단계로, 2026-08-10 사업시행자(신탁사) 선정 입찰공고가 났고 2026-08-21 오후 7시 "
    "방주교회 비전홀(방배천로24길 8)에서 추진준비위원회 주최 주민설명회가 열렸습니다. "
    "설명회에는 ㈜오엔랜드이십일(정비사업 절차·추진안내), ㈜하우드엔지니어링종합건축사사무소"
    "(사업 비전), ㈜랜드엔지니어링(방식별 사업성), ㈜코람코자산신탁(신탁방식)이 참여했고 "
    "토지등소유자가 참석했습니다. 신속통합기획(재개발)과 모아타운(가로주택) 두 방식을 함께 "
    "검토 중이며, 설명회 자료 기준 노후도는 신속통합기획 61%·모아타운 70%로 두 요건을 모두 "
    "충족합니다. 아직 서초구청 연번(동의서 번호) 부여 전이라 고시된 구역계와 공식 면적은 없습니다."
)
Z1_BOUNDARY_NOTE = (
    "위치 참고용 점선원 — 대표 지번 방배동 467-19(방배천로6길 38-1) 중심 반경 약 80m"
    "(면적 20,106㎡를 원으로 환산). 실제 사업 구역계가 아니며 고시 전입니다. "
    "공식 구역면적·구역계가 공개되지 않아 위치만 알려 주는 표시이고, "
    "인접 방배15구역(서울시 일반화 도형 UQ120)과 일부 겹칩니다."
)
Z1_SOURCES = [
    {
        "label": "위클리한국주택경제신문 — 방배동 467-19번지 일원 신속통합재개발사업 사업시행자(신탁사) 선정 입찰공고(2026-08-10)",
        "url": "https://www.arunews.com/news/articleView.html?idxno=65810",
    },
    {
        "label": "㈜오엔랜드이십일 공지 — 방배동467-19일원 정비사업 설명회(2026-08-21 방주교회 비전홀, 2026-08-24 등록)",
        "url": "http://onland21.com/board/index.html?id=notice&no=297",
    },
    {
        "label": "도시계획연구소 — 방배2동 재개발, 이수초 인근 방배동 467-19일대 신통기획·모아타운 설명회(2026-08-20)",
        "url": "https://m.blog.naver.com/dosi_lab/224384729892",
    },
]

# ── ② (가칭) 방배동 474 일대 ─────────────────────────────────────────────────
Z2_ID = "seocho-bangbae-474"
Z2_CENTER = [37.478029009241, 126.987185158349]  # 대표 지번 방배동 475-28 (효령로 23-8)
Z2_AREA = 22316
Z2_RADIUS = round(math.sqrt(Z2_AREA / math.pi))  # 84m (π·84² = 22,167㎡)
Z2_AREA_NOTE = (
    "구역면적 약 22,316㎡(6,751평) — 재개발닷컴 사업정보·서초구 결재문서 '약 2.2만㎡' 기준. "
    "토지등소유자 약 202명(추정)"
)
Z2_NOTE = (
    "서초구 방배동 474~980번지 일대(서울이수초에서 직선 약 253m, 사당역 도보 6분·508m) "
    "도심공공주택복합사업 추진준비 구역입니다. 구역면적 약 22,316㎡, 토지등소유자 약 202명(추정), "
    "전체 181세대 가운데 공동주택 158세대·단독주택 23세대, 근린생활시설 16동이고 "
    "노후도는 20년 기준 65동 중 56동(86.1%)으로 도심복합 요건을 넘습니다. 용도지역은 "
    "제2종일반주거 15,159㎡(67%)·제3종일반주거 7,496㎡(33%)입니다. 2026-05-08 서초구 "
    "도시관리국 재건축사업과에 「도심 공공주택복합사업 공모 참가 신청서 추가 제출"
    "(방배동 980번지 일대)」 결재문서가 올라 있습니다(비공개). 국토교통부는 2026-09-30 "
    "도심 공공주택 복합사업 후보지로 서초구에서는 '이수역 동측'(방배동 822-1 일대, "
    "22,997㎡·918호)을 선정했고, 이 구역은 아직 후보지 선정 전 추진준비 단계라 "
    "예정지구 지정·구역계 고시가 없습니다."
)
Z2_BOUNDARY_NOTE = (
    "위치 참고용 점선원 — 대표 지번 방배동 475-28(효령로 23-8) 중심 반경 약 84m"
    "(구역면적 22,316㎡를 원으로 환산). 실제 사업 구역계가 아니며 고시 전입니다. "
    "서초구 결재문서의 구역 위치 표기가 475-28이고, 방배동 474번지는 필지로 존재하지 않아 "
    "같은 일대(474-1·474-2·475-13·528·980-24 등)의 대표 지번을 중심으로 잡았습니다. "
    "점선원이 인접 방배15·방배13구역(서울시 일반화 도형 UQ120)과 일부 겹치는데, "
    "원으로 표시한 위치 참고 경계라 실제 구역계와는 다릅니다."
)
Z2_SOURCES = [
    {
        "label": "재개발닷컴 — (가)방배동 474 사업정보(도공복·추진준비, 구역면적 22,316㎡·소유자 약 202명·노후도 86.1%)",
        "url": "https://jaegebal.com/develops/4885",
    },
    {
        "label": "서울시 서초구 결재문서 — 도심 공공주택복합사업 공모 참가 신청서 추가 제출(방배동 980번지 일대), 2026-05-08 재건축사업과(비공개)",
        "url": "https://jaegebal.com/gnotices/sc-og-2026-330022",
    },
    {
        "label": "국토교통부 — 도심 공공주택 복합사업 서울 11곳(1.8만호) 신규 후보지 선정(2026-09-30, 서초구는 '이수역 동측')",
        "url": "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95092473",
    },
    {
        "label": "조아부동산중개 — 방배동 재개발·정비사업 현황((가)방배동 474~980, 도심공공복합 추진준비)",
        "url": "https://joa-realty.co.kr/%EC%9E%AC%EA%B0%9C%EB%B0%9C/%EC%84%9C%EC%B4%88%EA%B5%AC/%EB%B0%A9%EB%B0%B0%EB%8F%99/",
    },
]

ZONES = [
    {
        "id": Z1_ID,
        "center": Z1_CENTER,
        "radius": Z1_RADIUS,
        "props": {
            "name": "방배동 467-19번지 일대",
            "alias": [
                "방배동 467-19",
                "방배동 467-19번지 일대",
                "방배동 467-19 일대",
                "방배동 467-19번지 일원",
                "방배467-19",
                "방배2동 467-19",
                "이수초 인근",
            ],
            "type": "신통기획",
            "kind": "신속통합기획(모아타운 병행 검토)",
            "stage": "추진준비(신탁사 입찰)",
            "gu": "서초구",
            "area": Z1_AREA,
            "featured": False,
            "sourceId": "서초구 추진준비(신탁사 입찰공고 2026-08-10·주민설명회 2026-08-21)",
            "geom": "근사원",
            "boundaryApprox": True,
            "centerLabel": "대표 지번 방배동 467-19(방배천로6길 38-1), 서울이수초 북쪽",
            "note": Z1_NOTE,
            "areaNote": Z1_AREA_NOTE,
            "boundaryNote": Z1_BOUNDARY_NOTE,
            "sources": Z1_SOURCES,
            "asOf": "2026-11-21",
        },
    },
    {
        "id": Z2_ID,
        "center": Z2_CENTER,
        "radius": Z2_RADIUS,
        "props": {
            "name": "(가칭) 방배동 474 일대",
            "alias": [
                "방배동 474",
                "(가칭)방배동 474",
                "방배동 474 일대",
                "방배동 474~980",
                "방배동 474~980 일대",
                "방배474",
                "방배동 980",
                "이수초 인근",
            ],
            "type": "도공복",
            "kind": "도심공공주택복합",
            "stage": "추진준비(공모 참가 신청)",
            "gu": "서초구",
            "area": Z2_AREA,
            "featured": False,
            "sourceId": "서초구 결재문서(2026-05-08, 방배동 980번지 일대)",
            "geom": "근사원",
            "boundaryApprox": True,
            "centerLabel": "대표 지번 방배동 475-28(효령로 23-8) 일대",
            "note": Z2_NOTE,
            "areaNote": Z2_AREA_NOTE,
            "boundaryNote": Z2_BOUNDARY_NOTE,
            "sources": Z2_SOURCES,
            "asOf": "2026-11-21",
        },
    },
]

META = {
    "asOf": "2026-11-21",
    "additions": 2,
    "polygons": 0,
    "approxCircles": 2,
    "note": (
        "서초구 방배2동 이수초 인근 추진준비 2곳 신규 등록 — ① 방배동 467-19번지 일대"
        "(신통기획·모아타운 병행 검토, 2026-08-10 신탁사 입찰공고·2026-08-21 주민설명회), "
        "② (가칭) 방배동 474 일대(도공복 추진준비, 22,316㎡·소유자 약 202명·노후도 86.1%, "
        "2026-05-08 서초구 공모 참가 신청 결재문서). 두 곳 모두 고시 구역계가 없어 "
        "지번 중심점 기준 위치 참고용 점선원(geom='근사원')으로만 표시하며, "
        "타 사이트 폴리곤은 쓰지 않았습니다."
    ),
}


def _targets():
    return {z["id"]: z for z in ZONES}


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    ids = [f["properties"].get("id") for f in feats]
    dup = {i for i in ids if ids.count(i) > 1}
    print(f"[{'OK' if not dup else 'FAIL'}] 중복 id 없음 (features={len(feats)}, dup={sorted(dup)})")
    bad += 0 if not dup else 1

    for z in ZONES:
        feat = next((f for f in feats if f["properties"].get("id") == z["id"]), None)
        if not feat:
            print(f"[FAIL] geojson에 구역 없음: {z['id']}")
            bad += 1
            continue
        geom = feat.get("geometry") or {}
        ring = (geom.get("coordinates") or [[[]]])[0]
        expected = circle_ring(z["center"][0], z["center"][1], z["radius"])
        props = feat["properties"]
        center_ok = props.get("center") == [round(v, 7) for v in z["center"]]
        ok = (
            geom.get("type") == "Polygon"
            and len(ring) == len(expected)
            and ring[0] == ring[-1]
            and ring[:5] == expected[:5]
            and props.get("geom") == "근사원"
            and props.get("boundaryApprox") is True
            and abs((props.get("area") or 0) - z["props"]["area"]) < 0.01
            and center_ok
            and props.get("name") == z["props"]["name"]
        )
        print(
            f"[{'OK' if ok else 'FAIL'}] geojson {props.get('name')} ({z['id']}) "
            f"geom={props.get('geom')} approx={props.get('boundaryApprox')} "
            f"area={props.get('area')} verts={len(ring)} center={props.get('center')}"
        )
        bad += 0 if ok else 1

        src = json.loads(SOURCE.read_text(encoding="utf-8"))
        entry = next((e for e in src if e.get("id") == z["id"]), None)
        ok2 = (
            entry is not None
            and entry.get("geom") == "근사원"
            and len(entry.get("polygon") or []) == len(expected) - 1
            and abs((entry.get("area") or 0) - z["props"]["area"]) < 0.01
            and entry.get("stage") == z["props"]["stage"]
        )
        print(
            f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {z['id']} "
            f"polygon={len(entry.get('polygon') or []) if entry else 0} "
            f"geom={entry.get('geom') if entry else None} stage={entry.get('stage') if entry else None}"
        )
        bad += 0 if ok2 else 1

    meta = geo.get("metadata", {})
    ok3 = meta.get(META_KEY) is not None and meta.get("count") == len(feats)
    print(
        f"[{'OK' if ok3 else 'FAIL'}] metadata.count={meta.get('count')} features={len(feats)} "
        f"batch={META_KEY in meta}"
    )
    bad += 0 if ok3 else 1
    print(f"→ 총 구역 수 {len(feats)}곳")
    return bad


def apply() -> int:
    targets = _targets()

    # 1) public/data/zones.geojson — 배포 산출물
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    for z in ZONES:
        ring = circle_ring(z["center"][0], z["center"][1], z["radius"])
        props = {"id": z["id"], **z["props"], "center": [round(v, 7) for v in z["center"]]}
        feat = next((f for f in feats if f["properties"].get("id") == z["id"]), None)
        if feat is None:
            feats.append(
                {"type": "Feature", "id": z["id"], "properties": props,
                 "geometry": {"type": "Polygon", "coordinates": [ring]}}
            )
            print(f"[geojson] 새 구역 추가: {props['name']} ({z['id']})")
        else:
            feat["properties"] = props
            feat["geometry"] = {"type": "Polygon", "coordinates": [ring]}
            print(f"[geojson] 기존 구역 갱신: {props['name']} ({z['id']})")
        print(f"          반경 {z['radius']}m · 정점 {len(ring) - 1} · 중심 {z['center']}")
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(feats)
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] features={len(feats)}")

    # 2) src/data/seoul-zones.json — 파이프라인 원천
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for z in ZONES:
        entry = next((e for e in src if e.get("id") == z["id"]), None)
        if entry is None:
            entry = {"id": z["id"]}
            src.append(entry)
            print(f"[seoul-zones] 새 구역 추가: {z['id']}")
        else:
            print(f"[seoul-zones] 기존 구역 갱신: {z['id']}")
        entry.update(z["props"])
        entry["center"] = [round(v, 7) for v in z["center"]]
        entry["sid"] = z["props"]["sourceId"]
        # 원·폐합 없이 [lat, lng] 링만 저장한다(내보내기 스크립트가 폐합한다)
        entry["polygon"] = [[lat, lng] for lng, lat in circle_ring(z["center"][0], z["center"][1], z["radius"])][:-1]
        entry.pop("parts", None)
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
