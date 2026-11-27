#!/usr/bin/env python3
"""리디브 — 2단계 A: 공식 도형(UQ120 원본) 반영 + 마포 신수동 지주택 정리 (2026-11-27)

## 무엇
 1) 서울 UQ120 원본 SHP(scripts/data/official-seongdong-20261127.json)에서 뽑은 공식 구역계로 교체·등록
    · 금남시장(11000UQ120PS202505311220, BZ603 시장정비사업) — 그동안 파이프라인이 BZ603을 빼서
      데이터에 없었다. 점으로 세워 둔 `sd-geumnam-market`에 공식 도형(60정점, 4,180㎡)을 붙인다.
    · 응봉대림1차아파트(11000UQ120PS202505311188, BZ602 리모델링활성화구역) — 같은 이유로 빠져 있던
      구역. 점으로 세운 `sd-eungbong-daerim1`에 공식 도형(81정점, 46,394㎡)을 붙인다.
    · 금호21구역 — 우리 데이터의 단순화 도형(31정점)을 원본 111정점으로 교체.
    · 금호동4가 1458 — 15정점 → 원본 87정점.
    · 군자동 349-8/350-18 — 31정점 → 원본 51정점. 같은 구역이 두 이름으로 등록돼 있어 하나로 합친다.
 2) 마포구 신수동 두 곳을 지역주택조합(지주택)으로 정리
    · `11440UQ120PS202607240001` 신수동 91-90 → **신수동무쇠막**(힐스테이트 마포더퍼스트 488세대, 2026-07-29 사용승인)
    · `11000UQ120PS202505310971` 신수동 91-318 → **신수동무쇠막2**(204세대, 조합설립인가 2022-12-05,
      지구단위계획구역 지정 2024-10-24 서울시고시 제2024-503호)

## 근거
  · 브이월드는 2026-11-27 18:00~24:00 전면 점검이라 필지를 못 받는다. 대신 서울시 원본 SHP가
    워크스페이스에 있어(2026-09 자료) 공식 도형을 그대로 쓸 수 있었다.
  · 신수동: K-apt(사용승인 2026-07-29, 488세대·4개동, 시행 신수동무쇠막 지역주택조합),
    서울시고시 제2024-503호(지구단위계획구역 4,720.7㎡·204세대).

실행: python3 scripts/apply-official-shapes-20261127.py [--check]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
META = ROOT / "src" / "data" / "zones-meta.json"
OFFICIAL = ROOT / "scripts" / "data" / "official-seongdong-20261127.json"
AS_OF = "2026-11-27"
META_KEY = "officialShapes_20261127"

VWORLD = {"label": "서울 열린데이터광장 — 서울시 도시계획사업 현황(서울플랜+) 원본 SHP",
          "url": "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do"}


def area_m2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111132.0 * math.cos(math.radians(lat0))
    ky = 111132.0
    s = 0.0
    for i in range(len(ring) - 1):
        s += (ring[i][1] * kx) * (ring[i + 1][0] * ky) - (ring[i + 1][1] * kx) * (ring[i][0] * ky)
    return abs(s / 2)


def set_shape(z, off, geom="UQ120"):
    ring = off["ring"]
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    z["polygon"] = ring
    z["parts"] = off.get("parts") or []
    if not z["parts"]:
        z.pop("parts", None)
    z["geom"] = geom
    z["ringPts"] = len(ring)
    z["areaShape"] = round(off["shapeArea"] or area_m2(ring), 1)
    z["asOf"] = AS_OF


def merge_gunja(zones):
    keep = next(z for z in zones if z["id"] == "11000UQ120PS202505310679")
    dup = [z for z in zones if z["id"] == "rest17gu-gj-군자동-349-8번지-일원-가로주택정비사업"]
    keep["name"] = "군자동 349-8번지 일원 가로주택정비사업"
    keep["alias"] = [
        "군자동 349-8", "군자동 349-8번지 일대", "군자동 349-8번지 일원",
        "군자동 350-18", "군자동 350-18번지 일원 가로주택정비사업",
    ]
    keep["nameNote"] = (
        "서울시 도시계획사업(서울플랜+) 데이터에는 '군자동 350-18번지 일원 가로주택정비사업'으로, "
        "광진구 공고·민간 구역지도는 '군자동 349-8번지 일원'으로 부릅니다. 면적(8,713㎡)·도형이 같은 "
        "한 구역이라 두 표기를 한 레코드로 합쳤습니다(2026-11-27)."
    )
    keep["households"] = 304
    keep["stageDates"] = {**(keep.get("stageDates") or {}), "prep": "2025-07-08"}
    keep["datesAsOf"] = AS_OF
    keep["note"] = (
        "광진구 군자동 349-8번지 일원(350-18 포함) 가로주택정비사업입니다. 서울시 데이터 기준 "
        "조합설립인가 추진중이고, 서울플랜+ 사업현황에는 2025-07-08 연번부여·8,713㎡·계획 304세대"
        "(분양 243·임대 61)로 잡혀 있습니다. 3종일반주거지역 100%, 30년 이상 노후도 약 93%. "
        "지도 경계는 서울시 의제처리구역(UQ120) 공식 도형(51정점)을 그대로 썼습니다(도형 9,206㎡, "
        "고시 면적 8,713㎡의 105.7%). 같은 구역이 서울시 데이터(350-18)와 서울플랜+ 준비 목록(349-8)에 "
        "두 번 등록돼 있던 것을 하나로 합쳤습니다."
    )
    removed = 0
    for z in dup:
        zones.remove(z)
        removed += 1
    return removed


def apply():
    off = json.loads(OFFICIAL.read_text(encoding="utf-8"))
    zones = json.loads(SOURCE.read_text(encoding="utf-8"))
    by_id = {z["id"]: z for z in zones}
    before = len(zones)

    removed = merge_gunja(zones)
    print(f"군자동 중복 정리: 레코드 {removed}개 삭제")

    # 금호21 — 원본 111정점
    z = by_id["11000UQ120PS202411014498"]
    set_shape(z, off["geumho21"])
    z["area"] = 75447
    z["areaNote"] = (
        "정비구역 면적 75,447㎡(서울시 데이터) — 공식 도형 실측은 69,490㎡로 8% 작습니다. "
        "도형이 구역 안 도로·공원 등 정비기반시설 필지를 빼고 그려져 있기 때문입니다."
    )
    z["boundaryNote"] = (
        "서울시 도시계획사업(서울플랜+) 원본 도형(111정점)을 그대로 썼습니다. 무수막길·무수막3·5길 "
        "일대와 금동어린이공원을 포함하고, 남측에 붙은 금남시장정비구역(4,717㎡)과는 겹치지 않습니다"
        "(겹침 0㎡ 확인). 우리 데이터에 있던 단순화 도형(31정점)을 원본으로 되돌렸습니다."
    )

    # 금호동4가 1458 — 원본 87정점
    z = by_id["11000UQ120PS202505310983"]
    set_shape(z, off["geumho1458"])
    z["boundaryNote"] = (
        "서울시 도시계획사업 원본 도형(87정점)을 그대로 썼습니다. 금호역 1·2번 출구 앞 "
        "장터1가길·동호로2길 사이 블록으로, 사용자가 보낸 지적편집도 캡처의 구역선과 모서리에서 "
        "10m 안쪽으로 일치합니다. 단순화 도형(15정점)을 원본으로 되돌렸습니다."
    )

    # 군자동 349-8 — 원본 51정점
    z = by_id["11000UQ120PS202505310679"]
    set_shape(z, off["gunja349-8"])
    z["boundaryNote"] = (
        "서울시 도시계획사업 원본 도형(51정점)을 그대로 썼습니다. 도형 9,206㎡ = 고시 면적 "
        "8,713㎡의 105.7%(도로·공원 포함)."
    )

    # 금남시장 — 점 → 공식 도형
    z = by_id["sd-geumnam-market"]
    set_shape(z, off["geumnam"])
    z["area"] = 4717.1
    z["stageCode"] = "PP1502"
    z["stageDates"] = {"district": "2025-05-01"}
    z["boundaryNote"] = (
        "서울시 도시계획사업 원본 도형(60정점, BZ603 시장정비사업)을 그대로 썼습니다. 도형 4,180㎡ = "
        "고시 4,717.1㎡의 88.6%로, 도형이 시장 안 도로 필지를 빼고 그려져 있습니다. 금호21구역 "
        "남측에 붙어 있고 두 구역의 겹침은 0㎡입니다."
    )
    z["note"] = (
        "1962년 개설해 60년이 넘은 성동구 금남시장을 상업시설 현대화·기반시설 확충으로 다시 짓는 "
        "시장정비사업입니다(「전통시장 및 상점가 육성을 위한 특별법」 제37조). 서울시가 2024-11-11 "
        "제2차 시장정비사업 심의위원회 심의를 거쳐 2025-05-01 서울특별시고시 제2025-252호로 "
        "추진계획을 승인하고 금남시장정비구역을 신설(4,717.1㎡)했으며, 같은 고시에서 금호지구중심 "
        "지구단위계획 결정(변경)·특별계획구역1 세부개발계획 결정과 지형도면을 함께 고시했습니다. "
        "시행자는 금남시장 시장정비사업 조합설립 추진위원회(위원장 이관희)이고, 구역 안에 공동주택 "
        "140세대(성동구 공고 제2025-327호 정정공고에서 용도를 도시형생활주택→공동주택으로 정정)와 "
        "판매·업무시설을 함께 짓습니다. 시장정비사업은 전통시장 특별법에 따른 정비사업이라 일반 "
        "재개발과 근거 법령·절차가 다릅니다(추진계획 승인 → 사업시행 → 착공)."
    )
    z["sources"] = list(z.get("sources") or []) [:2] + [
        {"label": "서울 열린데이터광장 서울시 도시계획사업 현황(서울플랜+) — 금남시장 시장정비사업 구역 도형(BZ603)", "url": VWORLD["url"]},
    ]

    # 응봉대림1차 — 점 → 공식 도형
    z = by_id["sd-eungbong-daerim1"]
    set_shape(z, off["eungbong-daerim1"])
    z["area"] = 46394
    z["boundaryNote"] = (
        "서울시 도시계획사업 원본 도형(81정점, BZ602 리모델링활성화구역)을 그대로 썼습니다. "
        "도형 46,394㎡는 단지 대지와 같고 공개 자료의 구역면적(약 4.6만㎡)과 맞습니다. "
        "2026-04-30 리모델링 조합설립인가가 취소돼 지금은 재건축(신통기획)으로 추진 중이지만, "
        "단지 경계 자체는 이 도형 그대로입니다."
    )
    z["areaNote"] = (
        "구역면적 46,394㎡ — 서울시 도시계획사업 원본 도형 실측값(리모델링활성화구역 기준)."
    )
    z["note"] = (
        "1986년 준공한 응봉동 100번지 일대 응봉대림1차아파트(최고 15층 10개동 855세대, 용적률 208%)입니다. "
        "2007-03-07 리모델링 주택조합설립인가를 받았지만 장기간 정체됐고, 2021년 주민 설문에서 재건축 "
        "전환(약 95% 찬성)을 결정해 2022년 말 재건축 추진준비위원회(위원장 유효열)를 출범시켰습니다. "
        "2023-10-09 정밀안전진단 통과, 2025-12-09 전체 토지등소유자 약 65% 동의로 신속통합기획안 접수. "
        "성동구는 2026-04-30 고시 제2026-70호로 리모델링 조합설립인가를 직권 취소(주택법 제14조의2)했고, "
        "2026년 7월 1차 신통기획 자문을 거쳐 연내 정비계획 입안제안·추진위원회 구성을 목표로 하고 있습니다."
    )

    # ── 마포 신수동 두 곳 ────────────────────────────────────────────────────
    z = by_id["11440UQ120PS202607240001"]
    z["name"] = "신수동무쇠막"
    z["type"] = "지주택"
    z["kind"] = "지역주택조합(지구단위계획구역)"
    z["alias"] = [
        "신수동 91-90", "신수동 91-90 일대", "신수동 91-90번지 일원",
        "신수동무쇠막", "무쇠막", "힐스테이트 마포더퍼스트", "힐스테이트마포더퍼스트",
        "역세권 장기전세", "광흥창역세권",
    ]
    z["households"] = 488
    z["stage"] = "사용승인(2026-07-29)"
    z["stageDates"] = {"complete": "2026-07-29"}
    z["datesAsOf"] = AS_OF
    z["asOf"] = AS_OF
    z["typeNote"] = (
        "마포구가 인가한 지역주택조합(신수동무쇠막 지역주택조합) 사업으로, 역세권 장기전세주택 "
        "지구단위계획 인센티브를 함께 받았습니다. 서울시 데이터에는 장기전세주택(BZ301)으로 들어와 "
        "있어 유형을 지주택으로 바로잡았습니다."
    )
    z["note"] = (
        "신수동 91-90번지 일대 신수동무쇠막 지역주택조합 사업입니다. 현대건설이 시공해 지하 4층~지상 "
        "28층 4개동 488세대 '힐스테이트 마포더퍼스트'로 2026-07-29 사용승인(준공)됐고, 입주·거래가 "
        "이어지고 있습니다(2026-11 실거래 다수). 구역면적 15,879㎡. 서울시 데이터에는 장기전세(BZ301)로 "
        "들어와 있었으나 실제로는 지역주택조합 사업입니다."
    )
    z["sources"] = [
        {"label": "K-apt 공동주택관리정보 — 힐스테이트마포더퍼스트(신수동 91-90, 488세대·4개동, 사용승인 2026-07-29, 시행 신수동무쇠막 지역주택조합·시공 현대건설)", "url": "https://www.k-apt.go.kr/"},
        {"label": "대한경제 — 「현대건설, 신수동 무쇠막 지역주택조합 공동주택 건설 PF 1,792억원 조달」(2025-05-06)", "url": "https://www.dnews.co.kr/uhtml/view.jsp?idxno=202505061523274330044"},
        VWORLD,
    ]

    z = by_id["11000UQ120PS202505310971"]
    z["name"] = "신수동무쇠막2"
    z["type"] = "지주택"
    z["kind"] = "지역주택조합(지구단위계획구역)"
    z["alias"] = [
        "신수동 91-318", "신수동 91-318 일대", "신수동 91-318번지 일원",
        "신수동무쇠막2", "무쇠막2", "역세권 장기전세", "광흥창역세권", "광흥창역세권 장기전세",
    ]
    z["households"] = 204
    z["owners"] = 76
    z["stage"] = "구역지정"
    z["stageDates"] = {"union": "2022-12-05", "district": "2024-10-24"}
    z["datesAsOf"] = AS_OF
    z["asOf"] = AS_OF
    z["typeNote"] = (
        "마포구가 인가한 지역주택조합(신수동무쇠막2) 사업으로, 광흥창역세권 장기전세주택 "
        "지구단위계획구역으로 지정됐습니다. 서울시 데이터에는 장기전세주택(BZ301)으로 들어와 있어 "
        "유형을 지주택으로 바로잡았습니다."
    )
    z["note"] = (
        "신수동 91-318번지 일대 신수동무쇠막2 지역주택조합 사업입니다. 2022-12-05 조합설립인가를 받고 "
        "서울특별시고시 제2024-503호(2024-10-24)로 광흥창역세권 장기전세주택 지구단위계획구역(4,720.7㎡) "
        "지정·계획 결정이 났습니다. 계획 204세대(분양 138·임대 66), 조합원 78명, 용적률 약 450%입니다. "
        "다음 단계는 사업계획승인입니다."
    )
    z["areaNote"] = (
        "지구단위계획구역 4,720.7㎡ — 서울특별시고시 제2024-503호 결정조서 기준. 계획 204세대"
        "(분양 138·임대 66)."
    )
    z["sources"] = [
        {"label": "서울특별시고시 제2024-503호 「광흥창역세권(신수동 91-318번지 일원) 장기전세주택 지구단위계획구역 지정 및 계획 결정 및 지형도면 고시」(2024-10-24)", "url": "https://jaegebal.com/gnotices/seoul-gs-2024-503"},
        {"label": "토지이음 고시정보 — 같은 고시 원문(서울시보 제4017호)", "url": "http://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?mobile_yn=&seq=607578"},
        VWORLD,
    ]

    SOURCE.write_text(json.dumps(zones, ensure_ascii=False), encoding="utf-8")

    node = shutil.which("node") or "node"
    for cmd in ([node, "scripts/export-geojson.mjs", "--force"], [node, "scripts/build-zone-index.mjs"]):
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print("$", " ".join(cmd), "→", r.returncode)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:])
            raise SystemExit("!! 재생성 실패")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta[META_KEY] = {
        "asOf": AS_OF,
        "note": (
            "서울시 원본 SHP(2026-09)에서 공식 구역계를 다시 뽑아 금남시장·응봉대림1차아파트를 등록하고 "
            "금호21(111정점)·금호동4가 1458(87정점)·군자동 349-8(51정점) 도형을 원본으로 교체. "
            "마포 신수동 두 곳(신수동무쇠막·신수동무쇠막2)을 지주택으로 정리."
        ),
        "zones": {
            "sd-geumnam-market": {"geom": "UQ120", "areaShape": off["geumnam"]["shapeArea"]},
            "sd-eungbong-daerim1": {"geom": "UQ120", "areaShape": off["eungbong-daerim1"]["shapeArea"]},
            "11000UQ120PS202411014498": {"geom": "UQ120", "ringPts": len(off["geumho21"]["ring"])},
            "11000UQ120PS202505310983": {"geom": "UQ120", "ringPts": len(off["geumho1458"]["ring"])},
            "11000UQ120PS202505310679": {"name": "군자동 349-8번지 일원 가로주택정비사업"},
            "11440UQ120PS202607240001": {"type": "지주택", "name": "신수동무쇠막"},
            "11000UQ120PS202505310971": {"type": "지주택", "name": "신수동무쇠막2"},
        },
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    geo["metadata"][META_KEY] = meta[META_KEY]
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    print(f"구역 {before} → {len(zones)}")


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0)
    apply()
