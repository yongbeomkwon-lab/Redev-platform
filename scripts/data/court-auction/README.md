# 경매 상세 수집 — 이어받기 안내

`public/data/auction-details.json`(화면의 경매 패널: 기일내역·면적/대지권·감정평가요항표·현장사진·임차인·점유관계)을
채우는 두 가지 경로가 있습니다. **둘 다 같은 결과 파일을 만듭니다.**

## ① 대법원 HTTP 직접 수집 (한국 IP에서만 된다)
```bash
python3 scripts/fetch-auction-details.py --delay 20        # 이어받기. 20초 간격
python3 scripts/fetch-auction-details.py --limit 5         # 먼저 5사건만
python3 scripts/fetch-auction-details.py --status          # 모은 양
python3 scripts/fetch-auction-details.py --rebuild         # raw → public/data/auction-details.json
```
- 요청 간 20초를 지켜야 한다(짧으면 `data.ipcheck=false` 로 IP가 막힌다). 막히면 `blocks.json` 을 보고 중단.
- 471물건 + 451현황조사서 = 약 922요청 → 20초 간격이면 5시간, 8초면 2시간(차단 위험 증가).
- 해외 IP(이 작업 서버)에서는 차단된다. 국내 회선(사무실·집 PC)에서 실행한다.

## ② 한국 IP 브라우저 화면 인쇄본(PDF) 수집 — 코드 없이 클릭만
브라우저에서 대법원 경매사건검색 → 사건 조회 → **물건상세조회 → 인쇄하기**(PDF가 `downloads/` 에 저장),
**현황조사서 팝업**은 표를 읽어 JSON 으로 저장한 뒤:
```bash
python3 scripts/auction-pdf-ingest.py --scan          # downloads/ 의 새 PDF 를 전부 파싱
python3 scripts/auction-pdf-ingest.py --survey-stdin < survey.json
python3 scripts/fetch-auction-details.py --rebuild
```
- 사건마다 화면을 6~8번 갱신해야 해서 사람이 하면 사건당 1분, 자동화해도 페이지 상태를 읽는 비용이 크다.
- 진행 상황: `queue.json`(451사건 큐) · `progress.json`(끝난 사건) — `scripts/auction-queue.py next` 로 다음 사건 확인.

## 매각물건명세서(권리분석 핵심) — 기일 1주 전부터 열린다
물건을 조회하면 `매각물건명세서` 버튼이 **매각기일 1주 전부터** 활성화된다. 활성이면 반드시 함께 받는다.
1. 버튼 클릭 → 문서뷰어(ecfs.scourt.go.kr) 새 창
2. 뷰어 오른쪽 아래 **파일저장** → `downloads/<사건번호>_<작성일>_매각물건명세서(...).pdf`
3. `python3 scripts/auction-pdf-ingest.py --spec-scan` → `specification`(작성일 writtenDate · 최선순위 earliestRight ·
   매각으로 소멸되지 않는 권리 nonExtinguishedRights · 지상권 hasSuperficies · 비고 extra) 이 물건 레코드에 붙는다.
   · 서식이 항목 제목 블록이라 **y좌표로 구역을 나눠** 읽는다(제목 사이에 글이 없으면 그 항목은 '없음').
4. `--rebuild` → 화면 '권리 안전도'가 risk(인수 권리 있음)/safe(인수 권리 없음)로 갈린다.

## 레코드 위치
- `pdf-records/detail/<법원코드>-<사건번호>-<물건번호>.json`
- `pdf-records/survey/<법원코드>-<사건번호>.json`
- 사진: `public/data/auction-photos/<법원코드>-<사건번호>-NN.jpg` (긴 변 900px·JPEG, 사건당 4장 상한)
