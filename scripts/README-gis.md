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
2. **소스 병합**: 같은 구역(UQ120·UQ181)을 중심거리·면적비·이름 유사도로 매칭한 뒤,
   **같은 2m 허용오차에서 남는 정점 수(= 실제 굴곡량)** 를 비교해 더 상세한 도형을 쓴다.
   단순 정점 개수 비교는 쓰지 않는다 — UQ120의 노량진1구역은 1m 간격으로 조밀화된 603점이지만
   형상은 43점이면 충분하고, UQ181의 성수전략2구역은 125점 중 49점이 실제 필지 굴곡이다.
   `src/data/zones-geo.json`의 `geomSource`/`geomSourceName`/`geomAsOf`가 채택 출처다.
3. **중복 제거**: 같은 구역이 단계별(신통기획/구역지정/사업시행인가…) 레코드로 여러 번 실려 있어
   중심 45m·면적 40% 이내면 하나만 남긴다.
4. **면적**: 고시면적(`DGM_AR`)과 도형면적(`SHAPE_AREA`)이 1% 내 일치. 표시는 고시면적.
5. **간략화**: Douglas–Peucker — 대표 구역 0.000004°(≈0.45m)·최대 900점, 배경 0.000018°(≈2m)·최대 120점.
   대표 구역 좌표는 소수 6자리(≈0.11m), 배경은 5자리(≈1.1m)로 반올림.
6. **다중 링**: 여러 필지로 나뉜 구역은 `parts`로 함께 저장(면적 5% 이상 링만).

### 출력 파일

| 파일 | 내용 | 소비처 |
|---|---|---|
| `src/data/zones-geo.json` | 대표(피처드) 구역 6곳 고정밀 경계 + 고시 메타(명칭·유형·단계·면적·sourceId·geomSource) | `src/data/sample.ts` → 상세 패널·지도 |
| `src/data/seoul-zones.json` | 배경 레이어 152곳 (대표 6 + 자치구별 선정 146) | `npm run geojson` |
| `public/data/zones.geojson` | 위 152곳 GeoJSON(FeatureCollection, `[lng,lat]`) | `ZoneMap.tsx`가 fetch |

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
 ├ 배경: fetch("/data/zones.geojson") → 152개 구역 <Polygon> (얇은 선, 0.10 채움)
 └ 대표: props.zones (sample.ts) → 굵은 선·0.28 채움, 선택 시 flyToBounds + 0.40
```

- 색: `src/components/map/colors.ts` (신통기획 #7c3aed / 모아타운 #0ea5e9 / 도공복 #f59e0b / 일반재개발 #10b981)
- 타일: OpenStreetMap (키 불필요). VWorld/카카오로 바꾸려면 `TILE_ADAPTERS` 또는 `MapPanel.tsx` 교체.
- 데이터 갱신 시 `npm run geojson` 후 커밋하면 Vercel이 자동 배포한다.

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
