# GIS 가이드 — 서울시 정비구역 경계 (2-소스 병합: UQ120 + UQ181)

> 이 문서는 **지금 코드에 실제로 연결된** 파이프라인을 기록한다.
> 더미 폴리곤(육각형 6개)은 제거되었고, 지도·상세의 모든 구역 경계는 서울시 공식 데이터 실경계다.
> 경계 도형은 **같은 구역이 두 소스에 있으면 굴곡(필지선)이 더 많은 도형을 채택**한다.

## 1. 원천 데이터

| 항목 | ① 서울플랜+ (UQ120) | ② 의제처리구역 (UQ181) |
|---|---|---|
| 데이터 | 서울 열린데이터광장 「서울시 도시계획사업 현황(서울플랜+)」 | 서울 열린데이터광장 「서울시 의제처리구역 위치정보」 |
| 페이지 | https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do | https://data.seoul.go.kr/dataList/OA-20957/F/1/datasetView.do |
| 파일 | `532_UQ120_도시계획사업(서울플랜+)_202609.zip` (2026-09-10) | `570_UQ181_의제처리구역_202609.zip` (2026-09-11) |
| 레코드 | 2,776개 폴리곤 (사업 단계별 중복 포함) | 3,329개 (정비구역·재정비촉진구역·아파트지구 등 의제처리구역) |
| 쓰임 | 사업유형·추진단계·고시면적 **메타**, 기본 도형 | **필지 경계형 정밀 도형** |
| 라이선스 | CC-Zero (상업 이용·변경 가능) | 공공누리 4유형 (출처표시·**상업적 이용금지·변경금지**) |
| 좌표계 | EPSG:5174 (Korean 1985 / Modified Korea Central Belt, Bessel 1841) | 동일 |

### 다운로드 (로그인·API 키 불필요)

```bash
# ① 서울플랜+ (seq 5 = 202609 최신, seq 4 = 202602)
curl -sL -A "Mozilla/5.0" \
  -e "https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do" \
  -X POST "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false" \
  --data-urlencode "infId=OA-22712" --data-urlencode "seqNo=5" \
  --data-urlencode "seq=5" --data-urlencode "infSeq=1" -o seoul_uq120.zip

# ② 의제처리구역 (seq 10 = 202609 최신)
curl -sL -A "Mozilla/5.0" \
  -e "https://data.seoul.go.kr/dataList/OA-20957/F/1/datasetView.do" \
  -X POST "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false" \
  --data-urlencode "infId=OA-20957" --data-urlencode "seqNo=10" \
  --data-urlencode "seq=10" --data-urlencode "infSeq=1" -o seoul_uq181.zip

python3 -c "import zipfile;zipfile.ZipFile('seoul_uq120.zip').extractall('seoul_uq120')"
python3 -c "import zipfile;zipfile.ZipFile('seoul_uq181.zip').extractall('seoul_uq181')"
```

## 2. 변환 (SHP → 앱 데이터)

```bash
pip install pyshp pyproj
python3 scripts/import-seoul-zones.py \
  "seoul_uq120/532_.../shp파일/UPIS_C_UQ120" \
  "seoul_uq181/570_.../shp파일/UPIS_C_UQ181"      # 2번째 인자는 선택(없으면 UQ120 단독)
npm run geojson                                     # public/data/zones.geojson 재생성
```

스크립트가 하는 일:

1. **좌표 변환**: EPSG:5174(Bessel) → WGS84, 7-parameter Bursa-Wolf
   (`+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`, Korean 1985→WGS84).
   ※ 이 계수를 빼면 서울 기준 약 **280m 북·210m 서**로 어긋난다. 은마아파트·여의도 시범·목동4단지
   경계를 OSM 건물도형과 대조해 검증했다.
2. **수록 범위**: 정비사업 본연만 지도에 올린다.
   신속통합기획(BZ101)·재개발 도시/주택정비형(BZ102/103)·재건축 단독/공동(BZ104/105)·
   주거환경개선(BZ107/108)·모아타운(BZ201)·가로주택(BZ202)·자율주택(BZ203)·
   소규모재건축/재개발(BZ204/205)·재정비촉진구역(BZ402)·도심공공주택복합(BZ502).
   제외: 재정비촉진지구(BZ401, 여러 구역을 감싸는 상위 지구)·존치구역(BZ403/404)·
   역세권사업(장기전세·청년안심·역세권활성화·미리내집)·도시개발(BZ601)·리모델링(BZ602)·
   시장정비(BZ603)·**도시재생활성화지역(BZ604 — `성수동` 886,560㎡처럼 동 경계 수준의 넓은 면적이라
   정비구역으로 오해된다)**·사전협상제(BZ606).
3. **소스 병합**: 같은 구역(UQ120·UQ181)을 중심거리·면적비·이름 유사도로 매칭한 뒤,
   **같은 1.3m 허용오차에서 남는 정점 수(= 실제 굴곡량)** 를 비교해 더 상세한 도형을 쓴다.
   단순 정점 개수 비교는 쓰지 않는다 — UQ120의 노량진1구역은 1m 간격으로 조밀화된 603점이지만
   형상은 43점이면 충분하고, UQ181의 성수전략2구역은 125점 중 49점이 실제 필지 굴곡이다.
   `zones-geo.json`의 `geomSource`/`geomSourceName`/`geomAsOf`, GeoJSON의 `properties.geom`이 채택 출처다.
   (전수 1,834곳 중 57곳이 UQ181 정밀 도형으로 교체됨 — 성수전략 1·2·3·4, 장위8구역 등)
4. **중복 구역 병합**: 같은 구역이 ① 신통기획 후보지와 실제 사업구역, ② 재정비촉진구역과 재개발,
   ③ `성수전략2`와 `성수전략정비지구2`, ④ `목동4단지` 재건축과 신통기획처럼 여러 레코드로 실려 있다.
   구역명을 정규화(공백·`주택정비형`·`정비구역`·`정비지구`·`재개발`·`일대` 등 제거)해 **이름이 같고
   중심이 250m 이내이면 한 구역**으로 합치고, **추진단계가 가장 앞선 레코드**의 유형·단계·면적을 쓴다
   (동률이면 정비구역 본연인 소분류 우선 — 재정비촉진구역 > 재개발/재건축 > 모아타운 > 신통기획).
   표시 이름은 합쳐진 이름 중 가장 서술적인(긴) 것을 쓴다. 고시면적이 비어 있는 레코드만 같은 구역의
   다른 레코드 값으로 채운다.
   2,068개 레코드 → **1,834개 구역**.
5. **면적**: 고시면적(`DGM_AR`)과 도형면적(`SHAPE_AREA`)이 1% 내 일치. 표시는 고시면적.
6. **간략화**: Douglas–Peucker — 대표 구역 0.000004°(≈0.45m)·최대 900점·소수 6자리,
   전수 0.000025°(≈2.8m)·링당 최대 260점·소수 5자리.
   수백 ㎡ 소구역은 2.8m 간략화로 형태가 사라지므로 원본 링을 유지한다.
7. **다중 링**: 여러 필지로 나뉜 구역은 `parts`로 함께 저장(주 링은 항상 유지 + 전체의 3%·300㎡ 이상 링).

### 출력 파일

| 파일 | 내용 | 소비처 |
|---|---|---|
| `src/data/zones-geo.json` | 대표(피처드) 구역 6곳 고정밀 경계 + 고시 메타(명칭·유형·단계·면적·sourceId·geomSource) | `src/data/sample.ts` → 상세 패널·지도 |
| `src/data/seoul-zones.json` | 서울시 정비구역 **전수 1,834곳** (경계 + 고시 메타, `[lat,lng]`) | `npm run geojson` 재내보내기 |
| `src/data/zones-meta.json` | 원천·기준일 메타(OA-22712/2026-09-10, OA-20957/2026-09-11, 구역 수) | `npm run geojson` · 화면 기준일 |
| `public/data/zones.geojson` | 위 전수 GeoJSON(FeatureCollection, `[lng,lat]`, 닫힌 링) ≈1.4MB(gzip 300KB대) | `ZoneMap.tsx`·`ZoneExplorer.tsx`가 fetch |

> ⚠️ GeoJSON `Polygon`의 `coordinates`는 **링의 배열**(`[[[lng,lat],…]]`)이다. 링 하나를 그대로 쓰면
> `ZoneMap.tsx`의 파싱이 실패해 배경 레이어 전체가 조용히 사라진다(2026-11 수정).

### 대표 구역 ↔ 서울시 레코드 매칭 (`FEATURED` in import-seoul-zones.py)

| 앱 id | 앱 표시명 | UQ120 레코드 (메타) | 고시 유형·단계·면적 | 경계 도형 출처 |
|---|---|---|---|---|
| sillim-1 | 신림1구역 | `11000UQ120PS202407010537` | 재정비촉진구역 · 사업시행인가 · 223,201㎡ | UQ120 (244점) |
| banpo-1 | 반포주공1단지 3주구 | `11000UQ120PS202411014218` | 재건축(공동) · 착공 · 117,114㎡ | UQ120 (38점) |
| noryangjin | 노량진 제1구역 | `11000UQ120PS202407010595` | 재정비촉진구역 · 관리처분계획인가 · 132,187㎡ | UQ120 (43점) |
| hannam | 한남뉴타운 | `11000UQ120PS202407010530` | 재정비촉진지구(=한남뉴타운) · 지구변경 · 948,390㎡ | UQ120 (279점) |
| seongsu | 성수전략2구역 | `11000UQ120PS202407010881` | 신속통합기획 · 기획완료 · 131,980㎡ | **UQ181** `11000UQ181PS202506110001` (125점, 도형면적 131,994㎡) |
| bukahyeon | 북아현 주공1차 | `11000UQ120PS202407010570` | 재정비촉진구역 · 준공 · 77,174㎡ | UQ120 (112점) |

※ 「반포1동 민간도심복합」은 서울플랜+ 데이터에 폴리곤이 없어(민간도심복합은 이 데이터셋 대상 아님)
반포 권역의 실제 정비구역인 **반포주공1단지(3주구)** 경계로 대체하고 표시명·유형·단계를 맞췄다.
※ **노량진**은 구 표기 「노량진 제2구역」의 서울시 레코드가 16,213㎡ 소구역이라 샘플의 2,140세대와
맞지 않았다. 대단지(132,187㎡·관리처분계획인가)인 **노량진1구역**으로 정합했다.

### 성수전략2구역 — 왜 UQ181을 쓰나

- UQ120(서울플랜+) 레코드 `11000UQ120PS202407010881`은 **정점 10개**짜리 개략 도형이라
  좌측·하단 경계가 직선으로 잘려 있었다(재개발닷컴이 보여주는 필지 경계와 불일치).
- UQ181 「성수전략정비구역 제2주택정비형 재개발정비구역」은 **정점 125개**, 도형면적 131,994㎡로
  고시면적 131,980㎡와 0.01% 이내. 좌측 경계가 필지 하나하나를 따라간다(최대 편차 49.6m).
- 간략화 후 49점(허용오차 0.45m)에서 원 도형과 최대 편차 0.1m — 굴곡이 그대로 남는다.

## 3. 지도 렌더 구조

```
ZoneMap.tsx
 ├ MapContainer(preferCanvas, renderer=L.canvas({padding:0.5}))   ← 캔버스 하나를 지도 전체가 공유
 │   ├ SeoulZoneLayer : fetch("/data/zones.geojson") → L.geoJSON 1겹 (1,828개 구역, Canvas)
 │   │                   클릭 → onSelectZone(id) / 툴팁 = 구역명·유형·단계·면적(자치구)
 │   └ 대표 구역 6곳  : props.zones(sample.ts) → 굵은 선(2.8)·0.35 채움(CSS 아님, 같은 캔버스)
 └ 선택 구역 → fitBounds(animate:false) 로 이동
```

- **Canvas를 하나만 쓴다.** 레이어마다 렌더러를 따로 만들면(`L.geoJSON(..., {renderer})`) `<canvas>`가
  두 장 겹치고, 나중에 추가된 캔버스가 `pointer-events:auto`로 위에 앉아 **아래 캔버스 구역의 클릭·호버를
  전부 가로챈다**(2026-11 실제 발생: 전수 구역은 그려지지만 클릭해도 상세가 안 열림).
  지도 옵션 `renderer`로 하나만 주면 히트테스트도 한 곳에서 처리된다.
- 색: `src/components/map/colors.ts` — 일반재개발 #10b981 / 신통기획 #7c3aed / 모아타운 #0ea5e9 /
  도공복 #f59e0b / 가로주택 #0d9488 / 소규모 #64748b. 채움 0.28·선 1.3·불투명도 0.85(대표 0.35·2.8).
- 타일: OpenStreetMap (키 불필요). VWorld/카카오로 바꾸려면 `TILE_ADAPTERS` 또는 `MapPanel.tsx` 교체.
- 데이터 갱신 시 `npm run geojson` 후 커밋하면 Vercel이 자동 배포한다.
- 클릭한 구역이 대표 6곳이면 기존 상세(실거래·매물), 그 외 1,828곳이면 `ZoneOfficialPanel`이
  서울시 고시 데이터(구역명·자치구·사업유형·추진단계·고시면적 ㎡/평·경계 도형·기준일·고시 레코드)를 보여준다.

## 4. 브이월드(UD602) 연동 상태 — 2026-11

- 파일 다운로드: `https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=MK&dsId=30335`
  → 「LSMD_CONT_UD602_서울.zip」 클릭 시 **「로그인 후 이용해주세요」** (vworld.kr 계정 필요).
- 오픈API(`api.vworld.kr/req/data`, `/req/wfs`, `/req/wms`)는 인증키가 **데이터 API·WMS/WFS 서비스에
  활성화되어 있지 않으면** `INCORRECT_KEY`를 돌려준다(같은 키로 `/req/search`는 정상).
- 라이선스: 공공누리 4유형(상업적 이용금지·변경금지) — data.go.kr 15146864 명시.
- 결론: 국토부 UD602는 **vworld.kr 로그인 + 데이터 API 활성화**가 있어야 받을 수 있고,
  현재 확보한 서울시 UQ181이 같은 성격(정비구역 실경계)의 도형을 로그인 없이 제공하므로
  UQ181을 1차 소스로 쓴다. UD602가 확보되면 `load()`로 세 번째 소스로 추가하면 된다.

## 5. 남은 실데이터 작업

- 세대수·비례율·시공사: 정비사업 정보몽땅(eum.go.kr) / 조합 고시문
- 실거래: 국토부 실거래가 API (`src/lib/data-provider.ts`의 `molitProvider` 골격)
- 대표 구역 타임라인: 서울시 고시 원문 링크로 교체 (현재 샘플)
- 정밀 경계 도형(UQ181)의 상업적 이용 가능 여부 확인 — 공공누리 4유형
