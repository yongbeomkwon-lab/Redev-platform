#!/usr/bin/env python3
"""용산·후암·이태원 일대 15곳 구역계를 재개발닷컴 공개 지도와 1:1로 맞춘다 (2026-11-26).

경위
  · 사용자가 재개발닷컴 용산·이태원 일대 캡처(첨부 1000085742)와 리디브를 비교해
    "경계도 서로 다르고 아직 우리가 없는 게 많아"라고 지적했다.
  · 재개발닷컴 공개 지도(비로그인)가 그리는 구역계를 화면 좌표 → 위경도로 옮겨
    (네이버 지도 17레벨 타일 x/y/z + SVG path 좌표) 구역별로 대조·교체했다.
    같은 방식으로 계산한 면적이 공개 구역면적과 1% 안에서 일치함을 확인했다.

바뀌는 것
  · 경계 신규: 남산대림(39,732㎡) · (가)남산2(22,616) · (가)동후암2(52,773) · (가)이태원3(50,817)
  · 경계 교체: 후암동 109-21 · 후암1 · 동후암1 · 동후암3 · 용산1 · 남산1 · 남산3 · 용산3
                · 이태원1 · 이태원2 · 용산4
  · 경계 해제: 후암동 195-1 (재개발닷컴에는 별도 구역계가 없고 109-21과 거의 겹침)
  · 이름·단계: 재개발닷컴 표기(신통 이태원1·대상지선정 등)와 같게
"""
import json, math
from pathlib import Path
from shapely.geometry import Polygon

ROOT = Path('/workspace/Redev-platform')
Z = ROOT / 'src/data/seoul-zones.json'
zones = json.loads(Z.read_text())
raw = json.loads(Path('/workspace/tmp/ys11/jaeg_polys.json').read_text())


def ring(zone_id):
    pts = []
    for q in raw[zone_id].split(';'):
        lat, lng = map(float, q.split(','))
        p = (round(lat, 6), round(lng, 6))
        if not pts or pts[-1] != p:
            pts.append(p)
    if len(pts) > 2 and pts[0] == pts[-1]:
        pts.pop()
    # 도면 작도 잔재(같은 점이 한 점 건너 되돌아오는 가시) 제거 — 링 자기교차의 원인
    cleaned = []
    for q in pts:
        if len(cleaned) >= 2 and cleaned[-1] == cleaned[-2]:
            cleaned.pop()
        if len(cleaned) >= 2 and q == cleaned[-2]:
            cleaned.pop()
            continue
        cleaned.append(q)
    pts = cleaned
    pg = Polygon(pts)
    if not pg.is_valid:
        pg = pg.buffer(0)
        if pg.geom_type == 'MultiPolygon':
            pg = max(pg.geoms, key=lambda g: g.area)
        pts = [(round(y, 6), round(x, 6)) for x, y in pg.exterior.coords][:-1]
    ring_ll = [[lat, lng] for lat, lng in pts]
    return ring_ll, Polygon(pts)


def area_m2(pg):
    coords = list(pg.exterior.coords)
    lat0 = sum(lat for lat, lng in coords[:-1]) / max(1, len(coords) - 1)
    kx = 111320 * math.cos(math.radians(lat0)); ky = 110540.0
    pts = [(lng * kx, lat * ky) for lat, lng in coords]
    return abs(sum(pts[i][0] * pts[(i+1) % len(pts)][1] - pts[(i+1) % len(pts)][0] * pts[i][1]
                   for i in range(len(pts)))) / 2


NOTE_JAEG = ('구역계는 재개발닷컴 공개 지도(2026-11-26 확인)가 그리는 경계와 1:1로 맞췄습니다. '
             '공고 도면 계열의 신청 구역계이며, 정비구역 지정 전이라 확정 경계가 아닙니다.')

PATCH = {}
for zid in raw:
    poly, pg = ring(zid)
    PATCH[zid] = dict(polygon=poly, areaShape=round(area_m2(pg)),
                      center=[round(pg.centroid.y, 6), round(pg.centroid.x, 6)])

# 이름·별칭·단계 (재개발닷컴 표기 기준)
META = {
    'sy-huam-109-21': dict(
        name='(가)후암동 109-21',
        alias_add=['(가칭)후암동 109-21구역', '후암동 109-21구역', '후암 109-21', '후암동109-21'],
        boundaryNote=('용산구 「후암동 109-21번지 일대 동의서 번호부여 요청 구역 공개」(2024-07-12) 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
    ),
    'sy-donghuam2': dict(
        name='(가)동후암2',
        alias_add=['(가칭)동후암2구역', '동후암2구역'],
        geom='공고도면',
        boundaryNote=('용산구 2026-02-10 동의서 번호부여 요청 구역 공개 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
    ),
    '11000UQ120PS202411014119': dict(
        name='후암1',
        stage='추진위승인(2007-04-23)',
        alias_add=['후암동제1구역', '후암1구역', '후암동 142-4'],
        boundaryNote=('재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다. '
                      '후암동 특별계획구역(지구단위계획) 도면 계열이며, 2007-04-23 추진위 승인 이후 정비구역 지정 전입니다.'),
    ),
    '11000UQ120PS202411014525': dict(
        name='동후암1',
        stage='추진위승인(2026-06-05)',
        alias_add=['동후암1구역', '후암동 30-2', '후암동 30-2번지 일대'],
        boundaryNote=('재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다. '
                      '용산구 고시 제2026-76호(2026-06-05) 조합설립추진위원회 승인 고시 도면 계열입니다.'),
    ),
    '11000UQ120PS202502050021': dict(
        boundaryNote=('용산구 고시 제2026-91호(2026-07-03) 추진위 승인 고시 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다(승인 구역경계 87,020.4㎡).'),
    ),
    '11000UQ120PS202601310031': dict(
        name='용산1',
        alias_add=['용산동2가 1-1351', '용산동2가 1-1351번지 일대', '용산1구역', '(가)용산1'],
        boundaryNote=NOTE_JAEG,
    ),
    'yongsan2ga-1-597': dict(
        name='남산1',
        stage='대상지선정',
        alias_add=['용산동2가 1-597 일대', '남산1구역', '(가)남산1'],
        boundaryNote=NOTE_JAEG,
    ),
    'sy-namsan2': dict(
        name='(가)남산2',
        alias_add=['(가칭)남산2구역', '남산2구역'],
        geom='공고도면',
        boundaryNote=('용산구 2025-02-17 동의서 번호부여 요청 구역 공개 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
    ),
    'sy-namsan3': dict(
        name='(가)남산3',
        alias_add=['(가칭)남산3구역', '남산3구역'],
        boundaryNote=('용산구 2025-07-10 동의서 번호부여 요청 구역 공개 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
    ),
    'yongsan-3': dict(
        name='용산3',
        stage='대상지선정',
        alias_add=['용산동2가 44-3', '용산동2가 44-3번지 일대', '용산3구역', '(가)용산3'],
        boundaryNote=NOTE_JAEG,
    ),
    'sy-itaewon-372-4': dict(
        name='(가)이태원3',
        alias_add=['(가)이태원3구역', '이태원3구역'],
        geom='공고도면',
        boundaryNote=('용산구 「이태원동 372-4번지 일대 동의서 번호부여 요청 구역 공개」(2026-11-16) 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
        nameNote=None,
    ),
    'sy-itaewon-252-1': dict(
        name='(가)이태원2',
        alias_add=['(가)이태원2구역', '이태원2구역'],
        boundaryNote=('용산구 「이태원동 252-1번지 일대 동의서 번호부여 요청 구역 공개」(2026-04-22) 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
    ),
    'itaewon-214-37': dict(
        name='이태원1',
        stage='대상지선정',
        alias_add=['이태원동 214-37', '이태원동 214-37번지 일대', '이태원1구역', '(가)이태원1'],
        boundaryNote=NOTE_JAEG,
    ),
    'namsan-daerim': dict(
        name='남산대림',
        geom='참고도',
        alias_add=['남산대림아파트', '남산대림아파트 재건축'],
        boundaryNote=('정비구역 지정(안) 공람 도면이 공개되지 않아(용산구 공고 제2026-1271호 첨부가 빈 파일), '
                      '재개발닷컴이 공개한 정비구역지정(공람) 구역계(2026-11-26 확인)를 옮겼습니다. 확정 고시 전 참고 경계입니다.'),
        nameNote=None,
    ),
    'sy-yongsan4': dict(
        name='(가)용산4',
        alias_add=['(가칭)용산4구역', '용산4구역'],
        boundaryNote=('용산구 2024-07-04 동의서 번호부여 요청 구역 공개 도면 계열입니다. '
                      '재개발닷컴 공개 지도(2026-11-26) 구역계와 1:1로 맞췄습니다.'),
    ),
}

changed = []
for z in zones:
    zid = z.get('id')
    if zid in META:
        m = dict(META[zid])
        add = m.pop('alias_add', [])
        z.update({k: v for k, v in m.items() if v is not None})
        if add:
            z['alias'] = list(dict.fromkeys((z.get('alias') or []) + add))
        z['asOf'] = '2026-11-26'
        changed.append(zid)

for zid in raw:
    for z in zones:
        if z.get('id') == zid:
            z.update(PATCH[zid])
            if zid not in changed:
                changed.append(zid)

# 후암동 195-1 — 재개발닷컴에 별도 구역계가 없고 109-21과 거의 겹쳐, 경계를 걷고 점으로 둔다
for z in zones:
    if z.get('id') == 'sy-huam-195-1':
        z.pop('polygon', None)
        z.pop('areaShape', None)
        z['geom'] = '미고시'
        z['centerLabel'] = '후암동 195-1 (구역 대표지번)'
        z['boundaryNote'] = ('2026-02-19 용산구가 공개한 신청 구역계는 후암동 109-21구역 남쪽 절반과 거의 겹칩니다'
                             '(109-21 도면과 195-1 도면이 서로 다른 추진주체의 신청안). 재개발닷컴은 이 자리에 '
                             '109-21 구역계만 그리므로, 지도에서 두 경계가 겹쳐 보이지 않게 195-1은 점으로 표시합니다.')
        z['asOf'] = '2026-11-26'
        changed.append('sy-huam-195-1')

# 이태원3의 옛 nameNote(경계 미반영) 제거
for z in zones:
    if z.get('id') == 'sy-itaewon-372-4':
        z.pop('nameNote', None)

Z.write_text(json.dumps(zones, ensure_ascii=False, separators=(',', ':')))
print('patched', len(changed), changed)
for z in zones:
    if z.get('id') in raw or z.get('id') == 'sy-huam-195-1':
        print(f"  {z['id'][:28]:28s} {z['name'][:18]:18s} {z.get('stage')[:24]:24s} poly={len(z.get('polygon') or [])} areaShape={z.get('areaShape')}")
