#!/usr/bin/env python3
"""
경매 물건 상세 수집 — 대법원 법원경매정보(courtauction.go.kr)

무엇을 모으나
  ① 물건상세  POST /pgj/pgj15B/selectAuctnCsSrchRslt.on   (화면 PGJ15BM01)
       사건기본정보 · 기일이력(회차별 결과·최저가) · 물건상태 · 목적물 면적/대지권 ·
       건물표제부 · 감정평가요항표 · 사건 사진(base64)
  ② 현황조사서 POST /pgj/pgj15B/selectCurstExmndc.on        (팝업 PGJ15BP01)
       조사일시 · 임차인현황(보증금·차임·전입일·확정일자) · 점유관계 · 부동산의 현황
  ③ 매각물건명세서  POST /pgj/pgj15B/insertDspslGdsSpecArtcWdrwInf.on  (--spec-link 로만)
       본문은 PDF 문서라 긁지 않는다. 문서 ID·뷰어 주소(encParam)만 받아 두고 화면은 원문 링크를 준다.

요청 규약 (2026-11-27 화면 정의 PGJ15BM01.xml / PGJ15BP01.xml 확인)
  · WebSquare dataMap 이름이 그대로 JSON 최상위 키다:
        {"dma_srchGdsDtlSrch": {csNo, cortOfcCd, dspslGdsSeq, pgmId, srchInfo}}
        {"dma_srchCurstExmn":   {cortOfcCd, csNo, auctnInfOriginDvsCd: "2", ordTsCnt}}
  · 응답은 {"status":200, "data": {...,"ipcheck":true}, ...}. ipcheck=false 는 봇 차단이다.
  · 요청 간 기본 20초. 짧은 간격이면 IP가 보안정책으로 막힌다(차단되면 즉시 중단하고 blocks.json).

출력
  · scripts/data/court-auction/detail-raw/<법원>-<사건번호>-<물건번호>.json   물건상세 원본
  · scripts/data/court-auction/survey-raw/<법원>-<사건번호>.json              현황조사서 원본
  · public/data/auction-photos/<법원>-<사건번호>-<번호>.jpg                   사건 사진
  · public/data/auction-details.json                                          화면이 읽는 정규화 파일
        { meta, byCase: {"법원코드|사건번호": …}, byId: {물건 id: …} }

사용법 (윈도우 PC에서는 `python` / 맥·리눅스는 `python3`)
  python scripts/fetch-auction-details.py --limit 3          # 3사건만 받아 보기(먼저 소량)
  python scripts/fetch-auction-details.py                    # auctions.json 의 모든 사건(이어받기)
  python scripts/fetch-auction-details.py --status           # 지금까지 모은 raw 상태
  python scripts/fetch-auction-details.py --rebuild          # raw → auction-details.json 재생성
  python scripts/fetch-auction-details.py --probe B000210:2024타경1997:1   # 한 물건만 조회·요약
  python scripts/fetch-auction-details.py --self-test        # 파싱만 검사(HTTP 없음)
  python scripts/fetch-auction-details.py --spec-link        # 매각물건명세서 뷰어 주소까지 시도

⚠ 2026-11-27 이 작업 서버의 IP는 대법원 경매정보의 '비정상적인 접속' 보안정책으로 차단됐다
  (data.ipcheck=false). 그래서 HTTP 경로는 여기서 실제로 돌려 보지 못했고, 파싱은 사이트 화면
  정의(PGJ15BM01.xml·PGJ15BP01.xml)의 필드 이름과, 브라우저로 정상 조회한 두 사건
  (서울중앙 2024타경1072·2024타경1997)의 화면 값으로 맞췄다. 한국 네트워크(가정·사무실)에서
  `--limit 3` 으로 시작해 blocks.json 을 보며 늘린다.
  자동 수집이 막혀 있는 동안 화면에서 직접 확인한 값은 scripts/data/court-auction/manual-details.json
  에 두고 --rebuild 가 raw 와 함께 합친다(raw 가 우선).
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AUCTIONS = os.path.join(ROOT, "public", "data", "auctions.json")
OUT = os.path.join(ROOT, "public", "data", "auction-details.json")
PHOTO_DIR = os.path.join(ROOT, "public", "data", "auction-photos")
DATA_DIR = os.path.join(HERE, "data", "court-auction")
RAW_DIR = os.path.join(DATA_DIR, "case-raw")        # 사건검색(기존)
DETAIL_DIR = os.path.join(DATA_DIR, "detail-raw")   # 물건상세
SURVEY_DIR = os.path.join(DATA_DIR, "survey-raw")   # 현황조사서
MANUAL = os.path.join(DATA_DIR, "manual-details.json")
COOKIE = os.path.join(DATA_DIR, "cookies.txt")
BLOCK_LOG = os.path.join(DATA_DIR, "blocks.json")

BASE = "https://www.courtauction.go.kr"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
ENTRY_URL = BASE + "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml&pgjId=159M00"
DETAIL_URL = BASE + "/pgj/pgj15B/selectAuctnCsSrchRslt.on"
SURVEY_URL = BASE + "/pgj/pgj15B/selectCurstExmndc.on"
SPEC_URL = BASE + "/pgj/pgj15B/insertDspslGdsSpecArtcWdrwInf.on"
SEARCH_URL = BASE + "/pgj/pgj15A/selectAuctnCsSrchRslt.on"   # 사건검색(기존 수집 경로)

# ── 공식 코드표 (화면 정의·법원 코드표에서 확인한 값) ────────────────────────────
DXDY_KND = {
    "01": "매각기일", "02": "매각결정기일", "03": "대금지급기한",
    "04": "대금지급및 배당기일", "05": "배당기일", "06": "일부배당",
    "07": "일부배당 및 상계", "08": "심문기일", "09": "추가배당기일", "11": "개찰기일",
}
DXDY_RSLT = {
    "000": "매각준비", "001": "매각", "002": "유찰", "003": "최고가매각허가결정",
    "004": "차순위매각허가결정", "005": "최고가매각불허가결정", "006": "차순위매각불허가결정",
    "007": "기한변경", "008": "추후지정", "009": "납부", "010": "미납", "011": "기한후납부",
    "012": "상계허가", "013": "진행", "014": "변경", "015": "배당종결", "016": "배당불가",
    "017": "최고가매각허가취소결정", "018": "차순위매각허가취소결정",
}
GDS_STAT = {
    "00": "매각준비", "01": "매각공고", "02": "매각", "03": "유찰",
    "04": "매각허가결정", "05": "매각불허가결정", "06": "대금납부",
    "07": "대금미납", "08": "매각허가취소결정",
}
LST_DVS = {
    "01": "토지", "02": "건물", "03": "집합건물", "04": "자동차",
    "05": "건설기계,항공기선박을 포함한 기타", "06": "선박", "07": "항공기",
    "08": "광업권", "09": "어업권", "10": "기계기구", "11": "토지,건물",
    "12": "건설기계,중기", "99": "기타",
}
GDS_USG = {
    "01": "아파트", "02": "단독주택,다가구주택", "03": "연립주택,다세대,빌라",
    "04": "자동차,중기", "05": "대지,임야,전답", "06": "상가,오피스텔,근린시설",
    "07": "대지", "08": "임야", "09": "전답", "10": "단독주택", "11": "다가구주택",
    "12": "연립주택", "13": "다세대", "14": "빌라", "15": "상가", "16": "오피스텔",
    "17": "근린시설", "18": "자동차", "19": "중기", "99": "기타",
}
# 현황조사서 점유관계 코드 — PGJ15BP01.xml 의 possRltnCdNm() 을 그대로 옮겼다
POSS_RLTN = {
    "01": "채무자(소유자)점유", "02": "임차인(별지)점유", "03": "제 3 자점유",
    "04": "채무자(소유자)점유, 임차인(별지)점유, 제 3 자점유",
    "05": "채무자(소유자)점유, 임차인(별지)점유", "06": "임차인(별지)점유, 제 3 자점유",
    "07": "채무자(소유자)점유, 제 3 자점유", "09": "미상", "10": "기타점유",
    "11": "채무자(소유자)점유, 임차인(별지)점유, 기타점유",
    "12": "채무자(소유자)점유, 기타점유", "13": "임차인(별지)점유, 기타점유",
}
PIC_DVS = {"01": "전경도", "02": "위치도", "03": "개황도", "04": "관련사진", "05": "내부사진"}

FIXTURE_SEARCH = os.path.join(HERE, "data", "auction-detail-fixture-2024타경1072.json")
FIXTURE_DETAIL = os.path.join(HERE, "data", "auction-detail-fixture-structure.json")
FIXTURE_SURVEY = os.path.join(HERE, "data", "auction-survey-fixture-structure.json")


# ── HTTP ──────────────────────────────────────────────────────────────────────
def curl(args: list[str], timeout: int = 90) -> bytes:
    os.makedirs(DATA_DIR, exist_ok=True)
    p = subprocess.run(
        ["curl", "-sS", "--max-time", str(timeout), "-b", COOKIE, "-c", COOKIE,
         "-A", UA, "-H", "Accept-Language: ko-KR,ko;q=0.9"] + args,
        capture_output=True, timeout=timeout + 15,
    )
    if p.returncode != 0:
        raise RuntimeError(f"curl 실패: {p.stderr.decode(errors='replace')[:300]}")
    return p.stdout


def open_session() -> None:
    curl([ENTRY_URL, "-o", os.devnull, "-H", "Referer: " + BASE + "/"])


def post_json(url: str, payload: dict) -> dict:
    out = curl([
        url, "-X", "POST",
        "-H", "Content-Type: application/json; charset=UTF-8",
        "-H", "Origin: " + BASE,
        "-H", "Referer: " + ENTRY_URL,
        "-H", "X-Requested-With: XMLHttpRequest",
        "-H", "Accept: application/json, text/javascript, */*; q=0.01",
        "--data-binary", json.dumps(payload, ensure_ascii=False),
    ])
    text = out.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"_raw": text[:2000], "status": None, "message": "JSON 아님"}


def fetch_detail(court: str, case_no: str, seq: str) -> dict:
    """물건상세 — 매각물건(물건번호) 하나당 한 번"""
    return post_json(DETAIL_URL, {"dma_srchGdsDtlSrch": {
        "csNo": case_no, "cortOfcCd": court, "dspslGdsSeq": str(seq),
        "pgmId": "PGJ15BM01", "srchInfo": "",
    }})


def fetch_survey(court: str, case_no: str, ord_cnt: str = "") -> dict:
    """현황조사서 — 사건 하나당 한 번(명령회차는 비우면 최신)"""
    return post_json(SURVEY_URL, {"dma_srchCurstExmn": {
        "cortOfcCd": court, "csNo": case_no,
        "auctnInfOriginDvsCd": "2", "ordTsCnt": str(ord_cnt or ""),
    }})


def fetch_spec_link(court: str, case_no: str, seq: str, orv: str, doc_id: str) -> dict | None:
    """매각물건명세서 뷰어 주소 — 문서뷰어(ecfs.scourt.go.kr) 로 여는 링크만 만든다.

    · 같은 요청이 서버측 클라이언트에는 500 으로 거절되는 사례가 보고돼 있다(2026-08 정찰).
      실패해도 수집은 계속하고, 화면에는 '원문에서 확인' 안내가 남는다.
    """
    if not orv or not doc_id:
        return None
    res = post_json(SPEC_URL, {"dma_dspslGdsSpecLog": {
        "cortOfcCd": court, "csNo": case_no, "dspslGdsSeq": str(seq),
        "orvParam": orv, "dspslGdsSpcfcEcdocId": doc_id,
        "cortAuctnMbrsId": "NONUSER", "docFlag": "1",
    }})
    info = (res.get("data") or {}).get("dma_dspslSpcfcInfo") or {}
    url, enc = info.get("url"), info.get("encParam")
    if not url or not enc:
        return None
    param = base64.b64encode(json.dumps(
        {"encParam": enc, "pspTkn": "NA", "pspSid": "NA"}
    ).encode("utf-8")).decode("ascii")
    return {"viewerUrl": url + "?paramData=" + param, "collectedAt": now_iso()}


def looks_blocked(res: dict) -> bool:
    data = res.get("data") or {}
    if data.get("ipcheck") is False:
        return True
    msg = res.get("message") or ""
    return "비정상적인 접속" in msg or "차단" in msg


def log_block(kind: str, court: str, case_no: str, res: dict) -> None:
    rows = []
    if os.path.exists(BLOCK_LOG):
        try:
            rows = json.load(open(BLOCK_LOG, encoding="utf-8"))
        except json.JSONDecodeError:
            rows = []
    rows.append({
        "at": now_iso(), "kind": kind, "court": court, "caseNo": case_no,
        "message": res.get("message"),
    })
    os.makedirs(DATA_DIR, exist_ok=True)
    json.dump(rows, open(BLOCK_LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


# ── 작은 도우미 ────────────────────────────────────────────────────────────────
def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def to_int(v) -> int | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    try:
        return int(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def s(v) -> str:
    """값을 문자열로 — None 은 빈 문자열"""
    return "" if v is None else str(v).strip()


def first(lst, key):
    for row in lst or []:
        v = (row or {}).get(key)
        if v not in (None, ""):
            return v
    return None


def lines(text: str) -> str:
    """`<br>`, `&nbsp;` 를 화면과 같은 줄바꿈·공백으로 되돌린다"""
    t = s(text).replace("&nbsp;", " ").replace("<br />", "\n").replace("<br/>", "\n")
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    return t.strip()


SQ_M = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*㎡")


def first_sqm(text: str, after: str | None = None) -> float | None:
    """문장 안 첫 ㎡ 값. `after` 를 주면 그 문구 뒤에서만 찾는다."""
    t = s(text)
    if after:
        i = t.find(after)
        if i < 0:
            return None
        t = t[i:i + 600]
    m = SQ_M.search(t)
    if not m:
        return None
    try:
        v = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    return v if v > 0 else None


def to_py(sqm: float | None) -> float | None:
    if not sqm:
        return None
    return round(sqm / 3.305785, 1)


# ── 정규화 ────────────────────────────────────────────────────────────────────
def parse_schedules(rows) -> list[dict]:
    out = []
    for r in rows or []:
        out.append({
            "date": s(r.get("dxdyYmd")),
            "kind": DXDY_KND.get(s(r.get("auctnDxdyKndCd")), s(r.get("auctnDxdyKndCd"))),
            "place": s(r.get("dxdyPlcNm")),
            "minimum": to_int(r.get("tsLwsDspslPrc")),
            "result": DXDY_RSLT.get(s(r.get("auctnDxdyRsltCd")), ""),
            "time": s(r.get("dxdyHm")),
        })
    out.sort(key=lambda x: x["date"])
    return out


def parse_appraisal(rows) -> list[dict]:
    """감정평가요항표 — 표제 코드 단위로 묶는다. 표제·항목 '이름'은 코드표가 없으면 비운다."""
    out = []
    for r in rows or []:
        text = lines(r.get("aeeWevlMnpntCtt"))
        out.append({
            "table": s(r.get("aeeWevlMnpntTbltDvsCd")),
            "tableName": s(r.get("aeeWevlMnpntTbltDvsNm")),   # 응답에 이름이 있으면 쓴다
            "item": s(r.get("aeeWevlMnpntItmCd")),
            "itemName": s(r.get("aeeWevlMnpntItmNm")),
            "text": text,
        })
    return out


def parse_objects(objs) -> tuple[list[dict], dict]:
    """목적물 목록 → 화면용 areas + 면적 요약(전용·대지권).

    · 목적물 하나의 면적은 법원이 `objctArDts`(토지) / `bldDtlDts`(건물·집합건물) 글로 준다.
      전유부분은 "전유부분의 건물의 표시" 뒤의 첫 ㎡, 대지권은 "대지권" 표시 뒤 첫 ㎡ 로 읽는다.
    · 읽지 못하면 **비워 둔다**(추정 금지). 화면은 전용/대지권 칩을 그리지 않는다.
    """
    areas: list[dict] = []
    exclusive = None
    land = None
    for o in objs or []:
        kind = LST_DVS.get(s(o.get("auctnLstDvsCd")), s(o.get("auctnLstNm")))
        detail = lines(o.get("bldDtlDts")) or lines(o.get("objctArDts"))
        if not detail:
            continue
        head = " ".join(x for x in [s(o.get("ldcgDts")), s(o.get("objctArDts"))] if x)
        areas.append({
            "kind": kind or "목적물",
            "detail": (head + "\n" + detail).strip()[:1200],
            "areaSqm": first_sqm(o.get("objctArDts")) or first_sqm(o.get("bldDtlDts")),
        })
        if exclusive is None:
            v = first_sqm(detail, "전유부분의 건물의 표시")
            if v is None and kind in ("건물", "집합건물"):
                v = first_sqm(o.get("objctArDts")) or first_sqm(o.get("bldDtlDts"))
            exclusive = v
        if land is None:
            # '대지권의 목적인 토지의 표시' 는 토지 목록이지 대지권 면적이 아니다 — 그 뒤 '대지권' 표기만 읽는다
            v = first_sqm(detail, "대지권의 비율") or first_sqm(detail, "대지권 비율")
            if v is None:
                m = re.search(r"대지권[^\n]{0,12}?(\d[\d,]*(?:\.\d+)?)\s*㎡", detail)
                if m and "목적인 토지" not in m.group(0):
                    v = float(m.group(1).replace(",", ""))
            land = v
    return areas, {
        "exclusiveSqm": exclusive,
        "exclusivePy": to_py(exclusive),
        "landSqm": land,
        "landPy": to_py(land),
    }


def parse_detail(res: dict, court: str, case_no: str, seq: str) -> tuple[dict, dict]:
    """물건상세 응답 → (사건 공통 레코드, 물건 레코드)"""
    data = ((res.get("data") or {}).get("dma_result")) or {}
    base = data.get("csBaseInfo") or {}
    gds = data.get("dspslGdsDxdyInfo") or {}
    dstrt = data.get("dstrtDemnInfo") or []
    deadlines = sorted({s(r.get("dstrtDemnLstprdYmd")) for r in dstrt if s(r.get("dstrtDemnLstprdYmd"))})
    objects = data.get("gdsDspslObjctLst") or []
    areas, area = parse_objects(objects)

    case = {
        "_key": s(base.get("userCsNo")) or case_no,  # 레코드 키는 화면 표기 사건번호 — auctions.json 의 caseNo 와 같다
        "caseNo": s(base.get("userCsNo")) or case_no,
        "caseName": s(base.get("csNm")),
        "court": s(base.get("cortOfcNm")),
        "courtDept": s(base.get("cortAuctnJdbnNm")),
        "courtTel": s(base.get("jdbnTelno")),
        "execTel": s(base.get("execrCsTelno")),
        "receiptDate": s(base.get("csRcptYmd")),
        "commenceDate": s(base.get("csCmdcYmd")),
        "claimAmount": to_int(base.get("clmAmt")),
        "dividendDeadline": deadlines[0] if deadlines else "",
        "depositRate": to_int(gds.get("prchDposRate")),
        "schedules": {str(seq): parse_schedules(data.get("gdsDspslDxdyLst"))},
        "itemStatus": {str(seq): GDS_STAT.get(s(gds.get("auctnGdsStatCd")), s(gds.get("auctnGdsStatCd")))},
        "specSheetIds": ({str(seq): s(gds.get("dspslGdsSpcfcEcdocId"))}
                         if s(gds.get("dspslGdsSpcfcEcdocId")) else {}),
        "lists": [{
            "seq": o.get("dspslObjctSeq"),
            "kind": LST_DVS.get(s(o.get("auctnLstDvsCd")), s(o.get("auctnLstNm"))),
            "address": s(o.get("userPrintSt")) or s(o.get("rprsLtnoAddr")),
            "closing": "",
        } for o in objects],
        "note": lines(gds.get("dspslGdsRmk")),
        "collectedAt": now_iso(),
    }
    if s(gds.get("auctnGdsUsgCd")):
        case["objectKind"] = GDS_USG.get(s(gds.get("auctnGdsUsgCd")), "")

    item = {
        "objectKind": case.get("objectKind", ""),
        "salePlace": s(gds.get("dspslPlcNm")),
        "areas": areas,
        "area": area,
        "appraisalSummary": parse_appraisal(data.get("aeeWevlMnpntLst")),
        "collectedAt": now_iso(),
    }
    # 1차~4차 최저가가 따로 오면 이력에 없는 회차를 채워 두지 않는다(중복 위험) — 기일이력만 쓴다.
    if s(gds.get("bidBgngYmd")):
        item["bidPeriod"] = f"{s(gds.get('bidBgngYmd'))} ~ {s(gds.get('bidEndYmd'))}"
    return case, item


def parse_survey(res: dict) -> dict:
    """현황조사서 응답 → {tenants: [...], occupancy: {...}, rawNotes}"""
    data = res.get("data") or {}
    mgr = data.get("dma_curstExmnMngInf") or {}
    leasees = data.get("dlt_ordTsLserLtn") or []
    rlets = data.get("dlt_ordTsRlet") or []

    tenants = []
    for r in leasees:
        name = s(r.get("intrpsNm"))
        if not name:
            continue
        tenants.append({
            "name": name,                                   # 법원이 마스킹한 표기 그대로
            "address": s(r.get("printSt")) or s(r.get("rprsLtnoAddr")),
            "part": s(r.get("lesPartCtt")),
            "usage": s(r.get("lesUsgDts")),
            "period": s(r.get("gdsPossCtt")),
            "deposit": s(r.get("lesDposDts")),
            "rent": s(r.get("mmrntAmtDts")),
            "movedIn": s(r.get("mvinDtlCtt")),
            "fixedDate": s(r.get("rgstryCrtcpCfmtnCtt")),
            "possession": s(r.get("gdsPossCtt")),
            "note": s(r.get("lesDtsRmk")),
        })

    detail_parts, relations = [], []
    for r in rlets:
        rel = POSS_RLTN.get(s(r.get("auctnPossRltnCd")), s(r.get("auctnPossRltnCd")))
        if rel:
            relations.append(rel)
        st = s(r.get("gdsPossCtt"))
        if st:
            seq = s(r.get("objctSeq"))
            detail_parts.append((f"[목록 {seq}] " if seq else "") + lines(st))

    occupancy = {}
    exmn = s(mgr.get("exmnDtDts"))
    if exmn:
        occupancy["examinedAt"] = " / ".join(x for x in exmn.split("^") if x.strip())
    if relations:
        occupancy["relation"] = ", ".join(sorted(set(relations)))
    if detail_parts:
        occupancy["detail"] = "\n".join(detail_parts)
    prop = lines(mgr.get("printRltnDts"))
    if prop:
        occupancy["property"] = prop
    etc = lines(mgr.get("lesDts"))
    if etc:
        occupancy["etc"] = etc

    return {"tenants": tenants, "occupancy": occupancy or None}


def parse_case_search(res: dict, court_code: str, case_no: str) -> dict:
    """(기존 경로) 경매사건검색 응답 → 사건 공통 레코드"""
    data = res.get("data") or {}
    base = data.get("dma_csBasInf") or {}
    goods = data.get("dlt_dspslGdsDspslObjctLst") or []
    dxdy = data.get("dlt_rletCsGdsDtsDxdyInf") or []
    lists = data.get("dlt_rletCsDspslObjctLst") or []
    dstrt = data.get("dlt_dstrtDemnLstprdDts") or []

    schedules: dict[str, list] = {}
    for r in dxdy:
        seq = str(r.get("dspslGdsSeq") or "1")
        schedules.setdefault(seq, []).append({
            "date": r.get("dxdyYmd") or "",
            "kind": DXDY_KND.get(r.get("auctnDxdyKndCd"), r.get("auctnDxdyKndCd") or ""),
            "place": r.get("dxdyPlcNm") or "",
            "result": DXDY_RSLT.get(r.get("auctnDxdyRsltCd"), ""),
            "time": r.get("dxdyHm") or "",
        })
    for rows in schedules.values():
        rows.sort(key=lambda x: x["date"])

    item_status, spec_ids, remarks = {}, {}, []
    for g in goods:
        seq = str(g.get("dspslGdsSeq") or "1")
        item_status[seq] = GDS_STAT.get(g.get("auctnGdsStatCd"), g.get("auctnGdsStatCd") or "")
        if g.get("dspslGdsSpcfcEcdocId"):
            spec_ids[seq] = g["dspslGdsSpcfcEcdocId"]
        if g.get("dspslGdsRmk") and g["dspslGdsRmk"] not in remarks:
            remarks.append(g["dspslGdsRmk"])

    deadlines = sorted({r.get("dstrtDemnLstprdYmd") for r in dstrt if r.get("dstrtDemnLstprdYmd")})
    rec = {
        "_key": base.get("userCsNo") or case_no,
        "caseNo": base.get("userCsNo") or case_no,
        "caseName": base.get("csNm") or "",
        "court": base.get("cortOfcNm") or "",
        "courtDept": base.get("cortAuctnJdbnNm") or "",
        "courtTel": base.get("jdbnTelno") or "",
        "execTel": base.get("execrCsTelno") or "",
        "receiptDate": base.get("csRcptYmd") or "",
        "commenceDate": base.get("csCmdcYmd") or "",
        "claimAmount": to_int(base.get("clmAmt")),
        "dividendDeadline": deadlines[0] if deadlines else "",
        "depositRate": to_int(first(goods, "prchDposRate")),
        "schedules": schedules,
        "itemStatus": item_status,
        "specSheetIds": spec_ids,
        "lists": [{
            "seq": r.get("dspslObjctSeq"),
            "kind": LST_DVS.get(r.get("auctnLstDvsCd"), r.get("auctnLstNm") or ""),
            "address": (r.get("userSt") or "").strip(),
            "closing": r.get("ultmtNm") or "",
        } for r in lists],
        "note": ", ".join(remarks),
        "collectedAt": now_iso(),
    }
    if len(goods) == 1 and goods[0].get("auctnGdsUsgCd"):
        rec["objectKind"] = GDS_USG.get(goods[0]["auctnGdsUsgCd"], "")
    return rec


# ── 사진 ──────────────────────────────────────────────────────────────────────
def save_photos(case_pics, court: str, case_no: str, limit: int, max_kb: int) -> list[dict]:
    """csPicLst 의 base64(picFile) 를 파일로 저장하고 경로만 남긴다."""
    if not case_pics:
        return []
    os.makedirs(PHOTO_DIR, exist_ok=True)
    out = []
    safe_case = re.sub(r"[^0-9A-Za-z가-힣타경]", "", case_no)
    for i, p in enumerate(case_pics[:limit], start=1):
        raw = p.get("picFile") or p.get("picFileUrl") or ""
        if not raw or len(raw) < 200:
            continue
        try:
            blob = base64.b64decode(raw, validate=False)
        except Exception:  # noqa: BLE001 — 깨진 사진 한 장이 수집 전체를 멈추지 않게
            continue
        if len(blob) > max_kb * 1024:
            continue
        ext = ".jpg" if blob[:2] == b"\xff\xd8" else ".png" if blob[:8] == b"\x89PNG\r\n\x1a\n" else ".jpg"
        name = f"{court}-{safe_case}-{i:02d}{ext}"
        with open(os.path.join(PHOTO_DIR, name), "wb") as f:
            f.write(blob)
        out.append({
            "url": f"/data/auction-photos/{name}",
            "caption": PIC_DVS.get(s(p.get("cortAuctnPicDvsCd")), "") or s(p.get("picTitlNm")),
            "kind": s(p.get("cortAuctnPicDvsCd")),
        })
    return out


# ── 파일 경로 ─────────────────────────────────────────────────────────────────
def detail_path(court: str, case_no: str, seq: str) -> str:
    return os.path.join(DETAIL_DIR, f"{court}-{case_no}-{seq}.json")


def survey_path(court: str, case_no: str) -> str:
    return os.path.join(SURVEY_DIR, f"{court}-{case_no}.json")


def item_index() -> dict[tuple[str, str], dict[str, str]]:
    """(법원코드, 사건번호) → {물건번호: 물건 id} — byId·byCase 키를 auctions.json 과 맞춘다."""
    idx: dict[tuple[str, str], dict[str, str]] = {}
    if not os.path.exists(AUCTIONS):
        return idx
    data = json.load(open(AUCTIONS, encoding="utf-8"))
    for items in (data.get("byZone") or {}).values():
        for it in items:
            idx.setdefault((it["courtCode"], it["caseNo"]), {})[str(it["itemNo"])] = it["id"]
    return idx


def cases_from_auctions() -> list[dict]:
    data = json.load(open(AUCTIONS, encoding="utf-8"))
    seen: dict[tuple[str, str], dict] = {}
    for items in (data.get("byZone") or {}).values():
        for it in items:
            key = (it["courtCode"], it["caseNo"])
            rec = seen.setdefault(key, {
                "court": it["courtCode"], "caseNo": it["caseNo"],
                "caseNoPrint": it["caseNoPrint"], "zoneName": it.get("zoneName", ""),
                "items": set(),
            })
            rec["items"].add(str(it["itemNo"]))
    return list(seen.values())


# ── 수집 ──────────────────────────────────────────────────────────────────────
def collect(cases: list[dict], delay: float, limit: int | None,
            with_survey: bool, with_spec: bool, photos: int, max_kb: int) -> None:
    os.makedirs(DETAIL_DIR, exist_ok=True)
    os.makedirs(SURVEY_DIR, exist_ok=True)
    open_session()
    time.sleep(max(2.0, delay / 2))
    detail_counts: dict[tuple[str, str], int] = {}
    done = 0
    for c in cases:
        if limit is not None and done >= limit:
            break
        court, case_no = c["court"], c["caseNo"]
        for seq in sorted(c["items"], key=lambda x: (len(x), x)):
            path = detail_path(court, case_no, seq)
            if os.path.exists(path):
                continue
            res = fetch_detail(court, case_no, seq)
            if looks_blocked(res):
                log_block("detail", court, case_no, res)
                print(f"  ⛔ {c['caseNoPrint']} 물건{seq} — 차단 감지, 중단: {res.get('message')}")
                rebuild()
                return
            if not ((res.get("data") or {}).get("dma_result")):
                msg = res.get("message") or (res.get("errors") or {}).get("errorMessage") or res.get("_raw")
                print(f"  ⚠ {c['caseNoPrint']} 물건{seq} — 상세 응답 없음: {str(msg)[:120]}")
                time.sleep(delay)
                continue
            json.dump(res, open(path, "w", encoding="utf-8"), ensure_ascii=False)
            # 사진은 사건 단위 목록에서 뽑는다(같은 사건이면 이미 저장돼 있으면 건너뛴다)
            pics = (res.get("data") or {}).get("dma_result", {}).get("csPicLst") or []
            if pics and not any(f.startswith(f"{court}-") for f in (os.listdir(PHOTO_DIR) if os.path.isdir(PHOTO_DIR) else [])):
                save_photos(pics, court, case_no, photos, max_kb)
            detail_counts[(court, case_no)] = detail_counts.get((court, case_no), 0) + 1
            print(f"  · 물건상세 {c['caseNoPrint']} 물건{seq} ({c['zoneName']})")
            time.sleep(delay)
        # 현황조사서 — 사건당 한 번
        if with_survey and detail_counts.get((court, case_no)):
            sp = survey_path(court, case_no)
            if os.path.exists(sp):
                done += 1
                continue
            res = fetch_survey(court, case_no)
            if looks_blocked(res):
                log_block("survey", court, case_no, res)
                print(f"  ⛔ {c['caseNoPrint']} 현황조사서 — 차단 감지, 중단: {res.get('message')}")
                rebuild()
                return
            if not (res.get("data") or {}).get("dma_curstExmnMngInf"):
                print(f"  ⚠ {c['caseNoPrint']} 현황조사서 없음(공개 전이거나 미작성)")
            else:
                json.dump(res, open(sp, "w", encoding="utf-8"), ensure_ascii=False)
                print(f"  · 현황조사서 {c['caseNoPrint']}")
            time.sleep(delay)
        if with_spec:
            try_spec_links(court, case_no)
            time.sleep(delay)
        done += 1
    print(f"수집 사건 {done} · 물건상세 raw {count_files(DETAIL_DIR)} · 현황조사서 raw {count_files(SURVEY_DIR)}")
    rebuild()


def try_spec_links(court: str, case_no: str) -> None:
    """raw 에서 orvParam·문서ID를 찾아 명세서 뷰어 주소를 시도한다(실패는 정상)."""
    got = 0
    for f in sorted(os.listdir(DETAIL_DIR)):
        if not f.startswith(f"{court}-{case_no}-"):
            continue
        try:
            res = json.load(open(os.path.join(DETAIL_DIR, f), encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        gds = ((res.get("data") or {}).get("dma_result") or {}).get("dspslGdsDxdyInfo") or {}
        seq = s(gds.get("dspslGdsSeq")) or f.rsplit("-", 1)[-1].replace(".json", "")
        link = fetch_spec_link(court, case_no, seq, s(gds.get("orvParam")), s(gds.get("dspslGdsSpcfcEcdocId")))
        if not link:
            continue
        path = os.path.join(DETAIL_DIR, f"{court}-{case_no}-{seq}-spec.json")
        json.dump(link, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        got += 1
    if got:
        print(f"  · 매각물건명세서 뷰어 주소 {got}건")


def count_files(d: str) -> int:
    return len([f for f in os.listdir(d) if f.endswith(".json")]) if os.path.isdir(d) else 0


# ── 재생성 ────────────────────────────────────────────────────────────────────
def merge_case(dst: dict, src: dict) -> None:
    """사건 공통 레코드 병합 — dict 형 필드는 키 단위로 합치고, 값은 먼저 온 것을 지킨다."""
    for k, v in src.items():
        if v in (None, "", [], {}):
            continue
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            for kk, vv in v.items():
                dst[k].setdefault(kk, vv)
        else:
            dst.setdefault(k, v)
    # 스칼라는 나중 값이 더 최신일 수 있으므로 비어 있으면 채운다
    for k in ("courtTel", "execTel", "courtDept", "note", "objectKind", "depositRate"):
        if not dst.get(k) and src.get(k):
            dst[k] = src[k]


def rebuild() -> dict:
    """raw(물건상세·현황조사서·사건검색) + manual-details.json → auction-details.json"""
    idx = item_index()
    by_case: dict[str, dict] = {}
    by_id: dict[str, dict] = {}
    errors: list[str] = []

    def case_key(court: str, case_no: str) -> str:
        return f"{court}|{case_no}"

    # ① 물건상세 raw
    for f in sorted(os.listdir(DETAIL_DIR)) if os.path.isdir(DETAIL_DIR) else []:
        if not f.endswith(".json") or f.endswith("-spec.json"):
            continue
        try:
            court, rest = f.split("-", 1)
            case_no, seq = rest.rsplit("-", 1)
            seq = seq.replace(".json", "")
            res = json.load(open(os.path.join(DETAIL_DIR, f), encoding="utf-8"))
            case, item = parse_detail(res, court, case_no, seq)
        except Exception as e:  # noqa: BLE001 — 한 파일이 깨져도 나머지는 살린다
            errors.append(f"{f}: {e}")
            continue
        if not case.get("caseNo"):
            errors.append(f"{f}: 사건기본정보 없음")
            continue
        key = case_key(court, case.pop("_key", "") or case_no)
        by_case.setdefault(key, {})
        merge_case(by_case[key], case)
        item_id = (idx.get((court, case_no)) or {}).get(str(seq))
        if item_id:
            by_id[item_id] = {**(by_id.get(item_id) or {}), **item}
        # 명세서 뷰어 주소
        spec_file = os.path.join(DETAIL_DIR, f"{court}-{case_no}-{seq}-spec.json")
        if os.path.exists(spec_file):
            try:
                link = json.load(open(spec_file, encoding="utf-8"))
                target = by_id[item_id] if item_id and item_id in by_id else by_case[key]
                spec = target.setdefault("specification", {})
                spec["viewerUrl"] = link.get("viewerUrl")
                spec["collectedAt"] = link.get("collectedAt")
            except json.JSONDecodeError:
                pass

    # ② 현황조사서 raw
    for f in sorted(os.listdir(SURVEY_DIR)) if os.path.isdir(SURVEY_DIR) else []:
        if not f.endswith(".json"):
            continue
        try:
            court, case_part = f[:-5].split("-", 1)
            res = json.load(open(os.path.join(SURVEY_DIR, f), encoding="utf-8"))
            survey = parse_survey(res)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{f}: {e}")
            continue
        rec = by_case.setdefault(case_key(court, case_part), {})
        if survey["tenants"]:
            rec["tenants"] = survey["tenants"]
        if survey["occupancy"]:
            rec["occupancy"] = survey["occupancy"]

    # ③ 사건검색 raw(기존 경로) — 새로 모은 값이 없는 필드만 채운다
    for f in sorted(os.listdir(RAW_DIR)) if os.path.isdir(RAW_DIR) else []:
        if not f.endswith(".json"):
            continue
        try:
            court, case_part = f[:-5].split("-", 1)
            res = json.load(open(os.path.join(RAW_DIR, f), encoding="utf-8"))
            rec = parse_case_search(res, court, case_part)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{f}: {e}")
            continue
        if not rec.get("caseNo"):
            errors.append(f"{f}: 사건기본정보 없음")
            continue
        dst = by_case.setdefault(case_key(court, rec.pop("_key", "") or case_part), {})
        merge_case(dst, rec)

    # ④ 화면에서 직접 확인한 레코드(자동 수집이 막혔을 때) — raw 가 우선
    if os.path.exists(MANUAL):
        try:
            manual = json.load(open(MANUAL, encoding="utf-8"))
            for key, rec in (manual.get("byCase") or {}).items():
                by_case.setdefault(key, {})
                merge_case(by_case[key], rec)
            for iid, rec in (manual.get("byId") or {}).items():
                by_id[iid] = {**rec, **(by_id.get(iid) or {})}
        except json.JSONDecodeError as e:
            errors.append(f"manual-details.json: {e}")

    item_count = sum(len(v.get("lists") or []) for v in by_case.values())
    prev_blocked = None
    if os.path.exists(OUT):
        try:
            prev_blocked = (json.load(open(OUT, encoding="utf-8")).get("meta") or {}).get("blocked")
        except json.JSONDecodeError:
            pass
    payload = {
        "meta": {
            "source": "대법원 법원경매정보(courtauction.go.kr) 물건상세·현황조사서 — scripts/fetch-auction-details.py",
            "collectedAt": now_iso(),
            "caseCount": len(by_case),
            "itemCount": item_count,
            "note": ("물건상세(PGJ15BM01: 기일이력·물건상태·목적물 면적/대지권·감정평가요항표·사진)와 "
                     "현황조사서(PGJ15BP01: 임차인·점유관계)를 사건 단위 레코드로 담습니다. 매각물건명세서는 "
                     "PDF 문서라 본문을 담지 않고 문서 ID·뷰어 주소만 둡니다."),
            # 자동 수집이 한 건도 없으면 '왜 비어 있는지'를 남긴다(화면 안내문에 쓰인다)
            "blocked": None if count_files(DETAIL_DIR) else (
                prev_blocked or
                "아직 대법원 물건상세를 자동 수집하지 못했습니다. 서버 IP가 차단되면 국내 PC에서 "
                "scripts/fetch-auction-details.py 를 실행해 채웁니다."
            ),
        },
        "byCase": by_case,
        "byId": by_id,
    }
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"사건 {len(by_case)} · 물건 {len(by_id)} · 목록 {item_count} → {OUT}")
    if errors:
        print("⚠ 건너뛴 파일:", *errors[:10], sep="\n  ")
    return payload


def status() -> None:
    print(f"물건상세 raw {count_files(DETAIL_DIR)} · 현황조사서 raw {count_files(SURVEY_DIR)} · "
          f"사건검색 raw {count_files(RAW_DIR)} · 사진 {count_files(PHOTO_DIR) if os.path.isdir(PHOTO_DIR) else 0}")
    if os.path.exists(BLOCK_LOG):
        try:
            print("차단 기록(최근 3):", json.load(open(BLOCK_LOG, encoding="utf-8"))[-3:])
        except json.JSONDecodeError:
            pass


def probe(spec: str) -> None:
    parts = spec.split(":")
    if len(parts) < 2:
        raise SystemExit("--probe 법원코드:사건번호[:물건번호]  예: B000210:2024타경1997:1")
    court, case_no = parts[0], parts[1]
    seq = parts[2] if len(parts) > 2 else "1"
    open_session()
    time.sleep(3)
    res = fetch_detail(court, case_no, seq)
    if looks_blocked(res):
        log_block("probe", court, case_no, res)
        print("⛔ 차단:", res.get("message"))
        return
    if not (res.get("data") or {}).get("dma_result"):
        msg = res.get("message") or (res.get("errors") or {}).get("errorMessage") or res.get("_raw")
        print("⚠ 물건상세가 없는 응답입니다 —", str(msg)[:200])
        return
    case, item = parse_detail(res, court, case_no, seq)
    print(json.dumps({"case": case, "item": item}, ensure_ascii=False, indent=1)[:6000])
    time.sleep(3)
    sv = fetch_survey(court, case_no)
    if looks_blocked(sv):
        log_block("probe-survey", court, case_no, sv)
        print("⛔ 현황조사서 차단:", sv.get("message"))
        return
    print("현황조사서:", json.dumps(parse_survey(sv), ensure_ascii=False, indent=1)[:2000])


# ── self-test ─────────────────────────────────────────────────────────────────
def self_test() -> None:
    """HTTP 없이 파싱만 검사한다.

    · 사건검색은 **실제 응답** fixture(2024타경1072)로, 물건상세·현황조사서는 필드 이름만 담은
      **구조 fixture**(실사건 값 아님, 파일 안 `_note` 참고)로 검사한다.
    """
    # ① 사건검색(기존 경로)
    res = json.load(open(FIXTURE_SEARCH, encoding="utf-8"))
    rec = parse_case_search(res, "B000210", "2024타경1072")
    for k, v in {
        "caseNo": "2024타경1072", "court": "서울중앙지방법원", "courtDept": "경매12계",
        "claimAmount": 120131932, "dividendDeadline": "20240722",
        "receiptDate": "20240227", "depositRate": 10,
    }.items():
        if rec.get(k) != v:
            raise SystemExit(f"✗ 사건검색 {k}: {rec.get(k)!r} != {v!r}")
    if rec["itemStatus"].get("1") != "유찰":
        raise SystemExit(f"✗ 사건검색 물건상태: {rec['itemStatus']}")
    if len(rec.get("lists") or []) != 6:
        raise SystemExit(f"✗ 사건검색 목록 {len(rec.get('lists') or [])}건 — 6건이어야 합니다")

    # ② 물건상세(구조 fixture)
    res = json.load(open(FIXTURE_DETAIL, encoding="utf-8"))
    case, item = parse_detail(res, "B000210", "2020타경123456", "1")
    sch = case["schedules"].get("1") or []
    checks = [
        (case["caseNo"] == "2020타경123456", f"사건번호 {case['caseNo']}"),
        (case["courtDept"] == "경매1계", f"담당계 {case['courtDept']}"),
        (case["claimAmount"] == 300000000, f"청구금액 {case['claimAmount']}"),
        (sch[0]["result"] == "유찰" and sch[0]["kind"] == "매각기일", f"기일 {sch[0]}"),
        (sch[0]["minimum"] == 400000000, f"기일 최저가 {sch[0]['minimum']}"),
        (case["itemStatus"].get("1") == "매각공고", f"물건상태 {case['itemStatus']}"),
        (item["area"]["exclusiveSqm"] == 59.92, f"전유면적 {item['area']}"),
        (item["area"]["landSqm"] == 24.71, f"대지권 {item['area']}"),
        (len(item["appraisalSummary"]) == 2, f"감정요항 {len(item['appraisalSummary'])}건"),
        (item["appraisalSummary"][0]["text"].startswith("대상물건은"), "감정요항 본문"),
    ]
    for ok, label in checks:
        if not ok:
            raise SystemExit(f"✗ 물건상세 {label}")

    # ③ 현황조사서(구조 fixture)
    res = json.load(open(FIXTURE_SURVEY, encoding="utf-8"))
    sv = parse_survey(res)
    if len(sv["tenants"]) != 1:
        raise SystemExit(f"✗ 현황조사서 임차인 {len(sv['tenants'])}명")
    t = sv["tenants"][0]
    for k, v in {"name": "홍OO", "deposit": "50,000,000원", "movedIn": "2021.03.02",
                 "fixedDate": "2021.03.05", "part": "1층 전부"}.items():
        if t.get(k) != v:
            raise SystemExit(f"✗ 현황조사서 {k}: {t.get(k)!r} != {v!r}")
    occ = sv["occupancy"] or {}
    if occ.get("relation") != "임차인(별지)점유":
        raise SystemExit(f"✗ 점유관계 {occ.get('relation')!r}")
    if not occ.get("examinedAt", "").startswith("2024년"):
        raise SystemExit(f"✗ 조사일시 {occ.get('examinedAt')!r}")

    # ④ 코드표 변환
    if POSS_RLTN.get("09") != "미상":
        raise SystemExit("✗ 점유관계 코드표")
    print("✓ self-test OK — 사건검색·물건상세·현황조사서 파싱, 면적/감정요항/임차인/점유관계 확인")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=20.0, help="요청 간 대기(초). 기본 20")
    ap.add_argument("--limit", type=int, default=None, help="이번 실행에서 새로 받을 사건 수")
    ap.add_argument("--probe", default="", help="법원코드:사건번호[:물건번호] 한 건만 조회해 요약 출력")
    ap.add_argument("--rebuild", action="store_true", help="raw 전체로 auction-details.json 재생성")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--self-test", action="store_true", help="번들 fixture 로 파싱만 검사(HTTP 없음)")
    ap.add_argument("--no-survey", action="store_true", help="현황조사서는 받지 않는다")
    ap.add_argument("--spec-link", action="store_true", help="매각물건명세서 뷰어 주소까지 시도")
    ap.add_argument("--photos", type=int, default=8, help="사건당 저장할 사진 수(기본 8)")
    ap.add_argument("--max-photo-kb", type=int, default=600, help="사진 한 장 상한(KB)")
    args = ap.parse_args()

    if args.status:
        status()
        return
    if args.self_test:
        self_test()
        return
    if args.rebuild:
        rebuild()
        return
    if args.probe:
        probe(args.probe)
        return
    cases = cases_from_auctions()
    print(f"대상 사건 {len(cases)}개 (물건 {sum(len(c['items']) for c in cases)}개)")
    collect(cases, args.delay, args.limit, not args.no_survey, args.spec_link, args.photos, args.max_photo_kb)


if __name__ == "__main__":
    main()
