#!/usr/bin/env python3
"""
사당동 300 모아타운 — 공식 구역 공개 도면에서 구역계 다각형 반영 (2026-11-22)

· 원천: 동작구 도시정비소식 2024-06-21 「모아타운(소규모주택정비 관리지역) 공모 동의서 징구
  구역 공개(사당동 300번지 일대)」 붙임1 HWPX (공고 면적 약 39,664㎡). 붙임 안에 지적도·위치도·
  위성도 세 장이 있고, 세 장 모두 같은 자리에 구역계를 붉은 점선으로 그려 두었다.
  점선 픽셀을 분리해 골격화하고 조각을 순서대로 이어 중심선을 복원했다.
· 축척: 위치도(지번 지도)의 도로·골목을 OSM 도로망에 맞춰 3.42px/m(도로까지 거리 중앙값 0px,
  평균 3px). 도면 구역면적으로 역산한 3.41px/m과 0.2% 안에서 일치.
· 위치: 남성중학교·사당휴먼시아 아파트·사당로16길 기준점 + Esri World Imagery·카카오 지적편집도 대조.
  계측 면적 39,541㎡ → 공고 약 39,664㎡ 대비 -0.3%.
· 대상: 기존 레코드(dj-sadang-300-moa, geom "미고시"·점선원) → 다각형 107정점.

실행: python3 scripts/apply-sadang300-20261122.py [--check]   (멱등)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "zones.geojson"
SOURCE = ROOT / "src" / "data" / "seoul-zones.json"
META_KEY = "sadang300MoaTown20261122"

ZONES = [{'id': 'dj-sadang-300-moa',
  'name': '사당동 300 모아타운',
  'alias': ['사당동 300',
            '사당동300',
            '사당동 300번지',
            '사당동 300번지 일대',
            '사당동 300번지 일원',
            '사당1동 300',
            '사당4동 300',
            '사당동300 모아타운',
            '사당동 300 모아타운',
            '사당 300',
            '사당300',
            '동작구 사당동 300 모아타운',
            '사당동300모아타운'],
  'type': '모아타운',
  'kind': '모아타운(소규모주택정비 관리지역)',
  'stage': '대상지 선정(2024-11-15)·관리계획 수립 중(1·2구역 용역 2026-06-29 입찰)',
  'gu': '동작구',
  'area': 39776,
  'featured': False,
  'geom': '공고도면',
  'boundaryApprox': False,
  'sourceId': '동작구 고시공고(2024-06-21) 구역 공개 도면 · 서울시 보도자료(2024-11-15) · 서울시 고시 제2026-494호',
  'centerLabel': '도면 구역계 중심',
  'center': [37.480714, 126.970746],
  'selectedAt': '2024-11-15',
  'note': '동작구 사당동 300번지 일대 모아타운(소규모주택정비 관리지역) 구역입니다. 2024-06-21 동작구 「모아타운(소규모주택정비 관리지역) 공모 동의서 징구 구역 공개(사당동 '
          '300번지 일대)」 공고로 구역계(약 39,664㎡)와 지적도·위치도·위성도 도면이 공개됐고, 2024-11-15 서울시 보도자료(제7차 모아타운 대상지 선정위원회, '
          '11.11·11.14 개최)에 사당동 300이 면적 39,713㎡·권리산정기준일 2024.09.30으로 실려 대상지 선정이 확인됩니다. 2026-09-03 서울시 고시 '
          '제2026-494호(주택 등 건축물의 분양받을 권리의 산정 기준일 고시, 서울시보 제4177호 26쪽)로 권리산정기준일이 고시됐고, 2026-06-29에는 1구역·2구역 '
          '관리계획수립(도시설계) 용역 입찰이 나라장터에 공고됐습니다(마감 2026-07-06). 동작구 소규모주택정비사업 추진현황(2026-11-01)에는 아직 관리지역으로 올라 있지 '
          '않아 관리계획 승인·고시 전 단계입니다. 민간 목록 기준 구역면적 39,776㎡·토지등소유자 595명(추정)·노후도 63.8%(106/166동)·588세대(공동주택 494·단독 '
          '94)입니다. 지도 경계는 2024-06-21 공고 붙임1의 지적도·위치도·위성도 세 장에 같은 좌표로 그려진 붉은 점선 구역계를 그대로 옮긴 것이며, 관리계획 승인 고시 때 '
          '확정 도면이 나오면 다시 맞춰야 합니다.',
  'areaNote': '2024-06-21 동작구 구역 공개 공고 약 39,664㎡ · 2024-11-15 서울시 보도자료 39,713㎡ · 민간 목록 39,776㎡. 도면 경계를 옮긴 다각형의 '
              '계측 면적은 39,541㎡로, 같은 도면 공고 면적(약 39,664㎡) 대비 -0.3%, 선정 당시 39,713㎡ 대비 -0.4%입니다.',
  'boundaryNote': '동작구 도시정비소식 2024-06-21 게시 「[붙임1] 사당동 300번지 일대 모아타운 동의서 징구 구역 공개.hwpx」 안의 지적도·위치도·위성도 세 장은 같은 '
                  '축척·같은 위치의 도면이고, 구역계가 세 장 모두 같은 픽셀 좌표에 붉은 점선으로 그려져 있습니다. 이 점선 픽셀을 색으로 분리해 점선 조각을 순서대로 이어 '
                  '중심선을 복원하고, 스무딩·단순화해 107정점 다각형으로 옮겼습니다. 축척은 위치도(지번 지도)의 도로·골목을 OSM 도로망에 맞춰 '
                  '1px=0.29m(3.42px/m)로 정했고(도로 중심선까지 거리 중앙값 0px·평균 3px), 이 값은 도면의 구역면적으로 역산한 값(3.41px/m)과 0.2% '
                  '안에서 일치합니다. 위치는 남성중학교·사당휴먼시아 아파트·사당로16길 등 지상 기준점과 Esri World Imagery 위성영상, 카카오 지적편집도로 '
                  '확인했습니다(경계 오차 ±3m 수준). 북쪽은 사당로16마길·사당로16바길, 동쪽은 사당로18길 서측, 남서쪽은 사당로16가길과 사당휴먼시아 아파트 북측을 '
                  '따라갑니다. 인접 사당16구역(신속통합기획 추진중) 다각형과는 81㎡가 겹치는데, 그쪽은 대상지 검토 단계의 도형이라 우리 도면 경계를 깎지 않았습니다.',
  'sources': [{'label': '동작구 도시정비소식 — 모아타운(소규모주택정비 관리지역) 공모 동의서 징구 구역 공개(사당동 300번지 일대), 2024-06-21 (붙임1 구역계 '
                        '도면·면적 약 39,664㎡)',
               'url': 'https://dongjak.go.kr/portal/bbs/B0001387/view.do?nttId=10678503&menuNo=201575'},
              {'label': '서울시 보도자료 — 서울시, 구로·강서·강북구 총 5곳 모아타운 대상지 선정(2024-11-15, 제7차 선정위원회·사당동 300 '
                        '39,713㎡·권리산정기준일 2024.09.30)',
               'url': 'https://jaegebal.com/gnotices/seoul-press-2024-114568'},
              {'label': '서울시 고시 제2026-494호 — 주택 등 건축물의 분양받을 권리의 산정 기준일 고시(2026-09-03, 서울시보 제4177호 26쪽)',
               'url': 'https://event.seoul.go.kr/seoulsibo/detailview.do?cn_seq=MjczMzA%3D&tr_code=snews'},
              {'label': '나라장터 — 사당동 300번지 일대 모아타운 1구역·2구역 관리계획수립(도시설계) 용역 입찰공고(2026-06-29, 마감 2026-07-06, '
                        'R26BK01606436·R26BK01606489)',
               'url': 'https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01606489&bidPbancOrd=000'},
              {'label': '동작구 — 소규모주택정비사업 추진현황(2026-11-01)',
               'url': 'https://dongjak.go.kr/portal/main/contents.do?menuNo=201588'},
              {'label': '재개발닷컴 — 사당동 300 모아타운 구역 정보(면적 39,776㎡·토지등소유자 595명·노후도 63.8%)',
               'url': 'https://jaegebal.com/develops/4983'}],
  'asOf': '2026-11-22'}]

RING = [
    [37.480016, 126.971394], [37.479897, 126.971329], [37.479820, 126.971291],
    [37.479797, 126.971268], [37.479793, 126.971260], [37.479793, 126.971245],
    [37.479828, 126.971169], [37.479816, 126.971153], [37.479816, 126.971130],
    [37.479874, 126.970734], [37.479912, 126.970505], [37.479908, 126.970459],
    [37.479893, 126.970413], [37.479855, 126.970344], [37.479816, 126.970253],
    [37.479797, 126.970200], [37.479763, 126.970146], [37.479702, 126.970032],
    [37.479568, 126.969849], [37.479492, 126.969719], [37.479404, 126.969605],
    [37.479359, 126.969521], [37.479359, 126.969505], [37.479370, 126.969482],
    [37.479481, 126.969360], [37.479687, 126.969147], [37.479744, 126.969078],
    [37.479774, 126.969048], [37.479797, 126.969048], [37.479858, 126.969109],
    [37.479881, 126.969162], [37.479908, 126.969208], [37.479931, 126.969276],
    [37.480133, 126.969582], [37.480297, 126.969765], [37.480366, 126.969818],
    [37.480393, 126.969849], [37.480381, 126.969841], [37.480415, 126.969871],
    [37.480431, 126.969879], [37.480465, 126.969833], [37.480480, 126.969788],
    [37.480484, 126.969742], [37.480503, 126.969673], [37.480541, 126.969658],
    [37.480560, 126.969666], [37.480755, 126.969795], [37.480896, 126.969894],
    [37.480885, 126.969894], [37.480969, 126.969940], [37.481113, 126.970047],
    [37.481133, 126.970070], [37.481163, 126.970085], [37.481388, 126.970238],
    [37.481373, 126.970238], [37.481438, 126.970276], [37.481819, 126.970535],
    [37.481808, 126.970528], [37.481815, 126.970535], [37.481884, 126.970558],
    [37.481880, 126.970558], [37.481895, 126.970581], [37.481895, 126.970604],
    [37.481892, 126.970619], [37.481880, 126.970627], [37.481869, 126.970726],
    [37.481857, 126.970764], [37.481846, 126.970871], [37.481834, 126.970909],
    [37.481819, 126.971100], [37.481781, 126.971306], [37.481781, 126.971359],
    [37.481743, 126.971512], [37.481728, 126.971664], [37.481697, 126.971817],
    [37.481678, 126.971977], [37.481667, 126.972015], [37.481640, 126.972168],
    [37.481609, 126.972221], [37.481583, 126.972252], [37.481564, 126.972260],
    [37.481468, 126.972221], [37.481396, 126.972176], [37.481365, 126.972153],
    [37.481335, 126.972145], [37.481232, 126.972092], [37.481194, 126.972061],
    [37.481125, 126.972038], [37.481010, 126.971962], [37.480953, 126.971939],
    [37.480915, 126.971916], [37.480927, 126.971916], [37.480762, 126.971825],
    [37.480724, 126.971817], [37.480675, 126.971771], [37.480556, 126.971710],
    [37.480473, 126.971657], [37.480476, 126.971657], [37.480377, 126.971603],
    [37.480331, 126.971565], [37.480308, 126.971558], [37.480274, 126.971535],
    [37.480259, 126.971535], [37.480221, 126.971512], [37.480202, 126.971497],
    [37.480103, 126.971435], [37.480049, 126.971420]
]

META = {
    "asOf": "2026-11-22",
    "polygons": 1,
    "note": (
        "사당동 300 모아타운(동작구 사당동 300번지 일대)의 2024-06-21 동작구 구역 공개 도면(붙임1) 구역계를 반영했다. "
        "지적도·위치도·위성도 세 장의 붉은 점선 중심선을 추출해 OSM 도로망·위성영상으로 정합(계측 39,541㎡, 공고 약 39,664㎡)."
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
        from shapely.ops import transform as _shp_transform
        from pyproj import Transformer
        p = Polygon([(lo, la) for la, lo in RING])
        try:
            _tr = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
            area = abs(_shp_transform(_tr.transform, p).area)
        except Exception:
            area = abs(p.area) * (111320 * _m.cos(_m.radians(p.centroid.y))) * 110950
        print(f"  계측 면적: {area:,.1f}㎡ (같은 도면 공고 약 39,664㎡ 대비 {(area/39664-1)*100:+.1f}%)")
    geo["metadata"][META_KEY] = META
    geo["metadata"]["count"] = len(geo["features"])
    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    SOURCE.write_text(json.dumps(src, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[저장] features={len(geo['features'])}, 구역={len(src)}")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else apply())
