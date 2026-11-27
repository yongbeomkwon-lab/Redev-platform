#!/usr/bin/env python3
"""경매 상세 수집 — **브라우저 인쇄(PDF)** 로 받은 대법원 화면을 정규화 레코드로 바꾼다.

왜 이 경로인가
  · 이 작업 서버(해외 IP)는 대법원 경매정보의 보안정책에 막혀 HTTP 수집이 안 된다(data.ipcheck=false).
  · 그래서 한국 IP 브라우저에서 **화면 그대로**를 열고, 화면의 `인쇄하기` 로 만든 PDF 를 받아
    텍스트·사진을 뽑는다. 요청을 흉내내지 않고 사람이 보는 화면을 그대로 쓰는 방식이다.
  · 물건상세 PDF 에는 기일내역(회차별 최저가·결과) · 목록내역(면적·대지권 원문) · 감정평가요항표 ·
    사건 사진이 모두 들어 있고, 현황조사서 PDF 에는 임차인·점유관계·조사일시가 들어 있다.

무엇을 만드나
  · scripts/data/court-auction/pdf-records/detail/<법원>-<사건번호>-<물건번호>.json
  · scripts/data/court-auction/pdf-records/survey/<법원>-<사건번호>.json
  · public/data/auction-photos/<법원>-<사건번호>-NN.jpg                    (사건 사진)
  → `fetch-auction-details.py --rebuild` 가 위 레코드를 합쳐 public/data/auction-details.json 을 만든다.

사용법
  python scripts/auction-pdf-ingest.py --scan                 # downloads/ 의 새 PDF 를 전부 처리
  python scripts/auction-pdf-ingest.py --scan --dry-run       # 무엇이 처리될지만 보기
  python scripts/auction-pdf-ingest.py --survey-stdin         # 현황조사서(브라우저 DOM JSON) 저장
  python scripts/auction-pdf-ingest.py --self-test            # 번들 PDF 로 파싱 검사(파일 없음)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DL = os.path.join(os.path.dirname(ROOT), "downloads")
DATA = os.path.join(HERE, "data", "court-auction")
REC = os.path.join(DATA, "pdf-records")
PHOTO_DIR = os.path.join(ROOT, "public", "data", "auction-photos")
STATE = os.path.join(REC, "state.json")

KINDS = ("토지", "건물", "집합건물", "자동차", "건설기계", "선박", "항공기", "광업권", "어업권", "기계기구", "기타")
CHROME = {
    "검색", "인근매각물건사례", "감정평가요항표 요약", "물건기본정보", "기일내역", "목록내역",
    "경매사건검색", "HOME", "경매물건", "이전", "관심물건등록", "사건상세조회", "현황조사서",
    "감정평가서", "기일", "기일종류", "기일장소", "최저매각가격", "기일결과",
    "목록번호", "목록구분", "상세내역", "검색조건", "법원",
}
SQ_M = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*㎡")
DATE_HM = re.compile(r"^(\d{4})\.(\d{2})\.(\d{2})\s*\((\d{2}):(\d{2})\)\s*$")


# ── 작은 도우미 ────────────────────────────────────────────────────────────────
def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def to_int(v) -> int | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    m = re.sub(r"[^\d]", "", str(v))
    return int(m) if m else None


def ymd(v: str) -> str:
    """2025.02.25 / 2025년03월24일 → 20250225"""
    m = re.search(r"(\d{4})\D?(\d{2})\D?(\d{2})", v or "")
    return f"{m.group(1)}{m.group(2)}{m.group(3)}" if m else ""


def to_py(sqm: float | None) -> float | None:
    return round(sqm / 3.305785, 1) if sqm else None


def first_sqm(text: str, after: str | None = None) -> float | None:
    t = text or ""
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


def safe_name(case_no: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", case_no)


def label_value(lines: list[str], label: str, offset: int = 1) -> str:
    """`label` 다음 offset 번째 비어있지 않은 줄 — 라벨/크롬 문구면 빈 문자열."""
    for i, l in enumerate(lines):
        if l.strip() == label:
            j, seen = i, 0
            while j + 1 < len(lines):
                j += 1
                v = lines[j].strip()
                if not v:
                    continue
                # 값이 아니라 다음 라벨이면 값 없음
                if v in CHROME or label_value_is_label(v):
                    return ""
                seen += 1
                if seen >= offset:
                    return v
            return ""
    return ""


def label_value_is_label(v: str) -> bool:
    return bool(re.fullmatch(r"[가-힣()/·,\s]{1,12}", v)) and v in {
        "물건비고", "담당", "사건접수", "경매개시일", "배당요구종기", "청구금액",
        "사건번호", "물건번호", "물건종류", "감정평가액", "입찰방법", "매각기일",
        "최저매각가격", "(매수신청보증", "금)",
    }


# ── 물건상세 PDF ──────────────────────────────────────────────────────────────
def parse_detail_pdf(path: str) -> dict:
    import pymupdf

    doc = pymupdf.open(path)
    lines: list[str] = []
    for p in doc:
        lines.extend(p.get_text().split("\n"))
    lines = [l.rstrip() for l in lines]
    joined = "\n".join(lines)

    case_no = label_value(lines, "사건번호")
    seq = label_value(lines, "물건번호") or "1"
    object_kind = label_value(lines, "물건종류")
    appraised = to_int(label_value(lines, "감정평가액"))

    # 최저매각가격 (매수신청보증금) — 라벨이 두 줄로 쪼개지기도 한다
    minimum = deposit = None
    for i, l in enumerate(lines):
        if l.strip() == "최저매각가격":
            for j in range(i + 1, min(i + 8, len(lines))):
                v = lines[j].strip()
                if not v:
                    continue
                if "원" in v and minimum is None and not v.startswith("("):
                    minimum = to_int(v)
                elif v.startswith("(") and "원" in v and deposit is None:
                    deposit = to_int(v)
                elif v.startswith("입찰방법"):
                    break
            break

    # 매각기일 — 라벨 바로 뒤 값(날짜 시각 장소). 기일종류 셀의 '매각기일' 과 구분한다
    sale_line = ""
    for i, l in enumerate(lines):
        if l.strip() == "매각기일" and i + 1 < len(lines) and re.match(r"^\d{4}\.\d{2}\.\d{2}", lines[i + 1].strip()):
            sale_line = lines[i + 1].strip()
            break
    sale_date = sale_place = ""
    m = re.match(r"^(\d{4}\.\d{2}\.\d{2})\s*(\d{2}:\d{2})?\s*(.*)$", sale_line)
    if m:
        sale_date = ymd(m.group(1))
        sale_place = (m.group(3) or "").strip()

    court = court_dept = ""
    dv = label_value(lines, "담당")
    if dv:
        parts = [x.strip() for x in dv.split("|")]
        court, court_dept = parts[0], (parts[1] if len(parts) > 1 else "")

    # 기일내역 — 날짜 줄 + 뒤따르는 셀들
    schedules = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = DATE_HM.match(line)
        if not m:
            i += 1
            continue
        row = {
            "date": f"{m.group(1)}{m.group(2)}{m.group(3)}",
            "time": f"{m.group(4)}{m.group(5)}",
            "kind": "", "place": "", "minimum": None, "result": "",
        }
        j = i + 1
        while j < len(lines):
            v = lines[j].strip()
            if not v:
                j += 1
                continue
            if DATE_HM.match(v) or v in ("기일", "기일종류", "기일장소", "최저매각가격", "기일결과",
                                         "목록번호", "목록구분", "상세내역") or v.startswith(("1. ", "1) ")):
                break
            if not row["kind"] and not v.endswith("원") and "법정" not in v and "원" not in v:
                row["kind"] = v
            elif not row["place"] and ("법정" in v or "호" in v):
                row["place"] = v
            elif v.endswith("원") and row["minimum"] is None:
                row["minimum"] = to_int(v)
            elif v in ("유찰", "매각", "매각준비", "기한변경", "추후지정", "배당종결", "진행", "변경"):
                row["result"] = v
            elif not row["result"] and ("유찰" in v or "매각" in v):
                row["result"] = v
            j += 1
        schedules.append(row)
        i = j
    schedules = [s for s in schedules if s["date"]]
    schedules.sort(key=lambda x: (x["date"], x["time"]))

    # 감정평가요항표 — '1. 표제명' + '1) 항목명' + 본문
    appraisal = []
    title = ""
    item_name = ""
    buf: list[str] = []
    started = False

    def flush():
        nonlocal buf
        if item_name:
            appraisal.append({
                "table": "", "tableName": title, "item": "", "itemName": item_name,
                "text": "\n".join(buf).strip(),
            })
        buf = []

    for l in lines:
        t = l.strip()
        if not t:
            continue
        if re.match(r"^\d+\.\s*\S", t) and ("표" in t or "감评价" in t):
            flush()
            title = re.sub(r"^\d+\.\s*", "", t)
            item_name = ""
            started = True
            continue
        m = re.match(r"^\d+\)\s*(.+)$", t)
        if m and started:
            flush()
            item_name = m.group(1).strip()
            continue
        if not started:
            continue
        if t in CHROME or t.startswith("목록구분이 집합건물") or t in ("것입니다.",):
            flush()
            item_name = ""
            started = False
            continue
        if re.fullmatch(r"\d{1,2}", t) or t in KINDS:
            continue
        buf.append(t)
    flush()

    # 목록내역 — 상세내역 값은 문서 끝부분에 몰려 나온다
    lists: list[dict] = []
    tail_start = None
    for idx, l in enumerate(lines):
        if l.strip() == "상세내역":
            tail_start = idx
    if tail_start is not None:
        seq_start = None
        for idx in range(tail_start + 1, len(lines)):
            t = lines[idx].strip()
            if re.fullmatch(r"\d{1,2}", t) and idx + 1 < len(lines) and lines[idx + 1].strip() in KINDS:
                seq_start = idx
                break
        if seq_start is not None:
            cur = None
            skip_kind_at = None
            for idx in range(seq_start, len(lines)):
                t = lines[idx].strip()
                if idx == skip_kind_at:
                    continue
                if not t:
                    continue
                if re.fullmatch(r"\d{1,2}", t) and idx + 1 < len(lines) and lines[idx + 1].strip() in KINDS:
                    cur = {"seq": t, "kind": lines[idx + 1].strip(), "detail": ""}
                    lists.append(cur)
                    skip_kind_at = idx + 1
                    continue
                if t in CHROME or t.startswith("목록구분이 집합건물") or t == "것입니다.":
                    continue
                if "검색" == t or "인근매각물건사례" in t:
                    continue
                if re.match(r"^\d+\.\s*\S", t) or re.match(r"^\d+\)", t):
                    continue
                if cur is not None:
                    cur["detail"] = (cur["detail"] + "\n" + t).strip()

    areas, area = parse_areas(lists)

    # 사진 — 큰 이미지만(아이콘·로고 제외). 사건 단위로 한 번만 저장한다.
    photos = extract_photos(doc, lines)

    case = {
        "caseNo": case_no,
        "court": court,
        "courtDept": court_dept,
        "receiptDate": ymd(label_value(lines, "사건접수")),
        "commenceDate": ymd(label_value(lines, "경매개시일")),
        "dividendDeadline": ymd(label_value(lines, "배당요구종기")),
        "claimAmount": to_int(label_value(lines, "청구금액")),
        "schedules": {str(seq): schedules},
        "lists": [{"seq": int(x["seq"]), "kind": x["kind"], "address": x["detail"].split("\n")[0].strip(),
                   "closing": ""} for x in lists],
        "collectedAt": now_iso(),
    }
    if deposit and minimum:
        case["depositRate"] = int(round(deposit / minimum * 100)) if minimum else None
    status = ""
    if schedules:
        last = schedules[-1]
        status = last.get("result") or "매각공고"
        if any(not s.get("result") for s in schedules):
            status = "매각공고"
    if status:
        case["itemStatus"] = {str(seq): status}

    item = {
        "objectKind": object_kind,
        "salePlace": sale_place,
        "areas": areas,
        "area": area,
        "appraisalSummary": appraisal,
        "photos": photos,
        "collectedAt": now_iso(),
    }
    if appraised:
        item["appraised"] = appraised
    if minimum:
        item["minimum"] = minimum
    return {"caseNo": case_no, "seq": str(seq), "case": case, "item": item,
            "_meta": {"pages": doc.page_count, "source": os.path.basename(path)}}


def parse_areas(lists: list[dict]) -> tuple[list[dict], dict]:
    """목록 상세내역 원문 → 면적/대지권. 읽지 못하면 비워 둔다(추정 금지)."""
    areas: list[dict] = []
    exclusive = land = None
    for o in lists:
        detail = (o.get("detail") or "").strip()
        if not detail:
            continue
        areas.append({
            "kind": o.get("kind") or "목적물",
            "detail": detail[:1200],
            "areaSqm": first_sqm(detail),
        })
        if exclusive is None:
            v = first_sqm(detail, "전유부분의 건물의 표시")
            if v is None and "전유부분" in detail:
                v = first_sqm(detail, "전유부분")
            exclusive = v
        if land is None:
            v = first_sqm(detail, "대지권의 비율") or first_sqm(detail, "대지권 비율")
            if v is None:
                m = re.search(r"대지권[^\n]{0,20}?(\d[\d,]*(?:\.\d+)?)\s*㎡", detail)
                if m and "목적인 토지" not in m.group(0):
                    v = float(m.group(1).replace(",", ""))
            land = v
    return areas, {
        "exclusiveSqm": exclusive, "exclusivePy": to_py(exclusive),
        "landSqm": land, "landPy": to_py(land),
    }


def extract_photos(doc, lines: list[str]) -> list[dict]:
    """큰 이미지(전경도·내부사진 등)만 골라 파일로 저장한다."""
    pics = []
    for page in doc:
        for img in page.get_images(full=True):
            xref, w, h = img[0], img[2], img[3]
            if w < 200 or h < 200:
                continue
            pics.append((xref, w, h))
    if not pics:
        return []
    os.makedirs(PHOTO_DIR, exist_ok=True)
    out = []
    seen = set()
    for xref, w, h in pics:
        if xref in seen:
            continue
        seen.add(xref)
        blob = doc.extract_image(xref)
        if not blob or len(blob.get("image") or b"") < 3000:
            continue
        out.append({"ext": blob.get("ext") or "jpeg", "bytes": blob["image"], "w": w, "h": h})
    return out


PHOTO_KEEP = 4           # 사건당 저장 장수 — 전경도 3장 + 위치도(마지막)
PHOTO_MAX_PX = 900      # 긴 변 기준 — 저장소·전송량을 아끼면서 화면(패널 썸네일·확대)에는 충분
PHOTO_QUALITY = 78


def shrink_image(blob: bytes) -> bytes:
    """사진을 긴 변 900px·JPEG q78 로 줄인다(원본이 작거나 Pillow 가 없으면 그대로)."""
    try:
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(blob))
        im = im.convert("RGB")
        w, h = im.size
        scale = PHOTO_MAX_PX / max(w, h)
        if scale < 1:
            im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=PHOTO_QUALITY, optimize=True)
        out = buf.getvalue()
        return out if len(out) < len(blob) else blob
    except Exception:  # noqa: BLE001 — 사진 한 장 처리 실패가 수집을 멈추지 않게
        return blob


def save_photos(pics: list[dict], court: str, case_no: str) -> list[dict]:
    if not pics:
        return []
    if len(pics) > PHOTO_KEEP:                     # 전경도 3장 + 마지막(위치도)
        pics = pics[:PHOTO_KEEP - 1] + pics[-1:]
    os.makedirs(PHOTO_DIR, exist_ok=True)
    base = f"{court}-{safe_name(case_no)}"
    out = []
    for i, p in enumerate(pics, start=1):
        blob = shrink_image(p["bytes"])
        name = f"{base}-{i:02d}.jpg"
        with open(os.path.join(PHOTO_DIR, name), "wb") as f:
            f.write(blob)
        out.append({"url": f"/data/auction-photos/{name}", "caption": f"현장사진 {i}"})
    return out


# ── 현황조사서 PDF ────────────────────────────────────────────────────────────
SURVEY_LABELS = {
    "점유인", "당사자구분", "점유부분", "용도", "점유기간", "보증(전세)금", "차임",
    "전입일자", "확정일자", "기본정보", "부동산임대차정보", "사진정보", "현황조사내역",
    "부동산표시목록", "번호", "소재지", "임대차관계", "법원", "명령회차", "사건번호",
    "점유관계", "기타", "회", "조사일시", "부동산의 현황 및 점유관계 조사서",
    "임대차관계 조사서", "1. 부동산의 점유관계", "1. 임차 목적물의 용도 및 임대차 계약 등의 내용",
    "사진보기", "서울중앙지방법원", "서울동부지방법원", "서울남부지방법원",
    "서울북부지방법원", "서울서부지방법원",
}


def parse_survey_text(lines: list[str], court: str = "", case_no: str = "") -> dict:
    """현황조사서 본문(줄 목록) → 임차인·점유관계.

    PDF 인쇄본과 브라우저 DOM innerText 가 같은 label→value 순서라 둘 다 이 함수로 읽는다.
    값이 비어 있으면 다음 줄이 곧 다른 라벨이다(빈 칸은 출력되지 않는다).
    """
    def val_after(label: str) -> str:
        for i, l in enumerate(lines):
            if l.strip() == label and i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                if nxt and nxt not in SURVEY_LABELS and not nxt.startswith("[소재지]"):
                    return nxt
        return ""

    if not case_no:
        m = re.search(r"(\d{4}타경\d+)", "\n".join(lines))
        case_no = m.group(1) if m else ""
    if not court:
        for l in lines[:12]:
            if l.strip() in COURT_BY_NAME:
                court = l.strip()
                break

    tenants: list[dict] = []
    cur = None
    key_map = {"당사자구분": "type", "점유부분": "part", "용도": "usage", "점유기간": "period",
               "보증(전세)금": "deposit", "차임": "rent", "전입일자": "movedIn",
               "확정일자": "fixedDate"}
    for i, l in enumerate(lines):
        t = l.strip()
        if t == "점유인":
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            cur = {"name": "" if nxt in SURVEY_LABELS else nxt}
            tenants.append(cur)
            continue
        if cur is not None and t in key_map:
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if nxt and nxt not in key_map and nxt not in SURVEY_LABELS and not nxt.startswith("[소재지]"):
                cur[key_map[t]] = nxt

    occupancy: dict = {}
    ex = val_after("조사일시")
    if ex:
        occupancy["examinedAt"] = ex
    rel = val_after("점유관계")
    if rel:
        occupancy["relation"] = rel
    # 기타 — 다음 구역([소재지]·임대차관계 조사서 등) 전까지 이어지는 문장
    for i, l in enumerate(lines):
        if l.strip() == "기타":
            buf = []
            for nxt in lines[i + 1:]:
                s = nxt.strip()
                if not s:
                    continue
                if s.startswith("[소재지]") or s in SURVEY_LABELS:
                    break
                buf.append(s)
            if buf:
                occupancy["etc"] = " ".join(buf)[:3000]
            break
    return {"caseNo": case_no, "court": court, "tenants": tenants,
            "occupancy": occupancy or None}


def parse_survey_pdf(path: str) -> dict:
    import pymupdf

    doc = pymupdf.open(path)
    text = "\n".join(p.get_text() for p in doc)
    lines = [l.rstrip() for l in text.split("\n")]
    rec = parse_survey_text(lines)
    m = re.search(r"\d{4}타경\d+\s+(\S+)", "\n".join(lines))
    rec["caseName"] = m.group(1) if m else ""
    return rec


# ── 저장 ──────────────────────────────────────────────────────────────────────
def write_detail(rec: dict, court: str, pics: list[dict]) -> str:
    os.makedirs(os.path.join(REC, "detail"), exist_ok=True)
    case_no = rec["caseNo"]
    seq = rec["seq"]
    photos = save_photos(pics, court, case_no)
    if photos:
        rec["item"]["photos"] = photos
    path = os.path.join(REC, "detail", f"{court}-{safe_name(case_no)}-{seq}.json")
    payload = {"court": court, "caseNo": case_no, "seq": seq,
               "case": rec["case"], "item": rec["item"], "meta": rec.get("_meta", {})}
    json.dump(payload, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return path


def write_survey(rec: dict, court: str) -> str:
    os.makedirs(os.path.join(REC, "survey"), exist_ok=True)
    path = os.path.join(REC, "survey", f"{court}-{safe_name(rec['caseNo'])}.json")
    payload = {"court": court, "caseNo": rec["caseNo"],
               "tenants": rec.get("tenants") or [], "occupancy": rec.get("occupancy"),
               "caseName": rec.get("caseName") or "", "collectedAt": now_iso()}
    json.dump(payload, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return path


# ── downloads 스캔 ────────────────────────────────────────────────────────────
def load_state() -> dict:
    if os.path.exists(STATE):
        try:
            return json.load(open(STATE, encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"seen": [], "done": {}}


def save_state(st: dict) -> None:
    os.makedirs(REC, exist_ok=True)
    json.dump(st, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


COURT_BY_NAME = {
    "서울중앙지방법원": "B000210", "서울동부지방법원": "B000211", "서울남부지방법원": "B000212",
    "서울북부지방법원": "B000213", "서울서부지방법원": "B000215",
}


def guess_kind(path: str) -> str:
    """PDF 종류 — 현황조사서면 'survey', 물건상세면 'detail'."""
    import pymupdf
    doc = pymupdf.open(path)
    text = "".join(p.get_text() for p in doc[:2])
    if "현황조사내역" in text or "부동산의 현황 및 점유관계" in text or "임대차관계 조사서" in text:
        return "survey"
    return "detail"


def scan(limit: int | None = None, dry: bool = False, since_ts: float | None = None) -> None:
    st = load_state()
    seen = set(st.get("seen") or [])
    files = []
    for name in os.listdir(DL):
        if not name.lower().endswith(".pdf"):
            continue
        p = os.path.join(DL, name)
        if not os.path.isfile(p):
            continue
        mt = os.path.getmtime(p)
        key = f"{name}|{int(mt)}|{os.path.getsize(p)}"
        if key in seen:
            continue
        if since_ts and mt < since_ts:
            continue
        files.append((mt, name, p, key))
    files.sort()
    if limit:
        files = files[:limit]
    print(f"새 PDF {len(files)}건")
    done_n = 0
    for mt, name, p, key in files:
        try:
            kind = guess_kind(p)
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠ {name}: 열기 실패 {e}")
            continue
        if dry:
            print(f"  · {name} → {kind}")
            continue
        try:
            if kind == "survey":
                rec = parse_survey_pdf(p)
                if not rec["caseNo"]:
                    print(f"  ⚠ {name}: 사건번호 없음")
                    continue
                court = COURT_BY_NAME.get(rec.get("court") or "", "")
                if not court:
                    print(f"  ⚠ {name}: 법원 미상({rec.get('court')})")
                    continue
                out = write_survey(rec, court)
                print(f"  · 현황조사서 {court} {rec['caseNo']} 임차인 {len(rec['tenants'])}명 → {os.path.basename(out)}")
            else:
                rec = parse_detail_pdf(p)
                if not rec["caseNo"]:
                    print(f"  ⚠ {name}: 사건번호 없음")
                    continue
                court = COURT_BY_NAME.get(rec["case"].get("court") or "", "")
                if not court:
                    print(f"  ⚠ {name}: 법원 미상({rec['case'].get('court')})")
                    continue
                pics = extract_photos_cached(p)
                out = write_detail(rec, court, pics)
                print(f"  · 물건상세 {court} {rec['caseNo']} 물건{rec['seq']} "
                      f"기일{len(rec['case']['schedules'].get(rec['seq'], []))} 사진{len(pics)} → {os.path.basename(out)}")
            st.setdefault("seen", []).append(key)
            st.setdefault("done", {})[key] = now_iso()
            done_n += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠ {name}: 처리 실패 {e}")
    if not dry:
        save_state(st)
    print(f"처리 완료 {done_n}건")


_PIC_CACHE: dict[str, list[dict]] = {}


def extract_photos_cached(path: str) -> list[dict]:
    if path not in _PIC_CACHE:
        import pymupdf
        doc = pymupdf.open(path)
        lines: list[str] = []
        _PIC_CACHE[path] = extract_photos(doc, lines)
    return _PIC_CACHE[path]


def parse_survey_rows(rows: list[list[str]], property_text: str = "") -> dict:
    """브라우저 현황조사서 팝업의 표 행 → 임차인·점유관계.

    행 하나가 [번호, '점유인', '홍길동', '당사자구분', '임차인'] 처럼 라벨·값 쌍으로 온다.
    빈 칸은 빈 문자열이므로 '다음 칸이 라벨이면 값 없음' 으로 읽는다.
    """
    labels = {"점유인": "name", "당사자구분": "type", "점유부분": "part", "용도": "usage",
              "점유기간": "period", "보증(전세)금": "deposit", "차임": "rent",
              "전입일자": "movedIn", "확정일자": "fixedDate"}
    court = case_no = case_name = examined = relation = etc = ""
    tenants: list[dict] = []
    cur: dict | None = None
    for cells in rows:
        c = [x.strip() for x in (cells or [])]
        if not any(c):
            continue
        first = c[0]
        if first == "법원" and len(c) > 1:
            court = c[1]
            continue
        if first == "사건번호" and len(c) > 1:
            m = re.match(r"(\S*타경\d+)\s*(.*)", c[1])
            if m:
                case_no, case_name = m.group(1), m.group(2)
            else:
                case_no = c[1]
            continue
        if first == "조사일시" and len(c) > 1:
            examined = c[1]
            continue
        if first == "점유관계" and len(c) > 1:
            if c[1].strip() and not relation:   # 목록이 여럿이면 값이 있는 첫 줄을 쓴다
                relation = c[1]
            continue
        if first == "기타" and len(c) > 1:
            if c[1].strip() and (not etc or etc == "대지"):
                etc = c[1]
            continue
        if "점유인" in c:
            cur = {"name": ""}
            tenants.append(cur)
        elif re.fullmatch(r"\d{1,2}", first or ""):
            # 임대차정보 목록행 등 — 임차인 표가 아니면 닫는다
            cur = None
        if cur is not None:
            for i, cell in enumerate(c):
                if cell in labels and i + 1 < len(c) and c[i + 1] not in labels:
                    cur[labels[cell]] = c[i + 1]
    occupancy: dict = {}
    if examined:
        occupancy["examinedAt"] = examined
    if relation:
        occupancy["relation"] = relation
    if etc:
        occupancy["etc"] = etc
    if property_text:
        occupancy["property"] = property_text
    return {"court": court, "caseNo": case_no, "caseName": case_name,
            "tenants": tenants, "occupancy": occupancy or None}


def survey_stdin() -> None:
    """브라우저에서 읽은 현황조사서 팝업 JSON(stdin) → 레코드.

    {court, caseNo, caseName, rows: [[칸,...], ...], property: "..."} 또는
    {court, caseNo, text: "..."} 둘 다 받는다.
    """
    raw = sys.stdin.read()
    data = json.loads(raw)
    if data.get("rows"):
        rec = parse_survey_rows(data["rows"], data.get("property") or "")
    else:
        text = data.get("text") or ""
        rec = parse_survey_text([l.rstrip() for l in text.split("\n")],
                                data.get("court") or "", data.get("caseNo") or "")
    court = data.get("court") or rec.get("court") or ""
    if court in COURT_BY_NAME:
        court = COURT_BY_NAME[court]
    if not court:
        raise SystemExit("court 없음")
    rec["court"] = court
    if not rec.get("caseNo"):
        raise SystemExit("caseNo 없음")
    out = write_survey(rec, court)
    print(f"현황조사서 {court} {rec['caseNo']} 임차인 {len(rec.get('tenants') or [])}명 → {out}")


def status() -> None:
    for k in ("detail", "survey"):
        d = os.path.join(REC, k)
        n = len([f for f in os.listdir(d) if f.endswith(".json")]) if os.path.isdir(d) else 0
        print(f"{k}: {n}")
    n = len([f for f in os.listdir(PHOTO_DIR) if f.lower().endswith((".jpg", ".png"))]) if os.path.isdir(PHOTO_DIR) else 0
    print(f"photos: {n}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true")
    ap.add_argument("--since", type=float, default=None, help="이 epoch 초 이후에 만들어진 PDF 만")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--survey-stdin", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--self-test", default="", help="PDF 경로(들)로 파싱만 검사")
    args = ap.parse_args()
    if args.status:
        status()
        return
    if args.survey_stdin:
        survey_stdin()
        return
    if args.self_test:
        for p in args.self_test.split(","):
            if guess_kind(p) == "survey":
                print(json.dumps(parse_survey_pdf(p), ensure_ascii=False, indent=1)[:3000])
            else:
                rec = parse_detail_pdf(p)
                rec["item"]["photos"] = [{"w": x["w"], "h": x["h"]} for x in extract_photos_cached(p)]
                print(json.dumps(rec, ensure_ascii=False, indent=1)[:4000])
        return
    if args.scan:
        scan(args.limit, args.dry_run, args.since)
        return
    ap.print_help()


if __name__ == "__main__":
    main()
