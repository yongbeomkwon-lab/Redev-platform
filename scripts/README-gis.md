# GIS 어댑터 가이드 — 구역 경계 폴리곤·타일 교체

> 사용자가 가장 어려워했던 부분이 "구역 경계 폴리곤 렌더링"입니다.
> 이 MVP는 Leaflet + 실 위·경도 폴리곤으로 동작하며, 아래 순서로 실데이터를 꽂으면 됩니다.

## 1. 현재 구조

```
src/data/sample.ts               ← 구역 폴리곤 [lat, lng][] (근사 샘플)
src/components/map/ZoneMap.tsx   ← Leaflet <Polygon> 렌더 (클릭→상세 패널)
src/components/map/MapPanel.tsx  ← dynamic(ssr:false) 래퍼
scripts/export-geojson.mjs       ← npm run geojson → public/data/zones.geojson
```

## 2. 실제 경계 데이터로 교체 (권장 순서)

### (a) 서울 열린데이터광장 (data.seoul.go.kr)
- 검색: `재개발 정비구역 경계`, `토지구역공시`, `도시계획 WFS`
- 받은 GeoJSON을 `public/data/zones.geojson`으로 저장 → `ZoneMap.tsx`에서:

```tsx
const [zones, setZones] = useState<Zone[]>([]);
useEffect(() => {
  fetch("/data/zones.geojson")
    .then((r) => r.json())
    .then((fc) => setZones(fc.features.map(toZone))); // properties→Zone 매핑
}, []);
```

### (b) VWorld (국토지리정보원) — 국가 공간정보 WFS/WMTS
- 회원가입 후 API 키 발급 → `.env`의 `VWORLD_API_KEY`
- WFS: `https://api.vworld.kr/req/wfs?...&key={VWORLD_API_KEY}` (좌표계 EPSG:4326 요청 권장)
- WMTS 타일 교체는 `ZoneMap.tsx`의 `TILE_ADAPTERS` 주석 해제:

```ts
vworld: {
  url: "https://api.vworld.kr/req/wmts/1.0.0/{VWORLD_API_KEY}/Base/{z}/{y}/{x}.png",
}
```

### (c) 카카오맵 / 네이버맵 JS SDK로 전체 교체
- 키가 필요하고(카카오: JS 키, 네이버: Client ID), 서비스 도메인 등록 필요
- 카카오 SDK의 `kakao.maps.Polygon`으로 동일한 경계 렌더가 가능하며,
  이때도 `ZoneMapProps` 인터페이스를 유지해 `MapPanel.tsx`만 교체하면 된다.

## 3. 좌표계 주의

| 소스 | 좌표계 | 변환 |
|---|---|---|
| 서울 열린데이터 (GML/Shape) | EPSG:5181/5186 흔함 | proj4js로 EPSG:4326 변환 후 사용 |
| VWorld WFS | 파라미터로 EPSG:4326 요청 가능 | 그대로 사용 |
| GeoJSON 표준 | [lng, lat] 순서 | 리프틱은 [lat, lng]로 뒤집을 것 (export-geojson.mjs 참고) |

## 4. 배수·실거래 실데이터

- 국토부 실거래가: `src/lib/data-provider.ts`의 `molitProvider` 골격 주석 참고
  (LAWD_CD 5자리 + DEAL_YMD로 월 단위 수집 → `transactions` 테이블 배치 INSERT)
- 공시지가 개별공시가격 API로 `official_land_value`를 채우면 자동으로 "공시가 배수" 컬럼이 계산됨
