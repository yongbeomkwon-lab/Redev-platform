#!/usr/bin/env python3
"""
경매 사건 상세 수집 — 대법원 법원경매정보(courtauction.go.kr) **경매사건검색**

왜 사건상세(PGJ15BM01)가 아니라 사건검색(PGJ159M00)인가
  · 사건상세는 **물건 하나당 한 번** 조회해야 하고(목록 588줄 → 588회), 화면 간 데이터를
    메모리로 넘겨 URL 딥링크도 없다.
  · 경매사건검색은 **사건 하나당 한 번**으로 그 사건의 물건·목적물·기일내역·물건상태·
    청구금액·배당요구종기·목록내역을 한꺼번에 준다(일괄매각 24필지 → 1회). 같은 정보를
    훨씬 적은 요청으로 얻으므로 사이트에도 덜 부담을 준다.
  · 응답 JSON 은 화면이 실제로 쓰는 것과 같은 모양이다:
      { "data": { "ipcheck": true, "dma_csBasInf": {...},
                  "dlt_dspslGdsDspslObjctLst": [...],   # 물건(안에 목적물 배열)
                  "dlt_rletCsGdsDtsDxdyInf": [...],     # 기일내역
                  "dlt_rletCsDspslObjctLst": [...],     # 목록내역
                  "dlt_dstrtDemnLstprdDts": [...],      # 배당요구종기
                  ... } }

지켜야 하는 것 (2026-11-22 실측 · scripts/README-auction.md)
  · 요청 간 기본 20초. 짧은 간격이면 IP가 보안정책으로 차단된다.
  · 응답이 `data.ipcheck=false` + "비정상적인 접속"이면 **즉시 중단**하고 blocks.json 에 남긴다.
  · 받은 사건은 raw 로 저장해 이어받는다(같은 사건을 다시 부르지 않는다).

출력
  · scripts/data/court-auction/case-raw/<법원코드>-<사건번호>.json   원본 응답
  · public/data/auction-details.json                                 화면이 읽는 정규화 파일
      { meta, byCase: { "법원코드|사건번호": {...} }, byId: {...} }
      byCase 는 사건 공통 상세다 — 그 사건의 물건·목적물 여러 줄이 함께 쓴다.
      byId 는 물건별 상세(면적·감정평가요항·사진)로, 사건상세 수집을 붙였을 때만 채운다.

사용법
  python3 scripts/fetch-auction-details.py                  # auctions.json 의 모든 사건(이어받기)
  python3 scripts/fetch-auction-details.py --limit 5        # 5사건만(시험)
  python3 scripts/fetch-auction-details.py --probe B000210:2024타경1072  # 한 사건만 조회·요약
  python3 scripts/fetch-auction-details.py --rebuild        # raw 전체를 다시 합쳐 파일 재생성
  python3 scripts/fetch-auction-details.py --status         # 지금까지 모은 raw 상태

⚠ 2026-11-27 이 작업 환경(서버)의 IP는 대법원 경매정보에서 차단된 상태였다
  (data.ipcheck=false). 그래서 이 스크립트의 **HTTP 수집 경로는 여기서 실제로 돌려 보지 못했고**,
  파싱·정규화는 한국 네트워크 브라우저로 정상 조회한 같은 사건의 응답 구조로 맞췄다.
  차단이 풀린 네트워크(국내 가정·사무실)에서 실행하면 된다. 한 번에 다 돌리지 말고
  `--limit 20` 으로 시작해 blocks.json 을 확인하며 늘리는 것을 권한다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AUCTIONS = os.path.join(ROOT, "public", "data", "auctions.json")
OUT = os.path.join(ROOT, "public", "data", "auction-details.json")
DATA_DIR = os.path.join(HERE, "data", "court-auction")
RAW_DIR = os.path.join(DATA_DIR, "case-raw")
COOKIE = os.path.join(DATA_DIR, "cookies.txt")
BLOCK_LOG = os.path.join(DATA_DIR, "blocks.json")

BASE = "https://www.courtauction.go.kr"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
SEARCH_URL = BASE + "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159M00.xml&pgjId=159M00"
CASE_URL = BASE + "/pgj/pgj15A/selectAuctnCsSrchRslt.on"

# 법원 코드표는 응답의 이름 필드(cortOfcNm)를 우선 쓰므로 여기서는 참고용이다.
SEOUL_COURTS = {
    "B000210": "서울중앙지방법원",
    "B000211": "서울동부지방법원",
    "B000212": "서울남부지방법원",
    "B000213": "서울북부지방법원",
    "B000215": "서울서부지방법원",
}

# ── 공식 코드표 (2026-11-27 /pgj/scframe/lib/sccd/list.on 에서 받은 값) ──────────────
#   코드 이름을 추정하지 않는다 — 대법원이 쓰는 표를 그대로 옮겼다.
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
FIXTURE = os.path.join(HERE, "data", "auction-detail-fixture-2024타경1072.json")


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
    curl([SEARCH_URL, "-o", "/dev/null", "-H", "Referer: " + BASE + "/"])


def fetch_case(court: str, case_no: str) -> dict:
    payload = {"cortOfcCd": court, "csNo": case_no}
    out = curl([
        CASE_URL, "-X", "POST",
        "-H", "Content-Type: application/json; charset=UTF-8",
        "-H", "Origin: " + BASE,
        "-H", "Referer: " + SEARCH_URL,
        "-H", "X-Requested-With: XMLHttpRequest",
        "-H", "Accept: application/json, text/javascript, */*; q=0.01",
        "--data-binary", json.dumps(payload, ensure_ascii=False),
    ])
    text = out.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"_raw": text[:2000], "status": None, "message": "JSON 아님"}


def looks_blocked(res: dict) -> bool:
    data = res.get("data") or {}
    if data.get("ipcheck") is False:
        return True
    msg = res.get("message") or ""
    return "비정상적인 접속" in msg or "차단" in msg


def log_block(court: str, case_no: str, res: dict) -> None:
    rows = []
    if os.path.exists(BLOCK_LOG):
        try:
            rows = json.load(open(BLOCK_LOG, encoding="utf-8"))
        except json.JSONDecodeError:
            rows = []
    rows.append({
        "at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "court": court, "caseNo": case_no, "message": res.get("message"),
    })
    os.makedirs(DATA_DIR, exist_ok=True)
    json.dump(rows, open(BLOCK_LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def raw_path(court: str, case_no: str) -> str:
    return os.path.join(RAW_DIR, f"{court}-{case_no}.json")


# ── 정규화 ────────────────────────────────────────────────────────────────────
def to_int(v) -> int | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    try:
        return int(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def first(lst, key):
    for row in lst or []:
        v = row.get(key)
        if v not in (None, ""):
            return v
    return None


def parse_case(res: dict, court_code: str, case_no: str) -> dict:
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

    item_status: dict[str, str] = {}
    spec_ids: dict[str, str] = {}
    remarks: list[str] = []
    for g in goods:
        seq = str(g.get("dspslGdsSeq") or "1")
        item_status[seq] = GDS_STAT.get(g.get("auctnGdsStatCd"), g.get("auctnGdsStatCd") or "")
        if g.get("dspslGdsSpcfcEcdocId"):
            spec_ids[seq] = g["dspslGdsSpcfcEcdocId"]
        if g.get("dspslGdsRmk") and g["dspslGdsRmk"] not in remarks:
            remarks.append(g["dspslGdsRmk"])

    deadlines = sorted({r.get("dstrtDemnLstprdYmd") for r in dstrt if r.get("dstrtDemnLstprdYmd")})

    rec = {
        "caseNo": base.get("userCsNo") or case_no,
        "caseName": base.get("csNm") or "",
        "court": base.get("cortOfcNm") or SEOUL_COURTS.get(court_code, ""),
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
        "lists": [
            {
                "seq": r.get("dspslObjctSeq"),
                "kind": LST_DVS.get(r.get("auctnLstDvsCd"), r.get("auctnLstNm") or ""),
                "address": (r.get("userSt") or "").strip(),
                "closing": r.get("ultmtNm") or "",
            }
            for r in lists
        ],
        "note": ", ".join(remarks),
        "collectedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    if len(goods) == 1 and goods[0].get("auctnGdsUsgCd"):
        # 물건이 하나뿐이면 물건종류를 사건 레코드에도 남긴다(여러 개면 물건마다 달라 넣지 않는다)
        rec["objectKind"] = GDS_USG.get(goods[0]["auctnGdsUsgCd"], "")
    return rec


# ── 수집 ──────────────────────────────────────────────────────────────────────
def cases_from_auctions() -> list[dict]:
    data = json.load(open(AUCTIONS, encoding="utf-8"))
    seen: dict[str, dict] = {}
    for items in data.get("byZone", {}).values():
        for it in items:
            key = f"{it['courtCode']}|{it['caseNo']}"
            if key in seen:
                seen[key]["items"] += 1
                continue
            seen[key] = {
                "key": key, "court": it["courtCode"], "caseNo": it["caseNo"],
                "zoneName": it.get("zoneName", ""), "items": 1,
            }
    return list(seen.values())


def collect(cases: list[dict], delay: float, limit: int | None) -> None:
    os.makedirs(RAW_DIR, exist_ok=True)
    open_session()
    time.sleep(max(2.0, delay / 2))
    done = 0
    for c in cases:
        if limit is not None and done >= limit:
            break
        path = raw_path(c["court"], c["caseNo"])
        if os.path.exists(path):
            continue
        res = fetch_case(c["court"], c["caseNo"])
        if looks_blocked(res):
            log_block(c["court"], c["caseNo"], res)
            print(f"  ⛔ {c['caseNo']} 차단 감지 — 중단: {res.get('message')}")
            break
        if not (res.get("data") or {}).get("dma_csBasInf"):
            print(f"  ⚠ {c['caseNo']} 응답에 사건기본정보가 없습니다 — 저장하지 않음")
            time.sleep(delay)
            continue
        json.dump(res, open(path, "w", encoding="utf-8"), ensure_ascii=False)
        done += 1
        print(f"  · {c['court']} {c['caseNo']} ({c['zoneName']}) — 누적 {done}")
        time.sleep(delay)
    print(f"수집 {done}사건 / raw 파일 {len(os.listdir(RAW_DIR))}개")


def rebuild() -> dict:
    """case-raw 전체를 정규화해 auction-details.json 을 다시 만든다(byId 는 기존 파일에서 보존)."""
    if not os.path.isdir(RAW_DIR):
        raise SystemExit("case-raw 가 없습니다 — 먼저 수집하세요")
    existing = {"byId": {}, "meta": {}}
    if os.path.exists(OUT):
        try:
            existing = json.load(open(OUT, encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    by_case: dict[str, dict] = {}
    errors = []
    for f in sorted(os.listdir(RAW_DIR)):
        if not f.endswith(".json"):
            continue
        court, _, case_part = f[:-5].partition("-")
        case_no = case_part
        try:
            res = json.load(open(os.path.join(RAW_DIR, f), encoding="utf-8"))
            rec = parse_case(res, court, case_no)
        except Exception as e:  # noqa: BLE001 — 한 파일이 깨져도 나머지는 살린다
            errors.append(f"{f}: {e}")
            continue
        if not rec.get("caseNo"):
            errors.append(f"{f}: 사건기본정보 없음")
            continue
        by_case[f"{court}|{case_no}"] = rec

    item_count = sum(len(v.get("lists") or []) for v in by_case.values())
    payload = {
        "meta": {
            "source": "대법원 법원경매정보(courtauction.go.kr) 사건 조회 — scripts/fetch-auction-details.py",
            "collectedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "caseCount": len(by_case),
            "itemCount": item_count,
            "note": "사건 조회(경매사건검색)에서 확인한 사건 단위 상세입니다. 사건번호 하나로 그 사건의 "
                    "물건·목적물·기일내역·물건상태·청구금액·배당요구종기·목록내역을 한꺼번에 받아 "
                    "byCase 에 담습니다. 면적·감정평가요항표·사건 사진은 사건상세(물건상세조회)에서만 나옵니다.",
            "blocked": (existing.get("meta") or {}).get("blocked"),
        },
        "byCase": by_case,
        "byId": (existing.get("byId") or {}),
    }
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"사건 {len(by_case)} · 목록 {item_count} → {OUT}")
    if errors:
        print("⚠ 건너뛴 파일:", *errors[:10], sep="\n  ")
    return payload


def status() -> None:
    if not os.path.isdir(RAW_DIR):
        print("case-raw 없음")
        return
    files = sorted(os.listdir(RAW_DIR))
    print(f"raw 사건 {len(files)}개")
    if os.path.exists(BLOCK_LOG):
        print("차단 기록:", json.load(open(BLOCK_LOG, encoding="utf-8"))[-3:])


def probe(spec: str) -> None:
    court, _, case_no = spec.partition(":")
    if not court or not case_no:
        raise SystemExit("--probe 법원코드:사건번호  예: B000210:2024타경1072")
    open_session()
    time.sleep(3)
    res = fetch_case(court, case_no)
    if looks_blocked(res):
        log_block(court, case_no, res)
        print("⛔ 차단:", res.get("message"))
        return
    if not (res.get("data") or {}).get("dma_csBasInf"):
        msg = res.get("message") or (res.get("errors") or {}).get("errorMessage") or res.get("_raw")
        print("⚠ 사건기본정보가 없는 응답입니다 —", str(msg)[:200])
        return
    rec = parse_case(res, court, case_no)
    print(json.dumps(rec, ensure_ascii=False, indent=1)[:4000])


def self_test() -> None:
    """한국 네트워크 브라우저로 정상 조회한 사건의 응답 구조로 **파싱만** 검사한다.

    · HTTP 는 부르지 않는다(차단 상태에서도 돌릴 수 있다).
    · 기대값은 그 화면에서 읽은 값 그대로다 — 코드표 이름(유찰·매각기일)까지 확인한다.
    """
    res = json.load(open(FIXTURE, encoding="utf-8"))
    rec = parse_case(res, "B000210", "2024타경1072")
    checks = {
        "caseNo": "2024타경1072",
        "court": "서울중앙지방법원",
        "courtDept": "경매12계",
        "claimAmount": 120131932,
        "dividendDeadline": "20240722",
        "receiptDate": "20240227",
        "depositRate": 10,
        "itemStatus": {"1": "유찰"},
    }
    for k, v in checks.items():
        if rec.get(k) != v:
            raise SystemExit(f"✗ {k}: {rec.get(k)!r} != {v!r}")
    sch = (rec.get("schedules") or {}).get("1") or []
    if not sch or sch[0].get("result") != "유찰" or sch[0].get("kind") != "매각기일":
        raise SystemExit(f"✗ 기일내역: {sch!r}")
    if len(rec.get("lists") or []) != 6:
        raise SystemExit(f"✗ 목록 {len(rec.get('lists') or [])}건 — 6건이어야 합니다")
    print("✓ self-test OK —", rec["caseNo"], rec["court"], rec["courtDept"],
          f"기일 {len(sch)}회({sch[0]['result']})", f"목록 {len(rec['lists'])}건")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=20.0, help="요청 간 대기(초). 기본 20")
    ap.add_argument("--limit", type=int, default=None, help="이번 실행에서 새로 받을 사건 수")
    ap.add_argument("--probe", default="", help="법원코드:사건번호 한 건만 조회해 요약 출력")
    ap.add_argument("--rebuild", action="store_true", help="raw 전체로 auction-details.json 재생성")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--self-test", action="store_true", help="번들 fixture 로 파싱만 검사(HTTP 없음)")
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
    print(f"대상 사건 {len(cases)}개 (경매 물건 {sum(c['items'] for c in cases)}줄)")
    collect(cases, args.delay, args.limit)
    rebuild()


if __name__ == "__main__":
    main()
