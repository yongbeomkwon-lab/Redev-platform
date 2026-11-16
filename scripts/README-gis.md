# GIS 가이드 — 서울시 실제 정비구역 경계 (서울플랜+ OA-22712)

> 이 문서는 **지금 코드에 실제로 연결된** 파이프라인을 기록한다.
> 더미 폴리곤(육각형 6개)은 제거되었고, 지도·상세의 모든 구역 경계는 서울시 공식 데이터 실경계다.

## 1. 원천 데이터

| 항목 | 값 |
|---|---|
| 데이터 | 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 |
| 페이지 | https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do |
| 파일 | `532_UQ120_도시계획사업(서울플랜+)_202609.zip` (SHP, 2.5MB, 2026-09-10 기준) |
| 라이선스 | 공공누리/CC-Zero — 상업적 이용 가능 |
| 내용 | 정비사업(신통기획·재개발·재건축·주거환경개선) · 소규모정비(모아타운·가로주택 등) · 역세권 · 재정비촉진 · 국토부(도공복) 등 **2,776개 폴리곤** |
| 좌표계 | **EPSG:5174** (Korean 1985 / Modified Korea Central Belt, Bessel 1841) |

### 다운로드 (로그인·API 키 불필요)

```bash
curl -sL -A "Mozilla/5.0" \
  -e "https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do" \
  -X POST "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false" \
  --data-urlencode "infId=OA-22712" --data-urlencode "seqNo=5" \
  --data-urlencode "seq=5" --data-urlencode "infSeq=1" \
  -o seoul_uq120.zip
# seq=5 → 최신(202609), seq=4 → 202602
python3 -c "import zipfile;zipfile.ZipFile('seoul_uq120.zip').extractall('seoul_uq120')"
```

## 2. 변환 (SHP → 앱 데이터)

```bash
pip install pyshp pyproj
python3 scripts/import-seoul-zones.py "seoul_uq120/532_.../shp파일/UPIS_C_UQ120"
```

스크립트가 하는 일:

1. **좌표 변환**: EPSG:5174(Bessel) → WGS84, 7-parameter Bursa-Wolf
   (`+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`, Korean 1985→WGS84).
   ※ 이 계수를 빼면 서울 기준 약 **280m 북·210m 서**로 어긋난다. 은마아파트·여의도 시범·목동4단지
   경계를 OSM 건물도형과 대조해 검증했다.
2. **중복 제거**: 같은 구역이 단계별(신통기획/구역지정/사업시행인가…) 레코드로 여러 번 실려 있어
   중심 45m·면적 40% 이내면 하나만 남긴다.
3. **면적**: 고시면적(`DGM_AR`)과 도형면적(`SHAPE_AREA`)이 1% 내 일치. 표시는 고시면적.
4. **간략화**: Douglas–Peucker (배경 20m, 대표구역 4m 급) + 소수 5자리(≈1.1m) 반올림.
   → 152개 구역 합계 **약 155KB**.
5. **다중 링**: 여러 필지로 나뉜 구역은 `parts`로 함께 저장(면적 5% 이상 링만).

### 출력 파일

| 파일 | 내용 | 소비처 |
|---|---|---|
| `src/data/zones-geo.json` | 대표(피처드) 구역 6곳 고정밀 경계 + 고시 메타(명칭·유형·단계·면적·sourceId) | `src/data/sample.ts` → 상세 패널·지도 |
| `src/data/seoul-zones.json` | 배경 레이어 152곳 (대표 6 + 자치구별 선정 146) | `npm run geojson` |
| `public/data/zones.geojson` | 위 152곳 GeoJSON(FeatureCollection, [lng,lat]) | `ZoneMap.tsx`가 fetch |

### 대표 구역 ↔ 서울시 레코드 매칭 (`FEATURED` in import-seoul-zones.py)

| 앱 id | 앱 표시명 | 서울시 레코드 | 고시 유형·단계·면적 |
|---|---|---|---|
| sillim-1 | 신림1구역 | `11000UQ120PS202407010537` | 재정비촉진구역 · 사업시행인가 · 223,201㎡ |
| banpo-1 | 반포주공1단지 3주구 | `11000UQ120PS202411014218` | 재건축(공동) · 착공 · 117,114㎡ |
| noryangjin | 노량진 제2구역 | `11000UQ120PS202407010607` | 재정비촉진구역 · 착공 · 16,213㎡ |
| hannam | 한남뉴타운 | `11000UQ120PS202407010530` | 재정비촉진지구(=한남뉴타운) · 지구변경 · 948,390㎡ |
| seongsu | 성수 제2구역 | `11000UQ120PS202407010881` | 신속통합기획 · 기획완료 · 131,980㎡ |
| bukahyeon | 북아현 주공1차 | `11000UQ120PS202407010570` | 재정비촉진구역 · 준공 · 77,174㎡ |

※ 「반포1동 민간도심복합」은 서울플랜+ 데이터에 폴리곤이 없어(민간도심복합은 이 데이터셋 대상 아님)
반포 권역의 실제 정비구역인 **반포주공1단지(3주구)** 경계로 대체하고 표시명·유형·단계를 맞췄다.

## 3. 지도 렌더 구조

```
ZoneMap.tsx
 ├ 배경: fetch("/data/zones.geojson") → 152개 구역 <Polygon> (얇은 선, 0.10 채움)
 └ 대표: props.zones (sample.ts) → 굵은 선·0.28 채움, 선택 시 flyToBounds + 0.40
```

- 색: `src/components/map/colors.ts` (신통기획 #7c3aed / 모아타운 #0ea5e9 / 도공복 #f59e0b / 일반재개발 #10b981)
- 타일: OpenStreetMap (키 불필요). VWorld/카카오로 바꾸려면 `TILE_ADAPTERS` 또는 `MapPanel.tsx` 교체.
- 데이터 갱신 시 `npm run geojson` 후 커밋하면 Vercel이 자동 배포한다.

## 4. 남은 실데이터 작업

- 세대수·비례율·시공사: 정비사업 정보몽땅(eum.go.kr) / 조합 고시문
- 실거래: 국토부 실거래가 API (`src/lib/data-provider.ts`의 `molitProvider` 골격)
- 대표 구역 타임라인: 서울시 고시 원문 링크로 교체 (현재 샘플)
