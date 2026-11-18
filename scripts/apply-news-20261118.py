#!/usr/bin/env python3
"""
2026-11-18 저녁 재개발 뉴스 모니터링 결과를 public/data/zones.geojson 에 반영한다.

  1) 관악구 신림9구역 — 정비구역 지정 공람(정비계획안: 최고 29층·505세대·추정비례율 105.64%)
  2) 서울시 모아타운 4곳 관리계획안 통합심의 통과 — 개봉동 20·목2동 231-27·수유동 141·하월곡동 40-107
  3) 동대문구 용두동 39 — 신통기획 후보지 최종 선정 공식 발표(가칭 용두7구역), 별칭 보강
  4) 민간도심복합(주거중심형) 추진준비 2곳 — (가칭)내방1지구·(가칭)증산역세권
     · 구역계가 고시되기 전이라 대표 지번 중심에 면적을 원으로 환산한 반경의
       점선원(boundaryApprox=true, geom="근사원")만 둔다. 실제 경계가 아니다.

좌표는 카카오맵 지오코더(주소 검색)로 조회한 지번 중심이다.
  · 서울특별시 서초구 방배동 328-1 → 37.4854834, 126.9924697
  · 서울특별시 은평구 증산동 253    → 37.5822298, 126.9071758

사용: python3 scripts/apply-news-20261118.py [--check]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "public" / "data" / "zones.geojson"

DPNEWS_SILLIM9 = "https://www.dpnews.co.kr/news/articleView.html?idxno=2797"
DPNEWS_NAEBANG1 = "https://www.dpnews.co.kr/news/articleView.html?idxno=2794"
DPNEWS_JEUNGSAN = "https://www.dpnews.co.kr/news/articleView.html?idxno=2791"
NEWSIS_MOA = "https://www.newsis.com/view/NISX20261118_0003872984"
NEWSIS_YONGDU = "https://www.newsis.com/view/NISX20261118_0003873381"
DDM_YONGDU = ("https://www.ddm.go.kr/www/selectBbsNttView.do?bbsNo=38&key=904&nttNo=156889")


def circle_ring(lat: float, lng: float, radius_m: float, points: int = 96):
    """면적을 원으로 환산한 반경의 점선원 링(경도, 위도) — 서울 규모 평면 근사."""
    m_per_deg_lat = 110_540.0
    m_per_deg_lng = 111_320.0 * math.cos(math.radians(lat))
    ring = []
    for i in range(points):
        t = 2 * math.pi * i / points
        ring.append(
            [
                round(lng + radius_m * math.cos(t) / m_per_deg_lng, 7),
                round(lat + radius_m * math.sin(t) / m_per_deg_lat, 7),
            ]
        )
    ring.append(ring[0][:])
    return ring


def find(features, zone_id):
    for f in features:
        if f["properties"].get("id") == zone_id:
            return f
    raise SystemExit(f"[실패] 구역을 찾을 수 없음: {zone_id}")


def add_alias(props, extra):
    cur = props.get("alias") or []
    for a in extra:
        if a not in cur:
            cur.append(a)
    # 중복 제거(순서 유지)
    seen, out = set(), []
    for a in cur:
        if a not in seen:
            seen.add(a)
            out.append(a)
    props["alias"] = out


def main() -> int:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    features = data["features"]
    before = len(features)

    # ── 1) 신림9구역 ───────────────────────────────────────────────
    z = find(features, "11620UQ120PS202603030002")["properties"]
    z["stage"] = "정비구역지정(공람)"
    z["note"] = (
        "2026-11-18 관악구가 정비계획 수립 및 정비구역 결정(안) 주민공람을 시작했습니다"
        "(공람 2026.11.12~12.11, 주민설명회 2026.11.26 관악구청). 정비계획안은 최고 29층·"
        "505세대(임대주택 76세대 포함), 용적률 250% 이하·건폐율 60% 이하이고 추정비례율은 "
        "105.64%(총수입 약 4,294억원·총지출 약 2,902억원·종전자산 약 1,317억원)로 산정됐습니다. "
        "대상지는 신림동 119-1번지 일대이며, 일부 토지등소유자가 소형주택 비율·사업성·구역 설정에 "
        "이견을 내고 있어 지정까지 변동 가능성이 있습니다."
    )
    z["areaNote"] = "서울플랜+ 16,899㎡ / 디벨로퍼뉴스 2026-11-18 보도 17,298.3㎡(신림동 119-1 일대)"
    z["sources"] = [
        {
            "label": "디벨로퍼뉴스 — 신림9구역, 505세대 정비구역 지정 '임박'…추정비례율 105.64%(2026-11-18)",
            "url": DPNEWS_SILLIM9,
        }
    ]

    # ── 2) 모아타운 4곳 관리계획안 통합심의 통과 ──────────────────────
    moa = [
        (
            "11000UQ120PS202503070001",
            "개봉동 20",
            "구로구 개봉동 20번지 일대 65,416.6㎡. 기존 1,161가구에서 324가구 늘어난 1,485가구를 공급합니다. "
            "노후건축물 비율 72.1%인 매봉산 인접 저층주거지로, 2024-11 모아타운 대상지 선정 후 2026-02 A1구역이 "
            "공공참여 모아타운 공모에 선정돼 사업구역을 4만㎡ 이내로 확대하고 임대주택 기부채납 비율을 "
            "50%에서 30%로 낮췄습니다. A1·A2구역 용도지역 상향, 사업성 보정계수·특별건축구역 특례 적용, "
            "고척로21나길 8→14m·고척로19길 8→12m 도로 확장이 계획됐습니다.",
            "서울플랜+ 61,717㎡ / 관리계획안(2026-11-18 보도) 65,416.6㎡",
        ),
        (
            "11000UQ120PS202503070031",
            "목2동 231-27",
            "양천구 목2동 231-27 일대 72,347㎡. 모아주택 3곳을 통합 개발해 임대주택 287가구를 포함한 "
            "1,786가구를 공급합니다. 최고 지상 22층 계획이며 용왕산변·북측 저층주거지에 접한 곳은 15층 이하로 "
            "배치합니다. 사업성 보정계수 적용, 용왕산 근린공원 확대, 목동중앙본로18길 폭 14m 조성.",
            "서울플랜+ 64,474㎡ / 관리계획안(2026-11-18 보도) 72,347㎡",
        ),
        (
            "11000UQ120PS202503070055",
            "수유동 141",
            "강북구 수유동 141번지 일대 93,814.5㎡. 모아주택 6곳을 추진해 임대주택 453가구를 포함한 "
            "2,441가구를 공급합니다(기존 1,373가구 +1,068). 노후건축물 비율 76.9%, 사업성 보정계수 적용. "
            "백년시장 상인회와 업무협약으로 사업추진구역 지하에 약 70면 공영주차장을 조성하고, "
            "은모루어린이공원 918→1,502㎡ 확대·우이천변 공공공지 2곳을 신설합니다.",
            "서울플랜+ 73,865㎡ / 관리계획안(2026-11-18 보도) 93,814.5㎡",
        ),
        (
            "hawolgok-40-107",
            "하월곡동 40-107 일대 모아타운",
            "성북구 하월곡동 40-107 일대. 모아주택 1곳으로 임대주택 89가구를 포함한 607가구를 공급합니다"
            "(기존 403가구 +204). 노후·불량건축물 76.7%, 반지하 58.6%인 월곡역 인접 저층주거지로, "
            "월곡로18길을 폭 10~11m로 확장하고 화랑로14길변 진입로를 10→13m로 넓힙니다. 사업성 보정계수 적용.",
            "서울플랜+ 17,452㎡ / 관리계획안(2026-11-18 보도) — 세대수만 보도됨",
        ),
    ]
    for zone_id, name, body, area_note in moa:
        p = find(features, zone_id)["properties"]
        p["stage"] = "관리계획수립(심의통과)"
        p["note"] = (
            "2026-11-17 제13차 서울시 소규모주택정비 통합심의 본위원회에서 관리계획안이 수정·조건부 "
            f"의결됐습니다(서울시 발표 2026-11-18). {body}"
        )
        p["areaNote"] = area_note
        srcs = p.get("sources") or []
        if isinstance(srcs, list):
            srcs = [s for s in srcs if not (isinstance(s, dict) and s.get("url") == NEWSIS_MOA)]
            srcs.append(
                {
                    "label": "뉴시스 — 서울시 모아타운 4곳 관리계획 통과…6319가구 공급(2026-11-18)",
                    "url": NEWSIS_MOA,
                }
            )
            p["sources"] = srcs

    # ── 3) 용두동 39 (가칭 용두7구역) ────────────────────────────────
    p = find(features, "rest17gu-ddm-용두동-39")["properties"]
    add_alias(p, ["가칭 용두7구역", "용두7구역", "용두7"])
    p["note"] = (
        "동대문구 구역공개(2024-11-04, 동의양식 제2호) 후 2025-04 미선정·2025-06 행위제한·"
        "2026-09 재신청·2026-11-13 후보지 선정. 2026-11-18 동대문구가 서울시 신속통합기획 주택재개발 "
        "후보지 최종 선정을 공식 발표했습니다(가칭 용두7구역). 2025-04·2026-03 신청 때는 주민 반대로 "
        "탈락했으나 주민 동의율 70% 이상을 확보해 선정됐고, 인근 용두3구역(2026-03 정비구역 지정, 조합설립 "
        "준비)·용두8구역(역세권 장기전세)과 연계해 추진됩니다. 구역면적 75,408㎡(민간 정리값). "
        "구역계는 동대문구 구역공개 안내문(2024-11-04, 동의양식 제2호) 구역도에서 옮긴 폴리곤"
        "(geom=공고도면)으로 반영했습니다 — 동쪽은 왕산로 서편 필지까지 포함합니다."
    )
    # 출처는 화면(ZoneOfficialPanel)이 {label,url} 로 읽는다 — 앞 단계가 넣은 문자열 출처를 정리해 덮어쓴다(멱등).
    p["sources"] = [
        {
            "label": "동대문구 「신속통합기획 관련 동의양식 번호부여 및 구역공개(용두동 39번지 일대)」 안내문·구역도(2024-11-04, 동의양식 제2호)",
            "url": DDM_YONGDU,
        },
        {
            "label": "뉴시스 — 동대문구 용두동 39번지, 신통기획 재개발 후보지 선정(2026-11-18)",
            "url": NEWSIS_YONGDU,
        },
    ]
    p["sourceId"] = "2026-11-18 동대문구 발표"

    # ── 4) 민간도심복합(주거중심형) 추진준비 2곳 ──────────────────────
    NEW = [
        {
            "id": "seocho-naebang-1",
            "name": "(가칭)내방1지구",
            "alias": ["내방1지구", "내방1", "방배동 328-1", "방배동 328-1 일대"],
            "gu": "서초구",
            "dong": "방배동",
            "jibun": "328-1",
            "stage": "추진준비(신탁 MOU)",
            "area": 59961.5,
            "center": [37.4854834, 126.9924697],
            "centerLabel": "대표 지번 방배동 328-1(내방역 반경 350m 이내)",
            "note": (
                "(가칭)내방1지구 민간도심복합개발사업(주거중심형). 2026-11-17 내방1지구 추진준비위원회가 "
                "KB부동산신탁과 업무협약(MOU)을 체결했습니다(보도 2026-11-18). 대상지는 방배동 328-1번지 일대 "
                "59,961.5㎡로 내방역 반경 350m 이내이고 방배지구중심 일부를 포함하며, 제2·3종일반주거지역이 "
                "혼재합니다. 용도지역 상향과 용적률 완화를 검토하고, 노후 주거지를 통합 개발해 역세권 대규모 "
                "주거단지를 조성한다는 구상입니다. 주민 동의 확보·관계기관 협의가 남아 있고, 사업지구 지정 전이라 "
                "고시된 구역계는 없습니다."
            ),
            "sourceId": "디벨로퍼뉴스 2026-11-18",
            "source": {
                "label": "디벨로퍼뉴스 — 내방1지구, KB부동산신탁과 업무협약 체결…민간도심복합개발 추진(2026-11-18)",
                "url": DPNEWS_NAEBANG1,
            },
        },
        {
            "id": "eunpyeong-jeungsan-253",
            "name": "(가칭)증산역세권 민간도심복합",
            "alias": ["증산역세권", "증산역세권 민간도심복합", "증산동 253", "증산동 253 일대"],
            "gu": "은평구",
            "dong": "증산동",
            "jibun": "253",
            "stage": "추진준비(설명회)",
            "area": 50216,
            "center": [37.5822298, 126.9071758],
            "centerLabel": "대표 지번 증산동 253(증산역·DMC 인근)",
            "note": (
                "(가칭)증산역세권 민간도심복합개발사업(주거중심형). 2026-11-14 운영준비위원회가 은평구 "
                "서부동산교회에서 주민설명회를 열고 사업계획과 추진 방향을 공개했습니다(보도 2026-11-17). "
                "대상지 증산동 253번지 일대 50,216㎡(약 15,190평)에 준주거지역 상향·용적률 500% 이하를 전제로 "
                "지하 5층~지상 최고 49층, 총 2,139세대(일반분양 1,352·공공임대 787, 전용 59㎡가 약 70%)를 "
                "짓는 구상이며, 연면적 328,424.9㎡, 비주거시설 9,070㎡(판매·업무·문화시설·청년창업센터)를 "
                "계획했습니다. 모아주택 방식의 한계로 민간도심복합으로 방향을 바꾼 단계로, 토지등소유자 동의와 "
                "관계기관 협의에 따라 변경될 수 있습니다."
            ),
            "sourceId": "디벨로퍼뉴스 2026-11-17",
            "source": {
                "label": "디벨로퍼뉴스 — 증산동 253번지 일대, 모아주택 대신 '민간도심복합사업' 추진…2139세대 구상(2026-11-17)",
                "url": DPNEWS_JEUNGSAN,
            },
        },
    ]

    existing_ids = {f["properties"].get("id") for f in features}
    added = 0
    for spec in NEW:
        if spec["id"] in existing_ids:
            raise SystemExit(f"[중복] 이미 있는 구역 id: {spec['id']}")
        # 같은 지번·이름의 구역이 다른 id로 들어와 있지 않은지 확인
        for f in features:
            props = f["properties"]
            if props.get("gu") != spec["gu"]:
                continue
            blob = json.dumps(props, ensure_ascii=False)
            for key in (spec["jibun"] and f"{spec['dong']} {spec['jibun']}", spec["name"]):
                if key and key in blob:
                    raise SystemExit(f"[중복 의심] {spec['id']} ↔ {props.get('id')} ({key})")
        radius = math.sqrt(spec["area"] / math.pi)
        lat, lng = spec["center"]
        props = {
            "id": spec["id"],
            "name": spec["name"],
            "alias": spec["alias"],
            "type": "민간도심복합(주거중심형)",
            "kind": "민간도심복합개발(주거중심형)",
            "stage": spec["stage"],
            "gu": spec["gu"],
            "area": spec["area"],
            "featured": False,
            "sourceId": spec["sourceId"],
            "geom": "근사원",
            "boundaryApprox": True,
            "center": spec["center"],
            "centerLabel": spec["centerLabel"],
            "boundaryNote": (
                f"위치 참고용 점선원 — 대표 지번({spec['dong']} {spec['jibun']}) 중심 반경 약 {radius:.0f}m"
                f"(면적 {spec['area']:,.1f}㎡를 원으로 환산). 실제 사업 구역계가 아니며 고시 전입니다."
            ),
            "areaNote": f"사업 대상면적 {spec['area']:,.1f}㎡({spec['area'] / 3.305785:,.0f}평) — 언론 보도 기준",
            "note": spec["note"],
            "sources": [spec["source"]],
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [circle_ring(lat, lng, radius)]},
                "properties": props,
            }
        )
        existing_ids.add(spec["id"])
        added += 1
        print(f"[추가] {spec['name']} ({spec['id']}) — 반경 {radius:.1f}m, 면적 {spec['area']:,.1f}㎡")

    data["metadata"]["count"] = len(features)
    data["metadata"]["newsMonitor20261118"] = {
        "asOf": "2026-11-18",
        "updates": 6,
        "additions": added,
        "polygons": added,
        "note": (
            "2026-11-18 저녁 뉴스 모니터링 — 신림9구역 정비구역 지정 공람(디벨로퍼뉴스), 모아타운 4곳 "
            "관리계획안 통합심의 통과(뉴시스), 용두동 39 신통기획 후보지 최종 선정 공식 발표(뉴시스), "
            "민간도심복합(주거중심형) 추진준비 2곳(내방1지구·증산역세권) 추가. 경계가 고시되지 않은 2곳은 "
            "대표 지번 중심에 면적을 원으로 환산한 점선원(boundaryApprox=true, geom=근사원)만 둔다."
        ),
    }

    if "--check" in sys.argv:
        print(json.dumps(data["metadata"]["newsMonitor20261118"], ensure_ascii=False))
        return 0

    PATH.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"[완료] 구역 {before} → {len(features)}곳 (추가 {added})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
