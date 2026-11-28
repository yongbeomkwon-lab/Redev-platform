# 온비드 공매 물건 수집 → 리디브 구역 매칭

리디브의 **🏛️ 공매(온비드)** 데이터는 세 단계로 만든다. 경매(⚖️)와 파이프라인 모양이 같다.

```
python3 scripts/fetch-onbid-gongmae.py      # ① 온비드 API → scripts/data/onbid-gongmae/latest.json
python3 scripts/geocode-onbid.py            # ② 지번 → 좌표(카카오 주소검색, 캐시)
python3 scripts/build-gongmae-zones.py      # ③ 구역 경계 매칭 → public/data/gongmae.json
```

## ① 수집 (`fetch-onbid-gongmae.py`)

* API: 공공데이터포털 「한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스」 (데이터 ID **15157207**)
  `GET https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2`
* 키: `.env.local` 의 `ONBID_API_KEY` → 없으면 `MOLIT_API_KEY`(같은 계정 키). 2026-11-28 활용신청·자동승인.
* **필수 조건이 재산유형코드 × 수의계약가능여부**라서 재산유형 10종 × Y/N 조합으로 나눠 부른다(약 20회).
  지역은 `lctnSdnm=서울특별시`, 처분방식은 `dspsMthodCd=0001`(매각)로 좁힌다.
* 개발계정 하루 1,000회 — 이 스크립트는 20회 남짓만 쓴다.

## ② 지오코딩 (`geocode-onbid.py`)

* 지번PNU(`ltnoPnu`)가 있으면 PNU를 풀어 `시도 시군구 읍면동 [산]본번-부번`을 만든다.
* PNU가 없는 집합건물(응답의 절반)은 물건명에서 `…동 번지` 또는 도로명을 뽑아 쓴다.
  둘 다 못 뽑는 물건(17건)은 **동 중심점으로 때우지 않고 좌표를 만들지 않는다**(다른 구역에 붙는 것 방지).
* 카카오 JavaScript 키를 지도 SDK와 같은 방식(`KA: origin/...`)으로 쓴다 — REST 키 발급 불필요.

## ③ 매칭 (`build-gongmae-zones.py`)

* 입찰이 끝나지 않은 물건만(입찰종료일시 ≥ 오늘, 상태 ≠ `입찰마감`) `public/data/zones.geojson` 폴리곤에
  Point-in-Polygon 매칭. 여러 구역에 걸치면 **면적이 가장 작은 구역**이 대표(경매와 같은 규칙).
* **회차는 하나로 접는다** — 온비드는 유찰된 물건의 다음 회차까지 목록에 올린다(예: 황학동 741 대지가
  10회차까지 1,084만→975만→867만…). 목록은 **물건 1건 = 한 줄**이 되도록 가장 가까운 회차를 대표로 두고,
  회차별 최저가 사다리는 `rounds` 에 남긴다(2026-11-28 서울 3,566건 → 물건 650건).
* 출력은 `{ meta, byZone }` — 경매 `auctions.json` 과 같은 모양에 공매 필드(물건관리번호·입찰기간·상태·
  재산유형·공고기관·배당요구종기·온비드 링크)를 더했다.

## 온비드 원문 링크에 대해

온비드 물건 상세(`/op/cltrpbancinf/cltrdtl/CltrDtlController/mvmnCltrDtl.do`)는 **화면끼리 세션으로 값을
넘겨 딥링크가 없다**(2026-11-28 확인 — `cltrMngNo`·`pbctCdtnNo`를 쿼리로 줘도 500). 그래서 패널은
공매 물건검색(조건검색) 화면으로 보내고 **물건관리번호 복사** 버튼을 함께 둔다.
