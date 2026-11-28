#!/usr/bin/env python3
"""
온비드(캠코) 공매 물건 수집 — `scripts/data/onbid-gongmae/latest.json`

  · 출처: 공공데이터포털 「한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스」
          (데이터 ID 15157207, 오퍼레이션 getRlstCltrList2, 매시간 갱신)
          https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2
  · 필수 검색조건이 재산유형코드(prptDivCd)와 수의계약가능여부(pvctTrgtYn)라서
    **재산유형 10종 × 수의계약 Y/N** 조합으로 나눠 부른다(한 번에 다 못 받는다).
  · 지역은 소재지지번주소(시도)=서울특별시 로 좁힌다 — 리디브는 서울 정비구역 지도다.
  · 응답 한 줄 = 물건·공매조건 1건. 같은 물건이 회차(공매조건번호)마다 다른 줄로 올 수 있다.
  · 개발계정 하루 1,000회 제한 — 이 스크립트는 20회 남짓만 쓴다.

키: 저장소 루트 `.env.local` 의 `ONBID_API_KEY`(없으면 `MOLIT_API_KEY`) — 공공데이터포털
    일반 인증키(Decoding). 활용신청한 계정의 키여야 온비드 API가 열린다.

사용법
  python3 scripts/fetch-onbid-gongmae.py            # 서울 전체 수집
  python3 scripts/fetch-onbid-gongmae.py --rows 100 # 페이지 크기(기본 1000)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(HERE, "data", "onbid-gongmae")
LATEST = os.path.join(OUT_DIR, "latest.json")

BASE = "https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2"
SIDO = "서울특별시"

# 재산유형코드 — 15157207 코드표
PRPT = {
    "0007": "압류재산",
    "0010": "국유재산",
    "0005": "기타일반재산",
    "0004": "불용품",
    "0002": "공유재산",
    "0003": "금융권담보재산",
    "0006": "유입재산",
    "0008": "수탁재산",
    "0011": "공공개발재산",
    "0013": "파산자산",
}

# 화면·매칭에 쓰는 필드만 남긴다(응답 62개 항목 중)
KEEP = [
    "onbidCltrno", "cltrMngNo", "pbctCdtnNo", "onbidPbancNo", "pbctNo", "pbctNsq",
    "prptDivCd", "prptDivNm", "dspsMthodCd", "dspsMthodNm", "bidDivCd", "bidDivNm",
    "bidMthodCd", "bidMthodNm", "cptnMthodCd", "cptnMthodNm",
    "cltrUsgLclsCtgrNm", "cltrUsgMclsCtgrNm", "cltrUsgSclsCtgrNm",
    "onbidCltrNm", "usbdNft", "pvctTrgtYn", "batcBidYn", "alcYn",
    "cltrBidBgngDt", "cltrBidEndDt",
    "apslEvlAmt", "lowstBidPrcIndctCont",
    "ltnoPnu", "rdnmPnu",
    "lctnSdnm", "lctnSggnm", "lctnEmdNm", "rqstOrgNm",
    "landSqms", "bldSqms", "dtbtRqrEdtmCont", "evcRsbyTrgtCont",
    "thnlImgUrlAdr", "mdfcnDt", "crtnYn",
    "pbctStatCd", "pbctStatNm",
]


def env_key() -> str:
    path = os.path.join(ROOT, ".env.local")
    vals: dict[str, str] = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    for name in ("ONBID_API_KEY", "DATA_GO_KR_SERVICE_KEY", "MOLIT_API_KEY"):
        if vals.get(name):
            return vals[name]
    raise SystemExit("ONBID_API_KEY(또는 MOLIT_API_KEY)가 .env.local 에 없습니다")


def call(key: str, params: dict) -> tuple[list[dict], int, dict]:
    """한 페이지 호출 → (items, totalCount, header). 실패는 SystemExit 로 이유를 남긴다."""
    q = {**params, "serviceKey": key, "resultType": "json"}
    url = BASE + "?" + urllib.parse.urlencode(q, safe=",")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (redev-onbid)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8", errors="replace")
            break
        except Exception as e:  # noqa: BLE001 - 네트워크 오류는 잠깐 쉬고 다시
            if attempt == 2:
                raise SystemExit(f"호출 실패: {e}\n{url[:200]}")
            time.sleep(2.0 + attempt)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise SystemExit(f"JSON 이 아닌 응답: {raw[:400]}")

    # 게이트웨이 오류(SERVICE_KEY_IS_NOT_REGISTERED_ERROR 등)는 JSON 루트가 다르다
    if "OpenAPI_ServiceResponse" in data:
        msg = data["OpenAPI_ServiceResponse"].get("cmmMsgHeader", {})
        raise SystemExit(
            "공공데이터포털 오류: "
            f"{msg.get('errMsg')} / {msg.get('returnAuthMsg')} (code {msg.get('returnReasonCode')})\n"
            "  → 이 키로 온비드 부동산 물건목록 API(15157207) 활용신청이 되어 있는지 확인하세요."
        )

    # 이 API 는 `{header, body}` 를 루트에 두고, 표준형(`response` 래퍼)도 함께 받아 준다
    resp = data.get("response") or data
    header = resp.get("header") or {}
    code = str(header.get("resultCode") or "")
    if code and code not in ("00", "000", "0"):
        raise SystemExit(f"API 오류: {code} {header.get('resultMsg')}")

    body = resp.get("body") or {}
    if isinstance(body, dict) and "body" in body:  # 방어: 이중 래퍼
        body = body["body"]
    items = body.get("items") or {}
    # 표준형(items.item) · 단건형(item) · 빈 결과("") 모두 받아 준다
    if isinstance(items, dict):
        rows = items.get("item") or []
    else:
        rows = items or []
    if isinstance(rows, dict):
        rows = [rows]
    total = int(body.get("totalCount") or 0)
    return rows, total, header


def slim(row: dict) -> dict:
    out = {k: row.get(k) for k in KEEP if row.get(k) not in (None, "")}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=1000, help="페이지당 결과 수")
    ap.add_argument("--max-pages", type=int, default=30, help="조합마다 최대 페이지(안전장치)")
    ap.add_argument("--sleep", type=float, default=0.5)
    args = ap.parse_args()

    key = env_key()
    os.makedirs(OUT_DIR, exist_ok=True)

    seen: dict[str, dict] = {}
    stat = []
    requests = 0
    for prpt, prpt_nm in PRPT.items():
        for pvct in ("N", "Y"):
            page = 1
            got_any = 0
            while page <= args.max_pages:
                params = {
                    "pageNo": page,
                    "numOfRows": args.rows,
                    "prptDivCd": prpt,
                    "pvctTrgtYn": pvct,
                    "dspsMthodCd": "0001",   # 매각(임대 제외)
                    "lctnSdnm": SIDO,
                }
                rows, total, _ = call(key, params)
                requests += 1
                if not rows:
                    break
                for r in rows:
                    key_id = "|".join(
                        str(r.get(k) or "")
                        for k in ("cltrMngNo", "pbctCdtnNo", "onbidCltrno")
                    )
                    if key_id.strip("|") == "":
                        continue
                    seen[key_id] = slim(r)
                got_any += len(rows)
                if got_any >= total:
                    break
                page += 1
                time.sleep(args.sleep)
            if got_any:
                stat.append({"prptDivCd": prpt, "prptDivNm": prpt_nm,
                             "pvctTrgtYn": pvct, "count": got_any})
            time.sleep(args.sleep)

    items = list(seen.values())
    # 입찰 마감이 빠른 순
    items.sort(key=lambda x: (str(x.get("cltrBidEndDt") or "999999999999"),
                              x.get("lowstBidPrcIndctCont") or 10**15))

    from datetime import datetime, timedelta, timezone
    kst = timezone(timedelta(hours=9))
    meta = {
        "source": "공공데이터포털 · 한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스(15157207)",
        "endpoint": BASE,
        "collectedAt": datetime.now(kst).isoformat(timespec="seconds"),
        "sido": SIDO,
        "disposal": "매각(0001)",
        "requests": requests,
        "items": len(items),
        "byPrpt": stat,
        "note": "서울특별시 소재·처분방식 매각인 온비드 부동산 공매 물건(입찰 진행·예정)입니다. "
                "한 줄이 물건·공매조건 1건이며, 재산유형 10종 × 수의계약 Y/N 조합으로 나눠 받았습니다.",
    }
    payload = {"meta": meta, "items": items}
    json.dump(payload, open(LATEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: meta[k] for k in ("collectedAt", "requests", "items")},
                     ensure_ascii=False))
    for s in stat:
        print(f"  {s['prptDivNm']}({s['prptDivCd']}) 수의계약 {s['pvctTrgtYn']} — {s['count']}건")
    print(f"저장: {LATEST}")


if __name__ == "__main__":
    main()
