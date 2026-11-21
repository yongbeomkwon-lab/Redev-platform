#!/usr/bin/env python3
"""
사당22구역(동작구 사당동 449 일대, SH 참여 모아타운) — 공식 구역 공개 도면에서 구역계 다각형 반영 (2026-11-21)

· 원천: 동작구 도시정비소식 2024-07-19 「[붙임1] 사당동 449번지 일대 모아타운 동의서 징구
  구역 공개(변경).hwp」 (구역계 약 60,905㎡). 붙임 안에 지적도 도면과 지도 도면 두 장이 있고
  두 장 모두 구역계를 붉은 점선으로 그려 두었다. 이 점선의 중심선을 픽셀 단위로 추출했다.
· 축척: 지도 도면의 도로(남부순환로·사당로·골목)를 OSM 도로망과 맞춰 1.583px/m(잔차 평균 5m 이내).
  도면 경계 계측 면적 61,777㎡ → 같은 도면 공고 면적(약 60,905㎡) 대비 +1.4%.
· 위치: 지도 위 건물·도로와 Esri World Imagery 위성영상 대조(경계 오차 ±5m 수준).
· 대상: 기존 레코드(dj-sadang-449, geom "미고시"·점선원) → 다각형 72정점.

실행: python3 scripts/apply-sadang22-20261121.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "sadang22MoaTown20261121"

ZONES = [{'id': 'dj-sadang-449',
  'name': '사당22구역',
  'alias': ['사당동 449',
            '사당동 449 일대',
            '사당동 449번지 일대',
            '사당1동 449',
            '사당1동 449번지 일대',
            '사당22',
            '사당22구역',
            '사당동449',
            'SH 참여 모아타운',
            'SH참여 모아타운',
            '사당동 449 SH참여 모아타운',
            '동작구 사당22구역'],
  'type': '모아타운',
  'kind': '모아타운(SH 참여)',
  'stage': 'SH 참여 모아타운 선정(2026-02-26)·관리계획 수립 중(2026-06-10)',
  'gu': '동작구',
  'area': 63089,
  'featured': False,
  'geom': '공고도면',
  'boundaryApprox': False,
  'sourceId': '동작구 고시공고(2024-07-19) 구역 공개 도면 · 동작구 소규모주택정비사업 추진현황(2026-11-01)',
  'centerLabel': '도면 구역계 중심',
  'center': [37.477065, 126.972609],
  'selectedAt': '2026-02-26',
  'note': '동작구 사당동 449 일대 모아타운(소규모주택정비 관리지역·SH 참여) 구역입니다. 2024-07-19 동작구 「모아타운(소규모주택정비 관리지역) 공모 동의서 징구 구역 공개(변경)」 '
          '공고로 구역계(약 60,905㎡)가 공개됐고, 2024-11-07 서울시 고시(제2024-533호)로 권리산정기준일 2024.09.30이 정해졌습니다. 2026-02-26 「SH 참여 '
          '모아타운 선정위원회」에서 구로 개봉동·송파 잠실동 등 7곳과 함께 SH 참여 모아타운 대상지로 조건부 선정(면적 약 60,826㎡, 노후도 63%)됐고, 동작구는 2026-06-10 기준 '
          '관리계획 수립 중(추진현황 2026-11-01 63,089㎡)으로 공개하고 있습니다. 2026-03-12 서울시 고시 제2026-122호는 관리지역 면적 65,258㎡에 구역 확대 필지 '
          '279.3㎡를 더해 65,537.3㎡로 고시하면서, 확대 필지에는 2025.12.18을, 나머지에는 2024.09.30을 권리산정기준일로 적용했습니다. 2026-08-13 서울시 고시로 '
          '기존 기준일의 실효기간이 2년 연장돼 2028년 11월까지 관리계획이 승인되지 않으면 기준일이 실효됩니다. 2026-05-19~2031-05-18 모아타운 내 도로가 토지거래허가구역으로 '
          '지정·고시됐습니다(서울시 공고 2026-05-14). 지도 경계는 2024-07-19 구역 공개 도면의 구역계이며, 2025-12 확대 필지 279.3㎡는 그 도면에 아직 반영되지 '
          '않았습니다.',
  'areaNote': '동작구 소규모주택정비사업 추진현황 63,089㎡(2026-11-01 기준) · 2024-07-19 구역 공개 공고 약 60,905㎡ · 2026-03-12 서울시 고시 '
              '제2026-122호 관리지역 65,258㎡ + 구역 확대 필지 279.3㎡ = 65,537.3㎡. 도면 경계를 옮긴 다각형의 계측 면적은 61,777㎡로, 같은 도면의 공고 면적(약 '
              '60,905㎡) 대비 +1.4%입니다.',
  'boundaryNote': '동작구 도시정비소식 2024-07-19 게시 「[붙임1] 사당동 449번지 일대 모아타운 동의서 징구 구역 공개(변경).hwp」 안의 지적도·지도 도면 두 장에 붉은 '
                  '점선(구역계)으로 표시된 경계를 픽셀 단위로 추출해 중심선을 이어 붙였습니다. 축척은 도면 지도의 남부순환로·사당로·골목길을 OSM 도로망과 맞춰 1.583px/m로 '
                  '정했고(잔차 평균 5m 이내), 위치는 지도·위성영상 대조로 잡았습니다. 경계 오차는 ±5m 수준이며, 2025-12 구역 확대 필지와 관리계획 승인 고시가 나면 다시 맞춰야 '
                  '합니다. 인접한 사당15구역(신속통합기획)·(가칭)사당동 419 일대 민간도심복합 폴리곤과는 각각 50㎡·7㎡가 겹칩니다 — 두 곳은 대상지·검토 단계 도형이라 도면 경계를 '
                  '그대로 두었습니다.',
  'sources': [{'label': '동작구 도시정비소식 — [변경]모아타운(소규모주택정비 관리지역) 공모 동의서 징구 구역 공개(사당동 449번지 일대), 2024-07-19 (붙임1 구역계 도면)',
               'url': 'https://dongjak.go.kr/portal/bbs/B0001387/view.do?nttId=10680766&menuNo=201575'},
              {'label': '서울시 보도자료 — 서울시, SH 참여 모아타운 선정…공공 관리를 통한 안정적 공급 기대(2026-02-27, 사당동 449 조건부 선정·면적 약 60,826㎡)',
               'url': 'https://www.seoul.go.kr/news/news_report.do?nttNo=453065'},
              {'label': "서울시 고시 제2026-122호 — '25년 SH참여 모아타운 공모 대상지 주택 등 건축물의 분양받을 권리의 산정 기준일 고시(2026-03-12, 관리지역 "
                        '65,258㎡ + 확대 279.3㎡)',
               'url': 'https://jaegebal.com/gnotices/seoul-gs-2026-122'},
              {'label': '데일리하우징 — 동작 사당동 449번지 일대 모아타운, 권리산정기준일 실효 2년 유예(2026-08-13, 전체 65,537.3㎡·2028년 11월까지 연장)',
               'url': 'https://www.dailyhousing.kr/news/articleView.html?idxno=627'},
              {'label': '동작구 — 소규모주택정비사업 추진현황(2026-11-01, 사당22구역 63,089㎡ 관리계획 수립 중)',
               'url': 'https://dongjak.go.kr/portal/main/contents.do?menuNo=201588'}
],
  'asOf': '2026-11-21'}
]

RING = [
    [37.476638, 126.970228], [37.476606, 126.970216], [37.476569, 126.970249], [37.476024, 126.971011],
    [37.475812, 126.971189], [37.475738, 126.971228], [37.475711, 126.971266], [37.475697, 126.971311],
    [37.475749, 126.971575], [37.475801, 126.971738], [37.475828, 126.971869], [37.475863, 126.971875],
    [37.475949, 126.971846], [37.476103, 126.971757], [37.476183, 126.971732], [37.476522, 126.972155],
    [37.476586, 126.972258], [37.476576, 126.972307], [37.476414, 126.972541], [37.476407, 126.972614],
    [37.476457, 126.972761], [37.476458, 126.972806], [37.476517, 126.972958], [37.476541, 126.973096],
    [37.476605, 126.973284], [37.476622, 126.973365], [37.476705, 126.973594], [37.476747, 126.973759],
    [37.476813, 126.973915], [37.476901, 126.974202], [37.476864, 126.974260], [37.476444, 126.974443],
    [37.476429, 126.974465], [37.476492, 126.974835], [37.476549, 126.975351], [37.476575, 126.975452],
    [37.476619, 126.975482], [37.476696, 126.975468], [37.476753, 126.975441], [37.476867, 126.975303],
    [37.476987, 126.975071], [37.477068, 126.974954], [37.477102, 126.974874], [37.477276, 126.974641],
    [37.477969, 126.973929], [37.478012, 126.973845], [37.478044, 126.973687], [37.478016, 126.973552],
    [37.478044, 126.973437], [37.478031, 126.973409], [37.477937, 126.973344], [37.477907, 126.973307],
    [37.477892, 126.973080], [37.478026, 126.972975], [37.478188, 126.972923], [37.478323, 126.972853],
    [37.478338, 126.972815], [37.478266, 126.972536], [37.478200, 126.972365], [37.478181, 126.972362],
    [37.478163, 126.972390], [37.478135, 126.972553], [37.478283, 126.972700], [37.478226, 126.972654],
    [37.478038, 126.972451], [37.478046, 126.972395], [37.478111, 126.972319], [37.478119, 126.972236],
    [37.478094, 126.972096], [37.478062, 126.972021], [37.477997, 126.971921], [37.477131, 126.970770],
]

META = {
    "asOf": "2026-11-21",
    "polygons": 1,
    "note": (
        "사당22구역(사당동 449 일대, SH 참여 모아타운)의 동작구 구역 공개 도면(2024-07-19) 구역계를 반영했다. "
        "지도·지적 도면의 붉은 점선 중심선을 추출해 OSM 도로망과 위성영상으로 정합(계측 61,777㎡, 공고 약 60,905㎡)."
    ),
}


def check() -> int:
    bad = 0
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for props in ZONES:
        zid = props["id"]
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        ok = bool(feat) and (feat.get("geometry") or {}).get("type") == "Polygon" \
            and len(feat["geometry"]["coordinates"][0]) == len(RING) + 1 \
            and feat["properties"].get("geom") == props["geom"] \
            and abs((feat["properties"].get("area") or 0) - props["area"]) < 0.01
        print(f"[{'OK' if ok else 'FAIL'}] geojson {zid} geom={feat['properties'].get('geom') if feat else None} "
              f"rings={(len(feat['geometry']['coordinates'][0]) - 1) if feat and feat.get('geometry') else 0}")
        bad += 0 if ok else 1
        entry = next((z for z in src if z.get("id") == zid), None)
        ok2 = bool(entry) and len(entry.get("polygon") or []) == len(RING) and entry.get("geom") == props["geom"]
        print(f"[{'OK' if ok2 else 'FAIL'}] seoul-zones {zid} polygon={len(entry.get('polygon') or []) if entry else 0}")
        bad += 0 if ok2 else 1
    ok3 = geo["metadata"].get(META_KEY) is not None and geo["metadata"].get("count") == len(geo["features"])
    print(f"[{'OK' if ok3 else 'FAIL'}] metadata.count={geo['metadata'].get('count')} features={len(geo['features'])} batch={META_KEY in geo['metadata']}")
    bad += 0 if ok3 else 1
    return bad


def apply() -> int:
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    for props in ZONES:
        zid = props["id"]
        ring = [[lng, lat] for lat, lng in RING]
        ring.append(ring[0])
        feat = next((f for f in geo["features"] if f["properties"].get("id") == zid), None)
        if feat is None:
            print("[실패] geojson에 구역 없음:", zid)
            return 1
        old = dict(feat["properties"])
        feat["properties"] = {**old, **props, "id": zid}
        feat["geometry"] = {"type": "Polygon", "coordinates": [ring]}
        entry = next((z for z in src if z.get("id") == zid), None)
        if entry is None:
            print("[실패] seoul-zones에 구역 없음:", zid)
            return 1
        entry.update(props)
        entry["sid"] = props["sourceId"]
        entry["polygon"] = RING
        entry.pop("parts", None)
        print(f"[반영] {zid} — {len(RING)}정점, area={props['area']}, geom={props['geom']}")
    import math as _m
    from shapely.geometry import Polygon
    p = Polygon([(lo, la) for la, lo in RING])
    area = abs(p.area) * (111320 * _m.cos(_m.radians(p.centroid.y))) * 110950
    print(f"    계측 면적: {area:,.1f}㎡ (표시 63,089㎡, 공고 약 60,905㎡ 대비 {(area/60905-1)*100:+.1f}%)")
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
