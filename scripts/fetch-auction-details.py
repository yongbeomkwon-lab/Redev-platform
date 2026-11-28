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
import io
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
PDF_DETAIL_DIR = os.path.join(DATA_DIR, "pdf-records", "detail")   # 브라우저 인쇄본(PDF) 물건상세
PDF_SURVEY_DIR = os.path.join(DATA_DIR, "pdf-records", "survey")   # 브라우저 인쇄본(PDF) 현황조사서
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
# ── 개인정보 마스킹 ────────────────────────────────────────────────────────────
# 현황조사서·감정평가서에는 임차인·채무자(소유자) 실명이 그대로 적혀 오는 경우가 있다.
# 이 파일로 만든 auction-details.json 은 그대로 웹에 배포되므로, 정규화 단계에서 이름을 가린다.
# 화면(src/lib/mask-name.ts)도 같은 규칙으로 한 번 더 가리므로 규칙을 바꾸면 양쪽을 함께 고친다.
#   · 한글 2자 → 김O · 한글 3자 이상 → 김O희(남궁민수 → 남OO수)
#   · 영문 → Z*** A* · 괄호 표기(ZHENG AI(정애)) → Z*** A*(정O)
#   · 법인·상호((주)기업건설·주식회사·㈜)는 개인정보가 아니므로 원문 유지
CORPORATE_RE = re.compile(r"(\(주\)|㈜|주식회사|유한회사|합자회사|합명회사|유한책임회사|재단법인|사단법인|법인)")
ROLE_WORDS = ("채무자", "소유자", "공유자", "임차인", "세대주", "배우자", "동거인",
              "학원장", "팀장", "이해관계인", "대표", "명의자", "임차권자", "임대인")
NOT_NAMES = {
    "지분", "란에", "등재", "명의", "점유", "관계", "소유", "기재", "표시", "경우", "당시",
    "세대", "주택", "건물", "부동산", "토지", "대지", "매각", "경매", "현황", "조사", "본건",
    "이건", "기타", "제시", "일부", "전부", "해당", "직원", "안내", "동거", "배우", "가족",
    "세대주", "내용", "사항", "주소", "호수", "면적", "번호", "사람",
}
NOT_SHARE = {
    "매각", "공유", "채무", "소유", "임차", "매수", "매도", "전체", "일부", "해당", "본건",
    "기타", "제시", "토지", "대지", "건물", "지분", "잔여", "나머지", "위", "채무자", "소유자",
    "공유자", "임차인", "매수인", "매도인", "각자", "등",
}
_MASKED_KOR = re.compile(r"^[가-힣]O+$|^[가-힣]O+[가-힣]$")


def mask_person_name(raw) -> str:
    """사람 이름 하나를 가린다. 법인·상호는 원문 그대로.

    다만 `(주)에이에스피웨딩 한승윤` 처럼 상호 뒤에 사람 이름이 따로 붙은 표기는
    상호는 남기고 뒤 이름만 가린다(성씨로 이름인지 판단).
    """
    name = (raw or "").strip()
    if not name:
        return ""
    if CORPORATE_RE.search(name):
        parts = name.split()
        if len(parts) >= 2 and 2 <= len(parts[-1]) <= 4 and parts[-1][0] in _SURNAMES \
                and parts[-1] not in NOT_NAMES:
            return " ".join(parts[:-1] + [_mask_token(parts[-1])])
        return name
    paren = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", name)
    if paren and paren.group(1).strip():
        return f"{mask_person_name(paren.group(1))}({mask_person_name(paren.group(2))})"
    return " ".join(_mask_token(t) for t in re.split(r"\s+", name))


def _mask_token(token: str) -> str:
    core = re.sub(r"[.,·]+$", "", token)
    tail = token[len(core):]
    if not core:
        return token
    if re.fullmatch(r"[가-힣]+", core):            # 한글 이름
        n = len(core)
        if n < 2:
            return token
        if n == 2:
            return core[0] + "O" + tail
        return core[0] + "O" * (n - 2) + core[-1] + tail
    if _MASKED_KOR.match(core):                    # 이미 가린 표기(김O희·김O)
        return token
    if re.fullmatch(r"[A-Za-z]+", core):           # 영문 이름
        if len(core) < 2:
            return token
        return core[0] + ("*" if len(core) == 2 else "***") + tail
    return token


def is_masked_name(name: str) -> bool:
    core = re.sub(r"[.,·]+$", "", (name or "").strip())
    if not core:
        return True
    return bool(_MASKED_KOR.match(core) or "*" in core)


_ROLE_RE = re.compile(
    r"(?P<lead>^|[^가-힣])(?P<kw>(?:" + "|".join(ROLE_WORDS) + r")"
    r"(?:\s*겸\s*(?:" + "|".join(ROLE_WORDS) + r"))?\s+)"
    r"(?P<name>[가-힣]{2,4}?)"
    r"(?=\s*(?:의|를|가|은|는|이(?:라는|며|고|\s)|으로|으로부터|로부터|라고|와|과|[,.()]|$))"
)
_LISTED_RE = re.compile(r"(기재된|등재된|기재한|등재한)(\s+)([가-힣]{2,4}?)"
                        r"(?=\s*(?:의|은|는|이|를|가|[,.()]|$))")
_SHARE_RE = re.compile(r"(?P<lead>^|[^가-힣])(?P<name>[가-힣]{2,4})(?P<gap>\s*)지분")
# `임차권자 : 홍길동` 처럼 콜론으로 라벨 뒤에 붙는 이름
_LABEL_RE = re.compile(r"(?:임차권자|임차인|채무자|소유자|공유자)\s*[:：]\s*([가-힣]{2,4})"
                       r"(?=\s|$|[,.)])")
# `임차인 김O원의 부 이몽룡` 처럼 가족 관계어 뒤에 붙는 이름
_FAMILY_RE = re.compile(r"(?:^|[^가-힣])(?:부|모|배우자|자녀|아들|딸)\s+([가-힣]{2,4}?)"
                        r"(?=[을를이가은는의도만\s,.)]|$)")


# `조영진(채무자 겸 소유자)` · `조정희(신O식의 배우자)` 처럼 이름 뒤 괄호 안에 역할이 오는 형태
_PAREN_ROLE_RE = re.compile(
    r"(?<![가-힣])([가-힣]{2,4})\s*\([^()]{0,20}?(?:^|[\s(])"
    r"(?:채무자|소유자|공유자|임차인|배우자|세대주|동거인|대표자|명의자)[^()]{0,10}\)")
# `대표자 홍길동` — 대표자가 붙은 이름
_REP_RE = re.compile(r"대표자\s+([가-힣]{2,4})(?=[\s,.)]|$)")


# 역할어 뒤 이름 — 조사·공백이 붙는 넓은 형태(성씨로 거른다)
_ROLE_ALT = r"(?:채무자|소유자|공유자|임차인|세대주|배우자|동거인|이해관계인|대표자?|명의자|임차권자|임대인)"
_ROLE_LOOSE_RE = re.compile(
    _ROLE_ALT +
    # `채무자 겸 소유자 홍길동` · `채무자(소유자) 홍길동` · `채무자 겸 소유자(공유자) 홍길동`
    r"(?:\s*겸\s*" + _ROLE_ALT + r"|\s*\(\s*" + _ROLE_ALT + r"\s*\))*" +
    r"\s+([가-힣]{2,4}?)" +
    r"(?=[을를은는이가의에와과로도만\s,.)]|$)")

# `임차인(양형주)` · `임대인은 한광수이고` · `고O숙 및 최O석 등`
_PAREN_NAME_RE = re.compile(
    r"(?:채무자|소유자|공유자|임차인|배우자|세대주|임대인|임차권자|대표자?)\s*\(([가-힣]{2,4})\)")
_ROLE_PART_RE = re.compile(
    r"(?:채 무자|채무자|소유자|공유자|임차인|임대인|임차권자|세대주)(?:은|는|이|가)\s+([가-힣]{2,4}?)"
    r"(?=[이가을를은는의에와과로도만\s,.)]|$)")
_AND_NAME_RE = re.compile(
    r"(?:및|와|과)\s+([가-힣]{2,4}?)(?=\s*(?:등|을|를|은|는|이|가|의|,|\.|\s)|$)")

# `조창자 소유` · `김연수 소유` — 이름 뒤에 소유가 붙는 형태(소유자 실명)
_OWN_RE = re.compile(r"(?<![가-힣])([가-힣]{2,4})\s+소유(?:한|하|하고|되고|된|되지|권)?(?![가-힣])")
# 성씨 — 완화된 규칙이 지명·일반명사를 이름으로 오인하지 않도록 거른다
_SURNAMES = set(
    "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부가복태목형계피두감음빈동온호범좌팽승간상시갈단견당화창옹기남준만전좌제어피"
)


def _strip_particle(token: str) -> str:
    """`홍영자가` 처럼 뒤에 조사가 붙은 이름에서 조사를 뗀다."""
    for suf in ("이가", "가는", "는", "가", "를", "을", "와", "과", "의", "이", "도", "만", "에"):
        if len(token) > len(suf) + 1 and token.endswith(suf):
            return token[: -len(suf)]
    return token


_ROLE_TOKENS = {"채무자", "소유자", "공유자", "임차인", "임대인", "임차권자", "세대주",
                "배우자", "동거인", "이해관계인", "대표자", "명의자", "점유자"}


def _looks_like_name(token: str) -> bool:
    return (2 <= len(token) <= 4 and token not in NOT_NAMES and token not in _ROLE_TOKENS
            and token[0] in _SURNAMES)


def mask_names_in_text(text, names=()) -> str:
    """점유관계·현황조사서 본문 같은 자유 문장 안의 사람 이름을 가린다.

    ① 역할어(채무자 겸 소유자 …)·`기재된`·`지분` 문맥으로 이름 후보를 모으고
    ② 그 이름이 나오는 자리를 **원문에서 한 번에** 찾아 가린다(한 번 가린 글자를 다시 훑지 않는다).
    """
    src = text or ""
    if not src:
        return src
    found = set()
    for m in _ROLE_RE.finditer(src):
        name = _strip_particle(m.group("name"))
        if _looks_like_name(name):
            found.add(name)
    for m in _LISTED_RE.finditer(src):
        if m.group(3) not in NOT_NAMES:
            found.add(m.group(3))
    for m in _SHARE_RE.finditer(src):
        if m.group("name") not in NOT_SHARE:
            found.add(m.group("name"))
    for m in _LABEL_RE.finditer(src):
        if m.group(1) not in NOT_NAMES:
            found.add(m.group(1))
    for m in _FAMILY_RE.finditer(src):
        if m.group(1) not in NOT_NAMES:
            found.add(m.group(1))
    for m in _PAREN_ROLE_RE.finditer(src):
        if m.group(1) not in NOT_NAMES:
            found.add(m.group(1))
    for m in _REP_RE.finditer(src):
        if m.group(1) not in NOT_NAMES:
            found.add(m.group(1))
    for m in _OWN_RE.finditer(src):
        name = _strip_particle(m.group(1))
        if _looks_like_name(name):
            found.add(name)
    for m in _ROLE_LOOSE_RE.finditer(src):
        name = _strip_particle(m.group(1))
        if _looks_like_name(name):
            found.add(name)
    for m in _PAREN_NAME_RE.finditer(src):
        name = _strip_particle(m.group(1))
        if _looks_like_name(name):
            found.add(name)
    for m in _ROLE_PART_RE.finditer(src):
        name = _strip_particle(m.group(1))
        if _looks_like_name(name):
            found.add(name)
    for m in _AND_NAME_RE.finditer(src):
        name = _strip_particle(m.group(1))
        if _looks_like_name(name):
            found.add(name)
    for raw in names:
        n = (raw or "").strip()
        if len(n) >= 2 and not CORPORATE_RE.search(n) and not is_masked_name(n):
            found.add(n)
    marks = []
    for name in sorted(found, key=len, reverse=True):
        for m in re.finditer(r"(?<![가-힣])" + re.escape(name), src):
            marks.append((m.start(), m.start() + len(name), mask_person_name(name)))
    marks.sort(key=lambda x: (-x[0], -x[1]))
    out = src
    left = len(src) + 1
    for start, end, rep in marks:
        if end > left:      # 이미 가린 자리와 겹친다
            continue
        out = out[:start] + rep + out[end:]
        left = start
    return out


# 마스킹을 건너뛰는 키 — 이름이 들어갈 수 없는 식별자·날짜·주소 필드
_MASK_SKIP_KEYS = {
    "caseNo", "caseNoPrint", "court", "courtCode", "id", "url", "collectedAt",
    "date", "time", "receiptDate", "commenceDate", "dividendDeadline", "zoneName",
}


def _mask_deep(obj, names, depth: int = 0):
    """레코드 안의 모든 글자에 이름 마스킹을 적용한다(비고·감정·점유관계 등 필드를 가리지 않고)."""
    if depth > 8:
        return obj
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                if k in _MASK_SKIP_KEYS or not v:
                    continue
                obj[k] = mask_names_in_text(v, names)
            elif isinstance(v, (dict, list)):
                _mask_deep(v, names, depth + 1)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, str):
                obj[i] = mask_names_in_text(v, names)
            elif isinstance(v, (dict, list)):
                _mask_deep(v, names, depth + 1)
    return obj


def sanitize_record(rec: dict, extra_names=()) -> dict:
    """한 레코드(사건·물건) 안의 이름을 가린다 — 임차인 이름 + 모든 본문.

    extra_names: 수집 원본(현황조사서·물건상세)에서 확인한 사람 이름.
    본문에만 등장하고 임차인 목록에는 없는 이름(비고의 승계인·가족 등)을 잡는다.
    """
    tenants = rec.get("tenants") or []
    names = [t.get("name") for t in tenants if isinstance(t, dict) and t.get("name")]
    names.extend(extra_names or ())
    for t in tenants:
        if isinstance(t, dict) and t.get("name"):
            t["name"] = mask_person_name(t["name"])
    _mask_deep(rec, names)
    return rec


def sanitize_payload(payload: dict, names_by_case: dict | None = None) -> dict:
    """byCase·byId 전체에 마스킹을 적용한다(배포 직전 마지막 관문)."""
    names_by_case = names_by_case or {}
    for key, rec in (payload.get("byCase") or {}).items():
        sanitize_record(rec, names_by_case.get(key, ()))
    for rec in (payload.get("byId") or {}).values():
        sanitize_record(rec)
    return payload


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
def _photo_caption_map() -> dict:
    path = os.path.join(DATA_DIR, "photo-captions.json")
    if os.path.exists(path):
        try:
            return json.load(open(path, encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_caption(name: str, caption: str, kind: str) -> None:
    caps = _photo_caption_map()
    caps[name] = {"caption": caption, "kind": kind}
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "photo-captions.json"), "w", encoding="utf-8") as f:
        json.dump(caps, f, ensure_ascii=False)


def _shrink_jpeg(blob: bytes, max_kb: int) -> bytes | None:
    """상한을 넘는 사진은 PIL 이 있으면 줄이고, 없으면 None(저장 포기)."""
    if len(blob) <= max_kb * 1024:
        return blob
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(blob)).convert("RGB")
    except Exception:  # noqa: BLE001
        return None
    w, h = im.size
    scale = min(1.0, 900 / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    q = 78
    while q >= 45:
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= max_kb * 1024:
            return buf.getvalue()
        q -= 6
    return None


def save_photos(case_pics, court: str, case_no: str, limit: int, max_kb: int,
                seq: str = "1") -> list[dict]:
    """csPicLst 의 base64(picFile) 를 파일로 저장하고 경로만 남긴다.

    파일 이름: `<법원>-<사건번호>-<번호>.jpg` · 물건이 여러 개인 사건은 물건번호를 넣어
    `<법원>-<사건번호>-<물건번호>-<번호>.jpg` 로 저장해 서로 덮어쓰지 않게 한다.
    """
    if not case_pics:
        return []
    os.makedirs(PHOTO_DIR, exist_ok=True)
    out = []
    safe_case = re.sub(r"[^0-9A-Za-z가-힣타경]", "", case_no)
    head = f"{court}-{safe_case}-" + ("" if str(seq) == "1" else f"{seq}-")
    for i, p in enumerate(case_pics[:limit], start=1):
        raw = p.get("picFile") or p.get("picFileUrl") or ""
        if not raw or len(raw) < 200:
            continue
        try:
            blob = base64.b64decode(raw, validate=False)
        except Exception:  # noqa: BLE001 — 깨진 사진 한 장이 수집 전체를 멈추지 않게
            continue
        blob = _shrink_jpeg(blob, max_kb)
        if not blob:
            continue
        ext = ".jpg" if blob[:2] == b"\xff\xd8" else ".png" if blob[:8] == b"\x89PNG\r\n\x1a\n" else ".jpg"
        name = f"{head}{i:02d}{ext}"
        with open(os.path.join(PHOTO_DIR, name), "wb") as f:
            f.write(blob)
        caption = PIC_DVS.get(s(p.get("cortAuctnPicDvsCd")), "") or s(p.get("picTitlNm")) or f"현장사진 {i}"
        kind = s(p.get("cortAuctnPicDvsCd"))
        _save_caption(name, caption, kind)
        out.append({
            "url": f"/data/auction-photos/{name}",
            "caption": caption,
            "kind": kind,
        })
    return out


def photos_for(court: str, case_no: str, seq: str = "1") -> list[dict]:
    """디스크에 저장된 사진 파일로 물건의 사진 목록을 만든다(rebuild 용)."""
    if not os.path.isdir(PHOTO_DIR):
        return []
    safe_case = re.sub(r"[^0-9A-Za-z가-힣타경]", "", case_no)
    head = f"{court}-{safe_case}-"
    caps = _photo_caption_map()
    files = sorted(f for f in os.listdir(PHOTO_DIR) if f.startswith(head) and f.endswith((".jpg", ".png")))
    picked = []
    for f in files:
        rest = f[len(head):]
        parts = rest.rsplit(".", 1)[0].split("-")
        if len(parts) == 2 and parts[0] == str(seq):   # <물건번호>-<번호>
            picked.append(f)
    if not picked:                                      # 물건번호 없이 저장된 사진
        picked = [f for f in files if len(f[len(head):].rsplit(".", 1)[0].split("-")) == 1]
    out = []
    for f in picked:
        meta = caps.get(f) or {}
        out.append({
            "url": f"/data/auction-photos/{f}",
            "caption": meta.get("caption") or "현장사진",
            "kind": meta.get("kind", ""),
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
            # 사진은 사건·물건 단위로 저장한다(물건이 여러 개인 사건은 물건번호를 파일명에 넣는다)
            pics = (res.get("data") or {}).get("dma_result", {}).get("csPicLst") or []
            if pics:
                save_photos(pics, court, case_no, photos, max_kb, seq)
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


def raw_names_by_case() -> dict[str, list[str]]:
    """수집 원본의 이름 필드에서 사건별 사람 이름을 모은다 — 본문 마스킹의 재료.

    임차인 목록에는 없고 비고·점유관계·감정평가 본문에만 나오는 이름(승계인·가족 등)을 잡는다.
    """
    name_keys = {"intrpsNm", "hffcNm", "ownrNm", "lssrNm", "crtrNm", "nm", "name", "dbrNm"}
    out: dict[str, list[str]] = {}

    def walk(o, found: set):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str):
                    v = v.strip()
                    if k in name_keys and 2 <= len(v) <= 4 and re.fullmatch(r"[가-힣]+", v) \
                            and not is_masked_name(v) and not CORPORATE_RE.search(v):
                        found.add(v)
                else:
                    walk(v, found)
        elif isinstance(o, list):
            for v in o:
                walk(v, found)

    for folder, is_survey in ((SURVEY_DIR, True), (DETAIL_DIR, False)):
        if not os.path.isdir(folder):
            continue
        for f in os.listdir(folder):
            if not f.endswith(".json") or f.endswith("-spec.json"):
                continue
            try:
                court, rest = f[:-5].split("-", 1)
                case_no = rest if is_survey else rest.rsplit("-", 1)[0]
                found: set[str] = set()
                walk(json.load(open(os.path.join(folder, f), encoding="utf-8")), found)
            except Exception:  # noqa: BLE001
                continue
            if found:
                key = f"{court}|{case_no}"
                out.setdefault(key, [])
                out[key].extend(sorted(found - set(out[key])))
    return out


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
            pics = photos_for(court, case_no, seq)
            if pics:
                by_id[item_id]["photos"] = pics
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

    # ⑤ 브라우저 인쇄본 — 한국 IP 브라우저에서 화면을 인쇄한 PDF 를 파싱한 레코드
    #    (scripts/auction-pdf-ingest.py). raw 가 있으면 raw 를 지키고 빈 칸만 채운다.
    for f in sorted(os.listdir(PDF_DETAIL_DIR)) if os.path.isdir(PDF_DETAIL_DIR) else []:
        if not f.endswith(".json"):
            continue
        try:
            rec = json.load(open(os.path.join(PDF_DETAIL_DIR, f), encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"pdf/{f}: {e}")
            continue
        court, case_no, seq = s(rec.get("court")), s(rec.get("caseNo")), s(rec.get("seq")) or "1"
        if not court or not case_no:
            continue
        key = case_key(court, case_no)
        by_case.setdefault(key, {})
        merge_case(by_case[key], rec.get("case") or {})
        item = rec.get("item") or {}
        item_id = (idx.get((court, case_no)) or {}).get(seq)
        if item_id:
            by_id[item_id] = {**(by_id.get(item_id) or {}), **item}
            pics = photos_for(court, case_no, seq)
            if pics:
                by_id[item_id]["photos"] = pics

    for f in sorted(os.listdir(PDF_SURVEY_DIR)) if os.path.isdir(PDF_SURVEY_DIR) else []:
        if not f.endswith(".json"):
            continue
        try:
            rec = json.load(open(os.path.join(PDF_SURVEY_DIR, f), encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"pdf-survey/{f}: {e}")
            continue
        court, case_no = s(rec.get("court")), s(rec.get("caseNo"))
        if not court or not case_no:
            continue
        dst = by_case.setdefault(case_key(court, case_no), {})
        if rec.get("tenants"):
            dst.setdefault("tenants", rec["tenants"])
        if rec.get("occupancy"):
            dst.setdefault("occupancy", rec["occupancy"])
        if rec.get("caseName") and not dst.get("caseName"):
            dst["caseName"] = rec["caseName"]

    # ⑥ 화면에서 직접 확인한 레코드(자동 수집이 막혔을 때) — raw 가 우선
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
    # ⑦ 같은 사건의 다른 물건 줄에도 상세를 붙인다
    #   · 일괄매각처럼 물건번호가 겹치는 사건은 auctions.json 의 물건 id 두 줄이 인덱스에서
    #     하나로 접혀 한 줄만 상세를 받는다. 사건 상세·사진은 물건이 아니라 사건 단위이므로
    #     상세가 하나뿐인 사건은 나머지 줄에도 같은 레코드를 붙인다(빈 패널 방지).
    ids_by_case: dict[tuple[str, str], list[str]] = {}
    if os.path.exists(AUCTIONS):
        _a = json.load(open(AUCTIONS, encoding="utf-8"))
        for items in (_a.get("byZone") or {}).values():
            for it in items:
                ids_by_case.setdefault((it["courtCode"], it["caseNo"]), [])
                if it["id"] not in ids_by_case[(it["courtCode"], it["caseNo"])]:
                    ids_by_case[(it["courtCode"], it["caseNo"])].append(it["id"])
    for (court, case_no), ids in ids_by_case.items():
        if len(ids) < 2:
            continue
        # 물건번호가 겹쳐 인덱스에서 접힌 줄만 대상으로 한다(정상 사건은 seq 마다 다른 레코드)
        if len(ids) <= len(idx.get((court, case_no)) or {}):
            continue
        have = [i for i in ids if i in by_id]
        if len(have) != 1:
            continue
        src_rec = by_id[have[0]]
        for iid in ids:
            if iid in by_id:
                continue
            rec = json.loads(json.dumps(src_rec))
            if not rec.get("photos"):
                pics = photos_for(court, case_no, "1")
                if pics:
                    rec["photos"] = pics
            by_id[iid] = rec
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
            # 자동·브라우저 수집본이 한 건도 없으면 '왜 비어 있는지'를 남긴다(화면 안내문에 쓰인다)
            "blocked": None if (count_files(DETAIL_DIR) or (
                os.path.isdir(PDF_DETAIL_DIR) and any(f.endswith(".json") for f in os.listdir(PDF_DETAIL_DIR))
            )) else (
                prev_blocked or
                "아직 대법원 물건상세를 자동 수집하지 못했습니다. 서버 IP가 차단되면 국내 PC에서 "
                "scripts/fetch-auction-details.py 를 실행해 채웁니다."
            ),
        },
        "byCase": by_case,
        "byId": by_id,
    }
    sanitize_payload(payload, raw_names_by_case())   # 배포 파일에는 사람 이름을 남기지 않는다
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

    # ⑤ 개인정보 마스킹 — 화면(src/lib/mask-name.ts)과 같은 규칙이어야 한다
    mask_checks = [
        ("김영희", "김O희"), ("김철", "김O"), ("남궁민수", "남OO수"),
        ("ZHENG AI(정애)", "Z*** A*(정O)"), ("(주)기업건설", "(주)기업건설"),
        ("김O애", "김O애"), ("김O희", "김O희"),
    ]
    for raw_name, want in mask_checks:
        got = mask_person_name(raw_name)
        if got != want:
            raise SystemExit(f"✗ 마스킹 {raw_name!r}: {got!r} != {want!r}")
    text_checks = [
        ("채무자 겸 소유자 이철수의 배우자", "채무자 겸 소유자 이O수의 배우자"),
        ("기재된 이철수의 동거인", "기재된 이O수의 동거인"),
        ("이해관계인 폐문부재로", "이해관계인 폐문부재로"),
        ("다세대주택으로 이용중", "다세대주택으로 이용중"),
        ("공유자 지분 중 고근수 지분", "공유자 지분 중 고O수 지분"),
        ("임차인으로 보고함", "임차인으로 보고함"),
        ("조영진(채무자 겸 소유자) 세대", "조O진(채무자 겸 소유자) 세대"),
        ("조정희(신O식의 배우자)에 의하면", "조O희(신O식의 배우자)에 의하면"),
        ("(대표자 신동성)은", "(대표자 신O성)은"),
        ("임차인 김O원의 부 홍길동을 만나", "임차인 김O원의 부 홍O동을 만나"),
        ("임차권자 : 홍길동", "임차권자 : 홍O동"),
        ("건부지(다세대주택)로서", "건부지(다세대주택)로서"),
        ("조창자 소유, 김연수 소유 라고", "조O자 소유, 김O수 소유 라고"),
        ("홍영자가 소유한 것", "홍O자가 소유한 것"),
        ("같이 소유하고 있다", "같이 소유하고 있다"),
    ]
    for raw_text, want in text_checks:
        got = mask_names_in_text(raw_text)
        if got != want:
            raise SystemExit(f"✗ 본문 마스킹 {raw_text!r}: {got!r} != {want!r}")
    print("✓ self-test OK — 사건검색·물건상세·현황조사서 파싱, 면적/감정요항/임차인/점유관계, 개인정보 마스킹")


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
