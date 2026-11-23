#!/usr/bin/env python3
"""반포1동 민간도심복합(민도복) 1·2구역 + 방배동 2732번지 일대(전원마을) 등록 (2026-11-23)

■ 무엇을 넣나
  · (가)반포1동 1 — 서초구 반포1동, 민간도심복합개발(주거중심형) 추진준비. 55,464.2㎡
  · (가)반포1동 2 — 같은 사업 2구역. 57,022.2㎡
  · 방배동 2732번지 일대 — 서초구 신속통합기획 주택재개발, 동의서 번호부여 요청 구역 공개. 84,040.83㎡

■ 경계를 어떻게 잡았나
  · 반포 1·2구역: 추진위원회 누리집(banpo1.co.kr)이 공개한 구역 경계 GeoJSON(assets/zone1.json·
    assets/zone2.json)을 그대로 옮겼다. 대표님이 보내준 갈타맵 캡처(map.galta.kr, '민도복 (가) 반포1동 1·
    2')의 파란 구역선과 지오레퍼런싱 대조 결과 평균 1.1m(2.5px) 이내로 일치해, 같은 도면임을 확인했다.
    두 구역이 맞닿는 공유변에서 40㎡가 겹쳐 있어 1구역에서 2구역을 빼 두 구역 겹침을 0.1㎡로 없앴다.
  · 방배동 2732: 서초구 공고문 지적도(적색 점선 구역계)와 재개발뷰 지도 캡처의 블록 경계를 함께 보고
    옮겼다. 캡처 지도는 OSM 도로(과천대로·전원말안7길·전원말안11길·전원말8길·전원말4길 등)와
    지번 라벨로 지오레퍼런싱했고(스케일 0.786 m/px, 회전 -1°), 구역 외곽이 둘레 도로 바깥선을 따라가는
    도면 관행에 맞춰 3.4m 외곽 보정해 공고 면적(84,040.83㎡)의 98.8%로 맞췄다. 도로 중심선 기준 ±20m.

실행: python3 scripts/apply-banpo-mdb-bangbae2732-20261123.py [--check]   (멱등)
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

META_KEY = "banpoMindobokBangbae273220261123"
AS_OF = "2026-11-23"

# ── 경계 링 (위도, 경도) ──────────────────────────────────────────────────────
RING_B1 = [
    (37.5068225, 127.0193080), (37.5066526, 127.0186787), (37.5064826, 127.0179422),
    (37.5064826, 127.0178619), (37.5079537, 127.0172326), (37.5083255, 127.0171723),
    (37.5085751, 127.0170585), (37.5095576, 127.0166836), (37.5100196, 127.0181029),
    (37.5098762, 127.0181632), (37.5096319, 127.0181899), (37.5093080, 127.0187389),
    (37.5089999, 127.0191004), (37.5081237, 127.0195222), (37.5079272, 127.0188996),
    (37.5079074, 127.0189069), (37.5079006, 127.0188862), (37.5075544, 127.0190374),
]
RING_B2 = [
    (37.5100621, 127.0181230), (37.5103382, 127.0191875), (37.5105453, 127.0198101),
    (37.5091646, 127.0205063), (37.5084529, 127.0208478), (37.5080493, 127.0210553),
    (37.5080493, 127.0210754), (37.5076616, 127.0212763), (37.5074704, 127.0206135),
    (37.5072952, 127.0203992), (37.5071093, 127.0201716), (37.5070137, 127.0200578),
    (37.5069712, 127.0200243), (37.5067322, 127.0200779), (37.5065782, 127.0200913),
    (37.5064561, 127.0200243), (37.5062702, 127.0198569), (37.5060896, 127.0196762),
    (37.5060949, 127.0196360), (37.5068066, 127.0193548), (37.5068278, 127.0193414),
    (37.5073642, 127.0191205), (37.5079006, 127.0188862), (37.5081130, 127.0195289),
    (37.5090106, 127.0191004), (37.5093239, 127.0187389), (37.5096425, 127.0181966),
    (37.5098709, 127.0181832),
]
# 재개발뷰 캡처에서 옮긴 방배동 2732 구역계 — 캡처는 (경도, 위도) 순서라 뒤집어 둔다
RING_BB_LONLAT = [
    (126.989027, 37.467906), (126.989011, 37.468003), (126.989204, 37.468058),
    (126.989332, 37.467912), (126.989495, 37.467962), (126.989613, 37.467845),
    (126.989635, 37.467845), (126.990839, 37.468520), (126.990872, 37.468508),
    (126.991143, 37.468216), (126.991413, 37.468001), (126.991389, 37.467824),
    (126.990418, 37.467287), (126.990369, 37.467200), (126.990493, 37.466971),
    (126.990496, 37.466898), (126.990754, 37.466470), (126.990726, 37.466354),
    (126.990616, 37.466365), (126.990867, 37.465814), (126.990851, 37.465787),
    (126.990575, 37.465662), (126.990570, 37.465601), (126.991262, 37.464337),
    (126.990166, 37.463889), (126.990005, 37.463913), (126.989861, 37.463850),
    (126.989814, 37.463866), (126.989333, 37.464662), (126.989336, 37.464782),
    (126.989233, 37.464829), (126.988640, 37.465853), (126.988669, 37.465890),
    (126.988921, 37.465913), (126.988988, 37.466126), (126.988832, 37.466080),
    (126.988747, 37.466171), (126.988699, 37.466170), (126.988565, 37.466112),
    (126.988440, 37.466231), (126.988417, 37.466326), (126.988507, 37.466374),
    (126.988517, 37.466423), (126.988399, 37.466533), (126.988394, 37.466559),
    (126.988525, 37.466631), (126.988578, 37.466714), (126.988484, 37.466826),
    (126.988415, 37.466829), (126.988329, 37.466887), (126.988250, 37.467103),
    (126.988075, 37.467324), (126.988088, 37.467357), (126.988233, 37.467428),
    (126.988604, 37.467434), (126.988603, 37.467468), (126.988555, 37.467474),
    (126.988533, 37.467494), (126.988537, 37.467641), (126.988437, 37.467754),
    (126.988307, 37.467767), (126.988294, 37.467791), (126.988310, 37.467814),
    (126.988783, 37.468081), (126.988912, 37.468040), (126.988981, 37.467915),
]
RING_BB = [(lat, lon) for lon, lat in RING_BB_LONLAT]

BANPO_NOTE_COMMON = (
    "반포1동 저층주거지를 민간도심복합개발(주거중심형)로 정비하려는 추진준비 단계입니다. "
    "2026-11-16 반포1동 주민센터 대강당에서 1차 주민설명회가 열렸고, 신탁사가 사업시행자로 지정되는 구조와 "
    "1·2구역 합계 약 4,000세대·최고 49층·용적률 500% 가정 검토안이 제시됐습니다. "
    "2022년 모아타운 후보지에서 탈락하고 2024년 신속통합기획이 무산된 뒤 다시 추진되는 사업으로, "
    "서울시 주거중심형 세부 운영기준이 아직 고시되지 않아 대상지 확정 여부는 미정입니다. "
    "반대 주민 청원서 제출·결의대회도 있어 추진 여부가 유동적입니다."
)

ZONES = [
    {
        "id": "seocho-banpo1-mdb-1",
        "name": "(가)반포1동 1",
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발(주거중심형)",
        "stage": "추진준비",
        "gu": "서초구",
        "area": 55464,
        "areaShape": 57772,
        "households": 2100,
        "alias": [
            "반포1동 1", "반포1동1", "반포1동 1구역", "반포1동1구역", "(가)반포1동1", "(가)반포1동 1구역",
            "민도복 반포1구역", "민도복 (가) 반포1동 1", "반포 1구역", "반포1구역",
            "반포 민도복", "반포1동 민도복", "반포1동 민간도심복합", "반포1동 주거중심형",
            "반포1동 재개발", "반포1동 재건축", "도심복합개발", "민간도심복합",
            "신반포로 민도복", "경부고속도로 동측", "서초구 민도복", "서초구 민간도심복합",
        ],
        "centerLabel": "반포1동 1구역 — 신반포로 남측·경부고속도로 동측(잠원·신사 방면), 154필",
        "geom": "추진위안내도",
        "boundaryApprox": True,
        "note": (
            "민간도심복합개발(주거중심형) 추진준비 1구역입니다. " + BANPO_NOTE_COMMON + " "
            "추진위가 공개한 사업요건 검토표 기준 350m 이내 54,394.0㎡(98.1%) + 350~500m 1,070.2㎡(1.9%) = "
            "55,464.2㎡이고, 20년 이상 노후건축물 85.5%(요건 60% 이상), 용도지역은 제2종일반주거·"
            "제2종일반주거(7층 이하)·제3종일반주거로 요건을 충족합니다. 신반포로(폭 30m 보조간선도로) 접도는 "
            "134.1m/1,054.5m(12.7%, 요건 12.5% 이상)로 충족했습니다. 갈타맵 기준 154필·노후 85%, "
            "설명회 시뮬레이션은 약 2,100세대입니다."
        ),
        "areaNote": (
            "사업요건 검토표 55,464.2㎡(350m 이내 54,394.0 + 350~500m 1,070.2). 추진위 설명회 자료의 구역도 기준 "
            "면적은 54,118㎡, 갈타맵 경계 면적은 54,210㎡(16,398.5평)로 자료마다 2~3% 차이가 있습니다. "
            "지도에 그린 경계(추진위 공개 구역 경계)를 계측하면 57,772㎡로, 둘레 도로변을 경계 안에 두는 도면 "
            "기준이라 표기 면적보다 4%가량 큽니다."
        ),
        "boundaryNote": (
            "추진위원회 누리집(banpo1.co.kr)이 공개한 구역 경계 도면(assets/zone1.json)을 그대로 옮긴 경계이고, "
            "대표님이 보내주신 갈타맵 캡처의 파란 구역선과 평균 1.1m 이내로 일치합니다. 구역계가 고시되지 않은 "
            "추진준비 단계의 검토 경계라 확정 전입니다. 구역 안에는 반포동 715-19·717-16 가로주택정비사업(예정) "
            "구역 2곳(합계 562㎡)이 필지 단위로 들어 있어 이 경계와 겹칩니다(포함 관계)."
        ),
        "sourceId": (
            "반포1동 민간도심복합개발 추진위원회 공개 구역 경계(banpo1.co.kr/assets/zone1.json) + "
            "2026-11-16 1차 주민설명회 사업요건 검토표"
        ),
        "sources": [
            {"label": "반포1동 재개발 추진위원회 — 1차 주민설명회 자료(2026-11-16, 1구역 54,118㎡·2구역 55,660㎡·약 4,000세대·최고 49층)", "url": "https://www.banpo1.co.kr/"},
            {"label": "갈타맵 — 민도복 (가) 반포1동 1구역(추진준비·154필·노후 85%·경계 16,398.5평)", "url": "https://map.galta.kr/z/MAN-ebf3f2808c/%EA%B0%80%EC%B9%AD%20%EB%B0%98%ED%8F%AC1%EB%8F%99%201%EA%B5%AC%EC%97%AD"},
            {"label": "HCN뉴스 — 모아타운·신통기획 무산… 반포1동, 이번엔 '민도복'?(2026-11-19, 최고 50층·4천 세대 구상)", "url": "https://www.hcnnews.co.kr/news/articleView.html?idxno=59645"},
            {"label": "뉴스핌 — 민간도심복합개발사업 속도 늦어지나(2026-09-12, 반포1동 일대 거론·서울시 세부기준 미확정)", "url": "https://www.newspim.com/news/view/20260911001031"},
        ],
        "ring": RING_B1,
    },
    {
        "id": "seocho-banpo1-mdb-2",
        "name": "(가)반포1동 2",
        "type": "민간도심복합(주거중심형)",
        "kind": "민간도심복합개발(주거중심형)",
        "stage": "추진준비",
        "gu": "서초구",
        "area": 57022,
        "areaShape": 59104,
        "households": 1950,
        "alias": [
            "반포1동 2", "반포1동2", "반포1동 2구역", "반포1동2구역", "(가)반포1동2", "(가)반포1동 2구역",
            "민도복 반포2구역", "민도복 (가) 반포1동 2", "반포 2구역", "반포2구역",
            "반포 민도복", "반포1동 민도복", "반포1동 민간도심복합", "반포1동 주거중심형",
            "반포1동 재개발", "반포1동 재건축", "도심복합개발", "민간도심복합",
            "신반포로 민도복", "사평대로 민도복", "서초구 민도복", "서초구 민간도심복합",
        ],
        "centerLabel": "반포1동 2구역 — 신반포로 남측·사평대로 서측(논현역 방면), 247필",
        "geom": "추진위안내도",
        "boundaryApprox": True,
        "note": (
            "민간도심복합개발(주거중심형) 추진준비 2구역입니다. " + BANPO_NOTE_COMMON + " "
            "추진위가 공개한 사업요건 검토표 기준 350m 이내 57,022.2㎡(100.0%)로 전부 역세권 범위이고, "
            "20년 이상 노후건축물 77.2%(요건 60% 이상), 용도지역은 제2종일반주거·제2종일반주거(7층 이하)·"
            "제3종일반주거·준주거로 요건을 충족합니다. 신반포로(폭 30m) 접도는 162.0m/1,251.6m"
            "(12.9%, 요건 12.5% 이상)로 충족했습니다. 갈타맵 기준 247필·노후 77%, 설명회 시뮬레이션은 "
            "약 1,950세대입니다."
        ),
        "areaNote": (
            "사업요건 검토표 57,022.2㎡(350m 이내 100%). 추진위 설명회 자료의 구역도 기준 면적은 55,660㎡로 "
            "2.4% 차이가 있습니다. 지도에 그린 경계(추진위 공개 구역 경계)를 계측하면 59,104㎡로, 둘레 도로변을 "
            "경계 안에 두는 도면 기준이라 표기 면적보다 4%가량 큽니다."
        ),
        "boundaryNote": (
            "추진위원회 누리집(banpo1.co.kr)이 공개한 구역 경계 도면(assets/zone2.json)을 그대로 옮긴 경계이고, "
            "대표님이 보내주신 갈타맵 캡처의 파란 구역선과 평균 1.1m 이내로 일치합니다. 1구역과 맞닿는 변은 두 "
            "도면이 40㎡ 겹쳐 있어 1구역 쪽을 잘라 겹침을 없앴습니다. 구역계가 고시되지 않은 추진준비 단계의 "
            "검토 경계라 확정 전입니다. 구역 안에는 반포동 703-15·719-16·720-25 가로주택정비사업(예정) 구역 3곳과 "
            "역세권 사업구역 1곳(합계 1,476㎡)이 필지 단위로 들어 있어 이 경계와 겹칩니다(포함 관계)."
        ),
        "sourceId": (
            "반포1동 민간도심복합개발 추진위원회 공개 구역 경계(banpo1.co.kr/assets/zone2.json) + "
            "2026-11-16 1차 주민설명회 사업요건 검토표"
        ),
        "sources": [
            {"label": "반포1동 재개발 추진위원회 — 1차 주민설명회 자료(2026-11-16, 2구역 55,660㎡·약 1,950세대)", "url": "https://www.banpo1.co.kr/"},
            {"label": "갈타맵 — 민도복 (가) 반포1동 2구역(추진준비·247필·노후 77%)", "url": "https://map.galta.kr/z/MAN-25784ce219/%EA%B0%80%EC%B9%AD%20%EB%B0%98%ED%8F%AC1%EB%8F%99%202%EA%B5%AC%EC%97%AD"},
            {"label": "HCN뉴스 — 모아타운·신통기획 무산… 반포1동, 이번엔 '민도복'?(2026-11-19)", "url": "https://www.hcnnews.co.kr/news/articleView.html?idxno=59645"},
        ],
        "ring": RING_B2,
    },
    {
        "id": "seocho-bangbae-2732",
        "name": "방배동 2732번지 일대",
        "type": "신통기획",
        "kind": "신속통합기획(재개발)",
        "stage": "동의서 번호부여 요청 구역 공개(서초구)",
        "gu": "서초구",
        "area": 84040.83,
        "areaShape": 83053,
        "alias": [
            "방배동 2732", "방배동2732", "방배동 2732번지", "방배동2732번지", "방배동 2732번지 일대",
            "방배 2732", "전원마을", "(가칭)전원마을", "전원마을 재개발", "전원말",
            "남태령", "남태령역", "남태령역 재개발", "방배2동 재개발", "방배2동",
            "과천대로 재개발", "전원말안길", "서초구 신통기획", "서초구 재개발",
            "동의서 번호부여", "입안요청제", "주택재개발",
        ],
        "centerLabel": "방배2동 전원마을 일대 — 남태령역(4호선) 북동측·과천대로 동측, 전원말안7길·11길·9길·8길 일원",
        "geom": "공고도면",
        "boundaryApprox": True,
        "note": (
            "서초구가 공개한 「방배동 2732번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개」의 "
            "구역입니다. 남태령역(4호선) 북동측, 과천대로 동쪽 전원마을(전원말안7길·전원말안11길·전원말안9길·"
            "전원말안1길·전원말4길·전원말8길 일대)의 노후 저층주거지로, 「도시 및 주거환경정비법」상 "
            "입안요청제에 따라 (가칭)추진주체가 동의서 번호부여를 요청해 구역계가 공개된 단계입니다. "
            "공고상 구역면적은 약 84,040.83㎡이고, 공개된 구역계는 신청인이 제출한 것으로 서울시 후보지 추천 "
            "과정에서 일부 변경·조정될 수 있습니다. 동의서 번호부여는 신속통합기획 후보지 신청 전 단계라 "
            "후보지 선정·정비구역 지정 전이고, 구역 안에는 제1종일반주거지역 단독·다세대 주택이 대부분입니다."
        ),
        "areaNote": (
            "서초구 공고 84,040.83㎡(약 2만5,400평). 지도에 그린 경계(공고 지적도·지도 캡처 대조 재현)를 계측하면 "
            "83,053㎡(-1.2%)입니다."
        ),
        "boundaryNote": (
            "서초구 공고문 지적도상 구역계(적색 점선)와 재개발뷰 지도 캡처의 블록 경계를 OSM 도로(과천대로·"
            "전원말안7길·전원말안11길·전원말8길·전원말4길 등)에 맞춰 옮긴 경계입니다(도로 중심선 기준 ±20m). "
            "공고문에 '신청인이 제출한 구역계로 후보지 추천 시 일부 변경·조정될 수 있음'이라고 적혀 있어 확정 전입니다."
        ),
        "sourceId": (
            "서초구 공고 — 방배동 2732번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개"
            "(구역면적 약 84,040.83㎡)"
        ),
        "sources": [
            {"label": "서초구 고시공고 — 방배동 2732번지 일대 주택재개발사업 추진을 위한 동의서 번호부여 요청 구역 공개(붙임 안내문·관련서식)", "url": "https://eminwon.seocho.go.kr/"},
            {"label": "연합뉴스 — 서초구, 방배동 전원마을 자투리땅에 공유주차장 조성(2022-10-07, 방배동 2732-14 일대)", "url": "https://www.yna.co.kr/view/AKR20221007049800004"},
        ],
        "ring": RING_BB,
    },
]


def _center(ring):
    lat = sum(p[0] for p in ring) / len(ring)
    lng = sum(p[1] for p in ring) / len(ring)
    return [round(lat, 6), round(lng, 6)]


def _ring_closed(ring):
    r = [[round(p[0], 7), round(p[1], 7)] for p in ring]
    if r[0] != r[-1]:
        r.append(r[0][:])
    return r


def _props(z):
    ring = _ring_closed(z["ring"])
    return {
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
        "center": _center(ring[:-1]),
        "note": z["note"],
        "areaNote": z["areaNote"],
        "boundaryNote": z["boundaryNote"],
        "sources": z["sources"],
        "asOf": AS_OF,
    }


def _feature(z):
    props = _props(z)
    if z.get("selectedAt"):
        props["selectedAt"] = z["selectedAt"]
    if z.get("households"):
        props["households"] = z["households"]
    ring = _ring_closed(z["ring"])
    return {
        "type": "Feature",
        "id": z["id"],
        "properties": props,
        "geometry": {"type": "Polygon", "coordinates": [[[p[1], p[0]] for p in ring]]},
    }


def _metric_area(ring):
    from shapely.geometry import Polygon
    from shapely.ops import transform as shp_transform
    import pyproj

    proj = pyproj.Transformer.from_crs(4326, 5179, always_xy=True)
    g = Polygon([(p[1], p[0]) for p in ring])
    return shp_transform(lambda x, y, z=None: proj.transform(x, y), g).area


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    ids = [f["properties"].get("id") for f in feats]
    dup = {i for i in ids if ids.count(i) > 1}
    print(f"[{'OK' if not dup else 'FAIL'}] 중복 id 없음 (features={len(feats)}, dup={sorted(dup)})")
    bad += 0 if not dup else 1

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for z in ZONES:
        feat = next((f for f in feats if f["properties"].get("id") == z["id"]), None)
        if not feat:
            print(f"[FAIL] geojson에 구역 없음: {z['id']}")
            bad += 1
            continue
        ring = _ring_closed(z["ring"])
        coords = feat["geometry"]["coordinates"][0]
        geom_ok = (
            feat["geometry"]["type"] == "Polygon"
            and len(coords) == len(ring)
            and all(abs(c[0] - p[1]) < 1e-8 and abs(c[1] - p[0]) < 1e-8 for c, p in zip(coords, ring))
        )
        p = feat["properties"]
        prop_ok = (
            p.get("type") == z["type"]
            and p.get("kind") == z["kind"]
            and p.get("stage") == z["stage"]
            and p.get("area") == z["area"]
            and p.get("name") == z["name"]
            and p.get("geom") == z["geom"]
            and p.get("asOf") == AS_OF
            and bool(p.get("note"))
            and bool(p.get("boundaryNote"))
            and len(p.get("alias") or []) >= 8
        )
        print(
            f"[{'OK' if geom_ok and prop_ok else 'FAIL'}] {z['name']} ({z['id']}) verts={len(coords)} "
            f"geom={p.get('geom')} area={p.get('area')} 계측={_metric_area(z['ring']):,.0f}"
        )
        bad += 0 if geom_ok and prop_ok else 1

        entry = next((e for e in src if e.get("id") == z["id"]), None)
        ok2 = (
            entry is not None
            and entry.get("geom") == z["geom"]
            and entry.get("area") == z["area"]
            and entry.get("stage") == z["stage"]
            and len(entry.get("polygon") or []) == len(ring) - 1
        )
        print(
            f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {z['id']} "
            f"polygon={len(entry.get('polygon') or []) if entry else 0} area={entry.get('area') if entry else None}"
        )
        bad += 0 if ok2 else 1

    meta = geo.get("metadata", {})
    ok3 = meta.get("count") == len(feats) and META_KEY in meta
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={meta.get('count')} features={len(feats)} batch={META_KEY in meta}")
    bad += 0 if ok3 else 1

    # 겹침 검사
    try:
        from shapely.geometry import shape
        from shapely.ops import transform as shp_transform
        import pyproj

        proj = pyproj.Transformer.from_crs(4326, 5179, always_xy=True)

        def to_m(g):
            return shp_transform(lambda x, y, z=None: proj.transform(x, y), g)

        new_ids = {z["id"] for z in ZONES}
        new = {f["properties"]["id"]: to_m(shape(f["geometry"])) for f in feats if f["properties"].get("id") in new_ids}
        others = [to_m(shape(f["geometry"])) for f in feats if f["properties"].get("id") not in new_ids and f.get("geometry")]
        ov_other = 0.0
        hit = []
        nested = []
        other_feats = [f for f in feats if f["properties"].get("id") not in new_ids and f.get("geometry")]
        for k, g in new.items():
            for o, fo in zip(others, other_feats):
                if g.bounds[0] > o.bounds[2] or g.bounds[2] < o.bounds[0] or g.bounds[1] > o.bounds[3] or g.bounds[3] < o.bounds[1]:
                    continue
                a = g.intersection(o).area
                if a > 1:
                    # 작은 사업예정 구역이 민도복 경계 안에 통째로 들어 있는 '포함' 관계는 겹침 오류가 아니다
                    if a / o.area > 0.99 and o.area < 5000:
                        nested.append(f"{fo['properties'].get('name')}({o.area:,.0f}㎡)")
                    else:
                        hit.append((k, fo["properties"].get("name"), round(a, 1)))
                        ov_other += a
        if nested:
            print(f"[INFO] 경계 안에 포함된 기존 소규모 구역 {len(nested)}곳: {', '.join(nested)}")
        keys = list(new)
        ov_self = 0.0
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                a = new[keys[i]].intersection(new[keys[j]]).area
                if a > 1:
                    hit.append((keys[i], keys[j], round(a, 1)))
                ov_self += a
        ok4 = ov_other < 5 and ov_self < 5
        print(f"[{'OK' if ok4 else 'FAIL'}] 구역 밖 기존 구역과의 부분 겹침 {ov_other:.2f}㎡ · 새 구역끼리 겹침 {ov_self:.2f}㎡ {hit[:6]}")
        for k, g in new.items():
            print(f"       {k}: 계측 {g.area:,.0f}㎡")
        bad += 0 if ok4 else 1
    except Exception as exc:  # pragma: no cover
        print(f"[SKIP] 겹침 검사({exc})")

    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    idx_ids = {r["id"] for r in idx.get("zones", [])}
    missing = [z["id"] for z in ZONES if z["id"] not in idx_ids]
    print(f"[{'OK' if not missing else 'FAIL'}] zone-index {len(idx_ids)}건 · 누락 {missing}")
    bad += 0 if not missing else 1

    print(f"→ 총 구역 수 {len(feats)}곳")
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    feats = geo["features"]
    for z in ZONES:
        feat = _feature(z)
        cur = next((f for f in feats if f["properties"].get("id") == z["id"]), None)
        if cur is None:
            feats.append(feat)
            print(f"[geojson] 새 구역 추가: {z['name']} ({z['id']})")
        else:
            cur["properties"] = feat["properties"]
            cur["geometry"] = feat["geometry"]
            print(f"[geojson] 기존 구역 갱신: {z['name']} ({z['id']})")
        print(f"          면적(표기) {z['area']:,}㎡ · 정점 {len(_ring_closed(z['ring'])) - 1} · 중심 {feat['properties']['center']}")
    geo.setdefault("metadata", {})[META_KEY] = {
        "asOf": AS_OF,
        "additions": 3,
        "polygons": 3,
        "note": (
            "서초구 반포1동 민간도심복합(민도복) 1·2구역(추진위 공개 구역 경계 도면)과 방배동 2732번지 일대"
            "(서초구 동의서 번호부여 요청 구역 공개) 3곳 신규 등록. 모두 구역계 고시 전이라 실제 경계와 다를 수 있고, "
            "기존 2,431곳은 건드리지 않았다."
        ),
    }
    geo["metadata"]["count"] = len(feats)
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[geojson] features={len(feats)}")

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for z in ZONES:
        props = _props(z)
        ring = _ring_closed(z["ring"])
        entry = {
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
            "center": props["center"],
            "note": z["note"],
            "areaNote": z["areaNote"],
            "boundaryNote": z["boundaryNote"],
            "sources": z["sources"],
            "asOf": AS_OF,
            "sid": z["sourceId"],
            "polygon": [[p[0], p[1]] for p in ring[:-1]],
        }
        if z.get("selectedAt"):
            entry["selectedAt"] = z["selectedAt"]
        if z.get("households"):
            entry["households"] = z["households"]
        cur = next((e for e in src if e.get("id") == z["id"]), None)
        if cur is None:
            src.append(entry)
            print(f"[seoul-zones] 새 구역 추가: {z['id']}")
        else:
            cur.clear()
            cur.update(entry)
            print(f"[seoul-zones] 기존 구역 갱신: {z['id']}")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[seoul-zones] zones={len(src)}")

    meta = json.loads(META.read_text(encoding="utf-8"))
    meta.setdefault("banpoMindobokBangbae2732", {}).update(
        {
            "asOf": AS_OF,
            "additions": 3,
            "polygons": 3,
            "note": (
                "서초구 반포1동 민간도심복합(주거중심형) 추진준비 1·2구역 — 추진위 공개 구역 경계 도면"
                "(banpo1.co.kr assets/zone1·zone2.json)을 옮겼고 대표님 갈타맵 캡처와 1.1m 이내 일치. "
                "방배동 2732번지 일대(전원마을) — 서초구 동의서 번호부여 요청 구역 공개(84,040.83㎡)의 "
                "지적도·지도 캡처를 OSM 도로에 맞춰 재현(도로 중심선 기준 ±20m). 세 곳 모두 고시 전 검토 경계."
            ),
        }
    )
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
