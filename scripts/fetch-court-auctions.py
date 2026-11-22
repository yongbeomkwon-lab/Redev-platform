#!/usr/bin/env python3
"""
구역 내 법원경매 물건 수집 — 대법원 법원경매정보(courtauction.go.kr) 직접 조회

왜 이렇게 하나
  · 법원경매정보에는 공식 오픈API가 없다(공공데이터포털에도 없음). 사이트는 2022년 개편 이후
    WebSquare SPA가 JSON XHR로 목록을 받아 그린다. 여기서는 **화면이 실제로 쓰는 검색 요청과
    같은 형태**로 POST 한다: `/pgj/pgjsearch/searchControllerMain.on`.
  · 사이트는 짧은 시간에 여러 번 부르면 IP를 보안정책으로 차단한다(응답 HTTP 200 +
    data.ipcheck=false + "비정상적인 접속" 메시지). 그래서
      ① 요청 간 기본 20초 대기(--delay),
      ② ipcheck=false 를 만나면 **즉시 중단**(더 두드리지 않는다),
      ③ 받은 페이지마다 raw JSON을 저장해 다음 실행이 이어받는다(resume).
  · 한 번에 너무 많이 부르지 않도록 법원별로 나눠 부르고, 페이지 크기는 사이트 기본 상한(50)을 쓴다.

사용법
  python3 scripts/fetch-court-auctions.py                 # 서울 5개 법원 전체(이어받기)
  python3 scripts/fetch-court-auctions.py --cond 0004602 --court B000215
                                                          # 다른 검색조건(기일 6주+ · 서부지법)으로 수집
  python3 scripts/fetch-court-auctions.py --court B000210 # 한 법원만
  python3 scripts/fetch-court-auctions.py --probe 20270113 --court B000210
                                                          # 그 매각기일 조건으로 한 번만 조회(탐침)
  python3 scripts/fetch-court-auctions.py --status        # 지금까지 모은 raw 상태 요약

검색조건(cortAuctnSrchCondCd) — 2026-11-22 실측
  · 0004601 「부동산 일반」: 매각기일이 앞으로 약 2주인 공고중 물건. 서울서부지법 0건.
  · 0004602 「부동산 전체」: 기일이 2026-11-23~2027-01-06 로 넓고 **서부지법 321건**이 들어온다.
    (매각기일 파라미터 dspslDxdyYmd 는 무시된다 — 20261215 를 넣어도 같은 응답이 온다.)
  그래서 0004601(기존 raw) + 0004602 를 함께 받아 합친다(raw_tag 로 구분, rebuild 가 합친다).

출력
  scripts/data/court-auction/raw/<court>-p<page>-<run>.json   원본 응답
  scripts/data/court-auction/latest.json                      정규화한 물건 목록 + 수집 메타
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(HERE, "data", "court-auction")
RAW_DIR = os.path.join(OUT_DIR, "raw")
COOKIE = os.path.join(OUT_DIR, "cookies.txt")
LATEST = os.path.join(OUT_DIR, "latest.json")
BLOCK_LOG = os.path.join(OUT_DIR, "blocks.json")

BASE = "https://www.courtauction.go.kr"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
REFERER = BASE + "/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151M01.xml&pgjId=151M01"
PAGE_SIZE = 50  # 사이트 기본 페이지 크기 상한

# 서울 5개 지방법원 — 부동산(법원) 코드.
#   2026-11-22 확인: 코드 순서가 화면의 법원 목록 순서와 다르다(남부=212, 북부=213, 서부=215, 의정부=214).
#   실제 이름은 응답의 `printCsNo`(“서울북부지방법원<br/>2025타경10119”)로 다시 확인해 덮어쓴다.
SEOUL_COURTS = {
    "B000210": "서울중앙지방법원",
    "B000211": "서울동부지방법원",
    "B000212": "서울남부지방법원",
    "B000213": "서울북부지방법원",
    "B000215": "서울서부지방법원",
}


def curl(args: list[str], timeout: int = 90) -> bytes:
    os.makedirs(OUT_DIR, exist_ok=True)
    p = subprocess.run(
        ["curl", "-sS", "--max-time", str(timeout), "-b", COOKIE, "-c", COOKIE,
         "-A", UA, "-H", "Accept-Language: ko-KR,ko;q=0.9"] + args,
        capture_output=True, timeout=timeout + 15,
    )
    if p.returncode != 0:
        raise RuntimeError(f"curl 실패: {p.stderr.decode(errors='replace')[:300]}")
    return p.stdout


def open_session() -> None:
    """SPA 진입 화면을 한 번 열어 JSESSIONID·WMONID 쿠키를 받아 둔다."""
    curl([BASE + "/pgj/index.on", "-o", "/dev/null", "-H", "Referer: " + BASE + "/"])


def search(court: str, page: int, sale_date: str = "", region_sido: str = "",
           cond: str = "0004601") -> dict:
    srch = {
        "cortOfcCd": court,
        "mvprpRletDvsCd": "00031R",       # 부동산
        "rdnmSdCd": "", "rdnmSggCd": "", "rdnmNo": "",
        "rdDspslPlcAdongSdCd": "", "rdDspslPlcAdongSggCd": "", "rdDspslPlcAdongEmdCd": "",
        "cortAuctnSrchCondCd": cond,        # 0004601 부동산 일반(기일 2주) · 0004602 부동산 전체(기일 6주+)
        "cortStDvs": "1" if court else ("2" if region_sido else ""),
        "rprsAdongSdCd": region_sido, "rprsAdongSggCd": "", "rprsAdongEmdCd": "",
        "mvprpDspslPlcAdongSdCd": "", "mvprpDspslPlcAdongSggCd": "", "mvprpDspslPlcAdongEmdCd": "",
        "pgmId": "mainUsg", "lafjOrderBy": "", "bidDvsCd": "",
    }
    if sale_date:
        srch["dspslDxdyYmd"] = sale_date
    payload = {
        "dma_pageInfo": {
            "pageNo": str(page), "pageSize": str(PAGE_SIZE), "totalYn": "Y",
            "startRowNo": str((page - 1) * PAGE_SIZE + 1), "bfPageNo": "",
            "totalCnt": "", "groupTotalCount": "",
        },
        "dma_srchGdsDtlSrchInfo": srch,
    }
    out = curl([
        BASE + "/pgj/pgjsearch/searchControllerMain.on", "-X", "POST",
        "-H", "Content-Type: application/json; charset=UTF-8",
        "-H", "Origin: " + BASE,
        "-H", "Referer: " + REFERER,
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


def log_block(court: str, page: int, res: dict) -> None:
    rows = []
    if os.path.exists(BLOCK_LOG):
        try:
            rows = json.load(open(BLOCK_LOG, encoding="utf-8"))
        except json.JSONDecodeError:
            rows = []
    rows.append({
        "at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "court": court, "page": page,
        "message": res.get("message"),
    })
    json.dump(rows, open(BLOCK_LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def raw_tag(sale_date: str = "", cond: str = "") -> str:
    """raw 파일 이름의 가운데 토막 — 기본 검색은 `all`, 다른 검색조건은 `c0004602` 처럼 남긴다."""
    if sale_date:
        return sale_date
    if cond and cond != "0004601":
        return "c" + cond
    return "all"


def raw_path(court: str, page: int, tag: str = "all") -> str:
    return os.path.join(RAW_DIR, f"{court or 'seoul'}-{tag or 'all'}-p{page:02d}.json")


def save_raw(court: str, page: int, tag: str, res: dict) -> None:
    os.makedirs(RAW_DIR, exist_ok=True)
    json.dump(res, open(raw_path(court, page, tag), "w", encoding="utf-8"),
              ensure_ascii=False)


# ── 정규화 ────────────────────────────────────────────────────────────────────
def won(v) -> int | None:
    try:
        n = int(str(v).replace(",", "").strip())
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def normalize(row: dict) -> dict:
    """검색 결과 한 줄 → 물건 1건."""
    """검색 결과 한 줄 → 물건 1건. (사이트 컬럼 ID는 2000년대 법원 시스템 코드명을 그대로 쓴다)"""
    court = row.get("boCd") or ""
    case_no = row.get("srnSaNo") or ""              # 2023타경104875
    # 법원 이름은 원문 표기(printCsNo 앞부분)를 우선한다 — 코드표보다 이 값이 권위 있다
    court_nm = (row.get("printCsNo") or "").split("<br/>")[0] or SEOUL_COURTS.get(court, court)
    item_no = row.get("maemulSer") or ""             # 물건번호(매각물건일련)
    obj_no = row.get("mokmulSer") or ""              # 목적물번호
    appraised = won(row.get("gamevalAmt"))           # 감정평가액
    minimum = won(row.get("minmaePrice"))            # 최저매각가격
    rate = None
    if appraised and minimum:
        rate = round(minimum / appraised * 100, 1)
    sale_date = row.get("maeGiil") or ""             # YYYYMMDD
    return {
        "id": row.get("docid") or f"{court}-{case_no}-{item_no}",
        "courtCode": court,
        "court": court_nm,
        "caseNo": case_no,
        "caseNoPrint": (row.get("printCsNo") or "").replace("<br/>", " ").strip(),
        "itemNo": item_no,
        "objectNo": obj_no,
        "usage": row.get("dspslUsgNm") or "",        # 매각용도명(예: 아파트, 다세대)
        "address": (row.get("printSt") or row.get("realSt") or "").strip(),
        "sido": row.get("hjguSido") or "",
        "gu": row.get("hjguSigu") or "",
        "dong": row.get("hjguDong") or "",
        "lotno": (row.get("daepyoLotno") or "").strip(),
        "building": row.get("buldNm") or "",
        "appraised": appraised,
        "minimum": minimum,
        "minimumRate": rate,
        "failCount": int(row["yuchalCnt"]) if str(row.get("yuchalCnt", "")).isdigit() else None,
        "saleDate": sale_date,
        "saleTime": (row.get("maeHh1") or "")[:2] + ":" + (row.get("maeHh1") or "")[2:4]
                    if row.get("maeHh1") else "",
        "salePlace": row.get("maePlace") or "",
        "courtDept": row.get("jpDeptNm") or "",          # 경매계(예: 경매4계)
        "courtTel": row.get("tel") or "",                # 법원 경매계 전화
        "decisionDate": row.get("maegyuljGiil") or "",   # 매각결정기일 YYYYMMDD
        "area": row.get("areaList") or "",
        "landCategory": row.get("jimokList") or "",
        "note": row.get("mulBigo") or "",
        "status": row.get("jinstatCd") or "",
        "lat": None,
        "lng": None,
    }


def collect(courts: list[str], delay: float, sale_date: str = "",
            max_pages: int = 40, cond: str = "0004601") -> dict:
    open_session()
    time.sleep(max(2.0, delay / 2))
    tag = raw_tag(sale_date, cond)
    items: list[dict] = []
    meta = {
        "collectedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "대법원 법원경매정보(courtauction.go.kr) 부동산 물건검색",
        "cond": cond,
        "courts": {}, "blocked": None, "failures": [],
    }
    for court in courts:
        page = 1
        done_pages = 0
        while page <= max_pages:
            path = raw_path(court, page, tag)
            if os.path.exists(path):
                res = json.load(open(path, encoding="utf-8"))
                cached = True
            else:
                res = search(court, page, sale_date, cond=cond)
                cached = False
            if looks_blocked(res):
                log_block(court, page, res)
                meta["blocked"] = {"court": court, "page": page,
                                   "message": res.get("message"),
                                   "at": dt.datetime.now().astimezone().isoformat(timespec="seconds")}
                print(f"  ⛔ {court} p{page} 차단 감지 — 중단: {res.get('message')}")
                break
            data = res.get("data") or {}
            rows = data.get("dlt_srchResult") or []
            if not rows:
                if not cached:
                    save_raw(court, page, tag, res)
                    time.sleep(delay)
                break
            if not cached:
                save_raw(court, page, tag, res)
            pi = data.get("dma_pageInfo") or {}
            total = int(pi.get("totalCnt") or 0)
            items.extend(normalize(r) for r in rows)
            done_pages += 1
            print(f"  · {court} p{page}: {len(rows)}건 (누적 {len(items)} / 총 {total})")
            if len(rows) < PAGE_SIZE or (total and page * PAGE_SIZE >= total):
                break
            page += 1
            if not cached:
                time.sleep(delay)
        meta["courts"][court] = {"name": SEOUL_COURTS.get(court, court), "pages": done_pages}
        if meta["blocked"]:
            break
        if not os.path.exists(raw_path(court, max_pages, tag)):
            time.sleep(delay)
    # 중복 제거(법원+사건번호+물건번호)
    uniq: dict[str, dict] = {}
    for it in items:
        uniq[it["id"]] = it
    meta["count"] = len(uniq)
    latest = {"meta": meta, "items": list(uniq.values())}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(latest, open(LATEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return latest


def rebuild() -> dict:
    """raw/*.json 을 모두 정규화해 latest.json 을 다시 만든다(수집을 이어붙일 때).

    raw 는 여러 검색조건(0004601·0004602)·여러 번의 실행이 섞여 있으므로
    파일명의 법원코드로 법원을, 가운데 토막(c0004602 등)으로 검색조건을 센다.
    물건은 id(법원+사건+물건)로 중복을 없앤다.
    """
    items: dict[str, dict] = {}
    courts: dict[str, int] = {}
    conds: dict[str, int] = {}
    if not os.path.isdir(RAW_DIR):
        raise SystemExit("raw 가 없습니다")
    for f in sorted(os.listdir(RAW_DIR)):
        if not f.endswith(".json"):
            continue
        parts = f[:-5].split("-")
        court = parts[0]
        cond = parts[1] if len(parts) > 1 else "all"
        res = json.load(open(os.path.join(RAW_DIR, f), encoding="utf-8"))
        rows = (res.get("data") or {}).get("dlt_srchResult") or []
        courts[court] = courts.get(court, 0) + 1
        conds[cond] = conds.get(cond, 0) + 1
        for r in rows:
            it = normalize(r)
            items[it["id"]] = it
    dates = sorted({it["saleDate"] for it in items.values() if it["saleDate"]})
    meta = {
        "collectedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "대법원 법원경매정보(courtauction.go.kr) 부동산 물건검색",
        "courts": {c: {"name": SEOUL_COURTS.get(c, c), "pages": n} for c, n in courts.items()},
        "rawTags": conds,
        "saleDateFrom": dates[0] if dates else "",
        "saleDateTo": dates[-1] if dates else "",
        "blocked": None,
        "count": len(items),
    }
    json.dump({"meta": meta, "items": list(items.values())},
              open(LATEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return {"meta": meta, "items": list(items.values())}


def status() -> None:
    if not os.path.isdir(RAW_DIR):
        print("raw 없음")
        return
    files = sorted(os.listdir(RAW_DIR))
    print(f"raw 파일 {len(files)}개")
    by_court: dict[str, list[str]] = {}
    total = 0
    dates: dict[str, int] = {}
    for f in files:
        court = f.split("-")[0]
        by_court.setdefault(court, []).append(f)
        try:
            res = json.load(open(os.path.join(RAW_DIR, f), encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        rows = (res.get("data") or {}).get("dlt_srchResult") or []
        total += len(rows)
        for r in rows:
            dates[r.get("maeGiil", "")] = dates.get(r.get("maeGiil", ""), 0) + 1
    for c, fs in by_court.items():
        print(f"  {SEOUL_COURTS.get(c, c)}: {len(fs)}페이지")
    print(f"  누적 행 {total} / 매각기일 {sorted(dates.items())}")
    if os.path.exists(BLOCK_LOG):
        print("차단 기록:", json.load(open(BLOCK_LOG, encoding="utf-8"))[-3:])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--court", default="", help="법원 코드(예: B000210). 없으면 서울 5개 법원")
    ap.add_argument("--delay", type=float, default=20.0, help="요청 간 대기(초). 기본 20")
    ap.add_argument("--probe", default="", help="매각기일(YYYYMMDD) 한 날짜만 조회")
    ap.add_argument("--cond", default="0004601",
                    help="검색조건 코드 — 0004601 부동산 일반(기일 2주) · 0004602 부동산 전체(기일 6주+, 서부지법 포함)")
    ap.add_argument("--max-pages", type=int, default=40)
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--rebuild", action="store_true", help="raw 전체를 latest.json 으로 다시 합친다")
    args = ap.parse_args()

    if args.status:
        status()
        return
    if args.rebuild:
        res = rebuild()
        print(json.dumps({k: res["meta"][k] for k in ("count", "saleDateFrom", "saleDateTo", "courts")},
                         ensure_ascii=False, indent=1))
        return
    courts = [args.court] if args.court else list(SEOUL_COURTS)
    res = collect(courts, args.delay, sale_date=args.probe, max_pages=args.max_pages,
                  cond=args.cond)
    print(json.dumps({k: res["meta"][k] for k in ("count", "courts", "blocked")},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
