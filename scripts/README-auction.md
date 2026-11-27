# 구역 내 법원경매 물건 — 수집·지오코딩·매칭

대법원 **법원경매정보**(courtauction.go.kr)에서 서울 5개 법원의 공고중 부동산 물건을 받아,
지번 좌표로 정비구역 경계(`public/data/zones.geojson`)와 매칭해
`public/data/auctions.json` 을 만든다. 화면은 **왼쪽 경매 전용 패널 하나**에서 목록·상세를 본다
(2026-11-27 개편 — 오른쪽 구역 패널과의 중복 제거).

```
python3 scripts/fetch-court-auctions.py      # ① 대법원 수집(이어받기·차단 감지)
python3 scripts/geocode-auctions.py          # ② 지번 → 좌표(카카오, 캐시 사용)
python3 scripts/build-auction-zones.py       # ③ 구역 경계 매칭 → public/data/auctions.json
python3 scripts/verify-auction-zones.py --fix # ④ 구역 경계를 고친 뒤 매핑 재검사(필수)
python3 scripts/fetch-auction-details.py     # ⑤ 사건 상세(기일내역·상태·청구금액) → public/data/auction-details.json
```

## ① 대법원 수집 — 지켜야 하는 것

공식 오픈API가 없고(공공데이터포털에도 없음), 사이트는 2022년 개편 뒤 WebSquare SPA가
JSON XHR로 목록을 그린다. 스크립트는 **화면이 실제로 쓰는 검색 요청**과 같은 형태로
`POST /pgj/pgjsearch/searchControllerMain.on` 을 부른다.

* **차단**: 짧은 간격으로 부르면 IP가 막힌다. 응답은 HTTP 200 + `data.ipcheck=false` +
  `"해당 IP는 비정상적인 접속으로 보안정책에의하여 차단되었습니다"`.
  - 2026-11-22 실측: 5초 간격 4연속·페이지 크기 100 요청은 즉시 차단, **20초 간격·50건/페이지**는
   5개 법원 64페이지를 25분간 통과(차단 0회). 그래서 기본값이 `--delay 20` 이다.
  - `ipcheck=false` 를 만나면 스크립트가 **즉시 멈춘다**(더 두드리지 않는다). 차단 이력은
    `scripts/data/court-auction/blocks.json` 에 남는다.
* **이어받기**: 페이지별 원본을 `scripts/data/court-auction/raw/` 에 저장하므로, 중간에 멈춰도
  같은 명령을 다시 돌리면 받은 페이지는 건너뛴다.
* **범위**: 검색조건에 따라 다르다.
  - `0004601` 「부동산 일반」: 매각기일이 앞으로 약 2주(2026-11-22 기준 11-23~12-04)인 공고중 물건.
  - `0004602` 「부동산 전체」: 같은 날 기준 **11-23~2027-01-06** 까지 넓고, **서울서부지법 321건** 포함.
    (00 4601 로는 서울서부지방법원이 0건이었는데, 4602 에서는 마포·서대문·은평·용산 물건이 나온다.)
  - 날짜 파라미터 `dspslDxdyYmd` 는 무시된다(20261215 로 넣어도 같은 응답). 그래서 기간을 넓히려면 조건 코드를 바꿔야 한다.
  - 두 조건을 **함께** 받아 합친다(중복은 물건 id 로 제거). raw 파일 이름의 가운데 토막이 조건을 나타낸다(`all`=4601, `c0004602`=4602).

명령 예: `--court B000210`, `--status`, `--rebuild`(raw 전체를 다시 합치기), `--max-pages`.

## ② 지오코딩

카카오 **JavaScript 키**(`NEXT_PUBLIC_KAKAO_MAP_APP_KEY`)를 그대로 쓴다. 지도 SDK 키도
`KA: os/web; origin/<등록 도메인>` 헤더를 붙이면 로컬 주소검색 API가 같은 앱 키로 응답한다
(도메인 등록 필요 — 2026-11-22 확인). REST 키를 따로 발급받지 않아도 된다.

`scripts/data/court-auction/geocode.json` 에 주소→좌표를 남기므로, 하루 갱신에서는 새 지번만 부른다.

## ③ 구역 매칭

bbox 선별 → 광선교차(Point-in-Polygon). 한 물건이 여러 구역에 걸치면 **면적이 가장 작은 구역**을
대표(`zoneId`)로 두고 `zoneIds` 에 전부 남긴다. 매칭 0건인 구역은 `byZone` 에 키를 만들지 않는다
(패널이 섹션을 그리지 않는다).

## ④ 매핑 재검사 — 왜 따로 돌려야 하나

`auctions.json` 의 `zoneId` 는 **③을 돌린 그 시점의 폴리곤**으로 계산한 스냅샷이다. 그 뒤에 구역
경계를 다시 그리거나(`scripts/apply-*.py`) 구역을 새로 넣으면, 물건 좌표는 그대로인데 배지만
엉뚱한 구역에 남는다.

* 2026-11-23 실제 사례: `양재2동 2구역` 경계를 근사원→필지 가까운 가상경계로 바꾼 뒤 양재동 324-1
  물건 2줄이 구역 밖(41m)인데도 그 구역 경매로 남아 있었다.
* 같은 날 `zones.geojson` 을 `seoul-zones.json` 만 보고 다시 내보내 **구역 15곳이 지도에서 사라져**
  `DDP 1·2·3구역`(경매 9줄)·`쌍문동 710`(1줄)의 `zoneId` 가 주인을 잃기도 했다. 이제 내보내기는
  사라지는 구역·필드가 있으면 멈추고(`scripts/export-geojson.py`, 같은 규칙의 `.mjs`), 데이터는
  `scripts/apply-zones-restore-20261123.py` 로 되살렸다.

검사 규칙: 폴리곤 안이면 통과, 밖인데 다른 구역 안이면 면적이 가장 작은 구역으로 재매핑, 어느
구역에도 없으면 경계에서 10m 이내(`--tol`)면 지번 좌표 오차로 보고 유지, 그보다 멀면 매핑 해제.
해제·재매핑한 줄은 `meta.audit` 에 남는다(화면은 `byZone` 만 읽으므로 동작에 영향 없음).

## 원문 링크에 대해

사건상세 화면(PGJ15BM01)은 사건번호를 URL 파라미터로 받지 않는다(화면 간 데이터를 메모리로 넘긴다).
직접 링크하면 빈 화면 + `부모 객체를 찾을 수 없습니다` 오류창이 뜨는 것을 2026-11-22 브라우저로
확인했다.

그래서 2026-11-22에는 외부 링크를 아예 두지 않았다. **2026-11-27 사용자 요구**(“대법원 사이트
안 가고 다 보고 싶다”)로 상세 패널에 **사건번호 복사**와 **대법원 사건검색 열기**를 두었다 —
사건검색(PGJ159M00)에서 사건번호를 붙여 넣으면 기일내역·당사자·물건상태까지 한 화면에 나온다.
사건상세로 바로 가는 링크는 여전히 두지 않는다(열리지 않는다).

화면에 보이는 값은 **보유한 것만** 쓴다. 기일내역·물건상태·청구금액·배당요구종기·목록내역은
사건 조회에서 받아 `auction-details.json` 에 넣고(아래 ⑤), 면적·감정평가요항표·사건 사진은
사건상세에서만 나오므로 수집 전이면 “대법원 원문에서 확인”으로 안내한다. 추정값을 만들지 않는다.

## ⑤ 물건 상세·현황조사서 — 화면 하나에서 끝내기

카드가 아니라 **경매 패널**에서 감정평가요항표·임차인·점유관계·사진까지 보려면, 물건검색 한 줄로는
부족하다. `fetch-auction-details.py` 는 법원 화면이 실제로 부르는 세 요청을 그대로 쓴다.

| 무엇 | 화면 | 요청 | 얻는 값 |
|---|---|---|---|
| 물건상세 | `PGJ15BM01` | `POST /pgj/pgj15B/selectAuctnCsSrchRslt.on`<br>`{"dma_srchGdsDtlSrch": {csNo, cortOfcCd, dspslGdsSeq, pgmId:"PGJ15BM01", srchInfo:""}}` | 기일이력(회차별 결과·최저가)·물건상태·목적물 면적/대지권·감정평가요항표·사건 사진(base64) |
| 현황조사서 | `PGJ15BP01` | `POST /pgj/pgj15B/selectCurstExmndc.on`<br>`{"dma_srchCurstExmn": {cortOfcCd, csNo, auctnInfOriginDvsCd:"2", ordTsCnt:""}}` | 조사일시·임차인(보증금·차임·전입일·확정일자)·점유관계·부동산의 현황 |
| 매각물건명세서 | `PGJ15BM01` | `POST /pgj/pgj15B/insertDspslGdsSpecArtcWdrwInf.on` (`--spec-link`) | 문서 ID·뷰어 주소(encParam)만 — 본문 PDF는 긁지 않는다 |

* 요청 본문은 **dataMap 이름이 최상위 키**다(`{"dma_srchGdsDtlSrch": {…}}`). 평평한 `{cortOfcCd, csNo}`
  로 보내면 서버가 받지 않는다.
* 매각물건명세서는 매각기일 **1주 전**부터, 현황조사서·감정평가서는 **2주 전**부터 열린다. 그 밖의
  물건은 "문서 없음"이 정상이다. 명세서 뷰어(ecfs.scourt.go.kr)는 서버측 클라이언트를 자주 거절하므로
  `--spec-link` 실패는 오류로 보지 않고, 화면은 "원문에서 확인" 안내를 남긴다.
* 사진은 `csPicLst[].picFile`(base64)을 `public/data/auction-photos/` 에 저장하고 경로만 JSON에 넣는다.
  `--photos` 로 사건당 장수, `--max-photo-kb` 로 한 장 상한을 정한다.

```
python scripts/fetch-auction-details.py --limit 3      # 윈도우는 python
python scripts/fetch-auction-details.py --status
python scripts/fetch-auction-details.py --rebuild      # raw → auction-details.json
python scripts/fetch-auction-details.py --self-test    # 파싱만 검사(HTTP 없음)
python scripts/fetch-auction-details.py --probe B000210:2024타경1997:1
```

* 결과는 `{meta, byCase: {"법원코드|사건번호": …}, byId: {물건 id: …}}`. byCase 키의 사건번호는 화면
  표기(`2024타경1997`)이고, `auctions.json` 의 `caseNo` 와 같은 값이다.
* **자동 수집이 막혔을 때**: 서버 IP가 `data.ipcheck=false`("비정상적인 접속")로 차단되면 아무것도
  받지 못한다. 그때는 브라우저로 대법원 화면을 열어 확인한 값을 `scripts/data/court-auction/manual-details.json`
  에 적어 두면 `--rebuild` 가 raw 와 함께 합친다(raw 우선). 2026-11-27 차단 당시 서울중앙
  `2024타경1072`·`2024타경1997` 두 사건을 이 방식으로 넣었다(값은 화면 그대로, 없는 항목은 비움).
* **2026-11-27 이 작업 서버의 IP는 차단 상태였다** — 그래서 HTTP 수집은 여기서 실제로 돌리지 못했고,
  파싱은 사이트 화면 정의(`PGJ15BM01.xml`·`PGJ15BP01.xml`)의 필드 이름과 브라우저로 정상 조회한 두
  사건의 화면 값으로 `--self-test` 까지 맞췄다(물건상세·현황조사서는 구조 fixture, 사건검색은 실제 응답).
  차단이 풀린 국내 네트워크에서 `--limit 3` 부터 올려 가며 돌린다.

## 저작권·이용

법원경매정보의 자료는 대법원이 권리를 가진다. 여기서는 **입찰 판단을 돕는 참고 정보**로만 쓰고,
화면에 출처(대법원 법원경매정보)와 수집 시점을 밝힌다. 원자료를 대량으로 재배포하거나
유료 경매정보처럼 가공해 파는 용도로 쓰지 않는다.
