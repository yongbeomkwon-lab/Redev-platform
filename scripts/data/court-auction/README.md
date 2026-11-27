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

## 레코드 위치
- `pdf-records/detail/<법원코드>-<사건번호>-<물건번호>.json`
- `pdf-records/survey/<법원코드>-<사건번호>.json`
- 사진: `public/data/auction-photos/<법원코드>-<사건번호>-NN.jpg` (긴 변 900px·JPEG, 사건당 4장 상한)
