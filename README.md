# 리디브(redev) — 서울 재개발 구역·매물 플랫폼 MVP

재개발닷컴 / 갈타맵 / 재개발뷰의 강점을 합친 정비사업 전문 플랫폼 MVP.

## 수익 구조 (3-트랙)

| 트랙 | 요금 | 내용 |
|---|---|---|
| 🔍 구역 실거래가·사업단계 | **무료** | 유입 트래픽용. 지도 경계 폴리곤, 유형·단계 필터, 실거래 배수 분석 |
| 🏢 중개사 매물 등록 | **유료** | 단건 등록권 9만원 / 월 무제한 구좌 29만원 (모의 결제) |
| 🔓 매수자 검증 매물 열람 | **유료** | 건당 3만원 열람권 → 초기투자금·예상분담금 시뮬레이션 + 중개사 직통 연락처 |

## 주요 화면

- `/` **구역 탐색기**: Leaflet 지도에 구역 경계 폴리곤(사업유형별 색상), 클릭 시 상세 패널
  - 재개발닷컴 스타일: 유형(신통기획/모아타운/도공복/일반재개발)·단계 필터 칩, 등록매물수·최저가·최저 초기투자금 뱃지
  - 재개발뷰 스타일: **실거주 의무 / 토허제 적용** 뱃지, **예상 입주 구간**
  - 갈타맵 스타일 상세: 사업개요(추정비례율·세대수·시공사), 추진경과 타임라인(고시/공고 링크 자리), 실거래 테이블(**대지지분·공시가 배수**·유형별 추이), 구역 내 매물 비교 컬럼(매매가·초기투자금·추정 권리가액·불하금 유무·참고순위)
- `/listings` **검증 매물**: 전체 매물 비교 + 열람권 모의 결제 → 총투자금 시뮬레이션(매매가·불하금·부대비용·초기투자금·전세 회수·추가분담금·추정 권리가액·총 소요자금)
- `/register` **중개사 매물 등록**: 요금제 선택 → 실무 필드 입력(불하금 포함 여부·감정평가액·프리미엄 자동·**초기투자금 자동 계산**) → 모의 결제 → 등록 완료

## 기술 스택

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Leaflet 1.9 (react-leaflet 5, CARTO/OSM 타일 — **지도 API 키 불필요**) · Supabase(Postgres) 준비

## 실행

```bash
cp .env.example .env.local   # 값 없이도 mock 데이터로 동작
npm install
npm run dev                  # http://localhost:3100
npm run build && npm start   # 프로덕션 빌드 확인
npm run geojson              # 구역 폴리곤 → public/data/zones.geojson
```

## Supabase 배포

1. supabase.com에서 프로젝트 생성 → SQL Editor에 `supabase/schema.sql` 실행
   (tables: `zones`, `transactions`, `brokers`, `listings`, `unlocks`, `broker_subscriptions` + RLS 전면)
2. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 입력
3. Vercel: GitHub 저장소 연결 → 환경변수 동일 입력 → Deploy

## 공공 데이터 연동

- **실거래가**: 국토부 실거래가 API — `src/lib/data-provider.ts` 어댑터 골격 참고
- **구역 경계**: 서울 열린데이터광장 / VWorld WFS GeoJSON — `scripts/README-gis.md`
- **정비사업 단계·비례율**: 정비사업 정보몽땅 (eum.go.kr)

## 소스 데이터 고지

현재 구역·실거래·매물 데이터는 **서비스 구조 검증용 샘플**입니다(좌표는 실 위치 기반 근사).
실운영 전 반드시 공공 API/WFS 실데이터로 교체하고, 표시되는 추정치(비례율·분담금·권리가액)에
"참고용 추정" 고지를 유지하세요.
