# 지하철 노선·역명 데이터셋 (public/data/subway-*)

지도에 **수도권 지하철 노선선 + 역명**을 올리기 위한 데이터. 재개발 상담에서 첫 질문이
"역이 어디냐"라서, 구역 폴리곤과 같은 화면에 노선·역을 함께 보여준다.

| 파일 | 내용 | 크기 |
|---|---|---|
| `public/data/subway-lines.geojson` | 노선별 폴리라인 20개 노선(1~9호선, 신분당·신림·우이신설, 경의중앙·수인분당·경춘·경강·서해·공항철도·김포골드라인·GTX-A), 공식 노선색 | 약 250KB |
| `public/data/subway-stations.json` | 역 574곳 (좌표·역명·소속 노선·환승 여부) | 약 47KB |

## 원천

- **OpenStreetMap** (© OpenStreetMap contributors, **ODbL 1.0**) — Overpass API
  - 노선 형상: `route=subway|train|light_rail` 관계 중 수도권 전철 노선의 선로 way
  - 역: 해당 관계의 `stop` 멤버 노드(정차 위치)에서 역명·좌표
  - 동일 역이 노선별·방향별로 여러 노드로 흩어져 있어 **이름+거리 기준으로 병합**한다
- **노선색**: 서울교통공사·국가철도공단 표준 표기색을 스크립트에 상수로 고정
  (OSM `colour` 태그는 노선마다 조금씩 달라서 쓰지 않는다)
- 지도 하단 저작자 표기에 `지하철 노선·역 OpenStreetMap (ODbL)` 를 함께 노출한다.

## 재생성

```bash
python3 scripts/build-subway-dataset.py            # Overpass 조회 → public/data 갱신
python3 scripts/build-subway-dataset.py --cached    # tmp/subway 캐시만으로 재생성
```

- 조회 범위(bbox)는 서울 + 인천·김포·고양·의정부·남양주·하남·성남·광교·수원 일부
  `37.20,126.60,37.80,127.40`.
- 원본 응답은 `tmp/subway/` 에 청크 캐시로 저장한다(수십 MB, git 제외).
- 단순화: Douglas–Peucker 0.00007°(≈8m) + 좌표 5자리 반올림 → 파일 250KB·점 1.2만 개.
  이 배율(지도 z11~17)에서 눈에 띄는 손실 없이 가볍다.

## 화면 쪽 구현 (`src/components/map/SubwayLayer.tsx`)

- Leaflet **별도 pane**(`subwayPane`, zIndex 425, `pointer-events: none`)에 캔버스 한 장.
  역 574곳에 DOM 마커를 붙이지 않으므로 이동·확대가 끊기지 않고, **구역 클릭을 가로채지 않는다.**
- 노선: 흰 테두리 + 색선 2겹. 배율별 굵기 z11 2.8px → z15+ 5.5px.
- 역: z12부터 흰 점(환승역은 검은 테두리로 강조), 역명 라벨은 z12에선 환승역만, z13.5부터 전부.
  라벨은 사각형 충돌 검사로 겹치면 오른쪽→왼쪽→위→아래 순으로 자리를 옮기고, 자리가 없으면 생략한다.
  환승역은 역명 옆에 노선 배지(1·2·신분당…)를 최대 3개 붙인다.
- 지도 오른쪽 위 `🚇 지하철 노선` 버튼으로 켜고 끈다(기본 ON).

## 참고: 브이월드(VWorld) WMTS

브이월드 인증키(`FC966AD8-…`)로 `api.vworld.kr` WMTS 타일을 시험했으나,
이 작업 환경에서는 게이트웨이가 `502 Bad Gateway`/연결 종료로 응답해 **키 검증 자체가 불가**했다.
키에 WMTS 사용 신청이 안 되어 있어도 같은 응답이 오므로, 지금은 **OSM 타일 + 지하철 오버레이**를
기본으로 둔다. 브이월드로 바꾸려면 VWorld 콘솔에서 해당 키의 **WMTS 사용 설정·도메인 등록**을
확인한 뒤 `src/components/map/ZoneMap.tsx` 의 `TILE_ADAPTERS` 에 어댑터를 추가하면 된다.
